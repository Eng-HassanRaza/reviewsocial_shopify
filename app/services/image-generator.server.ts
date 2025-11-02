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
  const imgbbApiKey = process.env.IMGBB_API_KEY;
  
  if (!geminiApiKey) {
    console.error("GEMINI_API_KEY not configured");
    return null;
  }
  
  if (!imgbbApiKey) {
    console.error("IMGBB_API_KEY not configured for image storage");
    return null;
  }
  
  try {
    console.log("Generating image with Gemini REST API...");
    
    const model = 'gemini-2.5-flash-image';
    const prompt = createImagePrompt(reviewData);
    
    console.log("Prompt preview:", prompt.substring(0, 200) + "...");
    
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt,
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
    
    console.log("Image MIME type:", mimeType);
    console.log("Image data length:", base64Image.length);
    
    // Upload to ImgBB
    const imageUrl = await uploadImageToStorage(base64Image, mimeType);
    
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

function createImagePrompt(reviewData: ReviewImageData): string {
  const stars = "⭐".repeat(reviewData.rating);
  const brandName = reviewData.brandName || "Our Store";
  const tagline = reviewData.tagline || (reviewData.rating === 5 ? "Trusted by Happy Customers" : "Quality You Can Trust");
  
  return `Create a modern, engaging social media post image for an electronics brand called ${brandName}.
The image should visually display a ${reviewData.rating}-star customer review in a clean, professional layout suitable for Instagram and Facebook.

Include these text elements clearly and attractively:

${stars}

Customer Name: ${reviewData.reviewerName || "A Happy Customer"}

Review Text:
"${reviewData.reviewText}"

${reviewData.productTitle ? `Product: ${reviewData.productTitle}\n` : ''}
Branding:

Add the brand name "${brandName}" prominently at the top or bottom of the image.
${reviewData.productTitle ? `Include a small product representation or icon for "${reviewData.productTitle}" near the review text.\n` : ''}
Highlight the tagline "${tagline}" using modern, stylish typography.

Design Style:

Modern, minimalistic, and tech-oriented.

Use subtle gradients or dark-themed backgrounds with electric blue or glowing accents to symbolize energy or innovation.

Ensure excellent readability for all text with proper contrast.

Visually emphasize the ${reviewData.rating}-star rating and customer satisfaction.

Use professional typography with clear hierarchy (stars at top, review text prominent, customer name at bottom).

Make it suitable for Instagram square format (1080x1080px).

Goal:
Create a visually appealing and trustworthy post that reflects a premium yet approachable brand, highlighting authentic customer appreciation. The design should be eye-catching, shareable, and convey credibility and professionalism.`;
}

async function uploadImageToStorage(
  base64Data: string,
  mimeType: string
): Promise<string | null> {
  try {
    const imgbbApiKey = process.env.IMGBB_API_KEY;
    
    if (!imgbbApiKey) {
      console.error("IMGBB_API_KEY not configured");
      return null;
    }
    
    console.log("Uploading image to ImgBB...");
    const formData = new URLSearchParams();
    formData.append("key", imgbbApiKey);
    formData.append("image", base64Data);

    const response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      const url = data.data?.url || null;
      console.log("Image uploaded successfully:", url);
      return url;
    } else {
      const errorText = await response.text();
      console.error("ImgBB upload failed:", errorText);
      return null;
    }
  } catch (error) {
    console.error("Error uploading image:", error);
    return null;
  }
}

