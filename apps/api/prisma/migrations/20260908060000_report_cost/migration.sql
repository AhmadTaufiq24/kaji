-- AlterTable
ALTER TABLE "Report" ADD COLUMN "inputTokens" INTEGER,
ADD COLUMN "outputTokens" INTEGER,
ADD COLUMN "costUsd" DOUBLE PRECISION,
ADD COLUMN "langfuseTraceId" TEXT;
