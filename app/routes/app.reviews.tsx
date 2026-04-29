import { type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useNavigation, useSearchParams, useFetcher, useRevalidator } from "react-router";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { postStoredReviewToInstagram } from "../services/auto-post-cron.server";
import { Page, Layout, Card, Text, BlockStack, Button, Badge, EmptyState, IndexTable, Link as PolarisLink } from "@shopify/polaris";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const reviewId = formData.get('reviewId') as string;

  if (!reviewId) {
    return Response.json({ success: false, error: 'Missing reviewId' }, { status: 400 });
  }

  const [rec, instagramCredential] = await Promise.all([
    prisma.postedReview.findFirst({ where: { shop, reviewId } }),
    prisma.instagramCredential.findUnique({ where: { shop } }),
  ]);

  if (!rec) return Response.json({ success: false, error: 'Review not found' }, { status: 404 });
  if (!instagramCredential) return Response.json({ success: false, error: 'Instagram not connected' }, { status: 400 });

  try {
    await postStoredReviewToInstagram(shop, rec, instagramCredential);
    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const postedReviews = await prisma.postedReview.findMany({
    where: {
      shop,
      postedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { postedAt: 'desc' },
    take: 100,
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const prismaAny = prisma as any;
  const storedPlan = await prismaAny.shopPlan.findUnique({ where: { shop } });
  const planName = (storedPlan?.planName || 'Free').toLowerCase();
  const monthlyLimit = planName.includes('free') ? 5 : Infinity;

  const stats = {
    totalPosted: await prisma.postedReview.count({
      where: { shop, status: 'success' },
    }),
    monthlyPosted: await prisma.postedReview.count({
      where: {
        shop,
        status: 'success',
        postedAt: { gte: monthStart },
      },
    }),
    failed: await prisma.postedReview.count({
      where: {
        shop,
        status: 'failed',
        postedAt: { gte: thirtyDaysAgo },
      },
    }),
  };

  return { postedReviews, stats, monthlyLimit, planName: storedPlan?.planName || 'Free', shop };
}

export default function ReviewsPage() {
  const { postedReviews, stats, monthlyLimit, planName, shop } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isLoading = navigation.state === 'loading';
  const [params] = useSearchParams();
  const host = params.get('host');
  const shopify = useAppBridge();
  const retryFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    if (retryFetcher.state === 'idle' && retryingId !== null) {
      const data = retryFetcher.data as { success: boolean; error?: string } | undefined;
      if (!data) return;
      if (data.success) {
        shopify.toast.show('Review posted to Instagram successfully!');
        revalidator.revalidate();
      } else {
        shopify.toast.show(data.error ?? 'Retry failed', { isError: true });
      }
      setRetryingId(null);
    }
  }, [retryFetcher.state, retryFetcher.data, retryingId, shopify, revalidator]);

  function toDashboard() {
    const qs = new URLSearchParams({ shop });
    if (host) qs.set('host', host);
    navigate(`/app?${qs.toString()}`);
  }

  const rowMarkup = postedReviews.map((review, index) => {
    const isRetrying = retryFetcher.state !== 'idle' && retryingId === review.reviewId;

    // instagramPostId may be a full permalink URL (new) or a legacy numeric/shortcode ID
    const igUrl = review.instagramPostId
      ? review.instagramPostId.startsWith('http')
        ? review.instagramPostId
        : `https://www.instagram.com/p/${review.instagramPostId}/`
      : null;

    return (
      <IndexTable.Row id={review.id} key={review.id} position={index}>
        <IndexTable.Cell>
          <BlockStack gap="100">
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {review.reviewerName || 'Anonymous'}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {review.productTitle || 'Unknown Product'}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd" truncate>
            {review.reviewText || 'No text'}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodyMd">
            {'⭐'.repeat(review.rating)}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={review.status === 'success' ? 'success' : 'critical'}>
            {review.status === 'success' ? 'Posted' : 'Failed'}
          </Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm">
            {new Date(review.postedAt).toLocaleString()}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {igUrl ? (
            <PolarisLink url={igUrl} target="_blank">
              View on Instagram
            </PolarisLink>
          ) : review.status === 'failed' ? (
            <BlockStack gap="100">
              {review.error && (
                <Text as="span" variant="bodySm" tone="critical">
                  {review.error.length > 80 ? review.error.substring(0, 80) + '…' : review.error}
                </Text>
              )}
              <Button
                variant="plain"
                size="slim"
                loading={isRetrying}
                disabled={retryFetcher.state !== 'idle'}
                onClick={() => {
                  setRetryingId(review.reviewId);
                  retryFetcher.submit(
                    { reviewId: review.reviewId },
                    { method: 'post' }
                  );
                }}
              >
                {isRetrying ? 'Posting…' : 'Retry'}
              </Button>
            </BlockStack>
          ) : null}
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page title="Posted Reviews" backAction={{ onAction: toDashboard }}>
      <BlockStack gap="500">
        <Text as="p" variant="bodyMd">
          Reviews automatically posted to Instagram (last 30 days)
        </Text>

        {/* Stats */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  {stats.totalPosted}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Total Posted
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  {stats.monthlyPosted}{Number.isFinite(monthlyLimit) ? ` / ${monthlyLimit}` : ''}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  This Month{Number.isFinite(monthlyLimit) ? ` (${planName})` : ''}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  {stats.failed}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Failed (30 days)
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Reviews List */}
        {postedReviews.length > 0 ? (
          <Card padding="0">
            <IndexTable
              itemCount={postedReviews.length}
              headings={[
                { title: 'Reviewer' },
                { title: 'Review' },
                { title: 'Rating' },
                { title: 'Status' },
                { title: 'Posted At' },
                { title: 'Action' },
              ]}
              selectable={false}
              loading={isLoading}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        ) : (
          <EmptyState
            heading="No posted reviews yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <BlockStack gap="400">
              <Text as="p" variant="bodyMd">
                Reviews will appear here once they're automatically posted to Instagram.
                Make sure both Judge.me and Instagram are connected.
              </Text>
              <Button onClick={toDashboard}>Go to Dashboard</Button>
            </BlockStack>
          </EmptyState>
        )}
      </BlockStack>
    </Page>
  );
}
