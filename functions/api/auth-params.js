const json = (d, o = {}) => {
  const h = new Headers(o.headers);
  h.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(d), { ...o, headers: h });
};

export async function onRequestGet({ request, env }) {
  try {
    const u = new URL(request.url).searchParams.get('username');
    if (!u) return json({ error: 'Missing username' }, { status: 400 });

    const pass_hash = await env.D1_SPCHCAP.prepare('SELECT pass_hash FROM users WHERE username = ?').bind(u).first('pass_hash');
    if (!pass_hash) return json({ error: 'User not found' }, { status: 404 });
    
    const parts = pass_hash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      return json({ error: 'Invalid hash format' }, { status: 500 });
    }
    
    const [_, N, r, p, salt_b64] = parts;
    return json({ N: +N, r: +r, p: +p, salt_b64 });
  } catch (e) {
    return json({ error: { message: e.message } }, { status: 500 });
  }
}
