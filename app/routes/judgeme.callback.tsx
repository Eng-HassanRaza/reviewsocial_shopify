// app/routes/judgeme.callback.tsx
import { redirect } from "react-router";
import prisma from "../db.server";

export const handle = { isPublic: true };

/* --- tiny cookie helpers --- */
function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
function clearCookieHeader(name: string) {
  return [
    `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/judgeme/callback; Max-Age=0`,
  ];
}

/* --- loader: validate state, exchange code, then redirect into Admin Apps URL --- */
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // read cookies set in /judgeme/redirect
  const stateCookie = getCookie(request, "jm_oauth_state");
  const shop = getCookie(request, "jm_oauth_shop");
  const host = getCookie(request, "jm_oauth_host"); // ok if null

  // Build your Admin Apps URL (embedded context)
  const apiKey = process.env.SHOPIFY_API_KEY!;
  const adminAppBase = shop && apiKey
    ? `https://${shop}/admin/apps/${apiKey}/app`
    : null; // fallback later if missing

  // helper to finish (success or error) and clear temp cookies
  const finish = (search: Record<string, string>) => {
    const headers = new Headers();
    clearCookieHeader("jm_oauth_state").forEach((c) =>
      headers.append("Set-Cookie", c),
    );
    clearCookieHeader("jm_oauth_shop").forEach((c) =>
      headers.append("Set-Cookie", c),
    );
    clearCookieHeader("jm_oauth_host").forEach((c) =>
      headers.append("Set-Cookie", c),
    );

    const qs = new URLSearchParams(search);

    // Prefer redirecting back into Shopify Admin embedded context
    if (adminAppBase) {
      return redirect(`${adminAppBase}?${qs.toString()}`, { headers });
    }
    // Fallback: redirect to your own /app (top-level) if apiKey or shop missing
    return redirect(`/app?${qs.toString()}`, { headers });
  };

  if (error) return finish({ judgeme_error: error });
  if (!code || !state) return finish({ judgeme_error: "missing_params" });
  if (!stateCookie || stateCookie !== state || !shop) {
    return finish({ judgeme_error: "invalid_state" });
  }

  const tokenUrl = process.env.JUDGEME_TOKEN_URL!;
  const clientId = process.env.JUDGEME_CLIENT_ID!;
  const clientSecret = process.env.JUDGEME_CLIENT_SECRET!;
  const redirectUri = `${process.env.APP_URL}/judgeme/callback`;

  try {
    // Attempt 1: send credentials in body (common)
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    let resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    // Attempt 2: retry using HTTP Basic auth if unauthorized
    if (resp.status === 400 || resp.status === 401) {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const form2 = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      });
      resp = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: form2,
      });
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Token exchange failed (${resp.status}): ${text}`);
    }

    const json = await resp.json();
    const accessToken: string | undefined =
      json.access_token || json.token || json?.data?.access_token;
    if (!accessToken) throw new Error("No access_token in response");

    // Validate that the token belongs to the correct store
    console.log(`Validating Judge.me token for shop: ${shop}`);
    
    try {
      // Try to fetch reviews to validate the token works for this shop
      const validateResp = await fetch(
        `https://judge.me/api/v1/reviews?shop_domain=${shop}&api_token=${accessToken}&per_page=5`
      );
      
      if (!validateResp.ok) {
        const errorText = await validateResp.text();
        console.error(`Token validation failed for ${shop}:`, errorText);
        
        // Check if it's an authentication error
        if (validateResp.status === 401 || validateResp.status === 403) {
          throw new Error(
            `Judge.me authorization failed. Please ensure Judge.me is installed and configured on your store (${shop}).`
          );
        }
        
        throw new Error(
          `Token validation failed: ${validateResp.status}. Judge.me might not be installed on this store.`
        );
      }
      
      const validateData = await validateResp.json();
      const reviews = validateData.reviews || [];
      
      console.log(`Token validation response for ${shop}:`, {
        reviewCount: reviews.length,
        hasReviews: reviews.length > 0,
      });
      
      // CRITICAL: Check if reviews are actually from THIS store
      if (reviews.length > 0) {
        const firstReview = reviews[0];
        const reviewShop = firstReview.shop_domain || firstReview.shop?.domain;
        
        console.log(`First review shop_domain:`, reviewShop);
        console.log(`Expected shop:`, shop);
        
        // If the review has a shop_domain field and it doesn't match, reject
        if (reviewShop && reviewShop !== shop) {
          console.error(`VALIDATION FAILED: Reviews are from ${reviewShop}, not ${shop}`);
          throw new Error(
            `This Judge.me account is connected to ${reviewShop}, not ${shop}. Please install Judge.me on ${shop} first, or disconnect from other stores.`
          );
        }
        
        // Additional check: look for shop mismatch in any of the reviews
        const mismatchedReview = reviews.find((r: any) => {
          const rShop = r.shop_domain || r.shop?.domain;
          return rShop && rShop !== shop;
        });
        
        if (mismatchedReview) {
          const wrongShop = mismatchedReview.shop_domain || mismatchedReview.shop?.domain;
          console.error(`VALIDATION FAILED: Found review from wrong store: ${wrongShop}`);
          throw new Error(
            `Judge.me reviews are from ${wrongShop}, not ${shop}. Please install Judge.me on ${shop}.`
          );
        }
        
        console.log(`✓ Token validated: All reviews are from ${shop}`);
      } else {
        // No reviews found - this might be okay if it's a new store
        console.warn(`No reviews found for ${shop}. This might be a new store or Judge.me isn't installed.`);
        // We'll allow this but log it
      }
      
      // If we get here, the token is valid for this shop
      await prisma.judgeMeCredential.upsert({
        where: { shop },
        update: { accessToken },
        create: { shop, accessToken },
      });

      // Success: back into Admin embedded app with a success flag
      const q: Record<string, string> = { judgeme_connected: "1" };
      if (host) q.host = host;
      if (shop) q.shop = shop;
      return finish(q);
      
    } catch (validationError) {
      console.error("Token validation error:", validationError);
      throw validationError;
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "oauth_failed";
    const q: Record<string, string> = {
      judgeme_error: message,
    };
    if (host) q.host = host;
    if (shop) q.shop = shop;
    return finish(q);
  }
}

export default function Callback() {
  return null;
}
