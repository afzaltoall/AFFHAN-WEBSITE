-- CreateTable
CREATE TABLE "InstagramAccountSecret" (
    "accountId" TEXT NOT NULL,
    "sealed" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setBy" TEXT NOT NULL,

    CONSTRAINT "InstagramAccountSecret_pkey" PRIMARY KEY ("accountId")
);

-- AddForeignKey
ALTER TABLE "InstagramAccountSecret" ADD CONSTRAINT "InstagramAccountSecret_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

