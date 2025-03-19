import { elizaLogger, generateImage, stringToUuid } from "@elizaos/core";
import {
    type HandlerCallback,
    type IAgentRuntime,
    type Plugin,
    ServiceType,
    UUID,
} from "@elizaos/core";
import * as fs from "fs";
import * as path from "path";

// Constants for image generation
const DEFAULT_IMAGE_INTERVAL_MIN = 120; // 2 hours minimum
const DEFAULT_IMAGE_INTERVAL_MAX = 240; // 4 hours maximum
const IMAGE_PROMPT_TEMPLATE = `
Create a detailed, vivid, and engaging image description that would work well for an AI image generator.
The description should be sexually suggestive but not explicit, focusing on flirty innuendo rather than explicit content.
Create a scene that hints at sexuality while remaining tasteful and appropriate for social media platforms.
Use descriptive language that creates a clear mental image with details about setting, mood, and composition.
The description should be 2-3 sentences long and focus on a single coherent scene.
`;

/**
 * Schedules periodic image generation and posting to Twitter
 */
export default function createScheduledImagePlugin(): Plugin {
    return {
        name: "twitter-scheduled-images",
        version: "1.0.0",
        description: "Plugin for scheduled image generation and posting to Twitter",
        initialize: async (runtime: IAgentRuntime): Promise<HandlerCallback> => {
            elizaLogger.info("Initializing Twitter scheduled image plugin");
            
            // Create image directory if it doesn't exist
            const imageDir = path.join(process.cwd(), "agent", "generatedImages");
            if (!fs.existsSync(imageDir)) {
                elizaLogger.info(`Creating image directory: ${imageDir}`);
                fs.mkdirSync(imageDir, { recursive: true });
            }
            
            // Start the image generation schedule if enabled
            const enableScheduledImages = runtime.getSetting("ENABLE_SCHEDULED_IMAGES") === "true";
            if (enableScheduledImages) {
                elizaLogger.info("Starting scheduled image generation");
                startImageSchedule(runtime);
            } else {
                elizaLogger.info("Scheduled image generation is disabled");
            }
            
            return async () => {
                // Nothing to do per message
                return null;
            };
        }
    };
}

/**
 * Start the scheduled image generation and posting loop
 */
async function startImageSchedule(runtime: IAgentRuntime) {
    const generateImageLoop = async () => {
        try {
            // Check when the last image was generated
            const lastImagePost = await runtime.cacheManager.get<{
                timestamp: number;
            }>("twitter/scheduled/lastImagePost");
    
            const lastPostTimestamp = lastImagePost?.timestamp ?? 0;
            const minMinutes = parseInt(runtime.getSetting("IMAGE_POST_INTERVAL_MIN") || String(DEFAULT_IMAGE_INTERVAL_MIN));
            const maxMinutes = parseInt(runtime.getSetting("IMAGE_POST_INTERVAL_MAX") || String(DEFAULT_IMAGE_INTERVAL_MAX));
            const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
            const delay = randomMinutes * 60 * 1000;
    
            const now = Date.now();
            if (now > lastPostTimestamp + delay) {
                elizaLogger.info("Generating and posting scheduled image");
                await generateAndPostImage(runtime);
                
                // Update the timestamp after successful generation/posting
                await runtime.cacheManager.set(
                    "twitter/scheduled/lastImagePost",
                    {
                        timestamp: now,
                    }
                );
            }
    
            // Schedule next iteration
            const nextDelay = randomMinutes * 60 * 1000;
            setTimeout(() => {
                generateImageLoop();
            }, nextDelay);
    
            elizaLogger.info(`Next image generation scheduled in ${randomMinutes} minutes`);
        } catch (error) {
            elizaLogger.error("Error in image generation loop:", error);
            // Retry after 15 minutes
            setTimeout(() => {
                generateImageLoop();
            }, 15 * 60 * 1000);
        }
    };

    // Start the loop
    generateImageLoop();
}

/**
 * Generate an image and post it to Twitter
 */
async function generateAndPostImage(runtime: IAgentRuntime) {
    try {
        // Generate an image prompt
        const imagePrompt = await generateImagePrompt(runtime);
        elizaLogger.info(`Generated image prompt: ${imagePrompt.substring(0, 100)}...`);
        
        // Generate the image
        const imageResult = await generateImage(
            {
                prompt: imagePrompt,
                width: 1024,
                height: 1024,
                count: 1
            },
            runtime
        );
        
        if (!imageResult.success || !imageResult.data || imageResult.data.length === 0) {
            elizaLogger.error(`Failed to generate image: ${imageResult.error || "Unknown error"}`);
            return;
        }
        
        // Save the image locally
        const imageUrl = imageResult.data[0];
        const timestamp = Date.now();
        const filename = `scheduled_image_${timestamp}`;
        const localPath = await saveImageLocally(imageUrl, filename);
        
        // Post to Twitter
        await postImageToTwitter(runtime, imagePrompt, localPath, imageUrl);
        
    } catch (error) {
        elizaLogger.error("Error generating and posting image:", error);
    }
}

/**
 * Generate a prompt for image generation
 */
async function generateImagePrompt(runtime: IAgentRuntime) {
    const textGenerationService = runtime.getService(ServiceType.TEXT_GENERATION);
    if (textGenerationService) {
        const response = await (textGenerationService as any).generateText({
            context: IMAGE_PROMPT_TEMPLATE,
            temperature: 0.8,
            max_tokens: 200
        });
        return response.trim();
    } else {
        // Fallback to direct prompt if service not available
        return "A suggestive but tasteful silhouette of a woman in a doorway, backlit with golden light, creating a mysterious and alluring atmosphere. The composition has a film noir quality with dramatic shadows and a sense of anticipation.";
    }
}

/**
 * Save an image locally from a URL or base64 data
 */
async function saveImageLocally(imageData: string, filename: string): Promise<string> {
    // Create directory if it doesn't exist
    const imageDir = path.join(process.cwd(), "agent", "generatedImages");
    if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
    }
    
    const filepath = path.join(imageDir, `${filename}.png`);
    
    // Check if it's a URL or base64 data
    if (imageData.startsWith('http')) {
        // It's a URL, fetch the image
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(imageData);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(filepath, imageBuffer);
    } else {
        // It's base64 data
        const base64Image = imageData.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Image, "base64");
        fs.writeFileSync(filepath, imageBuffer);
    }
    
    elizaLogger.info(`Image saved to: ${filepath}`);
    return filepath;
}

/**
 * Post an image to Twitter
 */
async function postImageToTwitter(runtime: IAgentRuntime, caption: string, imagePath: string, imageUrl: string) {
    try {
        elizaLogger.info("Attempting to post image to Twitter");
        
        // Check if Twitter posting is enabled
        const twitterEnabled = runtime.getSetting("TWITTER_USERNAME") && 
                              runtime.getSetting("ENABLE_IMAGE_POSTING") !== "false";
        
        if (!twitterEnabled) {
            elizaLogger.info("Twitter posting is disabled");
            return;
        }
        
        // Make sure the image file exists
        if (!fs.existsSync(imagePath)) {
            elizaLogger.error(`Image file not found: ${imagePath}`);
            return;
        }
        
        // Create a roomId for this operation
        const roomId = stringToUuid(`twitter-image-${Date.now()}`);
        
        // Try to find Twitter client
        // First try all services
        const services = (runtime as any).getAllServices?.() || [];
        let twitterClient;
        
        for (const service of services) {
            if ((service.name && service.name.toLowerCase().includes('twitter')) || 
                (service.type && service.type.toLowerCase().includes('twitter'))) {
                twitterClient = service;
                break;
            }
        }
        
        // If not found in services, try clients
        if (!twitterClient) {
            const clients = (runtime as any).clients || [];
            for (const client of clients) {
                if ((client.name && client.name.toLowerCase().includes('twitter')) || 
                    (client.type && client.type.toLowerCase().includes('twitter'))) {
                    twitterClient = client;
                    break;
                }
            }
        }
        
        // If client found, use it to post
        if (twitterClient) {
            elizaLogger.info("Using Twitter client to post image");
            
            // Truncate caption if needed
            const maxCaptionLength = 200;
            let tweetText = caption;
            if (tweetText.length > maxCaptionLength) {
                tweetText = tweetText.substring(0, maxCaptionLength - 3) + "...";
            }
            
            // Add hashtag
            tweetText += " #ElizaAI";
            
            // Read the image
            const mediaBuffer = fs.readFileSync(imagePath);
            const mediaData = [{
                data: mediaBuffer,
                mediaType: 'image/png'
            }];
            
            // Different posting methods based on client structure
            if (twitterClient.postTweet) {
                await twitterClient.postTweet(
                    runtime,
                    twitterClient,
                    tweetText,
                    roomId,
                    caption, // Original caption as raw content
                    (twitterClient.twitterUsername || runtime.getSetting("TWITTER_USERNAME")),
                    mediaData
                );
            } else if (twitterClient.client && twitterClient.client.postTweet) {
                await twitterClient.client.postTweet(
                    runtime,
                    twitterClient.client,
                    tweetText,
                    roomId,
                    caption,
                    (twitterClient.client.twitterUsername || runtime.getSetting("TWITTER_USERNAME")),
                    mediaData
                );
            } else {
                elizaLogger.error("Twitter client doesn't have postTweet method");
            }
        } else {
            // Direct posting fallback
            elizaLogger.info("No Twitter client found, using direct posting");
            
            // Get Twitter credentials
            const username = runtime.getSetting('TWITTER_USERNAME');
            const password = runtime.getSetting('TWITTER_PASSWORD');
            const email = runtime.getSetting('TWITTER_EMAIL');
            const twitter2faSecret = runtime.getSetting('TWITTER_2FA_SECRET');
            
            if (!username || !password) {
                elizaLogger.error("Twitter credentials not configured");
                return;
            }
            
            // Use the Scraper directly
            const { Scraper } = require('agent-twitter-client');
            const scraper = new Scraper();
            
            // Login
            await scraper.login(username, password, email, twitter2faSecret);
            if (!(await scraper.isLoggedIn())) {
                elizaLogger.error("Failed to login to Twitter");
                return;
            }
            
            // Truncate caption if needed
            const maxCaptionLength = 200;
            let tweetText = caption;
            if (tweetText.length > maxCaptionLength) {
                tweetText = tweetText.substring(0, maxCaptionLength - 3) + "...";
            }
            
            // Add hashtag
            tweetText += " #ElizaAI";
            
            // Read the image
            const mediaBuffer = fs.readFileSync(imagePath);
            
            // Post tweet with media
            const media = [{
                type: 'photo',
                data: mediaBuffer,
                altText: caption.substring(0, 50)
            }];
            
            const tweetResult = await scraper.sendTweet(tweetText, media);
            
            if (tweetResult) {
                elizaLogger.info("Successfully posted tweet with image directly");
            } else {
                elizaLogger.error("Failed to post tweet directly");
            }
        }
    } catch (error) {
        elizaLogger.error("Error posting image to Twitter:", error);
    }
}
