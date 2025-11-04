# Railway Deployment Guide

## 🚀 Quick Railway Deployment

### Step 1: Get Your Railway URL

1. Deploy to Railway (placeholder URL first)
2. Go to **Settings** → **Domains** → **Generate Domain**
3. Copy the URL (e.g., `https://reviewsocial-production-a4b2.up.railway.app`)

---

## 🔐 Step 2: Set Environment Variables

**CRITICAL:** Your app requires **BOTH** `SHOPIFY_APP_URL` and `APP_URL` to be set to the **same value**.

### Why Both?
- `SHOPIFY_APP_URL` → Required by Shopify's core library
- `APP_URL` → Used by your custom OAuth integrations (Judge.me, Instagram, webhooks)

### Complete Railway Environment Variables:

```bash
# ========================================
# SHOPIFY CONFIGURATION (REQUIRED)
# ========================================
# Get these by running: shopify app env show
SHOPIFY_API_KEY=your_shopify_api_key_from_partner_dashboard
SHOPIFY_API_SECRET=your_shopify_api_secret_from_partner_dashboard
SCOPES=read_products,write_products

# ========================================
# APP URLs (BOTH REQUIRED - SAME VALUE!)
# ========================================
# Replace with your actual Railway URL after generating domain
SHOPIFY_APP_URL=https://reviewsocial-production-a4b2.up.railway.app
APP_URL=https://reviewsocial-production-a4b2.up.railway.app

# ========================================
# JUDGE.ME OAUTH
# ========================================
JUDGEME_CLIENT_ID=your_judgeme_client_id
JUDGEME_CLIENT_SECRET=your_judgeme_client_secret
JUDGEME_AUTHORIZE_URL=https://judge.me/admin/oauth/authorize
JUDGEME_TOKEN_URL=https://judge.me/admin/oauth/token

# ========================================
# INSTAGRAM/FACEBOOK OAUTH
# ========================================
INSTAGRAM_APP_ID=your_facebook_app_id
INSTAGRAM_APP_SECRET=your_facebook_app_secret

# ========================================
# AI SERVICES
# ========================================
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key

# ========================================
# AWS S3 (IMAGE STORAGE)
# ========================================
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name

# ========================================
# SECURITY
# ========================================
# Generate with: openssl rand -hex 32
CRON_SECRET=your_random_secret_here

# ========================================
# LEGAL PAGES
# ========================================
PRIVACY_POLICY_URL=https://yourdomain.com/privacy-policy
TERMS_OF_SERVICE_URL=https://yourdomain.com/terms-of-service
SUPPORT_URL=https://yourdomain.com/support
SUPPORT_EMAIL=support@yourdomain.com

# ========================================
# DATABASE (AUTO-ADDED BY RAILWAY)
# ========================================
# DO NOT ADD MANUALLY - Railway PostgreSQL adds this automatically
# DATABASE_URL=postgresql://...
```

---

## 📋 Step-by-Step Railway Setup

### 1. Initial Deployment (Placeholder URL)

Set these first to allow deployment:

```bash
SHOPIFY_APP_URL=https://placeholder.railway.app
APP_URL=https://placeholder.railway.app
SHOPIFY_API_KEY=your_key
SHOPIFY_API_SECRET=your_secret
SCOPES=read_products,write_products
```

### 2. Generate Domain

After first deployment:
1. Railway Dashboard → **Settings** → **Domains**
2. Click **"Generate Domain"**
3. Copy URL: `https://reviewsocial-production-xxx.up.railway.app`

### 3. Update URLs

Update both variables with your real Railway URL:

```bash
SHOPIFY_APP_URL=https://reviewsocial-production-xxx.up.railway.app
APP_URL=https://reviewsocial-production-xxx.up.railway.app
```

### 4. Add All Other Variables

Add all remaining variables from the complete list above.

### 5. Add PostgreSQL Database

1. Railway Dashboard → **New** → **Database** → **PostgreSQL**
2. Railway automatically adds `DATABASE_URL` to your app
3. **Do NOT add DATABASE_URL manually!**

### 6. Run Migrations

```bash
# Option A: Via Railway CLI
railway link
railway run npx prisma migrate deploy

# Option B: Add to build command in Railway Settings
npm install && npm run build && npx prisma migrate deploy
```

---

## ⚠️ Common Mistakes

### ❌ Mistake 1: Only setting SHOPIFY_APP_URL
```bash
SHOPIFY_APP_URL=https://...  ✓
# Missing APP_URL ❌
```

**Fix:** Set BOTH variables

### ❌ Mistake 2: Different values for the URLs
```bash
SHOPIFY_APP_URL=https://app1.railway.app
APP_URL=https://app2.railway.app  ❌
```

**Fix:** Both should be the SAME URL

### ❌ Mistake 3: Missing protocol
```bash
SHOPIFY_APP_URL=reviewsocial.railway.app  ❌
```

**Fix:** Include `https://`

### ❌ Mistake 4: Trailing slash
```bash
SHOPIFY_APP_URL=https://app.railway.app/  ❌
```

**Fix:** Remove trailing slash

### ❌ Mistake 5: Manually adding DATABASE_URL
```bash
DATABASE_URL=postgresql://...  ❌
```

**Fix:** Let Railway PostgreSQL add this automatically

---

## 🔄 Update Flow After Deployment

When you get your Railway URL, you need to update:

### 1. Railway Variables
- [x] `SHOPIFY_APP_URL`
- [x] `APP_URL`

### 2. Shopify Partner Dashboard
- [x] App URL
- [x] Allowed redirect URLs

### 3. Judge.me OAuth App
- [x] Redirect URI: `https://your-app.railway.app/judgeme/callback`

### 4. Facebook/Instagram App
- [x] Valid OAuth Redirect URIs: `https://your-app.railway.app/instagram/callback`

### 5. GitHub Actions (if using cron)
- [x] GitHub Secret: `APP_URL`

---

## ✅ Verification Checklist

After deployment, verify:

```bash
✓ Both SHOPIFY_APP_URL and APP_URL are set
✓ Both have the same value
✓ Both include https://
✓ Both have no trailing slash
✓ DATABASE_URL was auto-added by Railway PostgreSQL
✓ All other environment variables are set
✓ App builds successfully (check Railway logs)
✓ App runs successfully (check Railway logs)
✓ Can access app URL in browser
✓ Redirects to Shopify OAuth correctly
```

---

## 🐛 Troubleshooting

### Error: "Detected an empty appUrl configuration"

**Cause:** Missing `SHOPIFY_APP_URL`

**Fix:** Set `SHOPIFY_APP_URL` in Railway variables

---

### Error: Judge.me OAuth redirect fails

**Cause:** `APP_URL` is missing or incorrect

**Fix:** 
1. Set `APP_URL=https://your-railway-url.up.railway.app`
2. Update Judge.me OAuth app redirect URI to match

---

### Error: Instagram OAuth redirect fails

**Cause:** `APP_URL` is missing or incorrect

**Fix:**
1. Set `APP_URL=https://your-railway-url.up.railway.app`
2. Update Facebook app OAuth redirect URI to match

---

### Error: Database connection fails

**Cause:** `DATABASE_URL` not set or incorrect

**Fix:**
1. Ensure PostgreSQL is added in Railway
2. Railway auto-adds `DATABASE_URL` - don't add manually
3. Run migrations: `railway run npx prisma migrate deploy`

---

## 💰 Cost Estimate

**Development/Testing:**
- Free tier: $5 credit/month (covers ~50-100 hours)
- Cost: $0/month (while under free tier)

**Production (1-10 merchants):**
- Execution: ~50-100 hours/month
- Cost: $5-10/month

**Production (10-50 merchants):**
- Execution: ~200-400 hours/month
- Cost: $15-25/month

---

## 📞 Need Help?

If deployment fails:
1. Check Railway logs for error messages
2. Verify all environment variables are set correctly
3. Ensure both `SHOPIFY_APP_URL` and `APP_URL` have the same value
4. Check that PostgreSQL database is added

---

**TL;DR:** Set BOTH `SHOPIFY_APP_URL` and `APP_URL` to your Railway URL! 🚀

