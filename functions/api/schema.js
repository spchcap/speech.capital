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
    UNIQUE(user_id, post_id),
    UNIQUE(user_id, comment_id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );`
];

export async function onRequestPost({ request, env }) {
  try {
    const db = env.D1_SPCHCAP;
    const { action } = await request.json();

    if (action === 'get') {
      const stmt = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      const { results } = await stmt.all();
      return Response.json({ success: true, schema: results });
    }

    if (action === 'create') {
      const stmts = schemaV1.map(sql => db.prepare(sql));
      const results = await db.batch(stmts);
      return Response.json({ success: true, results });
    }

    return Response.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}
