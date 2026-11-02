-- CreateTable
CREATE TABLE "TripApplicationDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripApplicationDocument_key_key" ON "TripApplicationDocument"("key");

-- CreateIndex
CREATE INDEX "TripApplicationDocument_applicationId_idx" ON "TripApplicationDocument"("applicationId");

-- AddForeignKey
ALTER TABLE "TripApplicationDocument" ADD CONSTRAINT "TripApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "TripApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

