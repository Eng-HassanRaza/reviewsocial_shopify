import { type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useNavigation, Form } from "react-router";
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

  const stats = {
    totalPosted: await prisma.postedReview.count({
      where: { shop, status: 'success' },
    }),
    todayPosted: await prisma.postedReview.count({
      where: {
        shop,
        status: 'success',
        postedAt: { gte: todayStart },
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

  return { postedReviews, stats, shop };
}

export default function ReviewsPage() {
  const { postedReviews, stats } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isLoading = navigation.state === 'loading';

  const rowMarkup = postedReviews.map((review, index) => (
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
        {review.instagramPostId ? (
          <PolarisLink url={`https://www.instagram.com/p/${review.instagramPostId}/`} target="_blank">
            View on Instagram
          </PolarisLink>
        ) : review.status === 'failed' ? (
          <BlockStack gap="100">
            {review.error && (
              <Text as="span" variant="bodySm" tone="critical">
                {review.error.length > 80 ? review.error.substring(0, 80) + '…' : review.error}
              </Text>
            )}
            <Form method="post">
              <input type="hidden" name="reviewId" value={review.reviewId} />
              <Button variant="plain" submit size="slim">
                Retry
              </Button>
            </Form>
          </BlockStack>
        ) : null}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page title="Posted Reviews" backAction={{ onAction: () => navigate('/app') }}>
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
                  {stats.todayPosted}/10
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Posted Today
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
              <Button url="/app">Go to Dashboard</Button>
            </BlockStack>
          </EmptyState>
        )}
      </BlockStack>
    </Page>
  );
}
