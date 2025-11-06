import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { Page, Layout, Card, Text, BlockStack, Button, Badge, EmptyState, IndexTable, Link as PolarisLink } from "@shopify/polaris";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get posted reviews for this shop (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const postedReviews = await prisma.postedReview.findMany({
    where: {
      shop,
      postedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { postedAt: 'desc' },
    take: 100,
  });

  // Get stats
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
        ) : review.error ? (
          <Text as="span" variant="bodySm" tone="critical">
            {review.error}
          </Text>
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
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        ) : (
          <EmptyState
            heading="No posted reviews yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <Text as="p" variant="bodyMd">
              Reviews will appear here once they're automatically posted to Instagram.
              Make sure both Judge.me and Instagram are connected.
            </Text>
            <div style={{ marginTop: '16px' }}>
              <Button url="/app">Go to Dashboard</Button>
            </div>
          </EmptyState>
        )}
      </BlockStack>
    </Page>
  );
}
