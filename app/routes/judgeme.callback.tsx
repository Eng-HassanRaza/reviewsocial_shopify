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

/* --- cookie-based signalling helpers ---
   URL params get dropped by Shopify's auth redirect chain, so we use cookies instead. */

function cookieRedirect(
  cookieName: string,
  cookieValue: string,
  { host, shop }: { host: string | null; shop: string | null }
) {
  const headers = new Headers();
  clearCookieHeader("jm_oauth_state").forEach((c) => headers.append("Set-Cookie", c));
  clearCookieHeader("jm_oauth_shop").forEach((c) => headers.append("Set-Cookie", c));
  clearCookieHeader("jm_oauth_host").forEach((c) => headers.append("Set-Cookie", c));
  headers.append(
    "Set-Cookie",
    `${cookieName}=${encodeURIComponent(cookieValue)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`
  );
  const qs = new URLSearchParams();
  if (shop) qs.set("shop", shop);
  if (host) qs.set("host", host);
  return redirect(`/app?${qs.toString()}`, { headers });
}

const finishNotInstalled = (ctx: { host: string | null; shop: string | null }) =>
  cookieRedirect("jm_not_installed", "1", ctx);

const finishWithError = (message: string, ctx: { host: string | null; shop: string | null }) =>
  cookieRedirect("jm_oauth_error", message, ctx);

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
    // Redirect back to app route with host/shop context to let Shopify app bridge re-embed correctly.
    return redirect(`/app?${qs.toString()}`, { headers });
  };

  if (error) return finishWithError(error, { host, shop });
  if (!code || !state) return finishWithError("missing_params", { host, shop });
  if (!stateCookie || stateCookie !== state || !shop) {
    return finishWithError("invalid_state", { host, shop });
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

    // Validate that the token works for this store by checking shop registration
    console.log(`[Judge.me Validation] Validating token for shop: ${shop}`);
    
    try {
      // Use /shops/info to directly verify this shop is registered in Judge.me
      const validateResp = await fetch(
        `https://judge.me/api/v1/shops/info?shop_domain=${shop}&api_token=${accessToken}`
      );
      
      // If API returns non-200, Judge.me is not registered for this shop
      if (!validateResp.ok) {
        const errorText = await validateResp.text();
        const statusCode = validateResp.status;
        console.error(`[Judge.me Validation] FAILED for ${shop} (${statusCode}):`, errorText);
        return finishNotInstalled({ host, shop });
      }
      
      const validateData = await validateResp.json();
      const returnedShop = validateData.shop;
      const returnedShopDomain = returnedShop?.domain;
      
      console.log(`[Judge.me Validation] API returned shop domain:`, returnedShopDomain);
      console.log(`[Judge.me Validation] Expected shop domain:`, shop);
      
      // STRICT CHECK: Returned domain MUST exactly match current shop
      if (!returnedShopDomain) {
        console.error(`[Judge.me Validation] FAILED: No shop domain in response — likely a new Judge.me account with no shop registered`);
        return finishNotInstalled({ host, shop });
      }
      
      if (returnedShopDomain !== shop) {
        console.error(`[Judge.me Validation] FAILED: Domain mismatch - API returned ${returnedShopDomain}, expected ${shop}`);
        return finishNotInstalled({ host, shop });
      }
      
      console.log(`[Judge.me Validation] ✓ SUCCESS: Shop domain matches (${returnedShopDomain} === ${shop})`);
      console.log(`[Judge.me Validation] ✓ Shop ID: ${returnedShop.id}, Plan: ${returnedShop.plan}`);
      console.log(`[Judge.me Validation] ✓ ${shop} is properly registered in this Judge.me account`);
    
      
      // If we get here, the token is valid for this shop
      await prisma.judgeMeCredential.upsert({
        where: { shop },
        update: { accessToken },
        create: { shop, accessToken },
      });

      // Register webhook for automatic posting
      console.log(`[Judge.me] Registering webhook for ${shop}...`);
      try {
        const webhookUrl = `${process.env.APP_URL}/webhooks/judgeme/review`;
        
        // Judge.me uses api_token in URL, not Bearer token
        const webhookApiUrl = `https://judge.me/api/v1/webhooks?shop_domain=${shop}&api_token=${accessToken}`;
        
        const webhookResp = await fetch(webhookApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhook: {
              key: 'review/created',
              url: webhookUrl
            }
          })
        });

        if (webhookResp.ok) {
          const webhookData = await webhookResp.json();
          console.log('[Judge.me] Webhook registration response:', JSON.stringify(webhookData, null, 2));
          const webhookId = webhookData.webhook?.id;
          
          if (webhookId) {
            await prisma.judgeMeCredential.update({
              where: { shop },
              data: { webhookId: String(webhookId) }
            });
            console.log(`[Judge.me] ✓ Webhook registered successfully! (ID: ${webhookId})`);
            console.log(`[Judge.me]   URL: ${webhookUrl}`);
            console.log(`[Judge.me]   Event: review/created`);
          }
        } else {
          const errorText = await webhookResp.text();
          console.error(`[Judge.me] Webhook registration failed (${webhookResp.status}):`, errorText);
        }
      } catch (webhookError) {
        console.error('[Judge.me] Webhook registration error:', webhookError);
      }

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
    const message = error instanceof Error ? error.message : "oauth_failed";
    return finishWithError(message, { host, shop });
  }
}

export default function Callback() {
  return null;
}
