const json=(d,o={},req)=>{const h=new Headers(o.headers);h.set('Content-Type','application/json');const origin=req?.headers.get('Origin');if(origin?.endsWith('.speech.capital')){h.set('Access-Control-Allow-Origin',origin);h.set('Access-Control-Allow-Credentials','true')}return new Response(JSON.stringify(d),{...o,headers:h})};
const cookie=c=>(c.match(/auth_user=([^;]+)/)?.[1]||null);
const hash=c=>(c.match(/auth_hash=([^;]+)/)?.[1]||null);
const tsEq=(a,b)=>{if(!a||!b)return!1;let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const auth=async(req,db)=>{const c=req.headers.get('Cookie')||'',u=cookie(c),h=hash(c);if(!u||!h)return null;const user=await db.prepare('SELECT id,username,role,pass_hash,banned_until FROM users WHERE username=?').bind(u).first();if(!user||!tsEq(user.pass_hash,h)||(user.banned_until&&new Date(user.banned_until.replace(' ','T')+'Z')>new Date()))return null;return user};

export async function onRequestGet({request,env,params}){
  try{
    const id=params.id,user=await auth(request,env.D1_SPCHCAP);
    const post=await env.D1_SPCHCAP.prepare(`SELECT p.id,p.user_id,p.title,p.link,p.content,p.score,p.comment_count,p.created_at,u.username${user?',v.direction as voted':''} FROM posts p JOIN users u ON p.user_id=u.id ${user?'LEFT JOIN votes v ON v.post_id=p.id AND v.user_id=?':''} WHERE p.id=?`).bind(...(user?[user.id,id]:[id])).first();
    if(!post)return json({error:'Not found'},{status:404},request);
    
    const{results}=await env.D1_SPCHCAP.prepare(`SELECT c.id,c.user_id,c.content,c.score,c.parent_id,c.created_at,u.username${user?',v.direction as voted':''} FROM comments c JOIN users u ON c.user_id=u.id ${user?'LEFT JOIN votes v ON v.comment_id=c.id AND v.user_id=?':''} WHERE c.post_id=? ORDER BY c.created_at ASC`).bind(...(user?[user.id,id]:[id])).all();
    
    const tree=[],map={};
    results.forEach(c=>{c.replies=[];map[c.id]=c;if(!c.parent_id)tree.push(c);else if(map[c.parent_id])map[c.parent_id].replies.push(c)});
    
    return json({post,comments:tree},{},request);
  }catch(e){return json({error:{message:e.message}},{status:500},request)}
}
