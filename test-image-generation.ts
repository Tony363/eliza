// Test script for image generation
import { generateImage } from './packages/core/src/generation';
import { ModelProviderName } from './packages/core/src/model';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Mock runtime for testing
const mockRuntime = {
  imageModelProvider: ModelProviderName.OPENAI, // Setting this to OPENAI to verify it still uses RenderNet
  getSetting: (key: string) => {
    if (key === 'RENDERNET_API_KEY') {
      return process.env.RENDERNET_API_KEY || 'test-key';
    }
    return null;
  },
  getService: () => null
};

async function testImageGeneration() {
  console.log('Testing image generation with mock runtime...');
  console.log('Using imageModelProvider:', mockRuntime.imageModelProvider);
  
  try {
    const result = await generateImage({
      prompt: 'A test image of a sunset over mountains',
      width: 512,
      height: 512,
    }, mockRuntime as any);
    
    console.log('Image generation result:', result);
  } catch (error) {
    console.error('Error generating image:', error);
  }
}

testImageGeneration();
