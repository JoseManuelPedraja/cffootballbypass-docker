"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

class Database {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.type = process.env.CFB_DB_TYPE || "sqlite";
    this.knex = null;
  }

  async init() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const knexLib = require("knex");

    if (this.type === "mysql" || this.type === "mariadb") {
      this.type = "mysql";
      this.knex = knexLib({
        client: "mysql2",
        connection: process.env.CFB_DB_URL || {
          host: process.env.CFB_DB_HOST || "localhost",
          port: parseInt(process.env.CFB_DB_PORT || "3306", 10),
          user: process.env.CFB_DB_USER || "cfb",
          password: process.env.CFB_DB_PASS || "",
          database: process.env.CFB_DB_NAME || "cfb_panel",
        },
        pool: { min: 2, max: 10 },
      });
    } else if (this.type === "postgres" || this.type === "postgresql") {
      this.type = "postgres";
      this.knex = knexLib({
        client: "pg",
        connection: process.env.CFB_DB_URL || {
          host: process.env.CFB_DB_HOST || "localhost",
          port: parseInt(process.env.CFB_DB_PORT || "5432", 10),
          user: process.env.CFB_DB_USER || "cfb",
          password: process.env.CFB_DB_PASS || "",
          database: process.env.CFB_DB_NAME || "cfb_panel",
        },
        pool: { min: 2, max: 10 },
      });
    } else {
      this.type = "sqlite";
      this.knex = knexLib({
        client: "better-sqlite3",
        connection: { filename: path.join(this.dataDir, "cfb.db") },
        useNullAsDefault: true,
        pool: {
          afterCreate: (conn, cb) => {
            conn.pragma("journal_mode = WAL");
            conn.pragma("foreign_keys = ON");
            conn.pragma("busy_timeout = 5000");
            cb();
          },
        },
      });
    }

    await this.runMigrations();
  }

  async runMigrations() {
    const exists = await this.knex.schema.hasTable("_migrations");
    if (!exists) {
      await this.knex.schema.createTable("_migrations", (t) => {
        t.increments("id");
        t.string("name").unique().notNullable();
        t.timestamp("applied_at").defaultTo(this.knex.fn.now());
      });
    }

    const applied = new Set(
      (await this.knex("_migrations").select("name")).map((r) => r.name)
    );

    for (const m of this.getMigrations()) {
      if (!applied.has(m.name)) {
        console.log(`[DB] Running migration: ${m.name}`);
        await m.up(this.knex);
        await this.knex("_migrations").insert({ name: m.name });
      }
    }
  }

  getMigrations() {
    return [
      {
        name: "001-init",
        up: async (knex) => {
          await knex.schema.createTable("users", (t) => {
            t.increments("id");
            t.string("username").unique().notNullable();
            t.text("password_hash").notNullable();
            t.text("totp_secret");
            t.integer("totp_enabled").defaultTo(0);
            t.timestamp("created_at").defaultTo(knex.fn.now());
            t.timestamp("updated_at").defaultTo(knex.fn.now());
          });

          await knex.schema.createTable("cf_credentials", (t) => {
            t.increments("id");
            t.string("label").defaultTo("Default");
            t.string("auth_type").defaultTo("token");
            t.text("api_token_enc");
            t.string("zone_id");
            t.string("email");
            t.string("account_id");
            t.timestamp("updated_at").defaultTo(knex.fn.now());
          });

          await knex.schema.createTable("domains", (t) => {
            t.increments("id");
            t.string("domain").notNullable();
            t.string("record").defaultTo("@");
            t.string("type").defaultTo("A");
            t.integer("enabled").defaultTo(1);
            t.integer("cf_credential_id").unsigned().references("id").inTable("cf_credentials").onDelete("SET NULL");
            t.timestamp("created_at").defaultTo(knex.fn.now());
          });

          await knex.schema.createTable("settings", (t) => {
            t.string("key").primary();
            t.text("value");
            t.timestamp("updated_at").defaultTo(knex.fn.now());
          });

          await knex.schema.createTable("notifications", (t) => {
            t.increments("id");
            t.string("type").notNullable();
            t.string("name").notNullable();
            t.text("config_enc").notNullable();
            t.integer("enabled").defaultTo(1);
            t.integer("on_bypass_activate").defaultTo(1);
            t.integer("on_bypass_deactivate").defaultTo(1);
            t.integer("on_error").defaultTo(0);
            t.integer("on_feed_stale").defaultTo(0);
            t.timestamp("created_at").defaultTo(knex.fn.now());
          });

          await knex.schema.createTable("api_keys", (t) => {
            t.increments("id");
            t.string("name").notNullable();
            t.string("key_hash").unique().notNullable();
            t.string("key_prefix").notNullable();
            t.text("permissions").defaultTo('["read"]');
            t.timestamp("last_used_at");
            t.timestamp("created_at").defaultTo(knex.fn.now());
            t.timestamp("expires_at");
          });

          await knex.schema.createTable("bypass_history", (t) => {
            t.increments("id");
            t.integer("active").notNullable();
            t.text("reason");
            t.text("domains_affected");
            t.integer("blocked_ips").defaultTo(0);
            t.integer("blocked_isps").defaultTo(0);
            t.timestamp("created_at").defaultTo(knex.fn.now());
          });

          await knex.schema.createTable("check_history", (t) => {
            t.increments("id");
            t.integer("blocked_ips").defaultTo(0);
            t.integer("blocked_isps").defaultTo(0);
            t.integer("general_blocked").defaultTo(0);
            t.integer("feed_stale").defaultTo(0);
            t.integer("bypass_active").defaultTo(0);
            t.float("feed_age_hours").defaultTo(0);
            t.timestamp("created_at").defaultTo(knex.fn.now());
          });

          await knex.schema.createTable("logs", (t) => {
            t.increments("id");
            t.string("type").notNullable().index();
            t.text("message").notNullable();
            t.text("context");
            t.timestamp("created_at").defaultTo(knex.fn.now()).index();
          });

          await knex.schema.createTable("audit_log", (t) => {
            t.increments("id");
            t.integer("user_id").unsigned();
            t.string("action").notNullable();
            t.text("detail");
            t.string("ip");
            t.timestamp("created_at").defaultTo(knex.fn.now()).index();
          });
        },
      },
      {
        name: "002-default-settings",
        up: async (knex) => {
          const defaults = [
            ["interval_seconds", "300"],
            ["stale_threshold_hours", "6"],
            ["min_isps_blocked", "2"],
            ["force_proxy_off_override", "0"],
            ["cooldown_minutes", "60"],
            ["feed_url", "https://hayahora.futbol/estado/data.json"],
            ["log_retention_days", "30"],
            ["theme", "auto"],
            ["language", "es"],
            ["proxy_type", "none"],
            ["proxy_config", "{}"],
            ["update_check", "1"],
          ];
          for (const [key, value] of defaults) {
            const exists = await knex("settings").where("key", key).first();
            if (!exists) await knex("settings").insert({ key, value });
          }
        },
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
  async getUserByUsername(username) {
    return this.knex("users").where("username", username).first();
  }

  async getUserById(id) {
    return this.knex("users").where("id", id).first();
  }

  async createUser(username, passwordHash) {
    const [id] = await this.knex("users").insert({ username, password_hash: passwordHash });
    return this.getUserById(id);
  }

  async updateUserPassword(id, passwordHash) {
    await this.knex("users").where("id", id).update({
      password_hash: passwordHash,
      updated_at: this.knex.fn.now(),
    });
  }

  async setTotpSecret(userId, secret) {
    await this.knex("users").where("id", userId).update({
      totp_secret: this.encrypt(secret),
      updated_at: this.knex.fn.now(),
    });
  }

  async getTotpSecret(userId) {
    const row = await this.knex("users").where("id", userId).select("totp_secret").first();
    return row ? this.decrypt(row.totp_secret) : null;
  }

  async enable2FA(userId) {
    await this.knex("users").where("id", userId).update({
      totp_enabled: 1,
      updated_at: this.knex.fn.now(),
    });
  }

  async disable2FA(userId) {
    await this.knex("users").where("id", userId).update({
      totp_enabled: 0,
      totp_secret: null,
      updated_at: this.knex.fn.now(),
    });
  }

  async getUserCount() {
    const [row] = await this.knex("users").count("* as count");
    return row.count;
  }

  // ── Settings ───────────────────────────────────────────────────
  async getSetting(key) {
    const row = await this.knex("settings").where("key", key).first();
    return row ? row.value : null;
  }

  async setSetting(key, value) {
    const exists = await this.knex("settings").where("key", key).first();
    if (exists) {
      await this.knex("settings").where("key", key).update({
        value: String(value),
        updated_at: this.knex.fn.now(),
      });
    } else {
      await this.knex("settings").insert({ key, value: String(value) });
    }
  }

  async getAllSettings() {
    const rows = await this.knex("settings").select("key", "value");
    const obj = {};
    for (const r of rows) obj[r.key] = r.value;
    return obj;
  }

  // ── Domains ────────────────────────────────────────────────────
  async getDomains() {
    return this.knex("domains").orderBy("id");
  }

  async addDomain(domain, record, type, cfCredentialId) {
    const [id] = await this.knex("domains").insert({
      domain,
      record: record || "@",
      type: type || "A",
      cf_credential_id: cfCredentialId || null,
    });
    return this.knex("domains").where("id", id).first();
  }

  async updateDomain(id, data) {
    await this.knex("domains").where("id", id).update({
      domain: data.domain,
      record: data.record,
      type: data.type,
      enabled: data.enabled ? 1 : 0,
      cf_credential_id: data.cf_credential_id || null,
    });
  }

  async deleteDomain(id) {
    await this.knex("domains").where("id", id).del();
  }

  // ── Cloudflare credentials (multi-account) ─────────────────────
  async getAllCfCredentials() {
    const rows = await this.knex("cf_credentials").orderBy("id");
    return rows.map((row) => ({
      ...row,
      api_token: this.decrypt(row.api_token_enc),
    }));
  }

  async getCfCredentials(id) {
    const row = id
      ? await this.knex("cf_credentials").where("id", id).first()
      : await this.knex("cf_credentials").orderBy("id").first();
    if (!row) return null;
    return { ...row, api_token: this.decrypt(row.api_token_enc) };
  }

  async saveCfCredentials(data) {
    const enc = this.encrypt(data.api_token);
    if (data.id) {
      await this.knex("cf_credentials").where("id", data.id).update({
        label: data.label || "Default",
        auth_type: data.auth_type,
        api_token_enc: enc,
        zone_id: data.zone_id,
        email: data.email || null,
        account_id: data.account_id || null,
        updated_at: this.knex.fn.now(),
      });
      return data.id;
    }
    const [id] = await this.knex("cf_credentials").insert({
      label: data.label || "Default",
      auth_type: data.auth_type,
      api_token_enc: enc,
      zone_id: data.zone_id,
      email: data.email || null,
      account_id: data.account_id || null,
    });
    return id;
  }

  async deleteCfCredential(id) {
    await this.knex("domains").where("cf_credential_id", id).update({ cf_credential_id: null });
    await this.knex("cf_credentials").where("id", id).del();
  }

  // ── Notifications ──────────────────────────────────────────────
  async getNotifications() {
    const rows = await this.knex("notifications").orderBy("id");
    return rows.map((n) => ({
      ...n,
      config: JSON.parse(this.decrypt(n.config_enc) || "{}"),
    }));
  }

  async getNotification(id) {
    const n = await this.knex("notifications").where("id", id).first();
    if (!n) return null;
    return { ...n, config: JSON.parse(this.decrypt(n.config_enc) || "{}") };
  }

  async addNotification(data) {
    const enc = this.encrypt(JSON.stringify(data.config));
    const [id] = await this.knex("notifications").insert({
      type: data.type,
      name: data.name,
      config_enc: enc,
      enabled: data.enabled ? 1 : 0,
      on_bypass_activate: data.on_bypass_activate ? 1 : 0,
      on_bypass_deactivate: data.on_bypass_deactivate ? 1 : 0,
      on_error: data.on_error ? 1 : 0,
      on_feed_stale: data.on_feed_stale ? 1 : 0,
    });
    return this.getNotification(id);
  }

  async updateNotification(id, data) {
    const enc = this.encrypt(JSON.stringify(data.config));
    await this.knex("notifications").where("id", id).update({
      type: data.type,
      name: data.name,
      config_enc: enc,
      enabled: data.enabled ? 1 : 0,
      on_bypass_activate: data.on_bypass_activate ? 1 : 0,
      on_bypass_deactivate: data.on_bypass_deactivate ? 1 : 0,
      on_error: data.on_error ? 1 : 0,
      on_feed_stale: data.on_feed_stale ? 1 : 0,
    });
  }

  async deleteNotification(id) {
    await this.knex("notifications").where("id", id).del();
  }

  // ── API Keys ───────────────────────────────────────────────────
  async getApiKeys() {
    const rows = await this.knex("api_keys")
      .select("id", "name", "key_prefix", "permissions", "last_used_at", "created_at", "expires_at")
      .orderBy("id");
    return rows.map((k) => ({ ...k, permissions: JSON.parse(k.permissions) }));
  }

  async createApiKey(name, permissions) {
    const raw = "cfb_" + crypto.randomBytes(24).toString("hex");
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    const prefix = raw.substring(0, 12);
    await this.knex("api_keys").insert({
      name,
      key_hash: hash,
      key_prefix: prefix,
      permissions: JSON.stringify(permissions),
    });
    return { key: raw, prefix };
  }

  async validateApiKey(key) {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const row = await this.knex("api_keys").where("key_hash", hash).first();
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    await this.knex("api_keys").where("id", row.id).update({ last_used_at: this.knex.fn.now() });
    return { ...row, permissions: JSON.parse(row.permissions) };
  }

  async deleteApiKey(id) {
    await this.knex("api_keys").where("id", id).del();
  }

  // ── Logs ───────────────────────────────────────────────────────
  async addLog(type, message, context) {
    await this.knex("logs").insert({
      type,
      message,
      context: context ? JSON.stringify(context) : null,
    });
  }

  async getLogs(options = {}) {
    const { type, limit = 100, offset = 0 } = options;
    let q = this.knex("logs").orderBy("id", "desc").limit(limit).offset(offset);
    if (type && type !== "all") q = q.where("type", type);
    return q;
  }

  async getLogCounts() {
    const rows = await this.knex("logs").select("type").count("* as count").groupBy("type");
    const counts = { total: 0 };
    for (const r of rows) {
      counts[r.type] = parseInt(r.count, 10);
      counts.total += parseInt(r.count, 10);
    }
    return counts;
  }

  async pruneOldLogs() {
    const days = parseInt((await this.getSetting("log_retention_days")) || "30", 10);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const auditCutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    await this.knex("logs").where("created_at", "<", cutoff).del();
    await this.knex("check_history").where("created_at", "<", cutoff).del();
    await this.knex("audit_log").where("created_at", "<", auditCutoff).del();
  }

  // ── Check & bypass history ─────────────────────────────────────
  async addCheckHistory(data) {
    await this.knex("check_history").insert({
      blocked_ips: data.blocked_ips,
      blocked_isps: data.blocked_isps,
      general_blocked: data.general_blocked ? 1 : 0,
      feed_stale: data.feed_stale ? 1 : 0,
      bypass_active: data.bypass_active ? 1 : 0,
      feed_age_hours: data.feed_age_hours || 0,
    });
  }

  async getCheckHistory(hours = 24) {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    return this.knex("check_history").where("created_at", ">", since).orderBy("created_at");
  }

  async addBypassHistory(active, reason, domainsAffected, blockedIps, blockedIsps) {
    await this.knex("bypass_history").insert({
      active: active ? 1 : 0,
      reason,
      domains_affected: JSON.stringify(domainsAffected),
      blocked_ips: blockedIps,
      blocked_isps: blockedIsps,
    });
  }

  async getBypassHistory(limit = 50) {
    return this.knex("bypass_history").orderBy("id", "desc").limit(limit);
  }

  // ── Audit ──────────────────────────────────────────────────────
  async audit(userId, action, detail, ip) {
    await this.knex("audit_log").insert({ user_id: userId, action, detail, ip });
  }

  async getAuditLog(limit = 100) {
    return this.knex("audit_log as a")
      .leftJoin("users as u", "a.user_id", "u.id")
      .select("a.*", "u.username")
      .orderBy("a.id", "desc")
      .limit(limit);
  }

  // ── Session store ──────────────────────────────────────────────
  getSessionStore(sessionLib) {
    const KnexSessionStore = require("connect-session-knex")(sessionLib);
    return new KnexSessionStore({ knex: this.knex, tablename: "sessions", createtable: true });
  }

  async close() {
    if (this.knex) await this.knex.destroy();
  }
}

module.exports = { Database };
