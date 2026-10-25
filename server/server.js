"use strict";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");

const { Database } = require("./database");
const { Auth } = require("./auth");
const { BypassEngine } = require("./bypass");
const { NotificationManager } = require("./notification/manager");
const { apiRoutes } = require("./routes/api");
const { metricsRoutes } = require("./routes/metrics");
const { CloudflaredManager } = require("./cloudflared");

const PORT = parseInt(process.env.CFB_PORT || "3001", 10);
const HOST = process.env.CFB_HOST || "0.0.0.0";
const DATA_DIR = process.env.CFB_DATA_DIR || "/app/data";
const TRUST_PROXY = process.env.CFB_TRUST_PROXY || "false";
const SESSION_SECRET =
  process.env.CFB_SESSION_SECRET || crypto.randomBytes(32).toString("hex");

async function main() {
  console.log(`
┌─────────────────────────────────────────────┐
│   CF Football Bypass — Panel v3.0.0         │
│   Monitoring & Cloudflare proxy manager     │
└─────────────────────────────────────────────┘
`);

  // ── Database ──────────────────────────────────────────────────
  const db = new Database(DATA_DIR);
  await db.init();
  console.log("[DB] Initialized:", db.type);

  // ── Auth ──────────────────────────────────────────────────────
  const auth = new Auth(db);
  await auth.ensureAdmin();

  // ── Notifications ─────────────────────────────────────────────
  const notifications = new NotificationManager(db);

  // ── Bypass engine ─────────────────────────────────────────────
  const bypass = new BypassEngine(db, notifications);

  // ── Cloudflared tunnel ────────────────────────────────────────
  const cloudflared = new CloudflaredManager(db);

  // ── Express ───────────────────────────────────────────────────
  const app = express();
  const server = http.createServer(app);

  if (TRUST_PROXY === "true" || TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
  }

  // ── Security middleware ───────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "wss:", "ws:"],
        },
      },
      hsts: { maxAge: 0 },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // ── Session ───────────────────────────────────────────────────
  const sessionMiddleware = session({
    secret: SESSION_SECRET,
    name: "cfb.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: TRUST_PROXY === "true" || TRUST_PROXY === "1",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
    store: db.getSessionStore(),
  });
  app.use(sessionMiddleware);

  // ── Rate limiters ─────────────────────────────────────────────
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Demasiados intentos. Espera 15 minutos." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // ── Auth routes ───────────────────────────────────────────────
  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const { username, password, totp } = req.body;
      const result = await auth.login(username, password, totp, req.ip);
      if (result.requireTotp) {
        return res.json({ requireTotp: true });
      }
      if (!result.ok) {
        return res.status(401).json({ error: result.error });
      }
      req.session.userId = result.user.id;
      req.session.username = result.user.username;
      res.json({ ok: true, user: { username: result.user.username } });
    } catch (err) {
      console.error("[Auth]", err);
      res.status(500).json({ error: "Error interno" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("cfb.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "No autenticado" });
    }
    res.json({
      user: {
        id: req.session.userId,
        username: req.session.username,
      },
    });
  });

  app.get("/api/auth/setup-required", async (req, res) => {
    const needed = await auth.isSetupRequired();
    res.json({ setupRequired: needed });
  });

  app.post("/api/auth/setup", loginLimiter, async (req, res) => {
    try {
      const needed = await auth.isSetupRequired();
      if (!needed) {
        return res.status(400).json({ error: "Ya existe un administrador" });
      }
      const { username, password } = req.body;
      if (!username || !password || password.length < 8) {
        return res.status(400).json({
          error: "Usuario requerido. Contraseña mínimo 8 caracteres.",
        });
      }
      const user = await auth.createUser(username, password);
      req.session.userId = user.id;
      req.session.username = user.username;
      res.json({ ok: true, user: { username: user.username } });
    } catch (err) {
      console.error("[Auth]", err);
      res.status(500).json({ error: "Error creando usuario" });
    }
  });

  // 2FA setup
  app.post("/api/auth/2fa/generate", auth.requireAuth(), async (req, res) => {
    try {
      const result = await auth.generate2FA(req.session.userId);
      res.json(result);
    } catch (err) {
      console.error("[2FA]", err);
      res.status(500).json({ error: "Error generando 2FA" });
    }
  });

  app.post("/api/auth/2fa/verify", auth.requireAuth(), async (req, res) => {
    try {
      const { token } = req.body;
      const ok = await auth.verify2FA(req.session.userId, token);
      if (!ok) {
        return res.status(400).json({ error: "Código incorrecto" });
      }
      await auth.enable2FA(req.session.userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[2FA]", err);
      res.status(500).json({ error: "Error verificando 2FA" });
    }
  });

  app.post("/api/auth/2fa/disable", auth.requireAuth(), async (req, res) => {
    try {
      const { password } = req.body;
      const valid = await auth.verifyPassword(req.session.userId, password);
      if (!valid) {
        return res.status(401).json({ error: "Contraseña incorrecta" });
      }
      await auth.disable2FA(req.session.userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[2FA]", err);
      res.status(500).json({ error: "Error desactivando 2FA" });
    }
  });

  app.post(
    "/api/auth/change-password",
    auth.requireAuth(),
    async (req, res) => {
      try {
        const { current, newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) {
          return res
            .status(400)
            .json({ error: "Mínimo 8 caracteres" });
        }
        const valid = await auth.verifyPassword(req.session.userId, current);
        if (!valid) {
          return res.status(401).json({ error: "Contraseña actual incorrecta" });
        }
        await auth.changePassword(req.session.userId, newPassword);
        res.json({ ok: true });
      } catch (err) {
        console.error("[Auth]", err);
        res.status(500).json({ error: "Error cambiando contraseña" });
      }
    }
  );

  // ── API routes (authenticated) ────────────────────────────────
  app.use("/api", apiLimiter, apiRoutes(db, auth, bypass, notifications, cloudflared));

  // ── Prometheus metrics ────────────────────────────────────────
  app.use("/metrics", metricsRoutes(db, bypass));

  // ── Static files ──────────────────────────────────────────────
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use("/locales", express.static(path.join(__dirname, "..", "locales")));

  // SPA fallback
  app.get("*", (req, res) => {
    if (req.accepts("html")) {
      res.sendFile(path.join(__dirname, "..", "public", "index.html"));
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });

  // ── Socket.io ─────────────────────────────────────────────────
  const io = new Server(server, {
    cors: false,
    pingInterval: 25000,
    pingTimeout: 10000,
  });

  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  io.use((socket, next) => {
    if (socket.request.session && socket.request.session.userId) {
      next();
    } else {
      next(new Error("No autenticado"));
    }
  });

  io.on("connection", (socket) => {
    const username = socket.request.session.username;
    console.log(`[WS] ${username} connected`);

    socket.on("requestStatus", () => {
      socket.emit("status", bypass.getStatus());
    });

    socket.on("forceCheck", async () => {
      await bypass.runCheck();
      io.emit("status", bypass.getStatus());
    });

    socket.on("disconnect", () => {
      console.log(`[WS] ${username} disconnected`);
    });
  });

  bypass.on("statusChange", (status) => {
    io.emit("status", status);
  });

  bypass.on("log", (entry) => {
    io.emit("newLog", entry);
  });

  // ── Start ─────────────────────────────────────────────────────
  server.listen(PORT, HOST, () => {
    console.log(`[Server] http://${HOST}:${PORT}`);
    console.log(`[Server] Prometheus metrics: /metrics`);
    bypass.start().catch(err => console.error("[Bypass] Start error:", err));
    cloudflared.start().catch(err => console.error("[Cloudflared] Start error:", err));
  });

  // ── Graceful shutdown ─────────────────────────────────────────
  const shutdown = () => {
    console.log("\n[Server] Shutting down...");
    cloudflared.stop();
    bypass.stop();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
