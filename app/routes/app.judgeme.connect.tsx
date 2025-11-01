// app/routes/app.judgeme.connect.tsx
import type { LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";

/**
 * Loader: Authenticates the shop, then returns the top-level redirect URL.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const appUrl = process.env.APP_URL!;

  // We'll hop to /judgeme/redirect (a public route) to set cookies first-party
  const topRedirect = `${appUrl}/judgeme/redirect?shop=${encodeURIComponent(shop)}`;

  // ✅ Use native Response.json instead of json()
  return Response.json({ topRedirect });
}

/**
 * Client: Opens the top-level redirect route outside the Shopify iframe
 */
export default function JudgeMeConnect() {
  const { topRedirect } = useLoaderData() as { topRedirect: string };
  const app = useAppBridge();

  useEffect(() => {
    if (!topRedirect) return;

    try {
      // App Bridge v4 navigation API
      // @ts-ignore
      if (app?.navigation?.navigate) {
        // @ts-ignore
        app.navigation.navigate(topRedirect);
        return;
      }

      // Some older versions expose app.redirect()
      // @ts-ignore
      if (typeof app?.redirect === "function") {
        // @ts-ignore
        app.redirect(topRedirect);
        return;
      }

      // Fallback
      window.open(topRedirect, "_top");
    } catch (err) {
      console.error("Top-level redirect failed", err);
      window.open(topRedirect, "_top");
    }
  }, [app, topRedirect]);

  return (
    <s-page heading="Connecting to Judge.me">
      <s-section>
        <s-paragraph>Redirecting to Judge.me…</s-paragraph>
      </s-section>
    </s-page>
  );
}
