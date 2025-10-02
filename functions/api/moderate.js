const json=(d,o={},req)=>{const h=new Headers(o.headers);h.set('Content-Type','application/json');const origin=req?.headers.get('Origin');if(origin?.endsWith('.speech.capital')){h.set('Access-Control-Allow-Origin',origin);h.set('Access-Control-Allow-Credentials','true');h.set('Access-Control-Allow-Methods','POST,OPTIONS');h.set('Access-Control-Allow-Headers','Content-Type')}return new Response(JSON.stringify(d),{...o,headers:h})};
const cookie=c=>(c.match(/auth_user=([^;]+)/)?.[1]||null);
const hash=c=>(c.match(/auth_hash=([^;]+)/)?.[1]||null);
const tsEq=(a,b)=>{if(!a||!b)return!1;let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const auth=async(req,db)=>{const c=req.headers.get('Cookie')||'',u=cookie(c),h=hash(c);if(!u||!h)return null;const user=await db.prepare('SELECT id,username,role,pass_hash,banned_until FROM users WHERE username=?').bind(u).first();if(!user||!tsEq(user.pass_hash,h)||(user.banned_until&&new Date(user.banned_until.replace(' ','T')+'Z')>new Date()))return null;return user};

export async function onRequest({request,env}){
  if(request.method==='OPTIONS'){
    const h=new Headers();
    const origin=request.headers.get('Origin');
    if(origin?.endsWith('.speech.capital')){h.set('Access-Control-Allow-Origin',origin);h.set('Access-Control-Allow-Credentials','true');h.set('Access-Control-Allow-Methods','POST,OPTIONS');h.set('Access-Control-Allow-Headers','Content-Type')}
    return new Response(null,{status:204,headers:h});
  }
  if(request.method==='POST')return onRequestPost({request,env});
}

export async function onRequestPost({request,env}){
  const user=await auth(request,env.D1_SPCHCAP);
  if(!user||!['mod','admin','owner'].includes(user.role))return json({error:'Forbidden'},{status:403},request);
  const{action,...payload}=await request.json(),db=env.D1_SPCHCAP;
  try{
    if(action==='delete_post'){await db.prepare("UPDATE posts SET title='[Deleted]',content='[Deleted]',link=NULL WHERE id=?").bind(payload.post_id).run();return json({success:true},{},request)}
    if(action==='delete_comment'){await db.prepare("UPDATE comments SET content='[Deleted]' WHERE id=?").bind(payload.comment_id).run();return json({success:true},{},request)}
    if(action==='ban_user'){
      const{user_id,days}=payload;
      const target=await db.prepare('SELECT role FROM users WHERE id=?').bind(user_id).first();
      if(!target)return json({error:'User not found'},{status:404},request);
      const roles={user:0,mod:1,admin:2,owner:3};
      if(roles[user.role]<=roles[target.role])return json({error:'Insufficient permissions'},{status:403},request);
      const banUntil=new Date(Date.now()+days*864e5).toISOString().slice(0,19).replace('T',' ');
      await db.prepare('UPDATE users SET banned_until=? WHERE id=?').bind(banUntil,user_id).run();
      return json({success:true},{},request);
    }
    return json({error:'Invalid action'},{status:400},request);
  }catch(e){return json({error:e.message},{status:500},request)}
}
