import type { LLMProvider, LLMConfig, LLMAnalysisResult, RenderedCard, DeckAnalysisResult, AnkiDeck, AnkiCard, AnkiCollection, SuggestedCard, KnowledgeCoverage } from '../types';
import { renderCard } from './cardRenderer';
import { Ollama } from 'ollama/browser';

export interface ProviderInfo {
  description: string;
  apiKeyUrl: string;
  apiKeyInstructions: string;
  pricing: string;
}

// Error types for better error handling
export type LLMErrorType = 
  | 'rate_limit' 
  | 'auth_error' 
  | 'connection_error' 
  | 'model_not_found'
  | 'context_length_exceeded'
  | 'server_error'
  | 'unknown';

export interface LLMError extends Error {
  type: LLMErrorType;
  provider: string;
  statusCode?: number;
  retryAfter?: number; // seconds until retry is allowed
  suggestion?: string;
}

/**
 * Creates a structured LLM error with helpful context
 */
function createLLMError(
  message: string, 
  type: LLMErrorType, 
  provider: string, 
  statusCode?: number,
  retryAfter?: number
): LLMError {
  const error = new Error(message) as LLMError;
  error.type = type;
  error.provider = provider;
  error.statusCode = statusCode;
  error.retryAfter = retryAfter;
  
  // Add helpful suggestions based on error type
  switch (type) {
    case 'rate_limit':
      error.suggestion = 'You\'ve hit the rate limit for this provider. Consider switching to Ollama (local, unlimited) or waiting a few minutes before retrying.';
      break;
    case 'auth_error':
      error.suggestion = 'Your API key appears to be invalid or expired. Please check your API key in Settings.';
      break;
    case 'connection_error':
      if (provider === 'ollama') {
        error.suggestion = 'Cannot connect to Ollama. Make sure Ollama is running locally (run "ollama serve" in a terminal).';
      } else {
        error.suggestion = 'Cannot connect to the API. Check your internet connection or try again later.';
      }
      break;
    case 'model_not_found':
      if (provider === 'ollama') {
        error.suggestion = `Model not found. Run "ollama pull ${message.match(/model[:\s]+(\S+)/i)?.[1] || 'llama3.2'}" to download it.`;
      } else {
        error.suggestion = 'The selected model is not available. Try selecting a different model in Settings.';
      }
      break;
    case 'context_length_exceeded':
      error.suggestion = 'The card content is too long for this model. Try a model with a larger context window or simplify the card.';
      break;
    case 'server_error':
      error.suggestion = 'The API server is experiencing issues. Try again later or switch to a different provider.';
      break;
  }
  
  return error;
}

/**
 * Parses an error response to determine the error type
 */
function classifyError(
  _provider: string, 
  statusCode: number, 
  errorText: string
): { type: LLMErrorType; retryAfter?: number } {
  const lowerError = errorText.toLowerCase();
  
  // Rate limit detection
  if (statusCode === 429 || 
      lowerError.includes('rate limit') || 
      lowerError.includes('rate_limit') ||
      lowerError.includes('too many requests') ||
      lowerError.includes('quota exceeded') ||
      lowerError.includes('requests per minute')) {
    // Try to extract retry-after time
    const retryMatch = errorText.match(/retry[- ]?after[:\s]*(\d+)/i) ||
                       errorText.match(/try again in[:\s]*(\d+)/i) ||
                       errorText.match(/(\d+)\s*seconds?/i);
    const retryAfter = retryMatch ? parseInt(retryMatch[1], 10) : undefined;
    return { type: 'rate_limit', retryAfter };
  }
  
  // Auth errors
  if (statusCode === 401 || statusCode === 403 ||
      lowerError.includes('invalid api key') ||
      lowerError.includes('unauthorized') ||
      lowerError.includes('authentication') ||
      lowerError.includes('invalid_api_key')) {
    return { type: 'auth_error' };
  }
  
  // Model not found
  if (statusCode === 404 ||
      lowerError.includes('model not found') ||
      lowerError.includes('model_not_found') ||
      lowerError.includes('does not exist')) {
    return { type: 'model_not_found' };
  }
  
  // Context length
  if (lowerError.includes('context length') ||
      lowerError.includes('context_length') ||
      lowerError.includes('maximum context') ||
      lowerError.includes('token limit') ||
      lowerError.includes('too long')) {
    return { type: 'context_length_exceeded' };
  }
  
  // Server errors
  if (statusCode >= 500) {
    return { type: 'server_error' };
  }
  
  return { type: 'unknown' };
}

/**
 * Check if Ollama is running and available
 */
export async function checkOllamaStatus(): Promise<{ 
  available: boolean; 
  models: string[];
  error?: string;
}> {
  try {
    const ollama = new Ollama({ host: 'http://localhost:11434' });
    const response = await ollama.list();
    return { 
      available: true, 
      models: response.models.map(m => m.name)
    };
  } catch (e) {
    return { 
      available: false, 
      models: [],
      error: e instanceof Error ? e.message : 'Cannot connect to Ollama'
    };
  }
}

export const PROVIDER_INFO: Record<string, ProviderInfo> = {
  openai: {
    description: 'OpenAI provides GPT-4 and GPT-3.5 models with strong reasoning and instruction-following capabilities.',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    apiKeyInstructions: '1. Sign up at platform.openai.com\n2. Go to API Keys section\n3. Click "Create new secret key"\n4. Copy and paste the key here',
    pricing: 'Pay-per-use pricing. GPT-4o-mini offers the lowest cost at approximately $0.15 per million tokens.'
  },
  anthropic: {
    description: 'Anthropic provides Claude models that excel at nuanced analysis and following complex instructions.',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyInstructions: '1. Sign up at console.anthropic.com\n2. Go to Settings → API Keys\n3. Click "Create Key"\n4. Copy and paste the key here',
    pricing: 'Pay-per-use pricing. Claude 3.5 Haiku offers competitive rates for most use cases.'
  },
  groq: {
    description: 'Groq provides high-speed inference for open-source models with a generous free tier.',
    apiKeyUrl: 'https://console.groq.com/keys',
    apiKeyInstructions: '1. Sign up at console.groq.com (free)\n2. Go to API Keys\n3. Click "Create API Key"\n4. Copy and paste the key here',
    pricing: 'Free tier available with generous rate limits. Recommended for initial testing.'
  },
  together: {
    description: 'Together AI provides access to various open-source models with competitive pricing.',
    apiKeyUrl: 'https://api.together.xyz/settings/api-keys',
    apiKeyInstructions: '1. Sign up at together.ai\n2. Go to Settings → API Keys\n3. Create a new API key\n4. Copy and paste the key here',
    pricing: 'Free $5 credit on signup. Pay-per-use pricing thereafter.'
  },
  openrouter: {
    description: 'OpenRouter aggregates multiple LLM providers, offering access to GPT-4, Claude, Llama, and other models through a single API key.',
    apiKeyUrl: 'https://openrouter.ai/keys',
    apiKeyInstructions: '1. Sign up at openrouter.ai\n2. Go to Keys section\n3. Create a new key\n4. Copy and paste the key here',
    pricing: 'Some models available at no cost (e.g., gemini-2.0-flash-exp:free). Others use pay-per-use pricing.'
  },
  ollama: {
    description: 'Ollama enables local model execution on your own hardware. Fully private and free to use.',
    apiKeyUrl: 'https://ollama.ai/download',
    apiKeyInstructions: '1. Download Ollama from ollama.ai\n2. Install and run it\n3. Open terminal and run: ollama pull llama3.2\n4. No API key needed',
    pricing: 'Free - runs entirely on local hardware.'
  }
};

// Version number for the default system prompt - increment this when the prompt changes
// This allows the app to detect when users have an outdated prompt from localStorage
export const SYSTEM_PROMPT_VERSION = 3;

export const LLM_PROVIDERS: LLMProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresApiKey: true
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    requiresApiKey: true
  },
  {
    id: 'groq',
    name: 'Groq (Free Tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    requiresApiKey: true
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    requiresApiKey: true
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.0-flash-exp:free'],
    requiresApiKey: true
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.2', 'mistral', 'qwen2.5'],
    requiresApiKey: false
  }
];

export const DEFAULT_SYSTEM_PROMPT = `You are an expert Anki card reviewer and educator. Your task is to analyze flashcards and suggest improvements based on evidence-based learning principles.

## Card Quality Criteria

A good Anki card should be:

1. **Unambiguous**: Only one reasonable answer exists. The question should be precise enough that there's no confusion about what's being asked.

2. **Atomic**: Tests exactly one fact or concept. Complex information should be broken into multiple cards.

3. **Recognizable**: Uses context from the original source material. Cards should connect to how the information was originally learned.

4. **Active Recall**: Requires genuine recall, not just recognition. Avoid questions where the answer can be guessed from the question.

## Card Types and Their Fields

### Basic Cards
- **Fields**: "Front" (question) and "Back" (answer)
- Use for simple Q&A pairs, definitions, terminology

### Basic (and reversed card)
- **Fields**: "Front" and "Back"
- Creates two cards: Front→Back and Back→Front
- ONLY use this when the relationship is truly bidirectional (e.g., translations, symbol↔name pairs)
- Do NOT use for definitions, explanations, or Q&A where the reverse doesn't make sense
- When in doubt, prefer "basic" over "basic-reversed"

### Cloze Cards
- **Fields**: "Text" (contains cloze deletions) and "Extra" (optional additional context shown alongside the revealed answer)
- Cloze syntax: {{c1::answer}} - the hidden text is revealed when the card is answered
- With optional hint: {{c1::answer::hint}} - only add ::hint when a hint is helpful
- CRITICAL: The cloze deletion should hide a SHORT key term or phrase (1-5 words), NOT an entire sentence or definition!
  - GOOD: "The {{c1::mitochondria}} is the powerhouse of the cell"
  - BAD: "The mitochondria is {{c1::the powerhouse of the cell}}" (hiding too much)
  - BAD: "{{c1::The mitochondria is the powerhouse of the cell}}" (hiding everything defeats the purpose)
- The surrounding text provides context, and the cloze tests recall of the KEY TERM
- When a cloze is revealed, the hidden text is automatically shown in place of the cloze. Do NOT repeat the cloze answers in the Extra field.
- Multiple cloze deletions can use same number (c1) to hide together, or different numbers (c1, c2) for separate cards
- The "Extra" field is for additional context, mnemonics, or images - NOT for repeating the answers

## Your Task

Analyze the provided card and:
1. Evaluate it against each criterion
2. Provide specific, actionable feedback
3. Suggest improved card(s) if needed - USE THE CORRECT FIELD NAMES FOR THE CARD TYPE
4. Recommend deletion of the original if your suggestions replace it completely

## Self-Evaluation of Suggested Cards

BEFORE including a suggested card in your response, you MUST mentally evaluate it against the same criteria:
- Is it unambiguous? Is it atomic? Does it enable active recall?
- Would it score HIGHER than the original card?
- If your suggested card would score lower than or equal to the original, REVISE it until it is genuinely better.
- Only include suggested cards that represent a clear improvement over the original.
- Do NOT suggest a card just for the sake of suggesting something - if the original is good, say so.

## Response Format

Respond with a JSON object in this exact format:
{
  "feedback": {
    "isUnambiguous": boolean,
    "isAtomic": boolean,
    "isRecognizable": boolean,
    "isActiveRecall": boolean,
    "overallScore": number (1-10),
    "issues": ["plain text strings describing problems - NOT card objects"],
    "suggestions": ["plain text strings with improvement tips - NOT card objects"],
    "reasoning": "detailed explanation of your analysis"
  },
  "suggestedCards": [
    // Card objects go HERE, not in feedback.suggestions!
    {
      "type": "basic" | "cloze" | "basic-reversed",
      "fields": [...],
      "explanation": "string"
    }
  ],
  "deleteOriginal": boolean,
  "deleteReason": "explanation if deletion is recommended"
}

CRITICAL: 
- "feedback.issues" and "feedback.suggestions" are arrays of PLAIN TEXT STRINGS, not card objects
- Card objects with "type", "fields", "explanation" go ONLY in the top-level "suggestedCards" array
- Do NOT put card objects inside feedback.suggestions - that causes parsing errors

## STRICT FIELD REQUIREMENTS FOR suggestedCards:

For type "basic" or "basic-reversed":
  "fields": [
    {"name": "Front", "value": "the question or prompt"},
    {"name": "Back", "value": "the answer"}
  ]

For type "cloze":
  "fields": [
    {"name": "Text", "value": "text with {{c1::cloze deletion}} syntax"},
    {"name": "Extra", "value": "optional context, mnemonics, or images - NOT for cloze answers (they show automatically)"}
  ]

IMPORTANT RULES:
- The "type" field MUST be exactly one of: "basic", "cloze", or "basic-reversed"
- Field names are case-sensitive: use "Front"/"Back" for basic, "Text"/"Extra" for cloze
- Cloze format: {{c1::answer}} or {{c1::answer::hint}} - trailing :: only when adding a hint
- When cloze cards are revealed, the answer replaces the cloze marker automatically. Do NOT put cloze answers in Extra.
- Preserve any images by keeping <img> tags exactly as they appear in the original
- Keep all media references intact`;

export function getDefaultConfig(): LLMConfig {
  return {
    providerId: 'groq',
    model: 'llama-3.3-70b-versatile',
    apiKeys: {},
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    systemPromptVersion: SYSTEM_PROMPT_VERSION,
    sendImages: true,
    maxDeckAnalysisCards: 100,
    concurrentDeckAnalysis: false,
    requestDelayMs: 2000, // 2 seconds default delay between requests
    suggestedCardsLayout: 'carousel', // Default to carousel view
    inheritCardMetadata: false, // New cards start fresh by default
    darkMode: true // Dark mode by default
  };
}

// Helper to get API key for current provider
export function getApiKey(config: LLMConfig): string {
  // Handle backwards compatibility with old single apiKey field
  if (!config.apiKeys) {
    return (config as any).apiKey || '';
  }
  return config.apiKeys[config.providerId] || '';
}

// Model info returned from provider APIs
export interface ModelInfo {
  id: string;
  name?: string;
  description?: string;
  contextWindow?: number;
  created?: number;
}

// Cache for fetched models to avoid repeated API calls
const modelCache = new Map<string, { models: ModelInfo[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches available models from a provider's API
 * Supports: OpenAI, Groq, Together, OpenRouter, Ollama
 * Anthropic doesn't have a models endpoint, so we return the static list
 */
export async function fetchProviderModels(
  providerId: string,
  apiKey: string,
  baseUrl?: string
): Promise<ModelInfo[]> {
  // Check cache first
  const cacheKey = `${providerId}:${apiKey.slice(-8)}`; // Use last 8 chars of key for cache key
  const cached = modelCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.models;
  }

  const provider = LLM_PROVIDERS.find(p => p.id === providerId);
  if (!provider) {
    return [];
  }

  const url = baseUrl || provider.baseUrl;

  try {
    let models: ModelInfo[] = [];

    switch (providerId) {
      case 'openai':
      case 'groq':
      case 'together':
      case 'openrouter': {
        // These all use OpenAI-compatible /models endpoint
        const response = await fetch(`${url}/models`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            // OpenRouter requires additional headers
            ...(providerId === 'openrouter' && {
              'HTTP-Referer': window.location.origin,
              'X-Title': 'LLMAnki'
            })
          }
        });

        if (!response.ok) {
          console.warn(`Failed to fetch models from ${providerId}: ${response.status}`);
          return provider.models.map(id => ({ id }));
        }

        const data = await response.json();
        const rawModels = data.data || data.models || [];

        // Filter and sort models
        models = rawModels
          .map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            description: m.description,
            contextWindow: m.context_length || m.context_window,
            created: m.created
          }))
          .filter((m: ModelInfo) => {
            // Filter out embedding models, moderation models, etc.
            const id = m.id.toLowerCase();
            return !id.includes('embed') && 
                   !id.includes('moderation') && 
                   !id.includes('whisper') &&
                   !id.includes('tts') &&
                   !id.includes('dall-e') &&
                   !id.includes('audio');
          })
          .sort((a: ModelInfo, b: ModelInfo) => {
            // Sort by created date (newest first) if available
            if (a.created && b.created) return b.created - a.created;
            return a.id.localeCompare(b.id);
          });
        break;
      }

      case 'ollama': {
        // Use ollama-js library for better integration
        try {
          const ollama = new Ollama({ host: 'http://localhost:11434' });
          const response = await ollama.list();
          models = response.models.map((m: any) => ({
            id: m.name,
            name: m.name,
            description: m.details?.family || m.details?.format,
            contextWindow: m.details?.parameter_size ? parseInt(m.details.parameter_size) : undefined
          }));
        } catch (ollamaError) {
          console.warn('Failed to fetch models from Ollama via library, trying HTTP:', ollamaError);
          // Fallback to HTTP API
          const ollamaUrl = url.replace('/v1', '');
          const response = await fetch(`${ollamaUrl}/api/tags`);

          if (!response.ok) {
            console.warn(`Failed to fetch models from Ollama: ${response.status}`);
            return provider.models.map(id => ({ id }));
          }

          const data = await response.json();
          models = (data.models || []).map((m: any) => ({
            id: m.name,
            name: m.name,
            description: m.details?.family,
            contextWindow: m.details?.parameter_size
          }));
        }
        break;
      }

      case 'anthropic': {
        // Anthropic doesn't have a public models endpoint
        // Return the static list
        return provider.models.map(id => ({ id }));
      }

      default:
        return provider.models.map(id => ({ id }));
    }

    // Cache the results
    if (models.length > 0) {
      modelCache.set(cacheKey, { models, timestamp: Date.now() });
    }

    return models.length > 0 ? models : provider.models.map(id => ({ id }));
  } catch (error) {
    console.warn(`Error fetching models from ${providerId}:`, error);
    // Fall back to static list
    return provider.models.map(id => ({ id }));
  }
}

/**
 * Clears the model cache for a specific provider or all providers
 */
export function clearModelCache(providerId?: string): void {
  if (providerId) {
    // Clear all cache entries for this provider
    for (const key of modelCache.keys()) {
      if (key.startsWith(`${providerId}:`)) {
        modelCache.delete(key);
      }
    }
  } else {
    modelCache.clear();
  }
}

function buildCardDescription(card: RenderedCard, sendImages: boolean = true): string {
  const lines = [
    `## Card Information`,
    `- **Type**: ${card.type}`,
    `- **Deck**: ${card.deckName}`,
    `- **Model**: ${card.modelName}`,
    `- **Tags**: ${card.tags.join(', ') || 'none'}`,
    '',
    '## Card Content',
    ''
  ];
  
  if (card.type === 'cloze') {
    lines.push('### Fields (Cloze Card):');
    for (const field of card.fields) {
      lines.push(`**${field.name}**:`);
      lines.push(stripHtmlForLLM(field.value, sendImages));
      lines.push('');
    }
  } else {
    lines.push('### Front:');
    lines.push(stripHtmlForLLM(card.front, sendImages));
    lines.push('');
    lines.push('### Back:');
    lines.push(stripHtmlForLLM(card.back, sendImages));
    lines.push('');
    lines.push('### Raw Fields:');
    for (const field of card.fields) {
      lines.push(`**${field.name}**: ${stripHtmlForLLM(field.value, sendImages)}`);
    }
  }
  
  return lines.join('\n');
}

function stripHtmlForLLM(html: string, sendImages: boolean = true): string {
  let text = html;
  
  if (sendImages) {
    // Convert img tags to descriptive text with filename
    // For base64 images, just note the image type
    text = text.replace(/<img[^>]+src=["']data:image\/([^;]+);base64,[^"']+["'][^>]*>/gi, '[IMAGE: embedded $1 image]');
    // For regular URLs, show the filename
    text = text.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (_match, src) => {
      // Extract just the filename from the path
      const filename = src.split('/').pop()?.split('?')[0] || src;
      return `[IMAGE: ${filename}]`;
    });
  } else {
    // When not sending images, just note that images exist but aren't analyzed
    // Remove the base64 data to avoid massive token usage
    text = text.replace(/<img[^>]+src=["']data:image\/([^;]+);base64,[^"']+["'][^>]*>/gi, '[IMAGE: embedded $1 image - not analyzed]');
    text = text.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (_match, src) => {
      const filename = src.split('/').pop()?.split('?')[0] || src;
      return `[IMAGE: ${filename} - not analyzed]`;
    });
  }
  
  // Remove other HTML tags but keep content
  text = text.replace(/<(?!img)[^>]+>/g, '');
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

// Extract all image tags from HTML content
function extractImages(html: string): string[] {
  const imgRegex = /<img[^>]*>/gi;
  return html.match(imgRegex) || [];
}

// Inject images from original card into suggested cards
function injectImagesIntoSuggestedCards(
  result: LLMAnalysisResult, 
  originalCard: RenderedCard
): LLMAnalysisResult {
  // Extract images from original card's front and back
  const frontImages = extractImages(originalCard.front);
  const backImages = extractImages(originalCard.back);
  
  // Also extract from fields for cloze cards
  const fieldImages: Record<string, string[]> = {};
  for (const field of originalCard.fields) {
    fieldImages[field.name.toLowerCase()] = extractImages(field.value);
  }
  
  // If no images in original, return as-is
  if (frontImages.length === 0 && backImages.length === 0 && Object.values(fieldImages).every(arr => arr.length === 0)) {
    return result;
  }
  
  // Inject images into suggested cards
  const updatedCards = result.suggestedCards.map(card => {
    const updatedFields = card.fields.map(field => {
      const fieldNameLower = field.name.toLowerCase();
      let newValue = field.value;
      
      // For basic cards: inject front images into Front, back images into Back
      if (fieldNameLower === 'front' && frontImages.length > 0) {
        // Add images at the end if not already present
        const existingImages = extractImages(newValue);
        if (existingImages.length === 0) {
          newValue = newValue + '\\n' + frontImages.join('\\n');
        }
      } else if (fieldNameLower === 'back' && backImages.length > 0) {
        const existingImages = extractImages(newValue);
        if (existingImages.length === 0) {
          newValue = newValue + '\\n' + backImages.join('\\n');
        }
      }
      // For cloze cards: inject Text images into Text, Extra images into Extra
      else if (fieldNameLower === 'text') {
        // For cloze, use the Text field images or front images
        const textImages = fieldImages['text'] || frontImages;
        if (textImages.length > 0) {
          const existingImages = extractImages(newValue);
          if (existingImages.length === 0) {
            newValue = newValue + '\\n' + textImages.join('\\n');
          }
        }
      } else if (fieldNameLower === 'extra') {
        // For Extra field, use Extra field images or back images
        const extraImages = fieldImages['extra'] || backImages;
        if (extraImages.length > 0) {
          const existingImages = extractImages(newValue);
          if (existingImages.length === 0) {
            newValue = newValue + '\\n' + extraImages.join('\\n');
          }
        }
      }
      
      return { ...field, value: newValue };
    });
    
    return { ...card, fields: updatedFields };
  });
  
  return { ...result, suggestedCards: updatedCards };
}

export async function analyzeCard(
  card: RenderedCard,
  config: LLMConfig,
  additionalPrompt?: string
): Promise<LLMAnalysisResult> {
  const provider = LLM_PROVIDERS.find(p => p.id === config.providerId);
  if (!provider) {
    throw createLLMError(`Unknown provider: ${config.providerId}`, 'unknown', config.providerId);
  }
  
  const apiKey = getApiKey(config);
  const cardDescription = buildCardDescription(card, config.sendImages);
  
  let userMessage = `Please analyze this Anki card and provide feedback:\n\n${cardDescription}`;
  
  if (additionalPrompt?.trim()) {
    userMessage += `\n\n## Additional Instructions\n${additionalPrompt.trim()}`;
  }
  
  try {
    // Use ollama-js for Ollama provider
    if (config.providerId === 'ollama') {
      return await analyzeWithOllama(card, config, userMessage);
    }
    
    let response: Response;
    
    if (config.providerId === 'anthropic') {
      // Anthropic has a different API format
      response = await fetch(`${provider.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 4096,
          system: config.systemPrompt,
          messages: [
            { role: 'user', content: userMessage }
          ]
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        const { type, retryAfter } = classifyError('anthropic', response.status, errorText);
        throw createLLMError(
          `Anthropic API error: ${errorText}`,
          type,
          'anthropic',
          response.status,
          retryAfter
        );
      }
      
      const data = await response.json();
      const content = data.content[0].text;
      const result = parseAnalysisResponse(content);
      return injectImagesIntoSuggestedCards(result, card);
    } else {
      // OpenAI-compatible API (OpenAI, Groq, Together, OpenRouter)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      // OpenRouter requires additional headers
      if (config.providerId === 'openrouter') {
        headers['HTTP-Referer'] = window.location.origin;
        headers['X-Title'] = 'LLMAnki';
      }
      
      const messages = [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: userMessage }
      ];
      
      response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.7,
          max_tokens: 4096
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        const { type, retryAfter } = classifyError(config.providerId, response.status, errorText);
        throw createLLMError(
          `API error: ${errorText}`,
          type,
          config.providerId,
          response.status,
          retryAfter
        );
      }
      
      const data = await response.json();
      const content = data.choices[0].message.content;
      const result = parseAnalysisResponse(content);
      return injectImagesIntoSuggestedCards(result, card);
    }
  } catch (error) {
    // Re-throw LLMErrors as-is
    if ((error as LLMError).type) {
      throw error;
    }
    
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw createLLMError(
        `Network error: ${error.message}`,
        'connection_error',
        config.providerId
      );
    }
    
    // Wrap other errors
    throw createLLMError(
      error instanceof Error ? error.message : String(error),
      'unknown',
      config.providerId
    );
  }
}

/**
 * Analyze a card using Ollama via ollama-js library
 */
async function analyzeWithOllama(
  card: RenderedCard,
  config: LLMConfig,
  userMessage: string
): Promise<LLMAnalysisResult> {
  try {
    const ollama = new Ollama({ host: 'http://localhost:11434' });
    
    const response = await ollama.chat({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: userMessage }
      ],
      options: {
        temperature: 0.7
      }
    });
    
    const content = response.message.content;
    const result = parseAnalysisResponse(content);
    return injectImagesIntoSuggestedCards(result, card);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Detect specific Ollama errors
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Failed to fetch')) {
      throw createLLMError(
        'Cannot connect to Ollama server',
        'connection_error',
        'ollama'
      );
    }
    
    if (errorMessage.includes('model') && errorMessage.includes('not found')) {
      throw createLLMError(
        `Model "${config.model}" not found`,
        'model_not_found',
        'ollama'
      );
    }
    
    throw createLLMError(errorMessage, 'unknown', 'ollama');
  }
}

function parseAnalysisResponse(content: string): LLMAnalysisResult {
  // Extract JSON from the response (it might be wrapped in markdown code blocks or have headers)
  let jsonStr = content;
  
  // Try to extract JSON from code blocks first
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    // Try to find raw JSON object - look for the first { and last } that form a valid JSON
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = content.substring(firstBrace, lastBrace + 1);
    }
  }
  
  try {
    const parsed = JSON.parse(jsonStr.trim());
    
    // Helper to check if something looks like a SuggestedCard object
    const isSuggestedCard = (item: unknown): item is { type: string; fields: unknown[]; explanation?: string } => {
      return typeof item === 'object' && item !== null && 
             'type' in item && 'fields' in item && 
             Array.isArray((item as { fields: unknown[] }).fields);
    };
    
    // Extract string suggestions and misplaced card objects
    const rawIssues = parsed.feedback?.issues ?? [];
    const rawSuggestions = parsed.feedback?.suggestions ?? [];
    
    const stringIssues: string[] = [];
    const stringSuggestions: string[] = [];
    const misplacedCards: { type: string; fields: unknown[]; explanation?: string }[] = [];
    
    // Process issues - extract strings, detect misplaced cards
    for (const item of rawIssues) {
      if (typeof item === 'string') {
        stringIssues.push(item);
      } else if (isSuggestedCard(item)) {
        misplacedCards.push(item);
      }
    }
    
    // Process suggestions - extract strings, detect misplaced cards  
    for (const item of rawSuggestions) {
      if (typeof item === 'string') {
        stringSuggestions.push(item);
      } else if (isSuggestedCard(item)) {
        misplacedCards.push(item);
      }
    }
    
    // Combine proper suggestedCards with any misplaced ones
    const allSuggestedCards = [...(parsed.suggestedCards ?? []), ...misplacedCards];
    
    // Validate and provide defaults
    return {
      feedback: {
        isUnambiguous: parsed.feedback?.isUnambiguous ?? true,
        isAtomic: parsed.feedback?.isAtomic ?? true,
        isRecognizable: parsed.feedback?.isRecognizable ?? true,
        isActiveRecall: parsed.feedback?.isActiveRecall ?? true,
        overallScore: parsed.feedback?.overallScore ?? 5,
        issues: stringIssues,
        suggestions: stringSuggestions,
        reasoning: parsed.feedback?.reasoning ?? ''
      },
      suggestedCards: allSuggestedCards,
      deleteOriginal: parsed.deleteOriginal ?? false,
      deleteReason: parsed.deleteReason
    };
  } catch {
    // If parsing fails, create a minimal result with the raw text
    return {
      feedback: {
        isUnambiguous: true,
        isAtomic: true,
        isRecognizable: true,
        isActiveRecall: true,
        overallScore: 5,
        issues: [],
        suggestions: [],
        reasoning: `Failed to parse LLM response. Raw response:\n\n${content}`
      },
      suggestedCards: [],
      deleteOriginal: false
    };
  }
}

// Deck analysis function
/**
 * Analyze individual cards in a deck. Stops immediately on error.
 * This only runs LLM analysis on cards, does NOT generate deck-level insights.
 */
export async function analyzeCardsInDeck(
  collection: AnkiCollection,
  cards: AnkiCard[],
  config: LLMConfig,
  onProgress?: (current: number, total: number, cardId?: number, result?: LLMAnalysisResult, fields?: { name: string; value: string }[]) => void,
  isCancelled?: () => boolean,
  existingCache?: Map<number, LLMAnalysisResult>
): Promise<{ results: { cardId: number; result: LLMAnalysisResult }[]; error?: string }> {
  const results: { cardId: number; result: LLMAnalysisResult }[] = [];
  
  // Analyze cards (use configurable limit)
  const maxCards = config.maxDeckAnalysisCards || 100;
  const cardsToAnalyze = cards.slice(0, maxCards);
  
  // Separate cards into already-analyzed and new
  const cachedCards: { cardId: number; result: LLMAnalysisResult }[] = [];
  const newCards: AnkiCard[] = [];
  
  for (const card of cardsToAnalyze) {
    const cached = existingCache?.get(card.id);
    if (cached && !cached.error) {
      // Use cached result (skip re-analysis)
      cachedCards.push({ cardId: card.id, result: cached });
    } else {
      newCards.push(card);
    }
  }
  
  // Add cached results first
  results.push(...cachedCards);
  
  // Report progress for cached cards
  if (cachedCards.length > 0) {
    onProgress?.(cachedCards.length, cardsToAnalyze.length);
  }
  
  // If all cards are cached, we're done
  if (newCards.length === 0) {
    return { results };
  }
  
  const delay = config.requestDelayMs || 2000;
  
  if (config.concurrentDeckAnalysis) {
    // Concurrent analysis - process cards in parallel batches
    const batchSize = 5;
    let completed = cachedCards.length;
    
    for (let batchStart = 0; batchStart < newCards.length; batchStart += batchSize) {
      if (isCancelled?.()) break;
      
      const batch = newCards.slice(batchStart, batchStart + batchSize);
      
      try {
        const batchPromises = batch.map(async (card) => {
          if (isCancelled?.()) return null;
          
          const renderedCard = await renderCard(collection, card);
          const result = await analyzeCard(renderedCard, config);
          return { cardId: card.id, result, fields: renderedCard.fields };
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
          if (result) {
            results.push({ cardId: result.cardId, result: result.result });
            completed++;
            onProgress?.(completed, cardsToAnalyze.length, result.cardId, result.result, result.fields);
          }
        }
      } catch (e) {
        // Stop on any error
        const errorMessage = e instanceof Error ? e.message : 'Analysis failed';
        console.error('Card analysis failed:', e);
        return { results, error: errorMessage };
      }
      
      // Delay between batches
      if (batchStart + batchSize < newCards.length && !isCancelled?.()) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  } else {
    // Serial analysis - process cards one at a time
    for (let i = 0; i < newCards.length; i++) {
      if (isCancelled?.()) break;
      
      const card = newCards[i];
      const currentProgress = cachedCards.length + i + 1;
      onProgress?.(currentProgress, cardsToAnalyze.length);
      
      try {
        const renderedCard = await renderCard(collection, card);
        const result = await analyzeCard(renderedCard, config);
        results.push({ cardId: card.id, result });
        onProgress?.(currentProgress, cardsToAnalyze.length, card.id, result, renderedCard.fields);
      } catch (e) {
        // Stop on any error
        const errorMessage = e instanceof Error ? e.message : 'Analysis failed';
        console.error(`Failed to analyze card ${card.id}:`, e);
        return { results, error: errorMessage };
      }
      
      // Delay between requests
      if (i < newCards.length - 1 && !isCancelled?.()) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  return { results };
}

/**
 * Generate deck-level insights from already-analyzed cards.
 * This uses the cache only - does NOT analyze individual cards.
 */
export async function generateDeckInsights(
  deck: AnkiDeck,
  totalCards: number,
  analysisCache: Map<number, LLMAnalysisResult>,
  cardIds: number[],
  config: LLMConfig,
  additionalPrompt?: string,
  collection?: AnkiCollection,
  cards?: AnkiCard[]
): Promise<DeckAnalysisResult> {
  // Gather results from cache
  const results: { cardId: number; result: LLMAnalysisResult }[] = [];
  for (const cardId of cardIds) {
    const cached = analysisCache.get(cardId);
    if (cached && !cached.error) {
      results.push({ cardId, result: cached });
    }
  }
  
  if (results.length === 0) {
    return {
      deckId: deck.id,
      deckName: deck.name,
      totalCards,
      analyzedCards: 0,
      averageScore: 0,
      scoreDistribution: [],
      knowledgeCoverage: null,
      deckSummary: '',
      suggestedNewCards: [],
      addedSuggestedCardIndices: [],
      totalSuggestedFromCards: 0,
      error: 'No analyzed cards to generate insights from. Please analyze cards first.'
    };
  }
  
  // Render sample cards to get actual content for knowledge coverage analysis
  let cardContents: { front: string; back: string }[] = [];
  if (collection && cards && cards.length > 0) {
    // Take a sample of cards spread across the deck
    const sampleSize = Math.min(30, cards.length);
    const step = Math.max(1, Math.floor(cards.length / sampleSize));
    const sampleCards = [];
    for (let i = 0; i < cards.length && sampleCards.length < sampleSize; i += step) {
      sampleCards.push(cards[i]);
    }
    
    // Render the sampled cards
    for (const card of sampleCards) {
      try {
        const rendered = await renderCard(collection, card);
        // Strip HTML tags for cleaner content
        const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();
        cardContents.push({
          front: stripHtml(rendered.front).slice(0, 300),
          back: stripHtml(rendered.back).slice(0, 300)
        });
      } catch {
        // Skip cards that fail to render
      }
    }
  }
  
  // Calculate statistics
  const scores = results.map(r => r.result.feedback.overallScore);
  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  
  // Score distribution
  const scoreDistribution: { score: number; count: number }[] = [];
  for (let score = 1; score <= 10; score++) {
    scoreDistribution.push({
      score,
      count: scores.filter(s => Math.floor(s) === score || (score === 10 && s === 10)).length
    });
  }
  
  // Count total suggested cards from all card analyses
  const totalSuggestedFromCards = results.reduce((sum, r) => sum + r.result.suggestedCards.length, 0);
  
  // Generate deck summary, knowledge coverage, and suggestions using LLM
  const summaryAndSuggestions = await generateDeckSummaryWithCoverage(
    deck,
    results,
    config,
    additionalPrompt,
    cardContents
  );
  
  return {
    deckId: deck.id,
    deckName: deck.name,
    totalCards,
    analyzedCards: results.length,
    averageScore: Math.round(averageScore * 10) / 10,
    scoreDistribution,
    knowledgeCoverage: summaryAndSuggestions.knowledgeCoverage,
    deckSummary: summaryAndSuggestions.summary,
    suggestedNewCards: summaryAndSuggestions.suggestedCards,
    addedSuggestedCardIndices: [],
    totalSuggestedFromCards,
    error: summaryAndSuggestions.error
  };
}

// Legacy function for backwards compatibility - combines both steps
export async function analyzeDeck(
  collection: AnkiCollection,
  deck: AnkiDeck,
  cards: AnkiCard[],
  config: LLMConfig,
  additionalPrompt?: string,
  onProgress?: (current: number, total: number, cardId?: number, result?: LLMAnalysisResult, fields?: { name: string; value: string }[]) => void,
  isCancelled?: () => boolean,
  existingCache?: Map<number, LLMAnalysisResult>
): Promise<DeckAnalysisResult> {
  // First analyze cards
  const { results, error } = await analyzeCardsInDeck(
    collection,
    cards,
    config,
    onProgress,
    isCancelled,
    existingCache
  );
  
  if (error) {
    // Return partial results with error
    return {
      deckId: deck.id,
      deckName: deck.name,
      totalCards: cards.length,
      analyzedCards: results.length,
      averageScore: 0,
      scoreDistribution: [],
      knowledgeCoverage: null,
      deckSummary: '',
      suggestedNewCards: [],
      addedSuggestedCardIndices: [],
      totalSuggestedFromCards: 0,
      error
    };
  }
  
  if (isCancelled?.()) {
    // Return partial results if cancelled
    const scores = results.map(r => r.result.feedback.overallScore);
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    
    return {
      deckId: deck.id,
      deckName: deck.name,
      totalCards: cards.length,
      analyzedCards: results.length,
      averageScore: Math.round(averageScore * 10) / 10,
      scoreDistribution: [],
      knowledgeCoverage: null,
      deckSummary: '',
      suggestedNewCards: [],
      addedSuggestedCardIndices: [],
      totalSuggestedFromCards: 0
    };
  }
  
  // Build a cache from results for generateDeckInsights
  const resultsCache = new Map<number, LLMAnalysisResult>();
  for (const { cardId, result } of results) {
    resultsCache.set(cardId, result);
  }
  
  // Generate insights
  return generateDeckInsights(
    deck,
    cards.length,
    resultsCache,
    results.map(r => r.cardId),
    config,
    additionalPrompt
  );
}

// Generate deck summary with knowledge coverage analysis
async function generateDeckSummaryWithCoverage(
  deck: AnkiDeck,
  results: { cardId: number; result: LLMAnalysisResult }[],
  config: LLMConfig,
  additionalPrompt?: string,
  cardContents?: { front: string; back: string }[]
): Promise<{ summary: string; knowledgeCoverage: KnowledgeCoverage | null; suggestedCards: SuggestedCard[]; error?: string }> {
  const provider = LLM_PROVIDERS.find(p => p.id === config.providerId);
  if (!provider) {
    return { summary: '', knowledgeCoverage: null, suggestedCards: [], error: 'No LLM provider configured' };
  }
  
  const scores = results.map(r => r.result.feedback.overallScore);
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A';
  
  const systemPrompt = `You are an expert curriculum designer and subject matter analyst. Your task is to analyze flashcard content to assess KNOWLEDGE COVERAGE of the subject matter.

IMPORTANT: Focus on the SUBJECT MATTER being studied, NOT on Anki card quality. Analyze what topics/concepts the cards cover and what important topics are MISSING from the deck.

You MUST respond with valid JSON only. No markdown, no code blocks, just raw JSON:

{
  "summary": "A 2-3 paragraph summary describing what subject/field this deck covers and how comprehensive it is.",
  "knowledgeCoverage": {
    "overallCoverage": "excellent|good|fair|poor",
    "coverageScore": 7,
    "summary": "A paragraph explaining how well this deck covers the subject matter. Focus on topic breadth and depth.",
    "coveredTopics": ["Specific subject topic 1", "Specific subject topic 2", "Specific subject topic 3"],
    "gaps": [
      {
        "topic": "Missing Subject Matter Topic",
        "importance": "high|medium|low",
        "description": "What specific knowledge in this field is not covered by the cards"
      }
    ],
    "recommendations": [
      "Add cards covering [specific subject matter topic]",
      "Include more depth on [specific concept in the field]"
    ]
  },
  "suggestedCards": [
    {
      "type": "basic",
      "fields": [
        {"name": "Front", "value": "Question about missing subject matter"},
        {"name": "Back", "value": "Answer with the missing knowledge"}
      ],
      "explanation": "This card fills the gap in [subject topic] by covering [specific knowledge]"
    }
  ]
}

CRITICAL INSTRUCTIONS:
1. Analyze the SUBJECT MATTER being studied, not card formatting or Anki best practices
2. coveredTopics should list actual subject matter topics the cards teach (e.g., "Photosynthesis", "World War 2 causes", "Python list comprehensions")
3. gaps should identify SUBJECT MATTER topics that are missing or under-covered in this field
4. DO NOT mention card quality, formatting, or Anki-related issues in gaps - only missing subject knowledge
5. Suggest 3-5 cards that teach MISSING SUBJECT MATTER content
6. "type" must be exactly "basic" or "cloze"
7. For basic cards: use field names "Front" and "Back"
8. For cloze cards: use field names "Text" and optionally "Extra"
9. Cloze syntax: {{c1::answer}} - do NOT include a trailing :: unless adding a hint
10. coverageScore should be 1-10 (10 = excellent subject matter coverage)`;

  // Build card content list for the LLM
  let cardContentSection = '';
  if (cardContents && cardContents.length > 0) {
    cardContentSection = `\n\nACTUAL CARD CONTENT (sample of ${cardContents.length} cards):\n`;
    cardContentSection += cardContents.slice(0, 25).map((c, i) => 
      `Card ${i + 1}:\n  Q: ${c.front}\n  A: ${c.back}`
    ).join('\n\n');
  }

  let userMessage = `Analyze the SUBJECT MATTER coverage of this Anki deck:

Deck Name: ${deck.name}
Total Cards: ${results.length}
Average Card Quality Score: ${avgScore}/10
${cardContentSection}`;

  if (additionalPrompt?.trim()) {
    userMessage += `\n\nUser's Focus/Request: ${additionalPrompt.trim()}`;
  }

  userMessage += `

Based on the card content above, identify:
1. What subject/field is this deck teaching?
2. What specific topics within that subject are well-covered?
3. What important topics in this subject are MISSING or need more cards?
4. Suggest new cards to fill the knowledge gaps.

Remember: Focus on SUBJECT MATTER gaps, not card formatting or Anki techniques.`;

  try {
    let response: Response;
    const apiKey = getApiKey(config);
    
    if (config.providerId === 'anthropic') {
      response = await fetch(`${provider.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        })
      });
      
      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API error (${response.status}): ${errText}`);
      }
      
      const data = await response.json();
      return parseDeckCoverageResponse(data.content[0].text);
    } else {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      if (config.providerId === 'openrouter') {
        headers['HTTP-Referer'] = window.location.origin;
        headers['X-Title'] = 'LLMAnki';
      }
      
      response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: 4096
        })
      });
      
      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API error (${response.status}): ${errText}`);
      }
      
      const data = await response.json();
      return parseDeckCoverageResponse(data.choices[0].message.content);
    }
  } catch (e) {
    console.error('Failed to generate deck summary with coverage:', e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { 
      summary: '', 
      knowledgeCoverage: null,
      suggestedCards: [], 
      error: `Failed to generate deck analysis: ${errorMessage}` 
    };
  }
}

function parseDeckCoverageResponse(content: string): { summary: string; knowledgeCoverage: KnowledgeCoverage | null; suggestedCards: SuggestedCard[]; error?: string } {
  console.log('Parsing deck coverage response:', content.substring(0, 500));
  
  let jsonStr = content;
  
  // Try to extract JSON from code blocks first
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    // Try to find the outermost JSON object
    const startIdx = content.indexOf('{');
    if (startIdx !== -1) {
      let braceCount = 0;
      let endIdx = startIdx;
      for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') braceCount--;
        if (braceCount === 0) {
          endIdx = i;
          break;
        }
      }
      jsonStr = content.substring(startIdx, endIdx + 1);
    }
  }
  
  try {
    const parsed = JSON.parse(jsonStr.trim());
    console.log('Parsed deck coverage:', { 
      summary: parsed.summary?.substring(0, 100), 
      hasKnowledgeCoverage: !!parsed.knowledgeCoverage,
      cardsCount: parsed.suggestedCards?.length 
    });
    
    // Parse knowledge coverage
    let knowledgeCoverage: KnowledgeCoverage | null = null;
    if (parsed.knowledgeCoverage) {
      const kc = parsed.knowledgeCoverage;
      const validCoverage = ['excellent', 'good', 'fair', 'poor'].includes(kc.overallCoverage) 
        ? kc.overallCoverage 
        : 'fair';
      
      knowledgeCoverage = {
        overallCoverage: validCoverage,
        coverageScore: typeof kc.coverageScore === 'number' ? Math.min(10, Math.max(1, kc.coverageScore)) : 5,
        summary: String(kc.summary || ''),
        coveredTopics: Array.isArray(kc.coveredTopics) ? kc.coveredTopics.map(String) : [],
        gaps: Array.isArray(kc.gaps) ? kc.gaps.map((g: any) => ({
          topic: String(g.topic || ''),
          importance: ['high', 'medium', 'low'].includes(g.importance) ? g.importance : 'medium',
          description: String(g.description || '')
        })) : [],
        recommendations: Array.isArray(kc.recommendations) ? kc.recommendations.map(String) : []
      };
    }
    
    // Validate and transform suggestedCards
    const suggestedCards: SuggestedCard[] = [];
    if (Array.isArray(parsed.suggestedCards)) {
      for (const card of parsed.suggestedCards) {
        if (card && typeof card === 'object') {
          const type = ['basic', 'cloze', 'basic-reversed'].includes(card.type) ? card.type : 'basic';
          
          let fields: { name: string; value: string }[] = [];
          if (Array.isArray(card.fields)) {
            fields = card.fields.map((f: any) => ({
              name: String(f.name || 'Field'),
              value: String(f.value || '')
            }));
          }
          
          suggestedCards.push({
            type,
            fields,
            explanation: String(card.explanation || '')
          });
        }
      }
    }
    
    return {
      summary: String(parsed.summary || 'No summary available'),
      knowledgeCoverage,
      suggestedCards
    };
  } catch (e) {
    console.error('Failed to parse deck coverage JSON:', e, 'Content:', jsonStr.substring(0, 500));
    
    // Fallback: try to extract just the summary text
    const summaryMatch = content.match(/"summary"\s*:\s*"([^"]+)"/);
    if (summaryMatch) {
      return { summary: summaryMatch[1], knowledgeCoverage: null, suggestedCards: [] };
    }
    
    return { summary: 'Unable to parse deck analysis. Please try again.', knowledgeCoverage: null, suggestedCards: [] };
  }
}
