const json=(d,o={})=>{const h=new Headers(o.headers);h.set('Content-Type','application/json');return new Response(JSON.stringify(d),{...o,headers:h})};
const cookie=c=>(c.match(/auth_user=([^;]+)/)?.[1]||null);
const hash=c=>(c.match(/auth_hash=([^;]+)/)?.[1]||null);
const tsEq=(a,b)=>{if(!a||!b)return!1;let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const auth=async(req,db)=>{const c=req.headers.get('Cookie')||'',u=cookie(c),h=hash(c);if(!u||!h)return null;const user=await db.prepare('SELECT id,username,role,pass_hash FROM users WHERE username=?').bind(u).first();return user&&tsEq(user.pass_hash,h)?user:null};

export async function onRequestPost({request,env}){
  try{
    const user=await auth(request,env.D1_SPCHCAP);
    if(!user)return json({error:'Unauthorized'},{status:401});
    
    const{post_id,comment_id,direction}=await request.json();
    if((!post_id&&!comment_id)||![1,-1].includes(direction))return json({error:'Invalid request'},{status:400});
    
    const isPost=!!post_id,id=post_id||comment_id;
    const existing=await env.D1_SPCHCAP.prepare(`SELECT direction FROM votes WHERE user_id=? AND ${isPost?'post_id':'comment_id'}=?`).bind(user.id,id).first();
    
    let delta=direction,voted=direction;
    if(existing){
      if(existing.direction===direction){
        await env.D1_SPCHCAP.prepare(`DELETE FROM votes WHERE user_id=? AND ${isPost?'post_id':'comment_id'}=?`).bind(user.id,id).run();
        delta=-direction;voted=0;
      }else{
        await env.D1_SPCHCAP.prepare(`UPDATE votes SET direction=? WHERE user_id=? AND ${isPost?'post_id':'comment_id'}=?`).bind(direction,user.id,id).run();
        delta=direction*2;
      }
    }else{
      await env.D1_SPCHCAP.prepare(`INSERT INTO votes(user_id,${isPost?'post_id':'comment_id'},direction)VALUES(?,?,?)`).bind(user.id,id,direction).run();
    }
    
    await env.D1_SPCHCAP.prepare(`UPDATE ${isPost?'posts':'comments'} SET score=score+? WHERE id=?`).bind(delta,id).run();
    const{score}=await env.D1_SPCHCAP.prepare(`SELECT score FROM ${isPost?'posts':'comments'} WHERE id=?`).bind(id).first();
    
    return json({score,voted});
  }catch(e){return json({error:{message:e.message}},{status:500})}
}
