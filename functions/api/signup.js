const json = (d, o = {}) => {
  const h = new Headers(o.headers);
  h.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(d), { ...o, headers: h });
};

export async function onRequestPost({ request, env }) {
  try {
    const { username, email, pass_hash } = await request.json();
    if (!username || !email || !pass_hash) return json({ error: 'Missing fields' }, { status: 400 });

    await env.D1_SPCHCAP.prepare(
      'INSERT INTO users (username, email, pass_hash, ip_address) VALUES (?, ?, ?, ?)'
    ).bind(username, email, pass_hash, request.headers.get('CF-Connecting-IP')).run();

    return json({ success: true }, { status: 201 });
  } catch (e) {
    const msg = e.message?.includes('UNIQUE') ? 'Username or email taken' : e.message;
    return json({ error: { message: msg } }, { status: e.message?.includes('UNIQUE') ? 409 : 500 });
  }
}
