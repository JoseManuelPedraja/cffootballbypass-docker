"use strict";

class MatrixProvider {
  static displayName = "Matrix";
  static icon = "matrix";
  static configFields = [
    { key: "homeserverUrl", label: "Homeserver URL", type: "text", placeholder: "https://matrix.org", required: true },
    { key: "accessToken", label: "Access Token", type: "password", required: true },
    { key: "roomId", label: "Room ID", type: "text", placeholder: "!room:matrix.org", required: true },
  ];

  constructor(config) { this.config = config; }

  async send(data) {
    const txnId = `cfb_${Date.now()}`;
    const url = `${this.config.homeserverUrl.replace(/\/$/, "")}/_matrix/client/r0/rooms/${encodeURIComponent(this.config.roomId)}/send/m.room.message/${txnId}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msgtype: "m.text",
        body: `**${data.title}**\n${data.message}`,
        format: "org.matrix.custom.html",
        formatted_body: `<strong>${esc(data.title)}</strong><br>${esc(data.message)}`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Matrix error: ${res.status}`);
  }
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

module.exports = { MatrixProvider };
