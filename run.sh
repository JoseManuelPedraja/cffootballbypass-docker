#!/usr/bin/env bash
set -o errexit
set -o nounset
set -o pipefail

echo "===== Iniciando CF Football Bypass INTELIGENTE ====="

# --- Lectura de token/zone desde secret (/run/secrets) o desde env ---
CF_API_TOKEN=""
CF_ZONE_ID=""

if [ -f "/run/secrets/cf_api_token" ]; then
  CF_API_TOKEN=$(cat /run/secrets/cf_api_token)
fi
if [ -f "/run/secrets/cf_zone_id" ]; then
  CF_ZONE_ID=$(cat /run/secrets/cf_zone_id)
fi

# Si no se cargaron desde secrets, usar variables de entorno (si están)
: "${CF_API_TOKEN:=${CF_API_TOKEN:-}}"
: "${CF_ZONE_ID:=${CF_ZONE_ID:-}}"

DOMAINS_JSON="${DOMAINS:-[]}"
INTERVAL="${INTERVAL_SECONDS:-300}"
FEED_URL="${FEED_URL:-https://hayahora.futbol/estado/data.json}"

# Validación mínima
if [ -z "$CF_API_TOKEN" ] || [ -z "$CF_ZONE_ID" ]; then
  echo "❌ ERROR: No se encontraron CF_API_TOKEN o CF_ZONE_ID (ni en secrets ni en variables de entorno)."
  echo "   Monta los secrets o exporta CF_API_TOKEN y CF_ZONE_ID en el entorno."
  exit 1
fi

# --- Función: obtener IP que Cloudflare publica para un registro ---
get_cloudflare_ip() {
  local domain="$1"
  local record="$2"
  local type="$3"
  local fullname

  if [ "$record" = "@" ] || [ -z "$record" ] || [ "$record" = "$domain" ]; then
    fullname="$domain"
  else
    fullname="${record}.${domain}"
  fi

  # Llamada a la API con body + http code (concat)
  local response
  response=$(curl -sS -w "%{http_code}" --max-time 10 \
    -X GET "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=${fullname}&type=${type}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" ) || {
      echo "   ❌ ERROR: fallo en curl al consultar Cloudflare para ${fullname}"
      return 1
    }

  local http_code="${response: -3}"
  local body="${response:0:-3}"

  if [ "$http_code" != "200" ]; then
    # Mostrar info reducida (no imprimir token)
    echo "   ❌ ERROR HTTP $http_code al consultar Cloudflare para ${fullname}"
    # Intentar parsear mensaje de error si viene en JSON
    local cf_err
    cf_err=$(echo "$body" | jq -r '.errors[]?.message // empty' 2>/dev/null || true)
    if [ -n "$cf_err" ]; then
      echo "      Cloudflare error: $cf_err"
    else
      # si no tiene errors, mostrar body truncado
      echo "      Respuesta: $(echo "$body" | tr -d '\n' | cut -c1-300) ..."
    fi
    return 2
  fi

  # Extraer contenido (IP) del primer resultado
  local ip
  ip=$(echo "$body" | jq -r '.result[0].content // empty' 2>/dev/null || true)

  if [ -z "$ip" ]; then
    echo "   ⚠️  No se encontró IP para ${fullname} en Cloudflare (¿registro inexistente o tipo incorrecto?)"
    return 3
  fi

  # Devolver la IP
  printf "%s" "$ip"
  return 0
}

# --- Función: iterador seguro de DOMAINS JSON que devuelve cada objeto en una línea ---
iter_domains() {
  echo "$DOMAINS_JSON" | jq -c '.[]' 2>/dev/null || true
}

# --- Bucle principal ---
while true; do
  echo ""
  echo "[$(date '+%F %T')] 🔍 Paso 1: Obteniendo IPs de Cloudflare (las IPs públicas que ve el mundo)..."

  # Array de IPs a monitorizar
  declare -a MONITOR_IPS
  MONITOR_IPS=()

  # Para cada objeto de DOMAINS
  while IFS= read -r domain_obj; do
    # Si domain_obj está vacío, saltar
    [ -z "$domain_obj" ] && continue

    domain=$(echo "$domain_obj" | jq -r '.name // empty')
    record=$(echo "$domain_obj" | jq -r '.record // "@"')
    type=$(echo "$domain_obj" | jq -r '.type // "A"')
    manual_ip=$(echo "$domain_obj" | jq -r '.manual_ip // empty')

    # Validación básica
    if [ -z "$domain" ]; then
      echo "[$(date '+%F %T')] ⚠️ Entrada inválida en DOMAINS: $domain_obj"
      continue
    fi

    # Si existe manual_ip, usarla sin consultar Cloudflare
    if [ -n "$manual_ip" ] && [ "$manual_ip" != "null" ]; then
      echo "   ├─ ${record}.${domain} → ${manual_ip} (forzada manualmente)"
      MONITOR_IPS+=("$manual_ip")
      continue
    fi

    # Obtener la IP que Cloudflare publica
    ip=$(get_cloudflare_ip "$domain" "$record" "$type") || rc=$?; rc=${rc:-0}

    if [ -n "${ip:-}" ]; then
      echo "   ├─ ${record}.${domain} → ${ip} (IP pública Cloudflare)"
      MONITOR_IPS+=("$ip")
    else
      # get_cloudflare_ip ya imprime el motivo del fallo
      echo "   ├─ ${record}.${domain} → ⚠️  No se pudo obtener IP de Cloudflare"
    fi

  done < <(iter_domains)

  # Si no hay IPs para monitorizar, reintentar pronto
  if [ ${#MONITOR_IPS[@]} -eq 0 ]; then
    echo "[$(date '+%F %T')] ❌ No se pudieron obtener IPs a monitorizar. Reintentando en 60s..."
    sleep 60
    continue
  fi

  # Eliminar duplicados
  IFS=$'\n' read -r -d '' -a UNIQUE_IPS < <(printf "%s\n" "${MONITOR_IPS[@]}" | sort -u && printf '\0')
  MONITOR_IPS=("${UNIQUE_IPS[@]}")

  echo "[$(date '+%F %T')] 📋 IPs a monitorizar: ${MONITOR_IPS[*]}"

  # --- Paso 2: Obtener feed ---
  echo "[$(date '+%F %T')] 🔍 Paso 2: Consultando feed: $FEED_URL"
  feed_raw=$(curl -sS --max-time 10 "$FEED_URL" || true)

  if [ -z "$feed_raw" ] || [ "$feed_raw" = "null" ]; then
    echo "[$(date '+%F %T')] ⚠️ Error al obtener el feed. Reintentando en 60s..."
    sleep 60
    continue
  fi

  # --- Paso 3: Comprobar IPs en el feed ---
  echo "[$(date '+%F %T')] 🔍 Paso 3: Buscando coincidencias en el feed..."
  bloqueo_detectado=false
  blocked_ips=()

  for ip in "${MONITOR_IPS[@]}"; do
    # Buscar en feed: coincidencias por campo ip
    matches=$(echo "$feed_raw" | jq -c --arg ip "$ip" '.data[]? | select(.ip == $ip)' 2>/dev/null || true)

    if [ -z "$matches" ]; then
      echo "   ├─ ℹ️  IP $ip no encontrada en el feed (OK)"
      continue
    fi

    # Si hay una o varias coincidencias, iterar
    while IFS= read -r row; do
      isp=$(echo "$row" | jq -r '.isp // "desconocido"')
      description=$(echo "$row" | jq -r '.description // ""')
      last_state=$(echo "$row" | jq -r '.stateChanges[-1].state // "false"')

      if [ "$last_state" = "true" ]; then
        echo "   ├─ 🔴 IP $ip BLOQUEADA en $isp — $description"
        bloqueo_detectado=true
        blocked_ips+=("$ip")
      else
        echo "   ├─ ✅ IP $ip OK en $isp — $description"
      fi
    done <<< "$matches"
  done

  # --- Paso 4: Decidir acción sobre proxied ---
  if [ "$bloqueo_detectado" = true ]; then
    echo "[$(date '+%F %T')] ⚽ BLOQUEO DETECTADO en: ${blocked_ips[*]}"
    PROXIED=false
    ACTION_DESC="DESACTIVANDO PROXY (nube naranja → gris)"
  else
    echo "[$(date '+%F %T')] ✅ Ningún bloqueo detectado en las IPs monitorizadas"
    PROXIED=true
    ACTION_DESC="ACTIVANDO PROXY (gris → naranja)"
  fi

  # --- Paso 5: Aplicar cambios en Cloudflare via manage_dns.php ---
  echo "[$(date '+%F %T')] 🔄 Paso 5: ${ACTION_DESC} en tus registros..."
  while IFS= read -r domain_obj; do
    [ -z "$domain_obj" ] && continue
    domain=$(echo "$domain_obj" | jq -r '.name // empty')
    record=$(echo "$domain_obj" | jq -r '.record // "@"')
    type=$(echo "$domain_obj" | jq -r '.type // "A"')

    if [ -z "$domain" ]; then
      continue
    fi

    # Llamada al script PHP que actualiza proxied
    php /app/manage_dns.php "$domain" "$record" "$type" "$PROXIED" "$CF_API_TOKEN" "$CF_ZONE_ID" || {
      echo "   ⚠️  manage_dns.php devolvió error para ${record}.${domain} (revisar logs)."
    }
  done < <(iter_domains)

  echo "[$(date '+%F %T')] ✅ Ciclo completado"
  echo "[$(date '+%F %T')] ⏳ Esperando ${INTERVAL} segundos antes de volver a comprobar..."
  sleep "$INTERVAL"

done
