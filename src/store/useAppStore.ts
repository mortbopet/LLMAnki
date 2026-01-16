import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  AnkiCollection, 
  RenderedCard, 
  LLMConfig, 
  LLMAnalysisResult,
  SuggestedCard,
  DeckAnalysisResult,
  UndoableAction,
  AnkiCard,
  AnkiNote,
  CardType
} from '../types';
import { getDefaultConfig } from '../utils/llmService';
import {
  updateCardFields as updateCardFieldsService,
  restoreCardToOriginal,
  getOriginalFields,
} from '../services/cardState';
import { 
  cacheAnalysisResult, 
  loadValidCachedResults,
  getDeckState,
  saveDeckState,
  type DeckState
} from '../utils/analysisCache';

// State for the AddCardPanel - stored per deck
interface AddCardPanelState {
  activeTab: 'manual' | 'ai';
  aiPrompt: string;
  suggestedCards: SuggestedCard[];
  addedCards: Array<{ suggestedIndex: number; cardId: number }>;
  carouselIndex: number;
  manualCardType: CardType;
  manualFields: Array<{ name: string; value: string }>;
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

interface AppState {
  // Collection state
  collection: AnkiCollection | null;
  fileName: string | null;
  isLoadingCollection: boolean;
  loadingProgress: string | null;
  
  // Track generated/AI-added cards
  generatedCardIds: Set<number>;
  
  // Track cards marked for deletion (soft delete)
  markedForDeletion: Set<number>;
  
  // Track edited card fields - Map<noteId, fields>
  editedCards: Map<number, { name: string; value: string }[]>;
  
  // Track which suggested card indices have been added for each source card
  // Map<sourceCardId, { suggestedIndex: number, addedCardId: number }[]>
  addedSuggestedCards: Map<number, { suggestedIndex: number; addedCardId: number }[]>;
  
  // Undo/Redo stacks
  undoStack: UndoableAction[];
  redoStack: UndoableAction[];
  
  // Selection state
  selectedDeckId: number | null;
  selectedCardId: number | null;
  selectedCard: RenderedCard | null;
  
  // Analysis state
  analysisResult: LLMAnalysisResult | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  
  // Analysis cache (session only - not persisted) - now can include error states
  analysisCache: Map<number, LLMAnalysisResult>;
  
  // Deck analysis state - keyed by deckId
  deckAnalysisCache: Map<number, DeckAnalysisResult>;
  analyzingDeckId: number | null;
  deckAnalysisProgress: { current: number; total: number } | null;
  deckAnalysisCancelled: boolean;
  
  // Add card panel state per deck - Map<deckId, state>
  addCardPanelState: Map<number, AddCardPanelState>;
  
  // Suggested cards from analysis
  suggestedCards: SuggestedCard[];
  editingSuggestionIndex: number | null;
  
  // Settings
  llmConfig: LLMConfig;
  showSettings: boolean;
  
  // Actions
  setCollection: (collection: AnkiCollection | null, fileName: string | null) => void;
  setIsLoadingCollection: (loading: boolean) => void;
  setLoadingProgress: (progress: string | null) => void;
  selectDeck: (deckId: number | null) => void;
  selectCard: (cardId: number | null, renderedCard: RenderedCard | null) => void;
  setAnalysisResult: (result: LLMAnalysisResult | null) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setAnalysisError: (error: string | null) => void;
  cacheAnalysis: (cardId: number, result: LLMAnalysisResult, fields?: { name: string; value: string }[], deckName?: string) => void;
  getCachedAnalysis: (cardId: number) => LLMAnalysisResult | undefined;
  loadCachedAnalysesForDeck: (cards: Array<{ id: number; fields: { name: string; value: string }[]; deckName?: string }>) => number;
  cacheDeckAnalysis: (deckId: number, result: DeckAnalysisResult) => void;
  markDeckSuggestedCardAdded: (deckId: number, cardIndex: number) => void;
  setAnalyzingDeckId: (deckId: number | null) => void;
  setDeckAnalysisProgress: (progress: { current: number; total: number } | null) => void;
  cancelDeckAnalysis: () => void;
  isDeckAnalysisCancelled: () => boolean;
  resetDeckAnalysisCancelled: () => void;
  setSuggestedCards: (cards: SuggestedCard[]) => void;
  updateSuggestedCard: (index: number, card: SuggestedCard) => void;
  removeSuggestedCard: (index: number) => void;
  setEditingSuggestionIndex: (index: number | null) => void;
  
  // Add card panel state per deck
  getAddCardPanelState: (deckId: number) => AddCardPanelState;
  setAddCardPanelState: (deckId: number, state: Partial<AddCardPanelState>) => void;
  
  // Card operations with undo/redo
  addCardToDeck: (suggestedCard: SuggestedCard, deckId: number, sourceCardId?: number, suggestedIndex?: number) => number | null;
  deleteCard: (cardId: number) => void;
  markCardForDeletion: (cardId: number) => void;
  unmarkCardForDeletion: (cardId: number) => void;
  isCardMarkedForDeletion: (cardId: number) => boolean;
  getAddedSuggestedIndices: (sourceCardId: number) => number[];
  getAddedCardId: (sourceCardId: number, suggestedIndex: number) => number | null;
  updateCardFields: (noteId: number, fields: { name: string; value: string }[]) => void;
  getEditedFields: (noteId: number) => { name: string; value: string }[] | undefined;
  getOriginalFields: (noteId: number) => { name: string; value: string }[];
  isCardEdited: (noteId: number) => boolean;
  restoreCardEdits: (noteId: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  isGeneratedCard: (cardId: number) => boolean;
  
  // State persistence
  loadDeckState: () => void;
  persistDeckState: () => void;
  
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  setShowSettings: (show: boolean) => void;
  resetAnalysis: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      collection: null,
      fileName: null,
      isLoadingCollection: false,
      loadingProgress: null,
      generatedCardIds: new Set(),
      markedForDeletion: new Set(),
      editedCards: new Map(),
      addedSuggestedCards: new Map(),
      undoStack: [],
      redoStack: [],
      selectedDeckId: null,
      selectedCardId: null,
      selectedCard: null,
      analysisResult: null,
      isAnalyzing: false,
      analysisError: null,
      analysisCache: new Map(),
      deckAnalysisCache: new Map(),
      addCardPanelState: new Map(),
      analyzingDeckId: null,
      deckAnalysisProgress: null,
      deckAnalysisCancelled: false,
      suggestedCards: [],
      editingSuggestionIndex: null,
      llmConfig: getDefaultConfig(),
      showSettings: false,
      
      // Actions
      setCollection: (collection, fileName) => set({ 
        collection, 
        fileName,
        isLoadingCollection: false,
        loadingProgress: null,
        selectedDeckId: null,
        selectedCardId: null,
        selectedCard: null,
        analysisResult: null,
        analysisError: null,
        analysisCache: new Map(),
        deckAnalysisCache: new Map(),
        addCardPanelState: new Map(),
        generatedCardIds: new Set(),
        markedForDeletion: new Set(),
        editedCards: new Map(),
        addedSuggestedCards: new Map(),
        undoStack: [],
        redoStack: [],
        suggestedCards: []
      }),
      
      setIsLoadingCollection: (loading) => set({ isLoadingCollection: loading }),
      
      setLoadingProgress: (progress) => set({ loadingProgress: progress }),
      
      selectDeck: (deckId) => set({ 
        selectedDeckId: deckId,
        selectedCardId: null,
        selectedCard: null,
        analysisResult: null,
        analysisError: null,
        suggestedCards: []
      }),
      
      selectCard: (cardId, renderedCard) => {
        // Check if there's a cached analysis for this card
        const cached = cardId ? get().analysisCache.get(cardId) : undefined;
        set({ 
          selectedCardId: cardId,
          selectedCard: renderedCard,
          analysisResult: cached || null,
          analysisError: cached?.error || null, // Show error if cached result has one
          suggestedCards: cached?.suggestedCards || [],
          editingSuggestionIndex: null
        });
      },
      
      setAnalysisResult: (result) => set({ 
        analysisResult: result,
        suggestedCards: result?.suggestedCards || []
      }),
      
      setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
      
      setAnalysisError: (error) => set({ analysisError: error }),
      
      cacheAnalysis: (cardId, result, fields, deckName) => {
        const cache = new Map(get().analysisCache);
        cache.set(cardId, result);
        set({ analysisCache: cache });
        
        // Also persist to localStorage if we have the deck file name and fields
        const fileName = get().fileName;
        if (fileName && fields) {
          cacheAnalysisResult(fileName, cardId, fields, result, deckName);
        }
      },
      
      getCachedAnalysis: (cardId) => {
        return get().analysisCache.get(cardId);
      },
      
      loadCachedAnalysesForDeck: (cards) => {
        const fileName = get().fileName;
        if (!fileName || cards.length === 0) return 0;
        
        const validResults = loadValidCachedResults(fileName, cards);
        if (validResults.size === 0) return 0;
        
        // Merge with existing cache
        const cache = new Map(get().analysisCache);
        for (const [cardId, result] of validResults) {
          cache.set(cardId, result);
        }
        set({ analysisCache: cache });
        
        return validResults.size;
      },
      
      cacheDeckAnalysis: (deckId, result) => {
        const cache = new Map(get().deckAnalysisCache);
        cache.set(deckId, result);
        set({ deckAnalysisCache: cache });
      },
      
      markDeckSuggestedCardAdded: (deckId, cardIndex) => {
        const cache = new Map(get().deckAnalysisCache);
        const existing = cache.get(deckId);
        if (existing) {
          const addedIndices = existing.addedSuggestedCardIndices || [];
          if (!addedIndices.includes(cardIndex)) {
            cache.set(deckId, {
              ...existing,
              addedSuggestedCardIndices: [...addedIndices, cardIndex]
            });
            set({ deckAnalysisCache: cache });
          }
        }
      },
      
      setAnalyzingDeckId: (deckId) => set({ analyzingDeckId: deckId }),
      
      setDeckAnalysisProgress: (progress) => set({ deckAnalysisProgress: progress }),
      
      cancelDeckAnalysis: () => set({ deckAnalysisCancelled: true }),
      
      isDeckAnalysisCancelled: () => get().deckAnalysisCancelled,
      
      resetDeckAnalysisCancelled: () => set({ deckAnalysisCancelled: false }),
      
      setSuggestedCards: (cards) => set({ suggestedCards: cards }),
      
      updateSuggestedCard: (index, card) => {
        const cards = [...get().suggestedCards];
        cards[index] = card;
        set({ suggestedCards: cards });
      },
      
      removeSuggestedCard: (index) => {
        const cards = get().suggestedCards.filter((_, i) => i !== index);
        set({ suggestedCards: cards });
      },
      
      setEditingSuggestionIndex: (index) => set({ editingSuggestionIndex: index }),
      
      // Get add card panel state for a deck
      getAddCardPanelState: (deckId) => {
        const state = get().addCardPanelState.get(deckId);
        return state || { ...DEFAULT_ADD_CARD_PANEL_STATE };
      },
      
      // Update add card panel state for a deck
      setAddCardPanelState: (deckId, newState) => {
        const currentMap = get().addCardPanelState;
        const currentState = currentMap.get(deckId) || { ...DEFAULT_ADD_CARD_PANEL_STATE };
        const updatedMap = new Map(currentMap);
        updatedMap.set(deckId, { ...currentState, ...newState });
        set({ addCardPanelState: updatedMap });
      },
      
      // Add a card to the deck (immediately, with undo support)
      addCardToDeck: (suggestedCard, deckId, sourceCardId, suggestedIndex) => {
        const collection = get().collection;
        const llmConfig = get().llmConfig;
        if (!collection) return null;
        
        // Get source card for potential metadata inheritance
        const sourceCard = sourceCardId ? collection.cards.get(sourceCardId) : undefined;
        const shouldInheritMetadata = llmConfig.inheritCardMetadata && sourceCard;
        
        // Generate unique IDs
        const now = Date.now();
        const cardId = now;
        const noteId = now + 1;
        
        // Find the appropriate model based on card type
        let modelId: number | null = null;
        for (const [id, model] of collection.models) {
          if (suggestedCard.type === 'cloze' && model.type === 1) {
            modelId = id;
            break;
          } else if (suggestedCard.type !== 'cloze' && model.type === 0) {
            modelId = id;
            break;
          }
        }
        
        if (modelId === null) {
          // Fallback to first model
          modelId = collection.models.keys().next().value ?? 0;
        }
        
        // Create the note
        const note: AnkiNote = {
          id: noteId,
          modelId,
          fields: suggestedCard.fields.map(f => f.value),
          tags: ['llmanki-generated'],
          guid: `llmanki-${now}`,
          mod: Math.floor(now / 1000)
        };
        
        // Create the card
        const card: AnkiCard = {
          id: cardId,
          noteId,
          deckId,
          ordinal: 0,
          type: suggestedCard.type,
          // Inherit scheduling metadata if enabled, otherwise start fresh
          queue: shouldInheritMetadata ? sourceCard.queue : 0,
          due: shouldInheritMetadata ? sourceCard.due : 0,
          interval: shouldInheritMetadata ? sourceCard.interval : 0,
          factor: shouldInheritMetadata ? sourceCard.factor : 2500,
          reps: shouldInheritMetadata ? sourceCard.reps : 0,
          lapses: shouldInheritMetadata ? sourceCard.lapses : 0
        };
        
        // Update collection
        const newCards = new Map(collection.cards);
        newCards.set(cardId, card);
        
        const newNotes = new Map(collection.notes);
        newNotes.set(noteId, note);
        
        // Copy revlog entries if inheriting metadata
        const newRevlog = new Map(collection.revlog);
        if (shouldInheritMetadata && sourceCardId) {
          const sourceRevlog = collection.revlog.get(sourceCardId);
          if (sourceRevlog && sourceRevlog.length > 0) {
            // Create copies of revlog entries with new unique IDs and the new card ID
            // Generate new unique IDs based on current timestamp + offset
            const baseTime = Date.now();
            const copiedEntries = sourceRevlog.map((entry, idx) => ({
              ...entry,
              id: baseTime + idx, // New unique ID
              cardId: cardId
            }));
            newRevlog.set(cardId, copiedEntries);
          }
        }
        
        // Track as generated
        const newGeneratedIds = new Set(get().generatedCardIds);
        newGeneratedIds.add(cardId);
        
        // Track which suggested card was added
        const newAddedSuggested = new Map(get().addedSuggestedCards);
        if (sourceCardId !== undefined && suggestedIndex !== undefined) {
          const existing = newAddedSuggested.get(sourceCardId) || [];
          newAddedSuggested.set(sourceCardId, [...existing, { suggestedIndex, addedCardId: cardId }]);
        }
        
        // Create undo action
        const undoAction: UndoableAction = {
          type: 'add-card',
          cardId,
          noteId,
          card,
          note,
          deckId
        };
        
        set({
          collection: { ...collection, cards: newCards, notes: newNotes, revlog: newRevlog },
          generatedCardIds: newGeneratedIds,
          addedSuggestedCards: newAddedSuggested,
          undoStack: [...get().undoStack, undoAction],
          redoStack: [] // Clear redo stack on new action
        });
        
        // Persist state after adding card
        get().persistDeckState();
        
        return cardId;
      },
      
      // Delete a card (with undo support)
      deleteCard: (cardId) => {
        const collection = get().collection;
        if (!collection) return;
        
        const card = collection.cards.get(cardId);
        if (!card) return;
        
        const note = collection.notes.get(card.noteId);
        
        // Remove from collection
        const newCards = new Map(collection.cards);
        newCards.delete(cardId);
        
        const newNotes = new Map(collection.notes);
        if (note) {
          // Only delete note if no other cards reference it
          let otherCardsUseNote = false;
          for (const [, c] of newCards) {
            if (c.noteId === card.noteId) {
              otherCardsUseNote = true;
              break;
            }
          }
          if (!otherCardsUseNote) {
            newNotes.delete(card.noteId);
          }
        }
        
        // Remove from generatedCardIds if present
        const newGeneratedIds = new Set(get().generatedCardIds);
        newGeneratedIds.delete(cardId);
        
        // Remove from addedSuggestedCards tracking
        const newAddedSuggested = new Map(get().addedSuggestedCards);
        for (const [sourceId, entries] of newAddedSuggested) {
          const filtered = entries.filter(e => e.addedCardId !== cardId);
          if (filtered.length === 0) {
            newAddedSuggested.delete(sourceId);
          } else if (filtered.length !== entries.length) {
            newAddedSuggested.set(sourceId, filtered);
          }
        }
        
        // Create undo action
        const undoAction: UndoableAction = {
          type: 'delete-card',
          cardId,
          noteId: card.noteId,
          deletedCard: card,
          deletedNote: note,
          deckId: card.deckId
        };
        
        // Clear selection if deleted card was selected
        const updates: Partial<AppState> = {
          collection: { ...collection, cards: newCards, notes: newNotes },
          generatedCardIds: newGeneratedIds,
          addedSuggestedCards: newAddedSuggested,
          undoStack: [...get().undoStack, undoAction],
          redoStack: []
        };
        
        if (get().selectedCardId === cardId) {
          updates.selectedCardId = null;
          updates.selectedCard = null;
          updates.analysisResult = null;
        }
        
        set(updates as any);
      },
      
      // Undo last action
      undo: () => {
        const undoStack = get().undoStack;
        if (undoStack.length === 0) return;
        
        const action = undoStack[undoStack.length - 1];
        const collection = get().collection;
        if (!collection) return;
        
        if (action.type === 'add-card' && action.cardId && action.noteId) {
          // Undo add = delete the card
          const newCards = new Map(collection.cards);
          newCards.delete(action.cardId);
          
          const newNotes = new Map(collection.notes);
          newNotes.delete(action.noteId);
          
          const newGeneratedIds = new Set(get().generatedCardIds);
          newGeneratedIds.delete(action.cardId);
          
          // Remove from addedSuggestedCards tracking
          const newAddedSuggested = new Map(get().addedSuggestedCards);
          for (const [sourceId, entries] of newAddedSuggested) {
            const filtered = entries.filter(e => e.addedCardId !== action.cardId);
            if (filtered.length === 0) {
              newAddedSuggested.delete(sourceId);
            } else if (filtered.length !== entries.length) {
              newAddedSuggested.set(sourceId, filtered);
            }
          }
          
          const updates: Partial<AppState> = {
            collection: { ...collection, cards: newCards, notes: newNotes },
            generatedCardIds: newGeneratedIds,
            addedSuggestedCards: newAddedSuggested,
            undoStack: undoStack.slice(0, -1),
            redoStack: [...get().redoStack, action]
          };
          
          if (get().selectedCardId === action.cardId) {
            updates.selectedCardId = null;
            updates.selectedCard = null;
            updates.analysisResult = null;
          }
          
          set(updates as any);
        } else if (action.type === 'delete-card' && action.deletedCard) {
          // Undo delete = restore the card
          const newCards = new Map(collection.cards);
          newCards.set(action.deletedCard.id, action.deletedCard);
          
          const newNotes = new Map(collection.notes);
          if (action.deletedNote) {
            newNotes.set(action.deletedNote.id, action.deletedNote);
          }
          
          set({
            collection: { ...collection, cards: newCards, notes: newNotes },
            undoStack: undoStack.slice(0, -1),
            redoStack: [...get().redoStack, action]
          });
        }
      },
      
      // Redo last undone action
      redo: () => {
        const redoStack = get().redoStack;
        if (redoStack.length === 0) return;
        
        const action = redoStack[redoStack.length - 1];
        const collection = get().collection;
        if (!collection) return;
        
        if (action.type === 'add-card' && action.card && action.note) {
          // Redo add = add the card back
          const newCards = new Map(collection.cards);
          newCards.set(action.card.id, action.card);
          
          const newNotes = new Map(collection.notes);
          newNotes.set(action.note.id, action.note);
          
          const newGeneratedIds = new Set(get().generatedCardIds);
          newGeneratedIds.add(action.card.id);
          
          set({
            collection: { ...collection, cards: newCards, notes: newNotes },
            generatedCardIds: newGeneratedIds,
            undoStack: [...get().undoStack, action],
            redoStack: redoStack.slice(0, -1)
          });
        } else if (action.type === 'delete-card' && action.cardId) {
          // Redo delete = delete the card again
          const newCards = new Map(collection.cards);
          newCards.delete(action.cardId);
          
          const newNotes = new Map(collection.notes);
          if (action.noteId) {
            // Only delete note if no other cards reference it
            let otherCardsUseNote = false;
            for (const [, c] of newCards) {
              if (c.noteId === action.noteId) {
                otherCardsUseNote = true;
                break;
              }
            }
            if (!otherCardsUseNote) {
              newNotes.delete(action.noteId);
            }
          }
          
          const updates: Partial<AppState> = {
            collection: { ...collection, cards: newCards, notes: newNotes },
            undoStack: [...get().undoStack, action],
            redoStack: redoStack.slice(0, -1)
          };
          
          if (get().selectedCardId === action.cardId) {
            updates.selectedCardId = null;
            updates.selectedCard = null;
            updates.analysisResult = null;
          }
          
          set(updates as any);
        }
      },
      
      canUndo: () => get().undoStack.length > 0,
      canRedo: () => get().redoStack.length > 0,
      isGeneratedCard: (cardId) => get().generatedCardIds.has(cardId),
      
      // Mark a card for deletion (soft delete - visual only until export)
      markCardForDeletion: (cardId) => {
        const marked = new Set(get().markedForDeletion);
        marked.add(cardId);
        set({ markedForDeletion: marked });
        // Persist state after marking
        get().persistDeckState();
      },
      
      // Unmark a card from deletion
      unmarkCardForDeletion: (cardId) => {
        const marked = new Set(get().markedForDeletion);
        marked.delete(cardId);
        set({ markedForDeletion: marked });
        // Persist state after unmarking
        get().persistDeckState();
      },
      
      // Check if a card is marked for deletion
      isCardMarkedForDeletion: (cardId) => get().markedForDeletion.has(cardId),
      
      // Get which suggested card indices have been added for a source card
      getAddedSuggestedIndices: (sourceCardId) => {
        const entries = get().addedSuggestedCards.get(sourceCardId) || [];
        return entries.map(e => e.suggestedIndex);
      },
      
      // Get the added card ID for a specific suggested card
      getAddedCardId: (sourceCardId, suggestedIndex) => {
        const entries = get().addedSuggestedCards.get(sourceCardId) || [];
        const entry = entries.find(e => e.suggestedIndex === suggestedIndex);
        return entry?.addedCardId ?? null;
      },
      
      // Update card fields (for editing) - uses cardState service for logic
      updateCardFields: (noteId, fields) => {
        const collection = get().collection;
        if (!collection) return;
        
        // Use the card state service to handle the update logic
        const result = updateCardFieldsService(
          collection,
          noteId,
          fields,
          get().editedCards
        );
        
        // Invalidate analysis cache if content changed
        let analysisCache = get().analysisCache;
        if (result.shouldInvalidateCache) {
          analysisCache = new Map(analysisCache);
          for (const [cardId, card] of collection.cards) {
            if (card.noteId === noteId) {
              analysisCache.delete(cardId);
            }
          }
        }
        
        set({ editedCards: result.editedCards, analysisCache });
        // Persist state after editing
        get().persistDeckState();
      },
      
      // Get edited fields for a note
      getEditedFields: (noteId) => get().editedCards.get(noteId),
      
      // Check if a card has been edited
      isCardEdited: (noteId) => get().editedCards.has(noteId),

      // Restore card to original (remove edits) - uses cardState service
      restoreCardEdits: (noteId) => {
        // Only update if the card was actually edited
        if (!get().editedCards.has(noteId)) return;
        
        const editedCards = restoreCardToOriginal(noteId, get().editedCards);
        set({ editedCards });
        get().persistDeckState();
      },
      
      // Get the original fields for a card (before any edits)
      getOriginalFields: (noteId) => {
        const collection = get().collection;
        if (!collection) return [];
        return getOriginalFields(collection, noteId);
      },
      
      // Load deck state from localStorage (generated cards, marked for deletion, edited cards)
      loadDeckState: () => {
        const fileName = get().fileName;
        const collection = get().collection;
        if (!fileName || !collection) return;
        
        const savedState = getDeckState(fileName);
        if (!savedState) return;
        
        // Restore markedForDeletion
        const markedForDeletion = new Set(savedState.markedForDeletion);
        
        // Restore edited cards
        const editedCards = new Map<number, { name: string; value: string }[]>();
        if (savedState.editedCards) {
          for (const [noteIdStr, fields] of Object.entries(savedState.editedCards)) {
            editedCards.set(Number(noteIdStr), fields);
          }
        }
        
        // Restore generated cards - need to add them back to the collection
        const newCards = new Map(collection.cards);
        const newNotes = new Map(collection.notes);
        
        // Always restore generatedCardIds from saved state
        // This ensures styling is applied even if cards already exist in collection
        const generatedCardIds = new Set(savedState.generatedCardIds);
        
        for (const { card, note } of savedState.generatedCards) {
          // Only add to collection if the card doesn't already exist
          if (!newCards.has(card.id)) {
            newCards.set(card.id, card);
            newNotes.set(note.id, note);
          }
        }
        
        set({
          collection: { ...collection, cards: newCards, notes: newNotes },
          generatedCardIds,
          markedForDeletion,
          editedCards
        });
      },
      
      // Persist deck state to localStorage
      persistDeckState: () => {
        const fileName = get().fileName;
        const collection = get().collection;
        const generatedCardIds = get().generatedCardIds;
        const markedForDeletion = get().markedForDeletion;
        const editedCards = get().editedCards;
        
        if (!fileName || !collection) return;
        
        // Build the generated cards array
        const generatedCards: Array<{ card: AnkiCard; note: AnkiNote }> = [];
        for (const cardId of generatedCardIds) {
          const card = collection.cards.get(cardId);
          if (card) {
            const note = collection.notes.get(card.noteId);
            if (note) {
              generatedCards.push({ card, note });
            }
          }
        }
        
        // Convert editedCards Map to Record for serialization
        const editedCardsRecord: Record<number, { name: string; value: string }[]> = {};
        editedCards.forEach((fields, noteId) => {
          editedCardsRecord[noteId] = fields;
        });
        
        const state: DeckState = {
          generatedCardIds: Array.from(generatedCardIds),
          markedForDeletion: Array.from(markedForDeletion),
          generatedCards,
          editedCards: editedCardsRecord,
          lastUpdated: Date.now()
        };
        
        saveDeckState(fileName, state);
      },
      
      setLLMConfig: (config) => set({ 
        llmConfig: { ...get().llmConfig, ...config } 
      }),
      
      setShowSettings: (show) => set({ showSettings: show }),
      
      resetAnalysis: () => set({
        analysisResult: null,
        isAnalyzing: false,
        analysisError: null,
        suggestedCards: [],
        editingSuggestionIndex: null
      })
    }),
    {
      name: 'llmanki-storage',
      partialize: (state) => ({ 
        llmConfig: state.llmConfig 
      }),
      // Merge persisted state with defaults to ensure new config fields are present
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState>;
        const persistedConfig = (persisted.llmConfig || {}) as Partial<LLMConfig>;
        return {
          ...currentState,
          llmConfig: {
            ...currentState.llmConfig,
            ...persistedConfig,
            // Deep merge apiKeys to preserve API keys from both default and persisted
            apiKeys: {
              ...currentState.llmConfig.apiKeys,
              ...(persistedConfig.apiKeys || {})
            }
          }
        };
      }
    }
  )
);
