#!/bin/sh
set -e
if [ "$KAJI_ROLE" = "worker" ]; then
  exec pnpm exec tsx src/worker.ts
fi
pnpm exec prisma migrate deploy
exec pnpm exec tsx src/index.ts
