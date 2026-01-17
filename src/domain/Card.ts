/**
 * Card Domain Model
 * 
 * This module provides the concrete implementations of the ICard interface.
 * Cards are immutable value objects - mutations return new instances.
 * 
 * Two card types exist:
 * - OriginalCard: Cards loaded from Anki .apkg files. Can only be soft-deleted.
 * - GeneratedCard: AI-generated cards. Can be hard-deleted.
 */

import type { CardField, LLMAnalysisResult, CardType } from '../types';
import type {
  ICard,
  CardOrigin,
  CardStateData,
  CardSchedulingData,
  CardReviewData,
} from './types';

/**
 * Base implementation shared by both card types
 */
abstract class BaseCard implements ICard {
  readonly id: number;
  readonly noteId: number;
  readonly deckId: number;
  readonly type: CardType;
  abstract readonly origin: CardOrigin;

  protected readonly _currentFields: CardField[];
  protected readonly _originalFields: CardField[];
  protected readonly _isDeleted: boolean;
  protected readonly _analysis: LLMAnalysisResult | null;

  readonly tags: string[];
  readonly css: string;
  readonly modelName: string;
  readonly deckName: string;
  readonly front: string;
  readonly back: string;
  readonly scheduling: CardSchedulingData | null;
  readonly reviewData: CardReviewData | null;

  constructor(data: CardStateData) {
    this.id = data.cardId;
    this.noteId = data.noteId;
    this.deckId = data.deckId;
    this.type = data.type;
    this._currentFields = data.currentFields;
    this._originalFields = data.originalFields;
    this._isDeleted = data.isDeleted;
    this._analysis = data.analysis;
    this.tags = data.tags;
    this.css = data.css;
    this.modelName = data.modelName;
    this.deckName = data.deckName;
    this.front = data.front;
    this.back = data.back;
    this.scheduling = data.scheduling;
    this.reviewData = data.reviewData;
  }

  get fields(): CardField[] {
    return this._currentFields;
  }

  get originalFields(): CardField[] {
    return this._originalFields;
  }

  get isEdited(): boolean {
    return !fieldsEqual(this._currentFields, this._originalFields);
  }

  get isDeleted(): boolean {
    return this._isDeleted;
  }

  get analysis(): LLMAnalysisResult | null {
    return this._analysis;
  }

  // Capabilities - overridden by subclasses
  abstract get canHardDelete(): boolean;
  abstract get canRestore(): boolean;
  
  get canEdit(): boolean {
    return !this._isDeleted;
  }

  /**
   * Get the underlying data for store updates
   */
  toStateData(): CardStateData {
    return {
      cardId: this.id,
      noteId: this.noteId,
      deckId: this.deckId,
      type: this.type,
      origin: this.origin,
      currentFields: this._currentFields,
      originalFields: this._originalFields,
      isDeleted: this._isDeleted,
      analysis: this._analysis,
      tags: this.tags,
      css: this.css,
      modelName: this.modelName,
      deckName: this.deckName,
      front: this.front,
      back: this.back,
      scheduling: this.scheduling,
      reviewData: this.reviewData,
    };
  }
}

/**
 * Card loaded from an Anki .apkg file.
 * - Cannot be hard-deleted (only marked for exclusion on export)
 * - Can be restored after soft deletion
 * - Original fields are preserved from the import
 */
export class OriginalCard extends BaseCard {
  readonly origin: CardOrigin = 'original';

  get canHardDelete(): boolean {
    return false;
  }

  get canRestore(): boolean {
    return this._isDeleted;
  }
}

/**
 * AI-generated card created within the application.
 * - Can be hard-deleted (removed from memory)
 * - Cannot be "restored" in the same sense (would need to be re-created)
 * - Original fields are the fields it was created with
 */
export class GeneratedCard extends BaseCard {
  readonly origin: CardOrigin = 'generated';

  get canHardDelete(): boolean {
    return true;
  }

  get canRestore(): boolean {
    // Generated cards can't be "restored" once deleted - they're gone
    return false;
  }
}

/**
 * Factory function to create the appropriate card type from state data
 */
export function createCard(data: CardStateData): ICard {
  if (data.origin === 'generated') {
    return new GeneratedCard(data);
  }
  return new OriginalCard(data);
}

/**
 * Create state data for a new generated card
 */
export function createGeneratedCardData(params: {
  cardId: number;
  noteId: number;
  deckId: number;
  type: CardType;
  fields: CardField[];
  deckName: string;
  modelName: string;
  css: string;
  front: string;
  back: string;
  scheduling?: CardSchedulingData;
  reviewData?: CardReviewData;
}): CardStateData {
  return {
    cardId: params.cardId,
    noteId: params.noteId,
    deckId: params.deckId,
    type: params.type,
    origin: 'generated',
    currentFields: params.fields,
    originalFields: params.fields, // For generated cards, original = initial
    isDeleted: false,
    analysis: null,
    tags: ['llmanki-generated'],
    css: params.css,
    modelName: params.modelName,
    deckName: params.deckName,
    front: params.front,
    back: params.back,
    scheduling: params.scheduling || null,
    reviewData: params.reviewData || null,
  };
}

/**
 * Helper to check if two field arrays are equal
 */
export function fieldsEqual(a: CardField[], b: CardField[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((field, index) => {
    const other = b[index];
    return other && field.name === other.name && field.value === other.value;
  });
}

/**
 * Apply field updates to card state data
 */
export function withUpdatedFields(
  data: CardStateData,
  newFields: CardField[]
): CardStateData {
  return {
    ...data,
    currentFields: newFields,
  };
}

/**
 * Restore fields to original
 */
export function withRestoredFields(data: CardStateData): CardStateData {
  return {
    ...data,
    currentFields: data.originalFields,
  };
}

/**
 * Mark card as deleted
 */
export function withDeleted(data: CardStateData, isDeleted: boolean): CardStateData {
  return {
    ...data,
    isDeleted,
  };
}

/**
 * Set analysis result
 */
export function withAnalysis(
  data: CardStateData,
  analysis: LLMAnalysisResult | null
): CardStateData {
  return {
    ...data,
    analysis,
  };
}
