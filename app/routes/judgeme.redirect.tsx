import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import crypto from "crypto";

export const handle = { isPublic: true }; // <- make sure any root auth guard skips this

export async function loader({ request }: LoaderFunctionArgs) {
  const appUrl = process.env.APP_URL!;
  const clientId = process.env.JUDGEME_CLIENT_ID!;
  const scope = (process.env.JUDGEME_SCOPES || "public").trim();
  const redirectUri = `${appUrl}/judgeme/callback`;
  const authBase = "https://app.judge.me/oauth/authorize";

  // Read shop from the querystring (we passed it from the embedded route)
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return new Response("Missing shop", { status: 400 });
  }

  // Generate CSRF state and SET COOKIES AS FIRST-PARTY (this route is top-level)
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

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
    approval_prompt: "force", // Force authorization prompt every time
  });

  return redirect(`${authBase}?${params.toString()}`, { headers });
}

export default function _NoUI() { return null; }
