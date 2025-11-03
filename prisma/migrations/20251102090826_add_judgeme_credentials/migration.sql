-- CreateTable
CREATE TABLE "JudgeMeCredential" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "accessToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
