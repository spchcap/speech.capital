const json = (d, o = {}) => {
  const h = new Headers(o.headers);
  h.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(d), { ...o, headers: h });
};
const tsEq=(a,b)=>{let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};

export async function onRequestPost({ request, env }) {
  try {
    const { username, pass_hash } = await request.json();
    if (!username || !pass_hash) return json({ error: 'Missing fields' }, { status: 400 });

    const user = await env.D1_SPCHCAP.prepare('SELECT id, pass_hash FROM users WHERE username = ?').bind(username).first();
    if (!user || !tsEq(user.pass_hash, pass_hash)) return json({ error: 'Invalid credentials' }, { status: 401 });
    
    const exp = new Date(Date.now() + 2592e6); // 30 days
    const opts = `Domain=.speech.capital; Path=/; Expires=${exp.toUTCString()}; HttpOnly; Secure; SameSite=Strict`;
    const headers = new Headers();
    headers.append('Set-Cookie', `auth_user=${username}; ${opts}`);
    headers.append('Set-Cookie', `auth_hash=${user.pass_hash}; ${opts}`);
      
    return json({ success: true }, { headers });
  } catch (e) {
    return json({ error: { message: e.message } }, { status: 500 });
  }
}
