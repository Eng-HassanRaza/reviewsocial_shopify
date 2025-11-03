# 🎯 Simple Webhook Auto-Post

## What I've Built

A simple webhook that automatically posts 5-star reviews to Instagram when customers leave reviews. No queue, no database storage - just instant posting.

---

## 📋 How It Works

```
Customer leaves 5⭐ review
    ↓
Judge.me sends webhook → Your app
    ↓
Generate image (GPT-4o-mini + Gemini + S3)
    ↓
Post to Instagram
    ↓
Done! ✅ (30-60 seconds total)
```

---

## 📁 What I Created

1. **Webhook Endpoint:** `app/routes/webhooks.judgeme.review.tsx`
   - Receives Judge.me webhooks
   - Only processes 5-star reviews
   - Generates image
   - Posts to Instagram immediately

2. **Updated:** `app/routes/judgeme.callback.tsx`
   - Registers webhook when Judge.me connects
   - Webhook URL: `https://your-app.com/webhooks/judgeme/review`

---

## 🚀 How to Test

### Step 1: Make Sure Everything is Connected

1. Open your app
2. Connect Judge.me (if not already) ✅
3. Connect Instagram (if not already) ✅

When you connect Judge.me, the webhook is automatically registered!

### Step 2: Test with a Real Review

**Option A: Leave a test review yourself**
1. Go to your Shopify store
2. Add a product to cart and checkout
3. After "purchase", Judge.me will send review request
4. Leave a 5-star review
5. Wait 30-60 seconds
6. Check Instagram - review should be posted!

**Option B: Use Judge.me's test feature**
1. Go to Judge.me dashboard
2. Find "Test Webhook" or create a test review
3. Make sure it's 5 stars
4. Wait 30-60 seconds
5. Check Instagram!

### Step 3: Monitor Logs

Watch your terminal where `shopify app dev` is running:

**When webhook is received:**
```
[Webhook] Received Judge.me webhook
[Webhook] Processing webhook for shop: your-store.myshopify.com
[Webhook] Review: 5 stars from John Doe
[Webhook] Generating image...
[Webhook] Image generated: https://...
[Webhook] Posting to Instagram...
[Webhook] ✅ Successfully posted! Post ID: 123456
```

---

## 🔍 What Happens

### When a 5-Star Review Comes In:

1. ✅ **Judge.me sends webhook** (instant)
2. ✅ **Extract review data** (shop, rating, text, reviewer name, product)
3. ✅ **Check if 5 stars** (skip if less)
4. ✅ **Check if Judge.me and Instagram connected** (skip if not)
5. ✅ **Generate image** (30-40 seconds)
   - GPT-4o-mini creates dynamic prompt
   - Gemini generates beautiful image
   - Optimize and upload to S3
6. ✅ **Verify image is accessible** (with retries)
7. ✅ **Post to Instagram** (5-10 seconds)
   - Create media container
   - Publish to feed
8. ✅ **Done!**

### If Review is NOT 5 Stars:

The webhook responds with "Only 5-star reviews are posted" and does nothing.

### If Instagram or Judge.me Not Connected:

The webhook responds with error message but doesn't crash.

---

## 📊 What Gets Posted

**Instagram Post:**
- **Image:** AI-generated with review text, stars, and branding
- **Caption:**
  ```
  ⭐⭐⭐⭐⭐

  "This is an amazing product! Highly recommend..."

  - John Doe

  #customerreview #review #testimonial
  ```

---

## 🛠️ Webhook Registration

Webhook is automatically registered when you:
1. Connect Judge.me for the first time
2. Reconnect Judge.me after disconnecting

**Webhook URL:** `https://your-app.com/webhooks/judgeme/review`

To verify webhook is registered:
```bash
npx prisma studio
# Open JudgeMeCredential table
# Check webhookId field - should have a value
```

---

## 🐛 Troubleshooting

### Webhook Not Firing

**Check 1: Is webhook registered?**
```bash
npx prisma studio
# Open JudgeMeCredential
# Check webhookId field
```

If NULL, disconnect and reconnect Judge.me.

**Check 2: Is APP_URL correct?**
```bash
# In .env file
APP_URL=https://your-actual-app-url.com
```

Must be the public URL (not localhost for production).

**Check 3: Check Judge.me dashboard**
Go to Judge.me → Settings → Webhooks
Should see your webhook listed.

### Review Not Posted

**Check logs in terminal:**

Look for errors like:
- "Image generation failed"
- "Instagram not connected"
- "Failed to create media container"

**Common issues:**
1. Gemini API key not set
2. AWS S3 not configured
3. Instagram access token expired (reconnect)

### Only 5-Star Reviews

The webhook only processes 5-star reviews. If you want to test:
- Make sure the review is exactly 5 stars
- 4.5 or 4 stars won't work

---

## ⚙️ Configuration

### Change Which Reviews to Post

Edit `app/routes/webhooks.judgeme.review.tsx`:

```typescript
// Currently: only 5-star
if (rating !== 5) {
  // Skip
}

// To post 4 and 5 stars:
if (rating < 4) {
  // Skip
}
```

### Disable Auto-Posting Temporarily

In database:
```sql
-- Disable
UPDATE JudgeMeCredential SET autoPostEnabled = false;

-- Re-enable
UPDATE JudgeMeCredential SET autoPostEnabled = true;
```

(Note: You'll need to add this check in the webhook code if you want to use it)

---

## 💡 Tips

1. **Test with your own review first** - Leave a 5-star review on your store
2. **Watch the logs** - Keep terminal open to see what's happening
3. **Check Instagram** - Look for the post after 1-2 minutes
4. **Be patient** - Image generation takes 30-40 seconds

---

## 🎉 That's It!

Super simple:
- ✅ Customer leaves 5-star review
- ✅ Webhook triggers
- ✅ Image generated
- ✅ Posted to Instagram
- ✅ No manual work!

Just test it with a real review and you're good to go! 🚀

---

## 🔄 Manual Posting Still Works

You still have the "Post Latest Review to Instagram" button for manual posting. This is useful for:
- Posting older reviews
- Re-posting a review
- Testing

Both work together! ✌️


