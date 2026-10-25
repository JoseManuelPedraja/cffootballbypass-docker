<div align="center">

# CF Football Bypass

[![GHCR](https://img.shields.io/badge/ghcr.io-%23181717.svg?style=for-the-badge&logo=github&logoColor=white)](https://github.com/JoseManuelPedraja/cffootballbypass-docker/pkgs/container/cffootballbypass-docker)
[![Node.js](https://img.shields.io/badge/node.js-20+-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-GPL--2.0-blue.svg?style=for-the-badge)](LICENSE)

**Automatically bypass Spanish football broadcast IP blocks by toggling Cloudflare proxy on your domains.**

[Quick Start](#-quick-start) &bull; [Panel v3.0](#-panel-v30) &bull; [Configuration](#%EF%B8%8F-configuration) &bull; [Security](#%EF%B8%8F-security) &bull; [FAQ](#-faq)

</div>

---

## What Does It Do?

When Spanish ISPs block Cloudflare IP ranges during football broadcasts, your proxied sites go down. **CF Football Bypass** monitors the [hayahora.futbol](https://hayahora.futbol) feed in real time and automatically toggles the Cloudflare proxy for your domains:

| Block Detected | No Blocks |
|:-:|:-:|
| Disables Cloudflare proxy | Enables Cloudflare proxy |
| Your server responds directly | DDoS protection + CDN active |

---

## Panel v3.0

Full web panel with real-time monitoring, multi-account Cloudflare support, and 15+ notification providers.

### Quick Start (Panel)

```bash
docker run -d \
  --name cfb-panel \
  -p 3001:3001 \
  -v cfb-data:/app/data \
  ghcr.io/josemanuelpedraja/cffootballbypass-docker:latest
```

Open `http://your-server:3001` &mdash; the first run shows a setup wizard to create your admin account.

### Panel Features

| Feature | Detail |
|---------|--------|
| **Dashboard** | Real-time bypass status, feed stats, DNS record state, operating mode control |
| **Multi-account Cloudflare** | Manage multiple CF accounts and zones from one panel |
| **DNS import** | Import DNS records directly from Cloudflare API with one click |
| **Per-domain control** | Enable/disable individual domains for bypass management |
| **Dark / Light mode** | Automatic (system) or manual toggle |
| **i18n** | Spanish + English built-in, language selector on login and sidebar |
| **2FA (TOTP)** | Google Authenticator, Authy, etc. |
| **15 notification providers** | Telegram, Discord, Slack, Email (SMTP), Webhook, Pushover, Gotify, ntfy, Teams, Signal, PagerDuty, Twilio SMS, Matrix, Google Chat, Apprise |
| **Multi-DB** | SQLite (default), MySQL/MariaDB, PostgreSQL |
| **Prometheus metrics** | `/metrics` endpoint for Grafana dashboards |
| **API keys** | Granular permissions: read, write, metrics, admin |
| **Reverse proxy ready** | nginx, Traefik, Caddy &mdash; trusted headers support |
| **Security** | Helmet CSP, rate limiting, bcrypt, AES-256-GCM encrypted secrets, audit log |

### Docker Compose (Panel)

```yaml
services:
  cfb-panel:
    image: ghcr.io/josemanuelpedraja/cffootballbypass-docker:latest
    container_name: cfb-panel
    restart: always
    ports:
      - "3001:3001"
    volumes:
      - cfb-data:/app/data
    environment:
      # Optional: auto-create admin on first run
      # ADMIN_PASSWORD: "your-secure-password"
volumes:
  cfb-data:
```

### Panel with MySQL

```yaml
services:
  panel:
    image: ghcr.io/josemanuelpedraja/cffootballbypass-docker:latest
    ports: ["3001:3001"]
    environment:
      CFB_DB_TYPE: mysql
      CFB_DB_HOST: db
      CFB_DB_USER: cfb
      CFB_DB_PASS: secret
      CFB_DB_NAME: cfb_panel
    depends_on: [db]
  db:
    image: mariadb:11
    environment:
      MARIADB_ROOT_PASSWORD: root
      MARIADB_DATABASE: cfb_panel
      MARIADB_USER: cfb
      MARIADB_PASSWORD: secret
    volumes: [db-data:/var/lib/mysql]
volumes:
  db-data:
```

### Panel Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CFB_PORT` | `3001` | HTTP port |
| `CFB_DATA_DIR` | `/app/data` | Persistent data directory |
| `CFB_SESSION_SECRET` | auto-generated | Session encryption key |
| `CFB_TRUST_PROXY` | `false` | Set `true` behind nginx/Traefik/Caddy |
| `CFB_DB_TYPE` | `sqlite` | `sqlite`, `mysql`, `mariadb`, `postgres` |
| `CFB_DB_URL` | &mdash; | Full connection URL (alternative to individual vars) |
| `CFB_DB_HOST` | `localhost` | Database host |
| `CFB_DB_PORT` | `3306`/`5432` | Database port |
| `CFB_DB_USER` | `cfb` | Database user |
| `CFB_DB_PASS` | &mdash; | Database password |
| `CFB_DB_NAME` | `cfb_panel` | Database name |
| `ADMIN_PASSWORD` | &mdash; | Auto-create admin user on first run |

---

## Configuration

All bypass behavior is configurable from the panel UI. These are the defaults:

| Setting | Default | Description |
|---------|---------|-------------|
| Check interval | `300s` | How often to check the feed |
| Min ISPs blocked | `2` | Minimum ISPs blocking to trigger bypass |
| Cooldown | `60min` | Wait before re-enabling proxy after bypass |
| Feed stale after | `6h` | Ignore feed data older than this |
| Force override | Off | Disable proxy on general block even if your IP is clear |

### Cloudflare Authentication

The panel supports three authentication methods, configured per credential in the UI:

| Method | Required Fields | Permissions Needed |
|--------|----------------|-------------------|
| **API Token** (recommended) | Token, Zone ID | Zone: Read, DNS: Read + Edit |
| **Global API Key** | Key, Email, Zone ID | Full account access |
| **Account Token** | Token, Account ID, Zone ID | Zone: Read, DNS: Read + Edit |

> **Tip:** Use an API Token scoped to only the zones you need for best security.

### Creating a Cloudflare API Token

1. Go to [Cloudflare Dashboard &rarr; API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use the **Edit zone DNS** template
4. Under **Zone Resources**, select the specific zone(s)
5. Create and copy the token

---

## Security

| Feature | Detail |
|---------|--------|
| **Encrypted secrets** | API tokens stored with AES-256-GCM encryption |
| **Bcrypt passwords** | Admin password hashed with bcrypt |
| **TOTP 2FA** | Optional two-factor authentication |
| **Rate limiting** | Login brute-force protection (15min lockout) |
| **Helmet CSP** | Content Security Policy headers |
| **Audit log** | All admin actions logged with IP and timestamp |
| **Non-root container** | Runs as UID/GID 1000 |
| **IP anonymization** | IPs anonymized in all logs |
| **Session encryption** | Auto-generated or custom session secret |

---

## How It Works

```
1. Read hayahora.futbol feed
   ├── Blocked IPs and ISP data
   └── Staleness check (ignore old data)

2. Resolve your domain IPs via DNS

3. Decide per domain:
   ├── IP in blocked list? → Proxy OFF (bypass)
   ├── General block + override? → Proxy OFF
   ├── Force mode active? → Follow forced state
   └── Otherwise → Proxy ON

4. Update Cloudflare DNS records via API

5. Send notifications if state changed

6. Sleep until next interval → repeat
```

---

## Translations

CF Football Bypass includes Spanish and English. To add a new language:

1. Copy `locales/en.json` to `locales/xx.json`
2. Translate all values (keep the keys)
3. Update `_meta.name` and `_meta.code`
4. Submit a PR

See [locales/TRANSLATING.md](locales/TRANSLATING.md) for details.

---

## FAQ

<details>
<summary><strong>Why do I need this?</strong></summary>

Some Spanish ISPs block Cloudflare IP ranges during football broadcasts. This means your proxied sites go down during matches. CF Football Bypass:

1. Detects when your Cloudflare IP is blocked
2. Temporarily disables the proxy so your server responds directly
3. Re-enables the proxy when the match ends

</details>

<details>
<summary><strong>What if the feed goes down?</strong></summary>

The panel caches the last successful feed response. If hayahora.futbol is unreachable, it uses the cached data and logs a warning. Your current Cloudflare state is maintained.

</details>

<details>
<summary><strong>Can I manage multiple Cloudflare accounts?</strong></summary>

Yes. Add as many Cloudflare credentials (accounts/zones) as you need from the panel. Each credential can have its own domains. Deleting a credential also removes its associated domains.

</details>

<details>
<summary><strong>Is this legal?</strong></summary>

Yes. This only manages DNS configuration of your own domains and reads a public feed. It doesn't intercept, modify, or redistribute any protected content.

</details>

<details>
<summary><strong>Can I run it on a Raspberry Pi?</strong></summary>

Yes. The Docker image supports ARM64 and runs well on Raspberry Pi 4 and newer.

</details>

---

## Useful Commands

```bash
# View logs
docker logs -f cfb-panel

# Restart
docker restart cfb-panel

# Update to latest
docker pull ghcr.io/josemanuelpedraja/cffootballbypass-docker:latest
docker compose up -d

# Shell access (debug)
docker exec -it cfb-panel sh
```

---

## Contributing

- Report bugs via [Issues](https://github.com/JoseManuelPedraja/cffootballbypass-docker/issues)
- Submit Pull Requests
- Add translations (see [Translations](#translations))

---

## License

[GNU General Public License v2.0](LICENSE)

---

## Acknowledgments

- [hayahora.futbol](https://hayahora.futbol) for the public blocking feed
- [David Carrero / Color Vivo](https://github.com/davidcarrero) for the original WordPress plugin
- The Docker and Cloudflare communities

---

<div align="center">

**Made in Spain**

[![GitHub](https://img.shields.io/badge/GitHub-JoseManuelPedraja-181717?style=flat-square&logo=github)](https://github.com/JoseManuelPedraja/cffootballbypass-docker)

</div>
