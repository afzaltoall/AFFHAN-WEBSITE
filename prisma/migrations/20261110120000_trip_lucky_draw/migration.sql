-- CreateTable
CREATE TABLE "TripDraw" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'live',
    "number" INTEGER NOT NULL,
    "applicationId" TEXT NOT NULL,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "drawnBy" TEXT NOT NULL,
    "poolSize" INTEGER NOT NULL,
    "poolHash" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "releasedBy" TEXT,
    "releaseNote" TEXT,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "TripDraw_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripDraw_requestId_key" ON "TripDraw"("requestId");

-- CreateIndex
CREATE INDEX "TripDraw_applicationId_idx" ON "TripDraw"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "TripDraw_mode_number_key" ON "TripDraw"("mode", "number");

-- AddForeignKey
ALTER TABLE "TripDraw" ADD CONSTRAINT "TripDraw_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "TripApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

