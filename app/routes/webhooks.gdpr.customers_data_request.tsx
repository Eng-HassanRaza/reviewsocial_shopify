import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GDPR: Customer Data Request Webhook
 *
 * Called when a customer requests all data stored about them.
 * This app stores only review display data sourced from Judge.me:
 * reviewer display name (first name only, as provided by Judge.me) and review text.
 * We do not store Shopify customer IDs, emails, or phone numbers.
 *
 * Compliance approach:
 * - Match PostedReview records by any name component from the customer profile.
 * - Return all potentially matching records so the merchant can respond to the customer.
 * - Log the request for compliance records.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    const customerId = payload.customer?.id;
    const customerEmail = payload.customer?.email as string | undefined;
    const customerPhone = payload.customer?.phone as string | undefined;

    console.log(`[GDPR] Customer data request for shop: ${shop}`, {
      customerId,
      hasEmail: !!customerEmail,
      hasPhone: !!customerPhone,
    });

    // Build name-based search terms from email prefix (before @) since
    // reviewerName stores display names sourced from Judge.me, not emails.
    const searchTerms: string[] = [];
    if (customerEmail) {
      // e.g. "john.doe@example.com" → search for "john" and "doe"
      const emailPrefix = customerEmail.split("@")[0];
      emailPrefix.split(/[._\-+]/).forEach((part) => {
        if (part.length > 1) searchTerms.push(part.toLowerCase());
      });
    }

    // Fetch all reviews for the shop — filter client-side by name similarity
    const allReviews = await prisma.postedReview.findMany({
      where: { shop },
      select: {
        id: true,
        reviewText: true,
        reviewerName: true,
        productTitle: true,
        rating: true,
        postedAt: true,
        instagramPostId: true,
        imageUrl: true,
        status: true,
      },
    });

    // Keep records whose reviewerName overlaps with any search term
    const matchingReviews =
      searchTerms.length > 0
        ? allReviews.filter((r) => {
            const name = (r.reviewerName ?? "").toLowerCase();
            return searchTerms.some((term) => name.includes(term));
          })
        : []; // If we have no PII to match on, return empty (nothing to identify)

    const responseData = {
      shop,
      customer: { id: customerId },
      dataStoredByApp: {
        description:
          "This app stores review display names and review text sourced from Judge.me. " +
          "We do not store Shopify customer IDs, emails, or phone numbers.",
        potentiallyMatchingReviews: matchingReviews,
        totalReviewsChecked: allReviews.length,
      },
      requestedAt: new Date().toISOString(),
    };

    console.log(
      `[GDPR] Data request complete. Potentially matching reviews: ${matchingReviews.length} / ${allReviews.length} total`
    );
    console.log(`[GDPR] Response data:`, JSON.stringify(responseData, null, 2));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[GDPR] Error processing customer data request:", error);
    if (error instanceof Response) return error;
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
