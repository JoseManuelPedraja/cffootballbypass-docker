"use strict";

const express = require("express");
const { NotificationManager } = require("../notification/manager");
const { CloudflareClient } = require("../cloudflare");

function apiRoutes(db, auth, bypass, notifications) {
  const router = express.Router();

  const requireSession = auth.requireAuth();

  // ── Status (public for API keys) ──────────────────────────────
  router.get("/status", async (req, res) => {
    if (req.session?.userId) {
      return res.json(bypass.getStatus());
    }
    if (req.headers.authorization) {
      const key = req.headers.authorization.replace("Bearer ", "");
      const apiKey = await db.validateApiKey(key);
      if (apiKey) return res.json(bypass.getStatus());
    }
    res.status(401).json({ error: "No autenticado" });
  });

  // ── Domains ────────────────────────────────────────────────────
  router.get("/domains", requireSession, async (req, res) => {
    res.json(await db.getDomains());
  });

  router.post("/domains", requireSession, async (req, res) => {
    const { domain, record, type, cf_credential_id } = req.body;
    if (!domain) return res.status(400).json({ error: "Dominio requerido" });
    const d = await db.addDomain(domain, record, type, cf_credential_id);
    await db.audit(req.session.userId, "domain_added", domain, req.ip);
    res.json(d);
  });

  router.put("/domains/:id", requireSession, async (req, res) => {
    await db.updateDomain(parseInt(req.params.id, 10), req.body);
    await db.audit(req.session.userId, "domain_updated", req.body.domain, req.ip);
    res.json({ ok: true });
  });

  router.delete("/domains/:id", requireSession, async (req, res) => {
    await db.deleteDomain(parseInt(req.params.id, 10));
    await db.audit(req.session.userId, "domain_deleted", req.params.id, req.ip);
    res.json({ ok: true });
  });

  // ── Settings ───────────────────────────────────────────────────
  router.get("/settings", requireSession, async (req, res) => {
    res.json(await db.getAllSettings());
  });

  router.put("/settings", requireSession, async (req, res) => {
    const allowed = [
      "interval_seconds", "stale_threshold_hours", "min_isps_blocked",
      "force_proxy_off_override", "cooldown_minutes", "feed_url",
      "log_retention_days", "theme", "language", "proxy_type",
      "proxy_config", "update_check",
    ];
    for (const [key, value] of Object.entries(req.body)) {
      if (allowed.includes(key)) {
        await db.setSetting(key, value);
      }
    }
    await db.audit(req.session.userId, "settings_changed", JSON.stringify(req.body), req.ip);
    bypass.restart();
    res.json({ ok: true });
  });

  // ── Cloudflare credentials (multi-account) ─────────────────────
  router.get("/cloudflare", requireSession, async (req, res) => {
    const all = await db.getAllCfCredentials();
    res.json(all.map((c) => ({
      id: c.id,
      label: c.label,
      auth_type: c.auth_type,
      zone_id: c.zone_id,
      email: c.email,
      account_id: c.account_id,
      has_token: !!c.api_token,
    })));
  });

  router.put("/cloudflare", requireSession, async (req, res) => {
    const { id, label, auth_type, api_token, zone_id, email, account_id } = req.body;
    if (!zone_id) {
      return res.status(400).json({ error: "Zone ID requerido" });
    }
    if (!id && !api_token) {
      return res.status(400).json({ error: "API Token requerido" });
    }
    const credId = await db.saveCfCredentials({ id, label, auth_type, api_token, zone_id, email, account_id });
    await db.audit(req.session.userId, "cf_credentials_changed", `${label || "Default"} (${auth_type})`, req.ip);
    bypass.restart();
    res.json({ ok: true, id: credId });
  });

  router.delete("/cloudflare/:id", requireSession, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const domainsBefore = (await db.getDomains()).length;
    await db.deleteCfCredential(id, true);
    const domainsAfter = (await db.getDomains()).length;
    const deleted = domainsBefore - domainsAfter;
    await db.audit(req.session.userId, "cf_credential_deleted", `id=${req.params.id}, ${deleted} dominios eliminados`, req.ip);
    bypass.restart();
    res.json({ ok: true, domainsDeleted: deleted });
  });

  router.post("/cloudflare/test", requireSession, async (req, res) => {
    try {
      const { id, auth_type, api_token, zone_id, email, account_id } = req.body;
      let creds = { auth_type, api_token, zone_id, email, account_id };
      if (id && !api_token) {
        const stored = await db.getCfCredentials(id);
        if (!stored) return res.status(404).json({ error: "Credencial no encontrada" });
        creds = { ...stored, ...creds, api_token: stored.api_token };
      }
      const client = new CloudflareClient(creds);
      const result = await client.testConnection();
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── Cloudflare DNS record listing ───────────────────────────────
  router.get("/cloudflare/:id/dns-records", requireSession, async (req, res) => {
    try {
      const cred = await db.getCfCredentials(parseInt(req.params.id, 10));
      if (!cred) return res.status(404).json({ error: "Credencial no encontrada" });
      const client = new CloudflareClient(cred);
      const records = await client.listDnsRecords();
      const filtered = records.filter(r => ["A", "AAAA", "CNAME"].includes(r.type));
      res.json(filtered.map(r => ({
        cf_id: r.id,
        name: r.name,
        type: r.type,
        content: r.content,
        proxied: r.proxied,
        proxiable: r.proxiable,
        ttl: r.ttl,
      })));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── Domain import from Cloudflare ─────────────────────────────
  router.post("/domains/import", requireSession, async (req, res) => {
    const { records, cf_credential_id } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "No hay registros seleccionados" });
    }
    const existing = await db.getDomains();
    const imported = [];
    for (const r of records) {
      const parts = r.name.split(".");
      let domain, record;
      if (parts.length > 2) {
        domain = parts.slice(-2).join(".");
        record = parts.slice(0, -2).join(".");
      } else {
        domain = r.name;
        record = "@";
      }
      const alreadyExists = existing.some(
        (e) => e.domain === domain && e.record === record && e.type === r.type
      );
      if (!alreadyExists) {
        const d = await db.addDomain(domain, record, r.type, cf_credential_id || null);
        imported.push(d);
      }
    }
    await db.audit(req.session.userId, "domains_imported", `${imported.length} registros importados`, req.ip);
    res.json({ ok: true, imported: imported.length, skipped: records.length - imported.length });
  });

  // ── Bypass control ─────────────────────────────────────────────
  router.post("/bypass/mode", requireSession, async (req, res) => {
    const { mode } = req.body;
    await bypass.setMode(mode);
    await db.audit(req.session.userId, "mode_changed", mode, req.ip);
    res.json({ ok: true });
  });

  router.post("/bypass/check", requireSession, async (req, res) => {
    await bypass.runCheck();
    await db.audit(req.session.userId, "manual_check", null, req.ip);
    res.json(bypass.getStatus());
  });

  // ── Notifications ──────────────────────────────────────────────
  router.get("/notifications", requireSession, async (req, res) => {
    const list = (await db.getNotifications()).map((n) => {
      const events = [];
      if (n.on_bypass_activate) events.push("bypass_activate");
      if (n.on_bypass_deactivate) events.push("bypass_deactivate");
      if (n.on_error) events.push("error");
      if (n.on_feed_stale) events.push("feed_stale");
      return { ...n, config: maskSecrets(n.config), events };
    });
    res.json(list);
  });

  router.get("/notifications/types", requireSession, (req, res) => {
    res.json(NotificationManager.getProviderTypes());
  });

  router.post("/notifications", requireSession, async (req, res) => {
    const data = { ...req.body };
    if (Array.isArray(data.events)) {
      data.on_bypass_activate = data.events.includes("bypass_activate") ? 1 : 0;
      data.on_bypass_deactivate = data.events.includes("bypass_deactivate") ? 1 : 0;
      data.on_error = data.events.includes("error") ? 1 : 0;
      data.on_feed_stale = data.events.includes("feed_stale") ? 1 : 0;
    }
    const n = await db.addNotification(data);
    await db.audit(req.session.userId, "notification_added", `${data.type}: ${data.name}`, req.ip);
    res.json(n);
  });

  router.put("/notifications/:id", requireSession, async (req, res) => {
    await db.updateNotification(parseInt(req.params.id, 10), req.body);
    await db.audit(req.session.userId, "notification_updated", req.body.name, req.ip);
    res.json({ ok: true });
  });

  router.delete("/notifications/:id", requireSession, async (req, res) => {
    await db.deleteNotification(parseInt(req.params.id, 10));
    await db.audit(req.session.userId, "notification_deleted", req.params.id, req.ip);
    res.json({ ok: true });
  });

  router.post("/notifications/test", requireSession, async (req, res) => {
    try {
      const { type, config } = req.body;
      await notifications.test(type, config);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── API Keys ───────────────────────────────────────────────────
  router.get("/api-keys", requireSession, async (req, res) => {
    res.json(await db.getApiKeys());
  });

  router.post("/api-keys", requireSession, async (req, res) => {
    const { name, permissions } = req.body;
    if (!name) return res.status(400).json({ error: "Nombre requerido" });
    const result = await db.createApiKey(name, permissions || ["read"]);
    await db.audit(req.session.userId, "api_key_created", name, req.ip);
    res.json(result);
  });

  router.delete("/api-keys/:id", requireSession, async (req, res) => {
    await db.deleteApiKey(parseInt(req.params.id, 10));
    await db.audit(req.session.userId, "api_key_deleted", req.params.id, req.ip);
    res.json({ ok: true });
  });

  // ── Logs ───────────────────────────────────────────────────────
  router.get("/logs", requireSession, async (req, res) => {
    const { type, limit, offset } = req.query;
    res.json(await db.getLogs({
      type,
      limit: parseInt(limit || "100", 10),
      offset: parseInt(offset || "0", 10),
    }));
  });

  router.get("/logs/counts", requireSession, async (req, res) => {
    res.json(await db.getLogCounts());
  });

  // ── History (for charts) ───────────────────────────────────────
  router.get("/history/checks", requireSession, async (req, res) => {
    const hours = parseInt(req.query.hours || "24", 10);
    res.json(await db.getCheckHistory(hours));
  });

  router.get("/history/bypass", requireSession, async (req, res) => {
    const limit = parseInt(req.query.limit || "50", 10);
    res.json(await db.getBypassHistory(limit));
  });

  // ── Audit log ──────────────────────────────────────────────────
  router.get("/audit", requireSession, async (req, res) => {
    const limit = parseInt(req.query.limit || "100", 10);
    res.json(await db.getAuditLog(limit));
  });

  // ── About / update check ───────────────────────────────────────
  router.get("/about", requireSession, async (req, res) => {
    const info = {
      version: "3.0.0-dev",
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      dbType: db.type,
    };

    if ((await db.getSetting("update_check")) === "1") {
      try {
        const resp = await fetch(
          "https://api.github.com/repos/JoseManuelPedraja/cffootballbypass-docker/releases/latest",
          {
            headers: { "User-Agent": "CFB-Panel/3.0" },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (resp.ok) {
          const release = await resp.json();
          info.latestVersion = release.tag_name?.replace(/^v/, "");
          info.releaseUrl = release.html_url;
          info.updateAvailable = info.latestVersion !== info.version;
        }
      } catch { /* ignore */ }
    }

    res.json(info);
  });

  return router;
}

function maskSecrets(config) {
  const masked = { ...config };
  const sensitive = ["pass", "password", "token", "botToken", "appToken", "userKey", "secret"];
  for (const key of sensitive) {
    if (masked[key]) {
      masked[key] = masked[key].substring(0, 4) + "••••••••";
    }
  }
  return masked;
}

module.exports = { apiRoutes };
