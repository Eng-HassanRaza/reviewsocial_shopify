import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * App Uninstalled Webhook
 * 
 * Called immediately when a merchant uninstalls the app.
 * Cleans up all app data except what's needed for GDPR compliance.
 * 
 * Note: GDPR shop/redact webhook will be called 48 hours later for final cleanup.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`[Uninstall] Received ${topic} webhook for ${shop}`);

  try {
    // Clean up all app data immediately
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

    console.log(`[Uninstall] Cleanup summary for ${shop}:`);
    console.log(`  - Sessions: ${deletedSessions.count}`);
    console.log(`  - Judge.me credentials: ${deletedJudgeMe.count}`);
    console.log(`  - Instagram credentials: ${deletedInstagram.count}`);
    console.log(`  - Posted reviews: ${deletedPostedReviews.count}`);
    console.log(`[Uninstall] ✓ Cleanup complete`);
  } catch (error) {
    console.error(`[Uninstall] Error cleaning up data for ${shop}:`, error);
    // Don't throw error - webhook should still return 200
  }

  return new Response();
};
