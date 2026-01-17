/**
 * Card State Management Tests
 * 
 * Tests the complete flow of:
 * 1. Creating collections using the Deck domain class
 * 2. Loading decks via the store
 * 3. Adding new cards
 * 4. Editing card fields
 * 5. Persistence across unload/reload cycles
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import {
  createCard,
  fieldsEqual,
  withUpdatedFields,
  withDeleted,
  withRestoredFields,
  Deck,
  resetIdCounter,
} from '../domain';
import type { CardStateData } from '../domain';
import type { CardField, SuggestedCard, AnkiCollection, LLMAnalysisResult } from '../types';

// ============================================================================
// Test Helpers
// ============================================================================

// Use fixed timestamps for deterministic IDs
const testSeed = 1000000;

/**
 * Create a mock AnkiCollection for testing using the Deck domain class
 */
function createMockCollection(cardConfigs: { front: string; back: string }[], baseSeed?: number): AnkiCollection {
  // Reset ID counter for deterministic tests
  resetIdCounter(baseSeed ?? testSeed);
  
  // Create empty collection using Deck domain
  const collection = Deck.createEmptyCollection();
  
  // Create a test deck
  const deck = Deck.create('Test Deck', collection, {
    description: 'Test deck for unit tests',
  });
  
  // Add cards to the deck synchronously (createCard returns Promise but we need sync for tests)
  // For testing, we directly manipulate the collection to add cards synchronously
  const modelId = [...collection.models.keys()].find(id => id !== 0) || 1;
  
  cardConfigs.forEach((config, index) => {
    // Use the deck's method to add cards - need to wait for async
    const noteId = (baseSeed ?? testSeed) + 100 + index;
    const cardId = (baseSeed ?? testSeed) + 1000 + index;
    
    // Add note directly to collection
    collection.notes.set(noteId, {
      id: noteId,
      modelId,
      fields: [config.front, config.back],
      tags: ['test'],
      guid: `test-${noteId}`,
      mod: Math.floor((baseSeed ?? testSeed) / 1000),
    });
    
    // Add card directly to collection
    collection.cards.set(cardId, {
      id: cardId,
      noteId,
      deckId: deck.id,
      ordinal: 0,
      type: 'basic',
      queue: 0,
      due: 0,
      interval: 0,
      factor: 2500,
      reps: 0,
      lapses: 0,
    });
  });
  
  return collection;
}

/**
 * Load a mock collection into the store with deterministic IDs
 */
function loadMockCollection(cardConfigs: { front: string; back: string }[], fileName: string, baseSeed?: number): AnkiCollection {
  const collection = createMockCollection(cardConfigs, baseSeed);
  useAppStore.getState().setCollection(collection, fileName);
  return collection;
}

/**
 * Unload the current deck
 */
function unloadDeck(): void {
  useAppStore.getState().setCollection(null, null);
}

/**
 * Reload a deck (simulate closing and reopening same file)
 */
function reloadDeck(cardConfigs: { front: string; back: string }[], fileName: string, baseSeed?: number): AnkiCollection {
  return loadMockCollection(cardConfigs, fileName, baseSeed);
}

/**
 * Get the deck ID (first non-default deck)
 */
function getFirstDeckId(): number | null {
  const state = useAppStore.getState();
  if (!state.collection) return null;
  
  for (const [id] of state.collection.decks) {
    if (id !== 1) return id; // Skip default deck (id=1)
  }
  return null;
}

/**
 * Create a mock SuggestedCard for adding to the deck
 */
function createMockSuggestedCard(front: string, back: string): SuggestedCard {
  return {
    type: 'basic',
    fields: [
      { name: 'Front', value: front },
      { name: 'Back', value: back },
    ],
    explanation: 'Test card',
  };
}

// ============================================================================
// Domain Function Tests
// ============================================================================

describe('Domain Functions', () => {
  describe('fieldsEqual', () => {
    it('returns true for identical field arrays', () => {
      const fields: CardField[] = [
        { name: 'Front', value: 'Question' },
        { name: 'Back', value: 'Answer' },
      ];
      expect(fieldsEqual(fields, fields)).toBe(true);
    });

    it('returns true for equivalent field arrays', () => {
      const a: CardField[] = [
        { name: 'Front', value: 'Question' },
        { name: 'Back', value: 'Answer' },
      ];
      const b: CardField[] = [
        { name: 'Front', value: 'Question' },
        { name: 'Back', value: 'Answer' },
      ];
      expect(fieldsEqual(a, b)).toBe(true);
    });

    it('returns false when values differ', () => {
      const a: CardField[] = [
        { name: 'Front', value: 'Question' },
        { name: 'Back', value: 'Answer' },
      ];
      const b: CardField[] = [
        { name: 'Front', value: 'Question' },
        { name: 'Back', value: 'Different Answer' },
      ];
      expect(fieldsEqual(a, b)).toBe(false);
    });

    it('returns false when names differ', () => {
      const a: CardField[] = [
        { name: 'Front', value: 'Question' },
      ];
      const b: CardField[] = [
        { name: 'Question', value: 'Question' },
      ];
      expect(fieldsEqual(a, b)).toBe(false);
    });

    it('returns false when lengths differ', () => {
      const a: CardField[] = [
        { name: 'Front', value: 'Question' },
      ];
      const b: CardField[] = [
        { name: 'Front', value: 'Question' },
        { name: 'Back', value: 'Answer' },
      ];
      expect(fieldsEqual(a, b)).toBe(false);
    });

    it('handles empty arrays', () => {
      expect(fieldsEqual([], [])).toBe(true);
    });
  });

  describe('withUpdatedFields', () => {
    it('creates new state with updated fields', () => {
      const original: CardStateData = {
        cardId: 1,
        noteId: 1,
        deckId: 1,
        type: 'basic',
        origin: 'original',
        currentFields: [{ name: 'Front', value: 'Old' }],
        originalFields: [{ name: 'Front', value: 'Old' }],
        isDeleted: false,
        analysis: null,
        tags: [],
        css: '',
        modelName: 'Basic',
        deckName: 'Test',
        front: 'Old',
        back: '',
        scheduling: null,
        reviewData: null,
      };

      const newFields = [{ name: 'Front', value: 'New' }];
      const updated = withUpdatedFields(original, newFields);

      expect(updated.currentFields).toEqual(newFields);
      expect(updated.originalFields).toEqual(original.originalFields);
      // Original should be unchanged
      expect(original.currentFields[0].value).toBe('Old');
    });
  });

  describe('withDeleted', () => {
    it('marks card as deleted', () => {
      const original: CardStateData = {
        cardId: 1,
        noteId: 1,
        deckId: 1,
        type: 'basic',
        origin: 'original',
        currentFields: [],
        originalFields: [],
        isDeleted: false,
        analysis: null,
        tags: [],
        css: '',
        modelName: 'Basic',
        deckName: 'Test',
        front: '',
        back: '',
        scheduling: null,
        reviewData: null,
      };

      const deleted = withDeleted(original, true);
      expect(deleted.isDeleted).toBe(true);
      expect(original.isDeleted).toBe(false);
    });
  });

  describe('withRestoredFields', () => {
    it('restores fields to original values', () => {
      const original: CardStateData = {
        cardId: 1,
        noteId: 1,
        deckId: 1,
        type: 'basic',
        origin: 'original',
        currentFields: [{ name: 'Front', value: 'Edited' }],
        originalFields: [{ name: 'Front', value: 'Original' }],
        isDeleted: false,
        analysis: null,
        tags: [],
        css: '',
        modelName: 'Basic',
        deckName: 'Test',
        front: '',
        back: '',
        scheduling: null,
        reviewData: null,
      };

      const restored = withRestoredFields(original);
      expect(restored.currentFields).toEqual(original.originalFields);
    });
  });

  describe('createCard', () => {
    it('creates OriginalCard for original origin', () => {
      const data: CardStateData = {
        cardId: 1,
        noteId: 1,
        deckId: 1,
        type: 'basic',
        origin: 'original',
        currentFields: [{ name: 'Front', value: 'Q' }],
        originalFields: [{ name: 'Front', value: 'Q' }],
        isDeleted: false,
        analysis: null,
        tags: [],
        css: '',
        modelName: 'Basic',
        deckName: 'Test',
        front: 'Q',
        back: 'A',
        scheduling: null,
        reviewData: null,
      };

      const card = createCard(data);
      expect(card.origin).toBe('original');
      expect(card.canHardDelete).toBe(false);
    });

    it('creates GeneratedCard for generated origin', () => {
      const data: CardStateData = {
        cardId: 1,
        noteId: 1,
        deckId: 1,
        type: 'basic',
        origin: 'generated',
        currentFields: [{ name: 'Front', value: 'Q' }],
        originalFields: [{ name: 'Front', value: 'Q' }],
        isDeleted: false,
        analysis: null,
        tags: [],
        css: '',
        modelName: 'Generated',
        deckName: 'Test',
        front: 'Q',
        back: 'A',
        scheduling: null,
        reviewData: null,
      };

      const card = createCard(data);
      expect(card.origin).toBe('generated');
      expect(card.canHardDelete).toBe(true);
    });

    it('correctly computes isEdited', () => {
      const data: CardStateData = {
        cardId: 1,
        noteId: 1,
        deckId: 1,
        type: 'basic',
        origin: 'original',
        currentFields: [{ name: 'Front', value: 'Edited' }],
        originalFields: [{ name: 'Front', value: 'Original' }],
        isDeleted: false,
        analysis: null,
        tags: [],
        css: '',
        modelName: 'Basic',
        deckName: 'Test',
        front: '',
        back: '',
        scheduling: null,
        reviewData: null,
      };

      const card = createCard(data);
      expect(card.isEdited).toBe(true);
    });
  });
});

// ============================================================================
// Store Actions Tests
// ============================================================================

describe('Store Actions', () => {
  beforeEach(() => {
    // Reset store state before each test
    localStorage.clear();
    useAppStore.setState({
      collection: null,
      fileName: null,
      isLoadingCollection: false,
      loadingProgress: null,
      cards: new Map(),
      persistedCardState: new Map(),
      addedSuggestedCards: new Map(),
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
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Deck Loading', () => {
    it('loads a deck and initializes cards', () => {
      loadMockCollection([
        { front: 'Q1', back: 'A1' },
        { front: 'Q2', back: 'A2' },
        { front: 'Q3', back: 'A3' },
      ], 'Test Deck.apkg');

      const state = useAppStore.getState();
      expect(state.collection).not.toBeNull();
      expect(state.fileName).toBe('Test Deck.apkg');
      expect(state.cards.size).toBe(3);
    });

    it('loads cards with correct fields', () => {
      loadMockCollection([
        { front: 'What is 2+2?', back: '4' },
      ], 'Field Test.apkg');

      const state = useAppStore.getState();
      const cards = Array.from(state.cards.values());
      expect(cards.length).toBe(1);
      
      const card = cards[0];
      expect(card.currentFields.length).toBe(2);
      expect(card.currentFields[0].name).toBe('Front');
      expect(card.currentFields[0].value).toBe('What is 2+2?');
      expect(card.currentFields[1].name).toBe('Back');
      expect(card.currentFields[1].value).toBe('4');
    });

    it('unloads deck properly', () => {
      loadMockCollection([{ front: 'Q', back: 'A' }, { front: 'Q2', back: 'A2' }], 'Test.apkg');
      expect(useAppStore.getState().collection).not.toBeNull();
      
      unloadDeck();
      
      const state = useAppStore.getState();
      expect(state.collection).toBeNull();
      expect(state.fileName).toBeNull();
      expect(state.cards.size).toBe(0);
    });
  });

  describe('Deck Creation', () => {
    it('creates a new deck when no collection exists', () => {
      // Start with no collection
      expect(useAppStore.getState().collection).toBeNull();
      
      // Create a deck - this should also create an empty collection
      const deckId = useAppStore.getState().createDeck('My New Deck', 'A test deck');
      
      expect(deckId).not.toBeNull();
      
      const state = useAppStore.getState();
      expect(state.collection).not.toBeNull();
      expect(state.fileName).toBe('New Collection');
      expect(state.generatedDeckIds.has(deckId!)).toBe(true);
      
      // Verify the deck exists in the collection
      const deck = state.collection!.decks.get(deckId!);
      expect(deck).toBeDefined();
      expect(deck!.name).toBe('My New Deck');
      expect(deck!.description).toBe('A test deck');
    });

    it('creates a new deck when collection already exists in store', () => {
      // Load an existing collection first
      loadMockCollection([{ front: 'Q1', back: 'A1' }], 'Existing.apkg');
      
      const initialDeckCount = useAppStore.getState().collection!.decks.size;
      
      // Now create a new deck on the existing (and thus Immer-frozen) collection
      const deckId = useAppStore.getState().createDeck('Another Deck');
      
      expect(deckId).not.toBeNull();
      
      const state = useAppStore.getState();
      expect(state.collection!.decks.size).toBe(initialDeckCount + 1);
      expect(state.generatedDeckIds.has(deckId!)).toBe(true);
      
      const deck = state.collection!.decks.get(deckId!);
      expect(deck).toBeDefined();
      expect(deck!.name).toBe('Another Deck');
    });

    it('creates a subdeck under an existing deck', () => {
      // Load collection with existing deck
      loadMockCollection([{ front: 'Q1', back: 'A1' }], 'Test.apkg');
      
      // Find the test deck (non-default)
      const parentDeckId = getFirstDeckId();
      expect(parentDeckId).not.toBeNull();
      
      // Create a subdeck
      const subdeckId = useAppStore.getState().createSubdeck(parentDeckId!, 'Child Deck', 'A subdeck');
      
      expect(subdeckId).not.toBeNull();
      
      const state = useAppStore.getState();
      const subdeck = state.collection!.decks.get(subdeckId!);
      expect(subdeck).toBeDefined();
      expect(subdeck!.name).toContain('Child Deck');
      expect(subdeck!.parentId).toBe(parentDeckId);
      expect(state.generatedDeckIds.has(subdeckId!)).toBe(true);
      
      // Verify parent has the child
      const parentDeck = state.collection!.decks.get(parentDeckId!);
      expect(parentDeck!.children.some(c => c.id === subdeckId)).toBe(true);
    });

    it('returns null when creating subdeck with invalid parent', () => {
      loadMockCollection([{ front: 'Q1', back: 'A1' }], 'Test.apkg');
      
      const subdeckId = useAppStore.getState().createSubdeck(999999, 'Orphan Deck');
      
      expect(subdeckId).toBeNull();
    });
  });

  describe('Card Selection', () => {
    it('selects a card by ID', () => {
      loadMockCollection([{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2' }], 'Test.apkg');
      const cards = Array.from(useAppStore.getState().cards.values());
      const cardId = cards[0].cardId;

      useAppStore.getState().selectCard(cardId);

      expect(useAppStore.getState().selectedCardId).toBe(cardId);
    });

    it('retrieves selected card via getSelectedCard', () => {
      loadMockCollection([{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2' }], 'Test.apkg');
      const cards = Array.from(useAppStore.getState().cards.values());
      const cardId = cards[0].cardId;

      useAppStore.getState().selectCard(cardId);
      const selectedCard = useAppStore.getState().getSelectedCard();

      expect(selectedCard).not.toBeNull();
      expect(selectedCard?.id).toBe(cardId);
    });
  });

  describe('Card Field Updates', () => {
    it('updates card fields', async () => {
      loadMockCollection([{ front: 'Original Q', back: 'Original A' }], 'Test.apkg');
      const cards = Array.from(useAppStore.getState().cards.values());
      const cardId = cards[0].cardId;

      const newFields: CardField[] = [
        { name: 'Front', value: 'Updated Question' },
        { name: 'Back', value: 'Updated Answer' },
      ];
      
      await useAppStore.getState().updateCardFields(cardId, newFields);

      const card = useAppStore.getState().getCard(cardId);
      expect(card?.fields[0].value).toBe('Updated Question');
      expect(card?.fields[1].value).toBe('Updated Answer');
      expect(card?.isEdited).toBe(true);
    });

    it('restores card fields to original', async () => {
      loadMockCollection([{ front: 'Original Q', back: 'Original A' }], 'Test.apkg');
      const cards = Array.from(useAppStore.getState().cards.values());
      const cardId = cards[0].cardId;

      // First update
      const newFields: CardField[] = [
        { name: 'Front', value: 'Updated' },
        { name: 'Back', value: 'Also Updated' },
      ];
      await useAppStore.getState().updateCardFields(cardId, newFields);
      
      // Then restore
      useAppStore.getState().restoreCardFields(cardId);

      const card = useAppStore.getState().getCard(cardId);
      expect(card?.isEdited).toBe(false);
    });
  });

  describe('Card Deletion', () => {
    it('soft-deletes original cards', () => {
      loadMockCollection([{ front: 'Q', back: 'A' }], 'Test.apkg');
      const cards = Array.from(useAppStore.getState().cards.values());
      const cardId = cards[0].cardId;

      useAppStore.getState().deleteCard(cardId);

      const card = useAppStore.getState().getCard(cardId);
      expect(card?.isDeleted).toBe(true);
      // Card should still exist (soft delete)
      expect(useAppStore.getState().cards.has(cardId)).toBe(true);
    });

    it('restores soft-deleted cards', () => {
      loadMockCollection([{ front: 'Q', back: 'A' }], 'Test.apkg');
      const cards = Array.from(useAppStore.getState().cards.values());
      const cardId = cards[0].cardId;

      useAppStore.getState().deleteCard(cardId);
      expect(useAppStore.getState().getCard(cardId)?.isDeleted).toBe(true);

      useAppStore.getState().restoreCard(cardId);
      expect(useAppStore.getState().getCard(cardId)?.isDeleted).toBe(false);
    });
  });

  describe('Adding Cards', () => {
    it('adds a new generated card to the deck', async () => {
      loadMockCollection([{ front: 'Q', back: 'A' }], 'Test.apkg');
      
      const deckId = getFirstDeckId();
      expect(deckId).not.toBeNull();

      const initialCardCount = useAppStore.getState().cards.size;
      
      const suggestedCard = createMockSuggestedCard('New Question', 'New Answer');
      const newCardId = await useAppStore.getState().addCard(suggestedCard, deckId!);

      expect(newCardId).not.toBeNull();
      expect(useAppStore.getState().cards.size).toBe(initialCardCount + 1);

      const newCard = useAppStore.getState().getCard(newCardId!);
      expect(newCard).not.toBeNull();
      expect(newCard?.origin).toBe('generated');
      expect(newCard?.fields[0].value).toBe('New Question');
      expect(newCard?.fields[1].value).toBe('New Answer');
    });
  });
});

// ============================================================================
// Integration Tests - Persistence Across Reload
// ============================================================================

describe('Persistence Integration Tests', () => {
  const testCards = [{ front: 'Original Q', back: 'Original A' }];
  const fileName = 'Persistence_Test.apkg';

  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      collection: null,
      fileName: null,
      cards: new Map(),
      persistedCardState: new Map(),
      addedSuggestedCards: new Map(),
      undoStack: [],
      redoStack: [],
      selectedDeckId: null,
      selectedCardId: null,
      isAnalyzing: false,
      analysisError: null,
      deckAnalysisCache: new Map(),
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('persists edited fields across reload', async () => {
    // Load deck
    loadMockCollection(testCards, fileName);
    const cardId = Array.from(useAppStore.getState().cards.values())[0].cardId;
    
    // Edit card fields
    const newFields: CardField[] = [
      { name: 'Front', value: 'Edited Question' },
      { name: 'Back', value: 'Edited Answer' },
    ];
    await useAppStore.getState().updateCardFields(cardId, newFields);
    
    // Persist state
    useAppStore.getState().persistDeckState();
    
    // Unload deck
    unloadDeck();
    expect(useAppStore.getState().cards.size).toBe(0);
    
    // Reload deck
    reloadDeck(testCards, fileName);
    
    // Verify edited fields are restored
    const reloadedCard = useAppStore.getState().getCard(cardId);
    expect(reloadedCard).not.toBeNull();
    expect(reloadedCard?.fields[0].value).toBe('Edited Question');
    expect(reloadedCard?.fields[1].value).toBe('Edited Answer');
    expect(reloadedCard?.isEdited).toBe(true);
  });

  it('persists deleted state across reload', () => {
    // Load deck
    loadMockCollection(testCards, fileName);
    const cardId = Array.from(useAppStore.getState().cards.values())[0].cardId;
    
    // Delete card
    useAppStore.getState().deleteCard(cardId);
    
    // Persist state
    useAppStore.getState().persistDeckState();
    
    // Unload and reload
    unloadDeck();
    reloadDeck(testCards, fileName);
    
    // Verify deleted state is restored
    const reloadedCard = useAppStore.getState().getCard(cardId);
    expect(reloadedCard?.isDeleted).toBe(true);
  });

  it('persists generated cards across reload', async () => {
    // Step 1: Load deck
    loadMockCollection(testCards, fileName);
    const deckId = getFirstDeckId();
    expect(deckId).not.toBeNull();
    
    const initialCardCount = useAppStore.getState().cards.size;
    expect(initialCardCount).toBe(1);
    
    // Step 2: Add a new generated card
    const suggestedCard = createMockSuggestedCard(
      'Generated Question',
      'Generated Answer'
    );
    const newCardId = await useAppStore.getState().addCard(suggestedCard, deckId!);
    expect(newCardId).not.toBeNull();
    
    // Verify card was added
    expect(useAppStore.getState().cards.size).toBe(2);
    const addedCard = useAppStore.getState().getCard(newCardId!);
    expect(addedCard?.origin).toBe('generated');
    
    // Step 3: Persist state
    useAppStore.getState().persistDeckState();
    
    // Step 4: Unload deck
    unloadDeck();
    expect(useAppStore.getState().cards.size).toBe(0);
    
    // Step 5: Reload deck
    reloadDeck(testCards, fileName);
    
    // Step 6: Verify generated card is still there
    expect(useAppStore.getState().cards.size).toBe(2);
    
    const reloadedCard = useAppStore.getState().getCard(newCardId!);
    expect(reloadedCard).not.toBeNull();
    expect(reloadedCard?.origin).toBe('generated');
    expect(reloadedCard?.fields[0].value).toBe('Generated Question');
    expect(reloadedCard?.fields[1].value).toBe('Generated Answer');
    expect(reloadedCard?.deckId).toBe(deckId);
  });

  it('persists edited generated cards across reload', async () => {
    // Load deck
    loadMockCollection(testCards, fileName);
    const deckId = getFirstDeckId()!;
    
    // Add a generated card
    const suggestedCard = createMockSuggestedCard('Original Q', 'Original A');
    const newCardId = await useAppStore.getState().addCard(suggestedCard, deckId);
    
    // Edit the generated card
    const editedFields: CardField[] = [
      { name: 'Front', value: 'Edited Generated Q' },
      { name: 'Back', value: 'Edited Generated A' },
    ];
    await useAppStore.getState().updateCardFields(newCardId!, editedFields);
    
    // Verify edit took effect
    const editedCard = useAppStore.getState().getCard(newCardId!);
    expect(editedCard?.isEdited).toBe(true);
    expect(editedCard?.fields[0].value).toBe('Edited Generated Q');
    
    // Persist, unload, reload
    useAppStore.getState().persistDeckState();
    unloadDeck();
    reloadDeck(testCards, fileName);
    
    // Verify edits persisted
    const reloadedCard = useAppStore.getState().getCard(newCardId!);
    expect(reloadedCard?.origin).toBe('generated');
    expect(reloadedCard?.isEdited).toBe(true);
    expect(reloadedCard?.fields[0].value).toBe('Edited Generated Q');
    expect(reloadedCard?.fields[1].value).toBe('Edited Generated A');
  });

  it('persists multiple modifications together', async () => {
    const multiCards = [
      { front: 'Q1', back: 'A1' },
      { front: 'Q2', back: 'A2' },
      { front: 'Q3', back: 'A3' },
    ];
    const testSeedValue = 2000000; // Use a consistent seed for this test
    
    // Load deck with consistent seed
    loadMockCollection(multiCards, fileName, testSeedValue);
    const cards = Array.from(useAppStore.getState().cards.values());
    const deckId = getFirstDeckId()!;
    
    // Capture card IDs for later verification
    const card1Id = cards[0].cardId;
    const card2Id = cards[1].cardId;
    const card3Id = cards[2].cardId;
    
    // Edit first card
    await useAppStore.getState().updateCardFields(card1Id, [
      { name: 'Front', value: 'Edited Q1' },
      { name: 'Back', value: 'Edited A1' },
    ]);
    
    // Delete second card
    useAppStore.getState().deleteCard(card2Id);
    
    // Add a new generated card
    const suggestedCard = createMockSuggestedCard('New Q', 'New A');
    const newCardId = await useAppStore.getState().addCard(suggestedCard, deckId);
    
    // Persist, unload, reload with same seed so IDs match
    useAppStore.getState().persistDeckState();
    unloadDeck();
    reloadDeck(multiCards, fileName, testSeedValue);
    
    // Verify all changes persisted
    expect(useAppStore.getState().cards.size).toBe(4); // 3 original + 1 generated
    
    // First card edited
    const card1 = useAppStore.getState().getCard(card1Id);
    expect(card1?.fields[0].value).toBe('Edited Q1');
    expect(card1?.isEdited).toBe(true);
    
    // Second card deleted
    const card2 = useAppStore.getState().getCard(card2Id);
    expect(card2?.isDeleted).toBe(true);
    
    // Third card unchanged
    const card3 = useAppStore.getState().getCard(card3Id);
    expect(card3?.isEdited).toBe(false);
    expect(card3?.isDeleted).toBe(false);
    
    // Generated card present
    const genCard = useAppStore.getState().getCard(newCardId!);
    expect(genCard?.origin).toBe('generated');
    expect(genCard?.fields[0].value).toBe('New Q');
  });

  it('handles originalFields persistence for generated cards', async () => {
    // Load deck
    loadMockCollection(testCards, fileName);
    const deckId = getFirstDeckId()!;
    
    // Add generated card
    const suggestedCard = createMockSuggestedCard('Initial Q', 'Initial A');
    const newCardId = await useAppStore.getState().addCard(suggestedCard, deckId);
    
    // Check originalFields are set
    const cardBeforeEdit = useAppStore.getState().getCard(newCardId!);
    expect(cardBeforeEdit?.originalFields[0].value).toBe('Initial Q');
    
    // Edit the card
    await useAppStore.getState().updateCardFields(newCardId!, [
      { name: 'Front', value: 'Modified Q' },
      { name: 'Back', value: 'Modified A' },
    ]);
    
    // Persist, unload, reload
    useAppStore.getState().persistDeckState();
    unloadDeck();
    reloadDeck(testCards, fileName);
    
    // Verify originalFields persisted correctly
    const reloadedCard = useAppStore.getState().getCard(newCardId!);
    expect(reloadedCard?.fields[0].value).toBe('Modified Q');
    expect(reloadedCard?.originalFields[0].value).toBe('Initial Q');
    expect(reloadedCard?.isEdited).toBe(true);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      collection: null,
      fileName: null,
      cards: new Map(),
      persistedCardState: new Map(),
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('handles loading deck with corrupted localStorage gracefully', () => {
    // Set corrupted data
    localStorage.setItem('llmanki-deck-state-Corrupt_Test.apkg', 'not valid json');
    
    // Should not throw
    loadMockCollection([{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2' }], 'Corrupt_Test.apkg');
    
    // Should still load cards normally
    expect(useAppStore.getState().cards.size).toBe(2);
  });

  it('handles cards from localStorage for non-existent cards', () => {
    // Pre-populate localStorage with a card that won't exist in the new deck
    const stateKey = 'llmanki-deck-state-Orphan_Test.apkg';
    localStorage.setItem(stateKey, JSON.stringify({
      fileName: 'Orphan_Test.apkg',
      cards: [{
        cardId: 999999,
        noteId: 999999,
        origin: 'original',
        currentFields: [{ name: 'Front', value: 'Orphan' }],
        isDeleted: false,
        analysis: null,
      }],
      lastUpdated: Date.now(),
    }));
    
    loadMockCollection([{ front: 'Q', back: 'A' }], 'Orphan_Test.apkg');
    
    // Should only have the 1 card from the actual deck, not the orphan
    // (orphan original cards should be ignored since they don't exist in collection)
    expect(useAppStore.getState().cards.size).toBe(1);
    expect(useAppStore.getState().cards.has(999999)).toBe(false);
  });

  it('restores orphaned generated cards from localStorage', () => {
    const fileName = 'Gen_Orphan_Test.apkg';
    
    // Pre-populate localStorage with a generated card
    const stateKey = `llmanki-deck-state-${fileName}`;
    localStorage.setItem(stateKey, JSON.stringify({
      fileName: fileName,
      cards: [{
        cardId: 888888,
        noteId: 888889,
        origin: 'generated',
        currentFields: [
          { name: 'Front', value: 'Saved Generated Q' },
          { name: 'Back', value: 'Saved Generated A' },
        ],
        originalFields: [
          { name: 'Front', value: 'Saved Generated Q' },
          { name: 'Back', value: 'Saved Generated A' },
        ],
        isDeleted: false,
        analysis: null,
        deckId: 12345,
        type: 'basic',
      }],
      lastUpdated: Date.now(),
    }));
    
    loadMockCollection([{ front: 'Q', back: 'A' }], fileName);
    
    // Should have both the original card AND the restored generated card
    expect(useAppStore.getState().cards.size).toBe(2);
    expect(useAppStore.getState().cards.has(888888)).toBe(true);
    
    const restoredCard = useAppStore.getState().getCard(888888);
    expect(restoredCard?.origin).toBe('generated');
    expect(restoredCard?.fields[0].value).toBe('Saved Generated Q');
  });
});
// ============================================================================
// Deck Persistence Tests
// ============================================================================

describe('Deck Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      collection: null,
      fileName: null,
      cards: new Map(),
      persistedCardState: new Map(),
      addedSuggestedCards: new Map(),
      generatedDeckIds: new Set(),
      selectedDeckId: null,
      selectedCardId: null,
      suggestedCards: [],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('persists generated deck across unload/reload', () => {
    // Step 1: Create a new deck (which creates an empty collection)
    const deckId = useAppStore.getState().createDeck('Persisted Deck', 'A deck that should persist');
    expect(deckId).not.toBeNull();
    
    const fileName = useAppStore.getState().fileName;
    expect(fileName).toBe('New Collection');
    
    // Step 2: Verify deck is in collection
    let state = useAppStore.getState();
    expect(state.collection!.decks.has(deckId!)).toBe(true);
    expect(state.generatedDeckIds.has(deckId!)).toBe(true);
    
    // Step 3: Persist and unload
    useAppStore.getState().persistDeckState();
    useAppStore.getState().setCollection(null, null);
    
    // Step 4: Verify unloaded
    expect(useAppStore.getState().collection).toBeNull();
    
    // Step 5: Recreate an empty collection and reload
    // (simulating reopening the same "New Collection")
    const newCollection = Deck.createEmptyCollection();
    useAppStore.getState().setCollection(newCollection, fileName!);
    
    // Step 6: Verify generated deck was restored
    state = useAppStore.getState();
    expect(state.collection!.decks.has(deckId!)).toBe(true);
    expect(state.generatedDeckIds.has(deckId!)).toBe(true);
    
    const restoredDeck = state.collection!.decks.get(deckId!);
    expect(restoredDeck!.name).toBe('Persisted Deck');
  });

  it('persists generated deck with cards across unload/reload', async () => {
    // Step 1: Create deck
    const deckId = useAppStore.getState().createDeck('Deck With Cards');
    expect(deckId).not.toBeNull();
    
    const fileName = useAppStore.getState().fileName!;
    
    // Step 2: Add a card to the deck
    const suggestedCard = createMockSuggestedCard('Deck Card Q', 'Deck Card A');
    const cardId = await useAppStore.getState().addCard(suggestedCard, deckId!);
    expect(cardId).not.toBeNull();
    
    // Step 3: Verify card is in deck
    let card = useAppStore.getState().getCard(cardId!);
    expect(card?.deckId).toBe(deckId);
    expect(card?.fields[0].value).toBe('Deck Card Q');
    
    // Step 4: Persist and unload
    useAppStore.getState().persistDeckState();
    useAppStore.getState().setCollection(null, null);
    
    // Step 5: Reload
    const newCollection = Deck.createEmptyCollection();
    useAppStore.getState().setCollection(newCollection, fileName);
    
    // Step 6: Verify deck and card restored
    const state = useAppStore.getState();
    expect(state.collection!.decks.has(deckId!)).toBe(true);
    expect(state.cards.has(cardId!)).toBe(true);
    
    card = state.getCard(cardId!);
    expect(card?.deckId).toBe(deckId);
    expect(card?.fields[0].value).toBe('Deck Card Q');
    expect(card?.origin).toBe('generated');
  });

  it('persists edited card in generated deck across unload/reload', async () => {
    // Step 1: Create deck and add card
    const deckId = useAppStore.getState().createDeck('Edit Test Deck');
    const suggestedCard = createMockSuggestedCard('Original Q', 'Original A');
    const cardId = await useAppStore.getState().addCard(suggestedCard, deckId!);
    
    const fileName = useAppStore.getState().fileName!;
    
    // Step 2: Edit the card
    const editedFields: CardField[] = [
      { name: 'Front', value: 'Edited Q' },
      { name: 'Back', value: 'Edited A' },
    ];
    await useAppStore.getState().updateCardFields(cardId!, editedFields);
    
    // Verify edit
    let card = useAppStore.getState().getCard(cardId!);
    expect(card?.isEdited).toBe(true);
    expect(card?.fields[0].value).toBe('Edited Q');
    
    // Step 3: Persist and unload
    useAppStore.getState().persistDeckState();
    useAppStore.getState().setCollection(null, null);
    
    // Step 4: Reload
    const newCollection = Deck.createEmptyCollection();
    useAppStore.getState().setCollection(newCollection, fileName);
    
    // Step 5: Verify edit state persisted
    card = useAppStore.getState().getCard(cardId!);
    expect(card?.isEdited).toBe(true);
    expect(card?.fields[0].value).toBe('Edited Q');
    expect(card?.originalFields[0].value).toBe('Original Q');
  });

  it('persists card analysis across unload/reload', async () => {
    // Step 1: Create deck and add card
    const deckId = useAppStore.getState().createDeck('Analysis Test Deck');
    const suggestedCard = createMockSuggestedCard('Analysis Q', 'Analysis A');
    const cardId = await useAppStore.getState().addCard(suggestedCard, deckId!);
    
    const fileName = useAppStore.getState().fileName!;
    
    // Step 2: Set mock analysis result on the card
    const mockAnalysis: LLMAnalysisResult = {
      feedback: {
        isUnambiguous: true,
        isAtomic: true,
        isRecognizable: true,
        isActiveRecall: true,
        overallScore: 85,
        issues: [],
        suggestions: ['Consider adding context'],
        reasoning: 'Good card overall',
      },
      suggestedCards: [
        {
          type: 'basic',
          fields: [
            { name: 'Front', value: 'Suggested Q' },
            { name: 'Back', value: 'Suggested A' },
          ],
          explanation: 'A suggested card from analysis',
        },
      ],
      deleteOriginal: false,
    };
    useAppStore.getState().setCardAnalysis(cardId!, mockAnalysis);
    
    // Verify analysis is set
    let card = useAppStore.getState().getCard(cardId!);
    expect(card?.analysis).not.toBeNull();
    expect(card?.analysis?.feedback.overallScore).toBe(85);
    
    // Step 3: Persist and unload
    useAppStore.getState().persistDeckState();
    useAppStore.getState().setCollection(null, null);
    
    // Step 4: Reload
    const newCollection = Deck.createEmptyCollection();
    useAppStore.getState().setCollection(newCollection, fileName);
    
    // Step 5: Verify analysis persisted
    card = useAppStore.getState().getCard(cardId!);
    expect(card?.analysis).not.toBeNull();
    expect(card?.analysis?.feedback.overallScore).toBe(85);
    expect(card?.analysis?.feedback.reasoning).toBe('Good card overall');
    expect(card?.analysis?.suggestedCards?.length).toBe(1);
  });

  it('persists added suggested card from analysis across unload/reload', async () => {
    // Step 1: Create deck and add a card
    const deckId = useAppStore.getState().createDeck('Suggested Card Test');
    const originalCard = createMockSuggestedCard('Original Card Q', 'Original Card A');
    const originalCardId = await useAppStore.getState().addCard(originalCard, deckId!);
    
    const fileName = useAppStore.getState().fileName!;
    
    // Step 2: Set analysis with a suggested card
    const mockAnalysis: LLMAnalysisResult = {
      feedback: {
        isUnambiguous: true,
        isAtomic: true,
        isRecognizable: true,
        isActiveRecall: true,
        overallScore: 80,
        issues: [],
        suggestions: ['Consider adding related cards'],
        reasoning: 'Good card but could have related content',
      },
      suggestedCards: [
        {
          type: 'basic',
          fields: [
            { name: 'Front', value: 'LLM Suggested Q' },
            { name: 'Back', value: 'LLM Suggested A' },
          ],
          explanation: 'This card complements the original',
        },
      ],
      deleteOriginal: false,
    };
    useAppStore.getState().setCardAnalysis(originalCardId!, mockAnalysis);
    
    // Step 3: Add the suggested card to the deck
    const suggestedCardFromAnalysis = mockAnalysis.suggestedCards![0];
    const suggestedCardId = await useAppStore.getState().addCard(suggestedCardFromAnalysis, deckId!);
    expect(suggestedCardId).not.toBeNull();
    
    // Verify we now have 2 cards
    expect(useAppStore.getState().cards.size).toBe(2);
    
    // Step 4: Persist and unload
    useAppStore.getState().persistDeckState();
    useAppStore.getState().setCollection(null, null);
    
    // Step 5: Reload
    const newCollection = Deck.createEmptyCollection();
    useAppStore.getState().setCollection(newCollection, fileName);
    
    // Step 6: Verify both cards persisted
    const state = useAppStore.getState();
    expect(state.cards.size).toBe(2);
    
    const reloadedSuggestedCard = state.getCard(suggestedCardId!);
    expect(reloadedSuggestedCard).not.toBeNull();
    expect(reloadedSuggestedCard?.origin).toBe('generated');
    expect(reloadedSuggestedCard?.fields[0].value).toBe('LLM Suggested Q');
    expect(reloadedSuggestedCard?.fields[1].value).toBe('LLM Suggested A');
    expect(reloadedSuggestedCard?.deckId).toBe(deckId);
  });

  it('persists subdeck hierarchy across unload/reload', () => {
    // Step 1: Create parent deck
    const parentDeckId = useAppStore.getState().createDeck('Parent Deck');
    expect(parentDeckId).not.toBeNull();
    
    const fileName = useAppStore.getState().fileName!;
    
    // Step 2: Create subdeck
    const subdeckId = useAppStore.getState().createSubdeck(parentDeckId!, 'Child Deck');
    expect(subdeckId).not.toBeNull();
    
    // Verify hierarchy
    let state = useAppStore.getState();
    let subdeck = state.collection!.decks.get(subdeckId!);
    expect(subdeck!.parentId).toBe(parentDeckId);
    expect(subdeck!.name).toContain('Child Deck');
    
    // Step 3: Persist and unload
    useAppStore.getState().persistDeckState();
    useAppStore.getState().setCollection(null, null);
    
    // Step 4: Reload
    const newCollection = Deck.createEmptyCollection();
    useAppStore.getState().setCollection(newCollection, fileName);
    
    // Step 5: Verify hierarchy restored
    state = useAppStore.getState();
    expect(state.collection!.decks.has(parentDeckId!)).toBe(true);
    expect(state.collection!.decks.has(subdeckId!)).toBe(true);
    
    subdeck = state.collection!.decks.get(subdeckId!);
    expect(subdeck!.parentId).toBe(parentDeckId);
  });

  it('persists remaining cards after hard-deleting generated card', async () => {
    // Generated cards are HARD deleted (completely removed), not soft deleted
    // This test verifies the remaining card persists correctly after deletion
    
    // Step 1: Create deck with cards
    const deckId = useAppStore.getState().createDeck('Delete Test Deck');
    const card1 = createMockSuggestedCard('Card 1 Q', 'Card 1 A');
    const card2 = createMockSuggestedCard('Card 2 Q', 'Card 2 A');
    
    const cardId1 = await useAppStore.getState().addCard(card1, deckId!);
    const cardId2 = await useAppStore.getState().addCard(card2, deckId!);
    
    const fileName = useAppStore.getState().fileName!;
    
    // Verify both cards exist
    expect(useAppStore.getState().cards.size).toBe(2);
    
    // Step 2: Delete one card (generated cards are hard-deleted)
    useAppStore.getState().deleteCard(cardId1!);
    
    // Verify hard deletion - card should be completely gone
    expect(useAppStore.getState().cards.has(cardId1!)).toBe(false);
    expect(useAppStore.getState().cards.size).toBe(1);
    
    // Step 3: Persist and unload
    useAppStore.getState().persistDeckState();
    useAppStore.getState().setCollection(null, null);
    
    // Step 4: Reload
    const newCollection = Deck.createEmptyCollection();
    useAppStore.getState().setCollection(newCollection, fileName);
    
    // Step 5: Verify only the non-deleted card exists
    expect(useAppStore.getState().cards.size).toBe(1);
    expect(useAppStore.getState().cards.has(cardId1!)).toBe(false);
    expect(useAppStore.getState().cards.has(cardId2!)).toBe(true);
    
    const remainingCard = useAppStore.getState().getCard(cardId2!);
    expect(remainingCard?.fields[0].value).toBe('Card 2 Q');
  });

  it('persists cards added to existing loaded deck across unload/reload', async () => {
    // This tests adding cards to a deck loaded from an .apkg file
    const originalCards = [
      { front: 'Original Q1', back: 'Original A1' },
      { front: 'Original Q2', back: 'Original A2' },
    ];
    const fileName = 'ExistingDeck.apkg';
    
    // Step 1: Load an existing deck
    loadMockCollection(originalCards, fileName);
    
    const deckId = getFirstDeckId();
    expect(deckId).not.toBeNull();
    
    // Verify we have 2 cards
    expect(useAppStore.getState().cards.size).toBe(2);
    
    // Step 2: Add a new generated card
    const newCard = createMockSuggestedCard('New Generated Q', 'New Generated A');
    const newCardId = await useAppStore.getState().addCard(newCard, deckId!);
    
    // Verify we now have 3 cards
    expect(useAppStore.getState().cards.size).toBe(3);
    
    // Step 3: Persist and unload
    useAppStore.getState().persistDeckState();
    unloadDeck();
    
    // Step 4: Reload
    reloadDeck(originalCards, fileName);
    
    // Step 5: Verify all 3 cards restored
    expect(useAppStore.getState().cards.size).toBe(3);
    
    const reloadedNewCard = useAppStore.getState().getCard(newCardId!);
    expect(reloadedNewCard).not.toBeNull();
    expect(reloadedNewCard?.origin).toBe('generated');
    expect(reloadedNewCard?.fields[0].value).toBe('New Generated Q');
  });

  it('auto-persists cards when unloading deck via setCollection(null)', async () => {
    // This tests the actual user flow:
    // 1. Load apkg file
    // 2. Add card
    // 3. Click 'x' to unload (which calls setCollection(null, null) without explicit persist)
    // 4. Reload same file
    // 5. Card should still be there
    const originalCards = [
      { front: 'Original Q1', back: 'Original A1' },
    ];
    const fileName = 'AutoPersistTest.apkg';
    
    // Step 1: Load an existing deck
    loadMockCollection(originalCards, fileName);
    
    const deckId = getFirstDeckId();
    expect(deckId).not.toBeNull();
    expect(useAppStore.getState().cards.size).toBe(1);
    
    // Step 2: Add a new generated card
    const newCard = createMockSuggestedCard('Auto Persist Card Q', 'Auto Persist Card A');
    const newCardId = await useAppStore.getState().addCard(newCard, deckId!);
    expect(useAppStore.getState().cards.size).toBe(2);
    
    // Step 3: Unload WITHOUT explicit persistDeckState() - simulating clicking 'x'
    // This is what the UI does when user clicks the close button
    unloadDeck();
    
    // Step 4: Reload the same file
    reloadDeck(originalCards, fileName);
    
    // Step 5: Verify the added card is still there
    expect(useAppStore.getState().cards.size).toBe(2);
    
    const reloadedCard = useAppStore.getState().getCard(newCardId!);
    expect(reloadedCard).not.toBeNull();
    expect(reloadedCard?.origin).toBe('generated');
    expect(reloadedCard?.fields[0].value).toBe('Auto Persist Card Q');
  });

  it('restores generated cards to collection.cards after reload', async () => {
    // This tests that generated cards are visible in the card list after reload.
    // The card list uses getCardsInDeck() which reads from collection.cards,
    // so generated cards must be restored to both state.cards AND collection.cards.
    const originalCards = [
      { front: 'Original Q', back: 'Original A' },
    ];
    const fileName = 'CollectionCardsTest.apkg';
    
    // Step 1: Load an existing deck
    loadMockCollection(originalCards, fileName);
    
    const deckId = getFirstDeckId();
    expect(deckId).not.toBeNull();
    
    // Verify original card is in collection.cards
    const collectionBefore = useAppStore.getState().collection!;
    expect(collectionBefore.cards.size).toBe(1);
    
    // Step 2: Add a new generated card
    const newCard = createMockSuggestedCard('Generated Q', 'Generated A');
    const newCardId = await useAppStore.getState().addCard(newCard, deckId!);
    
    // Verify generated card is in both state.cards and collection.cards
    expect(useAppStore.getState().cards.size).toBe(2);
    expect(useAppStore.getState().collection!.cards.size).toBe(2);
    expect(useAppStore.getState().collection!.cards.has(newCardId!)).toBe(true);
    
    // Step 3: Persist and unload
    useAppStore.getState().persistDeckState();
    unloadDeck();
    
    // Step 4: Reload
    reloadDeck(originalCards, fileName);
    
    // Step 5: Verify generated card is restored to BOTH state.cards AND collection.cards
    // This is the bug: generated cards were only restored to state.cards, 
    // not collection.cards, so getCardsInDeck() wouldn't return them
    expect(useAppStore.getState().cards.size).toBe(2);
    expect(useAppStore.getState().collection!.cards.size).toBe(2);
    expect(useAppStore.getState().collection!.cards.has(newCardId!)).toBe(true);
    
    // Also verify the note is restored
    const reloadedCard = useAppStore.getState().getCard(newCardId!);
    expect(reloadedCard).not.toBeNull();
    expect(useAppStore.getState().collection!.notes.has(reloadedCard!.noteId)).toBe(true);
  });
});

// ============================================================================
// AddCardPanel State Tests
// ============================================================================
describe('AddCardPanel State', () => {
  beforeEach(() => {
    // Reset store state before each test
    localStorage.clear();
    useAppStore.setState({
      collection: null,
      fileName: null,
      isLoadingCollection: false,
      loadingProgress: null,
      cards: new Map(),
      persistedCardState: new Map(),
      addedSuggestedCards: new Map(),
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
    });
    resetIdCounter(testSeed);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('getAddCardPanelState returns referentially stable default state', () => {
    // This test verifies that calling getAddCardPanelState multiple times
    // for a deck that has no stored state returns the same object reference.
    // If this fails, React components using this in a selector will get 
    // infinite re-render loops (Maximum update depth exceeded).
    
    const deckId = 12345;
    
    // Call getAddCardPanelState multiple times
    const state1 = useAppStore.getState().getAddCardPanelState(deckId);
    const state2 = useAppStore.getState().getAddCardPanelState(deckId);
    const state3 = useAppStore.getState().getAddCardPanelState(deckId);
    
    // They should be the same object reference (not just equal values)
    expect(state1).toBe(state2);
    expect(state2).toBe(state3);
  });

  it('AddCardPanel selector pattern returns referentially stable state', () => {
    // This tests the actual selector pattern used in AddCardPanel.tsx after the fix
    // The component uses: state.addCardPanelState.get(deckId) ?? getAddCardPanelState(deckId)
    // The getAddCardPanelState initializes the state if not present, so subsequent gets return same reference
    
    const deckId = 12345;
    
    // Simulate the fixed component's pattern:
    // First call to getAddCardPanelState initializes the state
    const getAddCardPanelState = useAppStore.getState().getAddCardPanelState;
    
    // This selector mirrors the fixed component code
    const selectPanelState = (state: ReturnType<typeof useAppStore.getState>) => {
      return state.addCardPanelState.get(deckId) ?? getAddCardPanelState(deckId);
    };
    
    // Get state multiple times through the selector
    const result1 = selectPanelState(useAppStore.getState());
    const result2 = selectPanelState(useAppStore.getState());
    const result3 = selectPanelState(useAppStore.getState());
    
    // After fix: these are the same reference because getAddCardPanelState
    // initializes the state in the Map on first access
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });
});