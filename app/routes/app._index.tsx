import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useEffect } from "react";
import { Form, useLoaderData, useSearchParams, useActionData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { generateReviewImage } from "../services/image-generator.server";
import { Page, Layout, Card, Banner, Button, Text, BlockStack, InlineStack, Link } from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  
  const judgeMeCredential = await prisma.judgeMeCredential.findUnique({
    where: { shop: session.shop },
  });
  const instagramCredential = await prisma.instagramCredential.findUnique({
    where: { shop: session.shop },
  });

  // Note: We cannot reliably detect if Judge.me is installed because:
  // 1. No permission to query scriptTags or appInstallations
  // 2. Judge.me API/metafields persist after uninstall
  // Solution: Always allow connection attempt, let OAuth validation handle it
  const isJudgeMeInstalled = true; // Always allow connection attempt

  // Get stats for dashboard
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const stats = {
    totalPosted: await prisma.postedReview.count({
      where: { shop: session.shop, status: 'success' },
    }),
    todayPosted: await prisma.postedReview.count({
      where: {
        shop: session.shop,
        status: 'success',
        postedAt: { gte: todayStart },
      },
    }),
  };

  // Support multiple env names for managed pricing URL
  const managedPricingUrlTemplate =
    process.env.MANAGED_PRICING_URL ||
    process.env.SHOPIFY_MANAGED_PRICING_URL ||
    process.env.SHOPIFY_PRICING_URL ||
    process.env.PRICING_URL ||
    null;

  // Resolve {storeSlug} / {shopDomain} placeholders if provided in env
  const storeSlug = session.shop.replace(".myshopify.com", "");
  const managedPricingUrl = managedPricingUrlTemplate
    ? managedPricingUrlTemplate
        .replace(/\{storeSlug\}|%7BstoreSlug%7D/gi, storeSlug)
        .replace(/\{shopDomain\}|%7BshopDomain%7D/gi, session.shop)
    : null;

  // Try to fetch current app subscription plan via Admin GraphQL
  let currentAppPlan: string | null = null;
  try {
    const response = await admin.graphql(`#graphql\n      query CurrentAppPlan {\n        currentAppInstallation {\n          activeSubscriptions {\n            name\n            status\n          }\n        }\n      }\n    `);
    const result = await response.json();
    const subs = result?.data?.currentAppInstallation?.activeSubscriptions || [];
    if (Array.isArray(subs) && subs.length > 0) {
      currentAppPlan = subs[0]?.name || null;
    }
  } catch (e) {
    // ignore errors; plan display is optional and should not break the page
  }

  let planNameForShop: string | null = null;
  const prismaAny = prisma as any;

  if (currentAppPlan) {
    planNameForShop = currentAppPlan;
    await prismaAny.shopPlan.upsert({
      where: { shop: session.shop },
      update: { planName: currentAppPlan },
      create: { shop: session.shop, planName: currentAppPlan },
    });
  } else {
    const storedPlan = await prismaAny.shopPlan.findUnique({
      where: { shop: session.shop },
    });
    planNameForShop = storedPlan?.planName || null;
  }

  // Compute monthly usage and limit
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthlyUsage = await prisma.postedReview.count({
    where: {
      shop: session.shop,
      status: 'success',
      postedAt: { gte: monthStart },
    },
  });

  const normalizedPlan = (planNameForShop || 'Free').toLowerCase();
  const monthlyLimit = normalizedPlan.includes('free') ? 5 : Infinity;

  return {
    isJudgeMeConnected: Boolean(judgeMeCredential),
    isJudgeMeInstalled,
    isInstagramConnected: Boolean(instagramCredential),
    instagramUsername: instagramCredential?.instagramUsername,
    currentShop: session.shop,
    stats,
    managedPricingUrl,
    currentAppPlan: planNameForShop,
    monthlyUsage,
    monthlyLimit,
    legalUrls: {
      privacyPolicy: process.env.PRIVACY_POLICY_URL || 'https://yourdomain.com/privacy-policy',
      termsOfService: process.env.TERMS_OF_SERVICE_URL || 'https://yourdomain.com/terms-of-service',
      support: process.env.SUPPORT_URL || 'https://yourdomain.com/support',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@yourdomain.com',
    },
  };
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const actionType = formData.get("_action");
  
  if (actionType === "view_shop_info") {
    // Verify if current shop exists in this Judge.me account
    const { session } = await authenticate.admin(request);
    
    const judgeMeCredential = await prisma.judgeMeCredential.findUnique({
      where: { shop: session.shop },
    });

    if (!judgeMeCredential) {
      return { success: false, error: "Judge.me not connected" };
    }

    try {
      // Check if CURRENT shop exists in this Judge.me account
      const currentShopResp = await fetch(
        `https://judge.me/api/v1/shops/info?shop_domain=${session.shop}&api_token=${judgeMeCredential.accessToken}`
      );
      
      if (currentShopResp.ok) {
        const currentShopData = await currentShopResp.json();
        const shopInfo = currentShopData.shop;
        const returnedShopDomain = shopInfo?.domain;
        
        // STRICT CHECK: Verify the returned domain matches current shop
        if (!returnedShopDomain) {
          return {
            success: false,
            error: `⚠️ Invalid Response:\n\nJudge.me API did not return shop domain. Please try again.`,
            isVerified: false
          };
        }
        
        if (returnedShopDomain !== session.shop) {
          return {
            success: false,
            error: `⚠️ Domain Mismatch:\n\n` +
              `Current Store: ${session.shop}\n` +
              `API Returned: ${returnedShopDomain}\n\n` +
              `Judge.me is registered for ${returnedShopDomain}, not ${session.shop}.\n\n` +
              `Solution: Install Judge.me on ${session.shop} and reconnect.`,
            isVerified: false
          };
        }
        
        // Also fetch reviews count
        const reviewsResp = await fetch(
          `https://judge.me/api/v1/reviews?shop_domain=${session.shop}&api_token=${judgeMeCredential.accessToken}&per_page=1`
        );
        
        const reviewsData = reviewsResp.ok ? await reviewsResp.json() : { reviews: [] };
        const reviewCount = reviewsData.reviews?.length || 0;
        
        return {
          success: true,
          shopInfo: shopInfo,
          message: `✓ Judge.me Account Verification:\n\n` +
            `Current Store: ${session.shop}\n` +
            `Returned Domain: ${returnedShopDomain}\n` +
            `Status: VERIFIED ✓ (Domain Match)\n` +
            `Shop ID: ${shopInfo.id}\n` +
            `Plan: ${shopInfo.plan}\n` +
            `Platform: ${shopInfo.platform}\n` +
            `Reviews Available: ${reviewCount > 0 ? `YES (${reviewCount}+ reviews)` : 'None found'}\n\n` +
            `✓ This store is properly connected to your Judge.me account.`,
          isVerified: true,
          hasReviews: reviewCount > 0
        };
      } else {
        // Current shop NOT found in Judge.me account
        const statusCode = currentShopResp.status;
        const errorText = await currentShopResp.text();
        
        console.error(`[Judge.me Verification] Shop ${session.shop} not found: ${statusCode} ${errorText}`);
        
        return {
          success: false,
          error: `⚠️ Verification Failed:\n\n` +
            `Current Store: ${session.shop}\n` +
            `Status: NOT FOUND in Judge.me account (${statusCode})\n\n` +
            `This means:\n` +
            `• Judge.me is not installed on ${session.shop}, OR\n` +
            `• This Judge.me token belongs to a different store\n\n` +
            `Solution: Install Judge.me on ${session.shop} first, then reconnect the app.`,
          isVerified: false
        };
      }
    } catch (error) {
      console.error('[Judge.me Verification] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to verify shop",
      };
    }
  }
  
  if (actionType === "trigger_auto_post") {
    // Manually trigger the auto-post cron job with queue + lock semantics
    const { processAllShopsQueued, getProcessingState } = await import("../services/auto-post-cron.server");

    try {
      const state = getProcessingState();
      const res = await processAllShopsQueued();

      if (res.status === 'queued') {
        return {
          success: true,
          message: 'Auto-post already running. Your request was queued.',
          running: state.isProcessing,
          queued: true,
        };
      }

      if (res.status === 'started') {
        return {
          success: true,
          message: 'Auto-post started.',
          running: true,
          queued: false,
        };
      }

      return {
        success: true,
        message: 'Auto-post is already running.',
        running: true,
        queued: false,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger auto-post',
      };
    }
  }
  
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
      console.log(`[Instagram Post] Fetching reviews for shop: ${session.shop}`);
      const apiBase = process.env.JUDGEME_API_BASE || "https://judge.me/api/v1";
      
      let response = await fetch(`${apiBase}/reviews?shop_domain=${session.shop}`, {
        headers: {
          "Authorization": `Bearer ${judgeMeCredential.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.log(`[Instagram Post] Bearer auth failed, trying api_token...`);
        response = await fetch(
          `${apiBase}/reviews?shop_domain=${session.shop}&api_token=${judgeMeCredential.accessToken}&per_page=10`
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Instagram Post] Failed to fetch reviews for ${session.shop}:`, errorText);
        return { success: false, error: "Failed to fetch reviews from Judge.me" };
      }

      const data = await response.json();
      const reviews = data.reviews || data;
      
      console.log(`[Instagram Post] Fetched ${reviews?.length || 0} reviews for ${session.shop}`);

      if (!Array.isArray(reviews) || reviews.length === 0) {
        return { success: false, error: "No reviews found to post" };
      }
      
      // Log shop domain from first review for debugging
      if (reviews[0].shop_domain) {
        console.log(`[Instagram Post] First review shop_domain: ${reviews[0].shop_domain}`);
        if (reviews[0].shop_domain !== session.shop) {
          console.warn(`[Instagram Post] WARNING: Review shop domain (${reviews[0].shop_domain}) does not match session shop (${session.shop})`);
        }
      }

      // Find first 5-star review
      const fiveStarReview = reviews.find((r: any) => r.rating === 5);
      
      if (!fiveStarReview) {
        return { success: false, error: "No 5-star reviews found. Only 5-star reviews are posted to Instagram." };
      }
      
      console.log(`[Instagram Post] Found 5-star review from: ${fiveStarReview.reviewer?.name || fiveStarReview.reviewer_name || 'Unknown'}`);

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
          error: "Failed to generate review image. Please check: 1) GEMINI_API_KEY is set, 2) AWS S3 credentials are configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET), 3) Server logs for detailed error messages" 
        };
      }

      // Verify image URL is accessible before posting to Instagram
      console.log("Verifying image URL is accessible...");
      const isImageAccessible = await verifyImageUrl(imageUrl);
      
      if (!isImageAccessible) {
        return {
          success: false,
          error: "Image uploaded but not accessible. Please try again in a moment."
        };
      }
      
      console.log("✓ Image verified and accessible");

      // Create Instagram caption
      const stars = "⭐".repeat(5);
      const caption = `${stars}\n\n"${reviewText}"\n\n- ${reviewerName}\n\n#customerreview #review #testimonial`;

      const igAccountId = instagramCredential.instagramAccountId;
      const accessToken = instagramCredential.accessToken;

      // Step 1: Create media container
      console.log("Creating Instagram media container...");
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

// Helper function to verify image URL is accessible
async function verifyImageUrl(imageUrl: string, maxRetries = 5): Promise<boolean> {
  console.log(`Verifying image URL: ${imageUrl}`);
  
  // Check URL format
  try {
    const url = new URL(imageUrl);
    console.log(`URL protocol: ${url.protocol}, host: ${url.host}`);
  } catch (e) {
    console.error("Invalid URL format:", imageUrl);
    return false;
  }
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempt ${i + 1}/${maxRetries}: Checking if image is accessible...`);
      
      // First try HEAD request
      let response = await fetch(imageUrl, { 
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ReviewSocial/1.0; +https://reviewsocial.app)',
        }
      });
      
      // If HEAD fails, try GET
      if (!response.ok) {
        console.log(`HEAD request failed (${response.status}), trying GET...`);
        response = await fetch(imageUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ReviewSocial/1.0; +https://reviewsocial.app)',
          }
        });
      }
      
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');
        
        console.log(`✓ Image accessible (${contentType}, ${contentLength} bytes)`);
        
        // Verify it's actually an image (JPEG, PNG, WebP)
        if (contentType && contentType.startsWith('image/')) {
          // Additional check: ensure it's a format Instagram accepts
          const acceptedFormats = ['image/jpeg', 'image/jpg', 'image/png'];
          if (acceptedFormats.includes(contentType.toLowerCase())) {
            console.log(`✓ Image format ${contentType} is Instagram-compatible`);
            return true;
          } else {
            console.warn(`Warning: Format ${contentType} might not be Instagram-compatible`);
            // Still return true, let Instagram decide
            return true;
          }
        }
        
        console.warn(`Warning: Content-Type is ${contentType}, not an image`);
      } else {
        console.warn(`Response status: ${response.status} ${response.statusText}`);
      }
      
      // If not successful, wait before retry
      if (i < maxRetries - 1) {
        const waitTime = (i + 1) * 2000; // 2s, 4s, 6s, 8s, 10s
        console.log(`Image not ready, waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } catch (error) {
      console.error(`Error verifying image URL (attempt ${i + 1}):`, error);
      
      if (i < maxRetries - 1) {
        const waitTime = (i + 1) * 2000;
        console.log(`Error occurred, waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  console.error(`Failed to verify image URL after ${maxRetries} attempts`);
  return false;
}

export default function Index() {
  const shopify = useAppBridge();
  const [params] = useSearchParams();
  const actionData = useActionData<typeof action>();
  const { isJudgeMeConnected, isJudgeMeInstalled, isInstagramConnected, instagramUsername, currentShop, stats, legalUrls, managedPricingUrl, currentAppPlan, monthlyUsage, monthlyLimit } = useLoaderData<typeof loader>();
  const displayedPlan = currentAppPlan || "Free";
  const isMonthlyCapped = Number.isFinite(monthlyLimit) && monthlyUsage >= (monthlyLimit as number);
  
  const isFullySetup = isJudgeMeConnected && isInstagramConnected;
  const navigate = useNavigate();

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
        if (actionData.message) {
          // Display the formatted message from the action
          shopify.toast.show(actionData.message);
          if (actionData.shopInfo) {
            console.log("Judge.me Shop Info:", actionData.shopInfo);
          }
        } else if (actionData.shopInfo) {
          // Fallback: Display shop info in a more readable way
          const info = actionData.shopInfo;
          const message = `Judge.me Shop Info:\nID: ${info.id}\nDomain: ${info.domain}\nPlan: ${info.plan}\nPlatform: ${info.platform}\nOwner: ${info.owner}`;
          console.log("Judge.me Shop Info:", info);
          shopify.toast.show(message);
        } else {
          shopify.toast.show("Action completed successfully!");
        }
      } else if (actionData.error) {
        shopify.toast.show(actionData.error, { isError: true });
      }
    }
  }, [actionData, shopify]);

  return (
    <Page title="ReviewSocial">
      <BlockStack gap="500">
        {/* Welcome Banner for new users */}
        {!isFullySetup && (
          <Banner tone="info">
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                Welcome to ReviewSocial! 🎉
              </Text>
              <Text as="p" variant="bodyMd">
                Automatically turn your 5-star reviews into beautiful Instagram posts with AI-generated images.
                Follow the setup steps below to get started.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {/* Managed Pricing - open Shopify pricing dashboard */}
        {managedPricingUrl && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Plan & Billing
              </Text>
              <Text as="p" variant="bodyMd">
                Current plan: <Text as="span" fontWeight="semibold">{displayedPlan}</Text>
              </Text>
              <Text as="p" variant="bodyMd">
                {Number.isFinite(monthlyLimit) ? (
                  <>This month: <Text as="span" fontWeight="semibold">{monthlyUsage}</Text> of <Text as="span" fontWeight="semibold">{monthlyLimit as number}</Text> images used</>
                ) : (
                  <>This month: <Text as="span" fontWeight="semibold">{monthlyUsage}</Text> images used</>
                )}
              </Text>
              <InlineStack gap="200">
                <Button onClick={() => window.open(managedPricingUrl as string, "_top")}>
                  View plans
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* Dashboard Stats - only show when fully setup */}
        {isFullySetup && (
          <Layout>
            <Layout.Section variant="oneHalf">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {stats.totalPosted}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Total Reviews Posted
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
            
            <Layout.Section variant="oneHalf">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {stats.todayPosted}/10
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Posted Today
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* Setup Guide with Progress */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    {isJudgeMeConnected ? '✅' : '1️⃣'} Judge.me Integration
                  </Text>
                  {isJudgeMeConnected && (
                    <Text as="p" variant="bodySm" tone="success">
                      Step completed
                    </Text>
                  )}
                </BlockStack>
                <Text as="p" variant="bodyMd">
                  <Text as="span" fontWeight="semibold">Current Store:</Text> {currentShop}
                </Text>
                <Text as="p" variant="bodyMd">
                  Connect your Judge.me account to fetch reviews for THIS store only.
                </Text>
                
                {!isJudgeMeConnected && (
                  <Banner tone="info">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd">
                        <Text as="span" fontWeight="semibold">Before connecting:</Text> Make sure Judge.me is installed on {currentShop}.
                      </Text>
                      <Text as="p" variant="bodyMd">
                        If Judge.me is not installed, you can get it from the{' '}
                        <Link url="https://apps.shopify.com/judgeme" target="_blank">
                          Shopify App Store
                        </Link>.
                      </Text>
                    </BlockStack>
                  </Banner>
                )}
                
                {isJudgeMeConnected ? (
                  <BlockStack gap="300">
                    <Banner tone="success">
                      <Text as="p" variant="bodyMd">
                        <Text as="span" fontWeight="semibold">✓ Connected</Text> - Reviews will be fetched from {currentShop}
                      </Text>
                    </Banner>
                    <InlineStack gap="200">
                      <Form method="post" action="/app/judgeme/disconnect">
                        <Button variant="plain" submit>
                          Disconnect Judge.me
                        </Button>
                      </Form>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <InlineStack gap="200">
                    <Button variant="primary" url={`/judgeme/connect?shop=${currentShop}`}>
                      Connect to Judge.me
                    </Button>
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    {isInstagramConnected ? '✅' : '2️⃣'} Instagram Integration
                  </Text>
                  {isInstagramConnected && (
                    <Text as="p" variant="bodySm" tone="success">
                      Step completed
                    </Text>
                  )}
                </BlockStack>
                <Text as="p" variant="bodyMd">
                  Connect your Instagram business account to auto-post reviews.
                </Text>
                
                {isInstagramConnected ? (
                  <BlockStack gap="300">
                    <Banner tone="success">
                      <Text as="p" variant="bodyMd">
                        Connected as @{instagramUsername || "Instagram User"}
                      </Text>
                    </Banner>
                    <InlineStack gap="200">
                      <Form method="post" action="/app/instagram/disconnect">
                        <Button variant="plain" submit>
                          Disconnect Instagram
                        </Button>
                      </Form>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <BlockStack gap="300">
                    {!isJudgeMeConnected && (
                      <Banner tone="info">
                        <Text as="p" variant="bodyMd">
                          Please connect Judge.me first to enable Instagram posting.
                        </Text>
                      </Banner>
                    )}
                    <InlineStack gap="200">
                      <Button 
                        variant="primary" 
                        url={`/instagram/connect?shop=${currentShop}`}
                        disabled={!isJudgeMeConnected}
                      >
                        Connect to Instagram
                      </Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {isJudgeMeConnected && isInstagramConnected && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                      ✅ Auto-Post Reviews
                    </Text>
                    <Text as="p" variant="bodySm" tone="success">
                      All setup complete! You're ready to go 🚀
                    </Text>
                  </BlockStack>
                  <Text as="p" variant="bodyMd">
                    Automatically posts new 5-star reviews to Instagram every 2 hours (max 10 posts/day).
                  </Text>
                  
                  <Banner tone="info">
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="semibold">Note:</Text> For automatic posting via webhooks, you need Judge.me's Awesome plan.
                      Until then, use the "Check for New Reviews" button below or set up a cron job.
                    </Text>
                  </Banner>

                  <InlineStack gap="300">
                    <Button onClick={() => navigate('/app/reviews')}>
                      View Posted Reviews
                    </Button>
                    
                    <Form method="post">
                      <input type="hidden" name="_action" value="trigger_auto_post" />
                      <Button variant="primary" submit disabled={isMonthlyCapped}>
                        Check for New Reviews Now
                      </Button>
                    </Form>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}
        </Layout>

        {/* Footer with legal links */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300" inlineAlign="center">
                <Text as="p" variant="bodyMd" alignment="center">
                  <Text as="span" fontWeight="semibold">ReviewSocial</Text> - Automatically turn 5-star reviews into Instagram posts
                </Text>
                <InlineStack gap="300" wrap={false}>
                  <Link url={legalUrls.privacyPolicy} target="_blank">
                    Privacy Policy
                  </Link>
                  <Text as="span">•</Text>
                  <Link url={legalUrls.termsOfService} target="_blank">
                    Terms of Service
                  </Link>
                  <Text as="span">•</Text>
                  <Link url={legalUrls.support} target="_blank">
                    Support
                  </Link>
                </InlineStack>
                <Text as="p" variant="bodySm" alignment="center">
                  Need help? Contact us at{' '}
                  <Link url={`mailto:${legalUrls.supportEmail}`}>
                    {legalUrls.supportEmail}
                  </Link>
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
