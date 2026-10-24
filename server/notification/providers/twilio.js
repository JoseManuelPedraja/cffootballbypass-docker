"use strict";

class TwilioProvider {
  static displayName = "Twilio SMS";
  static icon = "sms";
  static configFields = [
    { key: "accountSid", label: "Account SID", type: "text", required: true },
    { key: "authToken", label: "Auth Token", type: "password", required: true },
    { key: "from", label: "From number", type: "text", placeholder: "+15551234567", required: true },
    { key: "to", label: "To number", type: "text", placeholder: "+34600000000", required: true },
  ];

  constructor(config) { this.config = config; }

  async send(data) {
    const body = new URLSearchParams({
      Body: `${data.title}\n${data.message}`,
      From: this.config.from,
      To: this.config.to,
    });
    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Twilio error: ${res.status}`);
    }
  }
}

module.exports = { TwilioProvider };
