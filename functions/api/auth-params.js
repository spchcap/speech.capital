const json = (d, o) => new Response(JSON.stringify(d), { ...o, headers: { 'Content-Type': 'application/json', ...(o?.headers || {}) } });

export async function onRequest({ request, env }) {
  const u = new URL(request.url).searchParams.get('username');
  if (!u) return json({ error: 'Username required' }, { status: 400 });
  try {
    const user = await env.D1_SPCHCAP.prepare('SELECT pass_hash FROM users WHERE username=?').bind(u).first();
    if (!user) return json({ error: 'User not found' }, { status: 404 });
    const [f, N, r, p, s] = user.pass_hash.split('$');
    if (f!=='scrypt') return json({ error: 'Invalid hash format' }, { status: 500 });
    return json({ N:parseInt(N), r:parseInt(r), p:parseInt(p), salt_b64:s });
  } catch (e) {
    return json({ error: { message: e.message } }, { status: 500 });
  }
}
