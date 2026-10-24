"use strict";

const nodemailer = require("nodemailer");

class EmailProvider {
  static displayName = "Email (SMTP)";
  static icon = "email";
  static configFields = [
    { key: "host", label: "Servidor SMTP", type: "text", required: true, placeholder: "smtp.gmail.com" },
    { key: "port", label: "Puerto", type: "number", required: true, default: 587 },
    { key: "secure", label: "SSL/TLS directo", type: "boolean", default: false },
    { key: "user", label: "Usuario", type: "text", placeholder: "tu@email.com" },
    { key: "pass", label: "Contraseña / App Password", type: "password" },
    { key: "from", label: "Remitente", type: "text", required: true, placeholder: "cfb@tudominio.com" },
    { key: "to", label: "Destinatario(s)", type: "text", required: true, placeholder: "admin@tudominio.com" },
  ];

  constructor(config) {
    this.config = config;
  }

  async send(data) {
    const transport = nodemailer.createTransport({
      host: this.config.host,
      port: parseInt(this.config.port, 10) || 587,
      secure: this.config.secure || false,
      auth: this.config.user ? { user: this.config.user, pass: this.config.pass } : undefined,
      tls: { rejectUnauthorized: true },
    });

    await transport.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: data.title,
      text: `${data.message}\n\n-- CF Football Bypass Panel v3.0`,
    });
  }
}

module.exports = { EmailProvider };
