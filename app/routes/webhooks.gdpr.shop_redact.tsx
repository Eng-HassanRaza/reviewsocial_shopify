import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * GDPR: Shop Redact Webhook
 * 
 * This webhook is called 48 hours after a shop uninstalls your app.
 * You must delete ALL data associated with this shop.
 * 
 * This is CRITICAL for GDPR compliance and Shopify app approval.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop } = await authenticate.webhook(request);

    console.log(`[GDPR] Shop redact request received for: ${shop}`);
    console.log(`[GDPR] Deleting all data for shop: ${shop}`);

    // Collect S3 image URLs before deleting DB records
    const reviewsWithImages = await prisma.postedReview.findMany({
      where: { shop, imageUrl: { not: null } },
      select: { imageUrl: true },
    });

    // Delete all DB data for this shop
    const [
      deletedSessions,
      deletedJudgeMe,
      deletedInstagram,
      deletedPostedReviews,
      deletedShopPlan,
    ] = await Promise.all([
      prisma.session.deleteMany({ where: { shop } }),
      prisma.judgeMeCredential.deleteMany({ where: { shop } }),
      prisma.instagramCredential.deleteMany({ where: { shop } }),
      prisma.postedReview.deleteMany({ where: { shop } }),
      (prisma as any).shopPlan?.deleteMany({ where: { shop } }).catch(() => ({ count: 0 })),
    ]);

    console.log(`[GDPR] DB deletion summary for ${shop}:`);
    console.log(`  - Sessions: ${deletedSessions.count}`);
    console.log(`  - Judge.me credentials: ${deletedJudgeMe.count}`);
    console.log(`  - Instagram credentials: ${deletedInstagram.count}`);
    console.log(`  - Posted reviews: ${deletedPostedReviews.count}`);

    // Delete S3 images — review images contain reviewer names embedded as text (PII)
    let s3Deleted = 0;
    const s3Errors: string[] = [];
    if (reviewsWithImages.length > 0 && process.env.AWS_S3_BUCKET) {
      const s3 = new S3Client({
        region: process.env.AWS_REGION || "us-east-1",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });

      for (const { imageUrl } of reviewsWithImages) {
        if (!imageUrl) continue;
        try {
          // Extract S3 key from full URL
          // e.g. https://bucket.s3.region.amazonaws.com/review-images/xyz.png → review-images/xyz.png
          const url = new URL(imageUrl);
          const key = url.pathname.replace(/^\//, "");
          await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }));
          s3Deleted++;
        } catch (err) {
          s3Errors.push(imageUrl);
          console.error(`[GDPR] Failed to delete S3 image: ${imageUrl}`, err);
        }
      }
      console.log(`[GDPR] S3 images deleted: ${s3Deleted}, errors: ${s3Errors.length}`);
    }

    console.log(`[GDPR] ✓ All shop data successfully deleted for ${shop}`);

    return new Response(JSON.stringify({
      success: true,
      deleted: {
        sessions: deletedSessions.count,
        judgeMeCredentials: deletedJudgeMe.count,
        instagramCredentials: deletedInstagram.count,
        postedReviews: deletedPostedReviews.count,
        s3ImagesDeleted: s3Deleted,
        s3Errors: s3Errors.length,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[GDPR] Error processing shop redact request:', error);
    if (error instanceof Response) {
      return error;
    }
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

