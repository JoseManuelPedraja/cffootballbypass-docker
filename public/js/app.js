"use strict";

/* ═══════════════════════════════════════════════════════════════
   CF Football Bypass — Panel v3.0 — SPA Frontend
   ═══════════════════════════════════════════════════════════════ */

const App = (() => {
  let lang = {};
  let _langCode = "es";
  let currentView = null;
  let socket = null;
  let status = {};
  let user = null;
  let _deletedDomainIds = [];

  // ── i18n ──────────────────────────────────────────────────────
  function t(key, vars) {
    const parts = key.split(".");
    let v = lang;
    for (const p of parts) {
      v = v?.[p];
      if (v === undefined) return key;
    }
    if (vars && typeof v === "string") {
      for (const [k, val] of Object.entries(vars)) {
        v = v.replace(`{${k}}`, val);
      }
    }
    return v;
  }

  async function loadLang(code) {
    try {
      const res = await fetch(`/locales/${code}.json`);
      if (!res.ok) throw new Error();
      lang = await res.json();
      _langCode = code;
    } catch {
      if (code !== "en") {
        const res = await fetch("/locales/en.json");
        lang = await res.json();
        _langCode = "en";
      }
    }
  }

  function getCurrentLang() { return _langCode; }

  function flagSvg(code, size = 20) {
    if (code === "es") return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" style="border-radius:50%;vertical-align:middle"><rect width="32" height="32" fill="#c60b1e"/><rect y="8" width="32" height="16" fill="#ffc400"/></svg>`;
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" style="border-radius:50%;vertical-align:middle"><rect width="32" height="32" fill="#012169"/><path d="M0 0L32 32M32 0L0 32" stroke="#fff" stroke-width="5"/><path d="M0 0L32 32M32 0L0 32" stroke="#C8102E" stroke-width="3"/><path d="M16 0V32M0 16H32" stroke="#fff" stroke-width="9"/><path d="M16 0V32M0 16H32" stroke="#C8102E" stroke-width="5"/></svg>`;
  }

  function langPicker(location) {
    const langs = [
      { code: "es", label: "Español" },
      { code: "en", label: "English" },
    ];
    const cur = getCurrentLang();
    const next = langs.find((l) => l.code !== cur) || langs[0];
    const cls = location === "sidebar" ? "lang-btn sidebar-lang-btn" : "lang-btn login-lang-btn";
    return `<button class="${cls}" onclick="App.changeLang('${next.code}')" title="${next.label}">${flagSvg(cur)}</button>`;
  }

  async function changeLang(code) {
    await loadLang(code);
    try { localStorage.setItem("cfb_lang", code); } catch {}
    if (user) navigate(currentView || "status");
    else navigate("login");
  }

  // ── Theme ─────────────────────────────────────────────────────
  function getTheme() {
    try { return localStorage.getItem("cfb_theme") || "system"; } catch { return "system"; }
  }

  function setTheme(theme) {
    try { localStorage.setItem("cfb_theme", theme); } catch {}
    const root = document.documentElement;
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else if (theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
  }

  function toggleTheme() {
    const cur = getTheme();
    const next = cur === "dark" ? "light" : "dark";
    setTheme(next);
    renderThemeBtn();
  }

  function renderThemeBtn() {
    const btn = document.getElementById("themeBtn");
    if (!btn) return;
    const cur = getTheme();
    const icon = cur === "dark"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    btn.innerHTML = icon + (cur === "dark" ? "Día" : "Noche");
  }

  function navIcon(name) {
    const icons = {
      status: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
      domains: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
      notifications: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
      logs: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
      security: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      about: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };
    return icons[name] || '';
  }

  function adminAvatar() {
    return '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>';
  }

  // ── API ───────────────────────────────────────────────────────
  async function api(method, path, body) {
    const opts = { method, headers: {} };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`/api${path}`, opts);
    if (res.status === 401) {
      user = null;
      navigate("login");
      throw new Error("Unauthorized");
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");
    return data;
  }

  // ── Socket.io ─────────────────────────────────────────────────
  function connectSocket() {
    if (socket) socket.disconnect();
    socket = io({ transports: ["websocket", "polling"] });
    socket.on("connect", () => {
      socket.emit("requestStatus");
    });
    socket.on("status", (s) => {
      status = s;
      if (currentView === "status") renderStatus();
    });
    socket.on("newLog", (entry) => {
      if (currentView === "logs") {
        const list = document.getElementById("logList");
        if (list) {
          list.insertAdjacentHTML("afterbegin", renderLogRow(entry));
        }
      }
    });
  }

  // ── Router ────────────────────────────────────────────────────
  function navigate(view) {
    currentView = view;
    const app = document.getElementById("app");
    if (view === "login" || view === "setup") {
      app.innerHTML = "";
      if (view === "login") renderLogin(app);
      else renderSetup(app);
      return;
    }
    app.innerHTML = renderShell();
    setActiveNav(view);
    renderThemeBtn();
    const main = document.getElementById("mainContent");
    switch (view) {
      case "status": loadStatus(main); break;
      case "domains": loadDomains(main); break;
      case "notifications": loadNotifications(main); break;
      case "logs": loadLogs(main); break;
      case "security": loadSecurity(main); break;
      case "about": loadAbout(main); break;
      default: loadStatus(main);
    }
  }

  function setActiveNav(view) {
    document.querySelectorAll(".sidebar .nav-btn").forEach((el) => {
      el.classList.toggle("active", el.dataset.view === view);
    });
    const nav = document.getElementById("sidebarNav");
    if (nav) nav.classList.remove("open");
  }

  // ── Shell ─────────────────────────────────────────────────────
  function renderShell() {
    return `
      <div class="app">
        <nav class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <img src="/img/logo.png" alt="CFB" class="sidebar-logo-img">
            <div class="sidebar-brand">
              <div class="sidebar-brand-name">CF Football Bypass</div>
            </div>
            <button class="sidebar-toggle" id="sidebarToggle" onclick="App.toggleSidebar()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>
          <div class="sidebar-nav" id="sidebarNav">
            <button class="nav-btn" data-view="status" onclick="App.navigate('status')">
              ${navIcon("status")}<span>${t("nav.status")}</span>
            </button>
            <button class="nav-btn" data-view="domains" onclick="App.navigate('domains')">
              ${navIcon("domains")}<span>${t("nav.domains")}</span>
            </button>
            <button class="nav-btn" data-view="notifications" onclick="App.navigate('notifications')">
              ${navIcon("notifications")}<span>${t("nav.notifications")}</span>
            </button>
            <button class="nav-btn" data-view="logs" onclick="App.navigate('logs')">
              ${navIcon("logs")}<span>${t("nav.logs")}</span>
            </button>
            <button class="nav-btn" data-view="security" onclick="App.navigate('security')">
              ${navIcon("security")}<span>${t("nav.security")}</span>
            </button>
            <button class="nav-btn" data-view="about" onclick="App.navigate('about')">
              ${navIcon("about")}<span>${t("nav.about")}</span>
            </button>
            <div class="sidebar-spacer"></div>
            <div class="sidebar-controls">
              <button class="theme-toggle" id="themeBtn" onclick="App.toggleTheme()"></button>
              ${langPicker("sidebar")}
            </div>
            <div class="sidebar-user">
              <div class="sidebar-avatar">${adminAvatar()}</div>
              <div class="sidebar-user-info">
                <strong>${esc(user?.username || "admin")}</strong>
                <a href="#" onclick="App.logout(); return false">${t("nav.logout")}</a>
              </div>
            </div>
          </div>
        </nav>
        <main class="main" id="mainContent"></main>
      </div>`;
  }

  function toggleSidebar() {
    const nav = document.getElementById("sidebarNav");
    if (nav) nav.classList.toggle("open");
  }

  // ── Login ─────────────────────────────────────────────────────
  function renderLogin(container) {
    container.innerHTML = `
      <div class="login-wrap">
        <form class="login-form" id="loginForm">
          <div class="login-header">
            <img src="/img/logo.png" alt="CF Football Bypass" class="login-logo-img">
            <h1>CF Football Bypass</h1>
            <p>${t("auth.subtitle")}</p>
          </div>
          <div id="loginError" class="alert-error" hidden></div>
          <div class="form-group">
            <label class="label">${t("auth.username")}</label>
            <input class="input" name="username" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label class="label">${t("auth.password")}</label>
            <input class="input" name="password" type="password" autocomplete="current-password" required>
          </div>
          <div class="form-group" id="totpGroup" hidden>
            <label class="label">${t("auth.totp_label")}</label>
            <input class="input" name="totp" placeholder="${t("auth.totp_placeholder")}" autocomplete="one-time-code" inputmode="numeric" maxlength="6">
          </div>
          <button class="btn btn-login" type="submit">${t("auth.login")}</button>
          <div class="login-lang">
            ${langPicker("login")}
          </div>
        </form>
      </div>`;
    document.getElementById("loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const errEl = document.getElementById("loginError");
      errEl.hidden = true;
      try {
        const res = await api("POST", "/auth/login", {
          username: fd.get("username"),
          password: fd.get("password"),
          totp: fd.get("totp") || undefined,
        });
        if (res.requireTotp) {
          document.getElementById("totpGroup").hidden = false;
          e.target.querySelector("[name=totp]").focus();
          return;
        }
        user = res.user;
        connectSocket();
        navigate("status");
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    };
  }

  // ── Setup ─────────────────────────────────────────────────────
  function renderSetup(container) {
    container.innerHTML = `
      <div class="login-wrap">
        <form class="login-form" id="setupForm">
          <div class="login-header">
            <img src="/img/logo.png" alt="CF Football Bypass" class="login-logo-img">
            <h1>${t("auth.setup_title")}</h1>
            <p>${t("auth.setup_subtitle")}</p>
          </div>
          <div id="setupError" class="alert-error" hidden></div>
          <div class="form-group">
            <label class="label">${t("auth.username")}</label>
            <input class="input" name="username" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label class="label">${t("auth.password")}</label>
            <input class="input" name="password" type="password" autocomplete="new-password" required minlength="8">
            <span class="hint">${t("auth.password_min")}</span>
          </div>
          <button class="btn" type="submit">${t("auth.setup_btn")}</button>
          <span class="hint">${t("auth.env_hint")}</span>
        </form>
      </div>`;
    document.getElementById("setupForm").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const errEl = document.getElementById("setupError");
      errEl.hidden = true;
      try {
        const res = await api("POST", "/auth/setup", {
          username: fd.get("username"),
          password: fd.get("password"),
        });
        user = res.user;
        connectSocket();
        navigate("status");
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    };
  }

  // ── Status view ───────────────────────────────────────────────
  async function loadStatus(container) {
    container.innerHTML = `<p>${t("common.loading")}</p>`;
    try {
      status = await api("GET", "/status");
      renderStatus();
    } catch {
      container.innerHTML = `<p>${t("common.error")}</p>`;
    }
  }

  function cfCloud(on) {
    const color = on ? "#F6821F" : "#8C8C8C";
    return `<svg width="28" height="20" viewBox="0 0 60 40" fill="${color}"><path d="M48.6 25.6c.2-.8.1-1.5-.2-2-.3-.4-.8-.7-1.4-.7h-31c-.3 0-.5-.1-.6-.3-.1-.2-.1-.4 0-.6.2-.5.6-.9 1.1-1 .2 0 .3-.1.4-.2l.2-.4c1.2-4.2 5-7.2 9.5-7.2 3.3 0 6.2 1.6 8 4 .2.3.5.4.8.3 1.2-.4 2.5-.3 3.6.3 1.1.6 1.9 1.5 2.3 2.7.1.3.3.5.6.5 3 .3 5.3 2.5 5.7 5.4v.2c0 .3.2.5.4.6.2.1.5 0 .6-.2l-.1.1c.8-1.7 1-1.5.1-.5z"/><path d="M41.7 27h-26c-3.1 0-5.7-2.5-5.7-5.7 0-3 2.3-5.4 5.2-5.6C16.4 11.5 20 8 24.4 8c3.1 0 5.9 1.8 7.3 4.5 1-.6 2.2-.9 3.4-.9 3.5 0 6.4 2.8 6.6 6.2C45 18.6 47.5 21.5 47.5 25c0 1.1-.9 2-2 2h-3.8z" opacity=".7"/></svg>`;
  }

  function renderStatus() {
    const main = document.getElementById("mainContent");
    if (!main) return;
    const s = status;
    const active = s.bypassActive;
    const paused = s.mode === "paused";
    const heroClass = paused ? "grey" : (active ? "amber" : "green");
    const heroKicker = paused ? t("status.paused") : (active ? t("status.bypass_active") : t("status.bypass_inactive"));
    const heroTitle = paused ? t("status.dns_frozen") : (active ? t("status.proxy_off") : t("status.proxy_on"));

    let heroDetail = "";
    switch (s.mode) {
      case "auto":
        heroDetail = active ? t("status.auto_reason", { count: s.blockedIsps || 0 }) : t("status.no_changes");
        break;
      case "force_off":
        heroDetail = t("status.force_off_reason");
        break;
      case "force_on":
        heroDetail = t("status.force_on_reason");
        break;
      case "paused":
        heroDetail = t("status.paused_reason");
        break;
    }

    const modes = ["auto", "force_off", "force_on", "paused"];

    const feedStatus = s.stats?.feedStale
      ? `<span class="pill pill-off"><span class="pill-dot"></span>Feed obsoleto</span>`
      : (s.stats?.blockedIps > 0
        ? `<span class="pill pill-off"><span class="pill-dot"></span>Bloqueos detectados</span>`
        : `<span class="pill pill-on"><span class="pill-dot"></span>Sin bloqueos</span>`);

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1>${t("status.title")}</h1>
          ${s.lastCheck ? `<p>${t("status.last_check")} ${timeAgo(s.lastCheck)}</p>` : ""}
        </div>
        <button class="btn" onclick="App.forceCheck()">${t("status.check_now")}</button>
      </div>

      <div class="hero ${heroClass}">
        <div style="display:flex;align-items:center;gap:16px">
          <div class="hero-dot">
            ${cfCloud(!active)}
          </div>
          <div>
            <div class="hero-kicker">${heroKicker}</div>
            <div class="hero-title">${heroTitle}</div>
          </div>
        </div>
        <div class="hero-detail">${heroDetail}</div>
      </div>

      <div class="card feed-card">
        <div class="section-header">
          <h2 class="section-sub">hayahora.futbol</h2>
          ${feedStatus}
        </div>
        <div class="stats-grid" style="margin-top:12px">
          <div class="stat-card">
            <span class="stat-label">${t("feed.blocked_ips")}</span>
            <span class="stat-value ${(s.stats?.blockedIps || 0) > 0 ? "stat-warn" : ""}">${s.stats?.blockedIps ?? 0}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">${t("feed.isps_blocking")}</span>
            <span class="stat-value ${(s.stats?.blockedIsps || 0) > 0 ? "stat-warn" : ""}">${s.stats?.blockedIsps ?? 0}</span>
            ${s.stats?.ispNames?.length ? `<span class="stat-detail">${s.stats.ispNames.join(", ")}</span>` : ""}
          </div>
          <div class="stat-card">
            <span class="stat-label">${t("feed.feed_updated")}</span>
            <span class="stat-value">${s.stats?.feedAge ? Math.round(s.stats.feedAge) + "m" : "--"}</span>
            <span class="stat-detail">${s.stats?.feedStale ? t("feed.stale") : t("feed.fresh")}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">${t("feed.cooldown")}</span>
            <span class="stat-value">${s.cooldownMinutes || 0}m</span>
            <span class="stat-detail">${t("feed.before_reactivate")}</span>
          </div>
        </div>
      </div>

      <div>
        <h2 class="section-sub">${t("modes.title")}</h2>
        <div class="mode-grid" style="margin-top:8px">
          ${modes.map((m) => `
            <button class="mode-btn ${s.mode === m ? "active" : ""}" onclick="App.setMode('${m}')">
              <span class="mode-label">${t("modes." + m)}</span>
              <span class="mode-help">${t("modes." + m + "_help")}</span>
            </button>
          `).join("")}
        </div>
      </div>

      ${renderDnsTable(s.domainResults || s.domains || [])}
      ${renderRecentActivity(s.recentLogs || [])}
    `;
  }

  function renderDnsTable(domains) {
    if (!domains.length) return "";
    return `
      <div>
        <div class="section-header">
          <h2 class="section-sub">${t("dns.title")}</h2>
          <button class="btn btn-secondary btn-sm" onclick="App.navigate('domains')">${t("dns.edit_domains")}</button>
        </div>
        <div class="table-wrap" style="margin-top:8px">
          <table>
            <thead>
              <tr>
                <th>${t("dns.record")}</th>
                <th>${t("dns.type")}</th>
                <th>${t("dns.proxy_cf")}</th>
                <th>${t("dns.ip_in_feed")}</th>
                <th>${t("dns.reason")}</th>
              </tr>
            </thead>
            <tbody>
              ${domains.map((d) => `
                <tr>
                  <td class="mono">${esc(d.fullname || d.record || d.domain)}</td>
                  <td>${esc(d.type || "A")}</td>
                  <td><span class="cf-proxy-icon" title="${d.proxy !== false ? "Proxy ON" : "Proxy OFF"}">${cfCloud(d.proxy !== false)}</span> <span class="pill ${d.proxy !== false ? "pill-on" : "pill-off"}"><span class="pill-dot"></span>${d.proxy !== false ? t("dns.on") : t("dns.off")}</span></td>
                  <td><span class="pill ${d.blocked ? "pill-off" : "pill-on"}"><span class="pill-dot"></span>${d.blocked ? t("dns.blocked") : t("dns.clear")}</span></td>
                  <td><span class="tag tag-bypass">${esc(d.reason || "--")}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function renderRecentActivity(logs) {
    if (!logs.length) return "";
    return `
      <div>
        <div class="section-header">
          <h2 class="section-sub">${t("activity.title")}</h2>
          <button class="btn btn-secondary btn-sm" onclick="App.navigate('logs')">${t("activity.full_log")}</button>
        </div>
        <ul class="activity-list" style="margin-top:8px">
          ${logs.slice(0, 8).map((l) => `
            <li class="activity-item">
              <span class="activity-time">${formatTime(l.created_at)}</span>
              <span><span class="tag tag-${l.type || "cron"}">${esc(l.type || "cron")}</span> ${esc(l.message)}</span>
            </li>
          `).join("")}
        </ul>
      </div>`;
  }

  // ── Domains & Settings view ───────────────────────────────────
  async function loadDomains(container) {
    _deletedDomainIds = [];
    container.innerHTML = `<p>${t("common.loading")}</p>`;
    try {
      const [domains, settings, cf] = await Promise.all([
        api("GET", "/domains"),
        api("GET", "/settings"),
        api("GET", "/cloudflare"),
      ]);
      renderDomainSettings(container, domains, settings, cf);
    } catch (err) {
      container.innerHTML = `<div class="alert-error">${esc(err.message)}</div>`;
    }
  }

  function renderDomainSettings(container, domains, settings, cf) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>${t("domains.title")}</h1>
          <p>${t("domains.subtitle")}</p>
        </div>
      </div>

      <!-- Import panel (at top) -->
      <div id="dnsImportPanel" hidden></div>

      <!-- Domains table -->
      <div class="card">
        <div class="section-header">
          <h2 class="section-sub">${t("domains.watched_records")}</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" onclick="App.showImportDns()">
              ${cfCloud(true)} Importar desde CF
            </button>
            <button class="btn btn-sm" onclick="App.addDomainRow()">+ ${t("domains.add")}</button>
          </div>
        </div>
        ${domains.length ? `<p class="hint" style="margin:4px 0 0">Solo los dominios con el toggle activado se gestionan durante el bypass.</p>` : ""}
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead>
              <tr>
                <th style="width:50px">Activo</th>
                <th>${t("domains.domain")}</th>
                <th>${t("domains.record")}</th>
                <th>${t("domains.type")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="domainRows">
              ${domains.map((d) => renderDomainRow(d)).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Behavior settings -->
      <div class="card">
        <h2 class="section-sub">${t("domains.behavior")}</h2>
        <div class="form-grid" style="margin-top:12px">
          <div class="form-group">
            <label class="label">${t("domains.interval")}</label>
            <div class="form-row">
              <input class="input" id="settInterval" type="number" min="30" value="${settings.interval_seconds || 300}">
              <span class="form-suffix">s</span>
            </div>
          </div>
          <div class="form-group">
            <label class="label">${t("domains.min_isps")}</label>
            <input class="input" id="settMinIsps" type="number" min="1" value="${settings.min_isps_blocked || 2}">
          </div>
          <div class="form-group">
            <label class="label">${t("domains.cooldown_label")}</label>
            <div class="form-row">
              <input class="input" id="settCooldown" type="number" min="0" value="${settings.cooldown_minutes || 15}">
              <span class="form-suffix">min</span>
            </div>
          </div>
          <div class="form-group">
            <label class="label">${t("domains.stale_after")}</label>
            <div class="form-row">
              <input class="input" id="settStale" type="number" min="1" value="${settings.stale_threshold_hours || 2}">
              <span class="form-suffix">h</span>
            </div>
          </div>
        </div>
      </div>

      <!-- CF Credentials -->
      <div class="card">
        <div class="section-header">
          <div>
            <h2 class="section-sub">${t("domains.cf_credentials")}</h2>
            <span class="hint">${t("domains.cf_credentials_hint")}</span>
          </div>
          <button class="btn btn-sm" onclick="App.showAddCfCredential()">+ ${t("domains.add_credential") || "Añadir"}</button>
        </div>
        <div id="cfCredentialsList" style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
          ${(Array.isArray(cf) ? cf : (cf ? [cf] : [])).map((c) => `
            <div class="cf-cred-card" data-cred-id="${c.id}">
              <div class="cf-cred-header">
                <div class="cf-cred-info">
                  ${cfCloud(true)}
                  <div>
                    <strong>${esc(c.label || "Cuenta " + c.id)}</strong>
                    <span class="cf-cred-meta">${esc(c.auth_type || "token")} &middot; Zone: ${esc(c.zone_id ? c.zone_id.substring(0, 8) + "..." : "--")}</span>
                  </div>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-secondary btn-sm" onclick="App.editCfCredential(${c.id})">Editar</button>
                  <button class="btn btn-danger btn-sm" onclick="App.deleteCfCredential(${c.id})">Eliminar</button>
                </div>
              </div>
              ${c.email ? `<span class="hint" style="margin:0">${esc(c.email)}</span>` : ""}
            </div>
          `).join("") || `<p class="hint">No hay credenciales configuradas</p>`}
        </div>
      </div>

      <div id="cfCredForm" hidden></div>

      <div class="save-bar">
        <button class="btn" onclick="App.saveDomainSettings()">${t("domains.save")}</button>
      </div>
    `;
  }

  function renderDomainRow(d) {
    const isNew = d.id === "new";
    const enabled = d.enabled !== 0 && d.enabled !== false;
    return `
      <tr data-id="${d.id}">
        <td style="text-align:center">
          <input type="checkbox" class="domain-enabled" data-field="enabled" ${enabled ? "checked" : ""} ${isNew ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--accent)">
        </td>
        <td><input class="input" value="${esc(d.domain)}" data-field="domain"></td>
        <td><input class="input" value="${esc(d.record || "")}" data-field="record"></td>
        <td>
          <select class="select" data-field="type">
            <option value="A" ${d.type === "A" ? "selected" : ""}>A</option>
            <option value="AAAA" ${d.type === "AAAA" ? "selected" : ""}>AAAA</option>
            <option value="CNAME" ${d.type === "CNAME" ? "selected" : ""}>CNAME</option>
          </select>
        </td>
        <td><button class="btn btn-danger btn-sm" onclick="App.removeDomainRow(this)">${t("domains.remove")}</button></td>
      </tr>`;
  }

  // ── Notifications view ────────────────────────────────────────
  async function loadNotifications(container) {
    container.innerHTML = `<p>${t("common.loading")}</p>`;
    try {
      const [notifs, types] = await Promise.all([
        api("GET", "/notifications"),
        api("GET", "/notifications/types"),
      ]);
      renderNotifications(container, notifs, types);
    } catch (err) {
      container.innerHTML = `<div class="alert-error">${esc(err.message)}</div>`;
    }
  }

  function renderNotifications(container, notifs, types) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>${t("notifications.title")}</h1>
          <p>${t("notifications.subtitle")}</p>
        </div>
        <button class="btn" onclick="App.showAddNotification()">${t("notifications.add")}</button>
      </div>
      <div id="notifList" style="display:flex;flex-direction:column;gap:12px">
        ${notifs.length ? notifs.map((n) => renderNotifCard(n)).join("") : `<p class="hint">${t("common.no_data")}</p>`}
      </div>
      <div id="notifForm" hidden></div>
    `;
    window._notifTypes = types;
  }

  function renderNotifCard(n) {
    const events = ["bypass_activate", "bypass_deactivate", "error", "feed_stale"];
    const activeEvents = n.events ? (typeof n.events === "string" ? JSON.parse(n.events) : n.events) : [];
    return `
      <div class="notif-card">
        <div class="notif-header">
          <div>
            <strong>${esc(n.name)}</strong>
            <span class="notif-type">${esc(n.type)}</span>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="App.testNotif(${n.id})">${t("notifications.test")}</button>
            <button class="btn btn-secondary btn-sm" onclick="App.editNotif(${n.id})">${t("common.edit")}</button>
            <button class="btn btn-danger btn-sm" onclick="App.deleteNotif(${n.id})">${t("notifications.delete")}</button>
          </div>
        </div>
        <div class="notif-events">
          ${events.map((e) => `<span class="notif-event ${activeEvents.includes(e) ? "on" : ""}">${esc(e)}</span>`).join("")}
        </div>
      </div>`;
  }

  // ── Logs view ─────────────────────────────────────────────────
  async function loadLogs(container) {
    container.innerHTML = `<p>${t("common.loading")}</p>`;
    try {
      const [logs, counts] = await Promise.all([
        api("GET", "/logs?limit=200"),
        api("GET", "/logs/counts"),
      ]);
      renderLogs(container, logs, counts);
    } catch (err) {
      container.innerHTML = `<div class="alert-error">${esc(err.message)}</div>`;
    }
  }

  function renderLogs(container, logs, counts) {
    const filters = [
      { key: "all", label: t("logs.filter_all"), count: counts.total || logs.length },
      { key: "cron", label: t("logs.filter_cron"), count: counts.cron || 0 },
      { key: "bypass", label: t("logs.filter_bypass"), count: counts.bypass || 0 },
      { key: "notification", label: t("logs.filter_notification"), count: counts.notification || 0 },
      { key: "panel", label: t("logs.filter_panel"), count: counts.panel || 0 },
      { key: "error", label: t("logs.filter_error"), count: counts.error || 0 },
    ];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>${t("logs.title")}</h1>
          <p>${t("logs.subtitle", { days: "7" })}</p>
        </div>
      </div>
      <div class="filter-group">
        ${filters.map((f) => `
          <button class="filter-btn ${f.key === "all" ? "active" : ""}" data-filter="${f.key}" onclick="App.filterLogs('${f.key}')">
            ${f.label} <span class="filter-count">${f.count}</span>
          </button>
        `).join("")}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("logs.time")}</th>
              <th>${t("logs.type")}</th>
              <th>${t("logs.message")}</th>
            </tr>
          </thead>
          <tbody id="logList">
            ${logs.map((l) => renderLogRow(l)).join("")}
          </tbody>
        </table>
      </div>`;
    window._allLogs = logs;
  }

  function renderLogRow(l) {
    return `
      <tr data-type="${esc(l.type || "cron")}">
        <td class="mono" style="white-space:nowrap">${formatTime(l.created_at)}</td>
        <td><span class="tag tag-${l.type || "cron"}">${esc(l.type || "cron")}</span></td>
        <td>${esc(l.message)}</td>
      </tr>`;
  }

  // ── Security view ─────────────────────────────────────────────
  async function loadSecurity(container) {
    container.innerHTML = `<p>${t("common.loading")}</p>`;
    try {
      const [keys, audit, cfStatus] = await Promise.all([
        api("GET", "/api-keys"),
        api("GET", "/audit?limit=50"),
        api("GET", "/cloudflared/status").catch(() => ({ available: false })),
      ]);
      renderSecurity(container, keys, audit, cfStatus);
    } catch (err) {
      container.innerHTML = `<div class="alert-error">${esc(err.message)}</div>`;
    }
  }

  function renderSecurity(container, keys, audit, cfStatus) {
    container.innerHTML = `
      <div class="page-header">
        <h1>${t("security.title")}</h1>
      </div>

      <!-- 2FA -->
      <div class="card">
        <h2 class="section-sub">${t("security.two_factor")}</h2>
        <p class="hint">${t("security.two_factor_desc")}</p>
        <div style="margin-top:12px" id="twoFactorSection">
          <button class="btn btn-sm" onclick="App.setup2FA()">${t("security.enable_2fa")}</button>
        </div>
        <div id="qrSection" hidden></div>
      </div>

      <!-- Change password -->
      <div class="card">
        <h2 class="section-sub">${t("security.change_password")}</h2>
        <div class="form-grid" style="margin-top:12px">
          <div class="form-group">
            <label class="label">${t("security.current_password")}</label>
            <input class="input" id="curPass" type="password">
          </div>
          <div class="form-group">
            <label class="label">${t("security.new_password")}</label>
            <input class="input" id="newPass" type="password" minlength="8">
          </div>
        </div>
        <div style="margin-top:12px">
          <button class="btn btn-sm" onclick="App.changePassword()">${t("security.change_btn")}</button>
          <span id="passResult" class="hint"></span>
        </div>
      </div>

      <!-- API Keys -->
      <div class="card">
        <div class="section-header">
          <div>
            <h2 class="section-sub">${t("security.api_keys")}</h2>
            <p class="hint">${t("security.api_keys_desc")}</p>
          </div>
          <button class="btn btn-sm" onclick="App.createApiKey()">${t("security.create_key")}</button>
        </div>
        <div id="newKeyResult" hidden class="alert-success" style="margin-top:12px"></div>
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead>
              <tr>
                <th>${t("security.key_name")}</th>
                <th>${t("security.key_permissions")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="apiKeyRows">
              ${keys.map((k) => `
                <tr>
                  <td>${esc(k.name)}</td>
                  <td>${(k.permissions || []).map((p) => `<span class="tag tag-panel">${esc(p)}</span>`).join(" ")}</td>
                  <td><button class="btn btn-danger btn-sm" onclick="App.revokeApiKey(${k.id})">${t("security.delete_key")}</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Cloudflare Tunnel -->
      <div class="card">
        <h2 class="section-sub">${t("security.tunnel_title")}</h2>
        <p class="hint">${t("security.tunnel_desc")}</p>
        ${!cfStatus.available ? `
          <div class="alert-warn" style="margin-top:12px">${t("security.tunnel_not_available")}</div>
        ` : `
          <div class="form-grid" style="margin-top:12px">
            <div class="form-group" style="grid-column:1/-1">
              <label class="label">${t("security.tunnel_token")}</label>
              <input class="input" id="cfTunnelToken" type="password" placeholder="eyJhIjoi..." value="">
            </div>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${cfStatus.running
              ? `<button class="btn btn-danger btn-sm" onclick="App.stopTunnel()">${t("security.tunnel_stop")}</button>
                 <span class="tag tag-ok">${t("security.tunnel_running")}</span>`
              : `<button class="btn btn-sm" onclick="App.startTunnel()">${t("security.tunnel_start")}</button>
                 <span class="tag tag-muted">${t("security.tunnel_stopped")}</span>`
            }
            ${cfStatus.error ? `<span class="hint" style="color:var(--red)">${esc(cfStatus.error)}</span>` : ""}
          </div>
          <p class="hint" style="margin-top:12px">
            ${t("security.tunnel_help")}
          </p>
        `}
      </div>

      <!-- Audit log -->
      <div class="card">
        <h2 class="section-sub">${t("security.audit_log")}</h2>
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead>
              <tr>
                <th>${t("security.audit_time")}</th>
                <th>${t("security.audit_action")}</th>
                <th>${t("security.audit_detail")}</th>
                <th>${t("security.audit_ip")}</th>
              </tr>
            </thead>
            <tbody>
              ${audit.map((a) => `
                <tr>
                  <td class="mono" style="white-space:nowrap">${formatTime(a.created_at)}</td>
                  <td><span class="tag tag-panel">${esc(a.action)}</span></td>
                  <td>${esc(a.detail || "--")}</td>
                  <td class="mono">${esc(a.ip || "--")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── About view ────────────────────────────────────────────────
  async function loadAbout(container) {
    container.innerHTML = `<p>${t("common.loading")}</p>`;
    try {
      const info = await api("GET", "/about");
      renderAbout(container, info);
    } catch (err) {
      container.innerHTML = `<div class="alert-error">${esc(err.message)}</div>`;
    }
  }

  function renderAbout(container, info) {
    const uptime = formatUptime(info.uptime);
    const mem = Math.round((info.memoryUsage?.rss || 0) / 1048576);
    container.innerHTML = `
      <div class="page-header">
        <h1>${t("about.title")}</h1>
      </div>

      <div class="about-hero card">
        <div style="text-align:center;padding:24px 0">
          <img src="/img/logo.png" alt="CF Football Bypass" style="width:96px;height:auto;margin-bottom:12px">
          <h2 style="margin:0;font-size:22px;font-weight:700">CF Football Bypass</h2>
          <p style="margin:4px 0 0;color:var(--text-muted)">v${esc(info.version)}</p>
        </div>
      </div>

      ${info.updateAvailable ? `
      <div class="alert-warn" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:8px;margin-bottom:0">
        <span style="font-size:18px">&#9888;</span>
        <div style="flex:1">
          <strong>${t("about.update_new") || "Nueva versión disponible"}: v${esc(info.latestVersion)}</strong>
          <div style="font-size:13px;margin-top:2px;opacity:.85">${t("about.update_current") || "Versión actual"}: v${esc(info.version)}</div>
        </div>
        <a href="${esc(info.releaseUrl)}" target="_blank" rel="noopener" class="btn btn-sm" style="white-space:nowrap">${t("about.update_view") || "Ver release"}</a>
      </div>
      ` : ""}

      <div class="card">
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">${t("about.node")}</span>
            <span class="stat-value" style="font-size:20px">${esc(info.nodeVersion)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">${t("about.platform")}</span>
            <span class="stat-value" style="font-size:20px">${esc(info.platform)} ${esc(info.arch)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">${t("about.uptime")}</span>
            <span class="stat-value" style="font-size:20px">${uptime}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">${t("about.memory")}</span>
            <span class="stat-value" style="font-size:20px">${mem} MB</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">${t("about.database")}</span>
            <span class="stat-value" style="font-size:20px">${esc(info.dbType || "SQLite")}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 class="section-sub">${t("about.credits")}</h2>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:12px">
          <div>
            <strong>Jose Manuel Pedraja</strong>
            <div><a href="https://github.com/JoseManuelPedraja/cffootballbypass-docker" target="_blank" rel="noopener">github.com/JoseManuelPedraja/cffootballbypass-docker</a></div>
          </div>
          <div style="color:var(--text-secondary);font-size:14px;margin-top:8px">
            <p style="margin:0 0 4px">${t("about.credits_feed")}</p>
            <p style="margin:0 0 4px">${t("about.credits_original")}</p>
            <p style="margin:0">${t("about.credits_community")}</p>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 class="section-sub">${t("about.translate")}</h2>
        <p class="hint">${t("about.translate_desc")}</p>
      </div>
    `;
  }

  // ── Actions ───────────────────────────────────────────────────
  async function forceCheck() {
    try {
      status = await api("POST", "/bypass/check");
      renderStatus();
    } catch {}
  }

  async function setMode(mode) {
    try {
      await api("POST", "/bypass/mode", { mode });
      status.mode = mode;
      renderStatus();
    } catch {}
  }

  async function logout() {
    try { await api("POST", "/auth/logout"); } catch {}
    user = null;
    if (socket) socket.disconnect();
    navigate("login");
  }

  function addDomainRow() {
    const tbody = document.getElementById("domainRows");
    if (!tbody) return;
    tbody.insertAdjacentHTML("beforeend", renderDomainRow({ id: "new", domain: "", record: "", type: "A" }));
  }

  function removeDomainRow(btn) {
    const tr = btn.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    if (id && id !== "new") _deletedDomainIds.push(parseInt(id, 10));
    tr.remove();
  }

  async function saveDomainSettings() {
    try {
      await api("PUT", "/settings", {
        interval_seconds: parseInt(document.getElementById("settInterval").value, 10),
        min_isps_blocked: parseInt(document.getElementById("settMinIsps").value, 10),
        cooldown_minutes: parseInt(document.getElementById("settCooldown").value, 10),
        stale_threshold_hours: parseInt(document.getElementById("settStale").value, 10),
      });

      for (const id of _deletedDomainIds) {
        await api("DELETE", `/domains/${id}`);
      }
      _deletedDomainIds = [];

      const rows = document.querySelectorAll("#domainRows tr");
      for (const row of rows) {
        const id = row.dataset.id;
        const domain = row.querySelector("[data-field=domain]")?.value;
        const record = row.querySelector("[data-field=record]")?.value;
        const type = row.querySelector("[data-field=type]")?.value;
        const enabled = row.querySelector("[data-field=enabled]")?.checked;
        if (!domain) continue;
        if (id === "new") {
          await api("POST", "/domains", { domain, record, type });
        } else {
          await api("PUT", `/domains/${id}`, { domain, record, type, enabled });
        }
      }

      showToast(t("common.success"));
      navigate("domains");
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function showAddCfCredential(editData) {
    const form = document.getElementById("cfCredForm");
    if (!form) return;
    form.hidden = false;
    const isEdit = !!editData;
    form.innerHTML = `
      <div class="card" style="margin-top:12px;border-color:var(--accent)">
        <h2 class="section-sub">${isEdit ? "Editar cuenta Cloudflare" : "Nueva cuenta Cloudflare"}</h2>
        <div class="form-grid" style="margin-top:12px">
          <div class="form-group">
            <label class="label">Nombre / Etiqueta</label>
            <input class="input" id="cfLabel" value="${esc(editData?.label || "")}">
          </div>
          <div class="form-group">
            <label class="label">${t("domains.auth_type")}</label>
            <select class="select" id="cfAuthType">
              <option value="token" ${(editData?.auth_type || "token") === "token" ? "selected" : ""}>API Token</option>
              <option value="global" ${editData?.auth_type === "global" ? "selected" : ""}>Global Key</option>
              <option value="account_token" ${editData?.auth_type === "account_token" ? "selected" : ""}>Account Token</option>
            </select>
          </div>
          <div class="form-group">
            <label class="label">${t("domains.api_token")}</label>
            <input class="input" id="cfToken" type="password" placeholder="${editData?.has_token ? "••••••••" : ""}">
          </div>
          <div class="form-group">
            <label class="label">${t("domains.zone_id")}</label>
            <input class="input" id="cfZoneId" value="${esc(editData?.zone_id || "")}">
          </div>
          <div class="form-group">
            <label class="label">${t("domains.email")}</label>
            <input class="input" id="cfEmail" value="${esc(editData?.email || "")}">
          </div>
          <div class="form-group">
            <label class="label">${t("domains.account_id")}</label>
            <input class="input" id="cfAccountId" value="${esc(editData?.account_id || "")}">
          </div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="App.saveCfCredential(${editData?.id || "null"})">Guardar</button>
          <button class="btn btn-secondary btn-sm" onclick="App.testCfForm(${editData?.id || "null"})">Probar conexión</button>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('cfCredForm').hidden=true">Cancelar</button>
          <span id="cfTestResult" class="hint"></span>
        </div>
      </div>`;
  }

  async function saveCfCredential(id) {
    const token = document.getElementById("cfToken").value;
    const zoneId = document.getElementById("cfZoneId").value;
    if (!token && !id) { showToast("API Token requerido", true); return; }
    if (!zoneId) { showToast("Zone ID requerido", true); return; }
    try {
      await api("PUT", "/cloudflare", {
        id: id || undefined,
        label: document.getElementById("cfLabel").value || undefined,
        auth_type: document.getElementById("cfAuthType").value,
        api_token: token || undefined,
        zone_id: zoneId,
        email: document.getElementById("cfEmail").value || undefined,
        account_id: document.getElementById("cfAccountId").value || undefined,
      });
      showToast(t("common.success"));
      navigate("domains");
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function editCfCredential(id) {
    try {
      const creds = await api("GET", "/cloudflare");
      const cred = creds.find((c) => c.id === id);
      if (cred) showAddCfCredential(cred);
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function deleteCfCredential(id) {
    if (!confirm("Eliminar esta cuenta y TODOS sus dominios asociados?")) return;
    try {
      const res = await api("DELETE", `/cloudflare/${id}`);
      showToast(`Cuenta eliminada (${res.domainsDeleted || 0} dominios borrados)`);
      navigate("domains");
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function testCfForm(credId) {
    const result = document.getElementById("cfTestResult");
    if (!result) return;
    result.textContent = t("common.loading");
    try {
      const res = await api("POST", "/cloudflare/test", {
        id: credId || undefined,
        auth_type: document.getElementById("cfAuthType").value,
        api_token: document.getElementById("cfToken").value || undefined,
        zone_id: document.getElementById("cfZoneId").value,
        email: document.getElementById("cfEmail").value,
        account_id: document.getElementById("cfAccountId").value,
      });
      result.textContent = t("domains.connection_ok", { zone: res.zone || "" });
      result.className = "hint";
    } catch (err) {
      result.textContent = err.message;
      result.className = "hint hint-amber";
    }
  }

  async function showImportDns() {
    const panel = document.getElementById("dnsImportPanel");
    if (!panel) return;
    panel.hidden = false;
    try {
      const creds = await api("GET", "/cloudflare");
      if (!creds.length) {
        panel.innerHTML = `<div class="card" style="border-color:var(--amber)"><p>Primero configura una cuenta de Cloudflare arriba.</p></div>`;
        return;
      }
      panel.innerHTML = `
        <div class="card" style="border-color:var(--accent)">
          <div class="section-header">
            <h2 class="section-sub">${cfCloud(true)} Importar registros DNS</h2>
            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('dnsImportPanel').hidden=true">Cerrar</button>
          </div>
          <div class="form-group" style="margin-top:12px;max-width:300px">
            <label class="label">Cuenta Cloudflare</label>
            <select class="select" id="importCfCred">
              ${creds.map((c) => `<option value="${c.id}">${esc(c.label || "Cuenta " + c.id)} (${esc(c.zone_id ? c.zone_id.substring(0, 8) + "..." : "")})</option>`).join("")}
            </select>
          </div>
          <div style="margin-top:12px">
            <button class="btn btn-sm" onclick="App.fetchDnsRecords()">Cargar registros DNS</button>
          </div>
          <div id="dnsRecordsList" style="margin-top:12px"></div>
        </div>`;
    } catch (err) {
      panel.innerHTML = `<div class="alert-error">${esc(err.message)}</div>`;
    }
  }

  async function fetchDnsRecords() {
    const credId = document.getElementById("importCfCred")?.value;
    const list = document.getElementById("dnsRecordsList");
    if (!credId || !list) return;
    list.innerHTML = `<p>${t("common.loading")}</p>`;
    try {
      const records = await api("GET", `/cloudflare/${credId}/dns-records`);
      if (!records.length) {
        list.innerHTML = `<p class="hint">No se encontraron registros DNS (A/AAAA/CNAME).</p>`;
        return;
      }
      window._importRecords = records;
      window._importCredId = parseInt(credId, 10);
      list.innerHTML = `
        <div style="margin-bottom:10px;display:flex;gap:12px;align-items:center">
          <label style="font-size:14px;font-weight:600;cursor:pointer">
            <input type="checkbox" id="dnsSelectAll" onchange="App.toggleAllDns(this.checked)" style="margin-right:6px">
            Seleccionar todos (${records.length})
          </label>
          <span class="hint" id="dnsSelectedCount">0 seleccionados</span>
        </div>
        <div class="dns-import-grid">
          ${records.map((r, i) => `
            <label class="dns-import-item" data-idx="${i}">
              <input type="checkbox" class="dns-check" data-idx="${i}" onchange="App.updateDnsCount()">
              <div class="dns-import-info">
                <div class="dns-import-name">
                  ${cfCloud(r.proxied)}
                  <strong>${esc(r.name)}</strong>
                </div>
                <div class="dns-import-meta">
                  <span class="tag tag-panel">${esc(r.type)}</span>
                  <span class="mono">${esc(r.content)}</span>
                  <span class="pill ${r.proxied ? "pill-on" : "pill-off"}" style="font-size:11px">
                    <span class="pill-dot"></span>${r.proxied ? "Proxy ON" : "Proxy OFF"}
                  </span>
                </div>
              </div>
            </label>
          `).join("")}
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="App.importSelectedDns()">Importar seleccionados</button>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('dnsImportPanel').hidden=true">Cancelar</button>
        </div>`;
    } catch (err) {
      list.innerHTML = `<div class="alert-error">${esc(err.message)}</div>`;
    }
  }

  function toggleAllDns(checked) {
    document.querySelectorAll(".dns-check").forEach((cb) => { cb.checked = checked; });
    updateDnsCount();
  }

  function updateDnsCount() {
    const checked = document.querySelectorAll(".dns-check:checked").length;
    const el = document.getElementById("dnsSelectedCount");
    if (el) el.textContent = `${checked} seleccionados`;
  }

  async function importSelectedDns() {
    const records = window._importRecords || [];
    const credId = window._importCredId;
    const selected = [];
    document.querySelectorAll(".dns-check:checked").forEach((cb) => {
      const idx = parseInt(cb.dataset.idx, 10);
      if (records[idx]) selected.push(records[idx]);
    });
    if (!selected.length) { showToast("Selecciona al menos un registro", true); return; }
    try {
      const res = await api("POST", "/domains/import", {
        records: selected,
        cf_credential_id: credId,
      });
      showToast(`Importados: ${res.imported}, ya existían: ${res.skipped || 0}`);
      navigate("domains");
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function filterLogs(type) {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === type));
    document.querySelectorAll("#logList tr").forEach((row) => {
      row.hidden = type !== "all" && row.dataset.type !== type;
    });
  }

  async function setup2FA() {
    const section = document.getElementById("qrSection");
    section.hidden = false;
    section.innerHTML = `<p>${t("common.loading")}</p>`;
    try {
      const res = await api("POST", "/auth/2fa/generate");
      section.innerHTML = `
        <div class="qr-wrap">
          <p>${t("security.scan_qr")}</p>
          <img src="${res.qrCode}" alt="QR">
          <p>${t("security.manual_key")}</p>
          <div class="secret-key">${esc(res.secret)}</div>
        </div>
        <div class="form-group" style="max-width:300px;margin:12px auto">
          <label class="label">${t("security.verify_code")}</label>
          <input class="input" id="totpVerify" maxlength="6" inputmode="numeric">
        </div>
        <div style="text-align:center">
          <button class="btn btn-sm" onclick="App.verify2FA()">${t("security.verify")}</button>
        </div>`;
    } catch (err) {
      section.innerHTML = `<div class="alert-error">${esc(err.message)}</div>`;
    }
  }

  async function verify2FA() {
    const code = document.getElementById("totpVerify")?.value;
    try {
      await api("POST", "/auth/2fa/verify", { token: code });
      document.getElementById("qrSection").innerHTML = `<div class="alert-success">${t("security.2fa_enabled")}</div>`;
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function changePassword() {
    const cur = document.getElementById("curPass").value;
    const np = document.getElementById("newPass").value;
    const el = document.getElementById("passResult");
    try {
      await api("POST", "/auth/change-password", { current: cur, newPassword: np });
      el.textContent = t("common.success");
      el.className = "hint";
    } catch (err) {
      el.textContent = err.message;
      el.className = "hint hint-amber";
    }
  }

  async function createApiKey() {
    const name = prompt(t("security.key_name"));
    if (!name) return;
    try {
      const res = await api("POST", "/api-keys", { name, permissions: ["read", "metrics"] });
      const el = document.getElementById("newKeyResult");
      el.hidden = false;
      el.textContent = `${t("security.key_created")} ${res.key}`;
      navigate("security");
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function revokeApiKey(id) {
    try {
      await api("DELETE", `/api-keys/${id}`);
      navigate("security");
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function startTunnel() {
    try {
      const token = document.getElementById("cfTunnelToken")?.value?.trim();
      await api("POST", "/cloudflared/start", { token: token || undefined });
      showToast(t("security.tunnel_started"));
      navigate("security");
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function stopTunnel() {
    try {
      await api("POST", "/cloudflared/stop");
      showToast(t("security.tunnel_stopped"));
      navigate("security");
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function showAddNotification() {
    const types = window._notifTypes || [];
    const form = document.getElementById("notifForm");
    form.hidden = false;
    form.innerHTML = `
      <div class="card" style="margin-top:12px">
        <h2 class="section-sub">${t("notifications.add")}</h2>
        <div class="form-grid" style="margin-top:12px">
          <div class="form-group">
            <label class="label">${t("notifications.name")}</label>
            <input class="input" id="notifName">
          </div>
          <div class="form-group">
            <label class="label">${t("notifications.type")}</label>
            <select class="select" id="notifType" onchange="App.updateNotifFields()">
              ${types.map((t) => `<option value="${esc(t.type)}">${esc(t.name)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div id="notifConfigFields" class="form-grid" style="margin-top:12px"></div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn btn-sm" onclick="App.saveNotification()">${t("notifications.save")}</button>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('notifForm').hidden=true">${t("common.cancel")}</button>
        </div>
      </div>`;
    updateNotifFields();
  }

  function updateNotifFields() {
    const types = window._notifTypes || [];
    const sel = document.getElementById("notifType")?.value;
    const provider = types.find((t) => t.type === sel);
    const container = document.getElementById("notifConfigFields");
    if (!provider || !container) return;
    container.innerHTML = (provider.configFields || []).map((f) => `
      <div class="form-group">
        <label class="label">${esc(f.label)}</label>
        <input class="input" data-config="${esc(f.key)}" type="${f.secret ? "password" : "text"}" placeholder="${esc(f.placeholder || "")}" ${f.required ? "required" : ""}>
        ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}
      </div>
    `).join("");
  }

  async function saveNotification() {
    const name = document.getElementById("notifName")?.value;
    const type = document.getElementById("notifType")?.value;
    const config = {};
    document.querySelectorAll("#notifConfigFields [data-config]").forEach((el) => {
      config[el.dataset.config] = el.value;
    });
    try {
      await api("POST", "/notifications", {
        name, type, config,
        events: ["bypass_activate", "bypass_deactivate", "error", "feed_stale"],
        enabled: 1,
      });
      navigate("notifications");
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function testNotif(id) {
    try {
      const notifs = await api("GET", "/notifications");
      const n = notifs.find((x) => x.id === id);
      if (!n) return;
      await api("POST", "/notifications/test", { type: n.type, config: n.config });
      showToast(t("notifications.test_ok"));
    } catch (err) {
      showToast(t("notifications.test_fail", { error: err.message }), true);
    }
  }

  async function editNotif(id) {
    showToast("Edit: coming soon");
  }

  async function deleteNotif(id) {
    if (!confirm(t("notifications.delete_confirm"))) return;
    try {
      await api("DELETE", `/notifications/${id}`);
      navigate("notifications");
    } catch (err) {
      showToast(err.message, true);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  function esc(s) {
    if (s == null) return "";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function formatTime(ts) {
    if (!ts) return "--";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function timeAgo(ts) {
    if (!ts) return "--";
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return Math.round(diff) + "s";
    if (diff < 3600) return Math.round(diff / 60) + "m";
    return Math.round(diff / 3600) + "h";
  }

  function formatUptime(s) {
    if (!s) return "--";
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function showToast(msg, isError) {
    const existing = document.getElementById("toast");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.id = "toast";
    el.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;z-index:9999;transition:opacity .3s;
      background:${isError ? "var(--red-bg)" : "var(--green-bg)"};
      color:${isError ? "var(--red)" : "var(--green)"};
      border:1px solid ${isError ? "var(--red)" : "var(--green-border)"}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3000);
  }

  // ── Init ──────────────────────────────────────────────────────
  async function init() {
    setTheme(getTheme());
    let savedLang;
    try { savedLang = localStorage.getItem("cfb_lang"); } catch {}
    if (!savedLang) savedLang = (navigator.language || "en").startsWith("es") ? "es" : "en";
    await loadLang(savedLang);

    try {
      const setup = await fetch("/api/auth/setup-required");
      const { setupRequired } = await setup.json();
      if (setupRequired) { navigate("setup"); return; }
    } catch {}

    try {
      const me = await api("GET", "/auth/me");
      user = me.user;
      connectSocket();
      navigate("status");
    } catch {
      navigate("login");
    }
  }

  // ── Public API ────────────────────────────────────────────────
  return {
    init, navigate, toggleTheme, toggleSidebar, changeLang, logout,
    forceCheck, setMode,
    addDomainRow, removeDomainRow, saveDomainSettings,
    showAddCfCredential, saveCfCredential, editCfCredential, deleteCfCredential, testCfForm,
    showImportDns, fetchDnsRecords, toggleAllDns, updateDnsCount, importSelectedDns,
    filterLogs,
    setup2FA, verify2FA,
    changePassword,
    createApiKey, revokeApiKey, startTunnel, stopTunnel,
    showAddNotification, updateNotifFields, saveNotification,
    testNotif, editNotif, deleteNotif,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
