import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useEffect } from "react";
import { Form, useLoaderData, useSearchParams, useActionData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { generateReviewImage } from "../services/image-generator.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const judgeMeCredential = await prisma.judgeMeCredential.findUnique({
    where: { shop: session.shop },
  });
  const instagramCredential = await prisma.instagramCredential.findUnique({
    where: { shop: session.shop },
  });

  return {
    isJudgeMeConnected: Boolean(judgeMeCredential),
    isInstagramConnected: Boolean(instagramCredential),
    instagramUsername: instagramCredential?.instagramUsername,
  };
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const actionType = formData.get("_action");
  
  if (actionType === "post_review") {
    const { session } = await authenticate.admin(request);
    
    const [judgeMeCredential, instagramCredential] = await Promise.all([
      prisma.judgeMeCredential.findUnique({
        where: { shop: session.shop },
      }),
      prisma.instagramCredential.findUnique({
        where: { shop: session.shop },
      }),
    ]);

    if (!judgeMeCredential || !instagramCredential) {
      return { success: false, error: "Required services not connected" };
    }

    try {
      const apiBase = process.env.JUDGEME_API_BASE || "https://judge.me/api/v1";
      
      let response = await fetch(`${apiBase}/reviews?shop_domain=${session.shop}`, {
        headers: {
          "Authorization": `Bearer ${judgeMeCredential.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        response = await fetch(
          `${apiBase}/reviews?shop_domain=${session.shop}&api_token=${judgeMeCredential.accessToken}&per_page=10`
        );
      }

      if (!response.ok) {
        return { success: false, error: "Failed to fetch reviews from Judge.me" };
      }

      const data = await response.json();
      const reviews = data.reviews || data;

      if (!Array.isArray(reviews) || reviews.length === 0) {
        return { success: false, error: "No reviews found to post" };
      }

      // Find first 5-star review
      const fiveStarReview = reviews.find((r: any) => r.rating === 5);
      
      if (!fiveStarReview) {
        return { success: false, error: "No 5-star reviews found. Only 5-star reviews are posted to Instagram." };
      }

      const reviewText = fiveStarReview.body || fiveStarReview.content || "";
      const reviewerName = fiveStarReview.reviewer?.name || fiveStarReview.reviewer_name || "A Happy Customer";
      const productTitle = fiveStarReview.product_title || fiveStarReview.product?.title || "";
      
      // Extract brand name from shop domain (e.g., "mystore.myshopify.com" -> "MyStore")
      const shopDomain = session.shop;
      const brandName = shopDomain
        .replace('.myshopify.com', '')
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Generate image using Nano Banana API
      console.log("Attempting to generate review image...");
      console.log("Brand name for image:", brandName);
      let imageUrl: string | null = null;
      
      try {
        imageUrl = await generateReviewImage({
          reviewText,
          rating: fiveStarReview.rating,
          reviewerName,
          productTitle,
          brandName,
        });
      } catch (error) {
        console.error("Image generation error:", error);
        return { 
          success: false, 
          error: `Image generation failed: ${error instanceof Error ? error.message : "Unknown error"}. Check server logs for details.`
        };
      }

      if (!imageUrl) {
        return { 
          success: false, 
          error: "Failed to generate review image. Please check: 1) GEMINI_API_KEY is set, 2) IMGBB_API_KEY is set (for image hosting), 3) Server logs for detailed error messages" 
        };
      }

      // Create Instagram caption
      const stars = "⭐".repeat(5);
      const caption = `${stars}\n\n"${reviewText}"\n\n- ${reviewerName}\n\n#customerreview #review #testimonial`;

      const igAccountId = instagramCredential.instagramAccountId;
      const accessToken = instagramCredential.accessToken;

      // Step 1: Create media container
      const containerUrl = `https://graph.facebook.com/v18.0/${igAccountId}/media`;
      const containerParams = new URLSearchParams({
        image_url: imageUrl,
        caption: caption,
        access_token: accessToken,
      });

      const containerResp = await fetch(containerUrl, {
        method: "POST",
        body: containerParams,
      });

      if (!containerResp.ok) {
        const errorText = await containerResp.text();
        return { success: false, error: `Failed to create media container: ${errorText}` };
      }

      const containerData = await containerResp.json();
      const containerId = containerData.id;

      // Step 2: Publish the media
      const publishUrl = `https://graph.facebook.com/v18.0/${igAccountId}/media_publish`;
      const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      });

      const publishResp = await fetch(publishUrl, {
        method: "POST",
        body: publishParams,
      });

      if (!publishResp.ok) {
        const errorText = await publishResp.text();
        return { success: false, error: `Failed to publish media: ${errorText}` };
      }

      const publishData = await publishResp.json();

      return {
        success: true,
        message: "Review posted to Instagram successfully!",
        postId: publishData.id,
      };

    } catch (error) {
      console.error("Error posting to Instagram:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  }

  return { success: false, error: "Invalid action" };
}

export default function Index() {
  const shopify = useAppBridge();
  const [params] = useSearchParams();
  const actionData = useActionData<typeof action>();
  const { isJudgeMeConnected, isInstagramConnected, instagramUsername } = useLoaderData<typeof loader>();

  useEffect(() => {
    if (params.get("judgeme_connected") === "1") {
      shopify.toast.show("Connected to Judge.me");
    }
    if (params.get("judgeme_disconnected") === "1") {
      shopify.toast.show("Disconnected from Judge.me");
    }
    if (params.get("judgeme_error")) {
      shopify.toast.show(
        `Judge.me connection failed: ${params.get("judgeme_error")}`,
        { isError: true }
      );
    }
    if (params.get("instagram_connected") === "1") {
      shopify.toast.show("Connected to Instagram");
    }
    if (params.get("instagram_disconnected") === "1") {
      shopify.toast.show("Disconnected from Instagram");
    }
    if (params.get("instagram_error")) {
      shopify.toast.show(
        `Instagram connection failed: ${params.get("instagram_error")}`,
        { isError: true }
      );
    }
  }, [params, shopify]);

  useEffect(() => {
    if (actionData) {
      if (actionData.success) {
        shopify.toast.show("Review posted to Instagram successfully!");
      } else if (actionData.error) {
        shopify.toast.show(actionData.error, { isError: true });
      }
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="reviewsocial">
      <s-section heading="Judge.me Integration">
        <s-paragraph>Connect your Judge.me account to fetch reviews.</s-paragraph>
        {isJudgeMeConnected ? (
          <>
            <Form method="post" action="/app/judgeme/disconnect">
              <s-button variant="tertiary" type="submit">
                Disconnect Judge.me
              </s-button>
            </Form>
            <div style={{ marginTop: "10px" }}>
              <s-button href="/app/reviews">
                Test Fetch Reviews
              </s-button>
            </div>
          </>
        ) : (
          <s-button variant="primary" href="/app/judgeme/connect">
            Connect to Judge.me
          </s-button>
        )}
      </s-section>

      <s-section heading="Instagram Integration">
        <s-paragraph>Connect your Instagram business account to auto-post reviews.</s-paragraph>
        {isInstagramConnected ? (
          <>
            <s-banner status="success">
              <s-paragraph>
                Connected as @{instagramUsername || "Instagram User"}
              </s-paragraph>
            </s-banner>
            <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
              <Form method="post" action="/app/instagram/disconnect">
                <s-button variant="tertiary" type="submit">
                  Disconnect Instagram
                </s-button>
              </Form>
              {isJudgeMeConnected && (
                <Form method="post">
                  <input type="hidden" name="_action" value="post_review" />
                  <s-button variant="primary" type="submit">
                    Post Latest Review to Instagram
                  </s-button>
                </Form>
              )}
            </div>
          </>
        ) : (
          <>
            {!isJudgeMeConnected && (
              <s-banner status="info">
                <s-paragraph>
                  Please connect Judge.me first to enable Instagram posting.
                </s-paragraph>
              </s-banner>
            )}
            <s-button 
              variant="primary" 
              href="/app/instagram/connect"
              disabled={!isJudgeMeConnected}
            >
              Connect to Instagram
            </s-button>
          </>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
