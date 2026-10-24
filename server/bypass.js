"use strict";

const { EventEmitter } = require("events");
const dns = require("dns").promises;
const { CloudflareClient } = require("./cloudflare");

class BypassEngine extends EventEmitter {
  constructor(db, notifications) {
    super();
    this.db = db;
    this.notifications = notifications;
    this.cf = null;
    this.timer = null;
    this.running = false;
    this.bypassActive = false;
    this.lastCheck = null;
    this.lastChange = null;
    this.lastFeed = null;
    this.mode = "auto";
    this.feedCache = null;
    this.stats = {
      blockedIps: 0,
      blockedIsps: 0,
      generalBlocked: false,
      feedStale: false,
      feedAge: 0,
    };
    this.domainResults = [];
  }

  start() {
    const creds = this.db.getCfCredentials();
    if (creds && creds.api_token && creds.zone_id) {
      this.cf = new CloudflareClient(creds);
      console.log("[Bypass] Engine started with", creds.auth_type, "auth");
    } else {
      console.log("[Bypass] No Cloudflare credentials — configure via panel");
    }

    const interval = parseInt(this.db.getSetting("interval_seconds") || "300", 10);
    this.runCheck();
    this.timer = setInterval(() => this.runCheck(), interval * 1000);
    this.running = true;
    console.log(`[Bypass] Check interval: ${interval}s`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.running = false;
  }

  restart() {
    this.stop();
    this.start();
  }

  getStatus() {
    return {
      bypassActive: this.bypassActive,
      mode: this.mode,
      lastCheck: this.lastCheck,
      lastChange: this.lastChange,
      stats: this.stats,
      domainResults: this.domainResults,
      running: this.running,
      hasCfCredentials: !!this.cf,
    };
  }

  setMode(mode) {
    if (!["auto", "force_off", "force_on", "paused"].includes(mode)) return;
    this.mode = mode;
    this.db.addLog("panel", `Modo cambiado a: ${mode}`);
    this.emit("statusChange", this.getStatus());
    if (mode !== "paused") this.runCheck();
  }

  async runCheck() {
    if (this.mode === "paused") return;

    const feedUrl = this.db.getSetting("feed_url") || "https://hayahora.futbol/estado/data.json";
    const staleHours = parseInt(this.db.getSetting("stale_threshold_hours") || "6", 10);
    const minIsps = parseInt(this.db.getSetting("min_isps_blocked") || "2", 10);
    const forceOverride = this.db.getSetting("force_proxy_off_override") === "1";
    const cooldownMin = parseInt(this.db.getSetting("cooldown_minutes") || "60", 10);
    const domains = this.db.getDomains().filter((d) => d.enabled);

    // Refresh CF client
    const creds = this.db.getCfCredentials();
    if (creds && creds.api_token && creds.zone_id) {
      this.cf = new CloudflareClient(creds);
    }

    if (!this.cf) {
      this.db.addLog("error", "Sin credenciales de Cloudflare");
      this.lastCheck = new Date().toISOString();
      this.emit("statusChange", this.getStatus());
      return;
    }

    if (domains.length === 0) {
      this.db.addLog("error", "No hay dominios configurados");
      this.lastCheck = new Date().toISOString();
      this.emit("statusChange", this.getStatus());
      return;
    }

    // Fetch feed
    let feedData;
    try {
      const resp = await fetch(feedUrl, {
        headers: { "User-Agent": "CFB-Panel/3.0" },
        signal: AbortSignal.timeout(25000),
      });
      if (resp.ok) {
        feedData = await resp.json();
        this.feedCache = feedData;
        this.lastFeed = new Date().toISOString();
      } else if (this.feedCache) {
        feedData = this.feedCache;
        this.db.addLog("warn", `Feed HTTP ${resp.status}, usando caché`);
      } else {
        this.db.addLog("error", `Feed no disponible (HTTP ${resp.status})`);
        this.lastCheck = new Date().toISOString();
        this.emit("statusChange", this.getStatus());
        return;
      }
    } catch (err) {
      if (this.feedCache) {
        feedData = this.feedCache;
        this.db.addLog("warn", "Feed timeout, usando caché");
      } else {
        this.db.addLog("error", `Feed error: ${err.message}`);
        this.lastCheck = new Date().toISOString();
        this.emit("statusChange", this.getStatus());
        this.notifications.send("error", {
          title: "[CFB] Feed no disponible",
          message: `Error: ${err.message}`,
        });
        return;
      }
    }

    // Check staleness
    let feedStale = false;
    let feedAgeHours = 0;
    if (feedData.lastUpdate) {
      const feedTs = new Date(feedData.lastUpdate).getTime();
      const now = Date.now();
      feedAgeHours = (now - feedTs) / 3600000;
      if (feedAgeHours >= staleHours) {
        feedStale = true;
      }
    }

    // Count blocked IPs & ISPs
    let blockedIps = 0;
    let blockedIsps = 0;
    const ispSet = new Set();

    if (!feedStale && feedData.ips) {
      for (const [, val] of Object.entries(feedData.ips)) {
        if (val === true || (typeof val === "object" && val.blocked)) {
          blockedIps++;
          if (typeof val === "object" && val.isp) ispSet.add(val.isp);
        }
      }
    }
    if (!feedStale && feedData.isps) {
      for (const [name, val] of Object.entries(feedData.isps)) {
        if (val.blocked) ispSet.add(name);
      }
    }
    blockedIsps = ispSet.size;

    let generalBlocked = false;
    if (blockedIps > 0 && !feedStale) {
      generalBlocked = blockedIsps === 0 || blockedIsps >= minIsps;
    }

    this.stats = {
      blockedIps,
      blockedIsps,
      generalBlocked,
      feedStale,
      feedAge: feedAgeHours,
      ispNames: [...ispSet],
    };

    // Process domains
    const results = [];
    let anyDisabled = false;
    const now = Date.now();
    const cooldownMs = cooldownMin * 60000;

    for (const dom of domains) {
      const fullname =
        dom.record === "@" || !dom.record ? dom.domain : `${dom.record}.${dom.domain}`;

      let domainBlocked = false;
      let resolvedIps = [];

      try {
        if (dom.type === "AAAA") {
          resolvedIps = await dns.resolve6(fullname).catch(() => []);
        } else {
          resolvedIps = await dns.resolve4(fullname).catch(() => []);
        }
      } catch {
        resolvedIps = [];
      }

      if (resolvedIps.length > 0 && !feedStale && feedData.ips) {
        for (const ip of resolvedIps) {
          const entry = feedData.ips[ip];
          if (entry === true || (typeof entry === "object" && entry.blocked)) {
            domainBlocked = true;
            break;
          }
        }
      }

      let shouldDisable = false;
      let reason = "domain_clear";

      if (this.mode === "force_off") {
        shouldDisable = true;
        reason = "force_off";
      } else if (this.mode === "force_on") {
        shouldDisable = false;
        reason = "force_on";
      } else {
        if (domainBlocked) {
          shouldDisable = true;
          reason = "domain_blocked";
        } else if (forceOverride && generalBlocked) {
          shouldDisable = true;
          reason = "override_general";
        }
        if (
          !shouldDisable &&
          this.bypassActive &&
          this.lastChange &&
          now - new Date(this.lastChange).getTime() < cooldownMs
        ) {
          shouldDisable = true;
          reason = "cooldown";
        }
      }

      const desiredProxy = !shouldDisable;
      if (shouldDisable) anyDisabled = true;

      let apiStatus = "pending";
      try {
        await this.cf.setProxy(dom.domain, fullname, dom.type, desiredProxy);
        apiStatus = "ok";
      } catch (err) {
        apiStatus = `error: ${err.message}`;
        this.db.addLog("error", `API error for ${fullname}: ${err.message}`);
      }

      results.push({
        domain: dom.domain,
        fullname,
        type: dom.type,
        proxy: desiredProxy,
        blocked: domainBlocked,
        reason,
        apiStatus,
        ips: resolvedIps.map((ip) => ip.replace(/(\d+\.\d+)\.\d+\.\d+/, "$1.xxx.xxx")),
      });
    }

    this.domainResults = results;

    // State transition
    const prevActive = this.bypassActive;
    const newActive = anyDisabled;

    if (newActive !== prevActive) {
      this.bypassActive = newActive;
      this.lastChange = new Date().toISOString();
      const eventType = newActive ? "bypass_activate" : "bypass_deactivate";
      const domainNames = results.map((r) => r.fullname);

      this.db.addBypassHistory(newActive, results[0]?.reason, domainNames, blockedIps, blockedIsps);
      this.db.addLog("bypass", newActive ? "Bypass activado" : "Bypass desactivado", {
        reason: results[0]?.reason,
        domains: domainNames,
      });

      this.notifications.send(eventType, {
        title: newActive
          ? "[CFB] Proxy de Cloudflare desactivado — bloqueos"
          : "[CFB] Proxy de Cloudflare reactivado",
        message: newActive
          ? `Bloqueos detectados. Proxy OFF en ${domainNames.length} dominios. Motivo: ${results[0]?.reason}`
          : `No hay bloqueos activos. Proxy re-activado en ${domainNames.length} dominios.`,
        domains: domainNames,
        reason: results[0]?.reason,
        blockedIps,
        blockedIsps,
      });
    }

    this.db.addCheckHistory({
      blocked_ips: blockedIps,
      blocked_isps: blockedIsps,
      general_blocked: generalBlocked,
      feed_stale: feedStale,
      bypass_active: newActive,
      feed_age_hours: feedAgeHours,
    });

    this.lastCheck = new Date().toISOString();
    this.emit("statusChange", this.getStatus());
    this.emit("log", {
      type: "cron",
      message: "Comprobación automática",
      context: { blockedIps, blockedIsps, generalBlocked, feedStale, bypass: newActive },
    });
  }
}

module.exports = { BypassEngine };
