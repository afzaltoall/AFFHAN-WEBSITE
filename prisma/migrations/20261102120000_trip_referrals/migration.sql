-- AlterTable
ALTER TABLE "TripApplication" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referralDecidedAt" TIMESTAMP(3),
ADD COLUMN     "referralDecidedBy" TEXT,
ADD COLUMN     "referralPayoutId" TEXT,
ADD COLUMN     "referralPoints" INTEGER,
ADD COLUMN     "referralState" TEXT,
ADD COLUMN     "referrerId" TEXT;

-- CreateTable
CREATE TABLE "TripReferralSettings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pointsPerReferral" INTEGER NOT NULL DEFAULT 100,
    "rupeesPerPoint" INTEGER NOT NULL DEFAULT 1,
    "target" INTEGER NOT NULL DEFAULT 100,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "changedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripReferralSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripReferralCode" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripReferralPayout" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "referrals" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "paidBy" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripReferralPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripReferralCode_employeeId_key" ON "TripReferralCode"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "TripReferralCode_code_key" ON "TripReferralCode"("code");

-- CreateIndex
CREATE INDEX "TripReferralPayout_employeeId_paidAt_idx" ON "TripReferralPayout"("employeeId", "paidAt" DESC);

-- CreateIndex
CREATE INDEX "TripApplication_referrerId_idx" ON "TripApplication"("referrerId");

-- AddForeignKey
ALTER TABLE "TripApplication" ADD CONSTRAINT "TripApplication_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripApplication" ADD CONSTRAINT "TripApplication_referralPayoutId_fkey" FOREIGN KEY ("referralPayoutId") REFERENCES "TripReferralPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripReferralCode" ADD CONSTRAINT "TripReferralCode_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripReferralPayout" ADD CONSTRAINT "TripReferralPayout_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

