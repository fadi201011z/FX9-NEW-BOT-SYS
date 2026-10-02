# ─── KRS Bot — Northflank / Production Dockerfile ─────────────────────────
# Debian slim (glibc) وليس Alpine (musl):
# @napi-rs/canvas وحدة أصلية، ونسخة Alpine تحتاج musl build وقد تتعطل.
FROM node:22-slim

WORKDIR /app

# 1) تثبيت الاعتماديات أولاً (طبقة مخبأة)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 2) الكود
COPY src ./src

# 3) ملفات ثابتة يقرأها الكود من القرص
COPY assets ./assets
COPY fonts ./fonts
COPY data ./data

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["node", "src/index.js"]
