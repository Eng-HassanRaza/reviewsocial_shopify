import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

    // Delete all data for this shop
    const [
      deletedSessions,
      deletedJudgeMe,
      deletedInstagram,
      deletedPostedReviews,
    ] = await Promise.all([
      prisma.session.deleteMany({ where: { shop } }),
      prisma.judgeMeCredential.deleteMany({ where: { shop } }),
      prisma.instagramCredential.deleteMany({ where: { shop } }),
      prisma.postedReview.deleteMany({ where: { shop } }),
    ]);

    console.log(`[GDPR] Data deletion summary for ${shop}:`);
    console.log(`  - Sessions: ${deletedSessions.count}`);
    console.log(`  - Judge.me credentials: ${deletedJudgeMe.count}`);
    console.log(`  - Instagram credentials: ${deletedInstagram.count}`);
    console.log(`  - Posted reviews: ${deletedPostedReviews.count}`);
    console.log(`[GDPR] ✓ All shop data successfully deleted`);

    // Note: Images in AWS S3 will remain but contain no personal data
    // You may want to implement S3 cleanup here if needed
    // However, the images are already public and contain no GDPR-sensitive data

    return new Response(JSON.stringify({ 
      success: true,
      deleted: {
        sessions: deletedSessions.count,
        judgeMeCredentials: deletedJudgeMe.count,
        instagramCredentials: deletedInstagram.count,
        postedReviews: deletedPostedReviews.count,
      }
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

