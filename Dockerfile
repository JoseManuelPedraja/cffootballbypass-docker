FROM php:8.4-cli-alpine3.22

LABEL maintainer="SurMod"
LABEL description="CF Football Bypass - Automatic Cloudflare proxy management for La Liga blocks"
LABEL version="2.0.0"
LABEL org.opencontainers.image.source="https://github.com/SurMod/cffootballbypass-docker"

RUN apk add --no-cache \
    curl \
    jq \
    busybox \
    bash \
    bind-tools \
    ca-certificates \
    tzdata

ENV TZ=Europe/Madrid
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

COPY run.sh manage_dns.php /app/
RUN chmod +x /app/run.sh && \
    chmod 644 /app/manage_dns.php

RUN mkdir -p /app/logs /app/data

RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser -s /bin/bash appuser && \
    chown -R appuser:appuser /app

USER appuser

ENV FEED_URL="https://hayahora.futbol/estado/data.json" \
    DOMAINS="[]" \
    INTERVAL_SECONDS=300 \
    CF_API_TOKEN="" \
    CF_ZONE_ID="" \
    STALE_THRESHOLD_HOURS=6 \
    MIN_ISPS_BLOCKED=2 \
    FORCE_PROXY_OFF_OVERRIDE=0 \
    COOLDOWN_MINUTES=60

HEALTHCHECK --interval=60s \
            --timeout=10s \
            --start-period=15s \
            --retries=3 \
    CMD curl -f -s -m 5 https://hayahora.futbol/estado/data.json > /dev/null || exit 1

CMD ["./run.sh"]
