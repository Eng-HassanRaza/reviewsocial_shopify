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
        responseModalities: ['text', 'image'],
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
    
    const metaPrompt = `You are an expert UI/UX designer and visual marketing specialist creating premium social media review post designs.

Your task: Analyze the product and brand information below, then create a highly detailed, sophisticated prompt for an AI image generator (Gemini) to create a stunning, professional Instagram/Facebook review post image with excellent UI/UX design principles.

PRODUCT/BRAND INFORMATION:
- Brand Name: ${brandName}
- Product: ${reviewData.productTitle || "Not specified"}
- Review Rating: ${reviewData.rating} stars
- Reviewer Name: ${reviewData.reviewerName || "A Happy Customer"}
- Review Text: "${reviewData.reviewText}"
- Tagline: ${tagline}

YOUR TASK:
1. **Analyze the brand and product:**
   - Identify the product category/niche (fashion, electronics, food, beauty, home decor, pet supplies, etc.)
   - Determine brand personality (premium, playful, minimalist, rustic, modern, etc.)
   - Infer appropriate color palette based on category and brand name
   - Consider target audience and lifestyle context

2. **Apply modern UI/UX design principles:**
   - **Visual Hierarchy**: Use size, color, and positioning to guide the eye
   - **Typography**: Choose fonts that match brand personality (elegant serif for premium, modern sans-serif for tech, playful fonts for fun brands)
   - **Color Psychology**: Use colors that evoke the right emotions for the product category
   - **Spacing & Layout**: Apply proper padding, margins, and white space (rule of thirds, golden ratio)
   - **Depth & Dimension**: Add subtle shadows, gradients, or layered elements for depth
   - **Modern Design Trends**: Incorporate contemporary elements like soft gradients, glassmorphism, card-based layouts, or subtle patterns

3. **Create a sophisticated, themed design:**
   - Design should reflect the STORE'S brand identity and the PRODUCT'S category
   - Include contextual background elements that relate to the product (e.g., kitchen setting for food, nature for organic products, tech workspace for electronics)
   - Use product-related imagery, icons, or lifestyle elements that enhance the story
   - Create visual interest with textures, patterns, or subtle decorative elements
   - Ensure the design feels premium and professional, not generic

4. **Generate a complete, detailed image generation prompt that includes:**
   - The EXACT review text (copy character-by-character without changes)
   - Brand name prominently displayed with appropriate styling
   - Tagline integrated naturally into the design
   - Stars (${stars}) displayed beautifully, not just plain text
   - Reviewer name with appropriate styling (e.g., "— John Doe" or "Reviewed by Sarah")
   - Product name/title if relevant
   - Detailed layout description (card layout, split sections, centered content, etc.)
   - Specific color palette with hex codes or color descriptions
   - Typography specifications (font styles, sizes, weights)
   - Background design (gradient, texture, pattern, contextual scene, etc.)
   - Visual elements (icons, illustrations, product imagery, decorative elements)
   - Lighting and mood (warm, cool, bright, soft, etc.)
   - Overall aesthetic (modern, vintage, minimalist, luxurious, playful, etc.)
   - Layout specifications: 1080x1080px Instagram square format

CRITICAL REQUIREMENTS:
- The review text MUST be copied EXACTLY as provided: "${reviewData.reviewText}"
- Do NOT change, summarize, or paraphrase any part of the review text
- Include multiple reminders in the prompt about text accuracy
- Create a SOPHISTICATED, PROFESSIONAL design - NOT simple or basic
- The design should feel like it was created by a professional graphic designer
- Make the design theme SPECIFIC to both the store brand AND product category
- Use advanced UI/UX principles: visual hierarchy, proper spacing, modern typography, depth
- Include contextual elements that tell a story about the product
- Request rich, detailed visuals with proper composition and professional aesthetics
- The final image should look like premium social media content that brands would pay for

DESIGN QUALITY STANDARDS:
- Professional, polished appearance
- Cohesive color scheme that matches brand/product
- Proper visual hierarchy (most important info stands out)
- Modern, contemporary design aesthetic
- Rich visual details without being cluttered
- Contextual elements that enhance the product story
- Typography that matches brand personality
- Layout that guides the eye naturally

Output only the final, highly detailed image generation prompt (not your analysis). The prompt should be comprehensive and ready to send directly to an AI image generator. Make it detailed enough to produce a professional, sophisticated design.`;

    console.log("Calling GPT-4o-mini for prompt generation...");
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a senior UI/UX designer and visual marketing expert specializing in creating premium social media content. You have deep expertise in modern design principles, typography, color theory, visual hierarchy, and brand identity. Your prompts produce sophisticated, professional designs that look like they were created by top-tier design agencies."
        },
        {
          role: "user",
          content: metaPrompt
        }
      ],
      temperature: 0.8,
      max_tokens: 1500,
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

