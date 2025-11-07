import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { generateReviewImage } from "../services/image-generator.server";
import crypto from "crypto";

// Make this route publicly accessible (no Shopify auth required)
export const handle = { isPublic: true };

/**
 * Judge.me Webhook Endpoint
 * Receives webhooks when reviews are created and auto-posts to Instagram
 */
export async function action({ request }: ActionFunctionArgs) {
  console.log('[Webhook] Received Judge.me webhook');

  try {
    const rawBody = await request.text();
    
    // Verify HMAC signature
    const hmacHeader = request.headers.get('JUDGEME-HMAC-SHA256') || 
                      request.headers.get('HTTP_X_JUDGEME_HMAC_SHA256') ||
                      request.headers.get('X-Judgeme-Hmac-SHA256');
    
    if (!hmacHeader) {
      console.error('[Webhook] Missing HMAC signature header');
      return new Response('Unauthorized - Missing HMAC', { status: 401 });
    }

    // Compute expected HMAC
    const secret = process.env.JUDGEME_CLIENT_SECRET!;
    const computedHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(computedHmac))) {
      console.error('[Webhook] HMAC verification failed');
      console.error('[Webhook] Expected:', computedHmac);
      console.error('[Webhook] Received:', hmacHeader);
      return new Response('Unauthorized - Invalid HMAC', { status: 401 });
    }

    console.log('[Webhook] ✓ HMAC verified');

    let webhookData: any;
    
    try {
      webhookData = JSON.parse(rawBody);
    } catch (error) {
      console.error('[Webhook] Invalid JSON:', error);
      return new Response('Bad Request', { status: 400 });
    }

    console.log('[Webhook] Webhook data:', JSON.stringify(webhookData, null, 2));

    // Extract shop domain
    const shop = webhookData.shop_domain;
    if (!shop) {
      console.error('[Webhook] No shop_domain in webhook');
      return new Response('Bad Request - No shop_domain', { status: 400 });
    }

    console.log(`[Webhook] Processing webhook for shop: ${shop}`);

    // Extract review data
    const review = webhookData.review || webhookData;
    const rating = review.rating || review.score;
    const reviewText = review.body || review.content || '';
    const reviewerName = review.reviewer?.name || review.reviewer_name || review.name || 'A Happy Customer';
    const productTitle = review.product_title || review.product?.title || 'Our Product';

    console.log(`[Webhook] Review:`, {
      rating,
      reviewer: reviewerName,
      product: productTitle,
      textLength: reviewText.length,
    });

    // Only process 5-star reviews
    if (rating !== 5) {
      console.log(`[Webhook] Skipping ${rating}-star review (only 5-star reviews are posted)`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Only 5-star reviews are posted' 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if both Judge.me and Instagram are connected
    const [judgeMeCredential, instagramCredential] = await Promise.all([
      prisma.judgeMeCredential.findUnique({ where: { shop } }),
      prisma.instagramCredential.findUnique({ where: { shop } }),
    ]);

    if (!judgeMeCredential) {
      console.log(`[Webhook] Judge.me not connected for ${shop}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Judge.me not connected' 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!instagramCredential) {
      console.log(`[Webhook] Instagram not connected for ${shop}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Instagram not connected' 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Webhook] Both services connected, processing review...`);

    // Extract brand name from shop domain
    const brandName = shop
      .replace('.myshopify.com', '')
      .split('-')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Generate image
    console.log(`[Webhook] Generating image...`);
    const imageUrl = await generateReviewImage({
      reviewText,
      rating,
      reviewerName,
      productTitle,
      brandName,
    });

    if (!imageUrl) {
      console.error('[Webhook] Image generation failed');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Image generation failed' 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Webhook] Image generated: ${imageUrl}`);

    // Verify image is accessible
    console.log('[Webhook] Verifying image accessibility...');
    const isImageAccessible = await verifyImageUrl(imageUrl);
    
    if (!isImageAccessible) {
      console.error('[Webhook] Image not accessible');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Image not accessible' 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[Webhook] Image verified, posting to Instagram...');

    // Post to Instagram
    const stars = '⭐'.repeat(rating);
    const caption = `${stars}\n\n"${reviewText}"\n\n- ${reviewerName}\n\n#customerreview #review #testimonial`;

    const igAccountId = instagramCredential.instagramAccountId;
    const accessToken = instagramCredential.accessToken;

    // Create media container
    const containerUrl = `https://graph.facebook.com/v18.0/${igAccountId}/media`;
    const containerParams = new URLSearchParams({
      image_url: imageUrl,
      caption: caption,
      access_token: accessToken,
    });

    const containerResp = await fetch(containerUrl, {
      method: 'POST',
      body: containerParams,
    });

    if (!containerResp.ok) {
      const errorText = await containerResp.text();
      console.error('[Webhook] Failed to create media container:', errorText);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Failed to create media container: ${errorText}` 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const containerData = await containerResp.json();
    const containerId = containerData.id;

    // Publish media
    const publishUrl = `https://graph.facebook.com/v18.0/${igAccountId}/media_publish`;
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    });

    const publishResp = await fetch(publishUrl, {
      method: 'POST',
      body: publishParams,
    });

    if (!publishResp.ok) {
      const errorText = await publishResp.text();
      console.error('[Webhook] Failed to publish media:', errorText);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Failed to publish media: ${errorText}` 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const publishData = await publishResp.json();
    const postId = publishData.id;

    console.log(`[Webhook] ✅ Successfully posted to Instagram! Post ID: ${postId}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Review posted to Instagram',
      postId 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Internal error' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Helper function to verify image URL
async function verifyImageUrl(imageUrl: string, maxRetries = 5): Promise<boolean> {
  console.log(`[Webhook] Verifying image URL: ${imageUrl}`);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`[Webhook] Attempt ${i + 1}/${maxRetries}`);
      
      let response = await fetch(imageUrl, { 
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SocialRevu/1.0)',
        }
      });
      
      if (!response.ok) {
        response = await fetch(imageUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SocialRevu/1.0)',
          }
        });
      }
      
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        console.log(`[Webhook] ✓ Image accessible (${contentType})`);
        return true;
      }
      
      if (i < maxRetries - 1) {
        const waitTime = (i + 1) * 2000;
        console.log(`[Webhook] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } catch (error) {
      console.error(`[Webhook] Verification error (attempt ${i + 1}):`, error);
      
      if (i < maxRetries - 1) {
        const waitTime = (i + 1) * 2000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  return false;
}

export function loader() {
  return new Response('Method Not Allowed', { status: 405 });
}


