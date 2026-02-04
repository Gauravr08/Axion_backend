-- AlterTable
ALTER TABLE "api_usage" ADD COLUMN     "bbox" TEXT,
ADD COLUMN     "message" TEXT,
ADD COLUMN     "projectType" TEXT;

-- CreateIndex
CREATE INDEX "api_usage_endpoint_createdAt_idx" ON "api_usage"("endpoint", "createdAt");

-- CreateIndex
CREATE INDEX "api_usage_apiKeyId_createdAt_idx" ON "api_usage"("apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "api_usage_success_createdAt_idx" ON "api_usage"("success", "createdAt");

-- CreateIndex
CREATE INDEX "api_usage_toolUsed_idx" ON "api_usage"("toolUsed");

-- CreateIndex
CREATE INDEX "api_usage_projectType_idx" ON "api_usage"("projectType");
