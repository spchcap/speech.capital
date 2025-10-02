const json=(d,o)=>new Response(JSON.stringify(d),{...o,headers:{'Content-Type':'application/json',...(o?.headers||{})}});
const tsEq=(a,b)=>{let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};

export async function onRequestPost({ request, env }) {
  try {
    const { username, pass_hash } = await request.json();
    if (!username || !pass_hash) return json({ error: 'Missing fields' }, { status: 400 });

    const user = await env.D1_SPCHCAP.prepare('SELECT id, pass_hash FROM users WHERE username = ?').bind(username).first();
    if (!user || !tsEq(user.pass_hash, pass_hash)) return json({ error: 'Invalid credentials' }, { status: 401 });

    const sid = crypto.randomUUID();
    const exp = new Date(Date.now() + 2592e6); // 30 days
    
    await env.D1_SPCHCAP.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(sid, user.id, exp.toISOString().slice(0, 19).replace('T', ' ')).run();
      
    const cookie = `session_id=${sid}; Domain=.speech.capital; Path=/; Expires=${exp.toUTCString()}; HttpOnly; Secure; SameSite=Strict`;
    return json({ success: true }, { headers: { 'Set-Cookie': cookie } });
  } catch (e) {
    return json({ error: { message: e.message } }, { status: 500 });
  }
}
