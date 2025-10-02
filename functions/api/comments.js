const json=(d,o={})=>{const h=new Headers(o.headers);h.set('Content-Type','application/json');return new Response(JSON.stringify(d),{...o,headers:h})};
const cookie=c=>(c.match(/auth_user=([^;]+)/)?.[1]||null);
const hash=c=>(c.match(/auth_hash=([^;]+)/)?.[1]||null);
const tsEq=(a,b)=>{if(!a||!b)return!1;let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const auth=async(req,db)=>{const c=req.headers.get('Cookie')||'',u=cookie(c),h=hash(c);if(!u||!h)return null;const user=await db.prepare('SELECT id,username,role,pass_hash FROM users WHERE username=?').bind(u).first();return user&&tsEq(user.pass_hash,h)?user:null};

export async function onRequestPost({request,env}){
  try{
    const user=await auth(request,env.D1_SPCHCAP);
    if(!user)return json({error:'Unauthorized'},{status:401});
    
    const{post_id,parent_id,content}=await request.json();
    if(!post_id||!content)return json({error:'Missing fields'},{status:400});
    
    const{meta}=await env.D1_SPCHCAP.prepare('INSERT INTO comments(post_id,user_id,parent_id,content)VALUES(?,?,?,?)').bind(post_id,user.id,parent_id||null,content).run();
    await env.D1_SPCHCAP.prepare('UPDATE posts SET comment_count=comment_count+1 WHERE id=?').bind(post_id).run();
    if(parent_id)await env.D1_SPCHCAP.prepare('UPDATE comments SET reply_count=reply_count+1 WHERE id=?').bind(parent_id).run();
    
    return json({id:meta.last_row_id},{status:201});
  }catch(e){return json({error:{message:e.message}},{status:500})}
}
