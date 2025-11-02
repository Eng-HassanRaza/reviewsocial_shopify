import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { Form, useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const credential = await prisma.judgeMeCredential.findUnique({
    where: { shop: session.shop },
  });

  return {
    isConnected: Boolean(credential),
  };
};

export default function Index() {
  const shopify = useAppBridge();
  const [params] = useSearchParams();
  const { isConnected } = useLoaderData<typeof loader>();

  useEffect(() => {
    if (params.get("judgeme_connected") === "1") {
      shopify.toast.show("Connected to Judge.me");
    }
    if (params.get("judgeme_disconnected") === "1") {
      shopify.toast.show("Disconnected from Judge.me");
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
        {isConnected ? (
          <Form method="post" action="/app/judgeme/disconnect">
            <s-button variant="tertiary" type="submit">
              Disconnect Judge.me
            </s-button>
          </Form>
        ) : (
          <s-button variant="primary" href="/app/judgeme/connect">
            Connect to Judge.me
          </s-button>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
