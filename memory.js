const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'agent.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    tweet_id TEXT NOT NULL UNIQUE,
    their_text TEXT,
    our_reply TEXT,
    context TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_conv_tweet ON conversations(tweet_id);

  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    interaction_count INTEGER DEFAULT 0,
    first_seen TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now')),
    vibe TEXT DEFAULT 'neutral'
  );
`);

const stmts = {
  upsertUser: db.prepare(`
    INSERT INTO users (user_id, username, interaction_count, last_seen)
    VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      interaction_count = interaction_count + 1,
      last_seen = datetime('now')
  `),

  getUser: db.prepare('SELECT * FROM users WHERE user_id = ?'),

  saveConversation: db.prepare(`
    INSERT OR IGNORE INTO conversations (user_id, username, tweet_id, their_text, our_reply, context)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  getRecentConvos: db.prepare(`
    SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
  `),

  hasRepliedTo: db.prepare('SELECT 1 FROM conversations WHERE tweet_id = ?'),

  getStats: db.prepare('SELECT COUNT(*) as total_convos FROM conversations'),
};

function recordInteraction(userId, username, tweetId, theirText, ourReply, context) {
  stmts.upsertUser.run(userId, username);
  stmts.saveConversation.run(userId, username, tweetId, theirText, ourReply, context || '');
}

function getUserHistory(userId) {
  const user = stmts.getUser.get(userId);
  const convos = stmts.getRecentConvos.all(userId);
  return { user, convos };
}

function alreadyReplied(tweetId) {
  return !!stmts.hasRepliedTo.get(tweetId);
}

module.exports = { db, recordInteraction, getUserHistory, alreadyReplied, stmts };
