BEGIN;
-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('META', 'GOOGLE');

-- CreateEnum
CREATE TYPE "WorkflowKind" AS ENUM ('SHIPPING', 'ORDER');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SHIPPING';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "adId" TEXT,
ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "orderStatusId" TEXT,
ADD COLUMN     "shippingStatusId" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertisingSpend" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adId" TEXT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvertisingSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStatus" (
    "id" TEXT NOT NULL,
    "kind" "WorkflowKind" NOT NULL,
    "label" TEXT NOT NULL,
    "category" "LeadStatus",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "systemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_platform_active_idx" ON "Campaign"("platform", "active");

-- CreateIndex
CREATE INDEX "Ad_campaignId_active_idx" ON "Ad"("campaignId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Ad_id_campaignId_key" ON "Ad"("id", "campaignId");

-- CreateIndex
CREATE INDEX "AdvertisingSpend_campaignId_date_idx" ON "AdvertisingSpend"("campaignId", "date");

-- CreateIndex
CREATE INDEX "AdvertisingSpend_adId_date_idx" ON "AdvertisingSpend"("adId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStatus_systemKey_key" ON "WorkflowStatus"("systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStatus_kind_label_key" ON "WorkflowStatus"("kind", "label");

-- CreateIndex
CREATE INDEX "Lead_campaignId_date_idx" ON "Lead"("campaignId", "date");

-- CreateIndex
CREATE INDEX "Lead_adId_date_idx" ON "Lead"("adId", "date");

-- CreateIndex
CREATE INDEX "Lead_shippingStatusId_orderStatusId_date_idx" ON "Lead"("shippingStatusId", "orderStatusId", "date");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_adId_campaignId_fkey" FOREIGN KEY ("adId", "campaignId") REFERENCES "Ad"("id", "campaignId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_shippingStatusId_fkey" FOREIGN KEY ("shippingStatusId") REFERENCES "WorkflowStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_orderStatusId_fkey" FOREIGN KEY ("orderStatusId") REFERENCES "WorkflowStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisingSpend" ADD CONSTRAINT "AdvertisingSpend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertisingSpend" ADD CONSTRAINT "AdvertisingSpend_adId_campaignId_fkey" FOREIGN KEY ("adId", "campaignId") REFERENCES "Ad"("id", "campaignId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ad_requires_campaign" CHECK ("adId" IS NULL OR "campaignId" IS NOT NULL);
ALTER TABLE "AdvertisingSpend" ADD CONSTRAINT "AdvertisingSpend_nonnegative" CHECK ("amount" >= 0);
-- One total per level and calendar day. Edit the total rather than duplicating it.
CREATE UNIQUE INDEX "Spend_campaign_day_unique" ON "AdvertisingSpend" ("campaignId", "date") WHERE "adId" IS NULL;
CREATE UNIQUE INDEX "Spend_ad_day_unique" ON "AdvertisingSpend" ("adId", "date") WHERE "adId" IS NOT NULL;

-- Existing sales categories are retained verbatim; no shipping labels are guessed.
INSERT INTO "WorkflowStatus" ("id","kind","label","category","systemKey","updatedAt") VALUES
('legacy-follow-up','ORDER','متابعة','FOLLOW_UP','FOLLOW_UP',CURRENT_TIMESTAMP),
('legacy-confirmed','ORDER','مؤكد','CONFIRMED','CONFIRMED',CURRENT_TIMESTAMP),
('legacy-lost','ORDER','مفقود','LOST','LOST',CURRENT_TIMESTAMP),
('delivered-collected','ORDER','تم التسليم للعميل','CONFIRMED','DELIVERED_COLLECTED',CURRENT_TIMESTAMP);
UPDATE "Lead" SET "orderStatusId" = CASE "status"
 WHEN 'FOLLOW_UP' THEN 'legacy-follow-up' WHEN 'CONFIRMED' THEN 'legacy-confirmed' ELSE 'legacy-lost' END;
COMMIT;
