"use strict";

const bcrypt = require("bcrypt");
const { TOTP, Secret } = require("otpauth");
const QRCode = require("qrcode");

const BCRYPT_ROUNDS = 12;

class Auth {
  constructor(db) {
    this.db = db;
  }

  async ensureAdmin() {
    const count = this.db.getUserCount();
    if (count === 0) {
      const envPass = process.env.ADMIN_PASSWORD;
      if (envPass) {
        const hash = await bcrypt.hash(envPass, BCRYPT_ROUNDS);
        this.db.createUser("admin", hash);
        console.log("[Auth] Admin user created from ADMIN_PASSWORD env");
      } else {
        console.log("[Auth] No users — setup wizard will run on first access");
      }
    }
  }

  async isSetupRequired() {
    return this.db.getUserCount() === 0;
  }

  async createUser(username, password) {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    return this.db.createUser(username, hash);
  }

  async login(username, password, totpToken, ip) {
    const user = this.db.getUserByUsername(username);
    if (!user) {
      await bcrypt.hash("dummy", BCRYPT_ROUNDS);
      return { ok: false, error: "Credenciales incorrectas" };
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      this.db.audit(user.id, "login_failed", "Bad password", ip);
      return { ok: false, error: "Credenciales incorrectas" };
    }

    if (user.totp_enabled) {
      if (!totpToken) {
        return { requireTotp: true };
      }
      const secret = this.db.getTotpSecret(user.id);
      if (!secret) {
        return { ok: false, error: "Error 2FA: secreto no encontrado" };
      }
      const totp = new TOTP({
        issuer: "CF Football Bypass",
        label: user.username,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secret),
      });
      const delta = totp.validate({ token: totpToken, window: 1 });
      if (delta === null) {
        this.db.audit(user.id, "login_failed", "Bad TOTP", ip);
        return { ok: false, error: "Código 2FA incorrecto" };
      }
    }

    this.db.audit(user.id, "login", null, ip);
    return { ok: true, user: { id: user.id, username: user.username } };
  }

  async generate2FA(userId) {
    const user = this.db.getUserById(userId);
    const secret = new Secret({ size: 20 });
    this.db.setTotpSecret(userId, secret.base32);

    const totp = new TOTP({
      issuer: "CF Football Bypass",
      label: user.username,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    const uri = totp.toString();
    const qr = await QRCode.toDataURL(uri);

    return { secret: secret.base32, uri, qr };
  }

  async verify2FA(userId, token) {
    const secretStr = this.db.getTotpSecret(userId);
    if (!secretStr) return false;

    const user = this.db.getUserById(userId);
    const totp = new TOTP({
      issuer: "CF Football Bypass",
      label: user.username,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretStr),
    });

    return totp.validate({ token, window: 1 }) !== null;
  }

  async enable2FA(userId) {
    this.db.enable2FA(userId);
    this.db.audit(userId, "2fa_enabled", null, null);
  }

  async disable2FA(userId) {
    this.db.disable2FA(userId);
    this.db.audit(userId, "2fa_disabled", null, null);
  }

  async verifyPassword(userId, password) {
    const user = this.db.getUserById(userId);
    if (!user) return false;
    return bcrypt.compare(password, user.password_hash);
  }

  async changePassword(userId, newPassword) {
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    this.db.updateUserPassword(userId, hash);
    this.db.audit(userId, "password_changed", null, null);
  }

  requireAuth() {
    return (req, res, next) => {
      if (req.session && req.session.userId) {
        return next();
      }
      res.status(401).json({ error: "No autenticado" });
    };
  }

  requireApiKey(permission = "read") {
    return (req, res, next) => {
      const header = req.headers.authorization;
      if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: "API key requerida" });
      }
      const key = header.substring(7);
      const apiKey = this.db.validateApiKey(key);
      if (!apiKey) {
        return res.status(401).json({ error: "API key inválida o expirada" });
      }
      if (!apiKey.permissions.includes(permission) && !apiKey.permissions.includes("admin")) {
        return res.status(403).json({ error: "Permiso insuficiente" });
      }
      req.apiKey = apiKey;
      next();
    };
  }
}

module.exports = { Auth };
