# AWS S3 Setup for Review Social

## Required Environment Variables

Add these to your `.env` file:

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

## Step-by-Step Setup

### 1. Create an AWS Account
- Go to [aws.amazon.com](https://aws.amazon.com)
- Sign up or log in

### 2. Create an S3 Bucket

1. Go to AWS Console → S3
2. Click "Create bucket"
3. **Bucket name**: Choose a unique name (e.g., `reviewsocial-images-prod`)
4. **Region**: Choose closest to your users (e.g., `us-east-1`)
5. **Block Public Access**: UNCHECK "Block all public access" ⚠️
   - We need public read access for Instagram to download images
6. Click "Create bucket"

### 3. Configure Bucket Permissions

1. Go to your bucket → **Permissions** tab
2. Scroll to **Bucket policy**
3. Click "Edit" and paste this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    }
  ]
}
```

**Replace `YOUR-BUCKET-NAME`** with your actual bucket name.

4. Click "Save changes"

### 4. Enable CORS (for web access)

1. Go to your bucket → **Permissions** tab
2. Scroll to **Cross-origin resource sharing (CORS)**
3. Click "Edit" and paste:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```

4. Click "Save changes"

### 5. Create IAM User for Programmatic Access

#### Step 5.1: Create the User

1. Go to AWS Console → **IAM** → **Users**
2. Click **"Create user"**
3. **User name**: `reviewsocial-app`
4. Click **"Next"**

#### Step 5.2: Attach Permissions

1. Select **"Attach policies directly"**
2. Search for and select: **AmazonS3FullAccess**
3. Click **"Next"**
4. Review and click **"Create user"**

#### Step 5.3: Create Access Keys

1. After user is created, click on the user name `reviewsocial-app`
2. Go to **"Security credentials"** tab
3. Scroll down to **"Access keys"** section
4. Click **"Create access key"**
5. Select use case: **"Application running outside AWS"** or **"Command Line Interface (CLI)"**
6. Click **"Next"**
7. (Optional) Add description tag: "ReviewSocial App"
8. Click **"Create access key"**
9. **IMPORTANT**: Copy the **Access Key ID** and **Secret Access Key** NOW
   - You won't be able to see the secret key again!
   - Download the CSV file as backup

#### Step 5.4: Save Your Credentials

```
Access Key ID: AKIAIOSFODNN7EXAMPLE
Secret Access Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

⚠️ **Keep these credentials secure!** Never commit them to Git.

### 6. Update .env File

```bash
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE     # From step 5
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY  # From step 5
AWS_REGION=us-east-1                        # Your bucket region
AWS_S3_BUCKET=reviewsocial-images-prod      # Your bucket name
```

## Testing

After configuration, test by posting a 5-star review to Instagram from your app. Check server logs for:

```
Step 4: Uploading optimized image to AWS S3...
Uploading to S3: your-bucket/review-images/1699123456789-abc123def456.jpg
Image size: 234 KB
✓ Image uploaded to S3 successfully
Public URL: https://your-bucket.s3.us-east-1.amazonaws.com/review-images/...
```

## Security Best Practices

1. **Never commit .env to Git** (already in .gitignore)
2. **Use separate buckets** for dev/staging/production
3. **Enable bucket versioning** for backup
4. **Set up CloudFront CDN** (optional, for better performance)
5. **Use IAM user with minimal permissions** (not root account)

## Cost Estimation

AWS S3 pricing (us-east-1):
- **Storage**: $0.023 per GB/month
- **Requests**: $0.0004 per 1,000 PUT requests
- **Data transfer**: First 1 GB/month free, then $0.09/GB

**Example**: 1,000 images/month (500 MB total)
- Storage: $0.01/month
- Requests: $0.0004/month
- Total: **~$0.01/month** 💰

Very affordable!

## Troubleshooting

### Error: "Access Denied"
- Check bucket policy allows public read
- Verify IAM user has S3 permissions

### Error: "Bucket does not exist"
- Verify `AWS_S3_BUCKET` matches exact bucket name
- Check `AWS_REGION` is correct

### Instagram still can't download image
- Ensure bucket policy allows public access
- Test URL in browser (should download image)
- Check CORS configuration

## Alternative: CloudFront CDN (Optional)

For better performance and Instagram reliability:

1. Create CloudFront distribution pointing to S3 bucket
2. Use CloudFront URL instead of direct S3 URL
3. Update code to use: `https://your-cdn.cloudfront.net/...`

This provides:
- ✅ Faster global delivery
- ✅ Better Instagram compatibility
- ✅ SSL/HTTPS by default
- ✅ Reduced S3 costs

---

Need help? Check AWS docs: https://docs.aws.amazon.com/s3/

