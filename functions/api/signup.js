const json = (d, o = {}) => {
  const h = new Headers(o.headers);
  h.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(d), { ...o, headers: h });
};
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

    const { username, email, pass_hash } = body;
    if (!username || !email || !pass_hash) return json({ error: 'Missing fields' }, { status: 400 });

    await env.D1_SPCHCAP.prepare(
      'INSERT INTO users (username, email, pass_hash, ip_address) VALUES (?, ?, ?, ?)'
    ).bind(username, email, pass_hash, request.headers.get('CF-Connecting-IP')).run();
    
    const user = await env.D1_SPCHCAP.prepare('SELECT role FROM users WHERE username = ?').bind(username).first();
    
    await notify(env.NTFY_URL, `New User Signup: ${username} (${email})`, 3);

    const exp = new Date(Date.now() + 2592e6); // 30 days
    const opts = `Domain=.speech.capital; Path=/; Expires=${exp.toUTCString()}; HttpOnly; Secure; SameSite=Strict`;
    const headers = new Headers();
    headers.append('Set-Cookie', `auth_user=${username}; ${opts}`);
    headers.append('Set-Cookie', `auth_hash=${pass_hash}; ${opts}`);
    headers.append('Set-Cookie', `auth_role=${user.role}; ${opts}`);

    return json({ success: true }, { headers });
  } catch (e) {
    const msg = e.message?.includes('UNIQUE') ? 'Username or email taken' : e.message;
    return json({ error: { message: msg } }, { status: e.message?.includes('UNIQUE') ? 409 : 500 });
  }
}
