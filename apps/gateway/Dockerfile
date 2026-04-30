FROM node:22-alpine
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/gateway/package.json ./apps/gateway/
COPY apps/workers/package.json ./apps/workers/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
COPY apps/gateway/ ./apps/gateway/

EXPOSE 3001
CMD ["node_modules/.bin/tsx", "apps/gateway/src/server.ts"]
