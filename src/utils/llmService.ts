import type { LLMProvider, LLMConfig, LLMAnalysisResult, RenderedCard, DeckAnalysisResult, AnkiDeck, AnkiCard, AnkiCollection, SuggestedCard } from '../types';
import { renderCard } from './cardRenderer';

export interface ProviderInfo {
  description: string;
  apiKeyUrl: string;
  apiKeyInstructions: string;
  pricing: string;
}

export const PROVIDER_INFO: Record<string, ProviderInfo> = {
  openai: {
    description: 'OpenAI offers GPT-4 and GPT-3.5 models with excellent reasoning capabilities.',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    apiKeyInstructions: '1. Sign up at platform.openai.com\n2. Go to API Keys section\n3. Click "Create new secret key"\n4. Copy and paste the key here',
    pricing: 'Pay-per-use. GPT-4o-mini is cheapest (~$0.15/1M tokens).'
  },
  anthropic: {
    description: 'Anthropic\'s Claude models excel at nuanced analysis and following complex instructions.',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyInstructions: '1. Sign up at console.anthropic.com\n2. Go to Settings → API Keys\n3. Click "Create Key"\n4. Copy and paste the key here',
    pricing: 'Pay-per-use. Claude 3.5 Haiku is most affordable.'
  },
  groq: {
    description: 'Groq offers extremely fast inference with open-source models. Great free tier!',
    apiKeyUrl: 'https://console.groq.com/keys',
    apiKeyInstructions: '1. Sign up at console.groq.com (free)\n2. Go to API Keys\n3. Click "Create API Key"\n4. Copy and paste the key here',
    pricing: '✨ FREE tier with generous limits! Perfect for getting started.'
  },
  together: {
    description: 'Together AI provides access to many open-source models with competitive pricing.',
    apiKeyUrl: 'https://api.together.xyz/settings/api-keys',
    apiKeyInstructions: '1. Sign up at together.ai\n2. Go to Settings → API Keys\n3. Create a new API key\n4. Copy and paste the key here',
    pricing: 'Free $5 credit on signup. Pay-per-use after.'
  },
  openrouter: {
    description: 'OpenRouter aggregates many providers. Access GPT-4, Claude, Llama, and more with one key!',
    apiKeyUrl: 'https://openrouter.ai/keys',
    apiKeyInstructions: '1. Sign up at openrouter.ai\n2. Go to Keys section\n3. Create a new key\n4. Copy and paste the key here',
    pricing: 'Some models are FREE (e.g., gemini-2.0-flash-exp:free). Others are pay-per-use.'
  },
  ollama: {
    description: 'Run models locally on your own machine. Completely free and private!',
    apiKeyUrl: 'https://ollama.ai/download',
    apiKeyInstructions: '1. Download Ollama from ollama.ai\n2. Install and run it\n3. Open terminal and run: ollama pull llama3.2\n4. No API key needed!',
    pricing: '✨ 100% FREE - runs on your own hardware.'
  }
};

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
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
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
- Good for bidirectional associations

### Cloze Cards
- **Fields**: "Text" (contains cloze deletions) and "Extra" (optional additional info shown after answer)
- Cloze deletions use format: {{c1::answer::optional hint}}
- Multiple cloze deletions can use same number (c1) to hide together, or different numbers (c1, c2) for separate cards
- Example Text field: "The {{c1::mitochondria}} is the {{c2::powerhouse}} of the cell"
- The "Extra" field appears below the answer and is useful for context, images, or additional details

## Your Task

Analyze the provided card and:
1. Evaluate it against each criterion
2. Provide specific, actionable feedback
3. Suggest improved card(s) if needed - USE THE CORRECT FIELD NAMES FOR THE CARD TYPE
4. Recommend deletion of the original if your suggestions replace it completely

## Response Format

Respond with a JSON object in this exact format:
{
  "feedback": {
    "isUnambiguous": boolean,
    "isAtomic": boolean,
    "isRecognizable": boolean,
    "isActiveRecall": boolean,
    "overallScore": number (1-10),
    "issues": ["list of specific problems"],
    "suggestions": ["list of improvement suggestions"],
    "reasoning": "detailed explanation of your analysis"
  },
  "suggestedCards": [
    {
      "type": "basic" | "cloze" | "basic-reversed",
      "fields": [
        // For basic/basic-reversed:
        {"name": "Front", "value": "question text"},
        {"name": "Back", "value": "answer text"}
        // For cloze:
        // {"name": "Text", "value": "text with {{c1::cloze}} deletions"},
        // {"name": "Extra", "value": "optional extra info"}
      ],
      "explanation": "why this card format works better"
    }
  ],
  "deleteOriginal": boolean,
  "deleteReason": "explanation if deletion is recommended"
}

IMPORTANT: For cloze cards, use fields named "Text" and "Extra" (not "Front" and "Back").
Preserve any images by keeping the <img> tags exactly as they appear.
Keep media references intact.`;

export function getDefaultConfig(): LLMConfig {
  return {
    providerId: 'groq',
    model: 'llama-3.3-70b-versatile',
    apiKey: '',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    sendImages: true
  };
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
  // Keep img tags for context but simplify
  let text = html;
  
  if (sendImages) {
    // Convert img tags to descriptive text
    text = text.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, '[IMAGE: $1]');
  } else {
    // Remove image references entirely to save tokens
    text = text.replace(/<img[^>]+>/gi, '[IMAGE OMITTED]');
  }
  
  // Remove other HTML tags but keep content
  text = text.replace(/<[^>]+>/g, '');
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

export async function analyzeCard(
  card: RenderedCard,
  config: LLMConfig,
  additionalPrompt?: string
): Promise<LLMAnalysisResult> {
  const provider = LLM_PROVIDERS.find(p => p.id === config.providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${config.providerId}`);
  }
  
  const cardDescription = buildCardDescription(card, config.sendImages);
  
  let userMessage = `Please analyze this Anki card and provide feedback:\n\n${cardDescription}`;
  
  if (additionalPrompt?.trim()) {
    userMessage += `\n\n## Additional Instructions\n${additionalPrompt.trim()}`;
  }
  
  let response: Response;
  
  if (config.providerId === 'anthropic') {
    // Anthropic has a different API format
    response = await fetch(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
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
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }
    
    const data = await response.json();
    const content = data.content[0].text;
    return parseAnalysisResponse(content);
  } else {
    // OpenAI-compatible API (OpenAI, Groq, Together, OpenRouter, Ollama)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
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
      const error = await response.text();
      throw new Error(`API error: ${error}`);
    }
    
    const data = await response.json();
    const content = data.choices[0].message.content;
    return parseAnalysisResponse(content);
  }
}

function parseAnalysisResponse(content: string): LLMAnalysisResult {
  // Extract JSON from the response (it might be wrapped in markdown code blocks)
  let jsonStr = content;
  
  // Try to extract JSON from code blocks
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }
  
  try {
    const parsed = JSON.parse(jsonStr.trim());
    
    // Validate and provide defaults
    return {
      feedback: {
        isUnambiguous: parsed.feedback?.isUnambiguous ?? true,
        isAtomic: parsed.feedback?.isAtomic ?? true,
        isRecognizable: parsed.feedback?.isRecognizable ?? true,
        isActiveRecall: parsed.feedback?.isActiveRecall ?? true,
        overallScore: parsed.feedback?.overallScore ?? 5,
        issues: parsed.feedback?.issues ?? [],
        suggestions: parsed.feedback?.suggestions ?? [],
        reasoning: parsed.feedback?.reasoning ?? ''
      },
      suggestedCards: parsed.suggestedCards ?? [],
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
export async function analyzeDeck(
  collection: AnkiCollection,
  deck: AnkiDeck,
  cards: AnkiCard[],
  config: LLMConfig,
  additionalPrompt?: string,
  onProgress?: (current: number, total: number, cardId?: number, result?: LLMAnalysisResult) => void
): Promise<DeckAnalysisResult> {
  const results: { cardId: number; result: LLMAnalysisResult }[] = [];
  
  // Analyze cards (limit to first 50 for performance)
  const cardsToAnalyze = cards.slice(0, 50);
  
  for (let i = 0; i < cardsToAnalyze.length; i++) {
    const card = cardsToAnalyze[i];
    onProgress?.(i + 1, cardsToAnalyze.length);
    
    try {
      const renderedCard = await renderCard(collection, card);
      const result = await analyzeCard(renderedCard, config);
      results.push({ cardId: card.id, result });
      onProgress?.(i + 1, cardsToAnalyze.length, card.id, result);
    } catch (e) {
      console.error(`Failed to analyze card ${card.id}:`, e);
    }
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  
  // Calculate statistics
  const scores = results.map(r => r.result.feedback.overallScore);
  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  
  // Score distribution
  const scoreDistribution: { score: number; count: number }[] = [];
  for (let score = 1; score <= 10; score++) {
    scoreDistribution.push({
      score,
      count: scores.filter(s => Math.round(s) === score).length
    });
  }
  
  // Common issues
  const issueCount = new Map<string, number>();
  for (const { result } of results) {
    for (const issue of result.feedback.issues) {
      const normalized = issue.toLowerCase().slice(0, 50);
      issueCount.set(normalized, (issueCount.get(normalized) || 0) + 1);
    }
  }
  const commonIssues = Array.from(issueCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([issue, count]) => ({ issue, count }));
  
  // Generate deck summary and suggestions using LLM
  const summaryAndSuggestions = await generateDeckSummary(
    collection,
    deck,
    results,
    config,
    additionalPrompt
  );
  
  return {
    deckId: deck.id,
    deckName: deck.name,
    totalCards: cards.length,
    analyzedCards: results.length,
    averageScore: Math.round(averageScore * 10) / 10,
    scoreDistribution,
    commonIssues,
    deckSummary: summaryAndSuggestions.summary,
    suggestedNewCards: summaryAndSuggestions.suggestedCards
  };
}

async function generateDeckSummary(
  collection: AnkiCollection,
  deck: AnkiDeck,
  results: { cardId: number; result: LLMAnalysisResult }[],
  config: LLMConfig,
  additionalPrompt?: string
): Promise<{ summary: string; suggestedCards: SuggestedCard[] }> {
  const provider = LLM_PROVIDERS.find(p => p.id === config.providerId);
  if (!provider) {
    return { summary: 'Unable to generate summary', suggestedCards: [] };
  }
  
  // Build a summary of the deck contents
  const sampleCards: string[] = [];
  for (const { result } of results.slice(0, 10)) {
    if (result.feedback.reasoning) {
      sampleCards.push(result.feedback.reasoning.slice(0, 200));
    }
  }
  
  const allIssues = results.flatMap(r => r.result.feedback.issues);
  const scores = results.map(r => r.result.feedback.overallScore);
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A';
  
  const systemPrompt = `You are an expert Anki deck reviewer. Based on the analysis of individual cards in a deck, provide:
1. A summary of what this deck covers (topics, concepts)
2. Overall quality assessment
3. Suggest 3-5 NEW cards that would complement this deck well

Respond in JSON format:
{
  "summary": "A 2-3 paragraph summary of the deck contents and quality",
  "suggestedCards": [
    {
      "type": "basic" | "cloze",
      "fields": [
        {"name": "Front" or "Text", "value": "..."},
        {"name": "Back" or "Extra", "value": "..."}
      ],
      "explanation": "why this card would be valuable"
    }
  ]
}`;

  let userMessage = `Analyze this Anki deck and suggest improvements:

Deck Name: ${deck.name}
Total Cards Analyzed: ${results.length}
Average Score: ${avgScore}/10

Common Issues Found:
${allIssues.slice(0, 20).map(i => `- ${i}`).join('\n')}

Sample Card Analyses:
${sampleCards.join('\n---\n')}`;

  if (additionalPrompt?.trim()) {
    userMessage += `\n\nUser's Focus/Request: ${additionalPrompt.trim()}`;
  }

  try {
    let response: Response;
    
    if (config.providerId === 'anthropic') {
      response = await fetch(`${provider.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
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
      
      if (!response.ok) throw new Error('API error');
      
      const data = await response.json();
      return parseDeckSummaryResponse(data.content[0].text);
    } else {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
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
      
      if (!response.ok) throw new Error('API error');
      
      const data = await response.json();
      return parseDeckSummaryResponse(data.choices[0].message.content);
    }
  } catch (e) {
    console.error('Failed to generate deck summary:', e);
    return { summary: 'Unable to generate summary due to an error.', suggestedCards: [] };
  }
}

function parseDeckSummaryResponse(content: string): { summary: string; suggestedCards: SuggestedCard[] } {
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  
  try {
    const parsed = JSON.parse(jsonStr.trim());
    return {
      summary: parsed.summary || 'No summary available',
      suggestedCards: parsed.suggestedCards || []
    };
  } catch {
    return { summary: content, suggestedCards: [] };
  }
}
