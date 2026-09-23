# Multi-stage image for the EduTrack API.
#   1. deps    — install every dependency (needed to compile TypeScript and Prisma)
#   2. build   — generate the Prisma client and compile to dist/
#   3. runtime — production dependencies only, running as the unprivileged `node` user
#
# Debian slim (not Alpine) because argon2 and Prisma ship glibc prebuilt binaries.

# ---------------------------------------------------------------- 1. deps ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package*.json ./
RUN npm ci

# --------------------------------------------------------------- 2. build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
# Prisma sniffs the OpenSSL version to pick a query engine; without openssl here it
# guesses wrong and the runtime image ends up with an engine it cannot use.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# Drop dev dependencies from the node_modules we will copy into the runtime image.
RUN npm prune --omit=dev

# ------------------------------------------------------------- 3. runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    PORT=3000

# openssl is required by the Prisma query engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app/node_modules ./node_modules
# `npm prune` can drop the generated client, which lives in node_modules/.prisma
# rather than in a package — copy it back explicitly.
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json

# `node` is a non-root user that already exists in the official image.
USER node
EXPOSE 3000

# The container is healthy once the liveness probe answers.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
