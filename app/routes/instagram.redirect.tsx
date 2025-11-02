import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import crypto from "crypto";

export const handle = { isPublic: true };

export async function loader({ request }: LoaderFunctionArgs) {
  const appUrl = process.env.APP_URL!;
  const clientId = process.env.FACEBOOK_APP_ID!;
  const redirectUri = `${appUrl}/instagram/callback`;
  const authBase = "https://www.facebook.com/v18.0/dialog/oauth";

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return new Response("Missing shop", { status: 400 });
  }

  const state = crypto.randomBytes(24).toString("hex");
  const tenMins = 60 * 10;
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `ig_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/instagram/callback; Max-Age=${tenMins}`
  );
  headers.append(
    "Set-Cookie",
    `ig_oauth_shop=${encodeURIComponent(shop)}; HttpOnly; Secure; SameSite=Lax; Path=/instagram/callback; Max-Age=${tenMins}`
  );

  const scopes = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_read_engagement",
    "pages_manage_posts",
    "business_management",
  ].join(",");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    state,
  });

  return redirect(`${authBase}?${params.toString()}`, { headers });
}

export default function _NoUI() {
  return null;
}

