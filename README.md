<div align="center">

# ⚽ CF Football Bypass

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://hub.docker.com/r/harlekesp/cffootballbypass)
[![PHP](https://img.shields.io/badge/php-%23777BB4.svg?style=for-the-badge&logo=php&logoColor=white)](https://www.php.net/)
[![License](https://img.shields.io/badge/license-GNU-blue.svg?style=for-the-badge)](LICENSE)
[![Security Scan](https://img.shields.io/badge/security-scanned-success?style=for-the-badge)](https://github.com/SurMod/cffootballbypass-docker/security)

**Automatically bypass Spanish football broadcast blocks by intelligently toggling Cloudflare proxy** ⚡

[Features](#-features) • [Quick Start](#-quick-start) • [Configuration](#️-configuration) • [Security](#️-security) • [FAQ](#-faq)

</div>

---

## 🎯 What Does It Do?

**CF Football Bypass** is an autonomous Docker container that **automatically enables/disables Cloudflare proxy** for your domains based on real-time football broadcast blocking status in Spain.

It monitors the official feed from [hayahora.futbol](https://hayahora.futbol) and:

<table>
<tr>
<td width="50%" align="center">
<h3>🔴 Block Detected</h3>
Disables Cloudflare proxy<br/>
Your server responds directly
</td>
<td width="50%" align="center">
<h3>🟢 No Blocks</h3>
Enables Cloudflare proxy<br/>
DDoS protection + CDN active
</td>
</tr>
</table>

---

## ✨ Features

<table>
<tr>
<td width="33%" align="center">

### 🤖 Fully Autonomous
Runs 24/7 without manual intervention

</td>
<td width="33%" align="center">

### 🔒 Three Auth Methods
Global Key, API Token, Account Token

</td>
<td width="33%" align="center">

### 🎯 Smart Detection
ISP counting, staleness, cooldowns

</td>
</tr>
<tr>
<td width="33%" align="center">

### 📧 Email Notifications
SMTP alerts on state changes

</td>
<td width="33%" align="center">

### 📊 File Logging
JSON logs with automatic rotation

</td>
<td width="33%" align="center">

### 📦 Lightweight
Alpine-based image (~50MB)

</td>
</tr>
</table>

### What's New in v2.1.0

- **Three Cloudflare authentication methods**: Global API Key, API Token (Bearer), Account API Token
- **Email notifications**: SMTP-based alerts when bypass activates/deactivates (2-minute throttle)
- **File logging**: JSON-formatted log file with configurable retention and automatic pruning
- **Improved domain parsing**: supports both `name` and `domain` keys in DOMAINS JSON
- **Updated user agent**: `CFB-Docker/2.1`

---

## 🚀 Quick Start

### Prerequisites
```bash
✅ Docker 20.10+
✅ Docker Compose v2+
✅ Cloudflare API Token or Global API Key
✅ Cloudflare Zone ID
```

### 📝 Step 1: Get Cloudflare Credentials

| Credential | Where to find it |
|-----------|-------------------|
| **API Token** | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token → Edit Zone DNS |
| **Global API Key** | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Global API Key |
| **Zone ID** | Domain Dashboard → Overview → API section (right column) |
| **Account ID** | Domain Dashboard → Overview → API section (right column) |

### 🐳 Step 2: Create `docker-compose.yml`

#### Option A: API Token (Recommended)
```yaml
version: "3.9"

services:
  cf-bypass:
    image: harlekesp/cffootballbypass:latest
    container_name: cf-football-bypass
    restart: always
    environment:
      CF_AUTH_TYPE: "token"
      CF_API_TOKEN: "your_token_here"
      CF_ZONE_ID: "your_zone_id_here"
      DOMAINS: '[{"name":"example.com","record":"@","type":"A"}]'
      INTERVAL_SECONDS: 300
    volumes:
      - cflogs:/app/logs
      - cfdata:/app/data
    networks:
      - private_network

volumes:
  cflogs:
  cfdata:

networks:
  private_network:
```

#### Option B: Global API Key
```yaml
version: "3.9"

services:
  cf-bypass:
    image: harlekesp/cffootballbypass:latest
    container_name: cf-football-bypass
    restart: always
    environment:
      CF_AUTH_TYPE: "global"
      CF_API_TOKEN: "your_global_api_key_here"
      CF_EMAIL: "your_cloudflare_email@example.com"
      CF_ZONE_ID: "your_zone_id_here"
      DOMAINS: '[{"name":"example.com","record":"@","type":"A"}]'
      INTERVAL_SECONDS: 300
    volumes:
      - cflogs:/app/logs
      - cfdata:/app/data
    networks:
      - private_network

volumes:
  cflogs:
  cfdata:

networks:
  private_network:
```

#### Option C: With Email Notifications
```yaml
version: "3.9"

services:
  cf-bypass:
    image: harlekesp/cffootballbypass:latest
    container_name: cf-football-bypass
    restart: always
    environment:
      CF_AUTH_TYPE: "token"
      CF_API_TOKEN: "your_token_here"
      CF_ZONE_ID: "your_zone_id_here"
      DOMAINS: '[{"name":"example.com","record":"@","type":"A"}]'
      INTERVAL_SECONDS: 300
      NOTIFY_EMAIL: "admin@example.com"
      NOTIFY_FROM: "cfb@example.com"
      SMTP_HOST: "smtp.gmail.com"
      SMTP_PORT: 587
      SMTP_USER: "your_email@gmail.com"
      SMTP_PASS: "your_app_password"
      SMTP_TLS: "on"
    volumes:
      - cflogs:/app/logs
      - cfdata:/app/data
    networks:
      - private_network

volumes:
  cflogs:
  cfdata:

networks:
  private_network:
```

#### Option D: Using Docker Secrets (Production)

**Create secret files:**
```bash
mkdir -p secrets
echo "your_cloudflare_api_token_here" > secrets/cf_api_token
echo "your_cloudflare_zone_id_here" > secrets/cf_zone_id
chmod 600 secrets/*
```

**docker-compose.yml with secrets:**
```yaml
version: "3.9"

services:
  cf-bypass:
    image: harlekesp/cffootballbypass:latest
    container_name: cf-football-bypass
    restart: always
    environment:
      CF_API_TOKEN_FILE: /run/secrets/cf_api_token
      CF_ZONE_ID_FILE: /run/secrets/cf_zone_id
      CF_AUTH_TYPE: "token"
      DOMAINS: '[{"name":"example.com","record":"@","type":"A"}]'
      INTERVAL_SECONDS: 300
    secrets:
      - cf_api_token
      - cf_zone_id
    volumes:
      - cflogs:/app/logs
      - cfdata:/app/data
    networks:
      - private_network

secrets:
  cf_api_token:
    file: ./secrets/cf_api_token
  cf_zone_id:
    file: ./secrets/cf_zone_id

volumes:
  cflogs:
  cfdata:

networks:
  private_network:
```

### ▶️ Step 3: Start Container
```bash
docker-compose up -d
```

### 📋 Step 4: Check Logs
```bash
docker logs -f cf-football-bypass
```

---

## ⚙️ Configuration

### Environment Variables

#### Core Settings

| Variable | Description | Required | Default | Example |
|----------|-------------|:--------:|---------|---------|
| `CF_AUTH_TYPE` | Authentication method | ❌ | `token` | `global`, `token`, `account_token` |
| `CF_API_TOKEN` | Cloudflare API Key/Token | ✅* | - | `aBc123...` |
| `CF_API_TOKEN_FILE` | Path to API Token file | ✅* | - | `/run/secrets/cf_api_token` |
| `CF_ZONE_ID` | Cloudflare Zone ID | ✅* | - | `a1b2c3...` |
| `CF_ZONE_ID_FILE` | Path to Zone ID file | ✅* | - | `/run/secrets/cf_zone_id` |
| `CF_EMAIL` | Cloudflare account email | ⚠️ | - | `user@example.com` |
| `CF_ACCOUNT_ID` | Cloudflare Account ID | ⚠️ | - | `abc123...` |
| `DOMAINS` | JSON array of domains | ✅ | `[]` | See below ↓ |
| `INTERVAL_SECONDS` | Check interval (seconds) | ❌ | `300` | `180` |

**\* Provide EITHER the direct variable OR the `_FILE` version**
**⚠️ Required depending on `CF_AUTH_TYPE`**

#### Bypass Behavior

| Variable | Description | Default | Range |
|----------|-------------|---------|-------|
| `STALE_THRESHOLD_HOURS` | Ignore feed data older than this | `6` | 1-72 |
| `MIN_ISPS_BLOCKED` | Min ISPs blocked to trigger bypass | `2` | 1-20 |
| `FORCE_PROXY_OFF_OVERRIDE` | Force proxy OFF when general=blocked | `0` | 0 or 1 |
| `COOLDOWN_MINUTES` | Minutes before re-enabling proxy | `60` | 5-1440 |

#### Logging

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_ENABLED` | Enable file logging | `1` |
| `LOG_RETENTION_DAYS` | Days to keep log entries | `30` |

Logs are written to `/app/logs/cfb.log` in JSON format (one entry per line). Mount the `/app/logs` volume to persist them.

#### Email Notifications

| Variable | Description | Default |
|----------|-------------|---------|
| `NOTIFY_EMAIL` | Recipient email address | _(disabled)_ |
| `NOTIFY_FROM` | Sender email address | `cfb@localhost` |
| `SMTP_HOST` | SMTP server hostname | _(disabled)_ |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username | _(none)_ |
| `SMTP_PASS` | SMTP password | _(none)_ |
| `SMTP_TLS` | Enable TLS | `on` |

Notifications are sent when bypass state changes (activated/deactivated). A 2-minute throttle prevents burst emails.

### 🔐 Authentication Methods

| Method | `CF_AUTH_TYPE` | Required Variables | Minimum Permissions |
|--------|:--------------:|--------------------|--------------------|
| **API Token** | `token` | `CF_API_TOKEN`, `CF_ZONE_ID` | Zone:Read, DNS:Read, DNS:Edit |
| **Global API Key** | `global` | `CF_API_TOKEN`, `CF_ZONE_ID`, `CF_EMAIL` | Full account access |
| **Account Token** | `account_token` | `CF_API_TOKEN`, `CF_ZONE_ID`, `CF_ACCOUNT_ID` | Zone:Read, DNS:Read, DNS:Edit |

> **Recommendation**: Use `token` (API Token) with minimal permissions for best security.

### 📋 DOMAINS Format
```json
[
  {
    "name": "example.com",
    "record": "@",
    "type": "A"
  },
  {
    "name": "example.com",
    "record": "www",
    "type": "A"
  },
  {
    "name": "example.com",
    "record": "blog",
    "type": "CNAME"
  }
]
```

**Parameters:**

- `name` (or `domain`) - Your main domain name
- `record` - Subdomain or `@` for root domain
- `type` - DNS record type (`A`, `AAAA`, `CNAME`, etc.)

> **💡 Tip:** Minify JSON to single line for `docker-compose.yml`

---

## 🔍 How It Works
```
┌─────────────┐
│    START    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ 1️⃣  Fetch public IPs            │
│    using dig @1.1.1.1           │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 2️⃣  Query hayahora.futbol feed  │
│    for blocking status          │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 3️⃣  Check ISPs & staleness      │
│    Min ISPs threshold met?      │
└──────┬──────────────────────────┘
       │
       ▼
    ┌──┴──┐
    │  ?  │
    └─┬─┬─┘
      │ │
  Yes │ │ No
      │ │
      ▼ ▼
  ┌─────┐ ┌─────┐
  │ 🔴  │ │ 🟢  │
  │ OFF │ │  ON │
  └──┬──┘ └──┬──┘
     │       │
     └───┬───┘
         │
         ▼
   ┌──────────┐
   │ 4️⃣  Update│
   │ Cloudflare│
   └─────┬────┘
         │
         ▼
   ┌──────────┐
   │ 5️⃣  Notify│
   │ (if email)│
   └─────┬────┘
         │
         ▼
   ┌──────────┐
   │ 6️⃣  Sleep │
   │ INTERVAL │
   └─────┬────┘
         │
         └──► (repeat from step 1)
```

---

## 🛡️ Security

| Feature | Implementation |
|---------|----------------|
| **Immutable feed** | Hardcoded to hayahora.futbol only |
| **No external code** | Doesn't execute third-party scripts |
| **Three auth methods** | Global Key, API Token, Account Token |
| **Docker Secrets support** | `_FILE` variables and auto-detection |
| **Non-root user** | Runs as UID/GID 1000 (appuser) |
| **Minimal privileges** | Only DNS permissions on Cloudflare |
| **IP anonymization** | IPs anonymized in all logs |
| **Healthcheck** | Verifies connectivity every 60s |
| **Email throttle** | 2-minute cooldown prevents notification bursts |

---

## 📊 Example Logs

### Console Output
```log
┌─────────────────────────────────────────────┐
│   CF Football Bypass — Docker v2.1.0        │
│   Cloudflare proxy management for La Liga   │
└─────────────────────────────────────────────┘

[2026-01-15 18:30:00] INFO  │ Feed URL: https://hayahora.futbol/estado/data.json
[2026-01-15 18:30:00] INFO  │ Domains: 2
[2026-01-15 18:30:00] INFO  │ Auth type: token
[2026-01-15 18:30:00] INFO  │ Logging: enabled (30d retention)
[2026-01-15 18:30:00] INFO  │ Notifications: ad***@ex***.com via smtp.gmail.com

[2026-01-15 18:30:01] INFO  │ Starting check cycle...
[2026-01-15 18:30:02] INFO  │ Feed: 3 blocked IPs, 2 ISPs (min: 2), general: true, stale: false
[2026-01-15 18:30:02] INFO  │ example.com: Proxy OFF (reason: domain_blocked, IPs: 185.199.xxx.xxx)
[2026-01-15 18:30:03] WARN  │ State changed: bypass ACTIVATED
[2026-01-15 18:30:03] INFO  │ Notification sent to ad***@ex***.com
[2026-01-15 18:30:03] INFO  │ Check cycle complete. Next in 300s
```

### File Log (`/app/logs/cfb.log`)
```json
{"time":"2026-01-15 18:30:03","type":"cron","message":"Auto-check","context":{"general":"true","blocked":3,"isps":2,"bypass":"true","reason":"domain_blocked"}}
{"time":"2026-01-15 18:30:03","type":"email","message":"Notification sent","context":{"to":"ad***@ex***.com"}}
```

---

## 🔧 Useful Commands
```bash
# View real-time logs
docker logs -f cf-football-bypass

# View file logs
docker exec cf-football-bypass cat /app/logs/cfb.log | jq .

# View last 100 console lines
docker logs --tail 100 cf-football-bypass

# Restart container
docker restart cf-football-bypass

# Stop and remove
docker-compose down

# Update to latest version
docker-compose pull && docker-compose up -d

# View container stats
docker stats cf-football-bypass

# Access shell (debug)
docker exec -it cf-football-bypass sh

# Verify secrets are mounted
docker exec cf-football-bypass ls -la /run/secrets/

# Check current state
docker exec cf-football-bypass cat /app/data/state.json | jq .
```

---

## ❓ FAQ

<details>
<summary><strong>🤔 Why do I need this?</strong></summary>

<br>

Some Spanish ISPs block IP ranges during football broadcasts. This container:

1. Detects when **your Cloudflare IP** is blocked
2. Temporarily disables the proxy
3. Your server responds **directly** (bypassing the block)
4. When the match ends, it re-enables Cloudflare

</details>

<details>
<summary><strong>🔐 Which auth method should I use?</strong></summary>

<br>

| Method | Security | Setup | Best For |
|--------|----------|-------|----------|
| **API Token** | ✅ Best | Medium | Production (recommended) |
| **Global API Key** | ⚠️ Full access | Easy | Quick setup |
| **Account Token** | ✅ Good | Medium | Multi-zone management |

**API Token** is recommended because it can be scoped to only the permissions needed (Zone:Read, DNS:Read, DNS:Edit) for a specific zone.

</details>

<details>
<summary><strong>📧 How do I set up email notifications?</strong></summary>

<br>

**Gmail (with App Password):**
```yaml
NOTIFY_EMAIL: "you@gmail.com"
SMTP_HOST: "smtp.gmail.com"
SMTP_PORT: 587
SMTP_USER: "you@gmail.com"
SMTP_PASS: "your_16_char_app_password"
SMTP_TLS: "on"
```

**Custom SMTP:**
```yaml
NOTIFY_EMAIL: "admin@yourdomain.com"
NOTIFY_FROM: "cfb@yourdomain.com"
SMTP_HOST: "mail.yourdomain.com"
SMTP_PORT: 587
SMTP_USER: "notifications@yourdomain.com"
SMTP_PASS: "password"
```

You'll receive emails when:
- Bypass activates (proxy disabled due to football blocks)
- Bypass deactivates (proxy re-enabled)

</details>

<details>
<summary><strong>⚖️ Is this legal?</strong></summary>

<br>

**Yes, completely legal.** This script only:
- ✅ Manages DNS configuration of your own domains
- ✅ Reads a public information feed
- ✅ Doesn't modify, intercept, or redistribute protected content

It's equivalent to manually changing Cloudflare settings, but automated.

</details>

<details>
<summary><strong>📊 Can I monitor multiple domains?</strong></summary>

<br>

**Absolutely!** Add as many as you need:
```json
[
  {"name":"example.com","record":"@","type":"A"},
  {"name":"example.com","record":"www","type":"A"},
  {"name":"example.com","record":"api","type":"A"},
  {"name":"another-domain.com","record":"@","type":"A"}
]
```

</details>

<details>
<summary><strong>⚠️ What if hayahora.futbol goes down?</strong></summary>

<br>

The container will:
1. Use the **locally cached** feed data
2. **Maintain** your current Cloudflare configuration
3. Log the error
4. Auto-recover when the feed returns

</details>

<details>
<summary><strong>🔄 How often does it check?</strong></summary>

<br>

Default: every **5 minutes** (300 seconds).

You can adjust with `INTERVAL_SECONDS`:
- ⚡ Faster → `180` (3 minutes)
- 🐢 Slower → `600` (10 minutes)

**Recommendation:** Don't go below 60 seconds to avoid API rate limits.

</details>

---

## 🐛 Troubleshooting

### Container won't start
```bash
# Check error logs
docker logs cf-football-bypass

# Verify environment variables
docker exec cf-football-bypass env | grep -E 'CF_|DOMAIN|INTERVAL'
```

### Auth issues
```bash
# Check which auth type is configured
docker logs cf-football-bypass | grep "Auth type"

# For Global API Key: verify email is set
docker exec cf-football-bypass sh -c 'echo $CF_EMAIL'

# For Account Token: verify account ID
docker exec cf-football-bypass sh -c 'echo $CF_ACCOUNT_ID'
```

### Email not working
```bash
# Check notification config
docker logs cf-football-bypass | grep "Notifications"

# Test SMTP manually
docker exec cf-football-bypass sh -c 'echo "Test" | msmtp --debug your@email.com'
```

### Not detecting blocks
```bash
# Verify your IPs are in the feed
curl -s https://hayahora.futbol/estado/data.json | jq '.ips'

# Check DNS resolution
docker exec cf-football-bypass dig +short example.com

# Check state file
docker exec cf-football-bypass cat /app/data/state.json | jq .
```

---

## 🤝 Contributing

Contributions are welcome! You can help by:

- 🐛 Reporting bugs via [Issues](https://github.com/SurMod/cffootballbypass-docker/issues)
- 💡 Suggesting features or improvements
- 🔧 Submitting Pull Requests
- ⭐ Starring the repo if you find it useful
- 📢 Sharing the project

---

## 📜 License

This project is licensed under the GNU GENERAL PUBLIC LICENSE. See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [hayahora.futbol](https://hayahora.futbol) for maintaining the public feed
- [David Carrero / Color Vivo](https://github.com/davidcarrero) for the original WordPress plugin (ES Football Bypass for Cloudflare)
- The Docker and Cloudflare communities
- All contributors and bug reporters

---

<div align="center">

**Made with ⚽ and ☕ in Spain**

[![GitHub](https://img.shields.io/badge/GitHub-SurMod-181717?style=flat-square&logo=github)](https://github.com/SurMod/cffootballbypass-docker)
[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-harlekesp-0db7ed?style=flat-square&logo=docker&logoColor=white)](https://hub.docker.com/r/harlekesp/cffootballbypass)

[⬆ Back to top](#-cf-football-bypass)


</div>
