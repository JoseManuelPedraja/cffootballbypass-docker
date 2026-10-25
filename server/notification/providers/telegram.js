"use strict";

class TelegramProvider {
  static displayName = "Telegram";
  static icon = "telegram";
  static configFields = [
    { key: "botToken", label: "Bot Token", type: "password", required: true, placeholder: "123456:ABC-DEF..." },
    { key: "chatId", label: "Chat ID", type: "text", required: true, placeholder: "-1001234567890" },
    { key: "silent", label: "Silencioso", type: "boolean", default: false },
  ];

  constructor(config) {
    this.config = config;
  }

  async send(data) {
    const text = `*${escapeMarkdown(data.title)}*\n\n${escapeMarkdown(data.message)}`;
    const resp = await fetch(
      `https://api.telegram.org/bot${this.config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text,
          parse_mode: "MarkdownV2",
          disable_notification: this.config.silent || false,
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.description || `HTTP ${resp.status}`);
    }
  }
}

function escapeMarkdown(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

module.exports = { TelegramProvider };
