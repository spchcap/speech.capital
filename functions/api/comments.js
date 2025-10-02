const json=(d,o={},req)=>{const h=new Headers(o.headers);h.set('Content-Type','application/json');const origin=req?.headers.get('Origin');if(origin?.endsWith('.speech.capital')){h.set('Access-Control-Allow-Origin',origin);h.set('Access-Control-Allow-Credentials','true');h.set('Access-Control-Allow-Methods','POST,OPTIONS');h.set('Access-Control-Allow-Headers','Content-Type')}return new Response(JSON.stringify(d),{...o,headers:h})};
const cookie=c=>(c.match(/auth_user=([^;]+)/)?.[1]||null);
const hash=c=>(c.match(/auth_hash=([^;]+)/)?.[1]||null);
const tsEq=(a,b)=>{if(!a||!b)return!1;let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const auth=async(req,db)=>{const c=req.headers.get('Cookie')||'',u=cookie(c),h=hash(c);if(!u||!h)return null;const user=await db.prepare('SELECT id,username,role,pass_hash,banned_until FROM users WHERE username=?').bind(u).first();if(!user||!tsEq(user.pass_hash,h)||(user.banned_until&&new Date(user.banned_until.replace(' ','T')+'Z')>new Date()))return null;return user};

export async function onRequest({request,env}){
  if(request.method==='OPTIONS'){
    const h=new Headers();
    const origin=request.headers.get('Origin');
    if(origin?.endsWith('.speech.capital')){
      h.set('Access-Control-Allow-Origin',origin);
      h.set('Access-Control-Allow-Credentials','true');
      h.set('Access-Control-Allow-Methods','POST,OPTIONS');
      h.set('Access-Control-Allow-Headers','Content-Type');
    }
    return new Response(null,{status:204,headers:h});
  }
  if(request.method==='POST')return onRequestPost({request,env});
}

export async function onRequestPost({request,env}){
  try{
    const user=await auth(request,env.D1_SPCHCAP);
    if(!user)return json({error:'Unauthorized'},{status:401},request);
    
    const body=await request.json();
    const fd=new FormData();fd.append('secret',env.SEC_TURNSTILE);fd.append('response',body['cf-turnstile-response']);fd.append('remoteip',request.headers.get('CF-Connecting-IP'));
    const ts=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{body:fd,method:'POST'});
    if(!(await ts.json()).success)return json({error:'Invalid CAPTCHA'},{status:403},request);
    
    const{post_id,parent_id,content}=body;
    if(!post_id||!content)return json({error:'Missing fields'},{status:400},request);
    
    const{meta}=await env.D1_SPCHCAP.prepare('INSERT INTO comments(post_id,user_id,parent_id,content)VALUES(?,?,?,?)').bind(post_id,user.id,parent_id||null,content).run();
    await env.D1_SPCHCAP.prepare('UPDATE posts SET comment_count=comment_count+1 WHERE id=?').bind(post_id).run();
    if(parent_id)await env.D1_SPCHCAP.prepare('UPDATE comments SET reply_count=reply_count+1 WHERE id=?').bind(parent_id).run();
    
    return json({id:meta.last_row_id},{status:201},request);
  }catch(e){return json({error:{message:e.message}},{status:500},request)}
}
