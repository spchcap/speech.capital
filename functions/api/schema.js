const schemaV1 = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    pass_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin', 'owner')),
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
    title TEXT NOT NULL,
    link TEXT,
    content TEXT,
    score INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sub_id) REFERENCES subs(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(parent_id) REFERENCES comments(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    post_id INTEGER,
    comment_id INTEGER,
    direction INTEGER NOT NULL CHECK(direction IN (1, -1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    CHECK ((post_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND comment_id IS NOT NULL))
  );`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_post_vote ON votes(user_id, post_id) WHERE post_id IS NOT NULL;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_comment_vote ON votes(user_id, comment_id) WHERE comment_id IS NOT NULL;`
];

export async function onRequestPost({ request, env }) {
  try {
    const db = env.D1_SPCHCAP;
    const { action, password } = await request.json();

    if (password !== env.ADMIN_PASS) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (action === 'get') {
      const stmt = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      const { results } = await stmt.all();
      return Response.json({ success: true, schema: results });
    }

    if (action === 'create') {
      const results = await db.batch(schemaV1.map(q => db.prepare(q)));
      return Response.json({ success: true, results });
    }

    if (action === 'delete') {
      const tables = ['votes', 'comments', 'posts', 'subs', 'users', 'sessions'];
      const results = await db.batch(tables.map(t => db.prepare(`DROP TABLE IF EXISTS ${t}`)));
      return Response.json({ success: true, results });
    }

    return Response.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    const { message, cause } = e;
    return Response.json({ success: false, error: { message, cause } }, { status: 500 });
  }
}
