const json=(d,o={},req)=>{const h=new Headers(o.headers);h.set('Content-Type','application/json');const origin=req?.headers.get('Origin');if(origin?.endsWith('.speech.capital')){h.set('Access-Control-Allow-Origin',origin);h.set('Access-Control-Allow-Credentials','true');h.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');h.set('Access-Control-Allow-Headers','Content-Type')}return new Response(JSON.stringify(d),{...o,headers:h})};
const cookie=c=>(c.match(/auth_user=([^;]+)/)?.[1]||null);
const hash=c=>(c.match(/auth_hash=([^;]+)/)?.[1]||null);
const tsEq=(a,b)=>{if(!a||!b)return!1;let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const auth=async(req,db)=>{const c=req.headers.get('Cookie')||'',u=cookie(c),h=hash(c);if(!u||!h)return null;const user=await db.prepare('SELECT id,username,role,pass_hash,banned_until FROM users WHERE username=?').bind(u).first();if(!user||!tsEq(user.pass_hash,h)||(user.banned_until&&new Date(user.banned_until.replace(' ','T')+'Z')>new Date()))return null;return user};
const notify=async(url,msg,prio=3)=>{if(!url)return;const target=url.startsWith('http')?url:`https://${url}`;try{await fetch(target,{method:'POST',body:msg,headers:{'X-Priority':prio.toString()}})}catch(e){}};

export async function onRequest({request,env}){
  if(request.method==='OPTIONS'){
    const h=new Headers();
    const origin=request.headers.get('Origin');
    if(origin?.endsWith('.speech.capital')){
      h.set('Access-Control-Allow-Origin',origin);
      h.set('Access-Control-Allow-Credentials','true');
      h.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
      h.set('Access-Control-Allow-Headers','Content-Type');
    }
    return new Response(null,{status:204,headers:h});
  }
  if(request.method==='GET')return onRequestGet({request,env});
  if(request.method==='POST')return onRequestPost({request,env});
}

export async function onRequestGet({request,env}){
  try{
    const url=new URL(request.url),sub=url.searchParams.get('sub')||'free',sort=url.searchParams.get('sort')||'hot';
    const user=await auth(request,env.D1_SPCHCAP);
    const sub_row=await env.D1_SPCHCAP.prepare('SELECT id FROM subs WHERE name=?').bind(sub).first();
    if(!sub_row)return json({posts:[]},{},request);
    
    let order=sort==='new'?'ORDER BY p.created_at DESC':'ORDER BY ((CASE WHEN p.score = 0 THEN 0.5 ELSE p.score END)/(CAST((julianday("now")-julianday(p.created_at))*24 AS REAL)+18)) DESC';
    const{results}=await env.D1_SPCHCAP.prepare(`SELECT p.id,p.user_id,p.title,p.link,p.content,p.score,p.comment_count,p.created_at,u.username${user?',v.direction as voted':''} FROM posts p JOIN users u ON p.user_id=u.id ${user?'LEFT JOIN votes v ON v.post_id=p.id AND v.user_id=?':''} WHERE p.sub_id=? ${order} LIMIT 30`).bind(...(user?[user.id,sub_row.id]:[sub_row.id])).all();
    return json({posts:results},{},request);
  }catch(e){return json({error:{message:e.message}},{status:500},request)}
}

export async function onRequestPost({request,env}){
  try{
    if(!env.OPENROUTER_KEY)return json({error:{message:'Server configuration error: Missing API key.'}},{status:500},request);
    const user=await auth(request,env.D1_SPCHCAP);
    if(!user)return json({error:'Unauthorized'},{status:401},request);
    
    const body=await request.json();
    const fd=new FormData();fd.append('secret',env.SEC_TURNSTILE);fd.append('response',body['cf-turnstile-response']);fd.append('remoteip',request.headers.get('CF-Connecting-IP'));
    const ts=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{body:fd,method:'POST'});
    if(!(await ts.json()).success)return json({error:'Invalid CAPTCHA'},{status:403},request);

    const{sub,title,link,content}=body;
    if(!sub||!title)return json({error:'Missing fields'},{status:400},request);
    
    const modRes=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{'Authorization':`Bearer ${env.OPENROUTER_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:env.AI_MODEL,
        messages:[{role:'user',content:`Is this content permissible for a public forum that values free speech, even if it's controversial? Offensive content is okay, but illegal content, spam, or direct threats are not. Respond ONLY "yes" or "no".\n\n${title}\n\n${content||''}\n\nReminder: be lenient. Only reject illegal content, spam, or direct threats. Respond ONLY "yes" or "no".`}]
      })
    });

    if(!modRes.ok){const err=await modRes.text();return json({error:{message:`Moderation failed: ${err}`}},{status:500},request)}
    const modData=await modRes.json();
    const aiText=modData.choices?.[0]?.message?.content?.trim().toLowerCase()||'no';
    const isApproved=aiText.includes('yes');

    await notify(env.NTFY_URL, `Post Mod [${isApproved?'OK':'REJECT'}]: ${user.username} -> ${title} | AI: ${aiText}`, 3);

    if(!isApproved)return json({error:{message:`Post rejected by ${env.AI_MODEL}.`}},{status:400},request);

    let sub_row=await env.D1_SPCHCAP.prepare('SELECT id FROM subs WHERE name=?').bind(sub).first();
    if(!sub_row){
      await env.D1_SPCHCAP.prepare('INSERT INTO subs(name)VALUES(?)').bind(sub).run();
      sub_row=await env.D1_SPCHCAP.prepare('SELECT id FROM subs WHERE name=?').bind(sub).first();
    }
    
    const{meta}=await env.D1_SPCHCAP.prepare('INSERT INTO posts(sub_id,user_id,title,link,content)VALUES(?,?,?,?,?)').bind(sub_row.id,user.id,title,link,content).run();
    return json({id:meta.last_row_id},{status:201},request);
  }catch(e){return json({error:{message:e.message}},{status:500},request)}
}
