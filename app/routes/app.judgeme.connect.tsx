// app/routes/app.judgeme.connect.tsx
import type { LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { useLoaderData } from "react-router";
import crypto from "crypto";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";

/* ============================
   SERVER: Build the authorize URL
============================ */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const appUrl = process.env.APP_URL;
  const clientId = process.env.JUDGEME_CLIENT_ID;
  const scope = (process.env.JUDGEME_SCOPES || "public").trim();
  const redirectUri = `${appUrl}/judgeme/callback`;
  const authBase = "https://app.judge.me/oauth/authorize";

  if (!appUrl || appUrl.includes("example.com")) {
    throw new Error("APP_URL must be set to your public (ngrok/Cloudflare) domain.");
  }
  if (!clientId) {
    throw new Error("JUDGEME_CLIENT_ID missing in .env");
  }

  // CSRF state token
  const state = crypto.randomBytes(24).toString("hex");

  // Temporary cookies for callback verification
  const headers = new Headers();
  const tenMins = 60 * 10;
  headers.append(
    "Set-Cookie",
    `jm_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/judgeme/callback; Max-Age=${tenMins}`
  );
  headers.append(
    "Set-Cookie",
    `jm_oauth_shop=${encodeURIComponent(shop)}; HttpOnly; Secure; SameSite=Lax; Path=/judgeme/callback; Max-Age=${tenMins}`
  );

  // Build the Judge.me authorize URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
  });

  const authorizeUrl = `${authBase}?${params.toString()}`;
  return Response.json({ authorizeUrl }, { headers });
}

/* ============================
   CLIENT: Redirect outside the iframe
============================ */
export default function JudgeMeConnect() {
  const { authorizeUrl } = useLoaderData() as { authorizeUrl: string };
  const app = useAppBridge();

  useEffect(() => {
    if (!authorizeUrl) return;

    try {
      // App Bridge v4 exposes top-level redirect as navigate()
      // @ts-ignore
      if (app?.navigation?.navigate) {
        // @ts-ignore
        app.navigation.navigate(authorizeUrl);
        return;
      }

      // Some older builds expose app.redirect()
      // @ts-ignore
      if (typeof app?.redirect === "function") {
        // @ts-ignore
        app.redirect(authorizeUrl);
        return;
      }

      // Final safe fallback: open top-level window
      window.open(authorizeUrl, "_top");
    } catch (err) {
      console.error("Judge.me redirect failed", err);
      window.open(authorizeUrl, "_top");
    }
  }, [app, authorizeUrl]);

  return (
    <s-page heading="Connecting to Judge.me">
      <s-section>
        <s-paragraph>Redirecting to Judge.me…</s-paragraph>
      </s-section>
    </s-page>
  );
}
