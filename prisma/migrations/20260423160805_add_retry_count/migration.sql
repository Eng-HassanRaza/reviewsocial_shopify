-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PostedReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "productTitle" TEXT,
    "reviewerName" TEXT,
    "rating" INTEGER NOT NULL,
    "reviewText" TEXT,
    "instagramPostId" TEXT,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "postedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_PostedReview" ("error", "id", "imageUrl", "instagramPostId", "postedAt", "productTitle", "rating", "reviewId", "reviewText", "reviewerName", "shop", "status") SELECT "error", "id", "imageUrl", "instagramPostId", "postedAt", "productTitle", "rating", "reviewId", "reviewText", "reviewerName", "shop", "status" FROM "PostedReview";
DROP TABLE "PostedReview";
ALTER TABLE "new_PostedReview" RENAME TO "PostedReview";
CREATE INDEX "PostedReview_shop_status_idx" ON "PostedReview"("shop", "status");
CREATE INDEX "PostedReview_shop_postedAt_idx" ON "PostedReview"("shop", "postedAt");
CREATE UNIQUE INDEX "PostedReview_shop_reviewId_key" ON "PostedReview"("shop", "reviewId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
