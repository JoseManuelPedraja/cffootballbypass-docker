"use strict";

class NtfyProvider {
  static displayName = "ntfy";
  static icon = "ntfy";
  static configFields = [
    { key: "serverUrl", label: "URL del servidor", type: "text", default: "https://ntfy.sh" },
    { key: "topic", label: "Topic", type: "text", required: true, placeholder: "mi-cfb-alertas" },
    { key: "token", label: "Token (opcional)", type: "password" },
    { key: "priority", label: "Prioridad", type: "select", options: ["1", "2", "3", "4", "5"], default: "3" },
  ];

  constructor(config) {
    this.config = config;
  }

  async send(data) {
    const url = `${(this.config.serverUrl || "https://ntfy.sh").replace(/\/$/, "")}/${this.config.topic}`;
    const headers = {
      "Title": data.title,
      "Priority": this.config.priority || "3",
      "Tags": "soccer",
    };
    if (this.config.token) {
      headers["Authorization"] = `Bearer ${this.config.token}`;
    }
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: data.message,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  }
}

module.exports = { NtfyProvider };
