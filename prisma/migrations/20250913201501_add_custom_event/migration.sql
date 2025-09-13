-- CreateTable
CREATE TABLE "CustomEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "customerId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomEvent_tenantId_type_idx" ON "CustomEvent"("tenantId", "type");

-- CreateIndex
CREATE INDEX "CustomEvent_tenantId_occurredAt_idx" ON "CustomEvent"("tenantId", "occurredAt");

-- AddForeignKey
ALTER TABLE "CustomEvent" ADD CONSTRAINT "CustomEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomEvent" ADD CONSTRAINT "CustomEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
