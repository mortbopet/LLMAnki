/**
 * Test Utilities for generating Anki .apkg files
 * 
 * This module uses the Deck class from the domain model to create
 * collections and cards, ensuring consistency between test code
 * and application code.
 */

import { Deck } from '../domain';
import type { CardType } from '../types';

export interface TestDeckConfig {
  name: string;
  description?: string;
  cards: TestCardConfig[];
}

export interface TestCardConfig {
  front: string;
  back: string;
  type?: CardType;
  tags?: string[];
}

/**
 * Generate a valid Anki .apkg file for testing using the Deck class
 */
export async function generateTestApkg(config: TestDeckConfig): Promise<Blob> {
  // Create an empty collection
  const collection = Deck.createEmptyCollection();
  
  // Create the deck
  const deck = Deck.create(config.name, collection, {
    description: config.description,
  });
  
  // Add cards to the deck
  for (const cardConfig of config.cards) {
    await deck.createCard(cardConfig.front, cardConfig.back, {
      type: cardConfig.type,
      tags: cardConfig.tags,
    });
  }
  
  // Export to .apkg
  return deck.export();
}

/**
 * Generate a test deck File object (useful for testing file uploads)
 */
export async function generateTestApkgFile(config: TestDeckConfig): Promise<File> {
  const blob = await generateTestApkg(config);
  return new File([blob], `${config.name}.apkg`, { type: 'application/octet-stream' });
}

/**
 * Create a simple test deck with some cards
 */
export function createSimpleTestDeckConfig(name: string, cardCount: number = 3): TestDeckConfig {
  const cards: TestCardConfig[] = [];
  for (let i = 1; i <= cardCount; i++) {
    cards.push({
      front: `Question ${i}`,
      back: `Answer ${i}`,
      tags: ['test'],
    });
  }
  return { name, cards };
}

/**
 * Create a test deck with various card types
 */
export function createMixedTestDeckConfig(name: string): TestDeckConfig {
  return {
    name,
    cards: [
      { front: 'What is 2+2?', back: '4', type: 'basic', tags: ['math'] },
      { front: 'Capital of France?', back: 'Paris', type: 'basic', tags: ['geography'] },
      { front: 'H2O is the formula for...', back: 'Water', type: 'basic', tags: ['chemistry'] },
    ],
  };
}
