"use strict";

class GotifyProvider {
  static displayName = "Gotify";
  static icon = "gotify";
  static configFields = [
    { key: "serverUrl", label: "URL del servidor", type: "text", required: true, placeholder: "https://gotify.tudominio.com" },
    { key: "appToken", label: "App Token", type: "password", required: true },
    { key: "priority", label: "Prioridad", type: "number", default: 5 },
  ];

  constructor(config) {
    this.config = config;
  }

  async send(data) {
    const url = `${this.config.serverUrl.replace(/\/$/, "")}/message?token=${this.config.appToken}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        message: data.message,
        priority: parseInt(this.config.priority || "5", 10),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  }
}

module.exports = { GotifyProvider };
