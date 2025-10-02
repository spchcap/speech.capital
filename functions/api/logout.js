export async function onRequest({ request, env }) {
  const sid = (request.headers.get('Cookie')||'').match(/session_id=([^;]+)/)?.[1];
  if (sid) await env.D1_SPCHCAP.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
  
  const cookie = `session_id=; Domain=.speech.capital; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  return new Response(null, { status: 302, headers: { 'Set-Cookie': cookie, 'Location': '/' } });
}
