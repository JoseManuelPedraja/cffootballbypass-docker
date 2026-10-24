"use strict";

class DiscordProvider {
  static displayName = "Discord";
  static icon = "discord";
  static configFields = [
    { key: "webhookUrl", label: "Webhook URL", type: "password", required: true, placeholder: "https://discord.com/api/webhooks/..." },
    { key: "username", label: "Nombre del bot", type: "text", default: "CF Football Bypass" },
  ];

  constructor(config) {
    this.config = config;
  }

  async send(data) {
    const color = data.title.includes("desactivado") ? 0xf2a33a : 0x2fbf71;
    const resp = await fetch(this.config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: this.config.username || "CF Football Bypass",
        embeds: [
          {
            title: data.title,
            description: data.message,
            color,
            footer: { text: "CF Football Bypass Panel v3.0" },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok && resp.status !== 204) {
      throw new Error(`HTTP ${resp.status}`);
    }
  }
}

module.exports = { DiscordProvider };
