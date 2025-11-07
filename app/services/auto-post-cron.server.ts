import prisma from "../db.server";
import { generateReviewImage } from "./image-generator.server";

interface ReviewData {
  id: string | number;
  rating: number;
  body?: string;
  content?: string;
  reviewer?: { name?: string };
  reviewer_name?: string;
  name?: string;
  product_title?: string;
  product?: { title?: string };
}

interface ProcessResult {
  shop: string;
  totalReviews: number;
  newReviews: number;
  posted: number;
  failed: number;
  skipped: number;
  dailyLimit: boolean;
  monthlyLimit?: boolean;
  errors: string[];
}

const MAX_POSTS_PER_DAY = 10;
const MAX_POSTS_PER_RUN = 5;

function getMonthlyQuotaForPlanName(planName: string | null | undefined): number {
  if (!planName) return 5; // default to Free
  const normalized = String(planName).toLowerCase();
  if (normalized.includes('free')) return 5;
  return Infinity; // other plans unlimited for now
}

// Simple in-memory run control. Suitable for single-instance deployments.
let isProcessing: boolean = false;
let pendingRun: boolean = false;

export function getProcessingState() {
  return { isProcessing, pendingRun };
}

export async function processAllShopsQueued(): Promise<{ status: 'started' | 'queued' | 'running' }>
{
  if (isProcessing) {
    // Queue a follow-up run and return immediately
    pendingRun = true;
    return { status: 'queued' };
  }

  // Start a processing loop that will drain the queue if set while running
  isProcessing = true;
  try {
    do {
      pendingRun = false; // clear before run; if new requests come, they'll set it back
      await processAllShops();
      // loop continues if pendingRun was set during the run
    } while (pendingRun);
  } finally {
    isProcessing = false;
  }

  return { status: 'started' };
}

/**
 * Main cron job function - processes new reviews for all shops
 */
export async function processAllShops(): Promise<ProcessResult[]> {
  console.log('[Cron] Starting auto-post job...');
  
  const shops = await prisma.judgeMeCredential.findMany({
    select: {
      shop: true,
      accessToken: true,
    },
  });

  console.log(`[Cron] Found ${shops.length} shops with Judge.me connected`);

  const results: ProcessResult[] = [];

  for (const shopData of shops) {
    try {
      const result = await processShopReviews(shopData.shop, shopData.accessToken);
      results.push(result);
    } catch (error) {
      console.error(`[Cron] Error processing shop ${shopData.shop}:`, error);
      results.push({
        shop: shopData.shop,
        totalReviews: 0,
        newReviews: 0,
        posted: 0,
        failed: 1,
        skipped: 0,
        dailyLimit: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
    }
  }

  console.log('[Cron] Auto-post job completed');
  return results;
}

/**
 * Process reviews for a single shop
 */
async function processShopReviews(shop: string, judgeMeToken: string): Promise<ProcessResult> {
  console.log(`[Cron] Processing shop: ${shop}`);

  const result: ProcessResult = {
    shop,
    totalReviews: 0,
    newReviews: 0,
    posted: 0,
    failed: 0,
    skipped: 0,
    dailyLimit: false,
    errors: [],
  };

  // Check if Instagram is connected
  const instagramCredential = await prisma.instagramCredential.findUnique({
    where: { shop },
  });

  if (!instagramCredential) {
    console.log(`[Cron] Skipping ${shop}: Instagram not connected`);
    result.errors.push('Instagram not connected');
    return result;
  }

  // Check daily post limit
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayPostCount = await prisma.postedReview.count({
    where: {
      shop,
      status: 'success',
      postedAt: { gte: todayStart },
    },
  });

  if (todayPostCount >= MAX_POSTS_PER_DAY) {
    console.log(`[Cron] Skipping ${shop}: Daily limit reached (${todayPostCount}/${MAX_POSTS_PER_DAY})`);
    result.dailyLimit = true;
    return result;
  }

  // Check monthly limit based on plan
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthPostCount = await prisma.postedReview.count({
    where: {
      shop,
      status: 'success',
      postedAt: { gte: monthStart },
    },
  });

  // Determine plan via Shopify-managed pricing rules: Free = 5/month, others unlimited
  // We do not have the plan name here (server job runs without Admin client per shop),
  // so we infer: if no subscription stored, default to Free. Optional: store plan in DB.
  // For now, enforce a conservative default: allow at least Free quota; unlimited remains unrestricted.
  const monthlyQuota = getMonthlyQuotaForPlanName(null);

  if (monthlyQuota !== Infinity && monthPostCount >= monthlyQuota) {
    console.log(`[Cron] Skipping ${shop}: Monthly limit reached (${monthPostCount}/${monthlyQuota})`);
    return { ...result, monthlyLimit: true };
  }

  const remainingToday = MAX_POSTS_PER_DAY - todayPostCount;
  let quotaLeftThisRun = Math.min(MAX_POSTS_PER_RUN, remainingToday);

  console.log(`[Cron] ${shop}: Can post up to ${quotaLeftThisRun} reviews this run (${todayPostCount}/${MAX_POSTS_PER_DAY} today)`);

  // 1) First retry previously failed posts (FIFO) up to quota
  if (quotaLeftThisRun > 0) {
    const failedToRetry = await prisma.postedReview.findMany({
      where: { shop, status: 'failed' },
      orderBy: { postedAt: 'asc' },
      take: quotaLeftThisRun,
    });

    for (const rec of failedToRetry) {
      try {
        await postStoredReviewToInstagram(shop, rec, instagramCredential);
        result.posted++;
        quotaLeftThisRun--;
        console.log(`[Cron] ${shop}: ✓ Retried review ${rec.reviewId}`);
      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Retry ${rec.reviewId}: ${errorMessage}`);
        console.error(`[Cron] ${shop}: ✗ Retry failed for ${rec.reviewId}:`, error);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (quotaLeftThisRun <= 0) break;
    }
  }

  if (quotaLeftThisRun <= 0) {
    return result;
  }

  // 2) Then fetch recent reviews from Judge.me (last 48 hours)
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  
  try {
    const response = await fetch(
      `https://judge.me/api/v1/reviews?shop_domain=${shop}&api_token=${judgeMeToken}&per_page=50&from_date=${twoDaysAgo}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch reviews: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const reviews: ReviewData[] = data.reviews || [];

    console.log(`[Cron] ${shop}: Fetched ${reviews.length} reviews from last 48 hours`);
    result.totalReviews = reviews.length;

    // Filter 5-star reviews
    const fiveStarReviews = reviews.filter((r) => r.rating === 5);
    console.log(`[Cron] ${shop}: Found ${fiveStarReviews.length} 5-star reviews`);

    // Check which reviews have already been posted
    const reviewIds = fiveStarReviews.map((r) => String(r.id));
    const alreadyPosted = await prisma.postedReview.findMany({
      where: {
        shop,
        reviewId: { in: reviewIds },
      },
      select: { reviewId: true },
    });

    const postedIds = new Set(alreadyPosted.map((p) => p.reviewId));
    const newReviews = fiveStarReviews.filter((r) => !postedIds.has(String(r.id)));

    console.log(`[Cron] ${shop}: ${newReviews.length} new 5-star reviews to post`);
    result.newReviews = newReviews.length;

    // Sort by oldest first (FIFO)
    newReviews.reverse();

    // Post up to quotaLeftThisRun
    const reviewsToPost = newReviews.slice(0, quotaLeftThisRun);
    result.skipped = newReviews.length - reviewsToPost.length;

    for (const review of reviewsToPost) {
      try {
        await postReviewToInstagram(shop, review, instagramCredential);
        result.posted++;
        console.log(`[Cron] ${shop}: ✓ Posted review ${review.id}`);
      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Review ${review.id}: ${errorMessage}`);
        console.error(`[Cron] ${shop}: ✗ Failed to post review ${review.id}:`, error);
      }

      // Small delay between posts
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(errorMessage);
    throw error;
  }
}

/**
 * Post a single review to Instagram
 */
async function postReviewToInstagram(
  shop: string,
  review: ReviewData,
  instagramCredential: { accessToken: string; instagramAccountId: string }
): Promise<void> {
  const reviewId = String(review.id);
  const reviewText = review.body || review.content || '';
  const reviewerName = review.reviewer?.name || review.reviewer_name || review.name || 'A Happy Customer';
  const productTitle = review.product_title || review.product?.title || 'Our Product';
  const rating = review.rating;

  // Extract brand name from shop domain
  const brandName = shop
    .replace('.myshopify.com', '')
    .split('-')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  console.log(`[Cron] Generating image for review ${reviewId}...`);

  // Generate image
  const imageUrl = await generateReviewImage({
    reviewText,
    rating,
    reviewerName,
    productTitle,
    brandName,
  });

  if (!imageUrl) {
    await prisma.postedReview.upsert({
      where: { shop_reviewId: { shop, reviewId } },
      create: {
        shop,
        reviewId,
        productTitle,
        reviewerName,
        rating,
        reviewText: reviewText.substring(0, 500),
        status: 'failed',
        error: 'Image generation failed',
      },
      update: {
        productTitle,
        reviewerName,
        rating,
        reviewText: reviewText.substring(0, 500),
        status: 'failed',
        error: 'Image generation failed',
      },
    });
    throw new Error('Image generation failed');
  }

  console.log(`[Cron] Image generated: ${imageUrl}`);

  // Verify image is accessible
  const isAccessible = await verifyImageUrl(imageUrl);
  if (!isAccessible) {
    await prisma.postedReview.upsert({
      where: { shop_reviewId: { shop, reviewId } },
      create: {
        shop,
        reviewId,
        productTitle,
        reviewerName,
        rating,
        reviewText: reviewText.substring(0, 500),
        imageUrl,
        status: 'failed',
        error: 'Image not accessible',
      },
      update: {
        productTitle,
        reviewerName,
        rating,
        reviewText: reviewText.substring(0, 500),
        imageUrl,
        status: 'failed',
        error: 'Image not accessible',
      },
    });
    throw new Error('Image not accessible');
  }

  // Post to Instagram
  const stars = '⭐'.repeat(rating);
  const caption = `${stars}\n\n"${reviewText}"\n\n- ${reviewerName}\n\n#customerreview #review #testimonial`;

  const igAccountId = instagramCredential.instagramAccountId;
  const accessToken = instagramCredential.accessToken;

  // Create media container
  const containerUrl = `https://graph.facebook.com/v18.0/${igAccountId}/media`;
  const containerParams = new URLSearchParams({
    image_url: imageUrl,
    caption: caption,
    access_token: accessToken,
  });

  const containerResp = await fetch(containerUrl, {
    method: 'POST',
    body: containerParams,
  });

  if (!containerResp.ok) {
    const errorText = await containerResp.text();
    await prisma.postedReview.upsert({
      where: { shop_reviewId: { shop, reviewId } },
      create: {
        shop,
        reviewId,
        productTitle,
        reviewerName,
        rating,
        reviewText: reviewText.substring(0, 500),
        imageUrl,
        status: 'failed',
        error: `Instagram container failed: ${errorText}`,
      },
      update: {
        productTitle,
        reviewerName,
        rating,
        reviewText: reviewText.substring(0, 500),
        imageUrl,
        status: 'failed',
        error: `Instagram container failed: ${errorText}`,
      },
    });
    throw new Error(`Failed to create media container: ${errorText}`);
  }

  const containerData = await containerResp.json();
  const containerId = containerData.id;

  try {
    await waitForMediaContainerReady(containerId, accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Media container not ready';
    await prisma.postedReview.upsert({
      where: { shop_reviewId: { shop, reviewId } },
      create: {
        shop,
        reviewId,
        productTitle,
        reviewerName,
        rating,
        reviewText: reviewText.substring(0, 500),
        imageUrl,
        status: 'failed',
        error: `Instagram container not ready: ${message}`,
      },
      update: {
        productTitle,
        reviewerName,
        rating,
        reviewText: reviewText.substring(0, 500),
        imageUrl,
        status: 'failed',
        error: `Instagram container not ready: ${message}`,
      },
    });
    throw new Error(message);
  }

  // Publish media
  const publishUrl = `https://graph.facebook.com/v18.0/${igAccountId}/media_publish`;
  const createPublishParams = () =>
    new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    });

  let publishResp = await fetch(publishUrl, {
    method: 'POST',
    body: createPublishParams(),
  });

  if (!publishResp.ok) {
    let errorText = await publishResp.text();
    let retry = false;

    try {
      const errorJson = JSON.parse(errorText);
      const code = errorJson?.error?.code;
      const subcode = errorJson?.error?.error_subcode;
      if (code === 9007 && subcode === 2207027) {
        console.warn(`[Cron] ${shop}: Media not ready for publishing, retrying after wait...`);
        await sleep(2000);
        await waitForMediaContainerReady(containerId, accessToken, { maxAttempts: 5, delayMs: 2000 });
        publishResp = await fetch(publishUrl, {
          method: 'POST',
          body: createPublishParams(),
        });
        retry = true;
        if (!publishResp.ok) {
          errorText = await publishResp.text();
        }
      }
    } catch (parseError) {
      // Ignore JSON parse issues; fallback to original error text
    }

    if (!publishResp.ok) {
      await prisma.postedReview.upsert({
        where: { shop_reviewId: { shop, reviewId } },
        create: {
          shop,
          reviewId,
          productTitle,
          reviewerName,
          rating,
          reviewText: reviewText.substring(0, 500),
          imageUrl,
          status: 'failed',
          error: `Instagram publish failed${retry ? ' (after retry)' : ''}: ${errorText}`,
        },
        update: {
          productTitle,
          reviewerName,
          rating,
          reviewText: reviewText.substring(0, 500),
          imageUrl,
          status: 'failed',
          error: `Instagram publish failed${retry ? ' (after retry)' : ''}: ${errorText}`,
        },
      });
      throw new Error(`Failed to publish media: ${errorText}`);
    }
  }

  const publishData = await publishResp.json();
  const postId = publishData.id;

  // Save success to database
  await prisma.postedReview.upsert({
    where: { shop_reviewId: { shop, reviewId } },
    create: {
      shop,
      reviewId,
      productTitle,
      reviewerName,
      rating,
      reviewText: reviewText.substring(0, 500),
      imageUrl,
      instagramPostId: postId,
      status: 'success',
    },
    update: {
      productTitle,
      reviewerName,
      rating,
      reviewText: reviewText.substring(0, 500),
      imageUrl,
      instagramPostId: postId,
      status: 'success',
    },
  });

  console.log(`[Cron] ✓ Posted review ${reviewId} to Instagram (Post ID: ${postId})`);
}

// Retry path using stored PostedReview data
async function postStoredReviewToInstagram(
  shop: string,
  rec: {
    reviewId: string;
    reviewText: string | null;
    reviewerName: string | null;
    productTitle: string | null;
    rating: number;
    imageUrl: string | null;
  },
  instagramCredential: { accessToken: string; instagramAccountId: string }
) {
  const review: ReviewData = {
    id: rec.reviewId,
    rating: rec.rating,
    body: rec.reviewText ?? undefined,
    content: rec.reviewText ?? undefined,
    reviewer: { name: rec.reviewerName ?? undefined },
    reviewer_name: rec.reviewerName ?? undefined,
    name: rec.reviewerName ?? undefined,
    product_title: rec.productTitle ?? undefined,
    product: { title: rec.productTitle ?? undefined },
  };
  await postReviewToInstagram(shop, review, instagramCredential);
}

async function waitForMediaContainerReady(
  containerId: string,
  accessToken: string,
  options: { maxAttempts?: number; delayMs?: number } = {}
): Promise<void> {
  const { maxAttempts = 10, delayMs = 2000 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const statusUrl = new URL(`https://graph.facebook.com/v18.0/${containerId}`);
    statusUrl.searchParams.set('fields', 'status,status_code,error');
    statusUrl.searchParams.set('access_token', accessToken);

    const statusResp = await fetch(statusUrl.toString());
    if (!statusResp.ok) {
      const errorText = await statusResp.text();
      throw new Error(`Failed to check media status: ${statusResp.status} ${errorText}`);
    }

    const statusData = await statusResp.json();
    const statusCode = statusData?.status_code || statusData?.status;

    if (statusCode === 'FINISHED') {
      return;
    }

    if (statusCode === 'ERROR') {
      const reason = statusData?.error?.message || JSON.stringify(statusData?.error || statusData);
      throw new Error(`Media container error: ${reason}`);
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  throw new Error('Media container not ready after waiting');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Verify image URL is accessible
 */
async function verifyImageUrl(imageUrl: string, maxRetries = 3): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(imageUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ReviewSocial/1.0)',
        },
      });

      if (response.ok) {
        return true;
      }

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, (i + 1) * 1000));
      }
    } catch (error) {
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, (i + 1) * 1000));
      }
    }
  }

  return false;
}

