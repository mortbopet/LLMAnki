/**
 * Deck Operations Tests
 * 
 * Tests the complete flow of:
 * 1. Creating top-level decks
 * 2. Creating subdecks under existing decks
 * 3. Subdeck creation under decks with no children (leaf decks)
 * 4. Deck tree structure integrity
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../store/useAppStore';
import { Deck, resetIdCounter, getDeckByName } from '../domain';
import type { AnkiCollection, AnkiDeck } from '../types';

// ============================================================================
// Test Helpers
// ============================================================================

const testSeed = 2000000;

/**
 * Create a mock AnkiCollection with a deck tree structure for testing
 */
function createMockCollectionWithDecks(): AnkiCollection {
  resetIdCounter(testSeed);
  
  // Create empty collection
  const collection = Deck.createEmptyCollection();
  
  // Create top-level decks
  const parentDeck = Deck.create('Parent Deck', collection, {
    description: 'A parent deck with children',
  });
  
  const leafDeck = Deck.create('Leaf Deck', collection, {
    description: 'A deck with no children (leaf node)',
  });
  
  // Create a subdeck under Parent Deck
  Deck.create('Child Deck', collection, {
    description: 'A child deck',
    parentId: parentDeck.id,
  });
  
  // Add a card to Leaf Deck to make it a proper leaf deck with content
  const modelId = [...collection.models.keys()].find(id => id !== 0) || 1;
  const noteId = testSeed + 100;
  const cardId = testSeed + 1000;
  
  collection.notes.set(noteId, {
    id: noteId,
    modelId,
    fields: ['Test Front', 'Test Back'],
    tags: ['test'],
    guid: `test-${noteId}`,
    mod: Math.floor(testSeed / 1000),
  });
  
  collection.cards.set(cardId, {
    id: cardId,
    noteId,
    deckId: leafDeck.id,
    ordinal: 0,
    type: 'basic',
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
  });
  
  return collection;
}

/**
 * Find a deck by name in the collection (returns raw AnkiDeck)
 * Uses the domain's getDeckByName but returns the underlying AnkiDeck
 */
function findDeckByName(collection: AnkiCollection, name: string): AnkiDeck | null {
  const deck = getDeckByName(collection, name);
  return deck ? collection.decks.get(deck.id) ?? null : null;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Deck Operations', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.setState({
      collection: null,
      selectedDeckId: null,
      cards: new Map(),
      generatedDeckIds: new Set(),
    });
    resetIdCounter(testSeed);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Top-level deck creation', () => {
    it('creates a top-level deck successfully', () => {
      const { createEmptyCollection, createDeck } = useAppStore.getState();
      
      // Start with empty collection
      createEmptyCollection();
      
      // Create a new top-level deck
      const deckId = createDeck('New Top Level Deck');
      
      expect(deckId).not.toBeNull();
      
      const collection = useAppStore.getState().collection!;
      expect(collection.decks.has(deckId!)).toBe(true);
      
      // Check it's in the deck tree at top level
      const isInTree = collection.deckTree.some(d => d.id === deckId);
      expect(isInTree).toBe(true);
    });

    it('adds created deck to generatedDeckIds', () => {
      const { createEmptyCollection, createDeck } = useAppStore.getState();
      
      createEmptyCollection();
      const deckId = createDeck('Generated Deck');
      
      const generatedDeckIds = useAppStore.getState().generatedDeckIds;
      expect(generatedDeckIds.has(deckId!)).toBe(true);
    });
  });

  describe('Subdeck creation', () => {
    it('creates a subdeck under a deck that already has children', () => {
      const { setCollection, createSubdeck } = useAppStore.getState();
      
      // Load collection with deck tree
      const collection = createMockCollectionWithDecks();
      setCollection(collection, 'test.apkg');
      
      // Find the Parent Deck (which already has Child Deck as a child)
      const parentDeck = findDeckByName(collection, 'Parent Deck');
      expect(parentDeck).not.toBeNull();
      expect(parentDeck!.children.length).toBe(1); // Has Child Deck
      
      // Create a new subdeck under Parent Deck
      const newSubdeckId = createSubdeck(parentDeck!.id, 'New Subdeck');
      
      expect(newSubdeckId).not.toBeNull();
      
      // Verify subdeck was added to collection
      const updatedCollection = useAppStore.getState().collection!;
      expect(updatedCollection.decks.has(newSubdeckId!)).toBe(true);
      
      // Verify subdeck is in parent's children array
      const updatedParent = updatedCollection.decks.get(parentDeck!.id);
      expect(updatedParent!.children.length).toBe(2);
      expect(updatedParent!.children.some(c => c.id === newSubdeckId)).toBe(true);
    });

    it('creates a subdeck under a leaf deck (deck with no children)', () => {
      const { setCollection, createSubdeck } = useAppStore.getState();
      
      // Load collection with deck tree
      const collection = createMockCollectionWithDecks();
      setCollection(collection, 'test.apkg');
      
      // Find the Leaf Deck (which has no children)
      const leafDeck = findDeckByName(collection, 'Leaf Deck');
      expect(leafDeck).not.toBeNull();
      expect(leafDeck!.children.length).toBe(0); // No children
      
      // Create a new subdeck under Leaf Deck
      const newSubdeckId = createSubdeck(leafDeck!.id, 'Child of Leaf');
      
      expect(newSubdeckId).not.toBeNull();
      
      // Verify subdeck was added to collection
      const updatedCollection = useAppStore.getState().collection!;
      expect(updatedCollection.decks.has(newSubdeckId!)).toBe(true);
      
      // Verify subdeck is in parent's children array
      const updatedLeaf = updatedCollection.decks.get(leafDeck!.id);
      expect(updatedLeaf!.children.length).toBe(1);
      expect(updatedLeaf!.children[0].id).toBe(newSubdeckId);
    });

    it('sets correct full name for subdeck with parent path', () => {
      const { setCollection, createSubdeck } = useAppStore.getState();
      
      const collection = createMockCollectionWithDecks();
      setCollection(collection, 'test.apkg');
      
      const parentDeck = findDeckByName(collection, 'Parent Deck');
      const newSubdeckId = createSubdeck(parentDeck!.id, 'Deeply Nested');
      
      const updatedCollection = useAppStore.getState().collection!;
      const newSubdeck = updatedCollection.decks.get(newSubdeckId!);
      
      expect(newSubdeck!.name).toBe('Parent Deck::Deeply Nested');
    });

    it('subdeck appears in deck tree under correct parent', () => {
      const { setCollection, createSubdeck } = useAppStore.getState();
      
      const collection = createMockCollectionWithDecks();
      setCollection(collection, 'test.apkg');
      
      const parentDeck = findDeckByName(collection, 'Parent Deck');
      const newSubdeckId = createSubdeck(parentDeck!.id, 'Tree Test Subdeck');
      
      const updatedCollection = useAppStore.getState().collection!;
      
      // Find parent in deckTree and check if subdeck is in children
      const parentInTree = updatedCollection.deckTree.find(d => d.id === parentDeck!.id);
      expect(parentInTree).toBeDefined();
      expect(parentInTree!.children.some(c => c.id === newSubdeckId)).toBe(true);
      
      // Ensure subdeck is NOT at top level
      expect(updatedCollection.deckTree.some(d => d.id === newSubdeckId)).toBe(false);
    });

    it('adds created subdeck to generatedDeckIds', () => {
      const { setCollection, createSubdeck } = useAppStore.getState();
      
      const collection = createMockCollectionWithDecks();
      setCollection(collection, 'test.apkg');
      
      const parentDeck = findDeckByName(collection, 'Parent Deck');
      const newSubdeckId = createSubdeck(parentDeck!.id, 'Generated Subdeck');
      
      const generatedDeckIds = useAppStore.getState().generatedDeckIds;
      expect(generatedDeckIds.has(newSubdeckId!)).toBe(true);
    });
  });

  describe('Deck creation with non-existent parent', () => {
    it('returns null when creating subdeck with invalid parent ID', () => {
      const { createEmptyCollection, createSubdeck } = useAppStore.getState();
      
      createEmptyCollection();
      
      // Try to create subdeck with non-existent parent
      const result = createSubdeck(99999, 'Orphan Deck');
      
      expect(result).toBeNull();
    });
  });

  describe('Multiple subdeck creation', () => {
    it('can create multiple subdecks under the same parent', () => {
      const { setCollection, createSubdeck } = useAppStore.getState();
      
      const collection = createMockCollectionWithDecks();
      setCollection(collection, 'test.apkg');
      
      const parentDeck = findDeckByName(collection, 'Parent Deck');
      const initialChildCount = parentDeck!.children.length;
      
      // Create multiple subdecks
      const subdeck1 = createSubdeck(parentDeck!.id, 'Subdeck 1');
      const subdeck2 = createSubdeck(parentDeck!.id, 'Subdeck 2');
      const subdeck3 = createSubdeck(parentDeck!.id, 'Subdeck 3');
      
      expect(subdeck1).not.toBeNull();
      expect(subdeck2).not.toBeNull();
      expect(subdeck3).not.toBeNull();
      
      // All subdecks should have unique IDs
      expect(subdeck1).not.toBe(subdeck2);
      expect(subdeck2).not.toBe(subdeck3);
      
      // Parent should have all new children
      const updatedCollection = useAppStore.getState().collection!;
      const updatedParent = updatedCollection.decks.get(parentDeck!.id);
      expect(updatedParent!.children.length).toBe(initialChildCount + 3);
    });

    it('can create nested subdecks (grandchild decks)', () => {
      const { setCollection, createSubdeck } = useAppStore.getState();
      
      const collection = createMockCollectionWithDecks();
      setCollection(collection, 'test.apkg');
      
      const parentDeck = findDeckByName(collection, 'Parent Deck');
      
      // Create a child
      const childId = createSubdeck(parentDeck!.id, 'Level 1');
      expect(childId).not.toBeNull();
      
      // Create a grandchild
      const grandchildId = createSubdeck(childId!, 'Level 2');
      expect(grandchildId).not.toBeNull();
      
      // Verify the nesting
      const updatedCollection = useAppStore.getState().collection!;
      const grandchild = updatedCollection.decks.get(grandchildId!);
      expect(grandchild!.name).toBe('Parent Deck::Level 1::Level 2');
      
      // Verify tree structure
      const child = updatedCollection.decks.get(childId!);
      expect(child!.children.some(c => c.id === grandchildId)).toBe(true);
    });
  });

  describe('Deck persistence', () => {
    it('persists created decks across state updates', () => {
      const { createEmptyCollection, createDeck, createSubdeck, persistDeckState } = useAppStore.getState();
      
      createEmptyCollection();
      
      const topDeckId = createDeck('Persistent Deck');
      const subDeckId = createSubdeck(topDeckId!, 'Persistent Subdeck');
      
      // Verify both exist
      let collection = useAppStore.getState().collection!;
      expect(collection.decks.has(topDeckId!)).toBe(true);
      expect(collection.decks.has(subDeckId!)).toBe(true);
      
      // Trigger persistence
      persistDeckState();
      
      // Decks should still exist
      collection = useAppStore.getState().collection!;
      expect(collection.decks.has(topDeckId!)).toBe(true);
      expect(collection.decks.has(subDeckId!)).toBe(true);
    });

    it('persists top-level generated decks across unload/reload cycle', () => {
      const { setCollection, createDeck } = useAppStore.getState();
      
      // Load a collection
      const collection = createMockCollectionWithDecks();
      setCollection(collection, 'persistence-test.apkg');
      
      // Create a new top-level deck
      const newDeckId = createDeck('New Generated Deck');
      expect(newDeckId).not.toBeNull();
      
      // Verify it exists
      let currentCollection = useAppStore.getState().collection!;
      expect(currentCollection.decks.has(newDeckId!)).toBe(true);
      const newDeck = currentCollection.decks.get(newDeckId!);
      expect(newDeck!.name).toBe('New Generated Deck');
      
      // Unload (like closing the app)
      useAppStore.getState().setCollection(null, null);
      expect(useAppStore.getState().collection).toBeNull();
      
      // Reload the same collection (like opening the same file again)
      const reloadedCollection = createMockCollectionWithDecks();
      useAppStore.getState().setCollection(reloadedCollection, 'persistence-test.apkg');
      
      // The generated deck should be restored
      currentCollection = useAppStore.getState().collection!;
      expect(currentCollection.decks.has(newDeckId!)).toBe(true);
      
      const restoredDeck = currentCollection.decks.get(newDeckId!);
      expect(restoredDeck!.name).toBe('New Generated Deck');
      
      // Should be in deckTree at top level
      expect(currentCollection.deckTree.some(d => d.id === newDeckId)).toBe(true);
    });

    it('persists subdecks across unload/reload cycle', () => {
      const { setCollection, createSubdeck } = useAppStore.getState();
      
      // Load a collection
      const collection = createMockCollectionWithDecks();
      setCollection(collection, 'subdeck-persistence-test.apkg');
      
      // Find an existing deck to add subdeck to
      const parentDeck = findDeckByName(useAppStore.getState().collection!, 'Parent Deck');
      expect(parentDeck).not.toBeNull();
      const initialChildCount = parentDeck!.children.length;
      
      // Create a new subdeck
      const newSubdeckId = createSubdeck(parentDeck!.id, 'New Generated Subdeck');
      expect(newSubdeckId).not.toBeNull();
      
      // Verify it exists and is under parent
      let currentCollection = useAppStore.getState().collection!;
      expect(currentCollection.decks.has(newSubdeckId!)).toBe(true);
      const newSubdeck = currentCollection.decks.get(newSubdeckId!);
      expect(newSubdeck!.name).toBe('Parent Deck::New Generated Subdeck');
      expect(newSubdeck!.parentId).toBe(parentDeck!.id);
      
      // Verify parent has the new child
      const parentAfterCreate = currentCollection.decks.get(parentDeck!.id);
      expect(parentAfterCreate!.children.length).toBe(initialChildCount + 1);
      
      // Unload
      useAppStore.getState().setCollection(null, null);
      expect(useAppStore.getState().collection).toBeNull();
      
      // Reload the same collection
      const reloadedCollection = createMockCollectionWithDecks();
      useAppStore.getState().setCollection(reloadedCollection, 'subdeck-persistence-test.apkg');
      
      // The generated subdeck should be restored
      currentCollection = useAppStore.getState().collection!;
      expect(currentCollection.decks.has(newSubdeckId!)).toBe(true);
      
      const restoredSubdeck = currentCollection.decks.get(newSubdeckId!);
      expect(restoredSubdeck!.name).toBe('Parent Deck::New Generated Subdeck');
      expect(restoredSubdeck!.parentId).toBe(parentDeck!.id);
      
      // Should be in parent's children array
      const restoredParent = currentCollection.decks.get(parentDeck!.id);
      expect(restoredParent!.children.some(c => c.id === newSubdeckId)).toBe(true);
      
      // Should also be in deckTree under the parent
      const parentInTree = currentCollection.deckTree.find(d => d.id === parentDeck!.id);
      expect(parentInTree).toBeDefined();
      expect(parentInTree!.children.some(c => c.id === newSubdeckId)).toBe(true);
    });

    it('persists nested generated decks (parent and child both generated)', () => {
      const { setCollection, createDeck, createSubdeck } = useAppStore.getState();
      
      // Load a collection
      const collection = createMockCollectionWithDecks();
      setCollection(collection, 'nested-gen-persistence-test.apkg');
      
      // Create a new top-level deck
      const newParentId = createDeck('Generated Parent');
      expect(newParentId).not.toBeNull();
      
      // Create a subdeck under the generated parent
      const newChildId = createSubdeck(newParentId!, 'Generated Child');
      expect(newChildId).not.toBeNull();
      
      // Verify structure
      let currentCollection = useAppStore.getState().collection!;
      const parent = currentCollection.decks.get(newParentId!);
      const child = currentCollection.decks.get(newChildId!);
      expect(parent!.children.some(c => c.id === newChildId)).toBe(true);
      expect(child!.parentId).toBe(newParentId);
      expect(child!.name).toBe('Generated Parent::Generated Child');
      
      // Unload
      useAppStore.getState().setCollection(null, null);
      
      // Reload
      const reloadedCollection = createMockCollectionWithDecks();
      useAppStore.getState().setCollection(reloadedCollection, 'nested-gen-persistence-test.apkg');
      
      // Both should be restored
      currentCollection = useAppStore.getState().collection!;
      expect(currentCollection.decks.has(newParentId!)).toBe(true);
      expect(currentCollection.decks.has(newChildId!)).toBe(true);
      
      // Parent should have child in children array
      const restoredParent = currentCollection.decks.get(newParentId!);
      expect(restoredParent!.children.some(c => c.id === newChildId)).toBe(true);
      
      // Child should reference parent
      const restoredChild = currentCollection.decks.get(newChildId!);
      expect(restoredChild!.parentId).toBe(newParentId);
      
      // Tree structure should be correct
      const parentInTree = currentCollection.deckTree.find(d => d.id === newParentId);
      expect(parentInTree).toBeDefined();
      expect(parentInTree!.children.some(c => c.id === newChildId)).toBe(true);
    });
  });
});
