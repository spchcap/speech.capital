const json = (d, o = {}) => {
  const h = new Headers(o.headers);
  h.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(d), { ...o, headers: h });
};
const tsEq=(a,b)=>{let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const notify=async(url,msg,prio=3)=>{if(!url)return;const target=url.startsWith('http')?url:`https://${url}`;try{await fetch(target,{method:'POST',body:msg,headers:{'X-Priority':prio.toString()}})}catch(e){}};

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const fd = new FormData();
    fd.append('secret', env.SEC_TURNSTILE);
    fd.append('response', body['cf-turnstile-response']);
    fd.append('remoteip', request.headers.get('CF-Connecting-IP'));
    const ts = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { body: fd, method: 'POST' });
    if (!(await ts.json()).success) return json({ error: 'Invalid CAPTCHA' }, { status: 403 });

    const { username, pass_hash } = body;
    if (!username || !pass_hash) return json({ error: 'Missing fields' }, { status: 400 });

    const user = await env.D1_SPCHCAP.prepare('SELECT id, pass_hash, role FROM users WHERE username = ?').bind(username).first();
    if (!user || !tsEq(user.pass_hash, pass_hash)) return json({ error: 'Invalid credentials' }, { status: 401 });
    
    await notify(env.NTFY_URL, `User Login: ${username}`, 3);

    const exp = new Date(Date.now() + 2592e6); // 30 days
    const opts = `Domain=.speech.capital; Path=/; Expires=${exp.toUTCString()}; HttpOnly; Secure; SameSite=Strict`;
    const headers = new Headers();
    headers.append('Set-Cookie', `auth_user=${username}; ${opts}`);
    headers.append('Set-Cookie', `auth_hash=${user.pass_hash}; ${opts}`);
    headers.append('Set-Cookie', `auth_role=${user.role}; ${opts}`);
      
    return json({ success: true }, { headers });
  } catch (e) {
    return json({ error: { message: e.message } }, { status: 500 });
  }
}
