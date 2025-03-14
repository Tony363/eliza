// Script to force a direct Twitter image posting bypassing normal authentication flow
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { TwitterApi } = require('twitter-api-v2');
const puppeteer = require('puppeteer');

// Load environment variables
dotenv.config();

// Sample image path - use an existing image or create a test one
const sampleImagePath = path.resolve(__dirname, 'test-image.jpg');

// Create a test image if it doesn't exist
async function createTestImageIfNeeded() {
    if (!fs.existsSync(sampleImagePath)) {
        console.log('Creating test image...');
        // Use node-canvas or download a placeholder image
        const https = require('https');
        const file = fs.createWriteStream(sampleImagePath);
        
        return new Promise((resolve, reject) => {
            https.get('https://picsum.photos/800/600', function(response) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log(`Test image created at ${sampleImagePath}`);
                    resolve(sampleImagePath);
                });
            }).on('error', (err) => {
                fs.unlink(sampleImagePath);
                reject(err);
            });
        });
    } else {
        console.log(`Using existing test image at ${sampleImagePath}`);
        return sampleImagePath;
    }
}

// Attempt to post directly to Twitter using browser automation
async function forceTwitterPostWithPuppeteer() {
    console.log('\n========== TRYING DIRECT TWITTER POSTING WITH PUPPETEER ==========');
    
    const username = process.env.TWITTER_USERNAME;
    const password = process.env.TWITTER_PASSWORD;
    const email = process.env.TWITTER_EMAIL;
    
    if (!username || !password) {
        console.error('Twitter credentials not found in .env file');
        return false;
    }
    
    console.log(`Using Twitter credentials for user: ${username}`);
    
    try {
        const browser = await puppeteer.launch({ 
            headless: false, // Use headless: false to see the browser actions
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        console.log('Browser launched');
        
        // Navigate to Twitter login page
        await page.goto('https://twitter.com/i/flow/login', { waitUntil: 'networkidle2' });
        console.log('Navigated to Twitter login page');
        
        // Wait for login form
        await page.waitForSelector('input[name="text"]', { timeout: 60000 });
        console.log('Login form detected');
        
        // Type username
        await page.type('input[name="text"]', username);
        await page.keyboard.press('Enter');
        console.log('Username entered');
        
        // Wait for password field
        await page.waitForSelector('input[name="password"]', { timeout: 60000 });
        
        // Type password
        await page.type('input[name="password"]', password);
        await page.keyboard.press('Enter');
        console.log('Password entered');
        
        // Wait for potential email verification
        try {
            const emailVerificationSelector = 'input[data-testid="ocfEnterTextTextInput"]';
            const emailVerificationExists = await page.waitForSelector(emailVerificationSelector, { timeout: 10000 })
                .then(() => true)
                .catch(() => false);
            
            if (emailVerificationExists && email) {
                console.log('Email verification detected');
                await page.type(emailVerificationSelector, email);
                await page.keyboard.press('Enter');
                console.log('Email entered');
            }
        } catch (e) {
            console.log('No email verification needed');
        }
        
        // Wait for home timeline to ensure we're logged in
        await page.waitForSelector('div[data-testid="primaryColumn"]', { timeout: 60000 });
        console.log('Successfully logged in to Twitter!');
        
        // Navigate to Twitter compose tweet page
        await page.goto('https://twitter.com/compose/tweet', { waitUntil: 'networkidle2' });
        console.log('Navigated to compose tweet page');
        
        // Wait for tweet compose box
        await page.waitForSelector('div[data-testid="tweetTextarea_0"]', { timeout: 30000 });
        
        // Type tweet text
        const tweetText = `Test image post from Eliza at ${new Date().toISOString()}`;
        await page.type('div[data-testid="tweetTextarea_0"]', tweetText);
        console.log('Tweet text entered');
        
        // Click on media button to upload image
        const mediaButtonSelector = 'div[data-testid="attachments"]';
        await page.waitForSelector(mediaButtonSelector);
        await page.click(mediaButtonSelector);
        console.log('Clicked media button');
        
        // Wait for file input to be available
        await page.waitForSelector('input[type="file"]', { timeout: 30000 });
        
        // Upload the image
        const inputFile = await page.$('input[type="file"]');
        await inputFile.uploadFile(sampleImagePath);
        console.log(`Image uploaded: ${sampleImagePath}`);
        
        // Wait for image to be uploaded
        await page.waitForSelector('div[data-testid="attachments"] div[role="presentation"]', { timeout: 30000 });
        console.log('Image upload confirmed');
        
        // Click the tweet button
        const tweetButtonSelector = 'div[data-testid="tweetButtonInline"]';
        await page.waitForSelector(tweetButtonSelector, { timeout: 30000 });
        await page.click(tweetButtonSelector);
        console.log('Clicked tweet button');
        
        // Wait for confirmation that tweet was sent
        await page.waitForNavigation({ timeout: 30000 });
        console.log('Tweet navigation completed');
        
        // Extract the tweet URL if possible
        const currentUrl = page.url();
        if (currentUrl.includes('/status/')) {
            console.log(`\n🎉 SUCCESS! Tweet posted successfully!`);
            console.log(`🔗 Tweet URL: ${currentUrl}\n`);
        } else {
            console.log('Tweet appears to have been posted successfully!');
        }
        
        // Take a screenshot for verification
        const screenshotPath = path.join(__dirname, 'twitter-post-result.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot saved to ${screenshotPath}`);
        
        // Close the browser
        await browser.close();
        console.log('Browser closed');
        
        return true;
    } catch (error) {
        console.error('Error posting to Twitter with Puppeteer:', error);
        return false;
    }
}

// Attempt to post directly to Twitter using the Twitter API (additional method)
async function forceTwitterPostWithAPI() {
    console.log('\n========== TRYING DIRECT TWITTER POSTING WITH API ==========');
    
    try {
        // Check if API keys are available
        const apiKey = process.env.TWITTER_API_KEY;
        const apiKeySecret = process.env.TWITTER_API_KEY_SECRET;
        const accessToken = process.env.TWITTER_ACCESS_TOKEN;
        const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
        
        if (!apiKey || !apiKeySecret || !accessToken || !accessTokenSecret) {
            console.log('Twitter API keys not found, skipping API method');
            return false;
        }
        
        // Create client
        const client = new TwitterApi({
            appKey: apiKey,
            appSecret: apiKeySecret,
            accessToken: accessToken,
            accessSecret: accessTokenSecret,
        });
        
        // Get the image as buffer
        const imageBuffer = fs.readFileSync(sampleImagePath);
        console.log(`Read image file, size: ${imageBuffer.length} bytes`);
        
        // Upload the image
        const mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType: 'image/jpeg' });
        console.log(`Image uploaded to Twitter with media ID: ${mediaId}`);
        
        // Post tweet with the image
        const tweetText = `Test image post from Eliza via API at ${new Date().toISOString()}`;
        const tweet = await client.v2.tweet({
            text: tweetText,
            media: { media_ids: [mediaId] }
        });
        
        console.log(`\n🎉 SUCCESS! Tweet posted successfully via API!`);
        console.log(`🔗 Tweet ID: ${tweet.data.id}`);
        console.log(`🔗 Tweet URL: https://twitter.com/user/status/${tweet.data.id}\n`);
        
        return true;
    } catch (error) {
        console.error('Error posting to Twitter with API:', error);
        return false;
    }
}

// Main function to run all posting attempts
async function main() {
    try {
        console.log('========== FORCE TWITTER IMAGE POSTING SCRIPT ==========');
        console.log(`Current directory: ${__dirname}`);
        
        // Check Twitter credentials from .env
        const username = process.env.TWITTER_USERNAME;
        const password = process.env.TWITTER_PASSWORD;
        console.log(`Twitter credentials found: ${!!username && !!password}`);
        
        // Prepare test image
        await createTestImageIfNeeded();
        
        // Try API posting method first (less intrusive)
        const apiSuccess = await forceTwitterPostWithAPI();
        
        // If API method failed, try browser automation
        if (!apiSuccess) {
            console.log('\nAPI method failed, trying browser automation...');
            const puppeteerSuccess = await forceTwitterPostWithPuppeteer();
            
            if (puppeteerSuccess) {
                console.log('\n✅ Successfully posted to Twitter using browser automation!');
            } else {
                console.log('\n❌ Failed to post to Twitter with all methods');
            }
        } else {
            console.log('\n✅ Successfully posted to Twitter using API!');
        }
    } catch (error) {
        console.error('Error in main function:', error);
    }
}

// Run the script
main().catch(console.error);
