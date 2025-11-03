import { redirect } from "react-router";
import prisma from "../db.server";

export const handle = { isPublic: true };

function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearCookieHeader(name: string) {
  return [
    `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/instagram/callback; Max-Age=0`,
  ];
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const stateCookie = getCookie(request, "ig_oauth_state");
  const shop = getCookie(request, "ig_oauth_shop");

  const apiKey = process.env.SHOPIFY_API_KEY!;
  const adminAppBase = shop && apiKey
    ? `https://${shop}/admin/apps/${apiKey}/app`
    : null;

  const finish = (search: Record<string, string>) => {
    const headers = new Headers();
    clearCookieHeader("ig_oauth_state").forEach((c) =>
      headers.append("Set-Cookie", c),
    );
    clearCookieHeader("ig_oauth_shop").forEach((c) =>
      headers.append("Set-Cookie", c),
    );

    const qs = new URLSearchParams(search);

    if (adminAppBase) {
      return redirect(`${adminAppBase}?${qs.toString()}`, { headers });
    }
    return redirect(`/app?${qs.toString()}`, { headers });
  };

  if (error) return finish({ instagram_error: error });
  if (!code || !state) return finish({ instagram_error: "missing_params" });
  if (!stateCookie || stateCookie !== state || !shop) {
    return finish({ instagram_error: "invalid_state" });
  }

  const clientId = process.env.FACEBOOK_APP_ID!;
  const clientSecret = process.env.FACEBOOK_APP_SECRET!;
  const redirectUri = `${process.env.APP_URL}/instagram/callback`;

  try {
    // Exchange code for access token
    const tokenUrl = "https://graph.facebook.com/v18.0/oauth/access_token";
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenResp = await fetch(`${tokenUrl}?${tokenParams.toString()}`);
    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      throw new Error(`Token exchange failed: ${text}`);
    }

    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) throw new Error("No access token received");

    // Get user's Facebook pages
    const pagesResp = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
    );
    const pagesData = await pagesResp.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error("No Facebook pages found. You need a Facebook page linked to your Instagram business account.");
    }

    // Get the first page (you might want to let users select)
    const page = pagesData.data[0];
    const pageAccessToken = page.access_token;
    const facebookPageId = page.id;

    // Get Instagram business account connected to the page
    const igResp = await fetch(
      `https://graph.facebook.com/v18.0/${facebookPageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
    );
    const igData = await igResp.json();

    if (!igData.instagram_business_account) {
      throw new Error("No Instagram business account found. Please connect an Instagram business account to your Facebook page.");
    }

    const instagramAccountId = igData.instagram_business_account.id;

    // Get Instagram username
    const profileResp = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}?fields=username&access_token=${pageAccessToken}`
    );
    const profileData = await profileResp.json();
    const instagramUsername = profileData.username;

    // Store credentials
    await prisma.instagramCredential.upsert({
      where: { shop },
      update: {
        accessToken: pageAccessToken,
        instagramAccountId,
        instagramUsername,
        facebookPageId,
      },
      create: {
        shop,
        accessToken: pageAccessToken,
        instagramAccountId,
        instagramUsername,
        facebookPageId,
      },
    });

    return finish({ instagram_connected: "1" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "oauth_failed";
    return finish({ instagram_error: message });
  }
}

export default function Callback() {
  return null;
}

