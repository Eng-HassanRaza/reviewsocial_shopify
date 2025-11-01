// app/routes/judgeme.redirect.tsx
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import crypto from "crypto";
import { authenticate } from "../shopify.server";

// Let root loader (if any) know this route is public
export const handle = { isPublic: true };

export async function loader({ request }: LoaderFunctionArgs) {
  // We still want to know the shop. If your root requires auth for this, remove this line
  // and pass shop via querystring from /app/judgeme/connect instead.
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  const appUrl = process.env.APP_URL!;
  const clientId = process.env.JUDGEME_CLIENT_ID!;
  const scope = (process.env.JUDGEME_SCOPES || "public").trim();
  const redirectUri = `${appUrl}/judgeme/callback`;
  const authBase = "https://app.judge.me/oauth/authorize";

  // Generate CSRF state and SET COOKIES IN TOP-LEVEL CONTEXT (works!)
  const state = crypto.randomBytes(24).toString("hex");
  const tenMins = 60 * 10;
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `jm_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/judgeme/callback; Max-Age=${tenMins}`
  );
  headers.append(
    "Set-Cookie",
    `jm_oauth_shop=${encodeURIComponent(shop)}; HttpOnly; Secure; SameSite=Lax; Path=/judgeme/callback; Max-Age=${tenMins}`
  );
  if (host) {
    headers.append(
      "Set-Cookie",
      `jm_oauth_host=${encodeURIComponent(host)}; HttpOnly; Secure; SameSite=Lax; Path=/judgeme/callback; Max-Age=${tenMins}`
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
  });

  return redirect(`${authBase}?${params.toString()}`, { headers });
}

// No component needed; we immediately redirect
export default function RedirectToJudgeMe() {
  return null;
}
