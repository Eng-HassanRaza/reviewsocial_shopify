import type { LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { ShopifyGlobal } from "@shopify/app-bridge-types";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const appUrl = process.env.APP_URL!;

  const topRedirect = `${appUrl}/instagram/redirect?shop=${encodeURIComponent(shop)}`;

  return Response.json({ topRedirect });
}

export default function InstagramConnect() {
  const { topRedirect } = useLoaderData() as { topRedirect: string };
  const app = useAppBridge();

  useEffect(() => {
    if (!topRedirect) return;

    try {
      const bridge = app as ShopifyGlobal & {
        navigation?: { navigate?: (url: string) => void };
        redirect?: (url: string) => void;
      };

      if (typeof bridge.navigation?.navigate === "function") {
        bridge.navigation.navigate(topRedirect);
        return;
      }

      if (typeof bridge.redirect === "function") {
        bridge.redirect(topRedirect);
        return;
      }

      window.open(topRedirect, "_top");
    } catch (err) {
      console.error("Top-level redirect failed", err);
      window.open(topRedirect, "_top");
    }
  }, [app, topRedirect]);

  return (
    <s-page heading="Connecting to Instagram">
      <s-section>
        <s-paragraph>Redirecting to Facebook/Instagram…</s-paragraph>
      </s-section>
    </s-page>
  );
}

