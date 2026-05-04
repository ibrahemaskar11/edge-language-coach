FROM node:22-alpine
WORKDIR /app
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@10.18.3 && pnpm --version

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/workers/package.json ./apps/workers/
COPY apps/gateway/package.json ./apps/gateway/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

COPY apps/workers/ ./apps/workers/

EXPOSE 3002
CMD ["node_modules/.bin/tsx", "apps/workers/src/index.ts"]
