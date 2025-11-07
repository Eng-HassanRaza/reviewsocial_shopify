import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GDPR: Customer Data Request Webhook
 * 
 * This webhook is called when a customer requests their data.
 * You must provide all data you have stored about this customer.
 * 
 * Note: This app doesn't directly store customer personal data.
 * We only store review data (name, review text) that comes from Judge.me.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    console.log(`[GDPR] Customer data request received for shop: ${shop}`);
    console.log(`[GDPR] Customer details:`, {
      id: payload.customer?.id,
      email: payload.customer?.email,
      phone: payload.customer?.phone,
    });

    // Find all reviews posted by this customer
    const customerReviews = await prisma.postedReview.findMany({
      where: {
        shop,
        reviewerName: payload.customer?.email || payload.customer?.phone || '',
      },
      select: {
        id: true,
        reviewText: true,
        reviewerName: true,
        productTitle: true,
        rating: true,
        postedAt: true,
        instagramPostId: true,
        imageUrl: true,
      },
    });

    const customerData = {
      shop,
      customer: {
        id: payload.customer?.id,
        email: payload.customer?.email,
        phone: payload.customer?.phone,
      },
      postedReviews: customerReviews,
      dataCollectedAt: new Date().toISOString(),
    };

    console.log(`[GDPR] Found ${customerReviews.length} reviews for this customer`);
    
    // In production, you should:
    // 1. Email this data to the shop owner
    // 2. Or provide an API endpoint for the merchant to retrieve this data
    // 3. Store this request for compliance records
    
    console.log(`[GDPR] Customer data:`, JSON.stringify(customerData, null, 2));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[GDPR] Error processing customer data request:', error);
    if (error instanceof Response) {
      return error;
    }
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

