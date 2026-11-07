# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    TZ=Europe/Prague
# tzdata so TZ is honoured; chromium renders /image.png (fonts: fallback glyphs only,
# the page ships its own web fonts)
RUN apk add --no-cache tzdata chromium font-dejavu
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["node", "src/server.js"]
