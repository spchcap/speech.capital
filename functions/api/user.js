const json = (d, o) => new Response(JSON.stringify(d), { ...o, headers: { 'Content-Type': 'application/json', ...(o?.headers || {}) } });

export async function onRequest({ request, env }) {
  const sid = (request.headers.get('Cookie') || '').match(/session_id=([^;]+)/)?.[1];
  if (!sid) return json({ user: null });
  try {
    const user = await env.D1_SPCHCAP.prepare(
      `SELECT u.id,u.username,u.role FROM users u JOIN sessions s ON u.id=s.user_id 
       WHERE s.id=? AND s.expires_at>CURRENT_TIMESTAMP`
    ).bind(sid).first();
    if(user) return json({ user });
    const cookie=`session_id=; Domain=.speech.capital; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    return json({ user: null }, { headers: { 'Set-Cookie': cookie } });
  } catch (e) {
    return json({ error: { message: e.message } }, { status: 500 });
  }
}
