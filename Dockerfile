FROM node:24-bookworm-slim AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build

ENV PYTHON=/usr/bin/python3

RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    make \
    openssl \
    python3 \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY next.config.ts postcss.config.mjs components.json ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate

ARG SOURCE_REVISION=unknown

COPY . .

RUN printf '%s\n' "$SOURCE_REVISION" > /app/.build-revision
RUN pnpm build
RUN cp -r public .next/standalone/ \
  && cp -r .next/static .next/standalone/.next/

FROM node:24-bookworm-slim AS runner

ARG SOURCE_REVISION=unknown

LABEL org.opencontainers.image.revision=$SOURCE_REVISION

ENV HOSTNAME=0.0.0.0 \
  NEXT_TELEMETRY_DISABLED=1 \
  NODE_ENV=production \
  PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 10001 app \
  && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
  && mkdir -p /app \
  && chown -R app:app /app

WORKDIR /app

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.build-revision ./.build-revision
COPY --from=build --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=app:app /app/node_modules/@prisma ./node_modules/@prisma

USER app

EXPOSE 3000

CMD ["node", "server.js"]
