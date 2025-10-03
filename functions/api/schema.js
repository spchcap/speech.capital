const schemaV1 = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    pass_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'mod', 'admin', 'owner')),
    banned_until DATETIME DEFAULT NULL,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS subs (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY,
    sub_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    post_type TEXT NOT NULL DEFAULT 'text' CHECK(post_type IN ('text', 'link')),
    title TEXT NOT NULL,
    link TEXT,
    content TEXT,
    score INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sub_id) REFERENCES subs(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );`,
  `CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_id INTEGER,
    content TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(parent_id) REFERENCES comments(id)
  );`,
  `CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    post_id INTEGER,
    comment_id INTEGER,
    direction INTEGER NOT NULL CHECK(direction IN (1, -1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(comment_id) REFERENCES comments(id),
    CHECK ((post_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND comment_id IS NOT NULL))
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_post_vote ON votes(user_id, post_id) WHERE post_id IS NOT NULL;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_comment_vote ON votes(user_id, comment_id) WHERE comment_id IS NOT NULL;`
];
const schemaV2Migration = [
  `ALTER TABLE posts ADD COLUMN post_type TEXT NOT NULL DEFAULT 'text' CHECK(post_type IN ('text', 'link'));`,
  `UPDATE posts SET post_type = 'link' WHERE link IS NOT NULL;`
];
const json = (d, o = {}) => {
  const h = new Headers(o.headers);
  h.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(d), { ...o, headers: h });
};

export async function onRequestPost({ request, env }) {
  try {
    const db = env.D1_SPCHCAP;
    const { action, password, ...payload } = await request.json();

    if (password !== env.ADMIN_PASS) return json({ error: 'Unauthorized' }, { status: 401 });

    if (action === 'get') {
      const { results } = await db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
      return json({ schema: results });
    }
    if (action === 'create') {
      const results = await db.batch(schemaV1.map(q => db.prepare(q)));
      return json({ results });
    }
    if (action === 'migrate_v2') {
      const results = await db.batch(schemaV2Migration.map(q => db.prepare(q)));
      return json({ success: true, results });
    }
    if (action === 'set_role') {
      const { username, role } = payload;
      if (!username || !['user','mod','admin','owner'].includes(role)) return json({ error: 'Missing or invalid fields' }, { status: 400 });
      const { meta } = await db.prepare('UPDATE users SET role = ? WHERE username = ?').bind(role, username).run();
      const ok = meta.changes > 0;
      return json({ success: ok, message: ok ? `Role for ${username} set to ${role}` : 'User not found' });
    }
    if (action === 'delete') {
      const tables = ['votes', 'comments', 'posts', 'subs', 'users'];
      const results = await db.batch(tables.map(t => db.prepare(`DROP TABLE IF EXISTS ${t}`)));
      return json({ results });
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    if (e.message?.includes('duplicate column name')) {
      return json({ success: false, message: 'Column already exists.' }, { status: 409 });
    }
    return json({ error: { message: e.message, cause: e.cause } }, { status: 500 });
  }
}
