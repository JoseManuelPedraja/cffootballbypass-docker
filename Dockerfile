FROM node:20-alpine

LABEL org.opencontainers.image.source="https://github.com/JoseManuelPedraja/cffootballbypass-docker"
LABEL org.opencontainers.image.title="CF Football Bypass Panel"
LABEL org.opencontainers.image.description="Monitoring dashboard & autonomous Cloudflare proxy manager"
LABEL org.opencontainers.image.version="3.0.0"

ARG TARGETARCH
RUN apk add --no-cache tini \
    && ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "arm64" || echo "amd64") \
    && wget -q "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}" \
       -O /usr/local/bin/cloudflared \
    && chmod +x /usr/local/bin/cloudflared

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server/ ./server/
COPY public/ ./public/
COPY locales/ ./locales/

RUN mkdir -p /app/data && chown -R node:node /app

USER node

ENV CFB_PORT=3001 \
    CFB_DATA_DIR=/app/data \
    NODE_ENV=production

EXPOSE 3001

VOLUME ["/app/data"]

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://localhost:3001/api/auth/setup-required').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "server/server.js"]
