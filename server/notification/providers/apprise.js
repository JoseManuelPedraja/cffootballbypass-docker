"use strict";

class AppriseProvider {
  static displayName = "Apprise (80+ services)";
  static icon = "apprise";
  static configFields = [
    { key: "apiUrl", label: "Apprise API URL", type: "text", placeholder: "http://apprise:8000", required: true },
    { key: "urls", label: "Notification URLs", type: "text", placeholder: "tgram://bottoken/ChatID", required: true },
    { key: "tag", label: "Tag (optional)", type: "text", placeholder: "all" },
  ];

  constructor(config) { this.config = config; }

  async send(data) {
    const urls = this.config.urls.split(/[,\n]/).map((u) => u.trim()).filter(Boolean);
    const body = { title: data.title, body: data.message, urls };
    if (this.config.tag) body.tag = this.config.tag;
    const res = await fetch(`${this.config.apiUrl.replace(/\/$/, "")}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Apprise error: ${res.status}`);
  }
}

module.exports = { AppriseProvider };
