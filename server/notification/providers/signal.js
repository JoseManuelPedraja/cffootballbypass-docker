"use strict";

class SignalProvider {
  static displayName = "Signal";
  static icon = "signal";
  static configFields = [
    { key: "apiUrl", label: "Signal CLI REST API URL", type: "text", placeholder: "http://signal-api:8080", required: true },
    { key: "number", label: "Sender number", type: "text", placeholder: "+34600000000", required: true },
    { key: "recipients", label: "Recipients (comma-separated)", type: "text", placeholder: "+34600000001,+34600000002", required: true },
  ];

  constructor(config) { this.config = config; }

  async send(data) {
    const recipients = this.config.recipients.split(",").map((r) => r.trim());
    const res = await fetch(`${this.config.apiUrl}/v2/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `${data.title}\n${data.message}`,
        number: this.config.number,
        recipients,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Signal API error: ${res.status}`);
  }
}

module.exports = { SignalProvider };
