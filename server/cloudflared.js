"use strict";

const { spawn } = require("child_process");
const { EventEmitter } = require("events");

class CloudflaredManager extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.process = null;
    this.running = false;
    this.url = null;
    this.error = null;
    this.restartCount = 0;
    this.restartTimer = null;
  }

  async start() {
    if (this.process) return;

    const enabled = await this.db.getSetting("cloudflared_enabled");
    if (enabled !== "1") return;

    const token = await this.db.getSetting("cloudflared_token");
    if (!token) {
      this.error = "No tunnel token configured";
      this.emit("status", this.getStatus());
      return;
    }

    this._spawn(token);
  }

  _spawn(token) {
    const args = ["tunnel", "run", "--token", token];

    try {
      this.process = spawn("cloudflared", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      this.error = `Failed to start cloudflared: ${err.message}`;
      this.running = false;
      this.emit("status", this.getStatus());
      return;
    }

    this.running = true;
    this.error = null;
    this.url = null;

    this.process.stderr.on("data", (data) => {
      const line = data.toString().trim();
      if (!line) return;

      const urlMatch = line.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
      if (urlMatch) {
        this.url = urlMatch[0];
        this.emit("status", this.getStatus());
      }

      const connMatch = line.match(/Registered tunnel connection/i);
      if (connMatch) {
        this.restartCount = 0;
        console.log("[Cloudflared] Tunnel connected");
        this.emit("status", this.getStatus());
      }

      if (line.includes("ERR") || line.includes("error")) {
        console.log(`[Cloudflared] ${line}`);
      }
    });

    this.process.stdout.on("data", (data) => {
      const line = data.toString().trim();
      if (line) console.log(`[Cloudflared] ${line}`);
    });

    this.process.on("close", (code) => {
      console.log(`[Cloudflared] Process exited with code ${code}`);
      this.process = null;
      this.running = false;

      if (code !== 0 && this.restartCount < 5) {
        this.restartCount++;
        const delay = Math.min(5000 * this.restartCount, 30000);
        console.log(`[Cloudflared] Restarting in ${delay / 1000}s (attempt ${this.restartCount})`);
        this.restartTimer = setTimeout(() => this.start(), delay);
      } else if (this.restartCount >= 5) {
        this.error = "Too many restarts — check your tunnel token";
      }

      this.emit("status", this.getStatus());
    });

    this.process.on("error", (err) => {
      this.error = err.message;
      this.running = false;
      this.process = null;
      this.emit("status", this.getStatus());
    });

    console.log("[Cloudflared] Tunnel starting...");
    this.emit("status", this.getStatus());
  }

  stop() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartCount = 5;

    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }

    this.running = false;
    this.url = null;
    this.error = null;
    this.emit("status", this.getStatus());
    console.log("[Cloudflared] Tunnel stopped");
  }

  async restart() {
    this.restartCount = 0;
    this.stop();
    await this.start();
  }

  getStatus() {
    return {
      running: this.running,
      url: this.url,
      error: this.error,
      available: this._isAvailable(),
    };
  }

  _isAvailable() {
    try {
      require("child_process").execSync("cloudflared --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { CloudflaredManager };
