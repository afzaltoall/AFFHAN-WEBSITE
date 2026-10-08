-- AlterTable
ALTER TABLE "MobilePhoneOtp" ADD COLUMN     "ipHash" TEXT;

-- CreateIndex
CREATE INDEX "MobilePhoneOtp_ipHash_createdAt_idx" ON "MobilePhoneOtp"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "MobilePhoneOtp_createdAt_idx" ON "MobilePhoneOtp"("createdAt");

