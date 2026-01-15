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

// Review log entry from revlog table
export interface ReviewLogEntry {
  id: number; // Timestamp in milliseconds when review was done
  cardId: number;
  ease: number; // 1=Again, 2=Hard, 3=Good, 4=Easy, 0=Manual
  interval: number; // New interval after review (negative = seconds, positive = days)
  lastInterval: number; // Interval before review
  factor: number; // Ease factor after review (permille, e.g., 2500 = 250%)
  time: number; // Time spent on review in milliseconds
  type: number; // 0=Learn, 1=Review, 2=Relearn, 3=Filtered, 4=Manual
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
  revlog: Map<number, ReviewLogEntry[]>; // Card ID -> review entries
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
  // Scheduling metadata
  queue: number;
  due: number;
  interval: number;
  factor: number;
  reps: number;
  lapses: number;
  // Extended scheduling info
  cardCreated: number; // Timestamp when card was created (from card ID)
  firstReview: number | null; // Timestamp of first review
  lastReview: number | null; // Timestamp of most recent review
  totalTime: number; // Total time spent reviewing in milliseconds
  reviewHistory: ReviewLogEntry[]; // Full review history
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
  apiKeys: Record<string, string>; // Per-provider API keys
  systemPrompt: string;
  systemPromptVersion?: number; // Track which version of the default prompt the user has
  sendImages: boolean;
  maxDeckAnalysisCards: number;
  concurrentDeckAnalysis: boolean;
  requestDelayMs: number; // Delay between requests during deck analysis (for rate limiting)
  suggestedCardsLayout: 'carousel' | 'list'; // How to display suggested cards
  inheritCardMetadata: boolean; // Whether new cards should inherit scheduling metadata from original card
  darkMode: boolean; // Dark mode theme
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
  error?: string;
}

// UI State
export interface UndoableAction {
  type: 'add-card' | 'delete-card';
  // For add-card: the card and note that were added
  cardId?: number;
  noteId?: number;
  card?: AnkiCard;
  note?: AnkiNote;
  // For delete-card: the card and note that were deleted
  deletedCard?: AnkiCard;
  deletedNote?: AnkiNote;
  deckId: number;
}

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

// Knowledge coverage analysis for a deck
export interface KnowledgeCoverage {
  overallCoverage: 'excellent' | 'good' | 'fair' | 'poor';
  coverageScore: number; // 1-10
  summary: string; // Overall assessment of knowledge coverage
  coveredTopics: string[]; // Topics well covered by the deck
  gaps: { topic: string; importance: 'high' | 'medium' | 'low'; description: string }[];
  recommendations: string[]; // Specific recommendations to improve coverage
}

// Deck-level analysis
export interface DeckAnalysisResult {
  deckId: number;
  deckName: string;
  totalCards: number;
  analyzedCards: number;
  averageScore: number;
  scoreDistribution: { score: number; count: number }[];
  knowledgeCoverage: KnowledgeCoverage | null;
  deckSummary: string;
  suggestedNewCards: SuggestedCard[];
  addedSuggestedCardIndices: number[]; // Track which suggested cards have been added
  totalSuggestedFromCards: number;
  error?: string;
}
