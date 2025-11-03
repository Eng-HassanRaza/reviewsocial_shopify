/**
 * Test script for Image Generation & S3 Upload
 * 
 * Run with: npx tsx test-image-generation.ts
 */

import { config } from 'dotenv';
import { S3Client, PutObjectCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import OpenAI from 'openai';
import sharp from 'sharp';
import { randomBytes } from 'crypto';

// Load environment variables
config();

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✅ ${message}`, colors.green);
}

function error(message: string) {
  log(`❌ ${message}`, colors.red);
}

function info(message: string) {
  log(`ℹ️  ${message}`, colors.cyan);
}

function warn(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

// Test 1: Check Environment Variables
async function testEnvironmentVariables(): Promise<boolean> {
  log('\n📋 Test 1: Checking Environment Variables...', colors.blue);
  
  const required = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: process.env.AWS_REGION,
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
  };

  let allPresent = true;

  for (const [key, value] of Object.entries(required)) {
    if (value) {
      success(`${key}: ${value.substring(0, 10)}...`);
    } else {
      error(`${key}: NOT SET`);
      allPresent = false;
    }
  }

  return allPresent;
}

// Test 2: Test AWS S3 Connection
async function testS3Connection(): Promise<boolean> {
  log('\n☁️  Test 2: Testing AWS S3 Connection...', colors.blue);

  try {
    const s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    info('Listing S3 buckets...');
    const listCommand = new ListBucketsCommand({});
    const response = await s3Client.send(listCommand);

    success(`Connected to AWS! Found ${response.Buckets?.length || 0} buckets`);
    
    const bucketExists = response.Buckets?.some(b => b.Name === process.env.AWS_S3_BUCKET);
    if (bucketExists) {
      success(`Target bucket "${process.env.AWS_S3_BUCKET}" found`);
    } else {
      error(`Target bucket "${process.env.AWS_S3_BUCKET}" NOT FOUND`);
      warn('Available buckets:');
      response.Buckets?.forEach(b => console.log(`  - ${b.Name}`));
      return false;
    }

    return true;
  } catch (err) {
    error('S3 Connection failed!');
    console.error(err);
    return false;
  }
}

// Test 3: Test S3 Upload
async function testS3Upload(): Promise<string | null> {
  log('\n📤 Test 3: Testing S3 Upload...', colors.blue);

  try {
    const s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    // Create a simple test image (100x100 red square)
    info('Creating test image...');
    const testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .jpeg({ quality: 85 })
    .toBuffer();

    const fileName = `test-images/test-${Date.now()}-${randomBytes(4).toString('hex')}.jpg`;
    
    info(`Uploading to s3://${process.env.AWS_S3_BUCKET}/${fileName}...`);

    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: fileName,
      Body: testImage,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000',
      // Note: ACL removed - use bucket policy instead
    });

    await s3Client.send(uploadCommand);

    const imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    success('Upload successful!');
    info(`Public URL: ${imageUrl}`);

    // Test if URL is accessible
    info('Verifying URL is accessible...');
    const response = await fetch(imageUrl, { method: 'HEAD' });
    if (response.ok) {
      success('✓ Image is publicly accessible!');
    } else {
      error(`✗ Image not accessible (${response.status})`);
      warn('Check bucket permissions and ACL settings');
    }

    return imageUrl;
  } catch (err) {
    error('S3 Upload failed!');
    console.error(err);
    
    if (err instanceof Error && err.message.includes('Access Denied')) {
      warn('Possible issues:');
      warn('1. IAM user lacks S3 permissions');
      warn('2. Bucket policy blocks uploads');
      warn('3. ACL disabled on bucket');
    }
    
    return null;
  }
}

// Test 4: Test OpenAI API
async function testOpenAI(): Promise<boolean> {
  log('\n🤖 Test 4: Testing OpenAI API...', colors.blue);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    info('Calling GPT-4o-mini...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "test successful" and nothing else.' }
      ],
      max_tokens: 10,
    });

    const response = completion.choices[0]?.message?.content || '';
    success(`OpenAI Response: "${response}"`);
    return true;
  } catch (err) {
    error('OpenAI API failed!');
    console.error(err);
    return false;
  }
}

// Test 5: Test Gemini API
async function testGemini(): Promise<string | null> {
  log('\n✨ Test 5: Testing Gemini Image Generation...', colors.blue);

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = 'gemini-2.5-flash-image';

    info('Calling Gemini API to generate image...');
    const prompt = 'Create a simple red square image, 100x100 pixels';

    const requestBody = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '1:1' },
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey!,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      error(`Gemini API error (${response.status})`);
      console.error(errorText);
      return null;
    }

    const data = await response.json();
    const imagePart = data.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData?.mimeType?.startsWith('image/')
    );

    if (!imagePart) {
      error('No image data in Gemini response');
      console.log('Response:', JSON.stringify(data, null, 2));
      return null;
    }

    const base64Image = imagePart.inlineData.data;
    success(`Generated image (${base64Image.length} chars base64)`);
    return base64Image;
  } catch (err) {
    error('Gemini API failed!');
    console.error(err);
    return null;
  }
}

// Test 6: Full Integration Test
async function testFullFlow(): Promise<boolean> {
  log('\n🔄 Test 6: Full Integration Test...', colors.blue);

  try {
    // Step 1: Generate prompt with OpenAI
    info('Step 1: Generating prompt with GPT-4o-mini...');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const promptCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You create image generation prompts.'
        },
        {
          role: 'user',
          content: 'Create a simple prompt for generating a social media review image with 5 stars and text "Great product!"'
        }
      ],
      max_tokens: 200,
    });

    const generatedPrompt = promptCompletion.choices[0]?.message?.content || 'Create a review image with 5 stars';
    info(`Generated prompt: "${generatedPrompt.substring(0, 80)}..."`);

    // Step 2: Generate image with Gemini
    info('Step 2: Generating image with Gemini...');
    const requestBody = {
      contents: [{ parts: [{ text: generatedPrompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '1:1' },
      },
    };

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY!,
        },
        body: JSON.stringify(requestBody),
      }
    );

    const geminiData = await geminiResponse.json();
    const imagePart = geminiData.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.inlineData?.mimeType?.startsWith('image/')
    );

    if (!imagePart) {
      error('No image generated');
      return false;
    }

    const base64Image = imagePart.inlineData.data;
    success('Image generated!');

    // Step 3: Optimize with Sharp
    info('Step 3: Optimizing image...');
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const optimizedBuffer = await sharp(imageBuffer)
      .resize(1080, 1080, { fit: 'cover' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    
    success(`Optimized (${Math.round(optimizedBuffer.length / 1024)} KB)`);

    // Step 4: Upload to S3
    info('Step 4: Uploading to S3...');
    const s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const fileName = `review-images/full-test-${Date.now()}.jpg`;
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: fileName,
      Body: optimizedBuffer,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000',
      // Note: ACL removed - use bucket policy instead
    });

    await s3Client.send(uploadCommand);

    const imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    success('Upload complete!');
    log(`\n🎉 SUCCESS! Full flow completed!`, colors.green);
    log(`\n📸 Test Image URL:\n${imageUrl}\n`, colors.cyan);

    return true;
  } catch (err) {
    error('Full flow test failed!');
    console.error(err);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  log('╔════════════════════════════════════════════════════╗', colors.blue);
  log('║   ReviewSocial - Image Generation Test Suite      ║', colors.blue);
  log('╚════════════════════════════════════════════════════╝', colors.blue);

  const results: { [key: string]: boolean } = {};

  // Test 1: Environment Variables
  results['Environment Variables'] = await testEnvironmentVariables();
  if (!results['Environment Variables']) {
    error('\n❌ Environment variables missing. Please check your .env file');
    process.exit(1);
  }

  // Test 2: S3 Connection
  results['S3 Connection'] = await testS3Connection();
  if (!results['S3 Connection']) {
    error('\n❌ S3 Connection failed. Check AWS credentials and bucket name');
    process.exit(1);
  }

  // Test 3: S3 Upload
  const uploadUrl = await testS3Upload();
  results['S3 Upload'] = uploadUrl !== null;
  
  // Test 4: OpenAI
  results['OpenAI API'] = await testOpenAI();
  
  // Test 5: Gemini
  const geminiImage = await testGemini();
  results['Gemini API'] = geminiImage !== null;

  // Test 6: Full Flow
  if (Object.values(results).every(r => r)) {
    results['Full Integration'] = await testFullFlow();
  } else {
    warn('\nSkipping full integration test due to previous failures');
    results['Full Integration'] = false;
  }

  // Summary
  log('\n╔════════════════════════════════════════════════════╗', colors.blue);
  log('║                   TEST SUMMARY                     ║', colors.blue);
  log('╚════════════════════════════════════════════════════╝', colors.blue);
  
  for (const [test, passed] of Object.entries(results)) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const color = passed ? colors.green : colors.red;
    log(`${status} - ${test}`, color);
  }

  const allPassed = Object.values(results).every(r => r);
  
  if (allPassed) {
    log('\n🎉 All tests passed! Your setup is working correctly.', colors.green);
  } else {
    log('\n⚠️  Some tests failed. Please fix the issues above.', colors.yellow);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(err => {
  error('Unexpected error running tests:');
  console.error(err);
  process.exit(1);
});

