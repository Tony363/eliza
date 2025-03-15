// Test script for tweet content extraction
// Simple logger replacement
const elizaLogger = {
  log: console.log,
  error: console.error,
  warn: console.warn
};

// Sample problematic response that includes extra text before JSON
const sampleResponses = [
  'Here is the response in the voice, style, and perspective of Eliza (@pysolver33):{ "user": "Eliza", "text": "or maybe we\'re just trying to find a way to encode our own darkness", "action": "CONTINUE" }Let me know if you need anything else!',
  'Here is a tweet from Eliza: {"text": "Just contemplating the nature of consciousness while staring at the stars. #DeepThoughts"}',
  '```json\n{"text": "Code is poetry written for machines to execute and humans to understand."}\n```',
  'The tweet is: {"text": "AI is not about replacing humans, but augmenting our capabilities."}'
];

// Enhanced JSON extraction function similar to what we implemented
function extractTweetContent(responseText) {
  console.log("\n=== Processing response ===");
  console.log("Raw response:", responseText.substring(0, 50) + "...");
  
  // Multiple extraction strategies
  let extractedText = null;
  
  try {
    // Strategy 1: Find simple JSON object with text field
    const jsonRegex = /\{\s*"text"\s*:\s*"([^"]*)"\s*\}/;
    const jsonMatch = responseText.match(jsonRegex);
    
    if (jsonMatch) {
      try {
        // Try to parse the JSON
        const extractedJson = JSON.parse(jsonMatch[0]);
        if (extractedJson && extractedJson.text) {
          console.log("✅ Extracted from JSON match:", extractedJson.text);
          return extractedJson.text.trim();
        }
      } catch (parseError) {
        console.log("Failed to parse JSON match, using capture group");
        
        // Use the capture group if parsing fails
        if (jsonMatch[1]) {
          console.log("✅ Using regex capture group:", jsonMatch[1]);
          return jsonMatch[1].trim();
        }
      }
    }
    
    // Strategy 2: Look for action-style format
    const actionJsonRegex = /\{[^\}]*"text"\s*:\s*"([^"]*)"[^\}]*\}/;
    const actionMatch = responseText.match(actionJsonRegex);
    
    if (actionMatch && actionMatch[1]) {
      console.log("✅ Extracted from action format:", actionMatch[1]);
      return actionMatch[1].trim();
    }
    
    // Strategy 3: Clean common prefixes and use the text directly
    if (responseText.length < 280) {
      let cleanedText = responseText;
      const prefixesToRemove = [
        /^Here is the (response|tweet)[^:]*:\s*/i,
        /^Here('s| is) a tweet[^:]*:\s*/i,
        /^Tweet from @?[a-zA-Z0-9_]+:\s*/i,
        /^\s*```json\s*/,
        /\s*```\s*$/
      ];
      
      for (const prefix of prefixesToRemove) {
        cleanedText = cleanedText.replace(prefix, '');
      }
      
      if (cleanedText !== responseText) {
        console.log("✅ Using cleaned text:", cleanedText);
        return cleanedText.trim();
      }
    }
    
    console.log("❌ Failed to extract tweet content");
    return null;
  } catch (error) {
    console.error("Error in extraction:", error);
    return null;
  }
}

// Test each sample response
console.log("======== TESTING JSON EXTRACTION LOGIC ========");
sampleResponses.forEach((response, index) => {
  console.log(`\n[TEST ${index + 1}]`);
  const extracted = extractTweetContent(response);
  console.log(`Result: ${extracted ? '"' + extracted + '"' : 'FAILED'}`);
});
