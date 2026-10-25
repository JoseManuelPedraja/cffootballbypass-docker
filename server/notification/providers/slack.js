"use strict";

class SlackProvider {
  static displayName = "Slack";
  static icon = "slack";
  static configFields = [
    { key: "webhookUrl", label: "Webhook URL", type: "password", required: true, placeholder: "https://hooks.slack.com/services/..." },
    { key: "channel", label: "Canal (opcional)", type: "text", placeholder: "#alertas" },
    { key: "username", label: "Nombre del bot", type: "text", default: "CF Football Bypass" },
  ];

  constructor(config) {
    this.config = config;
  }

  async send(data) {
    const emoji = data.title.includes("desactivado") ? ":warning:" : ":white_check_mark:";
    const payload = {
      username: this.config.username || "CF Football Bypass",
      icon_emoji: ":soccer:",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: data.title, emoji: true },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `${emoji} ${data.message}` },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "CF Football Bypass Panel v3.0" }],
        },
      ],
    };
    if (this.config.channel) payload.channel = this.config.channel;

    const resp = await fetch(this.config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  }
}

module.exports = { SlackProvider };
