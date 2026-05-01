import type { ActionFunctionArgs } from "react-router";
import { processAllShops } from "../services/auto-post-cron.server";

// Make this route publicly accessible (for cron jobs)
export const handle = { isPublic: true };

/**
 * Cron endpoint for automatic review posting
 * Call this endpoint every 2 hours to process new reviews
 * 
 * Security: Add a CRON_SECRET to .env and verify it here in production
 */
export async function action({ request }: ActionFunctionArgs) {
  console.log('[Cron API] Received auto-post request');

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[Cron API] CRON_SECRET env var is not set. Refusing to process.');
    return new Response(JSON.stringify({ error: 'Server misconfiguration: CRON_SECRET is required' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[Cron API] Unauthorized: Invalid or missing Authorization header');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const results = await processAllShops();

    const summary = {
      timestamp: new Date().toISOString(),
      totalShops: results.length,
      totalPosted: results.reduce((sum, r) => sum + r.posted, 0),
      totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
      totalSkipped: results.reduce((sum, r) => sum + r.skipped, 0),
      results,
    };

    console.log('[Cron API] Summary:', JSON.stringify(summary, null, 2));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Cron API] Error:', error);
    
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal error',
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * GET returns 405 — only POST is accepted
 */
export async function loader() {
  return new Response(null, { status: 405 });
}

