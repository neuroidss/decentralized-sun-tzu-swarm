import { ModelDefinition, ModelProvider } from './types';

export const SUPPORTED_MODELS: ModelDefinition[] = [
    // Local models via Ollama (recommended for hackathon)
    { id: 'gemma3n:e4b', name: 'Gemma 3N E4B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'gemma3n:e2b', name: 'Gemma 3N E2B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'qwen3:14b', name: 'Qwen3 14B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'qwen3:8b', name: 'Qwen3 8B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'qwen3:4b', name: 'Qwen3 4B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'qwen3:1.7b', name: 'Qwen3 1.7B (Ollama)', provider: ModelProvider.Ollama },
    { id: 'qwen3:0.6b', name: 'Qwen3 0.6B (Ollama)', provider: ModelProvider.Ollama },
    
    // Google AI Models (requires API_KEY)
    { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash 04-17 (Google AI)', provider: ModelProvider.GoogleAI },
    // Note: The following models also use the Google AI provider and require a key.
    { id: 'gemma-3n-e4b-it', name: 'Gemma 3N E4B (Google AI)', provider: ModelProvider.GoogleAI },
    { id: 'gemma-3n-e2b-it', name: 'Gemma 3N E2B (Google AI)', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite (Google AI)', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Google AI)', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-flash-lite-preview-06-17', name: 'Gemini 2.5 Flash-Lite 06-17 (Google AI)', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Google AI)', provider: ModelProvider.GoogleAI },
];

export const ART_OF_WAR_PRINCIPLES = [
    "Laying Plans (始计)",
    "Waging War (作战)",
    "Attack by Stratagem (谋攻)",
    "Tactical Dispositions (军形)",
    "Energy (兵势)",
    "Weak Points & Strong (虚实)",
    "Maneuvering (军争)",
    "Variation in Tactics (九变)",
    "The Army on the March (行军)",
    "Terrain (地形)",
    "The Nine Situations (九地)",
    "The Attack by Fire (火攻)",
    "The Use of Spies (用间)",
];