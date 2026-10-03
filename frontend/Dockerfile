# Multi-stage image for the EduTrack web app.
#   1. build   — install dependencies and produce the static bundle in dist/
#   2. runtime — nginx serving that bundle, as an unprivileged user
#
# The output is a static site: no Node at runtime, ~40 MB total.
#
# IMPORTANT — Vite inlines VITE_* variables at BUILD time, not at run time.
# Setting VITE_API_URL on the container does nothing; it has to be a build arg,
# which is why they are declared below. One image therefore belongs to one
# configuration. If you would rather build once and configure per deployment,
# put the API behind the same hostname as the web app (an ingress or a reverse
# proxy routing /api to the API) and build with the relative default below.

# --------------------------------------------------------------- 1. build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# Backend base URL. Relative by default, so the bundle makes same-origin calls
# and whatever sits in front routes /api to the API — no CORS, and no rebuild
# when the API moves. Pass an absolute URL to talk to another origin instead,
# and add it to the API's CORS_ORIGINS. Empty = run on the local demo store.
ARG VITE_API_URL=/api/v1

# Demo data is OFF by default: a client's instance must never ship with it
# (docs/HOSTING.md), so an unconfigured production build starts empty and takes
# the owner through the setup wizard. Pass true only for demos and screenshots.
ARG VITE_DEMO_DATA=false

# Shown in diagnostics and crash reports.
ARG VITE_APP_VERSION=0.1.0

ENV VITE_API_URL=$VITE_API_URL \
    VITE_DEMO_DATA=$VITE_DEMO_DATA \
    VITE_APP_VERSION=$VITE_APP_VERSION

COPY package*.json ./
RUN npm ci

COPY . .
# `npm run build` type-checks first, so a type error fails the image rather than
# shipping a broken bundle.
RUN npm run build

# ------------------------------------------------------------- 2. runtime ----
# nginx-unprivileged rather than plain nginx: it listens on 8080 and runs as the
# `nginx` user with no root anywhere, the same principle as the API image. Map it
# to whatever port you like from outside.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
