// Script to test image generation and Twitter cross-posting

async function testImageGeneration() {
  const agentId = 'b850bc30-45f8-0041-a00a-83df46d8555d'; // From our previous API call
  const url = `http://localhost:3000/${agentId}/message`;
  
  const message = {
    text: "Generate an image of a beautiful sunset over the ocean with vibrant colors. Make sure to post it to Twitter.", 
    userId: "test-user-123",
    roomId: "test-room-456",
    userName: "TestUser"
  };

  console.log('Sending image generation request to Eliza...');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Response received:');
    console.log(JSON.stringify(data, null, 2));
    
    // Check if the response contains any information about image generation or Twitter posting
    const responseText = JSON.stringify(data);
    if (responseText.includes('image') || responseText.includes('generate')) {
      console.log('Image generation appears to be triggered!');
    }
    
    if (responseText.includes('Twitter') || responseText.includes('tweet')) {
      console.log('Twitter posting may have been mentioned in the response.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testImageGeneration();
