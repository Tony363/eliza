// Test script for Twitter cross-posting
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import Twitter API client if available
let TwitterApi;
try {
  TwitterApi = require('twitter-api-v2').TwitterApi;
  console.log('Twitter API client loaded successfully');
} catch (e) {
  console.error('Twitter API client not found:', e.message);
  process.exit(1);
}

// Function to test direct Twitter API posting
async function testDirectTwitterPosting() {
  try {
    console.log('\n========== TESTING DIRECT TWITTER API POSTING ==========');
    
    // Check if API keys are available
    const apiKey = process.env.TWITTER_API_KEY;
    const apiKeySecret = process.env.TWITTER_API_KEY_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
    
    if (!apiKey || !apiKeySecret || !accessToken || !accessTokenSecret) {
      console.error('Twitter API keys not found in environment variables');
      console.log('Required environment variables:');
      console.log('- TWITTER_API_KEY');
      console.log('- TWITTER_API_KEY_SECRET');
      console.log('- TWITTER_ACCESS_TOKEN');
      console.log('- TWITTER_ACCESS_TOKEN_SECRET');
      return false;
    }
    
    console.log('Twitter API credentials found');
    
    // Test image path - use an existing image or create a test one
    const testImagePath = path.resolve(__dirname, 'test-image.jpg');
    
    // Create a test image if it doesn't exist
    if (!fs.existsSync(testImagePath)) {
      console.log('Test image not found, please create one at:', testImagePath);
      return false;
    }
    
    console.log(`Using test image at: ${testImagePath}`);
    
    // Create Twitter client
    const twitterClient = new TwitterApi({
      appKey: apiKey,
      appSecret: apiKeySecret,
      accessToken: accessToken,
      accessSecret: accessTokenSecret,
    });
    
    console.log('Twitter client created successfully');
    
    // Read the image file
    const imageBuffer = fs.readFileSync(testImagePath);
    console.log(`Image file read successfully, size: ${imageBuffer.length} bytes`);
    
    // Upload the media to Twitter
    console.log('Uploading media to Twitter...');
    const mediaId = await twitterClient.v1.uploadMedia(imageBuffer, { mimeType: 'image/jpeg' });
    console.log(`Media uploaded with ID: ${mediaId}`);
    
    // Post tweet with the uploaded media
    const tweetText = `Test image post from Eliza at ${new Date().toISOString()}`;
    console.log(`Posting tweet with text: ${tweetText}`);
    
    const result = await twitterClient.v2.tweet({
      text: tweetText,
      media: { media_ids: [mediaId] }
    });
    
    console.log(`Tweet posted successfully!`);
    console.log(`Tweet ID: ${result.data.id}`);
    console.log(`Tweet URL: https://twitter.com/user/status/${result.data.id}`);
    
    return true;
  } catch (error) {
    console.error('Error testing Twitter API:', error);
    return false;
  }
}

// Run the test
async function main() {
  console.log('======== TWITTER CROSS-POSTING TEST SCRIPT ========');
  
  // List environment variables for Twitter
  const twitterSettings = [
    'TWITTER_USERNAME', 'TWITTER_PASSWORD', 'TWITTER_EMAIL',
    'TWITTER_API_KEY', 'TWITTER_API_KEY_SECRET',
    'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET'
  ];
  
  console.log('\nChecking Twitter settings:');
  for (const setting of twitterSettings) {
    const hasValue = !!process.env[setting];
    console.log(`- ${setting}: ${hasValue ? 'Set' : 'Not set'}`);
  }
  
  // Test direct API posting
  console.log('\nTesting direct Twitter API posting...');
  const result = await testDirectTwitterPosting();
  
  if (result) {
    console.log('\n✅ SUCCESS: Twitter cross-posting test completed successfully');
  } else {
    console.log('\n❌ FAILURE: Twitter cross-posting test failed');
  }
}

// Run the main function
main().catch(console.error);
