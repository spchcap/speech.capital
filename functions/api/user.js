const json = (d, o = {}) => {
  const h = new Headers(o.headers);
  h.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(d), { ...o, headers: h });
};
const cookie = c => (c.match(/auth_user=([^;]+)/)?.[1] || null);
const hash = c => (c.match(/auth_hash=([^;]+)/)?.[1] || null);
const tsEq=(a,b)=>{if(!a||!b)return!1;let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const clear = ()=>{const o=`Domain=.speech.capital; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;const h=new Headers();h.append('Set-Cookie',`auth_user=; ${o}`);h.append('Set-Cookie',`auth_hash=; ${o}`);return h};

export async function onRequest({ request, env }) {
  const c = request.headers.get('Cookie') || '';
  const u = cookie(c), h = hash(c);
  if (!u || !h) return json({ user: null });

  try {
    const user = await env.D1_SPCHCAP.prepare('SELECT id, username, role, pass_hash FROM users WHERE username = ?').bind(u).first();
    if (user && tsEq(user.pass_hash, h)) return json({ user: { id: user.id, username: user.username, role: user.role } });
    return json({ user: null }, { headers: clear() });
  } catch (e) {
    return json({ error: { message: e.message } }, { status: 500 });
  }
}
