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
    
    const{post_id,comment_id,direction}=await request.json();
    if((!post_id&&!comment_id)||![1,-1].includes(direction))return json({error:'Invalid request'},{status:400},request);
    
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
    
    return json({score,voted},{},request);
  }catch(e){return json({error:{message:e.message}},{status:500},request)}
}
