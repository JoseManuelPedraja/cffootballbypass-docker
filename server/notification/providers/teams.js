"use strict";

class TeamsProvider {
  static displayName = "Microsoft Teams";
  static icon = "teams";
  static configFields = [
    { key: "webhookUrl", label: "Webhook URL", type: "password", required: true, placeholder: "https://outlook.office.com/webhook/..." },
  ];

  constructor(config) {
    this.config = config;
  }

  async send(data) {
    const color = data.title.includes("desactivado") ? "F2A33A" : "2FBF71";
    const resp = await fetch(this.config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        themeColor: color,
        summary: data.title,
        sections: [
          {
            activityTitle: data.title,
            activitySubtitle: "CF Football Bypass Panel v3.0",
            text: data.message,
            markdown: true,
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  }
}

module.exports = { TeamsProvider };
