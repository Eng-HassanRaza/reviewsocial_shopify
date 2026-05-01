import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GDPR: Customer Redact Webhook
 *
 * Called 48 hours after a customer requests deletion of their data.
 * This app stores only review display names and review text from Judge.me.
 * We do not store Shopify customer IDs, emails, or phone numbers.
 *
 * Compliance approach:
 * - Anonymize (not hard-delete) any PostedReview records whose reviewerName
 *   matches name components derived from the customer's email prefix.
 * - Anonymization preserves analytics while removing personal data.
 * - Instagram posts already published cannot be retracted by this app,
 *   but the local record is scrubbed of all PII.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    const customerId = payload.customer?.id;
    const customerEmail = payload.customer?.email as string | undefined;

    console.log(`[GDPR] Customer redact request for shop: ${shop}`, {
      customerId,
      hasEmail: !!customerEmail,
    });

    // Build name search terms from email prefix (same logic as data_request)
    const searchTerms: string[] = [];
    if (customerEmail) {
      const emailPrefix = customerEmail.split("@")[0];
      emailPrefix.split(/[._\-+]/).forEach((part) => {
        if (part.length > 1) searchTerms.push(part.toLowerCase());
      });
    }

    let anonymizedCount = 0;

    if (searchTerms.length > 0) {
      // Fetch candidates and anonymize client-side (avoids complex SQL ILIKE across providers)
      const candidates = await prisma.postedReview.findMany({
        where: { shop },
        select: { id: true, reviewerName: true },
      });

      const toAnonymize = candidates
        .filter((r) => {
          const name = (r.reviewerName ?? "").toLowerCase();
          return searchTerms.some((term) => name.includes(term));
        })
        .map((r) => r.id);

      if (toAnonymize.length > 0) {
        await prisma.postedReview.updateMany({
          where: { id: { in: toAnonymize } },
          data: {
            reviewerName: "Anonymous Customer",
            reviewText: "[Review text redacted for privacy]",
          },
        });
        anonymizedCount = toAnonymize.length;
      }
    }

    console.log(
      `[GDPR] Redact complete. Anonymized ${anonymizedCount} review record(s) for shop: ${shop}`
    );

    return new Response(
      JSON.stringify({ success: true, anonymizedCount }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[GDPR] Error processing customer redact:", error);
    if (error instanceof Response) return error;
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
