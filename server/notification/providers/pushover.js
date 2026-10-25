"use strict";

class PushoverProvider {
  static displayName = "Pushover";
  static icon = "pushover";
  static configFields = [
    { key: "userKey", label: "User Key", type: "password", required: true },
    { key: "appToken", label: "App Token", type: "password", required: true },
    { key: "priority", label: "Prioridad", type: "select", options: ["-2", "-1", "0", "1"], default: "0" },
    { key: "sound", label: "Sonido", type: "text", default: "pushover" },
  ];

  constructor(config) {
    this.config = config;
  }

  async send(data) {
    const resp = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: this.config.appToken,
        user: this.config.userKey,
        title: data.title,
        message: data.message,
        priority: parseInt(this.config.priority || "0", 10),
        sound: this.config.sound || "pushover",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  }
}

module.exports = { PushoverProvider };
