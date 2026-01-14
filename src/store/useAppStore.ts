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
  AnkiNote
} from '../types';
import { getDefaultConfig } from '../utils/llmService';

interface AppState {
  // Collection state
  collection: AnkiCollection | null;
  fileName: string | null;
  isLoadingCollection: boolean;
  loadingProgress: string | null;
  
  // Track generated/AI-added cards
  generatedCardIds: Set<number>;
  
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
  cacheAnalysis: (cardId: number, result: LLMAnalysisResult) => void;
  getCachedAnalysis: (cardId: number) => LLMAnalysisResult | undefined;
  cacheDeckAnalysis: (deckId: number, result: DeckAnalysisResult) => void;
  setAnalyzingDeckId: (deckId: number | null) => void;
  setDeckAnalysisProgress: (progress: { current: number; total: number } | null) => void;
  cancelDeckAnalysis: () => void;
  isDeckAnalysisCancelled: () => boolean;
  resetDeckAnalysisCancelled: () => void;
  setSuggestedCards: (cards: SuggestedCard[]) => void;
  updateSuggestedCard: (index: number, card: SuggestedCard) => void;
  removeSuggestedCard: (index: number) => void;
  setEditingSuggestionIndex: (index: number | null) => void;
  
  // Card operations with undo/redo
  addCardToDeck: (suggestedCard: SuggestedCard, deckId: number) => number | null;
  deleteCard: (cardId: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  isGeneratedCard: (cardId: number) => boolean;
  
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
        generatedCardIds: new Set(),
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
      
      cacheAnalysis: (cardId, result) => {
        const cache = new Map(get().analysisCache);
        cache.set(cardId, result);
        set({ analysisCache: cache });
      },
      
      getCachedAnalysis: (cardId) => {
        return get().analysisCache.get(cardId);
      },
      
      cacheDeckAnalysis: (deckId, result) => {
        const cache = new Map(get().deckAnalysisCache);
        cache.set(deckId, result);
        set({ deckAnalysisCache: cache });
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
      
      // Add a card to the deck (immediately, with undo support)
      addCardToDeck: (suggestedCard, deckId) => {
        const collection = get().collection;
        if (!collection) return null;
        
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
          queue: 0,
          due: 0,
          interval: 0,
          factor: 2500,
          reps: 0,
          lapses: 0
        };
        
        // Update collection
        const newCards = new Map(collection.cards);
        newCards.set(cardId, card);
        
        const newNotes = new Map(collection.notes);
        newNotes.set(noteId, note);
        
        // Track as generated
        const newGeneratedIds = new Set(get().generatedCardIds);
        newGeneratedIds.add(cardId);
        
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
          collection: { ...collection, cards: newCards, notes: newNotes },
          generatedCardIds: newGeneratedIds,
          undoStack: [...get().undoStack, undoAction],
          redoStack: [] // Clear redo stack on new action
        });
        
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
          
          const updates: Partial<AppState> = {
            collection: { ...collection, cards: newCards, notes: newNotes },
            generatedCardIds: newGeneratedIds,
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
      })
    }
  )
);
