/**
 * Deck Repository
 * 
 * This module provides persistence and management utilities for decks.
 * It handles:
 * - Deck persistence (caching generated decks)
 * - Deck lookup and query operations
 * - Integration with the collection
 */

import type { AnkiCollection, AnkiDeck } from '../types';
import { Deck, DeckOrigin } from './Deck';

// ============================================================================
// Types
// ============================================================================

/** Serializable deck state for persistence */
export interface PersistedDeckInfo {
  deckId: number;
  name: string;
  description: string;
  parentId?: number;
  origin: DeckOrigin;
}

/** Full persisted deck state (extends the card-level state) */
export interface PersistedDecksState {
  decks: PersistedDeckInfo[];
  lastUpdated: number;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Get a Deck instance by ID from a collection
 */
export function getDeckById(collection: AnkiCollection, deckId: number): Deck | null {
  const ankiDeck = collection.decks.get(deckId);
  if (!ankiDeck) return null;
  
  // Determine origin based on whether this deck has a special marker
  // For now, we use a simple heuristic - if it's not in the deck tree but is in decks map,
  // it might be generated. We'll improve this with proper tracking later.
  const origin: DeckOrigin = 'original';
  
  return Deck.fromAnkiDeck(ankiDeck, collection, origin);
}

/**
 * Get all decks in a collection as Deck instances
 */
export function getAllDecks(collection: AnkiCollection): Deck[] {
  const decks: Deck[] = [];
  for (const [, ankiDeck] of collection.decks) {
    if (ankiDeck.id !== 1) { // Skip default deck
      decks.push(Deck.fromAnkiDeck(ankiDeck, collection, 'original'));
    }
  }
  return decks;
}

/**
 * Get all top-level decks (no parent)
 */
export function getTopLevelDecks(collection: AnkiCollection): Deck[] {
  return collection.deckTree.map(ankiDeck => 
    Deck.fromAnkiDeck(ankiDeck, collection, 'original')
  );
}

/**
 * Find deck by name (supports hierarchical names like "Parent::Child")
 */
export function getDeckByName(collection: AnkiCollection, name: string): Deck | null {
  for (const [, ankiDeck] of collection.decks) {
    if (ankiDeck.name === name) {
      return Deck.fromAnkiDeck(ankiDeck, collection, 'original');
    }
  }
  return null;
}

/**
 * Get the number of cards in a deck (optionally including subdecks)
 */
export function getCardCount(collection: AnkiCollection, deckId: number, includeSubdecks: boolean = false): number {
  const targetDeckIds = new Set<number>([deckId]);
  
  if (includeSubdecks) {
    const addChildren = (deck: AnkiDeck) => {
      for (const child of deck.children) {
        targetDeckIds.add(child.id);
        addChildren(child);
      }
    };
    
    const deck = collection.decks.get(deckId);
    if (deck) {
      addChildren(deck);
    }
  }
  
  let count = 0;
  for (const [, card] of collection.cards) {
    if (targetDeckIds.has(card.deckId)) {
      count++;
    }
  }
  
  return count;
}

/**
 * Delete a deck and optionally its cards
 * 
 * @param collection The collection to modify
 * @param deckId ID of the deck to delete
 * @param deleteCards If true, delete cards in this deck; if false, move them to Default deck
 * @param deleteSubdecks If true, also delete subdecks; if false, promote them to parent level
 */
export function deleteDeck(
  collection: AnkiCollection,
  deckId: number,
  deleteCards: boolean = false,
  deleteSubdecks: boolean = false
): void {
  const deck = collection.decks.get(deckId);
  if (!deck || deckId === 1) return; // Can't delete default deck
  
  // Handle subdecks
  if (deleteSubdecks) {
    // Recursively delete all subdecks
    const deleteRecursive = (d: AnkiDeck) => {
      for (const child of d.children) {
        deleteRecursive(child);
        collection.decks.delete(child.id);
      }
    };
    deleteRecursive(deck);
  } else {
    // Promote subdecks to parent level
    const parentId = deck.parentId;
    for (const child of deck.children) {
      child.parentId = parentId;
      // Update name to remove this deck from the path
      if (parentId) {
        const parent = collection.decks.get(parentId);
        if (parent) {
          child.name = `${parent.name}::${child.name.split('::').pop()}`;
          parent.children.push(child);
        }
      } else {
        child.name = child.name.split('::').pop() || child.name;
        collection.deckTree.push(child);
      }
    }
  }
  
  // Handle cards
  if (deleteCards) {
    // Delete all cards in this deck
    const cardsToDelete: number[] = [];
    const notesToCheck = new Set<number>();
    
    for (const [cardId, card] of collection.cards) {
      if (card.deckId === deckId) {
        cardsToDelete.push(cardId);
        notesToCheck.add(card.noteId);
      }
    }
    
    for (const cardId of cardsToDelete) {
      collection.cards.delete(cardId);
    }
    
    // Delete orphaned notes
    for (const noteId of notesToCheck) {
      let hasCards = false;
      for (const card of collection.cards.values()) {
        if (card.noteId === noteId) {
          hasCards = true;
          break;
        }
      }
      if (!hasCards) {
        collection.notes.delete(noteId);
      }
    }
  } else {
    // Move cards to default deck
    for (const [, card] of collection.cards) {
      if (card.deckId === deckId) {
        card.deckId = 1;
      }
    }
  }
  
  // Remove from parent's children
  if (deck.parentId) {
    const parent = collection.decks.get(deck.parentId);
    if (parent) {
      parent.children = parent.children.filter(c => c.id !== deckId);
    }
  } else {
    // Remove from deck tree
    collection.deckTree = collection.deckTree.filter(d => d.id !== deckId);
  }
  
  // Finally, remove the deck itself
  collection.decks.delete(deckId);
}

/**
 * Rename a deck
 */
export function renameDeck(collection: AnkiCollection, deckId: number, newName: string): void {
  const deck = collection.decks.get(deckId);
  if (!deck || deckId === 1) return;
  
  // Build full name with parent path
  let fullName = newName;
  if (deck.parentId) {
    const parent = collection.decks.get(deck.parentId);
    if (parent) {
      fullName = `${parent.name}::${newName}`;
    }
  }
  
  const oldName = deck.name;
  deck.name = fullName;
  
  // Update children's names
  const updateChildNames = (d: AnkiDeck, oldPrefix: string, newPrefix: string) => {
    for (const child of d.children) {
      child.name = child.name.replace(oldPrefix, newPrefix);
      updateChildNames(child, oldPrefix, newPrefix);
    }
  };
  
  updateChildNames(deck, oldName, fullName);
}

/**
 * Move a deck to a new parent
 */
export function moveDeck(collection: AnkiCollection, deckId: number, newParentId: number | null): void {
  const deck = collection.decks.get(deckId);
  if (!deck || deckId === 1) return;
  
  const oldParentId = deck.parentId;
  
  // Remove from old parent
  if (oldParentId) {
    const oldParent = collection.decks.get(oldParentId);
    if (oldParent) {
      oldParent.children = oldParent.children.filter(c => c.id !== deckId);
    }
  } else {
    collection.deckTree = collection.deckTree.filter(d => d.id !== deckId);
  }
  
  // Add to new parent
  deck.parentId = newParentId ?? undefined;
  
  // Update name
  const shortName = deck.name.split('::').pop() || deck.name;
  if (newParentId) {
    const newParent = collection.decks.get(newParentId);
    if (newParent) {
      deck.name = `${newParent.name}::${shortName}`;
      newParent.children.push(deck);
    }
  } else {
    deck.name = shortName;
    collection.deckTree.push(deck);
  }
  
  // Update children's names recursively
  const updateChildNames = (d: AnkiDeck) => {
    for (const child of d.children) {
      const childShortName = child.name.split('::').pop() || child.name;
      child.name = `${d.name}::${childShortName}`;
      updateChildNames(child);
    }
  };
  
  updateChildNames(deck);
}

/**
 * Extract generated deck info for persistence
 */
export function getGeneratedDecksForPersistence(
  collection: AnkiCollection,
  generatedDeckIds: Set<number>
): PersistedDeckInfo[] {
  const result: PersistedDeckInfo[] = [];
  
  for (const deckId of generatedDeckIds) {
    const deck = collection.decks.get(deckId);
    if (deck) {
      result.push({
        deckId: deck.id,
        name: deck.name,
        description: deck.description,
        parentId: deck.parentId,
        origin: 'generated',
      });
    }
  }
  
  return result;
}

/**
 * Helper to find a deck in the deckTree by ID (recursive search)
 */
function findInTree(tree: AnkiDeck[], deckId: number): AnkiDeck | null {
  for (const deck of tree) {
    if (deck.id === deckId) return deck;
    const found = findInTree(deck.children, deckId);
    if (found) return found;
  }
  return null;
}

/**
 * Restore generated decks from persisted state
 */
export function restoreGeneratedDecks(
  collection: AnkiCollection,
  persistedDecks: PersistedDeckInfo[]
): void {
  // Sort decks so parents come before children (based on name depth)
  // This ensures parents are restored before their children
  const sortedDecks = [...persistedDecks].sort((a, b) => {
    const aDepth = (a.name.match(/::/g) || []).length;
    const bDepth = (b.name.match(/::/g) || []).length;
    return aDepth - bDepth;
  });

  for (const deckInfo of sortedDecks) {
    if (deckInfo.origin !== 'generated') continue;
    if (collection.decks.has(deckInfo.deckId)) continue; // Already exists
    
    const ankiDeck: AnkiDeck = {
      id: deckInfo.deckId,
      name: deckInfo.name,
      description: deckInfo.description,
      parentId: deckInfo.parentId,
      children: [],
    };
    
    collection.decks.set(deckInfo.deckId, ankiDeck);
    
    // Add to parent or deck tree
    if (deckInfo.parentId) {
      // Update the parent in the decks Map
      const parentInMap = collection.decks.get(deckInfo.parentId);
      if (parentInMap) {
        parentInMap.children.push(ankiDeck);
      }
      
      // Also update the parent in the deckTree (might be a different object)
      const parentInTree = findInTree(collection.deckTree, deckInfo.parentId);
      if (parentInTree && parentInTree !== parentInMap) {
        parentInTree.children.push(ankiDeck);
      }
      
      // If parent not found anywhere, add to top level
      if (!parentInMap && !parentInTree) {
        collection.deckTree.push(ankiDeck);
      }
    } else {
      collection.deckTree.push(ankiDeck);
    }
  }
}
