-- Browsers each account signed in from, for new-device codes and sign-in alerts.

-- CreateTable
CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "lastIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_userId_deviceHash_key" ON "UserDevice"("userId", "deviceHash");

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_shape" CHECK (
  "deviceHash" ~ '^[a-f0-9]{64}$' AND char_length("userAgent") <= 200 AND ("lastIp" IS NULL OR char_length("lastIp") <= 64)
);
