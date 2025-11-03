import OpenAI from 'openai';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';

export interface ReviewImageData {
  reviewText: string;
  rating: number;
  reviewerName?: string;
  productTitle?: string;
  brandName?: string;
  tagline?: string;
}

export async function generateReviewImage(
  reviewData: ReviewImageData
): Promise<string | null> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const awsRegion = process.env.AWS_REGION;
  const awsS3Bucket = process.env.AWS_S3_BUCKET;
  
  if (!geminiApiKey) {
    console.error("GEMINI_API_KEY not configured");
    return null;
  }
  
  if (!openaiApiKey) {
    console.error("OPENAI_API_KEY not configured");
    return null;
  }
  
  if (!awsAccessKeyId || !awsSecretAccessKey || !awsRegion || !awsS3Bucket) {
    console.error("AWS S3 credentials not configured. Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET");
    return null;
  }
  
  try {
    console.log("Step 1: Generating dynamic prompt with GPT-4o-mini...");
    const imagePrompt = await generateDynamicPrompt(reviewData, openaiApiKey);
    
    if (!imagePrompt) {
      console.error("Failed to generate prompt with GPT-4o-mini");
      return null;
    }
    
    console.log("Step 2: Generating image with Gemini using AI-generated prompt...");
    console.log("Prompt preview:", imagePrompt.substring(0, 200) + "...");
    console.log("Full prompt length:", imagePrompt.length, "characters");
    
    const model = 'gemini-2.5-flash-image';
    
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: imagePrompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: '1:1',
        },
      },
    };
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    
    console.log("Calling Gemini API...");
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return null;
    }
    
    const data = await response.json();
    console.log("Gemini API response received");
    
    // Extract image from response
    if (!data.candidates || data.candidates.length === 0) {
      console.error("No candidates in response");
      console.error("Response:", JSON.stringify(data, null, 2));
      return null;
    }
    
    const candidate = data.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      console.error("No content.parts in response");
      return null;
    }
    
    // Find image in parts
    const imagePart = candidate.content.parts.find(
      (part: any) => part.inlineData?.mimeType?.startsWith('image/')
    );
    
    if (!imagePart || !imagePart.inlineData) {
      console.error("No image data in response");
      console.error("Parts:", JSON.stringify(candidate.content.parts, null, 2));
      return null;
    }
    
    console.log("Image data received from Gemini!");
    const base64Image = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType;
    
    console.log("Original image MIME type:", mimeType);
    console.log("Original image data length:", base64Image.length);
    
    // Step 3: Optimize image for Instagram
    console.log("Optimizing image for Instagram...");
    const optimizedImageBase64 = await optimizeImageForInstagram(base64Image);
    
    if (!optimizedImageBase64) {
      console.error("Failed to optimize image");
      return null;
    }
    
    console.log("✓ Image optimized (JPEG, 1080x1080)");
    
    // Step 4: Upload to AWS S3
    console.log("Step 4: Uploading optimized image to AWS S3...");
    const imageUrl = await uploadImageToS3(
      optimizedImageBase64,
      awsAccessKeyId,
      awsSecretAccessKey,
      awsRegion,
      awsS3Bucket
    );
    
    return imageUrl;
  } catch (error) {
    console.error("Error generating review image:");
    console.error("Error:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    return null;
  }
}

async function optimizeImageForInstagram(base64Image: string): Promise<string | null> {
  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');
    
    // Optimize image for Instagram:
    // - Convert to JPEG (better compression, Instagram-friendly)
    // - Resize to exactly 1080x1080 (Instagram square format)
    // - Quality 85 (good balance of quality and file size)
    // - Remove metadata to reduce size
    const optimizedBuffer = await sharp(imageBuffer)
      .resize(1080, 1080, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({
        quality: 85,
        mozjpeg: true // Better compression
      })
      .toBuffer();
    
    const fileSizeKB = Math.round(optimizedBuffer.length / 1024);
    console.log(`Optimized image size: ${fileSizeKB} KB`);
    
    // Instagram recommends images under 8MB, ideally under 1MB
    if (fileSizeKB > 8000) {
      console.warn(`Warning: Image size (${fileSizeKB} KB) is quite large`);
    }
    
    return optimizedBuffer.toString('base64');
  } catch (error) {
    console.error("Error optimizing image:", error);
    return null;
  }
}

async function generateDynamicPrompt(
  reviewData: ReviewImageData,
  openaiApiKey: string
): Promise<string | null> {
  try {
    const openai = new OpenAI({ apiKey: openaiApiKey });
    
    const stars = "⭐".repeat(reviewData.rating);
    const brandName = reviewData.brandName || "Our Store";
    const tagline = reviewData.tagline || (reviewData.rating === 5 ? "Trusted by Happy Customers" : "Quality You Can Trust");
    
    const metaPrompt = `You are an expert at creating image generation prompts for social media marketing.

Your task: Analyze the product and brand information below, then create a detailed, optimized prompt for an AI image generator (Gemini) to create a stunning Instagram/Facebook review post image.

PRODUCT/BRAND INFORMATION:
- Brand Name: ${brandName}
- Product: ${reviewData.productTitle || "Not specified"}
- Review Rating: ${reviewData.rating} stars
- Reviewer Name: ${reviewData.reviewerName || "A Happy Customer"}
- Review Text: "${reviewData.reviewText}"
- Tagline: ${tagline}

YOUR TASK:
1. Identify the product category/niche (e.g., fashion, electronics, baby products, pet supplies, food, sports, beauty, home decor, etc.)
2. Create a design theme that matches the product category (colors, style, visual elements)
3. Generate a complete image generation prompt that includes:
   - The EXACT review text (copy it character-by-character without changes)
   - Brand name and tagline
   - Stars (${stars})
   - Reviewer name
   - Category-appropriate design style, colors, and visual elements
   - Product-related imagery or icons
   - Layout specifications (1080x1080px Instagram square format)
   - Optimization for fast loading and web delivery

CRITICAL REQUIREMENTS:
- The review text MUST be copied EXACTLY as provided: "${reviewData.reviewText}"
- Do NOT change, summarize, or paraphrase any part of the review text
- Include multiple reminders in the prompt about text accuracy
- Make the design theme specific to the detected product category
- Use appropriate colors, visual elements, and style for the niche
- Request the image to be optimized for web/social media (reasonable file size, fast loading)
- Specify clean, simple designs that compress well

Output only the final image generation prompt (not your analysis). The prompt should be ready to send directly to an image generation AI.`;

    console.log("Calling GPT-4o-mini for prompt generation...");
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert at creating highly effective, detailed prompts for AI image generators. You specialize in e-commerce and social media marketing visuals."
        },
        {
          role: "user",
          content: metaPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const generatedPrompt = completion.choices[0]?.message?.content;
    
    if (!generatedPrompt) {
      console.error("No prompt generated by GPT-4o-mini");
      return null;
    }
    
    console.log("✓ Dynamic prompt generated successfully");
    console.log("Generated prompt length:", generatedPrompt.length);
    
    return generatedPrompt;
  } catch (error) {
    console.error("Error generating dynamic prompt with GPT-4o-mini:", error);
    return null;
  }
}

async function uploadImageToS3(
  base64Data: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  bucket: string
): Promise<string | null> {
  try {
    // Initialize S3 client
    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = randomBytes(8).toString('hex');
    const fileName = `review-images/${timestamp}-${randomString}.jpg`;

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    console.log(`Uploading to S3: ${bucket}/${fileName}`);
    console.log(`Image size: ${Math.round(imageBuffer.length / 1024)} KB`);

    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: fileName,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000', // Cache for 1 year
      // Note: ACL removed - use bucket policy for public access instead
    });

    await s3Client.send(uploadCommand);

    // Construct public URL
    // Format: https://<bucket>.s3.<region>.amazonaws.com/<key>
    const imageUrl = `https://${bucket}.s3.${region}.amazonaws.com/${fileName}`;
    
    console.log("✓ Image uploaded to S3 successfully");
    console.log("Public URL:", imageUrl);

    // Verify URL format
    try {
      new URL(imageUrl);
    } catch (e) {
      console.error("Invalid S3 URL format:", imageUrl);
      return null;
    }

    return imageUrl;
  } catch (error) {
    console.error("Error uploading image to S3:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
    }
    return null;
  }
}

