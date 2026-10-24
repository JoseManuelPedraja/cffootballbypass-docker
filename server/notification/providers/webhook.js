"use strict";

class WebhookProvider {
  static displayName = "Webhook (genérico)";
  static icon = "webhook";
  static configFields = [
    { key: "url", label: "URL", type: "text", required: true, placeholder: "https://..." },
    { key: "method", label: "Método", type: "select", options: ["POST", "PUT"], default: "POST" },
    { key: "headers", label: "Headers (JSON)", type: "textarea", placeholder: '{"Authorization":"Bearer ..."}' },
    { key: "bodyTemplate", label: "Body template (JSON)", type: "textarea", placeholder: "Dejar vacío para formato por defecto" },
  ];

  constructor(config) {
    this.config = config;
  }

  async send(data) {
    let headers = { "Content-Type": "application/json", "User-Agent": "CFB-Panel/3.0" };
    if (this.config.headers) {
      try {
        Object.assign(headers, JSON.parse(this.config.headers));
      } catch { /* ignore bad JSON */ }
    }

    let body;
    if (this.config.bodyTemplate) {
      body = this.config.bodyTemplate
        .replace(/\{\{title\}\}/g, data.title)
        .replace(/\{\{message\}\}/g, data.message)
        .replace(/\{\{reason\}\}/g, data.reason || "")
        .replace(/\{\{timestamp\}\}/g, new Date().toISOString());
    } else {
      body = JSON.stringify({
        event: data.title,
        message: data.message,
        reason: data.reason,
        domains: data.domains,
        blockedIps: data.blockedIps,
        blockedIsps: data.blockedIsps,
        timestamp: new Date().toISOString(),
        source: "CFB-Panel/3.0",
      });
    }

    const resp = await fetch(this.config.url, {
      method: this.config.method || "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  }
}

module.exports = { WebhookProvider };
