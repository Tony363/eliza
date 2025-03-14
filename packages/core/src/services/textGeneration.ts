import { ModelClass, ModelProviderName, ServiceType, type ITextGenerationService, type IAgentRuntime } from "../types";
import { generateObject, generateText } from "../generation";
import { elizaLogger } from "../";

/**
 * Text Generation Service implementation
 * Provides a standardized interface for generating text using various language models
 */
export class TextGenerationService implements ITextGenerationService {
  static get serviceType(): ServiceType {
    return ServiceType.TEXT_GENERATION;
  }
  
  // Instance property to meet interface requirements
  get serviceType(): ServiceType {
    return ServiceType.TEXT_GENERATION;
  }

  // Required by the Service interface
  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;
    elizaLogger.info("TextGenerationService initialized");
    return Promise.resolve();
  }
  
  // Original method - keep for compatibility
  async initializeModel(): Promise<void> {
    // This is just a wrapper service that delegates to the generation functions
    // No initialization required
    elizaLogger.info("TextGenerationService model initialized");
    return Promise.resolve();
  }

  async queueMessageCompletion(
    context: string,
    temperature: number,
    stop: string[],
    frequency_penalty: number,
    presence_penalty: number,
    max_tokens: number
  ): Promise<any> {
    // Implementation of message completion using the chosen model
    try {
      // Use destructuring to access runtime
      const { runtime } = this;
      
      // Return the result directly
      return await generateObject({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
        schemaName: "MessageCompletion",
        schemaDescription: "Message completion response",
      });
    } catch (error) {
      elizaLogger.error("Error in queueMessageCompletion:", error);
      throw error;
    }
  }

  async queueTextCompletion(
    context: string,
    temperature: number,
    stop: string[],
    frequency_penalty: number,
    presence_penalty: number,
    max_tokens: number
  ): Promise<string> {
    // Implementation of text completion using the chosen model
    try {
      // Use destructuring to access runtime and return result directly
      const { runtime } = this;
      
      return await generateText({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
      });
    } catch (error) {
      elizaLogger.error("Error in queueTextCompletion:", error);
      throw error;
    }
  }

  async getEmbeddingResponse(input: string): Promise<number[] | undefined> {
    // Implementation for generating embeddings
    try {
      // This is a placeholder implementation
      // In a real application, you would call the appropriate embedding service
      elizaLogger.debug("Getting embedding for text", { textLength: input.length });
      
      // For now, just return undefined since we don't have actual embedding functionality
      return undefined;
    } catch (error) {
      elizaLogger.error("Error in getEmbeddingResponse:", error);
      return undefined;
    }
  }

  // Store reference to the runtime
  private runtime: IAgentRuntime;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    elizaLogger.info("TextGenerationService created");
  }
}
