# GRLHOOD WhatsApp bridge — Chromium preinstalled for whatsapp-web.js
FROM ghcr.io/puppeteer/puppeteer:23.10.4

USER root
WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    CHROME_PATH=/usr/bin/google-chrome-stable \
    WA_DATA_DIR=/app/.wwebjs_auth

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY index.js ./

# Persist the WhatsApp session across restarts (mount a Railway volume here)
VOLUME ["/app/.wwebjs_auth"]

EXPOSE 8080
CMD ["node", "index.js"]
