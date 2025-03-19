// Test script for image generation
const { generateImage } = require('./packages/core/dist/generation.js');
const { IAgentRuntime } = require('./packages/core/dist/runtime.js');
const { ModelProviderName } = require('./packages/core/dist/model.js');

// Mock runtime for testing
const mockRuntime = {
  imageModelProvider: ModelProviderName.OPENAI, // Setting this to OPENAI to verify it still uses RenderNet
  getSetting: (key) => {
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
    }, mockRuntime);
    
    console.log('Image generation result:', result);
  } catch (error) {
    console.error('Error generating image:', error);
  }
}

testImageGeneration();
