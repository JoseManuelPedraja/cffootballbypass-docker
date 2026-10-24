"use strict";

class GoogleChatProvider {
  static displayName = "Google Chat";
  static icon = "google";
  static configFields = [
    { key: "webhookUrl", label: "Webhook URL", type: "text", required: true },
  ];

  constructor(config) { this.config = config; }

  async send(data) {
    const res = await fetch(this.config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `*${data.title}*\n${data.message}` }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Google Chat error: ${res.status}`);
  }
}

module.exports = { GoogleChatProvider };
