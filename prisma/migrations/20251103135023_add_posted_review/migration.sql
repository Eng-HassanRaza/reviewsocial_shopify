-- CreateTable
CREATE TABLE "PostedReview" (
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
    "postedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PostedReview_shop_status_idx" ON "PostedReview"("shop", "status");

-- CreateIndex
CREATE INDEX "PostedReview_shop_postedAt_idx" ON "PostedReview"("shop", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostedReview_shop_reviewId_key" ON "PostedReview"("shop", "reviewId");
