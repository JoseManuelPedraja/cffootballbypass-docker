"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

class Database {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.type = "sqlite";
    this.db = null;
  }

  async init() {
    fs.mkdirSync(this.dataDir, { recursive: true });

    const BetterSqlite3 = require("better-sqlite3");
    const dbPath = path.join(this.dataDir, "cfb.db");
    this.db = new BetterSqlite3(dbPath);

    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");

    this.runMigrations();
  }

  runMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `);

    const migrations = this.getMigrations();
    const applied = new Set(
      this.db
        .prepare("SELECT name FROM _migrations")
        .all()
        .map((r) => r.name)
    );

    for (const m of migrations) {
      if (!applied.has(m.name)) {
        console.log(`[DB] Running migration: ${m.name}`);
        this.db.exec(m.sql);
        this.db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(m.name);
      }
    }
  }

  getMigrations() {
    return [
      {
        name: "001-init",
        sql: `
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            totp_secret TEXT,
            totp_enabled INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE domains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            record TEXT DEFAULT '@',
            type TEXT DEFAULT 'A',
            enabled INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE cf_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auth_type TEXT DEFAULT 'token',
            api_token_enc TEXT,
            zone_id TEXT,
            email TEXT,
            account_id TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            config_enc TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            on_bypass_activate INTEGER DEFAULT 1,
            on_bypass_deactivate INTEGER DEFAULT 1,
            on_error INTEGER DEFAULT 0,
            on_feed_stale INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            key_hash TEXT UNIQUE NOT NULL,
            key_prefix TEXT NOT NULL,
            permissions TEXT DEFAULT '["read"]',
            last_used_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT
          );

          CREATE TABLE bypass_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            active INTEGER NOT NULL,
            reason TEXT,
            domains_affected TEXT,
            blocked_ips INTEGER DEFAULT 0,
            blocked_isps INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE check_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blocked_ips INTEGER DEFAULT 0,
            blocked_isps INTEGER DEFAULT 0,
            general_blocked INTEGER DEFAULT 0,
            feed_stale INTEGER DEFAULT 0,
            bypass_active INTEGER DEFAULT 0,
            feed_age_hours REAL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            context TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            detail TEXT,
            ip TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          );

          CREATE INDEX idx_logs_type ON logs(type);
          CREATE INDEX idx_logs_created ON logs(created_at);
          CREATE INDEX idx_check_history_created ON check_history(created_at);
          CREATE INDEX idx_bypass_history_created ON bypass_history(created_at);
          CREATE INDEX idx_audit_log_created ON audit_log(created_at);
        `,
      },
      {
        name: "002-multi-cf-accounts",
        sql: `
          ALTER TABLE cf_credentials ADD COLUMN label TEXT DEFAULT 'Default';
          ALTER TABLE domains ADD COLUMN cf_credential_id INTEGER REFERENCES cf_credentials(id);
        `,
      },
      {
        name: "003-default-settings",
        sql: `
          INSERT OR IGNORE INTO settings (key, value) VALUES
            ('interval_seconds', '300'),
            ('stale_threshold_hours', '6'),
            ('min_isps_blocked', '2'),
            ('force_proxy_off_override', '0'),
            ('cooldown_minutes', '60'),
            ('feed_url', 'https://hayahora.futbol/estado/data.json'),
            ('log_retention_days', '30'),
            ('theme', 'auto'),
            ('language', 'es'),
            ('proxy_type', 'none'),
            ('proxy_config', '{}'),
            ('update_check', '1');
        `,
      },
    ];
  }

  // ── Encryption for secrets stored in DB ────────────────────────
  getEncryptionKey() {
    const keyPath = path.join(this.dataDir, ".encryption_key");
    if (fs.existsSync(keyPath)) {
      return Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "hex");
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
    return key;
  }

  encrypt(text) {
    if (!text) return null;
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let enc = cipher.update(text, "utf8", "hex");
    enc += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    return iv.toString("hex") + ":" + tag + ":" + enc;
  }

  decrypt(data) {
    if (!data) return null;
    const key = this.getEncryptionKey();
    const [ivHex, tagHex, enc] = data.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let dec = decipher.update(enc, "hex", "utf8");
    dec += decipher.final("utf8");
    return dec;
  }

  // ── Users ──────────────────────────────────────────────────────
  getUserByUsername(username) {
    return this.db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  }

  getUserById(id) {
    return this.db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  }

  createUser(username, passwordHash) {
    const info = this.db
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run(username, passwordHash);
    return this.getUserById(info.lastInsertRowid);
  }

  updateUserPassword(id, passwordHash) {
    this.db
      .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(passwordHash, id);
  }

  setTotpSecret(userId, secret) {
    this.db
      .prepare("UPDATE users SET totp_secret = ?, updated_at = datetime('now') WHERE id = ?")
      .run(this.encrypt(secret), userId);
  }

  getTotpSecret(userId) {
    const row = this.db.prepare("SELECT totp_secret FROM users WHERE id = ?").get(userId);
    return row ? this.decrypt(row.totp_secret) : null;
  }

  enable2FA(userId) {
    this.db
      .prepare("UPDATE users SET totp_enabled = 1, updated_at = datetime('now') WHERE id = ?")
      .run(userId);
  }

  disable2FA(userId) {
    this.db
      .prepare(
        "UPDATE users SET totp_enabled = 0, totp_secret = NULL, updated_at = datetime('now') WHERE id = ?"
      )
      .run(userId);
  }

  getUserCount() {
    return this.db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  }

  // ── Settings ───────────────────────────────────────────────────
  getSetting(key) {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    this.db
      .prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
      .run(key, String(value));
  }

  getAllSettings() {
    const rows = this.db.prepare("SELECT key, value FROM settings").all();
    const obj = {};
    for (const r of rows) obj[r.key] = r.value;
    return obj;
  }

  // ── Domains ────────────────────────────────────────────────────
  getDomains() {
    return this.db.prepare("SELECT * FROM domains ORDER BY id").all();
  }

  addDomain(domain, record, type) {
    const info = this.db
      .prepare("INSERT INTO domains (domain, record, type) VALUES (?, ?, ?)")
      .run(domain, record || "@", type || "A");
    return this.db.prepare("SELECT * FROM domains WHERE id = ?").get(info.lastInsertRowid);
  }

  updateDomain(id, data) {
    this.db
      .prepare("UPDATE domains SET domain = ?, record = ?, type = ?, enabled = ? WHERE id = ?")
      .run(data.domain, data.record, data.type, data.enabled ? 1 : 0, id);
  }

  deleteDomain(id) {
    this.db.prepare("DELETE FROM domains WHERE id = ?").run(id);
  }

  // ── Cloudflare credentials (multi-account) ─────────────────────
  getAllCfCredentials() {
    return this.db.prepare("SELECT * FROM cf_credentials ORDER BY id").all().map((row) => ({
      ...row,
      api_token: this.decrypt(row.api_token_enc),
    }));
  }

  getCfCredentials(id) {
    const sql = id
      ? "SELECT * FROM cf_credentials WHERE id = ?"
      : "SELECT * FROM cf_credentials ORDER BY id LIMIT 1";
    const row = id ? this.db.prepare(sql).get(id) : this.db.prepare(sql).get();
    if (!row) return null;
    return { ...row, api_token: this.decrypt(row.api_token_enc) };
  }

  saveCfCredentials(data) {
    const enc = this.encrypt(data.api_token);
    if (data.id) {
      this.db
        .prepare(
          "UPDATE cf_credentials SET label = ?, auth_type = ?, api_token_enc = ?, zone_id = ?, email = ?, account_id = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(data.label || "Default", data.auth_type, enc, data.zone_id, data.email || null, data.account_id || null, data.id);
      return data.id;
    }
    const info = this.db
      .prepare(
        "INSERT INTO cf_credentials (label, auth_type, api_token_enc, zone_id, email, account_id) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(data.label || "Default", data.auth_type, enc, data.zone_id, data.email || null, data.account_id || null);
    return info.lastInsertRowid;
  }

  deleteCfCredential(id) {
    this.db.prepare("UPDATE domains SET cf_credential_id = NULL WHERE cf_credential_id = ?").run(id);
    this.db.prepare("DELETE FROM cf_credentials WHERE id = ?").run(id);
  }

  // ── Notifications ──────────────────────────────────────────────
  getNotifications() {
    return this.db.prepare("SELECT * FROM notifications ORDER BY id").all().map((n) => ({
      ...n,
      config: JSON.parse(this.decrypt(n.config_enc) || "{}"),
    }));
  }

  getNotification(id) {
    const n = this.db.prepare("SELECT * FROM notifications WHERE id = ?").get(id);
    if (!n) return null;
    return { ...n, config: JSON.parse(this.decrypt(n.config_enc) || "{}") };
  }

  addNotification(data) {
    const enc = this.encrypt(JSON.stringify(data.config));
    const info = this.db
      .prepare(
        "INSERT INTO notifications (type, name, config_enc, enabled, on_bypass_activate, on_bypass_deactivate, on_error, on_feed_stale) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        data.type, data.name, enc,
        data.enabled ? 1 : 0,
        data.on_bypass_activate ? 1 : 0,
        data.on_bypass_deactivate ? 1 : 0,
        data.on_error ? 1 : 0,
        data.on_feed_stale ? 1 : 0
      );
    return this.getNotification(info.lastInsertRowid);
  }

  updateNotification(id, data) {
    const enc = this.encrypt(JSON.stringify(data.config));
    this.db
      .prepare(
        "UPDATE notifications SET type = ?, name = ?, config_enc = ?, enabled = ?, on_bypass_activate = ?, on_bypass_deactivate = ?, on_error = ?, on_feed_stale = ? WHERE id = ?"
      )
      .run(
        data.type, data.name, enc,
        data.enabled ? 1 : 0,
        data.on_bypass_activate ? 1 : 0,
        data.on_bypass_deactivate ? 1 : 0,
        data.on_error ? 1 : 0,
        data.on_feed_stale ? 1 : 0,
        id
      );
  }

  deleteNotification(id) {
    this.db.prepare("DELETE FROM notifications WHERE id = ?").run(id);
  }

  // ── API Keys ───────────────────────────────────────────────────
  getApiKeys() {
    return this.db
      .prepare("SELECT id, name, key_prefix, permissions, last_used_at, created_at, expires_at FROM api_keys ORDER BY id")
      .all()
      .map((k) => ({ ...k, permissions: JSON.parse(k.permissions) }));
  }

  createApiKey(name, permissions) {
    const raw = "cfb_" + crypto.randomBytes(24).toString("hex");
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    const prefix = raw.substring(0, 12);
    this.db
      .prepare("INSERT INTO api_keys (name, key_hash, key_prefix, permissions) VALUES (?, ?, ?, ?)")
      .run(name, hash, prefix, JSON.stringify(permissions));
    return { key: raw, prefix };
  }

  validateApiKey(key) {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const row = this.db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(hash);
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    this.db
      .prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?")
      .run(row.id);
    return { ...row, permissions: JSON.parse(row.permissions) };
  }

  deleteApiKey(id) {
    this.db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
  }

  // ── Logs ───────────────────────────────────────────────────────
  addLog(type, message, context) {
    this.db
      .prepare("INSERT INTO logs (type, message, context) VALUES (?, ?, ?)")
      .run(type, message, context ? JSON.stringify(context) : null);
  }

  getLogs(options = {}) {
    const { type, limit = 100, offset = 0 } = options;
    if (type && type !== "all") {
      return this.db
        .prepare("SELECT * FROM logs WHERE type = ? ORDER BY id DESC LIMIT ? OFFSET ?")
        .all(type, limit, offset);
    }
    return this.db
      .prepare("SELECT * FROM logs ORDER BY id DESC LIMIT ? OFFSET ?")
      .all(limit, offset);
  }

  getLogCounts() {
    const rows = this.db
      .prepare("SELECT type, COUNT(*) as count FROM logs GROUP BY type")
      .all();
    const counts = { total: 0 };
    for (const r of rows) {
      counts[r.type] = r.count;
      counts.total += r.count;
    }
    return counts;
  }

  pruneOldLogs() {
    const days = parseInt(this.getSetting("log_retention_days") || "30", 10);
    this.db
      .prepare("DELETE FROM logs WHERE created_at < datetime('now', ?)")
      .run(`-${days} days`);
    this.db
      .prepare("DELETE FROM check_history WHERE created_at < datetime('now', ?)")
      .run(`-${days} days`);
    this.db
      .prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')")
      .run();
  }

  // ── Check & bypass history ─────────────────────────────────────
  addCheckHistory(data) {
    this.db
      .prepare(
        "INSERT INTO check_history (blocked_ips, blocked_isps, general_blocked, feed_stale, bypass_active, feed_age_hours) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        data.blocked_ips, data.blocked_isps,
        data.general_blocked ? 1 : 0,
        data.feed_stale ? 1 : 0,
        data.bypass_active ? 1 : 0,
        data.feed_age_hours || 0
      );
  }

  getCheckHistory(hours = 24) {
    return this.db
      .prepare("SELECT * FROM check_history WHERE created_at > datetime('now', ?) ORDER BY created_at")
      .all(`-${hours} hours`);
  }

  addBypassHistory(active, reason, domainsAffected, blockedIps, blockedIsps) {
    this.db
      .prepare(
        "INSERT INTO bypass_history (active, reason, domains_affected, blocked_ips, blocked_isps) VALUES (?, ?, ?, ?, ?)"
      )
      .run(active ? 1 : 0, reason, JSON.stringify(domainsAffected), blockedIps, blockedIsps);
  }

  getBypassHistory(limit = 50) {
    return this.db
      .prepare("SELECT * FROM bypass_history ORDER BY id DESC LIMIT ?")
      .all(limit);
  }

  // ── Audit ──────────────────────────────────────────────────────
  audit(userId, action, detail, ip) {
    this.db
      .prepare("INSERT INTO audit_log (user_id, action, detail, ip) VALUES (?, ?, ?, ?)")
      .run(userId, action, detail, ip);
  }

  getAuditLog(limit = 100) {
    return this.db
      .prepare(
        "SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.id DESC LIMIT ?"
      )
      .all(limit);
  }

  // ── Session store ──────────────────────────────────────────────
  getSessionStore(sessionLib) {
    const KnexSessionStore = require("connect-session-knex")(sessionLib);
    const knex = require("knex")({
      client: "better-sqlite3",
      connection: { filename: path.join(this.dataDir, "cfb.db") },
      useNullAsDefault: true,
    });
    return new KnexSessionStore({ knex, tablename: "sessions", createtable: true });
  }

  close() {
    if (this.db) this.db.close();
  }
}

module.exports = { Database };
