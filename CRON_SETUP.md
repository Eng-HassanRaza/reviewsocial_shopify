# Auto-Post Cron Job Setup

This guide explains how to set up automatic review posting using cron jobs.

## Overview

The auto-post system checks for new 5-star reviews and automatically posts them to Instagram with:
- ✅ Duplicate prevention (never posts the same review twice)
- ✅ Rate limiting (max 10 posts per day, 5 per run)
- ✅ Error tracking and retry logic
- ✅ Full history in database

---

## Quick Test (Manual Trigger)

1. Go to your app dashboard
2. Connect both Judge.me and Instagram
3. Click **"Check for New Reviews Now"** button
4. View results in **"View Posted Reviews"** page

---

## Option 1: GitHub Actions (Recommended - FREE!)

Create `.github/workflows/auto-post.yml`:

```yaml
name: Auto-Post Reviews

on:
  schedule:
    # Runs every 2 hours
    - cron: '0 */2 * * *'
  workflow_dispatch: # Allows manual trigger

jobs:
  auto-post:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Auto-Post
        run: |
          curl -X POST ${{ secrets.APP_URL }}/api/cron/auto-post \
               -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
               -H "Content-Type: application/json"
```

**Setup:**
1. Go to GitHub repository Settings → Secrets
2. Add secrets:
   - `APP_URL`: Your app URL (e.g., `https://your-app.com`)
   - `CRON_SECRET`: Generate a random string (e.g., `openssl rand -hex 32`)
3. Add same `CRON_SECRET` to your app's `.env` file

---

## Option 2: Vercel Cron

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/auto-post",
      "schedule": "0 */2 * * *"
    }
  ]
}
```

---

## Option 3: Railway Cron

1. Go to Railway project → Settings → Cron Jobs
2. Add new cron job:
   - **Schedule**: `0 */2 * * *` (every 2 hours)
   - **Command**: `curl -X POST ${APP_URL}/api/cron/auto-post -H "Authorization: Bearer ${CRON_SECRET}"`

---

## Option 4: EasyCron / Cron-Job.org (External Service)

1. Sign up at https://www.easycron.com/ or https://cron-job.org/
2. Create new cron job:
   - **URL**: `https://your-app.com/api/cron/auto-post`
   - **Schedule**: Every 2 hours
   - **Method**: POST
   - **Headers**: 
     ```
     Authorization: Bearer YOUR_CRON_SECRET
     Content-Type: application/json
     ```

---

## Environment Variables

Add to `.env`:

```bash
# Optional: Secure your cron endpoint
CRON_SECRET=your-random-secret-here

# Required: Already set
GEMINI_API_KEY=...
OPENAI_API_KEY=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
AWS_S3_BUCKET=...
```

---

## Testing

### Test manually via terminal:

```bash
# Without auth (if CRON_SECRET not set)
curl -X POST http://localhost:5173/api/cron/auto-post

# With auth
curl -X POST http://localhost:5173/api/cron/auto-post \
     -H "Authorization: Bearer your-cron-secret"
```

### Test via app UI:

1. Go to app dashboard
2. Click "Check for New Reviews Now"
3. View results in "View Posted Reviews"

---

## Monitoring

### View Logs

**GitHub Actions:**
- Go to Actions tab → Select workflow run → View logs

**Railway:**
- Go to Deployments → Click on deployment → View logs

**Local/Server:**
- Check server logs for `[Cron]` prefixed messages

### Database Tracking

All posted reviews are tracked in the `PostedReview` table:

```sql
-- View recent posts
SELECT * FROM PostedReview 
ORDER BY postedAt DESC 
LIMIT 20;

-- Check today's post count
SELECT COUNT(*) FROM PostedReview 
WHERE status = 'success' 
  AND DATE(postedAt) = DATE('now');

-- View failed posts
SELECT * FROM PostedReview 
WHERE status = 'failed' 
ORDER BY postedAt DESC;
```

---

## Rate Limits

- **Max per run**: 5 reviews
- **Max per day**: 10 reviews
- **Cooldown**: 2 seconds between posts
- **Duplicate check**: Reviews are never posted twice

---

## Troubleshooting

### Cron not running

1. Check GitHub Actions logs
2. Verify `APP_URL` is correct (must be publicly accessible)
3. Check `CRON_SECRET` matches in both places

### Reviews not posting

1. Check "View Posted Reviews" page for errors
2. Verify Judge.me and Instagram are connected
3. Check server logs for detailed error messages
4. Verify daily limit hasn't been reached (10/day)

### Image generation fails

1. Check `GEMINI_API_KEY` is set correctly
2. Check `OPENAI_API_KEY` is set correctly
3. Check AWS S3 credentials are correct
4. View logs for specific error messages

---

## Webhook Alternative (Requires Judge.me Awesome Plan)

If you upgrade to Judge.me Awesome plan (free for dev stores):

1. Webhooks are automatically registered when you connect Judge.me
2. Reviews are posted in real-time (no cron needed)
3. The cron job becomes a backup/fallback system

---

## Next Steps

1. ✅ Set up one of the cron options above
2. ✅ Add 5-star reviews to your test store
3. ✅ Wait 2 hours or manually trigger
4. ✅ Check "View Posted Reviews" page
5. ✅ Verify posts appear on Instagram

---

Need help? Check the logs or contact support!

