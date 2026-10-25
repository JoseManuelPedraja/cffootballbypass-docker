"use strict";

class PagerDutyProvider {
  static displayName = "PagerDuty";
  static icon = "pagerduty";
  static configFields = [
    { key: "integrationKey", label: "Integration Key (Routing Key)", type: "password", required: true },
    { key: "severity", label: "Severity", type: "text", placeholder: "warning", default: "warning" },
  ];

  constructor(config) { this.config = config; }

  async send(data) {
    const res = await fetch("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        routing_key: this.config.integrationKey,
        event_action: "trigger",
        payload: {
          summary: data.title,
          source: "CF Football Bypass Panel",
          severity: this.config.severity || "warning",
          custom_details: { message: data.message, domains: data.domains },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`PagerDuty error: ${res.status}`);
  }
}

module.exports = { PagerDutyProvider };
