import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GDPR: Customer Redact Webhook
 * 
 * This webhook is called 48 hours after a customer requests data deletion.
 * You must delete all personal data you have stored about this customer.
 * 
 * Note: This app doesn't directly store customer personal data.
 * We only store review data (name, review text) from Judge.me.
 * This data can be anonymized or deleted based on your privacy policy.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    console.log(`[GDPR] Customer redact request received for shop: ${shop}`);
    console.log(`[GDPR] Customer details:`, {
      id: payload.customer?.id,
      email: payload.customer?.email,
      phone: payload.customer?.phone,
    });

    // Option 1: Delete all reviews from this customer
    // This will remove them from your database but Instagram posts remain
    const deletedReviews = await prisma.postedReview.deleteMany({
      where: {
        shop,
        reviewerName: payload.customer?.email || payload.customer?.phone || '',
      },
    });

    console.log(`[GDPR] Deleted ${deletedReviews.count} reviews for customer`);

    // Option 2 (Alternative): Anonymize instead of delete
    // This preserves analytics while removing personal data
    /*
    const anonymizedReviews = await prisma.postedReview.updateMany({
      where: {
        shop,
        reviewerName: payload.customer?.email || payload.customer?.phone || '',
      },
      data: {
        reviewerName: 'Anonymous Customer',
        reviewText: '[Review text redacted for privacy]',
      },
    });
    console.log(`[GDPR] Anonymized ${anonymizedReviews.count} reviews for customer`);
    */

    return new Response(JSON.stringify({ 
      success: true, 
      deletedCount: deletedReviews.count 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[GDPR] Error processing customer redact request:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

