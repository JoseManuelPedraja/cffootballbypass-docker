<div align="center">

# CF Football Bypass

[![GHCR](https://img.shields.io/badge/ghcr.io-%23181717.svg?style=for-the-badge&logo=github&logoColor=white)](https://github.com/JoseManuelPedraja/cffootballbypass-docker/pkgs/container/cffootballbypass-docker)
[![Node.js](https://img.shields.io/badge/node.js-20+-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Licencia](https://img.shields.io/badge/license-GPL--2.0-blue.svg?style=for-the-badge)](LICENSE)

**Evita automáticamente los bloqueos por IP durante las retransmisiones de fútbol en España, alternando el estado del proxy de Cloudflare en tus dominios.**

<img width="1919" height="906" alt="imagen" src="https://github.com/user-attachments/assets/27562d26-4e86-49f5-8c8c-f2f587551b8c" />

[Inicio rápido](#-inicio-rápido) &bull; [Panel v3.0](#-panel-v30) &bull; [Cloudflare API](#-configurar-cloudflare) &bull; [Exposición segura](#-exposición-segura) &bull; [Seguridad](#%EF%B8%8F-seguridad) &bull; [FAQ](#-preguntas-frecuentes)

</div>

---

## ¿Qué hace?

Cuando los proveedores de servicios de Internet (ISP) en España bloquean los rangos de IP de Cloudflare durante las retransmisiones de fútbol, los sitios que utilizan el proxy de Cloudflare dejan de estar accesibles. **CF Football Bypass** monitoriza la fuente de datos de [hayahora.futbol](https://hayahora.futbol) en tiempo real y activa o desactiva automáticamente el proxy de Cloudflare para tus dominios:

| Bloqueo detectado | Sin bloqueos |
|:-:|:-:|
| Desactiva el proxy de Cloudflare | Activa el proxy de Cloudflare |
| Tu servidor responde directamente | Protección contra DDoS + CDN activos |

---

## 🚀 Inicio rápido

```bash
docker run -d \
  --name cfb-panel \
  -p 3001:3001 \
  -v cfb-data:/app/data \
  ghcr.io/josemanuelpedraja/cffootballbypass-docker:latest
```

Accede a `http://tu-servidor:3001`. Al iniciar por primera vez, aparecerá un asistente para crear tu cuenta de administrador.

> **Raspberry Pi / ARM64**: la imagen se publica para `linux/amd64` y `linux/arm64`, funciona directamente.

---

## 🖥 Panel v3.0

| Funcionalidad | Detalle |
|---------|--------|
| **Dashboard** | Estado del bypass en tiempo real, estadísticas de feeds, registros DNS, control de modo |
| **Multi-cuenta Cloudflare** | Varias cuentas y zonas desde un único panel |
| **Importación de DNS** | Importa registros directamente desde la API de Cloudflare |
| **Control por dominio** | Habilita/deshabilita dominios individualmente |
| **Modo oscuro / claro** | Automático (sistema) o manual |
| **Idiomas (i18n)** | Español e inglés con selector de banderas |
| **2FA (TOTP)** | Google Authenticator, Authy, etc. |
| **15+ notificaciones** | Telegram, Discord, Slack, SMTP, Webhook, Pushover, Gotify, ntfy, Teams, Signal, PagerDuty, Twilio, Matrix, Google Chat, Apprise |
| **Multi-DB** | SQLite (por defecto), MySQL/MariaDB, PostgreSQL |
| **Prometheus** | Endpoint `/metrics` para Grafana |
| **Claves API** | Permisos granulares: lectura, escritura, métricas, admin |
| **Proxy inverso** | Compatible con nginx, Traefik, Caddy y cloudflared |
| **Seguridad** | Helmet CSP, rate limiting, bcrypt, AES-256-GCM, auditoría |

### Docker Compose

```yaml
services:
  cfb-panel:
    image: ghcr.io/josemanuelpedraja/cffootballbypass-docker:latest
    container_name: cfb-panel
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - cfb-data:/app/data
    environment:
      - CFB_PORT=3001
      # - CFB_SESSION_SECRET=cambia-esto-en-produccion
      # - CFB_TRUST_PROXY=true

volumes:
  cfb-data:
```

### Con MySQL/MariaDB

```yaml
services:
  cfb-panel:
    image: ghcr.io/josemanuelpedraja/cffootballbypass-docker:latest
    container_name: cfb-panel
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - cfb-data:/app/data
    environment:
      - CFB_DB_TYPE=mysql
      - CFB_DB_HOST=db
      - CFB_DB_USER=cfb
      - CFB_DB_PASS=secret
      - CFB_DB_NAME=cfb_panel
    depends_on:
      - db

  db:
    image: mariadb:11
    container_name: cfb-db
    restart: unless-stopped
    environment:
      - MARIADB_ROOT_PASSWORD=root_secret
      - MARIADB_DATABASE=cfb_panel
      - MARIADB_USER=cfb
      - MARIADB_PASSWORD=secret
    volumes:
      - db-data:/var/lib/mysql

volumes:
  cfb-data:
  db-data:
```

### Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `CFB_PORT` | `3001` | Puerto HTTP |
| `CFB_DATA_DIR` | `/app/data` | Directorio de datos persistentes |
| `CFB_SESSION_SECRET` | auto-generado | Clave de cifrado de sesiones (¡cámbialo en producción!) |
| `CFB_TRUST_PROXY` | `false` | `true` si usas proxy inverso (Traefik, nginx, Caddy, cloudflared) |
| `CFB_DB_TYPE` | `sqlite` | `sqlite`, `mysql`, `mariadb`, `postgres` |
| `CFB_DB_HOST` | `localhost` | Host de la base de datos |
| `CFB_DB_PORT` | `3306`/`5432` | Puerto de la base de datos |
| `CFB_DB_USER` | `cfb` | Usuario de la base de datos |
| `CFB_DB_PASS` | &mdash; | Contraseña de la base de datos |
| `CFB_DB_NAME` | `cfb_panel` | Nombre de la base de datos |
| `CFB_DB_URL` | &mdash; | URL de conexión completa (alternativa) |
| `ADMIN_PASSWORD` | &mdash; | Crea admin automáticamente en primera ejecución |

---

## ☁ Configurar Cloudflare

El panel necesita credenciales de la API de Cloudflare para gestionar los registros DNS de tus dominios. Hay dos formas de autenticarse:

### Opción 1: API Token (recomendado)

Los API Tokens tienen permisos limitados — son más seguros que la Global API Key.

1. Ve a [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Haz clic en **"Create Token"**
3. Usa la plantilla **"Edit zone DNS"** o crea uno personalizado con estos permisos:
   - **Zone → DNS → Edit** (obligatorio — para cambiar el estado del proxy)
   - **Zone → Zone → Read** (recomendado — para listar dominios)
4. En **Zone Resources**, selecciona la zona específica o "All zones"
5. Clic en **"Continue to summary"** → **"Create Token"**
6. Copia el token (solo se muestra una vez)

En el panel: ve a **Cloudflare** → **Añadir credencial** → selecciona **"Bearer Token"** → pega el token y tu **Zone ID**.

> **¿Dónde está el Zone ID?** En el dashboard de Cloudflare, selecciona tu dominio → en la barra lateral derecha aparece "Zone ID" en la sección "API".

### Opción 2: Global API Key + Email

1. Ve a [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. En la sección **"Global API Key"**, haz clic en **"View"**
3. Copia la clave

En el panel: ve a **Cloudflare** → **Añadir credencial** → selecciona **"API Key + Email"** → introduce tu email de Cloudflare, la API Key y el Zone ID.

> ⚠️ La Global API Key tiene acceso total a tu cuenta. Usa API Token siempre que sea posible.

### Importar dominios

Una vez añadida la credencial, haz clic en **"Importar DNS"** para cargar automáticamente los registros A, AAAA y CNAME de tu zona.

---

## 🌐 Exposición segura

El panel escucha en HTTP por defecto. **Nunca lo expongas directamente a Internet sin cifrado.** Estas son las opciones recomendadas:

### Opción 1: Cloudflare Tunnel (cloudflared) — más fácil

[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) crea un túnel cifrado desde tu servidor a la red de Cloudflare. No necesitas abrir puertos, ni certificados SSL, ni IP pública. Es lo que usa [Uptime Kuma](https://github.com/louislam/uptime-kuma) y otras aplicaciones self-hosted.

<img width="1919" height="898" alt="imagen" src="https://github.com/user-attachments/assets/22ea8ba3-4b43-46d0-bbb4-c7f406fa38a0" />

**Configuración en Cloudflare:**

1. Ve a [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Networks** → **Tunnels**
2. Clic en **"Create a tunnel"** → nombre: `cfb-panel`
3. Copia el token del tunnel (el valor de `TUNNEL_TOKEN`)
4. En **Public Hostnames**, añade:
   - **Subdomain**: `cfb` (o el que quieras)
   - **Domain**: tu dominio en Cloudflare
   - **Service**: `http://cfb-panel:3001`
5. Guarda y accede desde `https://cfb.tudominio.com`

> No necesitas abrir el puerto 3001 al exterior. El tunnel se conecta a Cloudflare de forma saliente.

### Opción 2: Traefik

```yaml
services:
  cfb-panel:
    image: ghcr.io/josemanuelpedraja/cffootballbypass-docker:latest
    container_name: cfb-panel
    restart: unless-stopped
    volumes:
      - cfb-data:/app/data
    environment:
      - CFB_TRUST_PROXY=true
      - CFB_SESSION_SECRET=cambia-esto-por-algo-seguro
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.cfb.rule=Host(`cfb.tudominio.com`)"
      - "traefik.http.routers.cfb.entrypoints=websecure"
      - "traefik.http.routers.cfb.tls.certresolver=letsencrypt"
      - "traefik.http.services.cfb.loadbalancer.server.port=3001"

volumes:
  cfb-data:
```

> Asegúrate de que Traefik está en la misma red Docker. Cambia `cfb.tudominio.com` por tu dominio real.

### Opción 3: nginx reverse proxy

```nginx
server {
    listen 443 ssl http2;
    server_name cfb.tudominio.com;

    ssl_certificate     /etc/letsencrypt/live/cfb.tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cfb.tudominio.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> **Importante**: con cualquier proxy inverso, establece `CFB_TRUST_PROXY=true` para que las sesiones funcionen correctamente con HTTPS.

---

## ⚙️ Configuración del bypass

Todo es configurable desde el panel:

| Configuración | Default | Descripción |
|---------|---------|-------------|
| Intervalo de comprobación | `300s` | Frecuencia de consulta al feed |
| Mínimo ISPs bloqueando | `2` | ISPs mínimos bloqueando para activar bypass |
| Cooldown | `60min` | Espera antes de reactivar proxy |
| Feed obsoleto | `6h` | Ignorar datos más antiguos |
| Forzar override | Off | Desactivar proxy si hay bloqueo general, aunque tu IP no esté bloqueada |

### Modos de operación

| Modo | Comportamiento |
|------|-------------|
| **Automático** | Detecta bloqueos y actúa solo |
| **Forzar OFF** | Proxy siempre desactivado (bypass permanente) |
| **Forzar ON** | Proxy siempre activado (ignora bloqueos) |
| **Pausado** | No hace comprobaciones |

---

## 🔑 API

El panel incluye un sistema de API Keys para integración con herramientas externas (Grafana, scripts, Home Assistant, etc.).

### Crear una API Key

En el panel: **Seguridad** → **Claves API** → **Crear clave**. Selecciona los permisos necesarios:

| Permiso | Acceso |
|---------|--------|
| `read` | `GET /api/status` — estado del bypass, IPs bloqueadas, dominios |
| `write` | Endpoints de escritura (dominios, settings, etc.) |
| `metrics` | `GET /metrics` — métricas Prometheus |
| `admin` | Acceso completo |

### Ejemplos de uso

**Consultar estado del bypass:**

```bash
curl -H "Authorization: Bearer TU_API_KEY" http://tu-servidor:3001/api/status
```

**Respuesta:**

```json
{
  "bypassActive": false,
  "mode": "auto",
  "lastCheck": "2024-10-25T20:30:00.000Z",
  "stats": {
    "blockedIps": 0,
    "blockedIsps": 0,
    "generalBlocked": false,
    "feedStale": false
  },
  "domainResults": [...],
  "running": true,
  "hasCfCredentials": true
}
```

**Métricas Prometheus (para Grafana):**

```bash
curl -H "Authorization: Bearer TU_API_KEY" http://tu-servidor:3001/metrics
```

O con query param:

```bash
curl http://tu-servidor:3001/metrics?token=TU_API_KEY
```

**Métricas disponibles:**

| Métrica | Tipo | Descripción |
|---------|------|-------------|
| `cfb_bypass_active` | Gauge | 1 si el bypass está activo |
| `cfb_blocked_ips` | Gauge | IPs bloqueadas en el feed |
| `cfb_blocked_isps` | Gauge | ISPs bloqueando |
| `cfb_feed_stale` | Gauge | 1 si el feed está obsoleto |
| `cfb_feed_age_hours` | Gauge | Antigüedad del feed (horas) |
| `cfb_domains_monitored` | Gauge | Dominios monitorizados |
| `cfb_checks_total` | Counter | Comprobaciones realizadas |
| `cfb_bypass_activations_total` | Counter | Activaciones de bypass |

---

## 🛡️ Seguridad

### Ya incluido

- **Helmet** con CSP restrictiva (solo permite scripts de `self` y cdnjs)
- **Rate limiting**: login (10 intentos / 15 min), API (120 req / min)
- **Sesiones**: httpOnly, sameSite=lax, secure (con trust proxy), secreto auto-generado
- **Contraseñas**: bcrypt con salt
- **2FA**: TOTP compatible con authenticators estándar
- **Credenciales**: cifradas con AES-256-GCM en la base de datos
- **Auditoría**: todas las acciones quedan registradas con IP y timestamp
- **Docker**: ejecuta como usuario `node` (no root), imagen Alpine mínima

### Recomendaciones para producción

1. **Establece `CFB_SESSION_SECRET`** — si no lo configuras, se genera uno nuevo en cada reinicio y las sesiones se pierden
2. **Usa HTTPS** — via cloudflared (más fácil), Traefik o nginx con Let's Encrypt
3. **Activa `CFB_TRUST_PROXY=true`** — necesario detrás de cualquier proxy inverso para que las cookies secure funcionen
4. **Activa 2FA** — en Seguridad → Autenticación de dos factores
5. **No expongas el puerto 3001 directamente** — usa un proxy inverso o tunnel
6. **Backups** — el volumen `/app/data` contiene la base de datos SQLite. Copia periódicamente `cfb.sqlite3`

### CI/CD de seguridad

El repositorio incluye:
- **Dependabot** — PRs automáticos para actualizar dependencias npm, Docker y GitHub Actions
- **Trivy** — escaneo semanal de vulnerabilidades en la imagen Docker
- **npm audit** — auditoría de dependencias en cada push

---

## ❓ Preguntas frecuentes

**¿Funciona en Raspberry Pi?**
Sí. La imagen Docker se publica para `linux/arm64`. Probado en Raspberry Pi 4/5.

**¿Necesito IP pública?**
No si usas Cloudflare Tunnel (cloudflared). El tunnel se conecta de forma saliente desde tu servidor.

**¿Puedo usar varios dominios en distintas cuentas de Cloudflare?**
Sí. El panel soporta múltiples credenciales de Cloudflare, cada una con su zona.

**¿Qué pasa si el feed de hayahora.futbol no está disponible?**
El panel usa una caché interna. Si el feed lleva más de 6h sin actualizarse (configurable), se marca como obsoleto y no se toman decisiones de bypass.

**¿Se puede usar sin Docker?**
Sí. Necesitas Node.js 20+:

```bash
git clone https://github.com/JoseManuelPedraja/cffootballbypass-docker.git
cd cffootballbypass-docker
npm ci --omit=dev
CFB_DATA_DIR=./data node server/server.js
```

---

## 📄 Licencia

[GPL-2.0](LICENSE) — Jose Manuel Pedraja
