export async function onRequest() {
  const opts = `Domain=.speech.capital; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  const headers = new Headers();
  headers.append('Set-Cookie', `auth_user=; ${opts}`);
  headers.append('Set-Cookie', `auth_hash=; ${opts}`);
  headers.append('Set-Cookie', `auth_role=; ${opts}`);
  headers.append('Location', '/');
  return new Response(null, { status: 302, headers });
}
