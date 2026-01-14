// Anki Card Types
export type CardType = 'basic' | 'basic-reversed' | 'cloze' | 'basic-type' | 'basic-optional-reversed';

export interface AnkiCard {
  id: number;
  noteId: number;
  deckId: number;
  ordinal: number;
  type: CardType;
  queue: number;
  due: number;
  interval: number;
  factor: number;
  reps: number;
  lapses: number;
}

export interface AnkiNote {
  id: number;
  modelId: number;
  fields: string[];
  tags: string[];
  guid: string;
  mod: number;
}

export interface AnkiModel {
  id: number;
  name: string;
  type: number; // 0 = standard, 1 = cloze
  fields: AnkiField[];
  templates: AnkiTemplate[];
  css: string;
}

export interface AnkiField {
  name: string;
  ordinal: number;
  sticky: boolean;
}

export interface AnkiTemplate {
  name: string;
  ordinal: number;
  questionFormat: string;
  answerFormat: string;
}

export interface AnkiDeck {
  id: number;
  name: string;
  description: string;
  parentId?: number;
  children: AnkiDeck[];
}

export interface AnkiCollection {
  decks: Map<number, AnkiDeck>;
  models: Map<number, AnkiModel>;
  notes: Map<number, AnkiNote>;
  cards: Map<number, AnkiCard>;
  media: Map<string, Blob>;
  deckTree: AnkiDeck[];
}

// Rendered card for display
export interface RenderedCard {
  id: number;
  noteId: number;
  deckId: number;
  deckName: string;
  modelName: string;
  type: CardType;
  front: string;
  back: string;
  fields: { name: string; value: string }[];
  tags: string[];
  css: string;
}

// LLM Types
export interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  requiresApiKey: boolean;
}

export interface LLMConfig {
  providerId: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  sendImages: boolean;
}

export interface CardFeedback {
  isUnambiguous: boolean;
  isAtomic: boolean;
  isRecognizable: boolean;
  isActiveRecall: boolean;
  overallScore: number;
  issues: string[];
  suggestions: string[];
  reasoning: string;
}

export interface SuggestedCard {
  type: CardType;
  fields: { name: string; value: string }[];
  explanation: string;
}

export interface LLMAnalysisResult {
  feedback: CardFeedback;
  suggestedCards: SuggestedCard[];
  deleteOriginal: boolean;
  deleteReason?: string;
}

// UI State
export interface CardChange {
  type: 'add' | 'delete' | 'modify';
  originalCardId?: number;
  newCard?: SuggestedCard;
  committed: boolean;
}

export interface AppSettings {
  llmConfig: LLMConfig;
  autoSave: boolean;
  showAdvancedOptions: boolean;
}

// Deck-level analysis
export interface DeckAnalysisResult {
  deckId: number;
  deckName: string;
  totalCards: number;
  analyzedCards: number;
  averageScore: number;
  scoreDistribution: { score: number; count: number }[];
  commonIssues: { issue: string; count: number }[];
  deckSummary: string;
  suggestedNewCards: SuggestedCard[];
}
