/**
 * Card State Service
 * 
 * This module provides a unified abstraction for managing card state throughout the application.
 * It serves as the single source of truth for all card-related state including:
 * - Original card fields (from the imported Anki deck)
 * - Edited fields (user modifications)
 * - Edit status (whether a card has been modified)
 * - Deletion status (soft delete / marked for deletion)
 * - Generated status (AI-created cards)
 * - Analysis results (LLM feedback)
 * 
 * All card state operations should go through this service to ensure consistency.
 */

import type { AnkiCollection, LLMAnalysisResult, CardField } from '../types';

// Re-export CardField for convenience
export type { CardField };

/**
 * Represents the complete state of a card at any point in time.
 * This is the unified object used throughout the application.
 */
export interface CardState {
  // Identity
  cardId: number;
  noteId: number;
  deckId: number;
  
  // Original content (from Anki import - never changes)
  originalFields: CardField[];
  
  // Current/effective content (either edited or original)
  currentFields: CardField[];
  
  // State flags
  isEdited: boolean;
  isMarkedForDeletion: boolean;
  isGenerated: boolean;
  
  // Analysis (may be null if not analyzed)
  analysis: LLMAnalysisResult | null;
}

/**
 * Storage for edited card fields - keyed by noteId
 */
export type EditedCardsMap = Map<number, CardField[]>;

/**
 * Storage for cards marked for deletion
 */
export type MarkedForDeletionSet = Set<number>;

/**
 * Storage for generated card IDs
 */
export type GeneratedCardIdsSet = Set<number>;

/**
 * Storage for analysis results - keyed by cardId
 */
export type AnalysisCacheMap = Map<number, LLMAnalysisResult>;

/**
 * Get the original fields for a note from the collection
 */
export function getOriginalFields(
  collection: AnkiCollection,
  noteId: number
): CardField[] {
  const note = collection.notes.get(noteId);
  if (!note) return [];
  
  const model = collection.models.get(note.modelId);
  if (!model) return [];
  
  return model.fields.map((field, index) => ({
    name: field.name,
    value: note.fields[index] || ''
  }));
}

/**
 * Get the complete state for a card.
 * This is the primary way to access card state throughout the application.
 */
export function getCardState(
  collection: AnkiCollection,
  cardId: number,
  editedCards: EditedCardsMap,
  markedForDeletion: MarkedForDeletionSet,
  generatedCardIds: GeneratedCardIdsSet,
  analysisCache: AnalysisCacheMap
): CardState | null {
  const card = collection.cards.get(cardId);
  if (!card) return null;
  
  const noteId = card.noteId;
  const originalFields = getOriginalFields(collection, noteId);
  const editedFields = editedCards.get(noteId);
  
  return {
    cardId,
    noteId,
    deckId: card.deckId,
    originalFields,
    currentFields: editedFields || originalFields,
    isEdited: editedCards.has(noteId),
    isMarkedForDeletion: markedForDeletion.has(cardId),
    isGenerated: generatedCardIds.has(cardId),
    analysis: analysisCache.get(cardId) || null
  };
}

/**
 * Check if two field arrays are equal
 */
export function fieldsAreEqual(a: CardField[], b: CardField[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((field, index) => {
    const other = b[index];
    return other && field.name === other.name && field.value === other.value;
  });
}

/**
 * Update card fields and return the new edited cards map.
 * This handles the logic of comparing to original and either storing edits or clearing them.
 * 
 * @returns An object with:
 *   - editedCards: the updated Map
 *   - isNowEdited: whether the card is now considered edited
 *   - shouldInvalidateCache: whether the analysis cache should be invalidated
 */
export function updateCardFields(
  collection: AnkiCollection,
  noteId: number,
  newFields: CardField[],
  editedCards: EditedCardsMap
): {
  editedCards: EditedCardsMap;
  isNowEdited: boolean;
  shouldInvalidateCache: boolean;
} {
  const note = collection.notes.get(noteId);
  if (!note) {
    return { editedCards, isNowEdited: false, shouldInvalidateCache: false };
  }
  
  const model = collection.models.get(note.modelId);
  if (!model) {
    return { editedCards, isNowEdited: false, shouldInvalidateCache: false };
  }
  
  // Get original fields
  const originalFields: CardField[] = model.fields.map((field, index) => ({
    name: field.name,
    value: note.fields[index] || ''
  }));
  
  // Check if current fields differ from original
  const isDifferent = !fieldsAreEqual(newFields, originalFields);
  
  const newEditedCards = new Map(editedCards);
  
  if (isDifferent) {
    // Store the edited state
    newEditedCards.set(noteId, newFields);
  } else {
    // Content matches original - remove from edited map
    newEditedCards.delete(noteId);
  }
  
  const wasEdited = editedCards.has(noteId);
  const isNowEdited = isDifferent;
  
  // Invalidate cache if the content changed (either became edited or was edited and changed)
  const shouldInvalidateCache = isDifferent || (wasEdited && !isDifferent);
  
  return {
    editedCards: newEditedCards,
    isNowEdited,
    shouldInvalidateCache
  };
}

/**
 * Restore a card to its original state (remove edits).
 * 
 * @returns The updated edited cards map
 */
export function restoreCardToOriginal(
  noteId: number,
  editedCards: EditedCardsMap
): EditedCardsMap {
  const newEditedCards = new Map(editedCards);
  newEditedCards.delete(noteId);
  return newEditedCards;
}

/**
 * Mark a card for deletion.
 * 
 * @returns The updated marked for deletion set
 */
export function markForDeletion(
  cardId: number,
  markedForDeletion: MarkedForDeletionSet
): MarkedForDeletionSet {
  const newSet = new Set(markedForDeletion);
  newSet.add(cardId);
  return newSet;
}

/**
 * Unmark a card from deletion.
 * 
 * @returns The updated marked for deletion set
 */
export function unmarkFromDeletion(
  cardId: number,
  markedForDeletion: MarkedForDeletionSet
): MarkedForDeletionSet {
  const newSet = new Set(markedForDeletion);
  newSet.delete(cardId);
  return newSet;
}

/**
 * Get the effective fields to display for a card.
 * Returns edited fields if available, otherwise original fields.
 */
export function getEffectiveFields(
  collection: AnkiCollection,
  noteId: number,
  editedCards: EditedCardsMap
): CardField[] {
  // Check for edited fields first
  const edited = editedCards.get(noteId);
  if (edited) return edited;
  
  // Fall back to original
  return getOriginalFields(collection, noteId);
}

/**
 * Check if a card has been edited (convenience function).
 */
export function isCardEdited(noteId: number, editedCards: EditedCardsMap): boolean {
  return editedCards.has(noteId);
}

/**
 * Check if a card is marked for deletion (convenience function).
 */
export function isCardMarkedForDeletion(cardId: number, markedForDeletion: MarkedForDeletionSet): boolean {
  return markedForDeletion.has(cardId);
}

/**
 * Check if a card is AI-generated (convenience function).
 */
export function isCardGenerated(cardId: number, generatedCardIds: GeneratedCardIdsSet): boolean {
  return generatedCardIds.has(cardId);
}

/**
 * Serialize card state maps for persistence.
 */
export interface SerializedCardState {
  editedCards: Record<number, CardField[]>;
  markedForDeletion: number[];
  generatedCardIds: number[];
}

export function serializeCardState(
  editedCards: EditedCardsMap,
  markedForDeletion: MarkedForDeletionSet,
  generatedCardIds: GeneratedCardIdsSet
): SerializedCardState {
  const editedCardsRecord: Record<number, CardField[]> = {};
  editedCards.forEach((fields, noteId) => {
    editedCardsRecord[noteId] = fields;
  });
  
  return {
    editedCards: editedCardsRecord,
    markedForDeletion: Array.from(markedForDeletion),
    generatedCardIds: Array.from(generatedCardIds)
  };
}

export function deserializeCardState(serialized: SerializedCardState): {
  editedCards: EditedCardsMap;
  markedForDeletion: MarkedForDeletionSet;
  generatedCardIds: GeneratedCardIdsSet;
} {
  const editedCards = new Map<number, CardField[]>();
  if (serialized.editedCards) {
    for (const [noteIdStr, fields] of Object.entries(serialized.editedCards)) {
      editedCards.set(Number(noteIdStr), fields);
    }
  }
  
  return {
    editedCards,
    markedForDeletion: new Set(serialized.markedForDeletion || []),
    generatedCardIds: new Set(serialized.generatedCardIds || [])
  };
}
