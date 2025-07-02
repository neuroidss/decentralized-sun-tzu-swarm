import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Drone, LogEntry, Vector, ModelDefinition, ModelProvider, LogType } from '../types';

// Safely get the API key in a way that doesn't crash in a browser.
const getApiKey = (): string => {
    try {
        if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
            return process.env.API_KEY;
        }
    } catch (e) {
        // Silently fail if process or process.env are not accessible.
    }
    return '';
};

const API_KEY = getApiKey();
let ai: GoogleGenAI | null = null;

if (API_KEY) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
} else {
    console.warn("API_KEY environment variable not set. Google AI models will not be available.");
}


export interface IndividualStratagem {
    stratagem_name: string;
    justification: string;
    action: {
        type: 'MOVE' | 'ATTACK' | 'HOLD';
        target_id?: string; // ID of the enemy drone to attack
        position?: Vector; // Position to move to
    };
}

/**
 * Cleans and parses a JSON string, handling common LLM output issues like markdown fences, thinking tags, and trailing commas.
 * @param jsonStr The raw string response from the AI.
 * @returns The parsed JSON object.
 */
function cleanAndParseJson<T>(jsonStr: string): T {
    let cleanStr = jsonStr.trim();

    // Remove <think>...</think> tags from models like Qwen3
    cleanStr = cleanStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Remove markdown code fences (e.g., ```json ... ```). This is more robust.
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const match = cleanStr.match(fenceRegex);
    if (match && match[1]) {
        cleanStr = match[1].trim();
    } else {
        // If no fence was found, and the string doesn't start with a brace,
        // it might have conversational text before the JSON object.
        // Try to extract just the JSON object.
        const firstBrace = cleanStr.indexOf('{');
        const lastBrace = cleanStr.lastIndexOf('}');
        if (firstBrace > -1 && lastBrace > firstBrace) {
            cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
        }
    }

    // Remove trailing commas which are invalid in strict JSON
    cleanStr = cleanStr.replace(/,\s*([}\]])/g, '$1');

    try {
        return JSON.parse(cleanStr) as T;
    } catch (e) {
        console.error("Failed to parse cleaned JSON:", cleanStr, "Original:", jsonStr);
        throw new Error(`Invalid JSON format after cleaning. Details: ${(e as Error).message}`);
    }
}


const generatePromptParts = (
    proposingDrone: Drone,
    friendlySwarm: Drone[],
    enemySwarm: Drone[],
    currentPrinciple: string,
    logHistory: LogEntry[]
): { systemPrompt: string, userPrompt: string } => {
    const friendlyStatus = friendlySwarm.map(d => `Drone ${d.id} [HP:${d.health}]: pos(${d.position.x.toFixed(0)}, ${d.position.y.toFixed(0)}), status: ${d.status}`).join('\n');
    const enemyStatus = enemySwarm.map(d => `Drone ${d.id} [HP:${d.health}]: pos(${d.position.x.toFixed(0)}, ${d.position.y.toFixed(0)}), status: ${d.status}`).join('\n');
    const recentLogs = logHistory.slice(-5).map(l => `${l.author || 'System'}: ${l.message}`).join('\n');

    const systemPrompt = `You are an autonomous agent in a decentralized drone swarm, operating under the principles of Sun Tzu's "The Art of War".
Your designation: ${proposingDrone.id} (Swarm: ${proposingDrone.swarmId})
Your current health: ${proposingDrone.health}
Your current position: (${proposingDrone.position.x.toFixed(0)}, ${proposingDrone.position.y.toFixed(0)})

The current guiding principle for all swarms is: "${currentPrinciple}".

Your task is to analyze the situation and decide YOUR OWN next action. Your response must be a single, valid JSON object, without any markdown formatting or explanations.

JSON Structure:
{
  "stratagem_name": "A brief, personal tactical name. e.g., 'Flanking Maneuver', 'Calculated Retreat', 'Focused Fire'.",
  "justification": "How my action follows the guiding principle. e.g., 'I will move to high ground to gain a better vantage point, following the Terrain principle.'",
  "action": {
    "type": "MOVE" | "ATTACK" | "HOLD",
    "target_id": "enemy-drone-id" | null,
    "position": { "x": number, "y": number } | null
  }
}`;

    const userPrompt = `SITUATION OVERVIEW:
Your swarm must defeat the enemy swarm.

FRIENDLY SWARM (${proposingDrone.swarmId}) STATUS:
${friendlyStatus}

ENEMY SWARM STATUS:
${enemyStatus.length > 0 ? enemyStatus : "No enemies detected."}

RECENT EVENTS:
${recentLogs}

Now, provide YOUR OWN action as a valid JSON object.`;

    return { systemPrompt, userPrompt };
}

/**
 * Parses the retry delay from a Google AI 429 error message.
 * @param errorMessage The error message string, which may contain JSON.
 * @returns The delay in milliseconds, or null if not found.
 */
function parseRetryDelay(errorMessage: string): number | null {
    try {
        const jsonStartIndex = errorMessage.indexOf('{');
        if (jsonStartIndex === -1) return null;
        
        const jsonString = errorMessage.substring(jsonStartIndex);
        const errorData = JSON.parse(jsonString);

        const retryInfo = errorData?.error?.details?.find(
            (d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
        );
        if (retryInfo && retryInfo.retryDelay) {
            // It's a string like "27s". We need to parse it.
            const match = retryInfo.retryDelay.match(/^(\d+(\.\d+)?)s$/);
            if (match && match[1]) {
                return parseFloat(match[1]) * 1000; // Convert to milliseconds
            }
        }
    } catch (e) {
        console.warn("Could not parse retryDelay from error message:", errorMessage);
        return null;
    }
    return null;
}

const MAX_RETRIES = 3;

async function getGoogleAIAction(
    prompt: string,
    modelId: string,
    droneId: string,
    logProgress?: (message: string, type: LogType, author?: string) => void
): Promise<IndividualStratagem | null> {
    if (!ai) {
        throw new Error("GoogleGenAI not initialized. API_KEY is missing.");
    }
    
    const config: any = { 
        temperature: 0.9,
    };

    if (!modelId.startsWith('gemma-')) {
        config.responseMimeType = "application/json";
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: modelId,
                contents: prompt,
                config: config,
            });
            return cleanAndParseJson<IndividualStratagem>(response.text);
        } catch (error) {
            const isRateLimitError = error instanceof Error && (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED'));

            if (isRateLimitError && attempt < MAX_RETRIES) {
                // Exponential backoff with jitter to prevent thundering herd
                let baseWaitMs: number;

                // For the first attempt, trust the API's hint if available.
                if (attempt === 1) {
                    const apiSuggestedDelay = parseRetryDelay(error.message);
                    baseWaitMs = apiSuggestedDelay !== null ? apiSuggestedDelay : 2000; // Default to 2s
                } else {
                    // For subsequent retries, back off exponentially.
                    // E.g., attempt 2 waits ~4s, attempt 3 waits ~8s
                    baseWaitMs = Math.pow(2, attempt) * 1000; 
                }
                
                // Add jitter to desynchronize requests.
                const jitter = (Math.random() - 0.5) * 1000;
                const finalWaitMs = Math.max(500, baseWaitMs + jitter); // Ensure a minimum wait

                const waitSeconds = (finalWaitMs / 1000).toFixed(1);
                logProgress?.(
                    `Rate limit hit. Retrying in ${waitSeconds}s... (Attempt ${attempt}/${MAX_RETRIES})`,
                    LogType.Info,
                    droneId
                );
                
                await new Promise(resolve => setTimeout(resolve, finalWaitMs));
                continue; // Continue to the next attempt
            }

            // If it's not a retriable error or we've exhausted retries, re-throw.
            throw error;
        }
    }
    
    throw new Error(`Exceeded max retries (${MAX_RETRIES}) for Google AI API.`);
}

async function getOllamaAction(
    systemPrompt: string,
    userPrompt: string,
    modelId: string
): Promise<IndividualStratagem | null> {
    const response = await fetch("http://localhost:11434/v1/chat/completions", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: modelId,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            format: "json",
            stream: false,
            temperature: 0.9
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Ollama API request failed with status ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const jsonStr = data.choices[0].message.content;

    return cleanAndParseJson<IndividualStratagem>(jsonStr);
}


export async function getDroneAction(
    proposingDrone: Drone,
    friendlySwarm: Drone[],
    enemySwarm: Drone[],
    currentPrinciple: string,
    model: ModelDefinition,
    logHistory: LogEntry[],
    logProgress?: (message: string, type: LogType, author?: string) => void
): Promise<IndividualStratagem | null> {

    const { systemPrompt, userPrompt } = generatePromptParts(proposingDrone, friendlySwarm, enemySwarm, currentPrinciple, logHistory);

    try {
        switch (model.provider) {
            case ModelProvider.GoogleAI:
                return await getGoogleAIAction(`${systemPrompt}\n\n${userPrompt}`, model.id, proposingDrone.id, logProgress);
            
            case ModelProvider.Ollama:
                return await getOllamaAction(systemPrompt, userPrompt, model.id);

            default:
                throw new Error(`Unknown model provider: ${model.provider}`);
        }
    } catch (error) {
        console.error(`Error for drone ${proposingDrone.id} using model ${model.name}:`, error);
        // Re-throw the error with a more informative message to be caught by the App component
        if (error instanceof Error) {
            if (error.message.includes('fetch')) {
                 throw new Error(`Network error talking to Ollama. Is it running? Is CORS configured? Details: ${error.message}`);
            }
            throw new Error(`Failed to get/parse stratagem. Details: ${error.message}`);
        }
        throw new Error('An unknown error occurred while getting drone action.');
    }
}