/**
 * Domain Module
 * 
 * This module exports the card and deck domain models and related utilities.
 * All card and deck operations should use these exports.
 */

// Types
export type {
  ICard,
  CardStateData,
  PersistedDeckState,
  CardOrigin,
  CardSchedulingData,
  CardReviewData,
} from './types';

// Card implementations
export {
  createCard,
  fieldsEqual,
  withUpdatedFields,
  withRestoredFields,
  withDeleted,
  withAnalysis,
  createGeneratedCardData,
  OriginalCard,
  GeneratedCard,
} from './Card';

// Repository utilities
export {
  createGeneratedCard,
  rerenderCardContent,
  filterCardsByDeck,
} from './CardRepository';

// Deck domain model
export {
  Deck,
  generateUniqueId,
  resetIdCounter,
  createDefaultModel,
  createClozeModel,
} from './Deck';

export type {
  DeckOrigin,
  CreateCardOptions,
  CreateDeckOptions,
  DeckExportData,
} from './Deck';

// Deck repository utilities
export {
  getDeckById,
  getAllDecks,
  getTopLevelDecks,
  getDeckByName,
  getCardCount,
  deleteDeck,
  renameDeck,
  moveDeck,
  getGeneratedDecksForPersistence,
  restoreGeneratedDecks,
} from './DeckRepository';

export type {
  PersistedDeckInfo,
  PersistedDecksState,
} from './DeckRepository';
