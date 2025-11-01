import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const shopify = useAppBridge();
  const [params] = useSearchParams();

  useEffect(() => {
    if (params.get("judgeme_connected") === "1") {
      shopify.toast.show("Connected to Judge.me");
    }
    if (params.get("judgeme_error")) {
      shopify.toast.show(
        `Judge.me connection failed: ${params.get("judgeme_error")}`,
        { isError: true }
      );
    }
  }, [params, shopify]);

  return (
    <s-page heading="reviewsocial">
      <s-section heading="Integrations">
        <s-paragraph>Connect your Judge.me account to enable reviews.</s-paragraph>
        <s-button variant="primary" href="/app/judgeme/connect">
          Connect to Judge.me
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
