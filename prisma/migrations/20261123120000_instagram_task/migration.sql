-- CreateTable
CREATE TABLE "InstagramTaskSettings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "accountsPerPerson" INTEGER NOT NULL DEFAULT 5,
    "postsPerAccount" INTEGER NOT NULL DEFAULT 100,
    "followersPerAccount" INTEGER NOT NULL DEFAULT 1000,
    "prizeRupees" INTEGER NOT NULL DEFAULT 25000,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "changedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramTaskSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramTracker" (
    "employeeId" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramTracker_pkey" PRIMARY KEY ("employeeId")
);

-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "posts" INTEGER NOT NULL DEFAULT 0,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkState" TEXT,
    "checkedPosts" INTEGER,
    "checkedFollowers" INTEGER,
    "checkNote" TEXT,
    "checkedBy" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramAccountEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "employeeId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "posts" INTEGER,
    "followers" INTEGER,
    "note" TEXT,
    "byName" TEXT NOT NULL,
    "byId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramAccountEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramPrize" (
    "employeeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "givenBy" TEXT NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramPrize_pkey" PRIMARY KEY ("employeeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_handle_key" ON "InstagramAccount"("handle");

-- CreateIndex
CREATE INDEX "InstagramAccount_employeeId_idx" ON "InstagramAccount"("employeeId");

-- CreateIndex
CREATE INDEX "InstagramAccountEvent_employeeId_at_idx" ON "InstagramAccountEvent"("employeeId", "at" DESC);

-- CreateIndex
CREATE INDEX "InstagramAccountEvent_accountId_at_idx" ON "InstagramAccountEvent"("accountId", "at" DESC);

-- AddForeignKey
ALTER TABLE "InstagramTracker" ADD CONSTRAINT "InstagramTracker_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramAccount" ADD CONSTRAINT "InstagramAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramAccountEvent" ADD CONSTRAINT "InstagramAccountEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramPrize" ADD CONSTRAINT "InstagramPrize_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

