// Anki Card Types
export type CardType = 'basic' | 'basic-reversed' | 'cloze' | 'basic-type' | 'basic-optional-reversed';

/**
 * Represents a single field on a card with name and value.
 * This is the canonical type used throughout the application for card fields.
 */
export interface CardField {
  name: string;
  value: string;
}

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
  /** Card modification time (epoch seconds) */
  mod?: number;
  /** Update sequence number */
  usn?: number;
  /** Learning steps left: a*1000+b where a=reps today, b=reps till graduation */
  left: number;
  /** Original due date - used for filtered decks or scheduler migration */
  odue: number;
  /** Original deck ID - used when card is in a filtered deck */
  odid: number;
  /** Flags: value mod 8 gives color (0=none, 1=red, 2=orange, 3=green, 4=blue) */
  flags: number;
  /** Extra card data (JSON string in modern schema) */
  data?: string;
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
  /** Update sequence number */
  usn?: number;
  /** Sort field (cached) */
  sfld?: string;
  /** Checksum of sort field */
  csum?: number;
  /** Flags field */
  flags?: number;
  /** Extra note data */
  data?: string;
}

export interface AnkiModel {
  id: number;
  name: string;
  /** Model type: 0 = standard, 1 = cloze */
  type: number;
  fields: AnkiField[];
  templates: AnkiTemplate[];
  css: string;
  /** LaTeX preamble (usually \\documentclass...) */
  latexPre: string;
  /** LaTeX postamble (usually \\end{document}) */
  latexPost: string;
  /** Index of field used for sorting in browser (0-indexed) */
  sortField: number;
  /** Default deck ID for new cards of this model type */
  did: number | null;
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
  /** Whether this is a dynamic/filtered deck (1) or regular deck (0/undefined) */
  dyn?: number;
  /** ID of the deck options group from dconf (absent for filtered decks) */
  conf?: number;
}

/** Schema format used by the Anki database */
export type AnkiSchemaFormat = 'legacy' | 'modern';

export interface AnkiCollection {
  decks: Map<number, AnkiDeck>;
  models: Map<number, AnkiModel>;
  notes: Map<number, AnkiNote>;
  cards: Map<number, AnkiCard>;
  revlog: Map<number, ReviewLogEntry[]>; // Card ID -> review entries
  media: Map<string, Blob>;
  deckTree: AnkiDeck[];
  /** Schema format: 'legacy' (col table with JSON) or 'modern' (notetypes/decks tables with protobuf) */
  schemaFormat?: AnkiSchemaFormat;
  /** Original APKG bytes for optional strict passthrough export */
  sourceApkg?: Blob;
  /** Original legacy DB bytes (collection.anki2) when present */
  sourceLegacyDb?: Uint8Array;
  /** Raw modern-schema rows to preserve full metadata on re-export */
  modernMeta?: {
    colColumns?: string[];
    colRow?: unknown[];
    notetypesColumns?: string[];
    notetypesRows?: unknown[][];
    fieldsColumns?: string[];
    fieldsRows?: unknown[][];
    templatesColumns?: string[];
    templatesRows?: unknown[][];
    decksColumns?: string[];
    decksRows?: unknown[][];
    deckConfigColumns?: string[];
    deckConfigRows?: unknown[][];
    configColumns?: string[];
    configRows?: unknown[][];
    tagsColumns?: string[];
    tagsRows?: unknown[][];
  };
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
  fields: CardField[];
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

/** Format for exporting APKG media manifest */
export type MediaManifestFormat = 'legacy' | 'modern';

// Anki-specific settings (not LLM related)
export interface AnkiSettings {
  /** Whether new cards should inherit scheduling metadata from original card */
  inheritCardMetadata: boolean;
  /** Format for media manifest when exporting APKG */
  exportMediaFormat: MediaManifestFormat;
}

// Display/UI settings
export interface DisplaySettings {
  /** Dark mode theme */
  darkMode: boolean;
  /** How to display suggested cards */
  suggestedCardsLayout: 'carousel' | 'list';
  /** Show developer console panel */
  developerMode: boolean;
}

export interface LLMLogEntry {
  id: string;
  timestamp: number;
  direction: 'request' | 'response' | 'error';
  providerId: string;
  model: string;
  endpoint?: string;
  durationMs?: number;
  status?: number;
  payload?: unknown;
}

export interface AnalysisObjective {
  /** Human-friendly label used in the UI */
  label: string;
  /** Description included in the system prompt */
  description: string;
}

export interface LLMConfig {
  providerId: string;
  model: string;
  apiKeys: Record<string, string>; // Per-provider API keys
  modelFilters?: Record<string, string>; // Per-provider model filter (search/regex)
  systemPrompt: string;
  systemPromptVersion?: number; // Track which version of the default prompt the user has
  analysisObjectives: AnalysisObjective[];
  sendImages: boolean;
  concurrentDeckAnalysis: boolean;
  requestDelayMs: number; // Delay between requests during deck analysis (for rate limiting)
}

export interface CardFeedback {
  objectives: Record<string, boolean>;
  overallScore: number;
  issues: string[];
  suggestions: string[];
  reasoning: string;
}

export interface SuggestedCard {
  type: CardType;
  fields: CardField[];
  explanation: string;
}

export interface LLMAnalysisResult {
  feedback: CardFeedback;
  suggestedCards: SuggestedCard[];
  deleteOriginal: boolean;
  deleteReason?: string;
  error?: string;
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
