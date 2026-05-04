FROM node:22-alpine
WORKDIR /app
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@10.18.3 && pnpm --version

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
