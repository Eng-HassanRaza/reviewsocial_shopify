import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  
  console.log(`[Reviews] Fetching reviews for shop: ${session.shop}`);
  
  const credential = await prisma.judgeMeCredential.findUnique({
    where: { shop: session.shop },
  });

  if (!credential) {
    console.log(`[Reviews] No Judge.me credential found for ${session.shop}`);
    return {
      error: "Judge.me not connected",
      reviews: [],
      currentShop: session.shop,
    };
  }

  console.log(`[Reviews] Found credential for ${session.shop}, fetching from Judge.me API...`);

  try {
    const apiBase = process.env.JUDGEME_API_BASE || "https://judge.me/api/v1";
    
    // Try using Bearer token authentication (OAuth standard)
    let response = await fetch(`${apiBase}/reviews?shop_domain=${session.shop}`, {
      headers: {
        "Authorization": `Bearer ${credential.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    // If Bearer doesn't work, try using api_token query parameter
    if (!response.ok) {
      console.log(`[Reviews] Bearer auth failed, trying api_token parameter...`);
      response = await fetch(
        `${apiBase}/reviews?shop_domain=${session.shop}&api_token=${credential.accessToken}&per_page=10`
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Reviews] API request failed for ${session.shop}:`, response.status, errorText);
      return {
        error: `Failed to fetch reviews: ${response.status} - ${errorText}`,
        reviews: [],
        currentShop: session.shop,
      };
    }

    const data = await response.json();
    const reviewCount = data.reviews?.length || 0;
    
    console.log(`[Reviews] Successfully fetched ${reviewCount} reviews for ${session.shop}`);
    
    // Log first review's shop info if available for debugging
    if (data.reviews && data.reviews.length > 0) {
      const firstReview = data.reviews[0];
      console.log(`[Reviews] First review shop domain:`, firstReview.shop_domain || 'not specified');
    }
    
    return {
      error: null,
      reviews: data.reviews || data,
      rawResponse: data,
      currentShop: session.shop,
    };
  } catch (error) {
    console.error(`[Reviews] Error fetching reviews for ${session.shop}:`, error);
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      reviews: [],
      currentShop: session.shop,
    };
  }
}

export default function Reviews() {
  const { error, reviews, rawResponse, currentShop } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Test Reviews - Judge.me">
      <s-section>
        <s-banner status="info">
          <s-paragraph>
            <strong>Current Store:</strong> {currentShop}
          </s-paragraph>
        </s-banner>
        
        {error ? (
          <s-banner status="critical">
            <s-paragraph>{error}</s-paragraph>
          </s-banner>
        ) : (
          <>
            <s-banner status="success">
              <s-paragraph>
                Successfully fetched {Array.isArray(reviews) ? reviews.length : 0} reviews for {currentShop}
              </s-paragraph>
            </s-banner>

            {Array.isArray(reviews) && reviews.length > 0 ? (
              <s-card>
                {reviews.map((review: any, index: number) => (
                  <div key={index} style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px solid #e0e0e0" }}>
                    <s-paragraph>
                      <strong>Reviewer:</strong> {review.reviewer?.name || review.reviewer_name || "Anonymous"}
                    </s-paragraph>
                    <s-paragraph>
                      <strong>Rating:</strong> {review.rating} / 5
                    </s-paragraph>
                    {review.title && (
                      <s-paragraph>
                        <strong>Title:</strong> {review.title}
                      </s-paragraph>
                    )}
                    <s-paragraph>
                      <strong>Review:</strong> {review.body || review.content || "No content"}
                    </s-paragraph>
                    {review.product_title && (
                      <s-paragraph>
                        <strong>Product:</strong> {review.product_title}
                      </s-paragraph>
                    )}
                    {review.created_at && (
                      <s-paragraph>
                        <strong>Date:</strong> {new Date(review.created_at).toLocaleDateString()}
                      </s-paragraph>
                    )}
                  </div>
                ))}
              </s-card>
            ) : (
              <s-paragraph>No reviews found</s-paragraph>
            )}

            <s-section heading="Raw API Response">
              <s-card>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>
                  {JSON.stringify(rawResponse, null, 2)}
                </pre>
              </s-card>
            </s-section>
          </>
        )}
      </s-section>
      
      <s-section>
        <s-button href="/app">Back to Home</s-button>
      </s-section>
    </s-page>
  );
}

