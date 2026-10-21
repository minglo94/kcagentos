# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -r /var/lib/apt/lists/*
FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Optional managed-cloud CA is ephemeral and never copied into an image layer.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true --no-audit
COPY . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    NEXTAUTH_URL=http://localhost:3000 NEXTAUTH_SECRET=synthetic-build-only \
    ANTHROPIC_API_KEY=synthetic-build-only NEXT_TELEMETRY_DISABLED=1 npm run build && \
    npm prune --omit=dev --ignore-scripts --no-audit

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
