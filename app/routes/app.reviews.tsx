import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

  return (
    <s-page heading="Posted Reviews">
      <s-section>
        <s-paragraph>Reviews automatically posted to Instagram (last 30 days)</s-paragraph>
        
        {/* Stats */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '16px',
          marginTop: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            padding: '20px',
            border: '1px solid #e1e3e5',
            borderRadius: '8px',
            backgroundColor: '#fff'
          }}>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#202223' }}>
              {stats.totalPosted}
            </div>
            <div style={{ fontSize: '14px', color: '#6d7175', marginTop: '8px' }}>
              Total Posted
            </div>
          </div>
          
          <div style={{
            padding: '20px',
            border: '1px solid #e1e3e5',
            borderRadius: '8px',
            backgroundColor: '#fff'
          }}>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#202223' }}>
              {stats.todayPosted}/10
            </div>
            <div style={{ fontSize: '14px', color: '#6d7175', marginTop: '8px' }}>
              Posted Today
            </div>
          </div>
          
          <div style={{
            padding: '20px',
            border: '1px solid #e1e3e5',
            borderRadius: '8px',
            backgroundColor: '#fff'
          }}>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#202223' }}>
              {stats.failed}
            </div>
            <div style={{ fontSize: '14px', color: '#6d7175', marginTop: '8px' }}>
              Failed (30 days)
            </div>
          </div>
        </div>

        {/* Reviews List */}
        {postedReviews.length > 0 ? (
          <div style={{ 
            border: '1px solid #e1e3e5',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: '#fff'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f6f6f7', borderBottom: '1px solid #e1e3e5' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Reviewer</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Review</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Rating</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Posted At</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {postedReviews.map((review) => (
                  <tr key={review.id} style={{ borderBottom: '1px solid #e1e3e5' }}>
                    <td style={{ padding: '12px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: '500' }}>{review.reviewerName || 'Anonymous'}</div>
                      <div style={{ fontSize: '13px', color: '#6d7175' }}>
                        {review.productTitle || 'Unknown Product'}
                      </div>
                    </td>
                    <td style={{ padding: '12px', maxWidth: '300px' }}>
                      <div style={{ 
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {review.reviewText || 'No text'}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {'⭐'.repeat(review.rating)}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {review.status === 'success' ? (
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#d4f5d4',
                          color: '#0f5132',
                          fontSize: '13px'
                        }}>
                          Posted
                        </span>
                      ) : (
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#ffc4c4',
                          color: '#b71c1c',
                          fontSize: '13px'
                        }}>
                          Failed
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px' }}>
                      {new Date(review.postedAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {review.instagramPostId ? (
                        <a
                          href={`https://www.instagram.com/p/${review.instagramPostId}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#005BD3', textDecoration: 'none' }}
                        >
                          View on Instagram →
                        </a>
                      ) : review.error ? (
                        <div style={{ fontSize: '12px', color: '#b71c1c' }}>
                          {review.error}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <s-banner status="info">
            <s-paragraph>
              <strong>No posted reviews yet</strong>
            </s-paragraph>
            <s-paragraph>
              Reviews will appear here once they're automatically posted to Instagram.
              Make sure both Judge.me and Instagram are connected.
            </s-paragraph>
          </s-banner>
        )}
        
        <div style={{ marginTop: '16px' }}>
          <s-button href="/app">← Back to Dashboard</s-button>
        </div>
      </s-section>
    </s-page>
  );
}
