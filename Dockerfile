FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@11.26.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/platform/package.json apps/platform/package.json
COPY packages/agent/package.json packages/agent/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kaji"
RUN pnpm --filter api exec prisma generate

WORKDIR /app/apps/api

EXPOSE 8000

CMD ["sh", "start.sh"]
