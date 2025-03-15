// Script to test image generation + Twitter posting
const { postTweet } = require('./packages/plugin-twitter/dist/post-LIZRJQ37.js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Create a mock runtime
const mockRuntime = {
  getSetting: (key) => {
    return process.env[key] || null;
  },
  imageModelProvider: process.env.IMAGE_MODEL_PROVIDER || 'default',
  log: console.log,
  
  // Simulate clients structure
  clients: {
    twitter: {
      client: {
        twitterClient: null // This will force using credentials
      }
    }
  }
};

// Test content to post
const tweetContent = "Testing image generation and posting to Twitter. This should have an AI-generated image. #AITest " + new Date().toISOString();

console.log("=== TWITTER IMAGE GENERATION AND POSTING TEST ===");
console.log(`Tweet content: ${tweetContent}`);
console.log("Image generation is EXPLICITLY enabled");

// Execute the tweet posting with image generation explicitly enabled
(async () => {
  try {
    // Ensure the generatedImages directory exists
    const imageDirPath = path.join(__dirname, 'agent', 'generatedImages');
    if (!fs.existsSync(imageDirPath)) {
      fs.mkdirSync(imageDirPath, { recursive: true });
      console.log(`Created directory: ${imageDirPath}`);
    }
    
    // Capture the current files in the directory
    const beforeFiles = fs.readdirSync(imageDirPath);
    console.log(`Before: ${beforeFiles.length} files in generatedImages directory`);
    
    // Post tweet with image generation explicitly enabled (true)
    console.log("Posting tweet with image generation enabled...");
    const result = await postTweet(mockRuntime, tweetContent, true);
    
    console.log(`Tweet posting result: ${result ? "SUCCESS" : "FAILED"}`);
    
    // Check if any new images were generated
    const afterFiles = fs.readdirSync(imageDirPath);
    console.log(`After: ${afterFiles.length} files in generatedImages directory`);
    
    const newFiles = afterFiles.filter(file => !beforeFiles.includes(file));
    if (newFiles.length > 0) {
      console.log(`New files generated: ${newFiles.join(', ')}`);
    } else {
      console.log("No new image files were generated during this test");
    }
  } catch (error) {
    console.error("Error in test:", error);
  }
})();
