"use strict";

const { EmailProvider } = require("./providers/email");
const { TelegramProvider } = require("./providers/telegram");
const { DiscordProvider } = require("./providers/discord");
const { SlackProvider } = require("./providers/slack");
const { WebhookProvider } = require("./providers/webhook");
const { PushoverProvider } = require("./providers/pushover");
const { GotifyProvider } = require("./providers/gotify");
const { NtfyProvider } = require("./providers/ntfy");
const { TeamsProvider } = require("./providers/teams");

const PROVIDERS = {
  email: EmailProvider,
  telegram: TelegramProvider,
  discord: DiscordProvider,
  slack: SlackProvider,
  webhook: WebhookProvider,
  pushover: PushoverProvider,
  gotify: GotifyProvider,
  ntfy: NtfyProvider,
  teams: TeamsProvider,
};

const EVENT_MAP = {
  bypass_activate: "on_bypass_activate",
  bypass_deactivate: "on_bypass_deactivate",
  error: "on_error",
  feed_stale: "on_feed_stale",
};

class NotificationManager {
  constructor(db) {
    this.db = db;
    this.lastSent = {};
    this.throttleMs = 120000;
  }

  static getProviderTypes() {
    return Object.keys(PROVIDERS).map((type) => ({
      type,
      name: PROVIDERS[type].displayName,
      icon: PROVIDERS[type].icon,
      fields: PROVIDERS[type].configFields,
    }));
  }

  async send(event, data) {
    const notifications = this.db.getNotifications().filter((n) => n.enabled);
    const column = EVENT_MAP[event];
    if (!column) return;

    const now = Date.now();

    for (const notif of notifications) {
      if (!notif[column]) continue;

      const throttleKey = `${notif.id}:${event}`;
      if (this.lastSent[throttleKey] && now - this.lastSent[throttleKey] < this.throttleMs) {
        continue;
      }

      const ProviderClass = PROVIDERS[notif.type];
      if (!ProviderClass) continue;

      try {
        const provider = new ProviderClass(notif.config);
        await provider.send(data);
        this.lastSent[throttleKey] = now;
        this.db.addLog("notification", `Notificación ${notif.type} enviada: ${notif.name}`, {
          event,
          provider: notif.type,
        });
      } catch (err) {
        this.db.addLog("error", `Notificación ${notif.type} fallida: ${err.message}`, {
          provider: notif.type,
          name: notif.name,
        });
      }
    }
  }

  async test(type, config) {
    const ProviderClass = PROVIDERS[type];
    if (!ProviderClass) throw new Error(`Tipo de notificación desconocido: ${type}`);
    const provider = new ProviderClass(config);
    return provider.send({
      title: "[CFB] Notificación de prueba",
      message: "Si recibes esto, la notificación está configurada correctamente.",
      domains: ["example.com"],
      reason: "test",
    });
  }
}

module.exports = { NotificationManager };
