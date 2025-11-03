# Shopify App Store Submission Checklist

## ✅ **Completed (In App Code)**

All technical requirements have been implemented:

### 1. GDPR Webhooks ✅
- **`webhooks.gdpr.customers_data_request.tsx`** - Returns customer data on request
- **`webhooks.gdpr.customers_redact.tsx`** - Deletes customer data
- **`webhooks.gdpr.shop_redact.tsx`** - Deletes all shop data (48 hours after uninstall)

### 2. Data Cleanup ✅
- **`webhooks.app.uninstalled.tsx`** - Immediate cleanup when app is uninstalled
- All credentials, sessions, and posted reviews are deleted

### 3. Legal Links in App ✅
- Footer added to `app._index.tsx` with links to:
  - Privacy Policy
  - Terms of Service
  - Support page
  - Support email
- Links use environment variables (configurable via `.env`)

### 4. Code Quality ✅
- Test files removed
- `.gitignore` updated to exclude test files, databases, and sensitive files
- `.env.example` created with all required variables documented
- `README.md` updated with comprehensive setup and deployment instructions

### 5. Technical Features ✅
- Auto-post system with cron support
- Duplicate prevention
- Rate limiting (10 posts/day)
- Error tracking and logging
- Database schema with PostedReview tracking
- GDPR-compliant data handling

---

## ⚠️ **Manual Tasks Required**

You need to complete these tasks externally:

### 1. Create Legal Pages 🔴 **CRITICAL**

Create these 3 pages on your domain:

#### **Privacy Policy** (`https://yourdomain.com/privacy-policy`)
Must include:
- What data you collect (shop domain, Judge.me reviews, Instagram credentials, review text, customer names)
- How you use it (image generation, Instagram posting)
- How you store it (AWS S3 for images, database for credentials)
- How users can delete their data (GDPR webhooks, uninstall app)
- Cookie policy (if applicable)
- GDPR compliance statement
- Contact information

**Template/Generator Tools:**
- https://www.privacypolicygenerator.info/
- https://www.freeprivacypolicy.com/
- https://termly.io/products/privacy-policy-generator/

#### **Terms of Service** (`https://yourdomain.com/terms-of-service`)
Must include:
- Acceptable use policy
- Service limitations
- Liability disclaimers
- Refund policy (if charging)
- Account termination conditions
- Intellectual property rights

**Template/Generator Tools:**
- https://www.termsofservicegenerator.net/
- https://termly.io/products/terms-and-conditions-generator/

#### **Support Page** (`https://yourdomain.com/support`)
Must include:
- Contact email: `support@yourdomain.com`
- Response time expectations (e.g., "We respond within 24 hours")
- FAQ section:
  - How to install the app?
  - How to connect Judge.me?
  - How to connect Instagram?
  - What if reviews aren't posting?
  - How to disconnect services?
- Troubleshooting guide
- Link to documentation

---

### 2. Update Environment Variables 🟡 **IMPORTANT**

Add these to your production `.env`:

```bash
# Legal pages (update with your actual URLs)
PRIVACY_POLICY_URL=https://yourdomain.com/privacy-policy
TERMS_OF_SERVICE_URL=https://yourdomain.com/terms-of-service
SUPPORT_URL=https://yourdomain.com/support
SUPPORT_EMAIL=support@yourdomain.com
```

---

### 3. Deploy to Production 🟡 **IMPORTANT**

1. **Choose hosting provider:**
   - Railway (recommended)
   - Render
   - Heroku
   - Fly.io

2. **Switch to PostgreSQL database:**
   ```bash
   DATABASE_URL=postgresql://user:password@host:5432/database
   ```

3. **Set all environment variables** on hosting platform

4. **Run database migrations:**
   ```bash
   npx prisma migrate deploy
   ```

5. **Test thoroughly** on production URL

---

### 4. Create App Listing Content 🟡 **IMPORTANT**

In Shopify Partner Dashboard:

#### **App Details:**
- **App Name**: ReviewSocial (or your chosen name)
- **Tagline**: "Automatically turn 5-star reviews into Instagram posts"
- **Description** (example):
  ```
  ReviewSocial helps Shopify merchants automatically convert their best 
  Judge.me reviews into beautiful, AI-generated Instagram posts.
  
  KEY FEATURES:
  • Automatic posting - Set it and forget it
  • AI-generated images - Unique designs for your brand and niche
  • Rate limiting - Max 10 posts/day to avoid spam
  • Duplicate prevention - Never posts the same review twice
  • Full dashboard - Track all posted reviews
  
  REQUIREMENTS:
  • Judge.me app installed
  • Instagram Business account
  • 5-star reviews on Judge.me
  
  HOW IT WORKS:
  1. Install ReviewSocial
  2. Connect Judge.me account
  3. Connect Instagram Business account
  4. New 5-star reviews automatically become Instagram posts!
  
  Perfect for stores that want to:
  - Boost social proof
  - Increase Instagram engagement
  - Save time on content creation
  - Build trust with authentic reviews
  ```

#### **Screenshots** (Minimum 5, 1280×800px):
Create screenshots showing:
1. **Dashboard** - Main page with Judge.me and Instagram connections
2. **Connection Success** - "Connected to Judge.me" and "Connected to Instagram" banners
3. **Posted Reviews Page** - Table showing posted reviews with stats
4. **Review Detail** - Example of a posted review with Instagram link
5. **Instagram Post** - Actual Instagram post from a review

**Tools:**
- macOS: Cmd+Shift+4 (then resize to 1280×800)
- Windows: Snipping Tool
- Online: https://www.screely.com/ (adds browser frame)

#### **App Icon** (1200×1200px):
- Design a professional logo
- Clear on both light and dark backgrounds
- No text or minimal text
- PNG format with transparency

**Design Tools:**
- Canva: https://www.canva.com/
- Figma: https://www.figma.com/
- Hire on Fiverr: ~$20-50

#### **Promotional Video** (Optional but recommended):
- 30-60 seconds
- Show: Connect → Post review → View on Instagram
- Tools: Loom, ScreenFlow, Camtasia

---

### 5. Set Up Cron Job (GitHub Actions) 🟢 **OPTIONAL**

If you want automatic posting every 2 hours:

1. **Push workflow to GitHub:**
   ```bash
   git add .github/workflows/auto-post.yml
   git commit -m "Add auto-post workflow"
   git push
   ```

2. **Add GitHub secrets:**
   - Go to: `https://github.com/YOUR_USERNAME/reviewsocial/settings/secrets/actions`
   - Add `APP_URL`: Your production URL
   - Add `CRON_SECRET`: (Optional) Random string for security

3. **Test manually:**
   - GitHub → Actions → "Auto-Post Reviews to Instagram" → Run workflow

See [CRON_SETUP.md](./CRON_SETUP.md) for more details.

---

### 6. Billing Integration (If Charging) 🟢 **OPTIONAL**

If you want to charge merchants:

1. **Integrate Shopify Billing API** in your app
2. **Define pricing tiers:**
   - Free tier (e.g., 5 posts/month)
   - Paid tier (e.g., $9.99/month for unlimited)
3. **Update app listing** with pricing information

**Resources:**
- https://shopify.dev/docs/apps/billing
- https://shopify.dev/docs/api/app-bridge-library/apis/app-bridge-api#billing

---

## 📝 **Submission Steps**

Once you've completed all manual tasks:

### 1. Test Everything
- [ ] Install on development store
- [ ] Test all features
- [ ] Verify GDPR webhooks work
- [ ] Test on mobile browser
- [ ] Check all links work
- [ ] Verify legal pages are accessible

### 2. Submit to Shopify
1. Log in to [Shopify Partner Dashboard](https://partners.shopify.com/)
2. Go to **Apps** → Your App → **Distribution**
3. Complete all sections:
   - App listing (name, description, screenshots, icon)
   - Pricing (if applicable)
   - Support (email, contact page)
   - Privacy & compliance (GDPR webhooks, legal pages)
   - Test information (development store URL, test account)
4. Click **"Submit for review"**

### 3. Wait for Approval
- **Timeline**: 5-7 business days
- **Monitor**: Check email for feedback
- **Respond quickly**: If they request changes

---

## 🎯 **Quick Checklist**

### Code (All Done ✅)
- [x] GDPR webhooks implemented
- [x] Data cleanup on uninstall
- [x] Legal links in footer
- [x] Test files removed
- [x] README updated
- [x] .env.example created

### Manual Tasks (Your To-Do)
- [ ] Create privacy policy page
- [ ] Create terms of service page
- [ ] Create support page
- [ ] Set up support email
- [ ] Update environment variables
- [ ] Deploy to production
- [ ] Create app screenshots (5+)
- [ ] Design app icon (1200×1200px)
- [ ] Write app description
- [ ] Test on multiple stores
- [ ] Set up GitHub Actions cron (optional)
- [ ] Integrate billing (if charging)
- [ ] Submit to Shopify App Store

---

## 📚 **Helpful Resources**

### Legal Pages:
- https://www.privacypolicygenerator.info/
- https://www.freeprivacypolicy.com/
- https://termly.io/

### Shopify Submission:
- [App Store Requirements](https://shopify.dev/docs/apps/store/requirements)
- [Submission Guide](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)
- [GDPR Compliance](https://shopify.dev/docs/apps/build/privacy-law-compliance)

### Design Resources:
- [Canva](https://www.canva.com/) - Screenshots and icon design
- [Figma](https://www.figma.com/) - UI design
- [Unsplash](https://unsplash.com/) - Stock photos

---

## 💡 **Pro Tips**

1. **Legal pages**: Use generators to create compliant policies quickly
2. **Screenshots**: Use real data and make them look professional
3. **App icon**: Keep it simple and memorable
4. **Description**: Focus on benefits, not just features
5. **Testing**: Test on 2-3 different stores before submitting
6. **Response time**: Reply to Shopify review team within 24 hours
7. **Marketing**: Prepare launch plan (social media, blog post, etc.)

---

## 🚨 **Common Rejection Reasons**

Avoid these:
1. ❌ Missing GDPR webhooks (✅ You have them!)
2. ❌ No privacy policy
3. ❌ Broken links or features
4. ❌ Low-quality screenshots
5. ❌ Misleading description
6. ❌ Security vulnerabilities
7. ❌ Poor mobile experience
8. ❌ Missing support contact

---

## ✅ **You're Almost There!**

Your app is **technically ready** for submission. All code-based requirements are complete.

**Next steps:**
1. Create 3 legal pages (1-2 hours)
2. Deploy to production (30 minutes)
3. Create app listing content (2-3 hours)
4. Submit!

**Need help?** Refer to the linked resources or reach out to Shopify Partner Support.

---

**Good luck with your app launch! 🚀**

