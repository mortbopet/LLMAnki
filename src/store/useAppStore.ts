/**
 * Application Store
 * 
 * This is the single source of truth for all application state.
 * It uses Zustand with immer for immutable updates and integrates
 * with the card domain model for type-safe card operations.
 * 
 * Key design decisions:
 * - All card state is managed through CardStateData objects
 * - ICard objects are derived views (created on-demand via selectors)
 * - Persistence is handled automatically within the store
 * - No direct localStorage access outside this module
 */

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { enableMapSet } from 'immer';
import type { 
  AnkiCollection, 
  LLMConfig, 
  LLMAnalysisResult,
  SuggestedCard,
  DeckAnalysisResult,
  CardType,
  CardField,
  AnkiCard,
  AnkiNote,
  AnkiDeck,
  ReviewLogEntry,
} from '../types';

// Enable immer support for Map and Set
enableMapSet();
import { getDefaultConfig } from '../utils/llmService';
import type { 
  ICard, 
  CardStateData, 
  PersistedDeckState,
  PersistedDeckInfo,
  CardReviewData,
} from '../domain';
import {
  createCard,
  withUpdatedFields,
  withRestoredFields,
  withDeleted,
  withAnalysis,
  fieldsEqual,
  createGeneratedCard,
  rerenderCardContent,
  Deck,
  restoreGeneratedDecks,
} from '../domain';

// ============================================================================
// Types
// ============================================================================

/** State for the AddCardPanel - stored per deck */
interface AddCardPanelState {
  activeTab: 'manual' | 'ai';
  aiPrompt: string;
  suggestedCards: SuggestedCard[];
  addedCards: Array<{ suggestedIndex: number; cardId: number }>;
  carouselIndex: number;
  manualCardType: CardType;
  manualFields: CardField[];
}

const DEFAULT_ADD_CARD_PANEL_STATE: AddCardPanelState = {
  activeTab: 'manual',
  aiPrompt: '',
  suggestedCards: [],
  addedCards: [],
  carouselIndex: 0,
  manualCardType: 'basic',
  manualFields: [{ name: 'Front', value: '' }, { name: 'Back', value: '' }],
};

/** Undoable action for undo/redo system */
interface UndoableAction {
  type: 'add-card' | 'delete-card' | 'update-fields' | 'restore-fields';
  cardId: number;
  previousState?: CardStateData;
  newState?: CardStateData;
  // For add-card: also track the Anki entities for collection updates
  ankiCard?: AnkiCard;
  ankiNote?: AnkiNote;
}

/** Persistence key for deck state in localStorage */
const DECK_STATE_PREFIX = 'llmanki-deck-state-';

// ============================================================================
// Store State Interface
// ============================================================================

interface AppState {
  // === Collection State ===
  collection: AnkiCollection | null;
  fileName: string | null;
  isLoadingCollection: boolean;
  loadingProgress: string | null;
  
  // === Card State (Single Source of Truth) ===
  /** All card state data, keyed by cardId */
  cards: Map<number, CardStateData>;
  /** Persisted card state loaded from localStorage (for cards not yet in the cards Map) */
  persistedCardState: Map<number, PersistedDeckState['cards'][0]>;
  /** Track which suggested cards have been added (sourceCardId -> added info) */
  addedSuggestedCards: Map<number, { suggestedIndex: number; addedCardId: number }[]>;
  
  // === Deck State ===
  /** IDs of decks created within the app (not from .apkg import) */
  generatedDeckIds: Set<number>;
  
  // === Undo/Redo ===
  undoStack: UndoableAction[];
  redoStack: UndoableAction[];
  
  // === Selection State ===
  selectedDeckId: number | null;
  selectedCardId: number | null;
  
  // === Analysis State ===
  isAnalyzing: boolean;
  analysisError: string | null;
  analyzingDeckId: number | null;
  deckAnalysisProgress: { current: number; total: number } | null;
  deckAnalysisCancelled: boolean;
  
  // === Deck Analysis Cache ===
  deckAnalysisCache: Map<number, DeckAnalysisResult>;
  
  // === UI State ===
  addCardPanelState: Map<number, AddCardPanelState>;
  suggestedCards: SuggestedCard[];
  editingSuggestionIndex: number | null;
  
  // === Settings ===
  llmConfig: LLMConfig;
  showSettings: boolean;
}

// ============================================================================
// Store Actions Interface
// ============================================================================

interface AppActions {
  // === Collection Actions ===
  setCollection: (collection: AnkiCollection | null, fileName: string | null) => void;
  setIsLoadingCollection: (loading: boolean) => void;
  setLoadingProgress: (progress: string | null) => void;
  initializeCards: (cards: CardStateData[]) => void;
  /** Create an empty collection (for creating decks from scratch) */
  createEmptyCollection: () => void;
  
  // === Selection Actions ===
  selectDeck: (deckId: number | null) => void;
  selectCard: (cardId: number | null) => void;
  
  // === Deck Actions ===
  /** Create a new top-level deck */
  createDeck: (name: string, description?: string) => number | null;
  /** Create a subdeck under an existing deck */
  createSubdeck: (parentDeckId: number, name: string, description?: string) => number | null;
  /** Delete a deck */
  deleteDeck: (deckId: number, deleteCards?: boolean, deleteSubdecks?: boolean) => void;
  /** Rename a deck */
  renameDeck: (deckId: number, newName: string) => void;
  /** Get a Deck instance for a deck ID */
  getDeck: (deckId: number) => Deck | null;
  
  // === Card Query Methods ===
  getCard: (cardId: number) => ICard | null;
  getCards: () => ICard[];
  getCardsInDeck: (deckId: number, includeSubdecks?: boolean) => ICard[];
  getSelectedCard: () => ICard | null;
  
  // === Card Mutation Actions ===
  updateCardFields: (cardId: number, fields: CardField[]) => Promise<void>;
  restoreCardFields: (cardId: number) => void;
  deleteCard: (cardId: number) => void;
  restoreCard: (cardId: number) => void;
  addCard: (suggestedCard: SuggestedCard, deckId: number, sourceCardId?: number, suggestedIndex?: number) => Promise<number | null>;
  /** Add a card using the Deck API (front/back string convenience method) */
  addCardToDeck: (deckId: number, front: string, back: string, options?: { type?: CardType; tags?: string[]; sourceCardId?: number }) => Promise<number | null>;
  
  // === Analysis Actions ===
  setCardAnalysis: (cardId: number, analysis: LLMAnalysisResult) => void;
  clearCardAnalysis: (cardId: number) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setAnalysisError: (error: string | null) => void;
  cacheDeckAnalysis: (deckId: number, result: DeckAnalysisResult) => void;
  markDeckSuggestedCardAdded: (deckId: number, cardIndex: number) => void;
  setAnalyzingDeckId: (deckId: number | null) => void;
  setDeckAnalysisProgress: (progress: { current: number; total: number } | null) => void;
  cancelDeckAnalysis: () => void;
  isDeckAnalysisCancelled: () => boolean;
  resetDeckAnalysisCancelled: () => void;
  
  // === Suggested Cards Actions ===
  setSuggestedCards: (cards: SuggestedCard[]) => void;
  updateSuggestedCard: (index: number, card: SuggestedCard) => void;
  removeSuggestedCard: (index: number) => void;
  setEditingSuggestionIndex: (index: number | null) => void;
  
  // === Add Card Panel Actions ===
  getAddCardPanelState: (deckId: number) => AddCardPanelState;
  setAddCardPanelState: (deckId: number, state: Partial<AddCardPanelState>) => void;
  
  // === Suggested Card Tracking ===
  getAddedSuggestedIndices: (sourceCardId: number) => number[];
  getAddedCardId: (sourceCardId: number, suggestedIndex: number) => number | null;
  
  // === Undo/Redo ===
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  
  // === Persistence ===
  persistDeckState: () => void;
  
  // === Settings ===
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  setShowSettings: (show: boolean) => void;
  
  // === Analysis State ===
  resetAnalysis: () => void;
}

type AppStore = AppState & AppActions;

// ============================================================================
// Persistence Helpers
// ============================================================================

/**
 * Build CardReviewData from review log entries
 * Returns null if no reviews exist for this card
 */
function buildReviewData(
  cardId: number,
  revlog: Map<number, ReviewLogEntry[]>,
  cardCreatedTime: number
): CardReviewData | null {
  const reviews = revlog.get(cardId);
  if (!reviews || reviews.length === 0) {
    return null;
  }
  
  // Sort by timestamp (id field is the timestamp)
  const sortedReviews = [...reviews].sort((a, b) => a.id - b.id);
  
  // Compute aggregates
  const firstReview = sortedReviews[0].id;
  const lastReview = sortedReviews[sortedReviews.length - 1].id;
  const totalTime = sortedReviews.reduce((sum, r) => sum + r.time, 0);
  
  return {
    cardCreated: cardCreatedTime,
    firstReview,
    lastReview,
    totalTime,
    reviewHistory: sortedReviews,
  };
}

function getDeckStateKey(fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${DECK_STATE_PREFIX}${sanitized}`;
}

function loadPersistedDeckState(fileName: string): PersistedDeckState | null {
  try {
    const key = getDeckStateKey(fileName);
    const json = localStorage.getItem(key);
    if (json) {
      return JSON.parse(json);
    }
  } catch (e) {
    console.error('Failed to load deck state:', e);
  }
  return null;
}

function savePersistedDeckState(
  fileName: string,
  cards: Map<number, CardStateData>,
  generatedDeckIds: Set<number>,
  collection: AnkiCollection | null
): void {
  try {
    const key = getDeckStateKey(fileName);
    
    // Only persist cards that have modifications or are generated
    const cardsToSave: PersistedDeckState['cards'] = [];
    for (const [, cardState] of cards) {
      const hasModifications = 
        cardState.isDeleted ||
        cardState.analysis !== null ||
        cardState.origin === 'generated' ||
        !fieldsEqual(cardState.currentFields, cardState.originalFields);
      
      if (hasModifications) {
        cardsToSave.push({
          cardId: cardState.cardId,
          noteId: cardState.noteId,
          origin: cardState.origin,
          currentFields: cardState.currentFields,
          originalFields: cardState.originalFields,
          isDeleted: cardState.isDeleted,
          analysis: cardState.analysis,
          // Include additional fields for generated cards
          deckId: cardState.deckId,
          type: cardState.type,
          deckName: cardState.deckName,
          css: cardState.css,
          // Include scheduling and review data for generated cards
          scheduling: cardState.origin === 'generated' ? cardState.scheduling : undefined,
          reviewData: cardState.origin === 'generated' ? cardState.reviewData : undefined,
        });
      }
    }
    
    // Persist generated deck info
    const decksToSave: PersistedDeckInfo[] = [];
    if (collection) {
      for (const deckId of generatedDeckIds) {
        const deck = collection.decks.get(deckId);
        if (deck) {
          decksToSave.push({
            deckId: deck.id,
            name: deck.name,
            description: deck.description,
            parentId: deck.parentId,
            origin: 'generated',
          });
        }
      }
    }
    
    const state: PersistedDeckState & { generatedDecks?: PersistedDeckInfo[] } = {
      fileName,
      cards: cardsToSave,
      lastUpdated: Date.now(),
      generatedDecks: decksToSave.length > 0 ? decksToSave : undefined,
    };
    
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save deck state:', e);
  }
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useAppStore = create<AppStore>()(
  subscribeWithSelector(
    persist(
      immer((set, get) => ({
        // === Initial State ===
        collection: null,
        fileName: null,
        isLoadingCollection: false,
        loadingProgress: null,
        cards: new Map(),
        addedSuggestedCards: new Map(),
        persistedCardState: new Map(),
        generatedDeckIds: new Set(),
        undoStack: [],
        redoStack: [],
        selectedDeckId: null,
        selectedCardId: null,
        isAnalyzing: false,
        analysisError: null,
        analyzingDeckId: null,
        deckAnalysisProgress: null,
        deckAnalysisCancelled: false,
        deckAnalysisCache: new Map(),
        addCardPanelState: new Map(),
        suggestedCards: [],
        editingSuggestionIndex: null,
        llmConfig: getDefaultConfig(),
        showSettings: false,

        // === Collection Actions ===
        
        /**
         * Load a collection and initialize all card state atomically.
         * This is the ONLY way to load a deck - it handles:
         * 1. Setting the collection
         * 2. Initializing CardStateData for ALL cards
         * 3. Loading cached state from localStorage
         * 4. Merging cached edits/deletions/analyses
         * 5. Restoring generated cards and decks
         */
        setCollection: (collection, fileName) => {
          // First, clear state
          set(state => {
            state.collection = collection;
            state.fileName = fileName;
            state.isLoadingCollection = false;
            state.loadingProgress = null;
            state.selectedDeckId = null;
            state.selectedCardId = null;
            state.isAnalyzing = false;
            state.analysisError = null;
            state.cards = new Map();
            state.persistedCardState = new Map();
            state.addedSuggestedCards = new Map();
            state.generatedDeckIds = new Set();
            state.undoStack = [];
            state.redoStack = [];
            state.suggestedCards = [];
            state.deckAnalysisCache = new Map();
            state.addCardPanelState = new Map();
          });
          
          // If we have a collection, initialize all cards and load cached state
          if (collection && fileName) {
            // Load persisted state BEFORE initializing cards
            const persisted = loadPersistedDeckState(fileName) as (PersistedDeckState & { generatedDecks?: PersistedDeckInfo[] }) | null;
            const persistedMap = new Map<number, PersistedDeckState['cards'][0]>();
            if (persisted) {
              for (const savedCard of persisted.cards) {
                persistedMap.set(savedCard.cardId, savedCard);
              }
            }
            
            set(draft => {
              // Restore generated decks BEFORE processing cards (inside set() for Immer compatibility)
              if (persisted?.generatedDecks) {
                restoreGeneratedDecks(draft.collection!, persisted.generatedDecks);
                for (const deckInfo of persisted.generatedDecks) {
                  draft.generatedDeckIds.add(deckInfo.deckId);
                }
              }
              
              // Step 1: Initialize CardStateData for ALL cards in the collection
              for (const [cardId, ankiCard] of draft.collection!.cards) {
                const note = draft.collection!.notes.get(ankiCard.noteId);
                const model = note ? draft.collection!.models.get(note.modelId) : undefined;
                const deck = draft.collection!.decks.get(ankiCard.deckId);
                
                if (!note || !model) continue;
                
                const fields: CardField[] = model.fields.map((field, index) => ({
                  name: field.name,
                  value: note.fields[index] || '',
                }));
                
                // Build review data from revlog entries
                // Use note.mod as card creation time (modification time serves as approximation)
                const reviewData = buildReviewData(cardId, draft.collection!.revlog, note.mod * 1000);
                
                // Start with base card state
                let cardStateData: CardStateData = {
                  cardId: ankiCard.id,
                  noteId: ankiCard.noteId,
                  deckId: ankiCard.deckId,
                  type: ankiCard.type,
                  origin: 'original',
                  currentFields: fields,
                  originalFields: fields,
                  isDeleted: false,
                  analysis: null,
                  tags: note.tags || [],
                  css: model.css || '',
                  modelName: model.name,
                  deckName: deck?.name || 'Unknown',
                  front: note.fields[0] || '',
                  back: note.fields[1] || '',
                  scheduling: {
                    queue: ankiCard.queue,
                    due: ankiCard.due,
                    interval: ankiCard.interval,
                    factor: ankiCard.factor,
                    reps: ankiCard.reps,
                    lapses: ankiCard.lapses,
                  },
                  reviewData: reviewData,
                };
                
                // Step 2: Merge any cached state for this card
                const savedCard = persistedMap.get(cardId);
                if (savedCard) {
                  cardStateData = {
                    ...cardStateData,
                    currentFields: savedCard.currentFields,
                    isDeleted: savedCard.isDeleted,
                    analysis: savedCard.analysis,
                  };
                }
                
                draft.cards.set(cardId, cardStateData);
              }
              
              // Step 3: Restore generated cards from cache
              if (persisted) {
                for (const savedCard of persisted.cards) {
                  if (savedCard.origin === 'generated' && !draft.cards.has(savedCard.cardId)) {
                    // Find CSS from any model as fallback
                    let css = savedCard.css || '';
                    if (!css) {
                      for (const [, model] of draft.collection!.models) {
                        css = model.css || '';
                        break;
                      }
                    }
                    
                    // Get deck - use default deck (1) if saved deck doesn't exist
                    let deckId = savedCard.deckId || 1;
                    if (!draft.collection!.decks.has(deckId)) {
                      console.warn(`Generated card ${savedCard.cardId}: target deck ${deckId} doesn't exist, using default deck`);
                      deckId = 1; // Default deck
                    }
                    
                    // Get deck name
                    let deckName = savedCard.deckName || 'Unknown';
                    const deck = draft.collection!.decks.get(deckId);
                    if (deck) deckName = deck.name;
                    
                    const generatedCardState: CardStateData = {
                      cardId: savedCard.cardId,
                      noteId: savedCard.noteId,
                      deckId: deckId,
                      type: savedCard.type || 'basic',
                      origin: 'generated',
                      currentFields: savedCard.currentFields,
                      originalFields: savedCard.originalFields || savedCard.currentFields,
                      isDeleted: savedCard.isDeleted,
                      analysis: savedCard.analysis,
                      tags: ['llmanki-generated'],
                      css: css,
                      modelName: 'Generated',
                      deckName: deckName,
                      front: savedCard.currentFields[0]?.value || '',
                      back: savedCard.currentFields[1]?.value || '',
                      scheduling: savedCard.scheduling ?? null,
                      reviewData: savedCard.reviewData ?? null,
                    };
                    
                    // Add to cards state
                    draft.cards.set(savedCard.cardId, generatedCardState);
                    
                    // CRITICAL: Also add to collection.cards and collection.notes
                    // so that getCardsInDeck() returns them in the card list
                    const modelId = draft.collection!.models.keys().next().value ?? 1;
                    
                    // Create AnkiNote
                    const ankiNote: AnkiNote = {
                      id: savedCard.noteId,
                      modelId: modelId,
                      fields: savedCard.currentFields.map(f => f.value),
                      tags: ['llmanki-generated'],
                      guid: `llmanki-${savedCard.cardId}`,
                      mod: Math.floor(Date.now() / 1000),
                    };
                    
                    // Create AnkiCard with all required fields per Anki schema
                    const ankiCard: AnkiCard = {
                      id: savedCard.cardId,
                      noteId: savedCard.noteId,
                      deckId: deckId,
                      ordinal: 0,
                      type: savedCard.type || 'basic',
                      queue: 0,
                      due: 0,
                      interval: 0,
                      factor: 2500,
                      reps: 0,
                      lapses: 0,
                      left: 0,
                      odue: 0,
                      odid: 0,
                      flags: 0,
                    };
                    
                    // Add to collection
                    draft.collection!.cards.set(savedCard.cardId, ankiCard);
                    draft.collection!.notes.set(savedCard.noteId, ankiNote);
                  }
                }
              }
              
              // Store persisted state reference
              draft.persistedCardState = persistedMap;
            });
          }
        },

        setIsLoadingCollection: (loading) => {
          set(state => {
            state.isLoadingCollection = loading;
          });
        },

        setLoadingProgress: (progress) => {
          set(state => {
            state.loadingProgress = progress;
          });
        },

        initializeCards: (cardDataList) => {
          set(state => {
            const newCards = new Map<number, CardStateData>();
            for (const cardData of cardDataList) {
              newCards.set(cardData.cardId, cardData);
            }
            state.cards = newCards;
          });
        },

        createEmptyCollection: () => {
          const collection = Deck.createEmptyCollection();
          set(state => {
            state.collection = collection;
            state.fileName = 'New Collection';
            state.isLoadingCollection = false;
            state.loadingProgress = null;
            state.selectedDeckId = null;
            state.selectedCardId = null;
            state.isAnalyzing = false;
            state.analysisError = null;
            state.cards = new Map();
            state.persistedCardState = new Map();
            state.addedSuggestedCards = new Map();
            state.generatedDeckIds = new Set();
            state.undoStack = [];
            state.redoStack = [];
            state.suggestedCards = [];
            state.deckAnalysisCache = new Map();
            state.addCardPanelState = new Map();
          });
        },

        // === Deck Actions ===
        createDeck: (name, description) => {
          const state = get();
          let collection = state.collection;
          
          // If no collection, create an empty one first
          if (!collection) {
            collection = Deck.createEmptyCollection();
            // Create deck on the new (mutable) collection before putting it in the store
            const deck = Deck.create(name, collection, { description });
            
            set(draft => {
              draft.collection = collection;
              draft.fileName = 'New Collection';
              draft.generatedDeckIds.add(deck.id);
            });
            
            get().persistDeckState();
            return deck.id;
          }
          
          // Collection exists - need to create deck inside set() to work with Immer draft
          let deckId: number | null = null;
          set(draft => {
            if (draft.collection) {
              const deck = Deck.create(name, draft.collection, { description });
              deckId = deck.id;
              draft.generatedDeckIds.add(deck.id);
            }
          });
          
          get().persistDeckState();
          return deckId;
        },

        createSubdeck: (parentDeckId, name, description) => {
          const state = get();
          const collection = state.collection;
          
          if (!collection) return null;
          
          const parentDeck = collection.decks.get(parentDeckId);
          if (!parentDeck) return null;
          
          // Create subdeck inside set() to work with Immer draft
          let deckId: number | null = null;
          set(draft => {
            if (draft.collection) {
              const deck = Deck.create(name, draft.collection, { description, parentId: parentDeckId });
              deckId = deck.id;
              draft.generatedDeckIds.add(deck.id);
            }
          });
          
          get().persistDeckState();
          return deckId;
        },

        deleteDeck: (deckId, deleteCards = false, deleteSubdecks = false) => {
          const state = get();
          const collection = state.collection;
          
          if (!collection || deckId === 1) return; // Can't delete default deck
          
          const ankiDeck = collection.decks.get(deckId);
          if (!ankiDeck) return;
          
          // Collect deck IDs that will be deleted (for UI updates)
          const deletedDeckIds = new Set<number>([deckId]);
          if (deleteSubdecks) {
            const collectChildren = (d: AnkiDeck) => {
              for (const child of d.children) {
                deletedDeckIds.add(child.id);
                collectChildren(child);
              }
            };
            collectChildren(ankiDeck);
          }
          
          set(draft => {
            if (draft.collection) {
              // Update CardStateData before deletion
              if (deleteCards) {
                // Remove card states for deleted cards
                for (const [cardId, card] of draft.collection.cards) {
                  if (deletedDeckIds.has(card.deckId)) {
                    draft.cards.delete(cardId);
                  }
                }
              } else {
                // Update card states to reflect move to default deck
                for (const [, cardState] of draft.cards) {
                  if (deletedDeckIds.has(cardState.deckId)) {
                    cardState.deckId = 1;
                    cardState.deckName = 'Default';
                  }
                }
              }
              
              // Use the Deck method to perform the actual deletion
              const deckInstance = Deck.fromAnkiDeck(
                draft.collection.decks.get(deckId)!,
                draft.collection
              );
              deckInstance.delete(deleteCards, deleteSubdecks);
              
              // Clean up generated deck tracking
              for (const deletedId of deletedDeckIds) {
                draft.generatedDeckIds.delete(deletedId);
              }
            }
            
            // Clear selection if selected deck was deleted
            if (deletedDeckIds.has(draft.selectedDeckId || 0)) {
              draft.selectedDeckId = null;
              draft.selectedCardId = null;
            }
          });
          
          get().persistDeckState();
        },

        renameDeck: (deckId, newName) => {
          const state = get();
          const collection = state.collection;
          
          if (!collection || deckId === 1) return;
          
          const ankiDeck = collection.decks.get(deckId);
          if (!ankiDeck) return;
          
          const oldName = ankiDeck.name;
          
          // Build full name with parent path for card state updates
          let fullName = newName;
          if (ankiDeck.parentId) {
            const parent = collection.decks.get(ankiDeck.parentId);
            if (parent) {
              fullName = `${parent.name}::${newName}`;
            }
          }
          
          set(draft => {
            if (draft.collection) {
              // Use the Deck method to perform the rename
              const deck = Deck.fromAnkiDeck(
                draft.collection.decks.get(deckId)!,
                draft.collection
              );
              deck.rename(newName);
              
              // Update card deck names in card state
              for (const [, cardState] of draft.cards) {
                if (cardState.deckName.startsWith(oldName)) {
                  cardState.deckName = cardState.deckName.replace(oldName, fullName);
                }
              }
            }
          });
          
          get().persistDeckState();
        },

        getDeck: (deckId) => {
          const state = get();
          const collection = state.collection;
          
          if (!collection) return null;
          
          const ankiDeck = collection.decks.get(deckId);
          if (!ankiDeck) return null;
          
          const origin = state.generatedDeckIds.has(deckId) ? 'generated' : 'original';
          return Deck.fromAnkiDeck(ankiDeck, collection, origin);
        },

        // === Selection Actions ===
        selectDeck: (deckId) => {
          set(state => {
            state.selectedDeckId = deckId;
            state.selectedCardId = null;
            state.analysisError = null;
            state.suggestedCards = [];
          });
        },

        selectCard: (cardId) => {
          // Cards are initialized atomically in setCollection() when the deck loads.
          // This method just updates the selection and loads associated analysis state.
          set(draft => {
            draft.selectedCardId = cardId;
            if (cardId) {
              const cardState = draft.cards.get(cardId);
              if (cardState?.analysis) {
                draft.suggestedCards = cardState.analysis.suggestedCards || [];
                draft.analysisError = cardState.analysis.error || null;
              } else {
                draft.suggestedCards = [];
                draft.analysisError = null;
              }
            } else {
              draft.suggestedCards = [];
              draft.analysisError = null;
            }
            draft.editingSuggestionIndex = null;
          });
        },

        // === Card Query Methods ===
        getCard: (cardId) => {
          const state = get();
          const cardState = state.cards.get(cardId);
          if (!cardState) return null;
          return createCard(cardState);
        },

        getCards: () => {
          const state = get();
          const result: ICard[] = [];
          for (const cardState of state.cards.values()) {
            result.push(createCard(cardState));
          }
          return result;
        },

        getCardsInDeck: (deckId, includeSubdecks = true) => {
          const state = get();
          const { collection, cards } = state;
          if (!collection) return [];
          
          // Get deck instance and use its method
          const ankiDeck = collection.decks.get(deckId);
          if (!ankiDeck) return [];
          
          const deck = Deck.fromAnkiDeck(ankiDeck, collection);
          
          // Convert to ICard map for filtering
          const cardMap = new Map<number, ICard>();
          for (const [id, cardState] of cards) {
            cardMap.set(id, createCard(cardState));
          }
          
          return deck.getCards(cardMap, includeSubdecks);
        },

        getSelectedCard: () => {
          const state = get();
          if (!state.selectedCardId) return null;
          return get().getCard(state.selectedCardId);
        },

        // === Card Mutation Actions ===
        updateCardFields: async (cardId, fields) => {
          const state = get();
          const cardState = state.cards.get(cardId);
          const collection = state.collection;
          
          if (!cardState || !collection) return;
          
          // Store previous state for undo
          const previousState = { ...cardState };
          
          // Update fields
          let newCardState = withUpdatedFields(cardState, fields);
          
          // Re-render content
          const { front, back } = await rerenderCardContent(collection, newCardState);
          newCardState = { ...newCardState, front, back };
          
          set(draft => {
            draft.cards.set(cardId, newCardState);
            draft.undoStack.push({
              type: 'update-fields',
              cardId,
              previousState,
              newState: newCardState,
            });
            draft.redoStack = [];
          });
          
          // Persist
          get().persistDeckState();
        },

        restoreCardFields: (cardId) => {
          const state = get();
          const cardState = state.cards.get(cardId);
          
          if (!cardState) return;
          
          const previousState = { ...cardState };
          const newCardState = withRestoredFields(cardState);
          
          set(draft => {
            draft.cards.set(cardId, newCardState);
            draft.undoStack.push({
              type: 'restore-fields',
              cardId,
              previousState,
              newState: newCardState,
            });
            draft.redoStack = [];
          });
          
          get().persistDeckState();
        },

        deleteCard: (cardId) => {
          const state = get();
          const cardState = state.cards.get(cardId);
          const collection = state.collection;
          
          if (!cardState || !collection) return;
          
          const previousState = { ...cardState };
          const card = createCard(cardState);
          
          if (card.canHardDelete) {
            // Hard delete - remove from collection and cards map
            set(draft => {
              draft.cards.delete(cardId);
              
              // Remove from collection
              if (draft.collection) {
                draft.collection.cards.delete(cardId);
                // Remove note if no other cards use it
                let noteUsed = false;
                for (const c of draft.collection.cards.values()) {
                  if (c.noteId === cardState.noteId) {
                    noteUsed = true;
                    break;
                  }
                }
                if (!noteUsed) {
                  draft.collection.notes.delete(cardState.noteId);
                }
              }
              
              // Remove from addedSuggestedCards tracking
              for (const [sourceId, entries] of draft.addedSuggestedCards) {
                const filtered = entries.filter(e => e.addedCardId !== cardId);
                if (filtered.length === 0) {
                  draft.addedSuggestedCards.delete(sourceId);
                } else if (filtered.length !== entries.length) {
                  draft.addedSuggestedCards.set(sourceId, filtered);
                }
              }
              
              // Clear selection if needed
              if (draft.selectedCardId === cardId) {
                draft.selectedCardId = null;
                draft.suggestedCards = [];
              }
              
              draft.undoStack.push({
                type: 'delete-card',
                cardId,
                previousState,
              });
              draft.redoStack = [];
            });
          } else {
            // Soft delete - mark as deleted
            const newCardState = withDeleted(cardState, true);
            
            set(draft => {
              draft.cards.set(cardId, newCardState);
              draft.undoStack.push({
                type: 'delete-card',
                cardId,
                previousState,
                newState: newCardState,
              });
              draft.redoStack = [];
            });
          }
          
          get().persistDeckState();
        },

        restoreCard: (cardId) => {
          const state = get();
          const cardState = state.cards.get(cardId);
          
          if (!cardState || !cardState.isDeleted) return;
          
          const previousState = { ...cardState };
          const newCardState = withDeleted(cardState, false);
          
          set(draft => {
            draft.cards.set(cardId, newCardState);
            draft.undoStack.push({
              type: 'delete-card',
              cardId,
              previousState,
              newState: newCardState,
            });
            draft.redoStack = [];
          });
          
          get().persistDeckState();
        },

        addCard: async (suggestedCard, deckId, sourceCardId, suggestedIndex) => {
          const state = get();
          const collection = state.collection;
          
          if (!collection) return null;
          
          // Get source card for potential metadata inheritance
          const sourceCard = sourceCardId ? get().getCard(sourceCardId) : undefined;
          const inheritMetadata = state.llmConfig.inheritCardMetadata;
          
          // Create the new card
          const { cardStateData, ankiCard, ankiNote } = await createGeneratedCard(
            collection,
            suggestedCard,
            deckId,
            sourceCard || undefined,
            inheritMetadata,
          );
          
          const cardId = cardStateData.cardId;
          
          set(draft => {
            // Add to cards map
            draft.cards.set(cardId, cardStateData);
            
            // Add to collection
            if (draft.collection) {
              draft.collection.cards.set(ankiCard.id, ankiCard);
              draft.collection.notes.set(ankiNote.id, ankiNote as AnkiNote);
            }
            
            // Track suggested card addition
            if (sourceCardId !== undefined && suggestedIndex !== undefined) {
              const existing = draft.addedSuggestedCards.get(sourceCardId) || [];
              draft.addedSuggestedCards.set(sourceCardId, [
                ...existing,
                { suggestedIndex, addedCardId: cardId },
              ]);
            }
            
            draft.undoStack.push({
              type: 'add-card',
              cardId,
              newState: cardStateData,
              ankiCard,
              ankiNote: ankiNote as AnkiNote,
            });
            draft.redoStack = [];
          });
          
          get().persistDeckState();
          
          return cardId;
        },

        addCardToDeck: async (deckId, front, back, options = {}) => {
          const state = get();
          const collection = state.collection;
          
          if (!collection) return null;
          
          const deck = get().getDeck(deckId);
          if (!deck) return null;
          
          const sourceCard = options.sourceCardId ? get().getCard(options.sourceCardId) : undefined;
          const inheritMetadata = state.llmConfig.inheritCardMetadata;
          
          // Use the Deck class to create the card
          const { cardStateData, ankiCard, ankiNote } = await deck.createCard(front, back, {
            type: options.type,
            tags: options.tags,
            sourceCard: sourceCard || undefined,
            inheritMetadata,
          });
          
          const cardId = cardStateData.cardId;
          
          set(draft => {
            // Add to cards map
            draft.cards.set(cardId, cardStateData);
            
            // Note: ankiCard and ankiNote are already added to collection by deck.createCard()
            
            draft.undoStack.push({
              type: 'add-card',
              cardId,
              newState: cardStateData,
              ankiCard,
              ankiNote,
            });
            draft.redoStack = [];
          });
          
          get().persistDeckState();
          
          return cardId;
        },

        // === Analysis Actions ===
        setCardAnalysis: (cardId, analysis) => {
          const state = get();
          const cardState = state.cards.get(cardId);
          
          if (!cardState) return;
          
          const newCardState = withAnalysis(cardState, analysis);
          
          set(draft => {
            draft.cards.set(cardId, newCardState);
            
            // Update suggested cards if this is the selected card
            if (draft.selectedCardId === cardId) {
              draft.suggestedCards = analysis.suggestedCards || [];
              draft.analysisError = analysis.error || null;
            }
          });
          
          get().persistDeckState();
        },

        clearCardAnalysis: (cardId) => {
          const state = get();
          const cardState = state.cards.get(cardId);
          
          if (!cardState) return;
          
          const newCardState = withAnalysis(cardState, null);
          
          set(draft => {
            draft.cards.set(cardId, newCardState);
            
            if (draft.selectedCardId === cardId) {
              draft.suggestedCards = [];
              draft.analysisError = null;
            }
          });
          
          get().persistDeckState();
        },

        setIsAnalyzing: (isAnalyzing) => {
          set(state => {
            state.isAnalyzing = isAnalyzing;
          });
        },

        setAnalysisError: (error) => {
          set(state => {
            state.analysisError = error;
          });
        },

        cacheDeckAnalysis: (deckId, result) => {
          set(state => {
            state.deckAnalysisCache.set(deckId, result);
          });
        },

        markDeckSuggestedCardAdded: (deckId, cardIndex) => {
          set(state => {
            const existing = state.deckAnalysisCache.get(deckId);
            if (existing) {
              const addedIndices = existing.addedSuggestedCardIndices || [];
              if (!addedIndices.includes(cardIndex)) {
                state.deckAnalysisCache.set(deckId, {
                  ...existing,
                  addedSuggestedCardIndices: [...addedIndices, cardIndex],
                });
              }
            }
          });
        },

        setAnalyzingDeckId: (deckId) => {
          set(state => {
            state.analyzingDeckId = deckId;
          });
        },

        setDeckAnalysisProgress: (progress) => {
          set(state => {
            state.deckAnalysisProgress = progress;
          });
        },

        cancelDeckAnalysis: () => {
          set(state => {
            state.deckAnalysisCancelled = true;
          });
        },

        isDeckAnalysisCancelled: () => get().deckAnalysisCancelled,

        resetDeckAnalysisCancelled: () => {
          set(state => {
            state.deckAnalysisCancelled = false;
          });
        },

        // === Suggested Cards Actions ===
        setSuggestedCards: (cards) => {
          set(state => {
            state.suggestedCards = cards;
          });
        },

        updateSuggestedCard: (index, card) => {
          set(state => {
            if (index >= 0 && index < state.suggestedCards.length) {
              state.suggestedCards[index] = card;
            }
          });
        },

        removeSuggestedCard: (index) => {
          set(state => {
            state.suggestedCards = state.suggestedCards.filter((_, i) => i !== index);
          });
        },

        setEditingSuggestionIndex: (index) => {
          set(state => {
            state.editingSuggestionIndex = index;
          });
        },

        // === Add Card Panel Actions ===
        getAddCardPanelState: (deckId) => {
          let state = get().addCardPanelState.get(deckId);
          if (!state) {
            // Initialize the state for this deck so subsequent calls return the same reference
            // This is critical to avoid infinite re-renders in React components
            state = { ...DEFAULT_ADD_CARD_PANEL_STATE };
            set(s => {
              s.addCardPanelState.set(deckId, state!);
            });
          }
          return state;
        },

        setAddCardPanelState: (deckId, newState) => {
          set(state => {
            const current = state.addCardPanelState.get(deckId) || { ...DEFAULT_ADD_CARD_PANEL_STATE };
            state.addCardPanelState.set(deckId, { ...current, ...newState });
          });
        },

        // === Suggested Card Tracking ===
        getAddedSuggestedIndices: (sourceCardId) => {
          const entries = get().addedSuggestedCards.get(sourceCardId) || [];
          return entries.map(e => e.suggestedIndex);
        },

        getAddedCardId: (sourceCardId, suggestedIndex) => {
          const entries = get().addedSuggestedCards.get(sourceCardId) || [];
          const entry = entries.find(e => e.suggestedIndex === suggestedIndex);
          return entry?.addedCardId ?? null;
        },

        // === Undo/Redo ===
        undo: () => {
          const state = get();
          if (state.undoStack.length === 0) return;
          
          const action = state.undoStack[state.undoStack.length - 1];
          
          set(draft => {
            draft.undoStack.pop();
            draft.redoStack.push(action);
            
            if (action.previousState) {
              // Restore previous state
              if (action.type === 'delete-card' && !action.newState) {
                // Was a hard delete - restore card
                draft.cards.set(action.cardId, action.previousState);
                if (action.ankiCard && action.ankiNote && draft.collection) {
                  draft.collection.cards.set(action.ankiCard.id, action.ankiCard);
                  draft.collection.notes.set(action.ankiNote.id, action.ankiNote);
                }
              } else {
                draft.cards.set(action.cardId, action.previousState);
              }
            } else if (action.type === 'add-card') {
              // Undo add - remove the card
              draft.cards.delete(action.cardId);
              if (draft.collection) {
                draft.collection.cards.delete(action.cardId);
                if (action.ankiNote) {
                  draft.collection.notes.delete(action.ankiNote.id);
                }
              }
              
              // Remove from tracking
              for (const [sourceId, entries] of draft.addedSuggestedCards) {
                const filtered = entries.filter(e => e.addedCardId !== action.cardId);
                if (filtered.length === 0) {
                  draft.addedSuggestedCards.delete(sourceId);
                } else if (filtered.length !== entries.length) {
                  draft.addedSuggestedCards.set(sourceId, filtered);
                }
              }
            }
            
            if (draft.selectedCardId === action.cardId) {
              draft.selectedCardId = null;
              draft.suggestedCards = [];
            }
          });
          
          get().persistDeckState();
        },

        redo: () => {
          const state = get();
          if (state.redoStack.length === 0) return;
          
          const action = state.redoStack[state.redoStack.length - 1];
          
          set(draft => {
            draft.redoStack.pop();
            draft.undoStack.push(action);
            
            if (action.newState) {
              draft.cards.set(action.cardId, action.newState);
            } else if (action.type === 'add-card' && action.ankiCard && action.ankiNote) {
              // Redo add
              if (action.newState) {
                draft.cards.set(action.cardId, action.newState);
              }
              if (draft.collection) {
                draft.collection.cards.set(action.ankiCard.id, action.ankiCard);
                draft.collection.notes.set(action.ankiNote.id, action.ankiNote);
              }
            } else if (action.type === 'delete-card' && !action.newState) {
              // Redo hard delete
              draft.cards.delete(action.cardId);
              if (draft.collection && action.previousState) {
                draft.collection.cards.delete(action.cardId);
                let noteUsed = false;
                for (const c of draft.collection.cards.values()) {
                  if (c.noteId === action.previousState.noteId) {
                    noteUsed = true;
                    break;
                  }
                }
                if (!noteUsed) {
                  draft.collection.notes.delete(action.previousState.noteId);
                }
              }
            }
            
            if (draft.selectedCardId === action.cardId) {
              draft.selectedCardId = null;
              draft.suggestedCards = [];
            }
          });
          
          get().persistDeckState();
        },

        canUndo: () => get().undoStack.length > 0,
        canRedo: () => get().redoStack.length > 0,

        // === Persistence ===
        persistDeckState: () => {
          const { fileName, cards, generatedDeckIds, collection } = get();
          if (!fileName) return;
          
          savePersistedDeckState(fileName, cards, generatedDeckIds, collection);
        },

        // === Settings ===
        setLLMConfig: (config) => {
          set(state => {
            state.llmConfig = { ...state.llmConfig, ...config };
          });
        },

        setShowSettings: (show) => {
          set(state => {
            state.showSettings = show;
          });
        },

        resetAnalysis: () => {
          set(state => {
            state.isAnalyzing = false;
            state.analysisError = null;
            state.suggestedCards = [];
            state.editingSuggestionIndex = null;
          });
        },
      })),
      {
        name: 'llmanki-storage',
        partialize: (state) => ({
          llmConfig: state.llmConfig,
        }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<AppState>;
          const persistedConfig = (persisted.llmConfig || {}) as Partial<LLMConfig>;
          return {
            ...currentState,
            llmConfig: {
              ...currentState.llmConfig,
              ...persistedConfig,
              apiKeys: {
                ...currentState.llmConfig.apiKeys,
                ...(persistedConfig.apiKeys || {}),
              },
            },
          };
        },
      }
    )
  )
);
