/**
 * Domain Model Types
 * 
 * This module defines the core domain types for the card management system.
 * It provides a unified interface for all card operations, abstracting away
 * the differences between original cards (from Anki imports) and generated
 * cards (AI-created).
 */

import type { CardType, CardField, LLMAnalysisResult, ReviewLogEntry } from '../types';

/**
 * Discriminator for card origin - determines what operations are available
 */
export type CardOrigin = 'original' | 'generated';

/**
 * Scheduling metadata from Anki
 */
export interface CardSchedulingData {
  queue: number;
  due: number;
  interval: number;
  factor: number;
  reps: number;
  lapses: number;
}

/**
 * Extended review history data
 */
export interface CardReviewData {
  cardCreated: number;
  firstReview: number | null;
  lastReview: number | null;
  totalTime: number;
  reviewHistory: ReviewLogEntry[];
}

/**
 * The unified Card interface - single source of truth for card state and operations.
 * All card-related operations should go through this interface.
 */
export interface ICard {
  // === Identity ===
  readonly id: number;
  readonly noteId: number;
  readonly deckId: number;
  readonly type: CardType;
  readonly origin: CardOrigin;

  // === State (read-only properties - use methods to mutate) ===
  readonly fields: CardField[];
  readonly originalFields: CardField[];
  readonly isEdited: boolean;
  readonly isDeleted: boolean;
  readonly analysis: LLMAnalysisResult | null;
  
  // === Capabilities ===
  readonly canHardDelete: boolean;
  readonly canRestore: boolean;
  readonly canEdit: boolean;

  // === Display data ===
  readonly tags: string[];
  readonly css: string;
  readonly modelName: string;
  readonly deckName: string;
  readonly front: string;
  readonly back: string;
  
  // === Scheduling (optional - only for cards with history) ===
  readonly scheduling: CardSchedulingData | null;
  readonly reviewData: CardReviewData | null;
}

/**
 * Mutable card state - what gets stored and persisted
 */
export interface CardStateData {
  cardId: number;
  noteId: number;
  deckId: number;
  type: CardType;
  origin: CardOrigin;
  
  // Editable state
  currentFields: CardField[];
  originalFields: CardField[];
  
  // Status flags
  isDeleted: boolean;
  
  // Analysis
  analysis: LLMAnalysisResult | null;
  
  // Display data (cached for performance)
  tags: string[];
  css: string;
  modelName: string;
  deckName: string;
  front: string;
  back: string;
  
  // Scheduling
  scheduling: CardSchedulingData | null;
  reviewData: CardReviewData | null;
}

/**
 * Serializable format for persistence
 */
export interface PersistedCardState {
  cardId: number;
  noteId: number;
  origin: CardOrigin;
  currentFields: CardField[];
  /** Original field values for detecting edits */
  originalFields?: CardField[];
  isDeleted: boolean;
  analysis: LLMAnalysisResult | null;
  /** Deck ID - required for generated cards to be restored to correct deck */
  deckId?: number;
  /** Card type - required for generated cards */
  type?: CardType;
  /** Deck name - for display purposes */
  deckName?: string;
  /** Model CSS - for rendering generated cards */
  css?: string;
  /** Scheduling data - for generated cards with inherited scheduling */
  scheduling?: CardSchedulingData | null;
  /** Review data - for generated cards with inherited review history */
  reviewData?: CardReviewData | null;
}

/**
 * Full persisted deck state
 */
export interface PersistedDeckState {
  fileName: string;
  cards: PersistedCardState[];
  lastUpdated: number;
}
