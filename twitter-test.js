// Simple Twitter API V2 test script
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function testTwitterAuth() {
  console.log('Testing Twitter API Authentication...');
  
  // Check for Twitter API credentials
  const apiKey = process.env.TWITTER_API_KEY;
  const apiKeySecret = process.env.TWITTER_API_KEY_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
  
  if (!apiKey || !apiKeySecret || !accessToken || !accessTokenSecret) {
    console.error('Error: Missing Twitter API credentials in environment variables.');
    console.log('Required environment variables:');
    console.log('  TWITTER_API_KEY');
    console.log('  TWITTER_API_KEY_SECRET');
    console.log('  TWITTER_ACCESS_TOKEN');
    console.log('  TWITTER_ACCESS_TOKEN_SECRET');
    return false;
  }
  
  try {
    // Create Twitter client
    const twitterClient = new TwitterApi({
      appKey: apiKey,
      appSecret: apiKeySecret,
      accessToken: accessToken,
      accessSecret: accessTokenSecret,
    });
    
    // Get authenticated user
    const currentUser = await twitterClient.v2.me();
    console.log(`✅ Authentication successful! Logged in as: ${currentUser.data.name} (@${currentUser.data.username})`);
    return true;
  } catch (error) {
    console.error('Error authenticating with Twitter:', error.message);
    if (error.code) {
      console.error(`Twitter API Error Code: ${error.code}`);
    }
    return false;
  }
}

async function testImageUpload() {
  console.log('\nTesting Image Upload to Twitter...');
  
  // Create a test image path
  const testImagePath = path.join(__dirname, 'test-image.jpg');
  
  // Check if test image exists
  if (!fs.existsSync(testImagePath)) {
    console.log('Creating a test image...');
    // Generate a simple test image if one doesn't exist
    const testImage = Buffer.from('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', 'base64');
    fs.writeFileSync(testImagePath, testImage);
    console.log(`Created test image at: ${testImagePath}`);
  }
  
  try {
    // Get Twitter API credentials
    const apiKey = process.env.TWITTER_API_KEY;
    const apiKeySecret = process.env.TWITTER_API_KEY_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
    
    // Create Twitter client
    const twitterClient = new TwitterApi({
      appKey: apiKey,
      appSecret: apiKeySecret,
      accessToken: accessToken,
      accessSecret: accessTokenSecret,
    });
    
    // Read the image file
    const imageBuffer = fs.readFileSync(testImagePath);
    console.log(`Read test image, size: ${imageBuffer.length} bytes`);
    
    // Upload the media
    console.log('Uploading media to Twitter...');
    const mediaId = await twitterClient.v1.uploadMedia(imageBuffer, { mimeType: 'image/jpeg' });
    console.log(`✅ Media upload successful! Media ID: ${mediaId}`);
    
    // Post a tweet with the media
    console.log('Posting tweet with media...');
    const tweet = await twitterClient.v2.tweet({
      text: `Test tweet with image from Eliza at ${new Date().toISOString()}`,
      media: { media_ids: [mediaId] }
    });
    
    console.log(`✅ Tweet posted successfully!`);
    console.log(`Tweet ID: ${tweet.data.id}`);
    console.log(`Tweet URL: https://twitter.com/i/status/${tweet.data.id}`);
    
    return true;
  } catch (error) {
    console.error('Error uploading image to Twitter:', error.message);
    if (error.code) {
      console.error(`Twitter API Error Code: ${error.code}`);
    }
    return false;
  }
}

// Run tests
async function main() {
  console.log('======== TWITTER API TEST SCRIPT ========\n');
  
  // Test authentication
  const authSuccess = await testTwitterAuth();
  if (!authSuccess) {
    console.error('\n❌ Twitter authentication test failed. Cannot proceed with image upload test.');
    return;
  }
  
  // Test image upload
  const uploadSuccess = await testImageUpload();
  if (!uploadSuccess) {
    console.error('\n❌ Twitter image upload test failed.');
    return;
  }
  
  console.log('\n✅ All Twitter API tests completed successfully!');
  console.log('This confirms that your Twitter cross-posting functionality should work correctly.');
}

// Execute the test
main().catch(error => {
  console.error('Unhandled error in test script:', error);
});
