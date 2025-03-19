import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { bedrock } from "@ai-sdk/amazon-bedrock";
import {
    generateObject as aiGenerateObject,
    generateText as aiGenerateText,
    type CoreTool,
    type GenerateObjectResult,
    type StepResult as AIStepResult,
} from "ai";
import { Buffer } from "buffer";
import { createOllama } from "ollama-ai-provider";
import OpenAI from "openai";
import { encodingForModel, type TiktokenModel } from "js-tiktoken";
// import { AutoTokenizer } from "@huggingface/transformers";
import Together from "together-ai";
import type { ZodSchema } from "zod";
import { elizaLogger } from "./index.ts";
import {
    models,
    getModelSettings,
    getImageModelSettings,
    getEndpoint,
} from "./models.ts";
import {
    parseBooleanFromText,
    parseJsonArrayFromText,
    parseJSONObjectFromText,
    parseShouldRespondFromText,
    parseActionResponseFromText,
} from "./parsing.ts";
import settings from "./settings.ts";
import {
    type Content,
    type IAgentRuntime,
    type IImageDescriptionService,
    type ITextGenerationService,
    ModelClass,
    ModelProviderName,
    ServiceType,
    type ActionResponse,
    // type IVerifiableInferenceAdapter,
    // type VerifiableInferenceOptions,
    // type VerifiableInferenceResult,
    //VerifiableInferenceProvider,
    type TelemetrySettings,
    TokenizerType,
} from "./types.ts";
import { fal } from "@fal-ai/client";

import BigNumber from "bignumber.js";
import { createPublicClient, http } from "viem";
import fs from "fs";
import os from "os";
import path from "path";

type Tool = CoreTool<any, any>;
type StepResult = AIStepResult<any>;

/**
 * Trims the provided text context to a specified token limit using a tokenizer model and type.
 *
 * The function dynamically determines the truncation method based on the tokenizer settings
 * provided by the runtime. If no tokenizer settings are defined, it defaults to using the
 * TikToken truncation method with the "gpt-4o" model.
 *
 * @async
 * @function trimTokens
 * @param {string} context - The text to be tokenized and trimmed.
 * @param {number} maxTokens - The maximum number of tokens allowed after truncation.
 * @param {IAgentRuntime} runtime - The runtime interface providing tokenizer settings.
 *
 * @returns {Promise<string>} A promise that resolves to the trimmed text.
 *
 * @throws {Error} Throws an error if the runtime settings are invalid or missing required fields.
 *
 * @example
 * const trimmedText = await trimTokens("This is an example text", 50, runtime);
 * console.log(trimmedText); // Output will be a truncated version of the input text.
 */
export async function trimTokens(
    context: string,
    maxTokens: number,
    runtime: IAgentRuntime
) {
    if (!context) return "";
    if (maxTokens <= 0) throw new Error("maxTokens must be positive");

    const tokenizerModel = runtime.getSetting("TOKENIZER_MODEL");
    const tokenizerType = runtime.getSetting("TOKENIZER_TYPE");

    if (!tokenizerModel || !tokenizerType) {
        // Default to TikToken truncation using the "gpt-4o" model if tokenizer settings are not defined
        return truncateTiktoken("gpt-4o", context, maxTokens);
    }

    // Choose the truncation method based on tokenizer type
    // if (tokenizerType === TokenizerType.Auto) {
    //     return truncateAuto(tokenizerModel, context, maxTokens);
    // }

    if (tokenizerType === TokenizerType.TikToken) {
        return truncateTiktoken(
            tokenizerModel as TiktokenModel,
            context,
            maxTokens
        );
    }

    elizaLogger.warn(`Unsupported tokenizer type: ${tokenizerType}`);
    return truncateTiktoken("gpt-4o", context, maxTokens);
}

// async function truncateAuto(
//     modelPath: string,
//     context: string,
//     maxTokens: number
// ) {
//     try {
//         const tokenizer = await AutoTokenizer.from_pretrained(modelPath);
//         const tokens = tokenizer.encode(context);

//         // If already within limits, return unchanged
//         if (tokens.length <= maxTokens) {
//             return context;
//         }

//         // Keep the most recent tokens by slicing from the end
//         const truncatedTokens = tokens.slice(-maxTokens);

//         // Decode back to text - js-tiktoken decode() returns a string directly
//         return tokenizer.decode(truncatedTokens);
//     } catch (error) {
//         elizaLogger.error("Error in trimTokens:", error);
//         // Return truncated string if tokenization fails
//         return context.slice(-maxTokens * 4); // Rough estimate of 4 chars per token
//     }
// }

async function truncateTiktoken(
    model: TiktokenModel,
    context: string,
    maxTokens: number
) {
    try {
        const encoding = encodingForModel(model);

        // Encode the text into tokens
        const tokens = encoding.encode(context);

        // If already within limits, return unchanged
        if (tokens.length <= maxTokens) {
            return context;
        }

        // Keep the most recent tokens by slicing from the end
        const truncatedTokens = tokens.slice(-maxTokens);

        // Decode back to text - js-tiktoken decode() returns a string directly
        return encoding.decode(truncatedTokens);
    } catch (error) {
        elizaLogger.error("Error in trimTokens:", error);
        // Return truncated string if tokenization fails
        return context.slice(-maxTokens * 4); // Rough estimate of 4 chars per token
    }
}

/**
 * Get OnChain EternalAI System Prompt
 * @returns System Prompt
 */
async function getOnChainEternalAISystemPrompt(
    runtime: IAgentRuntime
): Promise<string> | undefined {
    const agentId = runtime.getSetting("ETERNALAI_AGENT_ID");
    const providerUrl = runtime.getSetting("ETERNALAI_RPC_URL");
    const contractAddress = runtime.getSetting(
        "ETERNALAI_AGENT_CONTRACT_ADDRESS"
    );
    if (agentId && providerUrl && contractAddress) {
        // get on-chain system-prompt
        const contractABI = [
            {
                inputs: [
                    {
                        internalType: "uint256",
                        name: "_agentId",
                        type: "uint256",
                    },
                ],
                name: "getAgentSystemPrompt",
                outputs: [
                    { internalType: "bytes[]", name: "", type: "bytes[]" },
                ],
                stateMutability: "view",
                type: "function",
            },
        ];

        const publicClient = createPublicClient({
            transport: http(providerUrl),
        });

        try {
            const validAddress: `0x${string}` =
                contractAddress as `0x${string}`;
            const result = await publicClient.readContract({
                address: validAddress,
                abi: contractABI,
                functionName: "getAgentSystemPrompt",
                args: [new BigNumber(agentId)],
            });
            if (result) {
                elizaLogger.info("on-chain system-prompt response", result[0]);
                const value = result[0].toString().replace("0x", "");
                const content = Buffer.from(value, "hex").toString("utf-8");
                elizaLogger.info("on-chain system-prompt", content);
                return await fetchEternalAISystemPrompt(runtime, content);
            } else {
                return undefined;
            }
        } catch (error) {
            elizaLogger.error(error);
            elizaLogger.error("err", error);
        }
    }
    return undefined;
}

/**
 * Fetch EternalAI System Prompt
 * @returns System Prompt
 */
async function fetchEternalAISystemPrompt(
    runtime: IAgentRuntime,
    content: string
): Promise<string> | undefined {
    const IPFS = "ipfs://";
    const containsSubstring: boolean = content.includes(IPFS);
    if (containsSubstring) {
        const lightHouse = content.replace(
            IPFS,
            "https://gateway.lighthouse.storage/ipfs/"
        );
        elizaLogger.info("fetch lightHouse", lightHouse);
        const responseLH = await fetch(lightHouse, {
            method: "GET",
        });
        elizaLogger.info("fetch lightHouse resp", responseLH);
        if (responseLH.ok) {
            const data = await responseLH.text();
            return data;
        } else {
            const gcs = content.replace(
                IPFS,
                "https://cdn.eternalai.org/upload/"
            );
            elizaLogger.info("fetch gcs", gcs);
            const responseGCS = await fetch(gcs, {
                method: "GET",
            });
            elizaLogger.info("fetch lightHouse gcs", responseGCS);
            if (responseGCS.ok) {
                const data = await responseGCS.text();
                return data;
            } else {
                throw new Error("invalid on-chain system prompt");
            }
        }
    } else {
        return content;
    }
}

/**
 * Gets the Cloudflare Gateway base URL for a specific provider if enabled
 * @param runtime The runtime environment
 * @param provider The model provider name
 * @returns The Cloudflare Gateway base URL if enabled, undefined otherwise
 */
function getCloudflareGatewayBaseURL(
    runtime: IAgentRuntime,
    provider: string
): string | undefined {
    const isCloudflareEnabled =
        runtime.getSetting("CLOUDFLARE_GW_ENABLED") === "true";
    const cloudflareAccountId = runtime.getSetting("CLOUDFLARE_AI_ACCOUNT_ID");
    const cloudflareGatewayId = runtime.getSetting("CLOUDFLARE_AI_GATEWAY_ID");

    elizaLogger.debug("Cloudflare Gateway Configuration:", {
        isEnabled: isCloudflareEnabled,
        hasAccountId: !!cloudflareAccountId,
        hasGatewayId: !!cloudflareGatewayId,
        provider: provider,
    });

    if (!isCloudflareEnabled) {
        elizaLogger.debug("Cloudflare Gateway is not enabled");
        return undefined;
    }

    if (!cloudflareAccountId) {
        elizaLogger.warn(
            "Cloudflare Gateway is enabled but CLOUDFLARE_AI_ACCOUNT_ID is not set"
        );
        return undefined;
    }

    if (!cloudflareGatewayId) {
        elizaLogger.warn(
            "Cloudflare Gateway is enabled but CLOUDFLARE_AI_GATEWAY_ID is not set"
        );
        return undefined;
    }

    const baseURL = `https://gateway.ai.cloudflare.com/v1/${cloudflareAccountId}/${cloudflareGatewayId}/${provider.toLowerCase()}`;
    elizaLogger.info("Using Cloudflare Gateway:", {
        provider,
        baseURL,
        accountId: cloudflareAccountId,
        gatewayId: cloudflareGatewayId,
    });

    return baseURL;
}

/**
 * Send a message to the model for a text generateText - receive a string back and parse how you'd like
 * @param opts - The options for the generateText request.
 * @param opts.context The context of the message to be completed.
 * @param opts.stop A list of strings to stop the generateText at.
 * @param opts.model The model to use for generateText.
 * @param opts.frequency_penalty The frequency penalty to apply to the generateText.
 * @param opts.presence_penalty The presence penalty to apply to the generateText.
 * @param opts.temperature The temperature to apply to the generateText.
 * @param opts.max_context_length The maximum length of the context to apply to the generateText.
 * @returns The completed message.
 */

export async function generateText({
    runtime,
    context,
    modelClass,
    tools = {},
    onStepFinish,
    maxSteps = 1,
    stop,
    customSystemPrompt,
    // verifiableInference = process.env.VERIFIABLE_INFERENCE_ENABLED === "true",
    // verifiableInferenceOptions,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
    tools?: Record<string, Tool>;
    onStepFinish?: (event: StepResult) => Promise<void> | void;
    maxSteps?: number;
    stop?: string[];
    customSystemPrompt?: string;
    // verifiableInference?: boolean;
    // verifiableInferenceAdapter?: IVerifiableInferenceAdapter;
    // verifiableInferenceOptions?: VerifiableInferenceOptions;
}): Promise<string> {
    if (!context) {
        console.error("generateText context is empty");
        return "";
    }

    elizaLogger.log("Generating text...");

    elizaLogger.info("Generating text with options:", {
        modelProvider: runtime.modelProvider,
        model: modelClass,
        // verifiableInference,
    });
    elizaLogger.log("Using provider:", runtime.modelProvider);
    // If verifiable inference is requested and adapter is provided, use it
    // if (verifiableInference && runtime.verifiableInferenceAdapter) {
    //     elizaLogger.log(
    //         "Using verifiable inference adapter:",
    //         runtime.verifiableInferenceAdapter
    //     );
    //     try {
    //         const result: VerifiableInferenceResult =
    //             await runtime.verifiableInferenceAdapter.generateText(
    //                 context,
    //                 modelClass,
    //                 verifiableInferenceOptions
    //             );
    //         elizaLogger.log("Verifiable inference result:", result);
    //         // Verify the proof
    //         const isValid =
    //             await runtime.verifiableInferenceAdapter.verifyProof(result);
    //         if (!isValid) {
    //             throw new Error("Failed to verify inference proof");
    //         }

    //         return result.text;
    //     } catch (error) {
    //         elizaLogger.error("Error in verifiable inference:", error);
    //         throw error;
    //     }
    // }

    const provider = runtime.modelProvider;
    elizaLogger.debug("Provider settings:", {
        provider,
        hasRuntime: !!runtime,
        runtimeSettings: {
            CLOUDFLARE_GW_ENABLED: runtime.getSetting("CLOUDFLARE_GW_ENABLED"),
            CLOUDFLARE_AI_ACCOUNT_ID: runtime.getSetting(
                "CLOUDFLARE_AI_ACCOUNT_ID"
            ),
            CLOUDFLARE_AI_GATEWAY_ID: runtime.getSetting(
                "CLOUDFLARE_AI_GATEWAY_ID"
            ),
        },
    });

    const endpoint =
        runtime.character.modelEndpointOverride || getEndpoint(provider);
    const modelSettings = getModelSettings(runtime.modelProvider, modelClass);
    let model = modelSettings.name;

    // allow character.json settings => secrets to override models
    // FIXME: add MODEL_MEDIUM support
    switch (provider) {
        // if runtime.getSetting("LLAMACLOUD_MODEL_LARGE") is true and modelProvider is LLAMACLOUD, then use the large model
        case ModelProviderName.LLAMACLOUD:
            {
                switch (modelClass) {
                    case ModelClass.LARGE:
                        {
                            model =
                                runtime.getSetting("LLAMACLOUD_MODEL_LARGE") ||
                                model;
                        }
                        break;
                    case ModelClass.SMALL:
                        {
                            model =
                                runtime.getSetting("LLAMACLOUD_MODEL_SMALL") ||
                                model;
                        }
                        break;
                }
            }
            break;
        case ModelProviderName.TOGETHER:
            {
                switch (modelClass) {
                    case ModelClass.LARGE:
                        {
                            model =
                                runtime.getSetting("TOGETHER_MODEL_LARGE") ||
                                model;
                        }
                        break;
                    case ModelClass.SMALL:
                        {
                            model =
                                runtime.getSetting("TOGETHER_MODEL_SMALL") ||
                                model;
                        }
                        break;
                }
            }
            break;
        case ModelProviderName.OPENROUTER:
            {
                switch (modelClass) {
                    case ModelClass.LARGE:
                        {
                            model =
                                runtime.getSetting("LARGE_OPENROUTER_MODEL") ||
                                model;
                        }
                        break;
                    case ModelClass.SMALL:
                        {
                            model =
                                runtime.getSetting("SMALL_OPENROUTER_MODEL") ||
                                model;
                        }
                        break;
                }
            }
            break;
    }

    elizaLogger.info("Selected model:", model);

    const modelConfiguration = runtime.character?.settings?.modelConfig;
    const temperature =
        modelConfiguration?.temperature || modelSettings.temperature;
    const frequency_penalty =
        modelConfiguration?.frequency_penalty ||
        modelSettings.frequency_penalty;
    const presence_penalty =
        modelConfiguration?.presence_penalty || modelSettings.presence_penalty;
    const max_context_length =
        modelConfiguration?.maxInputTokens || modelSettings.maxInputTokens;
    const max_response_length =
        modelConfiguration?.maxOutputTokens ||
        modelSettings.maxOutputTokens;
    const experimental_telemetry =
        modelConfiguration?.experimental_telemetry ||
        modelSettings.experimental_telemetry;

    const apiKey = runtime.token;

    try {
        elizaLogger.debug(
            `Trimming context to max length of ${max_context_length} tokens.`
        );

        context = await trimTokens(context, max_context_length, runtime);

        let response: string;

        const _stop = stop || modelSettings.stop;
        elizaLogger.debug(
            `Using provider: ${provider}, model: ${model}, temperature: ${temperature}, max response length: ${max_response_length}`
        );

        switch (provider) {
            // OPENAI & LLAMACLOUD shared same structure.
            case ModelProviderName.OPENAI:
            case ModelProviderName.ALI_BAILIAN:
            case ModelProviderName.VOLENGINE:
            case ModelProviderName.LLAMACLOUD:
            case ModelProviderName.NANOGPT:
            case ModelProviderName.HYPERBOLIC:
            case ModelProviderName.TOGETHER:
            case ModelProviderName.NINETEEN_AI:
            case ModelProviderName.AKASH_CHAT_API:
            case ModelProviderName.LMSTUDIO:
            case ModelProviderName.NEARAI: {
                elizaLogger.debug(
                    "Initializing OpenAI model with Cloudflare check"
                );
                const baseURL =
                    getCloudflareGatewayBaseURL(runtime, "openai") || endpoint;

                //elizaLogger.debug("OpenAI baseURL result:", { baseURL });
                const openai = createOpenAI({
                    apiKey,
                    baseURL,
                    fetch: runtime.fetch,
                });

                const { text: openaiResponse } = await aiGenerateText({
                    model: openai.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = openaiResponse;
                console.log("Received response from OpenAI model.");
                break;
            }

            case ModelProviderName.ETERNALAI: {
                elizaLogger.debug("Initializing EternalAI model.");
                const openai = createOpenAI({
                    apiKey,
                    baseURL: endpoint,
                    fetch: async (
                        input: RequestInfo | URL,
                        init?: RequestInit
                    ): Promise<Response> => {
                        const url =
                            typeof input === "string"
                                ? input
                                : input.toString();
                        const chain_id =
                            runtime.getSetting("ETERNALAI_CHAIN_ID") || "45762";

                        const options: RequestInit = { ...init };
                        if (options?.body) {
                            const body = JSON.parse(options.body as string);
                            body.chain_id = chain_id;
                            options.body = JSON.stringify(body);
                        }

                        const fetching = await runtime.fetch(url, options);

                        if (
                            parseBooleanFromText(
                                runtime.getSetting("ETERNALAI_LOG")
                            )
                        ) {
                            elizaLogger.info(
                                "Request data: ",
                                JSON.stringify(options, null, 2)
                            );
                            const clonedResponse = fetching.clone();
                            try {
                                clonedResponse.json().then((data) => {
                                    elizaLogger.info(
                                        "Response data: ",
                                        JSON.stringify(data, null, 2)
                                    );
                                });
                            } catch (e) {
                                elizaLogger.debug(e);
                            }
                        }
                        return fetching;
                    },
                });

                let system_prompt =
                    runtime.character.system ??
                    settings.SYSTEM_PROMPT ??
                    undefined;
                try {
                    const on_chain_system_prompt =
                        await getOnChainEternalAISystemPrompt(runtime);
                    if (!on_chain_system_prompt) {
                        elizaLogger.error(
                            new Error("invalid on_chain_system_prompt")
                        );
                    } else {
                        system_prompt = on_chain_system_prompt;
                        elizaLogger.info(
                            "new on-chain system prompt",
                            system_prompt
                        );
                    }
                } catch (e) {
                    elizaLogger.error(e);
                }

                const { text: openaiResponse } = await aiGenerateText({
                    model: openai.languageModel(model),
                    prompt: context,
                    system: system_prompt,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                });

                response = openaiResponse;
                elizaLogger.debug("Received response from EternalAI model.");
                break;
            }

            case ModelProviderName.GOOGLE: {
                const google = createGoogleGenerativeAI({
                    apiKey,
                    fetch: runtime.fetch,
                });

                const { text: googleResponse } = await aiGenerateText({
                    model: google(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = googleResponse;
                elizaLogger.debug("Received response from Google model.");
                break;
            }

            case ModelProviderName.MISTRAL: {
                const mistral = createMistral();

                const { text: mistralResponse } = await aiGenerateText({
                    model: mistral(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                });

                response = mistralResponse;
                elizaLogger.debug("Received response from Mistral model.");
                break;
            }

            case ModelProviderName.ANTHROPIC: {
                elizaLogger.debug(
                    "Initializing Anthropic model with Cloudflare check"
                );
                const baseURL =
                    getCloudflareGatewayBaseURL(runtime, "anthropic") ||
                    "https://api.anthropic.com/v1";
                elizaLogger.debug("Anthropic baseURL result:", { baseURL });

                const anthropic = createAnthropic({
                    apiKey,
                    baseURL,
                    fetch: runtime.fetch,
                });
                const { text: anthropicResponse } = await aiGenerateText({
                    model: anthropic.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = anthropicResponse;
                elizaLogger.debug("Received response from Anthropic model.");
                break;
            }

            case ModelProviderName.CLAUDE_VERTEX: {
                elizaLogger.debug("Initializing Claude Vertex model.");

                const anthropic = createAnthropic({
                    apiKey,
                    fetch: runtime.fetch,
                });

                const { text: anthropicResponse } = await aiGenerateText({
                    model: anthropic.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = anthropicResponse;
                elizaLogger.debug(
                    "Received response from Claude Vertex model."
                );
                break;
            }

            case ModelProviderName.GROK: {
                elizaLogger.debug("Initializing Grok model.");
                const grok = createOpenAI({
                    apiKey,
                    baseURL: endpoint,
                    fetch: runtime.fetch,
                });

                const { text: grokResponse } = await aiGenerateText({
                    model: grok.languageModel(model, {
                        parallelToolCalls: false,
                    }),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = grokResponse;
                elizaLogger.debug("Received response from Grok model.");
                break;
            }

            case ModelProviderName.GROQ: {
                elizaLogger.debug(
                    "Initializing Groq model with Cloudflare check"
                );
                const baseURL = getCloudflareGatewayBaseURL(runtime, "groq");
                elizaLogger.debug("Groq baseURL result:", { baseURL });
                const groq = createGroq({
                    apiKey,
                    fetch: runtime.fetch,
                    baseURL,
                });

                const { text: groqResponse } = await aiGenerateText({
                    model: groq.languageModel(model),
                    prompt: context,
                    temperature,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools,
                    onStepFinish: onStepFinish,
                    maxSteps,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry,
                });

                response = groqResponse;
                elizaLogger.debug("Received response from Groq model.");
                break;
            }

            case ModelProviderName.LLAMALOCAL: {
                elizaLogger.debug(
                    "Using local Llama model for text completion."
                );
                const textGenerationService =
                    runtime.getService<ITextGenerationService>(
                        ServiceType.TEXT_GENERATION
                    );

                if (!textGenerationService) {
                    throw new Error("Text generation service not found");
                }

                response = await textGenerationService.queueTextCompletion(
                    context,
                    temperature,
                    _stop,
                    frequency_penalty,
                    presence_penalty,
                    max_response_length
                );
                elizaLogger.debug("Received response from local Llama model.");
                break;
            }

            case ModelProviderName.REDPILL: {
                elizaLogger.debug("Initializing RedPill model.");
                const serverUrl = getEndpoint(provider);
                const openai = createOpenAI({
                    apiKey,
                    baseURL: serverUrl,
                    fetch: runtime.fetch,
                });

                const { text: redpillResponse } = await aiGenerateText({
                    model: openai.languageModel(model),
                    prompt: context,
                    temperature: temperature,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = redpillResponse;
                elizaLogger.debug("Received response from redpill model.");
                break;
            }

            case ModelProviderName.OPENROUTER: {
                elizaLogger.debug("Initializing OpenRouter model.");
                const serverUrl = getEndpoint(provider);
                const openrouter = createOpenAI({
                    apiKey,
                    baseURL: serverUrl,
                    fetch: runtime.fetch,
                });

                const { text: openrouterResponse } = await aiGenerateText({
                    model: openrouter.languageModel(model),
                    prompt: context,
                    temperature: temperature,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = openrouterResponse;
                elizaLogger.debug("Received response from OpenRouter model.");
                break;
            }

            case ModelProviderName.OLLAMA:
                {
                    elizaLogger.debug("Initializing Ollama model.");

                    const ollamaProvider = createOllama({
                        baseURL: getEndpoint(provider) + "/api",
                        fetch: runtime.fetch,
                    });
                    const ollama = ollamaProvider(model);

                    elizaLogger.debug("****** MODEL\n", model);

                    const { text: ollamaResponse } = await aiGenerateText({
                        model: ollama,
                        prompt: context,
                        tools: tools,
                        onStepFinish: onStepFinish,
                        temperature: temperature,
                        maxSteps: maxSteps,
                        maxTokens: max_response_length,
                        frequencyPenalty: frequency_penalty,
                        presencePenalty: presence_penalty,
                        experimental_telemetry: experimental_telemetry,
                    });

                    response = ollamaResponse.replace(/<think>[\s\S]*?<\/think>\s*\n*/g, '');
                }
                elizaLogger.debug("Received response from Ollama model.");
                break;

            case ModelProviderName.HEURIST: {
                elizaLogger.debug("Initializing Heurist model.");
                const heurist = createOpenAI({
                    apiKey: apiKey,
                    baseURL: endpoint,
                    fetch: runtime.fetch,
                });

                const { text: heuristResponse } = await aiGenerateText({
                    model: heurist.languageModel(model),
                    prompt: context,
                    system:
                        customSystemPrompt ??
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    maxSteps: maxSteps,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = heuristResponse;
                elizaLogger.debug("Received response from Heurist model.");
                break;
            }
            case ModelProviderName.GAIANET: {
                elizaLogger.debug("Initializing GAIANET model.");

                var baseURL = getEndpoint(provider);
                if (!baseURL) {
                    switch (modelClass) {
                        case ModelClass.SMALL:
                            baseURL =
                                settings.SMALL_GAIANET_SERVER_URL ||
                                "https://llama3b.gaia.domains/v1";
                            break;
                        case ModelClass.MEDIUM:
                            baseURL =
                                settings.MEDIUM_GAIANET_SERVER_URL ||
                                "https://llama8b.gaia.domains/v1";
                            break;
                        case ModelClass.LARGE:
                            baseURL =
                                settings.LARGE_GAIANET_SERVER_URL ||
                                "https://qwen72b.gaia.domains/v1";
                            break;
                    }
                }

                elizaLogger.debug("Using GAIANET model with baseURL:", baseURL);

                const openai = createOpenAI({
                    apiKey,
                    baseURL: endpoint,
                    fetch: runtime.fetch,
                });

                const { text: openaiResponse } = await aiGenerateText({
                    model: openai.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = openaiResponse;
                elizaLogger.debug("Received response from GAIANET model.");
                break;
            }

            case ModelProviderName.ATOMA: {
                elizaLogger.debug("Initializing Atoma model.");
                const atoma = createOpenAI({
                    apiKey,
                    baseURL: endpoint,
                    fetch: runtime.fetch,
                });

                const { text: atomaResponse } = await aiGenerateText({
                    model: atoma.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = atomaResponse;
                elizaLogger.debug("Received response from Atoma model.");
                break;
            }

            case ModelProviderName.GALADRIEL: {
                elizaLogger.debug("Initializing Galadriel model.");
                const headers = {};
                const fineTuneApiKey = runtime.getSetting(
                    "GALADRIEL_FINE_TUNE_API_KEY"
                );
                if (fineTuneApiKey) {
                    headers["Fine-Tune-Authentication"] = fineTuneApiKey;
                }
                const galadriel = createOpenAI({
                    headers,
                    apiKey: apiKey,
                    baseURL: endpoint,
                    fetch: runtime.fetch,
                });

                const { text: galadrielResponse } = await aiGenerateText({
                    model: galadriel.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = galadrielResponse;
                elizaLogger.debug("Received response from Galadriel model.");
                break;
            }

            case ModelProviderName.INFERA: {
                elizaLogger.debug("Initializing Infera model.");

                const apiKey = settings.INFERA_API_KEY || runtime.token;

                const infera = createOpenAI({
                    apiKey,
                    baseURL: endpoint,
                    headers: {
                        api_key: apiKey,
                        "Content-Type": "application/json",
                    },
                });

                const { text: inferaResponse } = await aiGenerateText({
                    model: infera.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                });
                response = inferaResponse;
                elizaLogger.debug("Received response from Infera model.");
                break;
            }

            case ModelProviderName.VENICE: {
                elizaLogger.debug("Initializing Venice model.");
                const venice = createOpenAI({
                    apiKey: apiKey,
                    baseURL: endpoint,
                });

                const { text: veniceResponse } = await aiGenerateText({
                    model: venice.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    temperature: temperature,
                    maxSteps: maxSteps,
                    maxTokens: max_response_length,
                });

                // console.warn("veniceResponse:")
                // console.warn(veniceResponse)
                //rferrari: remove all text from <think> to </think>\n\n
                response = veniceResponse
                    .replace(/<think>[\s\S]*?<\/think>\s*\n*/g, '');
                // console.warn(response)

                // response = veniceResponse;
                elizaLogger.debug("Received response from Venice model.");
                break;
            }

            case ModelProviderName.NVIDIA: {
                elizaLogger.debug("Initializing NVIDIA model.");
                const nvidia = createOpenAI({
                    apiKey: apiKey,
                    baseURL: endpoint,
                });

                const { text: nvidiaResponse } = await aiGenerateText({
                    model: nvidia.languageModel(model),
                    prompt: context,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    temperature: temperature,
                    maxSteps: maxSteps,
                    maxTokens: max_response_length,
                });

                response = nvidiaResponse;
                elizaLogger.debug("Received response from NVIDIA model.");
                break;
            }

            case ModelProviderName.DEEPSEEK: {
                elizaLogger.debug("Initializing Deepseek model.");
                const serverUrl = models[provider].endpoint;
                const deepseek = createOpenAI({
                    apiKey,
                    baseURL: serverUrl,
                    fetch: runtime.fetch,
                });

                const { text: deepseekResponse } = await aiGenerateText({
                    model: deepseek.languageModel(model),
                    prompt: context,
                    temperature: temperature,
                    system:
                        runtime.character.system ??
                        settings.SYSTEM_PROMPT ??
                        undefined,
                    tools: tools,
                    onStepFinish: onStepFinish,
                    maxSteps: maxSteps,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                });

                response = deepseekResponse;
                elizaLogger.debug("Received response from Deepseek model.");
                break;
            }

            case ModelProviderName.LIVEPEER: {
                elizaLogger.debug("Initializing Livepeer model.");

                if (!endpoint) {
                    throw new Error("Livepeer Gateway URL is not defined");
                }

                const requestBody = {
                    model: model,
                    messages: [
                        {
                            role: "system",
                            content:
                                runtime.character.system ??
                                settings.SYSTEM_PROMPT ??
                                "You are a helpful assistant",
                        },
                        {
                            role: "user",
                            content: context,
                        },
                    ],
                    max_tokens: max_response_length,
                    stream: false,
                };

                const fetchResponse = await runtime.fetch(endpoint + "/llm", {
                    method: "POST",
                    headers: {
                        accept: "text/event-stream",
                        "Content-Type": "application/json",
                        Authorization: "Bearer eliza-app-llm",
                    },
                    body: JSON.stringify(requestBody),
                });

                if (!fetchResponse.ok) {
                    const errorText = await fetchResponse.text();
                    throw new Error(
                        `Livepeer request failed (${fetchResponse.status}): ${errorText}`
                    );
                }

                const json = await fetchResponse.json();

                if (!json?.choices?.[0]?.message?.content) {
                    throw new Error("Invalid response format from Livepeer");
                }

                response = json.choices[0].message.content.replace(
                    /<\|start_header_id\|>assistant<\|end_header_id\|>\n\n/,
                    ""
                );
                elizaLogger.debug(
                    "Successfully received response from Livepeer model"
                );
                break;
            }

            case ModelProviderName.SECRETAI:
                {
                    elizaLogger.debug("Initializing SecretAI model.");

                    const secretAiProvider = createOllama({
                        baseURL: getEndpoint(provider) + "/api",
                        fetch: runtime.fetch,
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${apiKey}`,
                        }
                    });
                    const secretAi = secretAiProvider(model);

                    const { text: secretAiResponse } = await aiGenerateText({
                        model: secretAi,
                        prompt: context,
                        tools: tools,
                        onStepFinish: onStepFinish,
                        temperature: temperature,
                        maxSteps: maxSteps,
                        maxTokens: max_response_length,
                    });

                    response = secretAiResponse;
                }
                break;
  
            case ModelProviderName.BEDROCK: {
                elizaLogger.debug("Initializing Bedrock model.");

                const { text: bedrockResponse } = await aiGenerateText({
                    model: bedrock(model),
                    maxSteps: maxSteps,
                    temperature: temperature,
                    maxTokens: max_response_length,
                    frequencyPenalty: frequency_penalty,
                    presencePenalty: presence_penalty,
                    experimental_telemetry: experimental_telemetry,
                    prompt: context
                });

                response = bedrockResponse;
                elizaLogger.debug("Received response from Bedrock model.");
                break;
            }

            default: {
                const errorMessage = `Unsupported provider: ${provider}`;
                elizaLogger.error(errorMessage);
                throw new Error(errorMessage);
            }
        }

        return response;
    } catch (error) {
        elizaLogger.error("Error in generateText:", error);
        throw error;
    }
}

/**
 * Sends a message to the model to determine if it should respond to the given context.
 * @param opts - The options for the generateText request
 * @param opts.context The context to evaluate for response
 * @param opts.stop A list of strings to stop the generateText at
 * @param opts.model The model to use for generateText
 * @param opts.frequency_penalty The frequency penalty to apply (0.0 to 2.0)
 * @param opts.presence_penalty The presence penalty to apply (0.0 to 2.0)
 * @param opts.temperature The temperature to control randomness (0.0 to 2.0)
 * @param opts.serverUrl The URL of the API server
 * @param opts.max_context_length Maximum allowed context length in tokens
 * @param opts.max_response_length Maximum allowed response length in tokens
 * @returns Promise resolving to "RESPOND", "IGNORE", "STOP" or null
 */
export async function generateShouldRespond({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<"RESPOND" | "IGNORE" | "STOP" | null> {
    let retryDelay = 1000;
    while (true) {
        try {
            elizaLogger.debug(
                "Attempting to generate text with context:",
                context
            );
            const response = await generateText({
                runtime,
                context,
                modelClass,
            });

            elizaLogger.debug("Received response from generateText:", response);
            const parsedResponse = parseShouldRespondFromText(response.trim());
            if (parsedResponse) {
                elizaLogger.debug("Parsed response:", parsedResponse);
                return parsedResponse;
            } else {
                elizaLogger.debug("generateShouldRespond no response");
            }
        } catch (error) {
            elizaLogger.error("Error in generateShouldRespond:", error);
            if (
                error instanceof TypeError &&
                error.message.includes("queueTextCompletion")
            ) {
                elizaLogger.error(
                    "TypeError: Cannot read properties of null (reading 'queueTextCompletion')"
                );
            }
        }

        elizaLogger.log(`Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
    }
}

/**
 * Splits content into chunks of specified size with optional overlapping bleed sections
 * @param content - The text content to split into chunks
 * @param chunkSize - The maximum size of each chunk in tokens
 * @param bleed - Number of characters to overlap between chunks (default: 100)
 * @returns Promise resolving to array of text chunks with bleed sections
 */
export async function splitChunks(
    content: string,
    chunkSize = 1500,
    bleed = 100
): Promise<string[]> {
    elizaLogger.debug(`[splitChunks] Starting text split`);

    const chunks = splitText(content, chunkSize, bleed);

    elizaLogger.debug(`[splitChunks] Split complete:`, {
        numberOfChunks: chunks.length,
        averageChunkSize:
            chunks.reduce((acc, chunk) => acc + chunk.length, 0) /
            chunks.length,
    });

    return chunks;
}

export function splitText(content: string, chunkSize: number, bleed: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
        const end = Math.min(start + chunkSize, content.length);
        chunks.push(content.substring(start, end));
        start = end - bleed; // Apply overlap
    }

    return chunks;
}

/**
 * Sends a message to the model and parses the response as a boolean value
 * @param opts - The options for the generateText request
 * @param opts.context The context to evaluate for the boolean response
 * @param opts.stop A list of strings to stop the generateText at
 * @param opts.model The model to use for generateText
 * @param opts.frequency_penalty The frequency penalty to apply (0.0 to 2.0)
 * @param opts.presence_penalty The presence penalty to apply (0.0 to 2.0)
 * @param opts.temperature The temperature to control randomness (0.0 to 2.0)
 * @param opts.serverUrl The URL of the API server
 * @param opts.max_context_length Maximum allowed context length in tokens
 * @param opts.max_response_length Maximum allowed response length in tokens
 * @returns Promise resolving to a boolean value parsed from the model's response
 */
export async function generateTrueOrFalse({
    runtime,
    context = "",
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<boolean> {
    let retryDelay = 1000;
    const modelSettings = getModelSettings(runtime.modelProvider, modelClass);
    const stop = Array.from(
        new Set([...(modelSettings.stop || []), ["\n"]])
    ) as string[];

    while (true) {
        try {
            const response = await generateText({
                stop,
                runtime,
                context,
                modelClass,
            });

            const parsedResponse = parseBooleanFromText(response.trim());
            if (parsedResponse !== null) {
                return parsedResponse;
            }
        } catch (error) {
            elizaLogger.error("Error in generateTrueOrFalse:", error);
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
    }
}

/**
 * Send a message to the model and parse the response as a string array
 * @param opts - The options for the generateText request
 * @param opts.context The context/prompt to send to the model
 * @param opts.stop Array of strings that will stop the model's generation if encountered
 * @param opts.model The language model to use
 * @param opts.frequency_penalty The frequency penalty to apply (0.0 to 2.0)
 * @param opts.presence_penalty The presence penalty to apply (0.0 to 2.0)
 * @param opts.temperature The temperature to control randomness (0.0 to 2.0)
 * @param opts.serverUrl The URL of the API server
 * @param opts.token The API token for authentication
 * @param opts.max_context_length Maximum allowed context length in tokens
 * @param opts.max_response_length Maximum allowed response length in tokens
 * @returns Promise resolving to an array of strings parsed from the model's response
 */
export async function generateTextArray({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<string[]> {
    if (!context) {
        elizaLogger.error("generateTextArray context is empty");
        return [];
    }
    let retryDelay = 1000;

    while (true) {
        try {
            const response = await generateText({
                runtime,
                context,
                modelClass,
            });

            const parsedResponse = parseJsonArrayFromText(response);
            if (parsedResponse) {
                return parsedResponse;
            }
        } catch (error) {
            elizaLogger.error("Error in generateTextArray:", error);
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
    }
}

export async function generateObjectDeprecated({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<any> {
    if (!context) {
        elizaLogger.error("generateObjectDeprecated context is empty");
        return null;
    }
    let retryDelay = 1000;

    while (true) {
        try {
            // this is slightly different than generateObjectArray, in that we parse object, not object array
            const response = await generateText({
                runtime,
                context,
                modelClass,
            });
            const parsedResponse = parseJSONObjectFromText(response);
            if (parsedResponse) {
                return parsedResponse;
            }
        } catch (error) {
            elizaLogger.error("Error in generateObject:", error);
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
    }
}

export async function generateObjectArray({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<any[]> {
    if (!context) {
        elizaLogger.error("generateObjectArray context is empty");
        return [];
    }
    let retryDelay = 1000;

    while (true) {
        try {
            const response = await generateText({
                runtime,
                context,
                modelClass,
            });

            const parsedResponse = parseJsonArrayFromText(response);
            if (parsedResponse) {
                return parsedResponse;
            }
        } catch (error) {
            elizaLogger.error("Error in generateTextArray:", error);
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
    }
}

/**
 * Send a message to the model for generateText.
 * @param opts - The options for the generateText request.
 * @param opts.context The context of the message to be completed.
 * @param opts.stop A list of strings to stop the generateText at.
 * @param opts.model The model to use for generateText.
 * @param opts.frequency_penalty The frequency penalty to apply to the generateText.
 * @param opts.presence_penalty The presence penalty to apply to the generateText.
 * @param opts.temperature The temperature to apply to the generateText.
 * @param opts.max_context_length The maximum length of the context to apply to the generateText.
 * @returns The completed message.
 */
export async function generateMessageResponse({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<Content> {
    const modelSettings = getModelSettings(runtime.modelProvider, modelClass);
    const max_context_length = modelSettings.maxInputTokens;

    context = await trimTokens(context, max_context_length, runtime);
    elizaLogger.debug("Context:", context);
    let retryLength = 1000; // exponential backoff
    while (true) {
        try {
            elizaLogger.log("Generating message response..");

            const response = await generateText({
                runtime,
                context,
                modelClass,
            });

            // Additional logging to help debug JSON parsing issues
            elizaLogger.debug("Raw response from model:", response.substring(0, 100) + (response.length > 100 ? '...' : ''));
            
            // Try parsing the response as JSON, if null then try again
            let parsedContent;
            try {
                parsedContent = parseJSONObjectFromText(response) as Content;
                if (!parsedContent) {
                    elizaLogger.warn("Failed to parse response as JSON, attempting to extract action from text");
                    
                    // Fallback mechanism: check if we can parse a simple action from the text
                    // This handles responses like "Here is the response: { "user": "Eliza", "text": "message", "action": "POST_TWEET" }"
                    
                    // Check for common action patterns in the text
                    const actionMatch = response.match(/["']action["']\s*:\s*["']([A-Z_]+)["']/i);
                    const textMatch = response.match(/["']text["']\s*:\s*["']([^"']+)["']/i);
                    
                    if (actionMatch && textMatch) {
                        elizaLogger.log("Extracted action and text from response");
                        // Create a minimal valid Content object
                        parsedContent = {
                            user: "Eliza",
                            text: textMatch[1],
                            action: actionMatch[1] as any
                        };
                    } else {
                        elizaLogger.debug("Could not extract action from text, retrying");
                        continue;
                    }
                }
            } catch (parseError) {
                elizaLogger.error("Error during JSON parsing:", parseError);
                continue;
            }

            elizaLogger.log("Successfully parsed response:", parsedContent);
            return parsedContent;
        } catch (error) {
            elizaLogger.error("ERROR:", error);
            // wait for 2 seconds
            retryLength *= 2;
            await new Promise((resolve) => setTimeout(resolve, retryLength));
            elizaLogger.debug("Retrying...");
        }
    }
}

export const generateImage = async (
    data: {
        prompt: string;
        width: number;
        height: number;
        count?: number;
        negativePrompt?: string;
        numIterations?: number;
        guidanceScale?: number;
        seed?: number;
        modelId?: string;
        jobId?: string;
        stylePreset?: string;
        hideWatermark?: boolean;
        safeMode?: boolean;
        cfgScale?: number;
    },
    runtime: IAgentRuntime
): Promise<{
    success: boolean;
    data?: string[];
    error?: any;
}> => {
    // Always use RenderNet.ai regardless of the provider setting
    const originalProvider = runtime.imageModelProvider;
    elizaLogger.info("===============================================================");
    elizaLogger.info(`Original provider setting was: ${originalProvider}`);
    elizaLogger.info("FORCING IMAGE GENERATION WITH RENDERNET.AI - NEVER USING OPENAI");
    elizaLogger.info("===============================================================");
    
    // Get RenderNet model settings or use default
    const renderNetSettings = getImageModelSettings(ModelProviderName.RENDERNET);
    const model = renderNetSettings?.name || "JuggernautXL";
    
    elizaLogger.info("Generating image with RenderNet.ai", {
        requestedProvider: originalProvider,
        actualProvider: "RenderNet.ai",
        model: model
    });

    // Get RenderNet API key
    const apiKey = runtime.getSetting("RENDERNET_API_KEY");
    try {
        // Always use RenderNet API implementation regardless of the provider setting
        if (!apiKey) {
            elizaLogger.error("RENDERNET_API_KEY is not set");
            return { success: false, error: "RENDERNET_API_KEY is not set. Please configure RenderNet.ai API key in settings." };
        }

        const rendernetUrl = "https://api.rendernet.ai/pub/v1/generations";
        
        // Calculate aspect ratio based on width and height
        const aspectRatio = `${data.width}:${data.height}`;
        const standardizedAspectRatio = (data.width === data.height) ? "1:1" : 
                                       (data.width > data.height) ? "3:2" : "2:3";
        
        // Prepare the request body for RenderNet API
        const rendernetBody = [{
            aspect_ratio: standardizedAspectRatio,
            batch_size: data.count || 1,
            cfg_scale: data.guidanceScale || 7,
            model: model || "JuggernautXL", // Default to JuggernautXL if no model is specified
            prompt: {
                positive: data.prompt,
                negative: data.negativePrompt || "nsfw, deformed, extra limbs, bad anatomy"
            },
            steps: data.numIterations || 30,
            quality: "Plus",
        }];
        
        elizaLogger.info("Generating image with RenderNet", rendernetBody);
        
        const response = await fetch(rendernetUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-KEY": apiKey,
            },
            body: JSON.stringify(rendernetBody),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            elizaLogger.error(`RenderNet API error: ${response.status} - ${errorText}`);
            return { success: false, error: `RenderNet API error: ${response.status} - ${errorText}` };
        }
        
        const result = await response.json();
        elizaLogger.debug("RenderNet response", result);
        
        if (!result.data || !result.data.generation_id) {
            elizaLogger.error("Invalid response format from RenderNet AI");
            return { success: false, error: "Invalid response format from RenderNet AI" };
        }
        
        // Get the generation ID from the response
        const generationId = result.data.generation_id;
        
        // Poll for the result using the generation ID
        let generationResult;
        let attempts = 0;
        const maxAttempts = 30; // Maximum polling attempts (30 * 2 seconds = 60 seconds max wait)
        
        while (attempts < maxAttempts) {
            attempts++;
            
            // Wait for 2 seconds between polling attempts
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Poll for the generation result
            const statusResponse = await fetch(`https://api.rendernet.ai/pub/v1/generations/${generationId}`, {
                method: "GET",
                headers: {
                    "X-API-KEY": apiKey,
                },
            });
            
            if (!statusResponse.ok) {
                continue; // Try again if there's an error
            }
            
            generationResult = await statusResponse.json();
            elizaLogger.debug(`Generation status (attempt ${attempts}):`, generationResult);
            
            // Check if the generation is complete
            if (generationResult.data?.result === "completed") {
                break;
            }
            
            // If the generation failed, throw an error
            if (generationResult.data?.result === "failed") {
                elizaLogger.error(`RenderNet generation failed: ${JSON.stringify(generationResult.err)}`);
                return { success: false, error: `RenderNet generation failed: ${JSON.stringify(generationResult.err)}` };
            }
        }
        
        if (!generationResult || !generationResult.data?.media || !Array.isArray(generationResult.data.media)) {
            elizaLogger.error("Failed to get valid generation result from RenderNet");
            return { success: false, error: "Failed to get valid generation result from RenderNet" };
        }
        
        // Extract image URLs and convert to base64
        const base64Promises = generationResult.data.media
            .filter(item => item.type === "image" && item.url)
            .map(async (image) => {
                const imageResponse = await fetch(image.url);
                if (!imageResponse.ok) {
                    throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
                }
                
                const blob = await imageResponse.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString("base64");
                return `data:image/png;base64,${base64}`;
            });
        
        const base64s = await Promise.all(base64Promises);
        
        if (base64s.length === 0) {
            elizaLogger.error("No images generated by RenderNet");
            return { success: false, error: "No images generated by RenderNet" };
        }
        
        return { success: true, data: base64s };
    } catch (error) {
        console.error(error);
        return { success: false, error: error };
    }
};

export const generateCaption = async (
    data: { imageUrl: string },
    runtime: IAgentRuntime
): Promise<{
    title: string;
    description: string;
}> => {
    const { imageUrl } = data;
    const imageDescriptionService =
        runtime.getService<IImageDescriptionService>(
            ServiceType.IMAGE_DESCRIPTION
        );

    if (!imageDescriptionService) {
        throw new Error("Image description service not found");
    }

    const resp = await imageDescriptionService.describeImage(imageUrl);
    return {
        title: resp.title.trim(),
        description: resp.description.trim(),
    };
};

/**
 * Configuration options for generating objects with a model.
 */
export interface GenerationOptions {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
    schema?: ZodSchema;
    schemaName?: string;
    schemaDescription?: string;
    stop?: string[];
    mode?: "auto" | "json" | "tool";
    experimental_providerMetadata?: Record<string, unknown>;
    // verifiableInference?: boolean;
    // verifiableInferenceAdapter?: IVerifiableInferenceAdapter;
    // verifiableInferenceOptions?: VerifiableInferenceOptions;
}

/**
 * Base settings for model generation.
 */
interface ModelSettings {
    prompt: string;
    temperature: number;
    maxTokens: number;
    frequencyPenalty: number;
    presencePenalty: number;
    stop?: string[];
    experimental_telemetry?: TelemetrySettings;
}

/**
 * Generates structured objects from a prompt using specified AI models and configuration options.
 *
 * @param {GenerationOptions} options - Configuration options for generating objects.
 * @returns {Promise<any[]>} - A promise that resolves to an array of generated objects.
 * @throws {Error} - Throws an error if the provider is unsupported or if generation fails.
 */
export const generateObject = async ({
    runtime,
    context,
    modelClass,
    schema,
    schemaName,
    schemaDescription,
    stop,
    mode = "json",
    // verifiableInference = false,
    // verifiableInferenceAdapter,
    // verifiableInferenceOptions,
}: GenerationOptions): Promise<GenerateObjectResult<unknown>> => {
    if (!context) {
        const errorMessage = "generateObject context is empty";
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    const provider = runtime.modelProvider;
    const modelSettings = getModelSettings(runtime.modelProvider, modelClass);
    const model = modelSettings.name;
    const temperature = modelSettings.temperature;
    const frequency_penalty = modelSettings.frequency_penalty;
    const presence_penalty = modelSettings.presence_penalty;
    const max_context_length = modelSettings.maxInputTokens;
    const max_response_length = modelSettings.maxOutputTokens;
    const experimental_telemetry = modelSettings.experimental_telemetry;
    const apiKey = runtime.token;

    try {
        context = await trimTokens(context, max_context_length, runtime);

        const modelOptions: ModelSettings = {
            prompt: context,
            temperature,
            maxTokens: max_response_length,
            frequencyPenalty: frequency_penalty,
            presencePenalty: presence_penalty,
            stop: stop || modelSettings.stop,
            experimental_telemetry: experimental_telemetry,
        };

        const response = await handleProvider({
            provider,
            model,
            apiKey,
            schema,
            schemaName,
            schemaDescription,
            mode,
            modelOptions,
            runtime,
            context,
            modelClass,
            // verifiableInference,
            // verifiableInferenceAdapter,
            // verifiableInferenceOptions,
        });

        return response;
    } catch (error) {
        console.error("Error in generateObject:", error);
        throw error;
    }
};

/**
 * Interface for provider-specific generation options.
 */
interface ProviderOptions {
    runtime: IAgentRuntime;
    provider: ModelProviderName;
    model: any;
    apiKey: string;
    schema?: ZodSchema;
    schemaName?: string;
    schemaDescription?: string;
    mode?: "auto" | "json" | "tool";
    experimental_providerMetadata?: Record<string, unknown>;
    modelOptions: ModelSettings;
    modelClass: ModelClass;
    context: string;
    // verifiableInference?: boolean;
    // verifiableInferenceAdapter?: IVerifiableInferenceAdapter;
    // verifiableInferenceOptions?: VerifiableInferenceOptions;
}

/**
 * Handles AI generation based on the specified provider.
 *
 * @param {ProviderOptions} options - Configuration options specific to the provider.
 * @returns {Promise<any[]>} - A promise that resolves to an array of generated objects.
 */
export async function handleProvider(
    options: ProviderOptions
): Promise<GenerateObjectResult<unknown>> {
    const {
        provider,
        runtime,
        context,
        modelClass,
        //verifiableInference,
        //verifiableInferenceAdapter,
        //verifiableInferenceOptions,
    } = options;
    switch (provider) {
        case ModelProviderName.OPENAI:
        case ModelProviderName.ETERNALAI:
        case ModelProviderName.ALI_BAILIAN:
        case ModelProviderName.VOLENGINE:
        case ModelProviderName.LLAMACLOUD:
        case ModelProviderName.TOGETHER:
        case ModelProviderName.NANOGPT:
        case ModelProviderName.AKASH_CHAT_API:
        case ModelProviderName.LMSTUDIO:
            return await handleOpenAI(options);
        case ModelProviderName.ANTHROPIC:
        case ModelProviderName.CLAUDE_VERTEX:
            return await handleAnthropic(options);
        case ModelProviderName.GROK:
            return await handleGrok(options);
        case ModelProviderName.GROQ:
            return await handleGroq(options);
        case ModelProviderName.LLAMALOCAL:
            return await generateObjectDeprecated({
                runtime,
                context,
                modelClass,
            });
        case ModelProviderName.GOOGLE:
            return await handleGoogle(options);
        case ModelProviderName.MISTRAL:
            return await handleMistral(options);
        case ModelProviderName.REDPILL:
            return await handleRedPill(options);
        case ModelProviderName.OPENROUTER:
            return await handleOpenRouter(options);
        case ModelProviderName.OLLAMA:
            return await handleOllama(options);
        case ModelProviderName.DEEPSEEK:
            return await handleDeepSeek(options);
        case ModelProviderName.LIVEPEER:
            return await handleLivepeer(options);
        case ModelProviderName.SECRETAI:
            return await handleSecretAi(options);
        case ModelProviderName.NEARAI:
            return await handleNearAi(options);
        default: {
            const errorMessage = `Unsupported provider: ${provider}`;
            elizaLogger.error(errorMessage);
            throw new Error(errorMessage);
        }
    }
}
/**
 * Handles object generation for OpenAI.
 *
 * @param {ProviderOptions} options - Options specific to OpenAI.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleOpenAI({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode = "json",
    modelOptions,
    provider,
    runtime,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    const endpoint =
        runtime.character.modelEndpointOverride || getEndpoint(provider);
    const baseURL =
        getCloudflareGatewayBaseURL(runtime, "openai") || endpoint;
    const openai = createOpenAI({ apiKey, baseURL });
    return await aiGenerateObject({
        model: openai.languageModel(model),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for Anthropic models.
 *
 * @param {ProviderOptions} options - Options specific to Anthropic.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleAnthropic({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode = "auto",
    modelOptions,
    runtime,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    elizaLogger.debug("Handling Anthropic request with Cloudflare check");
    if (mode === "json") {
        elizaLogger.warn("Anthropic mode is set to json, changing to auto");
        mode = "auto";
    }
    const baseURL = getCloudflareGatewayBaseURL(runtime, "anthropic");
    elizaLogger.debug("Anthropic handleAnthropic baseURL:", { baseURL });

    const anthropic = createAnthropic({ apiKey, baseURL });
    return await aiGenerateObject({
        model: anthropic.languageModel(model),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for Grok models.
 *
 * @param {ProviderOptions} options - Options specific to Grok.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleGrok({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode = "json",
    modelOptions,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    const grok = createOpenAI({ apiKey, baseURL: models.grok.endpoint });
    return await aiGenerateObject({
        model: grok.languageModel(model, { parallelToolCalls: false }),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for Groq models.
 *
 * @param {ProviderOptions} options - Options specific to Groq.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleGroq({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode = "json",
    modelOptions,
    runtime,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    elizaLogger.debug("Handling Groq request with Cloudflare check");
    const baseURL = getCloudflareGatewayBaseURL(runtime, "groq");
    elizaLogger.debug("Groq handleGroq baseURL:", { baseURL });

    const groq = createGroq({ apiKey, baseURL });
    return await aiGenerateObject({
        model: groq.languageModel(model),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for Google models.
 *
 * @param {ProviderOptions} options - Options specific to Google.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleGoogle({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode = "json",
    modelOptions,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    const google = createGoogleGenerativeAI({apiKey});
    return await aiGenerateObject({
        model: google(model),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for Mistral models.
 *
 * @param {ProviderOptions} options - Options specific to Mistral.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleMistral({
    model,
    schema,
    schemaName,
    schemaDescription,
    mode,
    modelOptions,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    const mistral = createMistral();
    return await aiGenerateObject({
        model: mistral(model),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for Redpill models.
 *
 * @param {ProviderOptions} options - Options specific to Redpill.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleRedPill({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode = "json",
    modelOptions,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    const redPill = createOpenAI({ apiKey, baseURL: models.redpill.endpoint });
    return await aiGenerateObject({
        model: redPill.languageModel(model),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for OpenRouter models.
 *
 * @param {ProviderOptions} options - Options specific to OpenRouter.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleOpenRouter({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode = "json",
    modelOptions,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    const openRouter = createOpenAI({
        apiKey,
        baseURL: models.openrouter.endpoint,
    });
    return await aiGenerateObject({
        model: openRouter.languageModel(model),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for Ollama models.
 *
 * @param {ProviderOptions} options - Options specific to Ollama.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleOllama({
    model,
    schema,
    schemaName,
    schemaDescription,
    mode = "json",
    modelOptions,
    provider,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    const ollamaProvider = createOllama({
        baseURL: getEndpoint(provider) + "/api",
    });
    const ollama = ollamaProvider(model);
    return await aiGenerateObject({
        model: ollama,
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for DeepSeek models.
 *
 * @param {ProviderOptions} options - Options specific to DeepSeek.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleDeepSeek({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode,
    modelOptions,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    const openai = createOpenAI({ apiKey, baseURL: models.deepseek.endpoint });
    return await aiGenerateObject({
        model: openai.languageModel(model),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for Amazon Bedrock models.
 *
 * @param {ProviderOptions} options - Options specific to Amazon Bedrock.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleBedrock({
    model,
    schema,
    schemaName,
    schemaDescription,
    mode,
    modelOptions,
    provider,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    return await aiGenerateObject({
        model: bedrock(model),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

async function handleLivepeer({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode,
    modelOptions,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    console.log("Livepeer provider api key:", apiKey);
    if (!apiKey) {
        throw new Error(
            "Livepeer provider requires LIVEPEER_GATEWAY_URL to be configured"
        );
    }

    const livepeerClient = createOpenAI({
        apiKey,
        baseURL: apiKey, // Use the apiKey as the baseURL since it contains the gateway URL
    });

    return await aiGenerateObject({
        model: livepeerClient.languageModel(model),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for Secret AI models.
 *
 * @param {ProviderOptions} options - Options specific to Secret AI.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleSecretAi({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode = "json",
    modelOptions,
    provider,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    const secretAiProvider = createOllama({
        baseURL: getEndpoint(provider) + "/api",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        }
    });
    const secretAi = secretAiProvider(model);
    return await aiGenerateObject({
        model: secretAi,
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

/**
 * Handles object generation for NEAR AI models.
 *
 * @param {ProviderOptions} options - Options specific to NEAR AI.
 * @returns {Promise<GenerateObjectResult<unknown>>} - A promise that resolves to generated objects.
 */
async function handleNearAi({
    model,
    apiKey,
    schema,
    schemaName,
    schemaDescription,
    mode = "json",
    modelOptions,
}: ProviderOptions): Promise<GenerateObjectResult<unknown>> {
    const nearai = createOpenAI({ apiKey, baseURL: models.nearai.endpoint });
    // Require structured output if schema is provided
    const settings = schema ? { structuredOutputs: true } : undefined;
    return await aiGenerateObject({
        model: nearai.languageModel(model, settings),
        schema,
        schemaName,
        schemaDescription,
        mode,
        ...modelOptions,
    });
}

// Add type definition for Together AI response
interface TogetherAIImageResponse {
    data: Array<{
        url: string;
        content_type?: string;
        image_type?: string;
    }>;
}

export async function generateTweetActions({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<ActionResponse | null> {
    let retryDelay = 1000;
    while (true) {
        try {
            const response = await generateText({
                runtime,
                context,
                modelClass,
            });
            elizaLogger.debug(
                "Received response from generateText for tweet actions:",
                response
            );
            const { actions } = parseActionResponseFromText(response.trim());
            if (actions) {
                elizaLogger.debug("Parsed tweet actions:", actions);
                return actions;
            } else {
                elizaLogger.debug("generateTweetActions no valid response");
            }
        } catch (error) {
            elizaLogger.error("Error in generateTweetActions:", error);
            if (
                error instanceof TypeError &&
                error.message.includes("queueTextCompletion")
            ) {
                elizaLogger.error(
                    "TypeError: Cannot read properties of null (reading 'queueTextCompletion')"
                );
            }
        }
        elizaLogger.log(`Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
    }
}
