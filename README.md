# CF Football Bypass

[![GHCR](https://img.shields.io/badge/ghcr.io-%23181717.svg?style=for-the-badge&logo=github&logoColor=white)](https://github.com/JoseManuelPedraja/cffootballbypass-docker/pkgs/container/cffootballbypass-docker)
[![Node.js](https://img.shields.io/badge/node.js-20+-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Licencia](https://img.shields.io/badge/license-GPL--2.0-blue.svg?style=for-the-badge)](LICENSE)

**Evita automáticamente los bloqueos por IP durante las retransmisiones de fútbol en España, alternando el estado del proxy de Cloudflare en tus dominios.**

<img width="1919" height="908" alt="imagen" src="https://github.com/user-attachments/assets/44773dd4-508e-4a26-9793-e278bab93446" /><div align="center">

[Inicio rápido](#-inicio-rápido) &bull; [Panel v3.0](#-panel-v30) &bull; [Configuración](#%EF%B8%8F-configuración) &bull; [Seguridad](#%EF%B8%8F-seguridad) &bull; [Preguntas frecuentes](#-preguntas-frecuentes)

</div>

---

## ¿Qué hace?

Cuando los proveedores de servicios de Internet (ISP) en España bloquean los rangos de IP de Cloudflare durante las retransmisiones de fútbol, ​​los sitios que utilizan el proxy de Cloudflare dejan de estar accesibles. **CF Football Bypass** monitoriza la fuente de datos de [hayahora.futbol](https://hayahora.futbol) en tiempo real y activa o desactiva automáticamente el proxy de Cloudflare para tus dominios:

| Bloqueo detectado | Sin bloqueos |
|:-:|:-:|
| Desactiva el proxy de Cloudflare | Activa el proxy de Cloudflare |
| Tu servidor responde directamente | Protección contra DDoS + CDN activos |

---

## Panel v3.0

Panel web completo con monitorización en tiempo real, soporte para múltiples cuentas de Cloudflare y más de 15 proveedores de notificaciones. ### Inicio rápido (Panel)

```bash
docker run -d \
--name cfb-panel \
-p 3001:3001 \
-v cfb-data:/app/data \
ghcr.io/josemanuelpedraja/cffootballbypass-docker:latest
```

Accede a `http://tu-servidor:3001`; al iniciar por primera vez, aparecerá un asistente de configuración para crear tu cuenta de administrador.

### Funcionalidades del panel

| Funcionalidad | Detalle |
|---------|--------|
| **Panel de control (Dashboard)** | Estado del bypass en tiempo real, estadísticas de los feeds, estado de los registros DNS, control del modo de funcionamiento |
| **Gestión multi-cuenta de Cloudflare** | Administra varias cuentas y zonas de Cloudflare desde un único panel |
| **Importación de DNS** | Importa registros DNS directamente desde la API de Cloudflare con un solo clic |
| **Control por dominio** | Habilita o deshabilita dominios de forma individual para la gestión del bypass |
| **Modo oscuro / claro** | Selección automática (según el sistema) o manual |
| **Internacionalización (i18n)** | Disponible en español e inglés; selector de idioma en la pantalla de inicio de sesión y en la barra lateral |
| **2FA (TOTP)** | Compatible con Google Authenticator, Authy, etc. |
| **15 proveedores de notificaciones** | Telegram, Discord, Slack, correo electrónico (SMTP), Webhook, Pushover, Gotify, ntfy, Teams, Signal, PagerDuty, Twilio SMS, Matrix, Google Chat, Apprise |
| **Soporte multi-base de datos** | SQLite (predeterminado), MySQL/MariaDB, PostgreSQL |
| **Métricas de Prometheus** | Endpoint `/metrics` para paneles de visualización en Grafana |
| **Claves API** | Permisos granulares: lectura, escritura, métricas, administración |
| **Preparado para proxy inverso** | Compatible con nginx, Traefik y Caddy; soporte para cabeceras de confianza (trusted headers) |
| **Seguridad** | Helmet CSP, limitación de tasa (rate limiting), bcrypt, secretos cifrados con AES-256-GCM, registro de auditoría | ### Docker Compose (Panel)

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
# Opcional: crear administrador automáticamente en la primera ejecución
# ADMIN_PASSWORD: "tu-contraseña-segura"
volumes:
cfb-data:
```

### Panel con MySQL

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

### Variables de entorno del panel

| Variable | Predeterminado | Descripción |
|----------|---------|-------------|
| `CFB_PORT` | `3001` | Puerto HTTP |
| `CFB_DATA_DIR` | `/app/data` | Directorio de datos persistentes |
| `CFB_SESSION_SECRET` | generado automáticamente | Clave de cifrado de sesiones |
| `CFB_TRUST_PROXY` | `false` | Establecer en `true` si se usa detrás de nginx/Traefik/Caddy |
| `CFB_DB_TYPE` | `sqlite` | `sqlite`, `mysql`, `mariadb`, `postgres` |
| `CFB_DB_URL` | &mdash; | URL de conexión completa (alternativa a las variables individuales) |
| `CFB_DB_HOST` | `localhost` | Host de la base de datos |
| `CFB_DB_PORT` | `3306`/`5432` | Puerto de la base de datos |
| `CFB_DB_USER` | `cfb` | Usuario de la base de datos |
| `CFB_DB_PASS` | &mdash; | Contraseña de la base de datos |
| `CFB_DB_NAME` | `cfb_panel` | Nombre de la base de datos |
| `ADMIN_PASSWORD` | &mdash; | Crea automáticamente un usuario administrador en la primera ejecución |

---

## Configuración

Todo el comportamiento de omisión (*bypass*) es configurable desde la interfaz de usuario del panel. Estos son los valores predeterminados:

| Configuración | Valor predeterminado | Descripción |
|---------|---------|-------------|
| Intervalo de comprobación | `300s` | Frecuencia con la que se consulta el *feed* |
| Mínimo de ISP bloqueando | `2` | Cantidad mínima de ISP que deben realizar bloqueos para activar la omisión |
| Tiempo de espera (*cooldown*) | `60min` | Tiempo a esperar antes de reactivar el proxy tras una omisión |
| *Feed* obsoleto tras | `6h` | Ignorar datos del *feed* más antiguos que este periodo |
| Forzar anulación (*override*) | O
