#!/usr/bin/env bash
# CF Football Bypass — Docker entrypoint
# Periodically checks football block status and manages Cloudflare DNS proxy.
set -euo pipefail

# ── ANSI colors ─────────────────────────────────────────────────────
GRAY='\033[0;90m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

LOG_FILE="/app/logs/cfb-docker.log"

log() {
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${GRAY}[${ts}]${NC} $*"
    # Strip ANSI codes for file output
    local clean
    clean=$(echo -e "$*" | sed 's/\x1b\[[0-9;]*m//g')
    echo "[${ts}] ${clean}" >> "$LOG_FILE" 2>/dev/null || true
}

log_info()  { log "${GREEN}INFO${NC}  │ $*"; }
log_warn()  { log "${YELLOW}WARN${NC}  │ $*"; }
log_error() { log "${RED}ERROR${NC} │ $*"; }
log_debug() { log "${GRAY}DEBUG${NC} │ $*"; }

anonymize_ip() {
    local ip="$1"
    if echo "$ip" | grep -qP '^\d+\.\d+\.\d+\.\d+$'; then
        echo "$ip" | sed -E 's/^([0-9]+\.[0-9]+)\..*/\1.xxx.xxx/'
    elif echo "$ip" | grep -q ':'; then
        echo "$ip" | sed -E 's/^(([0-9a-fA-F]+:){2}[0-9a-fA-F]+).*/\1:xxxx:xxxx:xxxx:xxxx:xxxx/'
    else
        echo "xxx.xxx.xxx.xxx"
    fi
}

# ── Read secrets (supports _FILE, /run/secrets/, and env vars) ─────
read_secret() {
    local name="$1" file_var="${1}_FILE" value=""
    # 1. Explicit _FILE variable
    if [ -n "${!file_var:-}" ] && [ -f "${!file_var}" ]; then
        value=$(cat "${!file_var}" | tr -d '\n\r')
        log_info "${GREEN}SECURITY${NC} │ ${name} loaded from ${!file_var}"
    # 2. Auto-detect Docker secret
    elif [ -f "/run/secrets/${name,,}" ]; then
        value=$(cat "/run/secrets/${name,,}" | tr -d '\n\r')
        log_info "${GREEN}SECURITY${NC} │ ${name} loaded from /run/secrets/${name,,}"
    # 3. Direct environment variable
    elif [ -n "${!name:-}" ]; then
        value="${!name}"
    fi
    echo "$value"
}

# ── Configuration ───────────────────────────────────────────────────
FEED_URL="${FEED_URL:-https://hayahora.futbol/estado/data.json}"
DOMAINS="${DOMAINS:-[]}"
INTERVAL="${INTERVAL_SECONDS:-300}"
CF_API_TOKEN=$(read_secret CF_API_TOKEN)
CF_ZONE_ID=$(read_secret CF_ZONE_ID)
STALE_THRESHOLD_HOURS="${STALE_THRESHOLD_HOURS:-6}"
MIN_ISPS_BLOCKED="${MIN_ISPS_BLOCKED:-2}"
FORCE_PROXY_OFF_OVERRIDE="${FORCE_PROXY_OFF_OVERRIDE:-0}"
COOLDOWN_MINUTES="${COOLDOWN_MINUTES:-60}"

DATA_DIR="/app/data"
LOG_DIR="/app/logs"
LOCAL_FEED="$DATA_DIR/data.json"
STATE_FILE="$DATA_DIR/state.json"

mkdir -p "$DATA_DIR" "$LOG_DIR"

# ── Validate ────────────────────────────────────────────────────────
if [ -z "$CF_API_TOKEN" ]; then
    log_error "CF_API_TOKEN is required"
    exit 1
fi

if [ -z "$CF_ZONE_ID" ]; then
    log_error "CF_ZONE_ID is required"
    exit 1
fi

if ! echo "$DOMAINS" | jq -e 'type == "array"' > /dev/null 2>&1; then
    log_error "DOMAINS must be a valid JSON array"
    exit 1
fi

DOMAIN_COUNT=$(echo "$DOMAINS" | jq length)
if [ "$DOMAIN_COUNT" -eq 0 ]; then
    log_error "DOMAINS array is empty"
    exit 1
fi

# ── State management ────────────────────────────────────────────────
load_state() {
    if [ -f "$STATE_FILE" ]; then
        cat "$STATE_FILE"
    else
        echo '{"bypass_active":false,"last_change":0,"blocked_ips":[]}'
    fi
}

save_state() {
    echo "$1" > "$STATE_FILE"
}

# ── Feed fetch ──────────────────────────────────────────────────────
fetch_feed() {
    local http_code body tmp
    tmp=$(mktemp)

    http_code=$(curl -s -o "$tmp" -w '%{http_code}' \
        --max-time 25 \
        --user-agent "CFB-Docker/2.0" \
        "$FEED_URL" 2>/dev/null) || true

    if [ "$http_code" = "200" ] && jq -e . "$tmp" > /dev/null 2>&1; then
        cp "$tmp" "$LOCAL_FEED"
        rm -f "$tmp"
        return 0
    fi

    rm -f "$tmp"

    if [ -f "$LOCAL_FEED" ] && jq -e . "$LOCAL_FEED" > /dev/null 2>&1; then
        log_warn "Remote feed unavailable (HTTP $http_code), using local cache"
        return 0
    fi

    log_error "Feed unavailable and no local cache (HTTP $http_code)"
    return 1
}

# ── Check logic ─────────────────────────────────────────────────────
check_and_manage() {
    log_info "Starting check cycle..."

    if ! fetch_feed; then
        log_error "Cannot proceed without feed data"
        return
    fi

    local feed_data
    feed_data=$(cat "$LOCAL_FEED")

    local last_update
    last_update=$(echo "$feed_data" | jq -r '.lastUpdate // empty')

    # Check staleness
    local is_stale=false
    if [ -n "$last_update" ]; then
        local feed_ts now_ts diff_hours
        feed_ts=$(date -d "$last_update" +%s 2>/dev/null || echo 0)
        now_ts=$(date +%s)
        if [ "$feed_ts" -gt 0 ]; then
            diff_hours=$(( (now_ts - feed_ts) / 3600 ))
            if [ "$diff_hours" -ge "$STALE_THRESHOLD_HOURS" ]; then
                is_stale=true
                log_warn "Feed data is stale (${diff_hours}h old, threshold: ${STALE_THRESHOLD_HOURS}h)"
            fi
        fi
    fi

    # Count blocked IPs and ISPs
    local blocked_count=0 isp_count=0
    if [ "$is_stale" = "false" ]; then
        blocked_count=$(echo "$feed_data" | jq '[.ips // {} | to_entries[] | select(
            (.value == true) or
            ((.value | type) == "object" and .value.blocked == true)
        )] | length')

        isp_count=$(echo "$feed_data" | jq '[
            (.isps // {} | to_entries[] | select(.value.blocked == true) | .key),
            (.ips // {} | to_entries[] | select(
                ((.value | type) == "object") and .value.blocked == true and .value.isp != null
            ) | .value.isp)
        ] | unique | length')
    fi

    # Determine general blocked
    local general_blocked=false
    if [ "$blocked_count" -gt 0 ] && [ "$is_stale" = "false" ]; then
        if [ "$isp_count" -eq 0 ]; then
            general_blocked=true
        elif [ "$isp_count" -ge "$MIN_ISPS_BLOCKED" ]; then
            general_blocked=true
        fi
    fi

    log_info "Feed: ${blocked_count} blocked IPs, ${isp_count} ISPs (min: ${MIN_ISPS_BLOCKED}), general: ${general_blocked}, stale: ${is_stale}"
    if [ -n "$last_update" ]; then
        log_debug "Last feed update: $last_update"
    fi

    local state
    state=$(load_state)

    local prev_active last_change_ts now_ts cooldown_seconds
    prev_active=$(echo "$state" | jq -r '.bypass_active')
    last_change_ts=$(echo "$state" | jq -r '.last_change // 0')
    now_ts=$(date +%s)
    cooldown_seconds=$((COOLDOWN_MINUTES * 60))

    # Process each domain
    for i in $(seq 0 $((DOMAIN_COUNT - 1))); do
        local domain record_name record_type
        domain=$(echo "$DOMAINS" | jq -r ".[$i].domain // .[$i].name // empty")
        record_name=$(echo "$DOMAINS" | jq -r ".[$i].record // \"@\"")
        record_type=$(echo "$DOMAINS" | jq -r ".[$i].type // \"A\"")

        if [ -z "$domain" ]; then
            log_warn "Skipping entry $i: missing domain"
            continue
        fi

        # Resolve domain IPs
        local fullname
        if [ "$record_name" = "@" ] || [ -z "$record_name" ]; then
            fullname="$domain"
        else
            fullname="${record_name}.${domain}"
        fi

        local domain_blocked=false
        local domain_ips
        domain_ips=$(dig +short "$fullname" "$record_type" 2>/dev/null | head -5)

        if [ -n "$domain_ips" ] && [ "$is_stale" = "false" ]; then
            while IFS= read -r ip; do
                if [ -n "$ip" ]; then
                    local ip_blocked
                    ip_blocked=$(echo "$feed_data" | jq -r --arg ip "$ip" '
                        (.ips[$ip] // false) |
                        if . == true then "true"
                        elif (type == "object") and .blocked == true then "true"
                        else "false" end')
                    if [ "$ip_blocked" = "true" ]; then
                        domain_blocked=true
                    fi
                fi
            done <<< "$domain_ips"
        fi

        # Decide proxy state
        local should_disable=false reason="domain_clear"

        if [ "$domain_blocked" = "true" ]; then
            should_disable=true
            reason="domain_blocked"
        elif [ "$FORCE_PROXY_OFF_OVERRIDE" = "1" ] && [ "$general_blocked" = "true" ]; then
            should_disable=true
            reason="override_general"
        fi

        # Cooldown logic
        if [ "$should_disable" = "false" ] && [ "$prev_active" = "true" ]; then
            if [ "$last_change_ts" -gt 0 ] && [ $((now_ts - last_change_ts)) -lt "$cooldown_seconds" ]; then
                should_disable=true
                reason="cooldown"
                local remaining=$(( (cooldown_seconds - (now_ts - last_change_ts)) / 60 ))
                log_info "${CYAN}${fullname}${NC}: cooldown active (${remaining}min remaining)"
            fi
        fi

        local desired_proxy=true
        if [ "$should_disable" = "true" ]; then
            desired_proxy=false
        fi

        local anon_ips
        anon_ips=$(echo "$domain_ips" | while IFS= read -r ip; do [ -n "$ip" ] && anonymize_ip "$ip"; done | tr '\n' ',' | sed 's/,$//')

        if [ "$should_disable" = "true" ]; then
            log_info "${RED}${fullname}${NC}: Proxy OFF (reason: ${reason}, IPs: ${anon_ips:-none})"
        else
            log_info "${GREEN}${fullname}${NC}: Proxy ON (domain clear)"
        fi

        php /app/manage_dns.php "$domain" "$record_name" "$record_type" "$desired_proxy" "$CF_API_TOKEN" "$CF_ZONE_ID"
    done

    # Update state
    local new_active=false
    if echo "$DOMAINS" | jq -e 'length > 0' > /dev/null 2>&1; then
        # Use the last domain's decision (simplified — in practice all domains share the same feed)
        if [ "$should_disable" = "true" ]; then
            new_active=true
        fi
    fi

    local new_state
    if [ "$new_active" = "true" ] && [ "$prev_active" != "true" ]; then
        new_state=$(jq -n --argjson active true --argjson ts "$now_ts" '{"bypass_active":$active,"last_change":$ts,"blocked_ips":[]}')
    elif [ "$new_active" = "false" ] && [ "$prev_active" = "true" ]; then
        new_state=$(jq -n --argjson active false --argjson ts "$now_ts" '{"bypass_active":$active,"last_change":$ts,"blocked_ips":[]}')
    else
        new_state=$(echo "$state" | jq --argjson active "$new_active" '.bypass_active = $active')
    fi

    save_state "$new_state"

    if [ "$new_active" != "$prev_active" ]; then
        if [ "$new_active" = "true" ]; then
            log_warn "State changed: bypass ACTIVATED"
        else
            log_info "State changed: bypass DEACTIVATED, proxy restored"
        fi
    fi

    log_info "Check cycle complete. Next in ${INTERVAL}s"
}

# ── Banner ──────────────────────────────────────────────────────────
echo -e "${WHITE}┌─────────────────────────────────────────────┐${NC}"
echo -e "${WHITE}│   CF Football Bypass — Docker v2.0.1        │${NC}"
echo -e "${WHITE}│   Cloudflare proxy management for La Liga   │${NC}"
echo -e "${WHITE}└─────────────────────────────────────────────┘${NC}"
echo ""
log_info "Feed URL: ${FEED_URL}"
log_info "Domains: ${DOMAIN_COUNT}"
log_info "Interval: ${INTERVAL}s"
log_info "Zone ID: ${CF_ZONE_ID:0:8}***"
log_info "Stale threshold: ${STALE_THRESHOLD_HOURS}h"
log_info "Min ISPs: ${MIN_ISPS_BLOCKED}"
log_info "Force override: ${FORCE_PROXY_OFF_OVERRIDE}"
log_info "Cooldown: ${COOLDOWN_MINUTES}min"
echo ""

# ── Log rotation (keep last 50KB) ──────────────────────────────────
rotate_log() {
    if [ -f "$LOG_FILE" ]; then
        local size
        size=$(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$size" -gt 51200 ]; then
            tail -c 25600 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
        fi
    fi
}

# ── Main loop ───────────────────────────────────────────────────────
while true; do
    rotate_log
    check_and_manage || log_error "Check cycle failed"
    sleep "$INTERVAL"
done
