import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  AnkiCollection, 
  AnkiCard, 
  RenderedCard, 
  LLMConfig, 
  LLMAnalysisResult,
  SuggestedCard,
  CardChange
} from '../types';
import { getDefaultConfig } from '../utils/llmService';

interface AppState {
  // Collection state
  collection: AnkiCollection | null;
  fileName: string | null;
  
  // Selection state
  selectedDeckId: number | null;
  selectedCardId: number | null;
  selectedCard: RenderedCard | null;
  
  // Analysis state
  analysisResult: LLMAnalysisResult | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  
  // Pending changes
  pendingChanges: CardChange[];
  suggestedCards: SuggestedCard[];
  editingSuggestionIndex: number | null;
  
  // Settings
  llmConfig: LLMConfig;
  showSettings: boolean;
  
  // Actions
  setCollection: (collection: AnkiCollection | null, fileName: string | null) => void;
  selectDeck: (deckId: number | null) => void;
  selectCard: (cardId: number | null, renderedCard: RenderedCard | null) => void;
  setAnalysisResult: (result: LLMAnalysisResult | null) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setAnalysisError: (error: string | null) => void;
  setSuggestedCards: (cards: SuggestedCard[]) => void;
  updateSuggestedCard: (index: number, card: SuggestedCard) => void;
  removeSuggestedCard: (index: number) => void;
  setEditingSuggestionIndex: (index: number | null) => void;
  addPendingChange: (change: CardChange) => void;
  commitChange: (index: number) => void;
  clearPendingChanges: () => void;
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
      selectedDeckId: null,
      selectedCardId: null,
      selectedCard: null,
      analysisResult: null,
      isAnalyzing: false,
      analysisError: null,
      pendingChanges: [],
      suggestedCards: [],
      editingSuggestionIndex: null,
      llmConfig: getDefaultConfig(),
      showSettings: false,
      
      // Actions
      setCollection: (collection, fileName) => set({ 
        collection, 
        fileName,
        selectedDeckId: null,
        selectedCardId: null,
        selectedCard: null,
        analysisResult: null,
        pendingChanges: [],
        suggestedCards: []
      }),
      
      selectDeck: (deckId) => set({ 
        selectedDeckId: deckId,
        selectedCardId: null,
        selectedCard: null,
        analysisResult: null,
        suggestedCards: []
      }),
      
      selectCard: (cardId, renderedCard) => set({ 
        selectedCardId: cardId,
        selectedCard: renderedCard,
        analysisResult: null,
        suggestedCards: [],
        editingSuggestionIndex: null
      }),
      
      setAnalysisResult: (result) => set({ 
        analysisResult: result,
        suggestedCards: result?.suggestedCards || []
      }),
      
      setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
      
      setAnalysisError: (error) => set({ analysisError: error }),
      
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
      
      addPendingChange: (change) => set({ 
        pendingChanges: [...get().pendingChanges, change] 
      }),
      
      commitChange: (index) => {
        const changes = [...get().pendingChanges];
        changes[index] = { ...changes[index], committed: true };
        set({ pendingChanges: changes });
      },
      
      clearPendingChanges: () => set({ pendingChanges: [] }),
      
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
