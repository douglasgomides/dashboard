FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates fonts-liberation2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY workers/creative/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src/lib ./src/lib
COPY src/integrations/supabase/types.ts ./src/integrations/supabase/types.ts
COPY api/_lib ./api/_lib
COPY workers/creative/*.ts ./workers/creative/
ENV FFMPEG_PATH=ffmpeg FFPROBE_PATH=ffprobe NODE_ENV=production
USER node
CMD ["node","--import","tsx","workers/creative/main.ts","--once"]
