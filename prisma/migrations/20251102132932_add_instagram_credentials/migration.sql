-- CreateTable
CREATE TABLE "InstagramCredential" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "accessToken" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "instagramUsername" TEXT,
    "facebookPageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
