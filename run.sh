#!/bin/bash
echo "===== Iniciando CF Football Bypass INTELIGENTE ====="

# Leer variables desde secrets o entorno directo
if [ -f "$CF_API_TOKEN_FILE" ]; then
    CF_API_TOKEN=$(cat "$CF_API_TOKEN_FILE")
else
    CF_API_TOKEN=${CF_API_TOKEN}
fi

if [ -f "$CF_ZONE_ID_FILE" ]; then
    CF_ZONE_ID=$(cat "$CF_ZONE_ID_FILE")
else
    CF_ZONE_ID=${CF_ZONE_ID}
fi

DOMAINS_JSON=${DOMAINS}
INTERVAL=${INTERVAL_SECONDS:-300}
FEED_URL=${FEED_URL:-"https://hayahora.futbol/estado/data.json"}

if [ -z "$CF_API_TOKEN" ] || [ -z "$CF_ZONE_ID" ]; then
    echo "❌ ERROR: No se encontraron los valores CF_API_TOKEN o CF_ZONE_ID."
    echo "   Asegúrate de definirlos en secrets o variables de entorno."
    exit 1
fi

# Función para obtener IPs de un dominio desde Cloudflare
get_domain_ips() {
    local domain=$1
    local record=$2
    local type=$3
    
    if [ "$record" = "@" ] || [ "$record" = "$domain" ] || [ -z "$record" ]; then
        local fullname="$domain"
    else
        local fullname="$record.$domain"
    fi
    
    local response=$(curl -s -X GET \
        "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records?name=$fullname&type=$type" \
        -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json")

    echo "$response" | jq -r '.result[0].content // empty'
}

while true; do
    echo ""
    echo "[$(date)] 🔍 Paso 1: Obteniendo IPs de tus dominios..."
    
    MY_IPS=()
    for DOMAIN_OBJ in $(echo "$DOMAINS_JSON" | jq -c '.[]'); do
        DOMAIN=$(echo "$DOMAIN_OBJ" | jq -r '.name')
        RECORD=$(echo "$DOMAIN_OBJ" | jq -r '.record')
        TYPE=$(echo "$DOMAIN_OBJ" | jq -r '.type')
        
        if [ "$RECORD" = "@" ] || [ "$RECORD" = "$DOMAIN" ] || [ -z "$RECORD" ]; then
            FULLNAME="$DOMAIN"
        else
            FULLNAME="$RECORD.$DOMAIN"
        fi
        
        IP=$(get_domain_ips "$DOMAIN" "$RECORD" "$TYPE")
        
        if [ -n "$IP" ] && [ "$IP" != "null" ]; then
            echo "   ├─ $FULLNAME → $IP"
            MY_IPS+=("$IP")
        else
            echo "   ├─ $FULLNAME → ⚠️  No se pudo obtener IP"
        fi
    done
    
    if [ ${#MY_IPS[@]} -eq 0 ]; then
        echo "[$(date)] ❌ No se pudieron obtener las IPs. Reintentando en 60s..."
        sleep 60
        continue
    fi
    
    MY_IPS=($(echo "${MY_IPS[@]}" | tr ' ' '\n' | sort -u | tr '\n' ' '))
    echo "[$(date)] 📋 IPs a monitorizar: ${MY_IPS[@]}"
    
    echo "[$(date)] 🔍 Paso 2: Consultando feed oficial..."
    
    FEED=$(curl -s --max-time 10 "$FEED_URL")
    
    if [ -z "$FEED" ] || [ "$FEED" = "null" ]; then
        echo "[$(date)] ⚠️  Error al obtener el feed. Reintentando en 60s..."
        sleep 60
        continue
    fi
    
    echo "[$(date)] 🔍 Paso 3: Buscando tus IPs en el feed..."
    
    BLOQUEO_DETECTADO=false
    IPS_BLOQUEADAS=()
    
    for MY_IP in "${MY_IPS[@]}"; do
        IP_FOUND=false
        
        for row in $(echo "$FEED" | jq -c ".data[] | select(.ip == \"$MY_IP\")"); do
            IP_FOUND=true
            ISP=$(echo "$row" | jq -r '.isp')
            DESCRIPTION=$(echo "$row" | jq -r '.description')
            LAST_STATE=$(echo "$row" | jq -r '.stateChanges[-1].state')
            
            if [ "$LAST_STATE" = "true" ]; then
                echo "   ├─ 🔴 IP $MY_IP BLOQUEADA en $ISP ($DESCRIPTION)"
                BLOQUEO_DETECTADO=true
                IPS_BLOQUEADAS+=("$MY_IP")
            else
                echo "   ├─ ✅ IP $MY_IP OK en $ISP ($DESCRIPTION)"
            fi
        done
        
        if [ "$IP_FOUND" = false ]; then
            echo "   ├─ ℹ️  IP $MY_IP no encontrada en el feed (probablemente no está siendo bloqueada)"
        fi
    done
    
    echo "[$(date)] 🔍 Paso 4: Decidiendo acción..."
    
    if [ "$BLOQUEO_DETECTADO" = true ]; then
        echo "[$(date)] ⚽ BLOQUEO DETECTADO en tus IPs: ${IPS_BLOQUEADAS[@]}"
        echo "[$(date)] 🔧 Quitando proxy de Cloudflare para evitar bloqueos..."
        PROXIED=false
        ACTION_DESC="DESACTIVANDO PROXY"
    else
        echo "[$(date)] ✅ Tus IPs están OK - Sin bloqueos detectados"
        echo "[$(date)] 🔧 Activando proxy de Cloudflare para protección..."
        PROXIED=true
        ACTION_DESC="ACTIVANDO PROXY"
    fi
    
    echo "[$(date)] 🔄 Paso 5: $ACTION_DESC en tus dominios..."
    
    for DOMAIN_OBJ in $(echo "$DOMAINS_JSON" | jq -c '.[]'); do
        DOMAIN=$(echo "$DOMAIN_OBJ" | jq -r '.name')
        RECORD=$(echo "$DOMAIN_OBJ" | jq -r '.record')
        TYPE=$(echo "$DOMAIN_OBJ" | jq -r '.type')
        
        php /app/manage_dns.php "$DOMAIN" "$RECORD" "$TYPE" "$PROXIED" "$CF_API_TOKEN" "$CF_ZONE_ID"
    done
    
    echo "[$(date)] ✅ Ciclo completado"
    echo "[$(date)] ⏳ Esperando $INTERVAL segundos antes de volver a comprobar..."
    sleep $INTERVAL
done
