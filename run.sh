#!/usr/bin/env bash
# CF Football Bypass — Docker entrypoint v2.1.0
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

# ── Resolve secrets (support _FILE env vars and Docker secrets) ────
resolve_secret() {
    local name="$1"
    local file_var="${name}_FILE"
    local file_path="${!file_var:-}"
    local direct="${!name:-}"

    if [ -n "$file_path" ] && [ -f "$file_path" ]; then
        cat "$file_path" | tr -d '\n'
        return
    fi

    local secret_path="/run/secrets/$(echo "$name" | tr '[:upper:]' '[:lower:]')"
    if [ -f "$secret_path" ]; then
        cat "$secret_path" | tr -d '\n'
        return
    fi

    echo "$direct"
}

# ── Configuration ───────────────────────────────────────────────────
FEED_URL="${FEED_URL:-https://hayahora.futbol/estado/data.json}"
DOMAINS="${DOMAINS:-[]}"
INTERVAL="${INTERVAL_SECONDS:-300}"
CF_AUTH_TYPE="${CF_AUTH_TYPE:-token}"
CF_API_TOKEN="$(resolve_secret CF_API_TOKEN)"
CF_ZONE_ID="$(resolve_secret CF_ZONE_ID)"
CF_EMAIL="${CF_EMAIL:-}"
CF_ACCOUNT_ID="${CF_ACCOUNT_ID:-}"
STALE_THRESHOLD_HOURS="${STALE_THRESHOLD_HOURS:-6}"
MIN_ISPS_BLOCKED="${MIN_ISPS_BLOCKED:-2}"
FORCE_PROXY_OFF_OVERRIDE="${FORCE_PROXY_OFF_OVERRIDE:-0}"
COOLDOWN_MINUTES="${COOLDOWN_MINUTES:-60}"

# Logging
LOG_ENABLED="${LOG_ENABLED:-1}"
LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-30}"

# Email notifications
NOTIFY_EMAIL="${NOTIFY_EMAIL:-}"
NOTIFY_FROM="${NOTIFY_FROM:-cfb@localhost}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_TLS="${SMTP_TLS:-on}"

DATA_DIR="/app/data"
LOG_DIR="/app/logs"
LOCAL_FEED="$DATA_DIR/data.json"
STATE_FILE="$DATA_DIR/state.json"
LOG_FILE="$LOG_DIR/cfb.log"

mkdir -p "$DATA_DIR" "$LOG_DIR"

# ── File logging ───────────────────────────────────────────────────
log_to_file() {
    if [ "$LOG_ENABLED" != "1" ]; then return; fi
    local type="$1" message="$2" context="${3:-}"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    local entry="{\"time\":\"$ts\",\"type\":\"$type\",\"message\":\"$message\""
    if [ -n "$context" ]; then
        entry="$entry,\"context\":$context"
    fi
    entry="$entry}"
    echo "$entry" >> "$LOG_FILE"
}

prune_old_logs() {
    if [ "$LOG_ENABLED" != "1" ]; then return; fi
    if [ ! -f "$LOG_FILE" ]; then return; fi
    local size
    size=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$size" -lt 10240 ]; then return; fi

    local cutoff
    cutoff=$(date -d "-${LOG_RETENTION_DAYS} days" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "")
    if [ -z "$cutoff" ]; then return; fi

    local tmp
    tmp=$(mktemp)
    while IFS= read -r line; do
        local t
        t=$(echo "$line" | jq -r '.time // empty' 2>/dev/null || echo "")
        if [ -n "$t" ] && [ "$t" \> "$cutoff" ]; then
            echo "$line" >> "$tmp"
        fi
    done < "$LOG_FILE"
    mv "$tmp" "$LOG_FILE"
}

# ── Email notifications ────────────────────────────────────────────
LAST_EMAIL_SENT=0

configure_msmtp() {
    if [ -z "$SMTP_HOST" ] || [ -z "$NOTIFY_EMAIL" ]; then return 1; fi

    local conf="/tmp/.msmtprc"
    cat > "$conf" <<MSMTP
defaults
tls            $SMTP_TLS
tls_trust_file /etc/ssl/certs/ca-certificates.crt
logfile        /dev/null

account        default
host           $SMTP_HOST
port           $SMTP_PORT
from           $NOTIFY_FROM
MSMTP

    if [ -n "$SMTP_USER" ]; then
        echo "auth           on" >> "$conf"
        echo "user           $SMTP_USER" >> "$conf"
        echo "password       $SMTP_PASS" >> "$conf"
    else
        echo "auth           off" >> "$conf"
    fi

    chmod 600 "$conf"
    return 0
}

send_notification() {
    local subject="$1" body="$2"
    if [ -z "$NOTIFY_EMAIL" ]; then return; fi

    local now_ts
    now_ts=$(date +%s)
    local throttle=120
    if [ "$LAST_EMAIL_SENT" -gt 0 ] && [ $((now_ts - LAST_EMAIL_SENT)) -lt "$throttle" ]; then
        log_debug "Email throttled (${throttle}s cooldown)"
        return
    fi

    if [ -n "$SMTP_HOST" ]; then
        if ! configure_msmtp; then
            log_warn "SMTP not configured properly"
            return
        fi
        printf "Subject: %s\nFrom: %s\nTo: %s\nContent-Type: text/plain; charset=utf-8\n\n%s\n" \
            "$subject" "$NOTIFY_FROM" "$NOTIFY_EMAIL" "$body" | \
            msmtp --file="/tmp/.msmtprc" "$NOTIFY_EMAIL" 2>/dev/null && {
                LAST_EMAIL_SENT=$now_ts
                log_info "Notification sent to $(anonymize_ip "$NOTIFY_EMAIL")"
                log_to_file "email" "Notification sent" "{\"to\":\"$(anonymize_ip "$NOTIFY_EMAIL")\"}"
            } || {
                log_warn "Failed to send notification"
                log_to_file "email" "Notification FAILED" "{\"to\":\"$(anonymize_ip "$NOTIFY_EMAIL")\"}"
            }
    else
        if command -v sendmail >/dev/null 2>&1; then
            printf "Subject: %s\nFrom: %s\nTo: %s\nContent-Type: text/plain; charset=utf-8\n\n%s\n" \
                "$subject" "$NOTIFY_FROM" "$NOTIFY_EMAIL" "$body" | \
                sendmail "$NOTIFY_EMAIL" 2>/dev/null && {
                    LAST_EMAIL_SENT=$now_ts
                    log_info "Notification sent via sendmail"
                } || log_warn "sendmail failed"
        else
            log_warn "No email transport available (set SMTP_HOST or install sendmail)"
        fi
    fi
}

notify_state_change() {
    local active="$1" reason="${2:-}"
    if [ -z "$NOTIFY_EMAIL" ]; then return; fi

    local domain_list
    domain_list=$(echo "$DOMAINS" | jq -r '.[].domain // .[].name // empty' 2>/dev/null | head -5 | tr '\n' ', ' | sed 's/,$//')

    if [ "$active" = "true" ]; then
        send_notification \
            "[CFB] Cloudflare proxy disabled — football blocks" \
            "Active IP blocks from La Liga detected.
Cloudflare proxy has been automatically disabled.

Domains: ${domain_list:-unknown}
State: Proxy OFF (DNS Only)
Reason: ${reason}

Proxy will be re-enabled once blocks end and cooldown passes.

-- CF Football Bypass Docker v2.1.0"
    else
        send_notification \
            "[CFB] Cloudflare proxy re-enabled" \
            "No active La Liga IP blocks detected.
Cloudflare proxy re-enabled automatically.

Domains: ${domain_list:-unknown}
State: Proxy ON (CDN)

-- CF Football Bypass Docker v2.1.0"
    fi
}

# ── Validate ────────────────────────────────────────────────────────
if [ -z "$CF_API_TOKEN" ]; then
    log_error "CF_API_TOKEN is required"
    exit 1
fi

if [ -z "$CF_ZONE_ID" ]; then
    log_error "CF_ZONE_ID is required"
    exit 1
fi

if ! echo "$CF_AUTH_TYPE" | grep -qE '^(global|token|account_token)$'; then
    log_warn "Invalid CF_AUTH_TYPE '$CF_AUTH_TYPE', defaulting to 'token'"
    CF_AUTH_TYPE="token"
fi

if [ "$CF_AUTH_TYPE" = "global" ] && [ -z "$CF_EMAIL" ]; then
    log_error "CF_EMAIL is required for Global API Key authentication"
    exit 1
fi

if [ "$CF_AUTH_TYPE" = "account_token" ] && [ -z "$CF_ACCOUNT_ID" ]; then
    log_error "CF_ACCOUNT_ID is required for Account API Token authentication"
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
        --user-agent "CFB-Docker/2.1" \
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
        log_to_file "error" "Feed unavailable"
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

    local any_disabled=false
    local last_reason="domain_clear"

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
            any_disabled=true
            last_reason="$reason"
        fi

        local anon_ips
        anon_ips=$(echo "$domain_ips" | while IFS= read -r ip; do [ -n "$ip" ] && anonymize_ip "$ip"; done | tr '\n' ',' | sed 's/,$//')

        if [ "$should_disable" = "true" ]; then
            log_info "${RED}${fullname}${NC}: Proxy OFF (reason: ${reason}, IPs: ${anon_ips:-none})"
        else
            log_info "${GREEN}${fullname}${NC}: Proxy ON (domain clear)"
        fi

        php /app/manage_dns.php "$domain" "$record_name" "$record_type" "$desired_proxy" \
            "$CF_API_TOKEN" "$CF_ZONE_ID" "$CF_AUTH_TYPE" "$CF_EMAIL"
    done

    # Update state
    local new_active=false
    if [ "$any_disabled" = "true" ]; then
        new_active=true
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
            notify_state_change "true" "$last_reason"
        else
            log_info "State changed: bypass DEACTIVATED, proxy restored"
            notify_state_change "false"
        fi
    fi

    log_to_file "cron" "Auto-check" "{\"general\":\"${general_blocked}\",\"blocked\":${blocked_count},\"isps\":${isp_count},\"bypass\":\"${new_active}\",\"reason\":\"${last_reason}\"}"

    log_info "Check cycle complete. Next in ${INTERVAL}s"
}

# ── Banner ──────────────────────────────────────────────────────────
echo -e "${WHITE}┌─────────────────────────────────────────────┐${NC}"
echo -e "${WHITE}│   CF Football Bypass — Docker v2.1.0        │${NC}"
echo -e "${WHITE}│   Cloudflare proxy management for La Liga   │${NC}"
echo -e "${WHITE}└─────────────────────────────────────────────┘${NC}"
echo ""
log_info "Feed URL: ${FEED_URL}"
log_info "Domains: ${DOMAIN_COUNT}"
log_info "Interval: ${INTERVAL}s"
log_info "Auth type: ${CF_AUTH_TYPE}"
log_info "Zone ID: ${CF_ZONE_ID:0:8}***"
log_info "Stale threshold: ${STALE_THRESHOLD_HOURS}h"
log_info "Min ISPs: ${MIN_ISPS_BLOCKED}"
log_info "Force override: ${FORCE_PROXY_OFF_OVERRIDE}"
log_info "Cooldown: ${COOLDOWN_MINUTES}min"
log_info "Logging: $([ "$LOG_ENABLED" = "1" ] && echo "enabled (${LOG_RETENTION_DAYS}d retention)" || echo "disabled")"
if [ -n "$NOTIFY_EMAIL" ]; then
    log_info "Notifications: $(anonymize_ip "$NOTIFY_EMAIL") via ${SMTP_HOST:-sendmail}"
else
    log_info "Notifications: disabled"
fi
echo ""

prune_old_logs

# ── Main loop ───────────────────────────────────────────────────────
while true; do
    check_and_manage || log_error "Check cycle failed"
    sleep "$INTERVAL"
done
