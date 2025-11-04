# ReviewSocial - Shopify App

Automatically turn 5-star Judge.me reviews into beautiful Instagram posts with AI-generated images.

## 🚀 Features

- **Automatic Review Posting**: Converts 5-star reviews into Instagram posts
- **AI-Generated Images**: Uses Google Gemini + OpenAI GPT-4o-mini for dynamic, niche-specific image generation
- **Judge.me Integration**: Seamlessly fetches reviews from Judge.me
- **Instagram Business Integration**: Posts directly to Instagram Business accounts
- **Auto-Post System**: Cron job support for automatic posting every 2 hours
- **Duplicate Prevention**: Never posts the same review twice
- **Rate Limiting**: Max 10 posts per day per shop
- **GDPR Compliant**: Full GDPR webhook support
- **Dashboard**: View all posted reviews with stats and Instagram links

---

## 📋 Prerequisites

Before you begin, you'll need:

1. **Node.js** (v18 or higher): [Download](https://nodejs.org/)
2. **Shopify Partner Account**: [Create account](https://partners.shopify.com/signup)
3. **Shopify Development Store**: [Create store](https://help.shopify.com/en/partners/dashboard/development-stores)
4. **Judge.me Account**: [Sign up](https://judge.me/)
5. **Judge.me OAuth App**: [Create OAuth app](https://judge.me/admin/apps/oauth)
6. **Facebook/Instagram Business Account**: [Setup guide](https://business.facebook.com/)
7. **Facebook Developer App**: [Create app](https://developers.facebook.com/apps)
8. **Google Gemini API Key**: [Get key](https://makersuite.google.com/app/apikey)
9. **OpenAI API Key**: [Get key](https://platform.openai.com/api-keys)
10. **AWS Account with S3**: [Create account](https://aws.amazon.com/)

---

## 🛠️ Installation

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/reviewsocial.git
cd reviewsocial

# Install dependencies
npm install

# Set up database
npm run setup
```

### 2. Configure Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

**Required environment variables:**
- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` - From Shopify Partner Dashboard
- `APP_URL` - Your production URL (or Cloudflare tunnel for dev)
- `JUDGEME_CLIENT_ID`, `JUDGEME_CLIENT_SECRET` - From Judge.me OAuth app
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` - From Facebook Developer app
- `GEMINI_API_KEY` - From Google AI Studio
- `OPENAI_API_KEY` - From OpenAI Platform
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` - From AWS Console

See [`.env.example`](./.env.example) for complete list.

### 3. Set Up AWS S3

Follow the [AWS S3 Setup Guide](./AWS_S3_SETUP.md) to:
1. Create an S3 bucket
2. Configure public access
3. Create IAM user with S3 permissions
4. Get access keys

### 4. Start Development Server

```bash
# Using Shopify CLI
shopify app dev

# Or using npm
npm run dev
```

Press **P** to open the app URL in your browser.

---

## 📖 How It Works

### User Flow:

1. **Merchant installs ReviewSocial** from Shopify App Store
2. **Connects Judge.me account** via OAuth
3. **Connects Instagram Business account** via Facebook OAuth
4. **Reviews are automatically processed**:
   - New 5-star review is created on Judge.me
   - ReviewSocial fetches the review (via webhook or cron)
   - AI generates a beautiful, niche-specific image
   - Image is uploaded to AWS S3
   - Post is published to Instagram automatically

### Technical Flow:

```
Customer Review (5⭐)
  → Judge.me Webhook (optional) / Cron Job (every 2 hours)
    → Fetch Review Data
      → Generate AI Prompt (OpenAI GPT-4o-mini)
        → Generate Image (Google Gemini)
          → Optimize Image (Sharp)
            → Upload to S3 (AWS)
              → Post to Instagram (Facebook Graph API)
                → Save to Database (PostedReview)
```

---

## 🔄 Auto-Post System

### Option 1: GitHub Actions (Free!)

The app includes a GitHub Actions workflow that runs every 2 hours:

```bash
# Already created at: .github/workflows/auto-post.yml
```

**Setup:**
1. Push code to GitHub
2. Add GitHub secrets:
   - `APP_URL`: Your production URL
   - `CRON_SECRET`: Random secret (optional)
3. Workflow runs automatically every 2 hours

### Option 2: Manual Trigger

Use the "Check for New Reviews Now" button in the app dashboard.

### Option 3: Webhooks (Requires Judge.me Awesome Plan)

- Webhooks are automatically registered when connecting Judge.me
- Reviews post in real-time when created
- Free for development stores

See [Railway Deployment Guide](./RAILWAY_DEPLOYMENT.md) for deployment and cron setup.

---

## 🔒 GDPR Compliance

The app includes full GDPR webhook support:

- **`customers/data_request`**: Returns customer data
- **`customers/redact`**: Deletes customer data
- **`shop/redact`**: Deletes all shop data 48 hours after uninstall

All webhooks are automatically registered by Shopify.

---

## 🎨 Customization

### Image Generation

The AI dynamically adapts to:
- Store niche (electronics, fashion, pet supplies, etc.)
- Product category
- Review content
- Brand identity

Images include:
- 5-star rating
- Customer name
- Review text
- Product title
- Brand name
- Niche-specific design theme

### Rate Limits

Adjust in `app/services/auto-post-cron.server.ts`:

```typescript
const MAX_POSTS_PER_DAY = 10;  // Change to your preference
const MAX_POSTS_PER_RUN = 5;   // Change to your preference
```

---

## 📊 Database Schema

```prisma
model Session {
  // Shopify session management
}

model JudgeMeCredential {
  shop        String   @id
  accessToken String
  webhookId   String?
}

model InstagramCredential {
  shop               String   @id
  accessToken        String
  instagramAccountId String
}

model PostedReview {
  id              String   @id
  shop            String
  reviewId        String   // Unique constraint
  productTitle    String?
  reviewerName    String?
  rating          Int
  reviewText      String?
  instagramPostId String?
  imageUrl        String?
  status          String   // "success" or "failed"
  error           String?
  postedAt        DateTime
  
  @@unique([shop, reviewId])
}
```

---

## 🚀 Deployment

### Production Checklist

Before deploying to production:

#### 1. Legal Pages (REQUIRED)
Create these pages on your domain:
- `https://yourdomain.com/privacy-policy`
- `https://yourdomain.com/terms-of-service`
- `https://yourdomain.com/support`

Update URLs in `.env`:
```bash
PRIVACY_POLICY_URL=https://yourdomain.com/privacy-policy
TERMS_OF_SERVICE_URL=https://yourdomain.com/terms-of-service
SUPPORT_URL=https://yourdomain.com/support
SUPPORT_EMAIL=support@yourdomain.com
```

#### 2. Database
Switch from SQLite to PostgreSQL for production:

```bash
# Update DATABASE_URL in .env
DATABASE_URL=postgresql://user:password@host:5432/database

# Run migrations
npx prisma migrate deploy
```

#### 3. Deploy to Hosting

**Railway (Recommended):**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway up
```

**Other options:**
- Render
- Heroku
- Fly.io
- Vercel (with database hosting)

#### 4. Set Up Cron

Configure GitHub Actions or your hosting provider's cron service to call:
```
POST https://your-app.com/api/cron/auto-post
```

See [Railway Deployment Guide](./RAILWAY_DEPLOYMENT.md) for detailed cron setup instructions.

---

## 📝 Shopify App Store Submission

### Pre-Submission Checklist

- [x] GDPR webhooks implemented
- [x] App uninstall webhook cleanup
- [x] Legal pages created (privacy policy, terms, support)
- [x] Footer with legal links
- [x] Error handling
- [x] Rate limiting
- [ ] App listing content (screenshots, description)
- [ ] App icon (1200×1200px)
- [ ] Test on multiple stores
- [ ] Production deployment
- [ ] Billing integration (if charging)

### Submission Steps

1. **Complete app listing** in Shopify Partner Dashboard
2. **Add screenshots** (minimum 5, 1280×800px)
3. **Add app icon** (1200×1200px)
4. **Write description** (what it does, benefits, requirements)
5. **Set pricing** (if applicable)
6. **Add legal page URLs**
7. **Submit for review**

Approval typically takes 5-7 business days.

---

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Manual Testing Checklist

- [ ] Install app on development store
- [ ] Connect Judge.me account
- [ ] Connect Instagram Business account
- [ ] Create 5-star review on Judge.me
- [ ] Trigger auto-post (button or cron)
- [ ] Verify image generated and uploaded to S3
- [ ] Verify post appears on Instagram
- [ ] Check "Posted Reviews" dashboard
- [ ] Verify duplicate prevention works
- [ ] Test rate limiting (try posting >10 in one day)
- [ ] Test uninstall cleanup
- [ ] Test app reinstall

---

## 🐛 Troubleshooting

### Image generation fails
- Check `GEMINI_API_KEY` and `OPENAI_API_KEY` are set
- Check AWS S3 credentials are correct
- Check S3 bucket has public read access

### Instagram post fails
- Verify Instagram Business account is connected (not personal)
- Check Facebook app has `instagram_basic`, `instagram_content_publish`, and `pages_read_engagement` permissions
- Ensure image is accessible from S3 URL
- Check Instagram API error messages in logs

### Judge.me connection fails
- Ensure Judge.me is installed on the store
- Verify OAuth credentials are correct
- Check if Judge.me Awesome plan is needed for webhooks

### Cron not running
- Verify GitHub Actions workflow is enabled
- Check `APP_URL` is correct in GitHub secrets
- Ensure production app is accessible
- Check cron endpoint logs

---

## 📚 Documentation

- [AWS S3 Setup Guide](./AWS_S3_SETUP.md)
- [Railway Deployment Guide](./RAILWAY_DEPLOYMENT.md)
- [Shopify Submission Checklist](./SHOPIFY_SUBMISSION_CHECKLIST.md)

---

## 🤝 Support

- **Email**: support@yourdomain.com
- **Documentation**: [Link to your docs]
- **Issues**: [GitHub Issues](https://github.com/yourusername/reviewsocial/issues)

---

## 📄 License

[Your License Here]

---

## 🎉 Acknowledgments

Built with:
- [Shopify App Template](https://github.com/Shopify/shopify-app-template-react-router)
- [Google Gemini API](https://ai.google.dev/)
- [OpenAI API](https://platform.openai.com/)
- [Judge.me](https://judge.me/)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api/)
- [AWS S3](https://aws.amazon.com/s3/)

---

**Ready to launch! 🚀**

For production deployment and Shopify App Store submission help, see the [Deployment](#-deployment) and [Submission](#-shopify-app-store-submission) sections above.
