import type { LoaderFunctionArgs } from "react-router";
import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { Page, Layout, Card, BlockStack, Spinner, Text } from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  const appUrl = process.env.APP_URL!;
  const url = new URL(request.url);
  let shop = url.searchParams.get("shop") || undefined;

  if (!shop) {
    const { session } = await authenticate.admin(request);
    shop = session.shop;
  }

  const topRedirect = `${appUrl}/instagram/redirect?shop=${encodeURIComponent(shop!)}`;
  return Response.json({ topRedirect });
}

export default function InstagramTopConnect() {
  const { topRedirect } = useLoaderData() as { topRedirect: string };

  useEffect(() => {
    if (!topRedirect) return;
    if (window.top) {
      window.top.location.href = topRedirect;
    } else {
      window.location.href = topRedirect;
    }
  }, [topRedirect]);

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400" inlineAlign="center">
              <Spinner size="large" />
              <Text variant="headingSm" as="p">Connecting your Instagram account…</Text>
              <Text tone="subdued" as="p">You'll be redirected to Facebook to complete authorization. Don't close this window.</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}


