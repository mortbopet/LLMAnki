/**
 * Comprehensive Round-Trip Tests for APKG Parser/Exporter
 * 
 * These tests verify that:
 * 1. An .apkg file with ALL possible features can be parsed correctly
 * 2. The collection can be modified within LLMAnki
 * 3. The modified collection can be exported back to .apkg
 * 4. The exported .apkg can be re-parsed with all data preserved
 */

import { describe, it, expect } from 'vitest';
import { parseApkgFile, exportCollection, getCardsInDeck } from '../utils/ankiParser';
import { Deck, createDefaultModel } from '../domain/Deck';
import type { 
  AnkiCollection, 
  AnkiCard, 
  AnkiNote, 
  AnkiModel, 
  AnkiDeck, 
  ReviewLogEntry,
} from '../types';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a comprehensive test collection that exercises ALL features
 */
function createComprehensiveCollection(): AnkiCollection {
  const now = Date.now();
  const baseId = 1700000000000; // Fixed base for deterministic tests
  
  // ========== MODELS ==========
  const models = new Map<number, AnkiModel>();
  
  // Model 1: Basic model with all fields
  const basicModelId = baseId + 1;
  models.set(basicModelId, {
    id: basicModelId,
    name: 'Basic (Full)',
    type: 0, // Standard
    fields: [
      { name: 'Front', ordinal: 0, sticky: false },
      { name: 'Back', ordinal: 1, sticky: true },
      { name: 'Extra', ordinal: 2, sticky: false },
    ],
    templates: [
      {
        name: 'Card 1',
        ordinal: 0,
        questionFormat: '{{Front}}',
        answerFormat: '{{FrontSide}}<hr id="answer">{{Back}}<br>{{Extra}}',
      },
    ],
    css: '.card { font-family: "Arial"; font-size: 20px; text-align: center; }',
    latexPre: '\\documentclass[12pt]{article}\n\\usepackage{amsmath}\n\\begin{document}',
    latexPost: '\\end{document}',
    sortField: 0,
    did: null,
  });
  
  // Model 2: Basic with Reversed
  const reversedModelId = baseId + 2;
  models.set(reversedModelId, {
    id: reversedModelId,
    name: 'Basic (and reversed card)',
    type: 0,
    fields: [
      { name: 'Front', ordinal: 0, sticky: false },
      { name: 'Back', ordinal: 1, sticky: false },
    ],
    templates: [
      {
        name: 'Card 1',
        ordinal: 0,
        questionFormat: '{{Front}}',
        answerFormat: '{{FrontSide}}<hr>{{Back}}',
      },
      {
        name: 'Card 2 (Reverse)',
        ordinal: 1,
        questionFormat: '{{Back}}',
        answerFormat: '{{FrontSide}}<hr>{{Front}}',
      },
    ],
    css: '.card { font-family: sans-serif; }',
    latexPre: '\\documentclass{article}\\begin{document}',
    latexPost: '\\end{document}',
    sortField: 0,
    did: null,
  });
  
  // Model 3: Cloze deletion
  const clozeModelId = baseId + 3;
  models.set(clozeModelId, {
    id: clozeModelId,
    name: 'Cloze',
    type: 1, // Cloze
    fields: [
      { name: 'Text', ordinal: 0, sticky: false },
      { name: 'Extra', ordinal: 1, sticky: false },
    ],
    templates: [
      {
        name: 'Cloze',
        ordinal: 0,
        questionFormat: '{{cloze:Text}}',
        answerFormat: '{{cloze:Text}}<br>{{Extra}}',
      },
    ],
    css: '.card { font-size: 18px; } .cloze { font-weight: bold; color: blue; }',
    latexPre: '\\documentclass{article}\\begin{document}',
    latexPost: '\\end{document}',
    sortField: 0,
    did: null,
  });
  
  // Model 4: Type-in-answer
  const typeModelId = baseId + 4;
  models.set(typeModelId, {
    id: typeModelId,
    name: 'Basic (type in the answer)',
    type: 0,
    fields: [
      { name: 'Front', ordinal: 0, sticky: false },
      { name: 'Back', ordinal: 1, sticky: false },
    ],
    templates: [
      {
        name: 'Card 1',
        ordinal: 0,
        questionFormat: '{{Front}}\n{{type:Back}}',
        answerFormat: '{{Front}}<hr id="answer">{{type:Back}}',
      },
    ],
    css: '.card { font-family: monospace; }',
    latexPre: '\\documentclass{article}\\begin{document}',
    latexPost: '\\end{document}',
    sortField: 0,
    did: null,
  });
  
  // ========== DECKS ==========
  const decks = new Map<number, AnkiDeck>();
  
  // Default deck (ID 1 per Anki spec)
  const defaultDeckId = 1;
  const defaultDeck: AnkiDeck = {
    id: defaultDeckId,
    name: 'Default',
    description: 'Default deck',
    children: [],
    dyn: 0,
    conf: 1,
  };
  decks.set(defaultDeckId, defaultDeck);
  
  // Root deck
  const rootDeckId = baseId + 10;
  const rootDeck: AnkiDeck = {
    id: rootDeckId,
    name: 'Test Deck',
    description: 'Main test deck with description',
    children: [],
    dyn: 0,
    conf: 1,
  };
  decks.set(rootDeckId, rootDeck);
  
  // Child deck (subdeck)
  const childDeckId = baseId + 11;
  const childDeck: AnkiDeck = {
    id: childDeckId,
    name: 'Test Deck::Subdeck',
    description: 'A subdeck for testing hierarchy',
    parentId: rootDeckId,
    children: [],
    dyn: 0,
    conf: 1,
  };
  decks.set(childDeckId, childDeck);
  rootDeck.children.push(childDeck);
  
  // Grandchild deck (deeper hierarchy)
  const grandchildDeckId = baseId + 12;
  const grandchildDeck: AnkiDeck = {
    id: grandchildDeckId,
    name: 'Test Deck::Subdeck::Deep',
    description: 'Deeply nested subdeck',
    parentId: childDeckId,
    children: [],
    dyn: 0,
    conf: 1,
  };
  decks.set(grandchildDeckId, grandchildDeck);
  childDeck.children.push(grandchildDeck);
  
  // ========== NOTES ==========
  const notes = new Map<number, AnkiNote>();
  
  // Note 1: Basic card with all tags
  const note1Id = baseId + 100;
  notes.set(note1Id, {
    id: note1Id,
    modelId: basicModelId,
    fields: ['What is 2+2?', '4', 'Basic arithmetic'],
    tags: ['math', 'arithmetic', 'easy'],
    guid: 'test-guid-001',
    mod: Math.floor(now / 1000),
  });
  
  // Note 2: Reversed card
  const note2Id = baseId + 101;
  notes.set(note2Id, {
    id: note2Id,
    modelId: reversedModelId,
    fields: ['Capital of France', 'Paris'],
    tags: ['geography', 'europe'],
    guid: 'test-guid-002',
    mod: Math.floor(now / 1000),
  });
  
  // Note 3: Cloze deletion
  const note3Id = baseId + 102;
  notes.set(note3Id, {
    id: note3Id,
    modelId: clozeModelId,
    fields: ['The {{c1::mitochondria}} is the {{c2::powerhouse}} of the cell.', 'Biology fact'],
    tags: ['biology', 'cells'],
    guid: 'test-guid-003',
    mod: Math.floor(now / 1000),
  });
  
  // Note 4: Type-in-answer
  const note4Id = baseId + 103;
  notes.set(note4Id, {
    id: note4Id,
    modelId: typeModelId,
    fields: ['Type the German word for "house":', 'Haus'],
    tags: ['german', 'vocabulary'],
    guid: 'test-guid-004',
    mod: Math.floor(now / 1000),
  });
  
  // Note 5: Card with special characters
  const note5Id = baseId + 104;
  notes.set(note5Id, {
    id: note5Id,
    modelId: basicModelId,
    fields: [
      'What is the formula for water? <b>Bold</b> & "quoted"',
      'H₂O (with subscript)',
      'Contains <img src="test.png"> and special chars: é, ñ, 中文',
    ],
    tags: ['chemistry', 'special-chars'],
    guid: 'test-guid-005',
    mod: Math.floor(now / 1000),
  });
  
  // Note 6: Empty tags
  const note6Id = baseId + 105;
  notes.set(note6Id, {
    id: note6Id,
    modelId: basicModelId,
    fields: ['Question with no tags', 'Answer with no tags', ''],
    tags: [],
    guid: 'test-guid-006',
    mod: Math.floor(now / 1000),
  });
  
  // ========== CARDS ==========
  const cards = new Map<number, AnkiCard>();
  
  // Card 1: New card (queue=0)
  const card1Id = baseId + 200;
  cards.set(card1Id, {
    id: card1Id,
    noteId: note1Id,
    deckId: rootDeckId,
    ordinal: 0,
    type: 'basic',
    queue: 0, // New
    due: 1,
    interval: 0,
    factor: 2500,
    reps: 0,
    lapses: 0,
    left: 0,
    odue: 0,
    odid: 0,
    flags: 0,
  });
  
  // Card 2: Learning card (queue=1)
  const card2Id = baseId + 201;
  cards.set(card2Id, {
    id: card2Id,
    noteId: note2Id,
    deckId: rootDeckId,
    ordinal: 0,
    type: 'basic-reversed',
    queue: 1, // Learning
    due: Math.floor(now / 1000) + 600, // Due in 10 minutes
    interval: 0,
    factor: 2500,
    reps: 1,
    lapses: 0,
    left: 2003, // 2 reps today, 3 till graduation
    odue: 0,
    odid: 0,
    flags: 1, // Red flag
  });
  
  // Card 2b: Reverse card from same note
  const card2bId = baseId + 202;
  cards.set(card2bId, {
    id: card2bId,
    noteId: note2Id,
    deckId: rootDeckId,
    ordinal: 1, // Second template
    type: 'basic-reversed',
    queue: 0,
    due: 2,
    interval: 0,
    factor: 2500,
    reps: 0,
    lapses: 0,
    left: 0,
    odue: 0,
    odid: 0,
    flags: 0,
  });
  
  // Card 3: Review card (queue=2)
  const card3Id = baseId + 203;
  cards.set(card3Id, {
    id: card3Id,
    noteId: note3Id,
    deckId: childDeckId, // In subdeck
    ordinal: 0,
    type: 'cloze',
    queue: 2, // Review
    due: 100, // Days since collection creation
    interval: 30,
    factor: 2650,
    reps: 15,
    lapses: 2,
    left: 0,
    odue: 0,
    odid: 0,
    flags: 2, // Orange flag
  });
  
  // Card 4: Suspended card (queue=-1)
  const card4Id = baseId + 204;
  cards.set(card4Id, {
    id: card4Id,
    noteId: note4Id,
    deckId: childDeckId,
    ordinal: 0,
    type: 'basic-type',
    queue: -1, // Suspended
    due: 50,
    interval: 14,
    factor: 2200,
    reps: 5,
    lapses: 1,
    left: 0,
    odue: 0,
    odid: 0,
    flags: 3, // Green flag
  });
  
  // Card 5: Buried card (queue=-2)
  const card5Id = baseId + 205;
  cards.set(card5Id, {
    id: card5Id,
    noteId: note5Id,
    deckId: grandchildDeckId, // In deep subdeck
    ordinal: 0,
    type: 'basic',
    queue: -2, // Buried
    due: 75,
    interval: 7,
    factor: 2500,
    reps: 3,
    lapses: 0,
    left: 0,
    odue: 0,
    odid: 0,
    flags: 4, // Blue flag
  });
  
  // Card 6: Card with no scheduling data
  const card6Id = baseId + 206;
  cards.set(card6Id, {
    id: card6Id,
    noteId: note6Id,
    deckId: rootDeckId,
    ordinal: 0,
    type: 'basic',
    queue: 0,
    due: 3,
    interval: 0,
    factor: 2500,
    reps: 0,
    lapses: 0,
    left: 0,
    odue: 0,
    odid: 0,
    flags: 0,
  });
  
  // ========== REVIEW LOG ==========
  const revlog = new Map<number, ReviewLogEntry[]>();
  
  // Review history for card 3 (the review card)
  revlog.set(card3Id, [
    {
      id: baseId + 300,
      cardId: card3Id,
      ease: 3, // Good
      interval: 1,
      lastInterval: 0,
      factor: 2500,
      time: 5000, // 5 seconds
      type: 0, // Learn
    },
    {
      id: baseId + 301,
      cardId: card3Id,
      ease: 3,
      interval: 3,
      lastInterval: 1,
      factor: 2500,
      time: 3000,
      type: 1, // Review
    },
    {
      id: baseId + 302,
      cardId: card3Id,
      ease: 2, // Hard
      interval: 7,
      lastInterval: 3,
      factor: 2350,
      time: 8000,
      type: 1,
    },
    {
      id: baseId + 303,
      cardId: card3Id,
      ease: 1, // Again (lapse)
      interval: -600, // Negative = seconds
      lastInterval: 7,
      factor: 2200,
      time: 15000,
      type: 2, // Relearn
    },
    {
      id: baseId + 304,
      cardId: card3Id,
      ease: 4, // Easy
      interval: 30,
      lastInterval: 7,
      factor: 2650,
      time: 2000,
      type: 1,
    },
  ]);
  
  // Review history for card 4 (suspended card)
  revlog.set(card4Id, [
    {
      id: baseId + 310,
      cardId: card4Id,
      ease: 3,
      interval: 1,
      lastInterval: 0,
      factor: 2500,
      time: 4000,
      type: 0,
    },
    {
      id: baseId + 311,
      cardId: card4Id,
      ease: 1, // Again
      interval: -60,
      lastInterval: 1,
      factor: 2300,
      time: 10000,
      type: 2,
    },
  ]);
  
  // ========== MEDIA ==========
  const media = new Map<string, Blob>();
  
  // Add test media files
  media.set('test.png', new Blob(['PNG image data'], { type: 'image/png' }));
  media.set('audio.mp3', new Blob(['MP3 audio data'], { type: 'audio/mpeg' }));
  media.set('special-chars-éñ.jpg', new Blob(['JPEG with special chars'], { type: 'image/jpeg' }));
  
  // ========== BUILD DECK TREE ==========
  const deckTree = [defaultDeck, rootDeck];
  
  return {
    decks,
    models,
    notes,
    cards,
    revlog,
    media,
    deckTree,
  };
}

/**
 * Convert collection to a File object for parsing
 */
async function collectionToFile(collection: AnkiCollection, filename: string = 'test.apkg'): Promise<File> {
  const blob = await exportCollection(collection);
  return new File([blob], filename, { type: 'application/octet-stream' });
}

/**
 * Compare two collections for equality (with tolerance for expected differences)
 */
function assertCollectionsEqual(
  original: AnkiCollection,
  parsed: AnkiCollection,
  options: { 
    ignoreNewCardIds?: Set<number>;
    ignoreNewNoteIds?: Set<number>;
  } = {}
): void {
  const { ignoreNewCardIds = new Set(), ignoreNewNoteIds = new Set() } = options;
  
  // Compare decks
  expect(parsed.decks.size).toBe(original.decks.size);
  for (const [id, originalDeck] of original.decks) {
    const parsedDeck = parsed.decks.get(id);
    expect(parsedDeck).toBeDefined();
    expect(parsedDeck!.name).toBe(originalDeck.name);
    expect(parsedDeck!.description).toBe(originalDeck.description);
    expect(parsedDeck!.dyn ?? 0).toBe(originalDeck.dyn ?? 0);
    // conf might be omitted for filtered decks
    if (!originalDeck.dyn) {
      expect(parsedDeck!.conf ?? 1).toBe(originalDeck.conf ?? 1);
    }
  }
  
  // Compare models
  expect(parsed.models.size).toBe(original.models.size);
  for (const [id, originalModel] of original.models) {
    const parsedModel = parsed.models.get(id);
    expect(parsedModel).toBeDefined();
    expect(parsedModel!.name).toBe(originalModel.name);
    expect(parsedModel!.type).toBe(originalModel.type);
    expect(parsedModel!.fields.length).toBe(originalModel.fields.length);
    expect(parsedModel!.templates.length).toBe(originalModel.templates.length);
    expect(parsedModel!.css).toBe(originalModel.css);
    expect(parsedModel!.sortField ?? 0).toBe(originalModel.sortField ?? 0);
    
    // Compare fields
    for (let i = 0; i < originalModel.fields.length; i++) {
      expect(parsedModel!.fields[i].name).toBe(originalModel.fields[i].name);
      expect(parsedModel!.fields[i].ordinal).toBe(originalModel.fields[i].ordinal);
      expect(parsedModel!.fields[i].sticky).toBe(originalModel.fields[i].sticky);
    }
    
    // Compare templates
    for (let i = 0; i < originalModel.templates.length; i++) {
      expect(parsedModel!.templates[i].name).toBe(originalModel.templates[i].name);
      expect(parsedModel!.templates[i].ordinal).toBe(originalModel.templates[i].ordinal);
      expect(parsedModel!.templates[i].questionFormat).toBe(originalModel.templates[i].questionFormat);
      expect(parsedModel!.templates[i].answerFormat).toBe(originalModel.templates[i].answerFormat);
    }
  }
  
  // Compare notes (excluding new notes if specified)
  const originalNotesFiltered = Array.from(original.notes.entries())
    .filter(([id]) => !ignoreNewNoteIds.has(id));
  const parsedNotesFiltered = Array.from(parsed.notes.entries())
    .filter(([id]) => !ignoreNewNoteIds.has(id));
  
  expect(parsedNotesFiltered.length).toBe(originalNotesFiltered.length);
  for (const [id, originalNote] of original.notes) {
    if (ignoreNewNoteIds.has(id)) continue;
    const parsedNote = parsed.notes.get(id);
    expect(parsedNote).toBeDefined();
    expect(parsedNote!.modelId).toBe(originalNote.modelId);
    expect(parsedNote!.fields).toEqual(originalNote.fields);
    expect(parsedNote!.guid).toBe(originalNote.guid);
    // Tags should match (order may differ, so sort)
    expect([...parsedNote!.tags].sort()).toEqual([...originalNote.tags].sort());
  }
  
  // Compare cards (excluding new cards if specified)
  const originalCards = Array.from(original.cards.values())
    .filter(c => !ignoreNewCardIds.has(c.id));
  const parsedCardsFiltered = Array.from(parsed.cards.values())
    .filter(c => !ignoreNewCardIds.has(c.id));
  
  expect(parsedCardsFiltered.length).toBe(originalCards.length);
  
  for (const originalCard of originalCards) {
    const parsedCard = parsed.cards.get(originalCard.id);
    expect(parsedCard).toBeDefined();
    expect(parsedCard!.noteId).toBe(originalCard.noteId);
    expect(parsedCard!.deckId).toBe(originalCard.deckId);
    expect(parsedCard!.ordinal).toBe(originalCard.ordinal);
    expect(parsedCard!.queue).toBe(originalCard.queue);
    expect(parsedCard!.interval).toBe(originalCard.interval);
    expect(parsedCard!.factor).toBe(originalCard.factor);
    expect(parsedCard!.reps).toBe(originalCard.reps);
    expect(parsedCard!.lapses).toBe(originalCard.lapses);
    expect(parsedCard!.left ?? 0).toBe(originalCard.left ?? 0);
    expect(parsedCard!.odue ?? 0).toBe(originalCard.odue ?? 0);
    expect(parsedCard!.odid ?? 0).toBe(originalCard.odid ?? 0);
    expect(parsedCard!.flags ?? 0).toBe(originalCard.flags ?? 0);
  }
  
  // Compare review log
  expect(parsed.revlog.size).toBe(original.revlog.size);
  for (const [cardId, originalEntries] of original.revlog) {
    const parsedEntries = parsed.revlog.get(cardId);
    expect(parsedEntries).toBeDefined();
    expect(parsedEntries!.length).toBe(originalEntries.length);
    
    for (let i = 0; i < originalEntries.length; i++) {
      const orig = originalEntries[i];
      const pars = parsedEntries![i];
      expect(pars.id).toBe(orig.id);
      expect(pars.cardId).toBe(orig.cardId);
      expect(pars.ease).toBe(orig.ease);
      expect(pars.interval).toBe(orig.interval);
      expect(pars.lastInterval).toBe(orig.lastInterval);
      expect(pars.factor).toBe(orig.factor);
      expect(pars.time).toBe(orig.time);
      expect(pars.type).toBe(orig.type);
    }
  }
  
  // Compare media
  expect(parsed.media.size).toBe(original.media.size);
  for (const [filename] of original.media) {
    expect(parsed.media.has(filename)).toBe(true);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('APKG Round-Trip Tests', () => {
  
  describe('Basic Round-Trip (No Modifications)', () => {
    
    it('should round-trip a comprehensive collection without data loss', async () => {
      // Create comprehensive collection
      const original = createComprehensiveCollection();
      
      // Export to .apkg
      const file = await collectionToFile(original);
      
      // Parse the exported file
      const parsed = await parseApkgFile(file);
      
      // Verify all data is preserved
      assertCollectionsEqual(original, parsed);
    });
    
    it('should preserve deck hierarchy through round-trip', async () => {
      const original = createComprehensiveCollection();
      const file = await collectionToFile(original);
      const parsed = await parseApkgFile(file);
      
      // Find the nested deck
      const deepDeck = Array.from(parsed.decks.values())
        .find(d => d.name === 'Test Deck::Subdeck::Deep');
      
      expect(deepDeck).toBeDefined();
      expect(deepDeck!.name).toBe('Test Deck::Subdeck::Deep');
      
      // Verify deck tree structure
      const rootDeck = parsed.deckTree.find(d => d.name === 'Test Deck');
      expect(rootDeck).toBeDefined();
      expect(rootDeck!.children.length).toBeGreaterThan(0);
      
      const subdeck = rootDeck!.children.find(d => d.name.includes('Subdeck'));
      expect(subdeck).toBeDefined();
    });
    
    it('should preserve all card scheduling states', async () => {
      const original = createComprehensiveCollection();
      const file = await collectionToFile(original);
      const parsed = await parseApkgFile(file);
      
      // Check for cards in different queue states
      const cards = Array.from(parsed.cards.values());
      
      const newCards = cards.filter(c => c.queue === 0);
      const learningCards = cards.filter(c => c.queue === 1);
      const reviewCards = cards.filter(c => c.queue === 2);
      const suspendedCards = cards.filter(c => c.queue === -1);
      const buriedCards = cards.filter(c => c.queue === -2);
      
      expect(newCards.length).toBeGreaterThan(0);
      expect(learningCards.length).toBeGreaterThan(0);
      expect(reviewCards.length).toBeGreaterThan(0);
      expect(suspendedCards.length).toBeGreaterThan(0);
      expect(buriedCards.length).toBeGreaterThan(0);
    });
    
    it('should preserve card flags', async () => {
      const original = createComprehensiveCollection();
      const file = await collectionToFile(original);
      const parsed = await parseApkgFile(file);
      
      const cards = Array.from(parsed.cards.values());
      
      // Check for cards with different flags
      const flaggedCards = cards.filter(c => (c.flags ?? 0) > 0);
      expect(flaggedCards.length).toBeGreaterThanOrEqual(4); // We set flags 1-4
      
      const flags = flaggedCards.map(c => c.flags);
      expect(flags).toContain(1); // Red
      expect(flags).toContain(2); // Orange
      expect(flags).toContain(3); // Green
      expect(flags).toContain(4); // Blue
    });
    
    it('should preserve review history', async () => {
      const original = createComprehensiveCollection();
      const file = await collectionToFile(original);
      const parsed = await parseApkgFile(file);
      
      // Original has review log for 2 cards
      expect(parsed.revlog.size).toBe(2);
      
      // Check the detailed review card has all its reviews
      const reviewedCardId = Array.from(original.revlog.keys())[0];
      const reviews = parsed.revlog.get(reviewedCardId);
      expect(reviews).toBeDefined();
      expect(reviews!.length).toBe(5);
      
      // Verify review types are preserved
      const reviewTypes = reviews!.map(r => r.type);
      expect(reviewTypes).toContain(0); // Learn
      expect(reviewTypes).toContain(1); // Review
      expect(reviewTypes).toContain(2); // Relearn
    });
    
    it('should preserve all model types', async () => {
      const original = createComprehensiveCollection();
      const file = await collectionToFile(original);
      const parsed = await parseApkgFile(file);
      
      const models = Array.from(parsed.models.values());
      
      // Check for standard and cloze models
      const standardModels = models.filter(m => m.type === 0);
      const clozeModels = models.filter(m => m.type === 1);
      
      expect(standardModels.length).toBeGreaterThan(0);
      expect(clozeModels.length).toBeGreaterThan(0);
    });
    
    it('should preserve special characters in fields', async () => {
      const original = createComprehensiveCollection();
      const file = await collectionToFile(original);
      const parsed = await parseApkgFile(file);
      
      // Find the note with special characters
      const specialNote = Array.from(parsed.notes.values())
        .find(n => n.fields[0].includes('<b>Bold</b>'));
      
      expect(specialNote).toBeDefined();
      expect(specialNote!.fields[0]).toContain('&');
      expect(specialNote!.fields[0]).toContain('"quoted"');
      expect(specialNote!.fields[1]).toContain('₂'); // Subscript
      expect(specialNote!.fields[2]).toContain('中文'); // Chinese characters
    });
    
    it('should preserve media files', async () => {
      const original = createComprehensiveCollection();
      const file = await collectionToFile(original);
      const parsed = await parseApkgFile(file);
      
      expect(parsed.media.size).toBe(3);
      expect(parsed.media.has('test.png')).toBe(true);
      expect(parsed.media.has('audio.mp3')).toBe(true);
      expect(parsed.media.has('special-chars-éñ.jpg')).toBe(true);
    });
  });
  
  describe('Round-Trip with Modifications', () => {
    
    it('should preserve existing data when adding a new card', async () => {
      // Create and export original collection
      const original = createComprehensiveCollection();
      const file1 = await collectionToFile(original);
      
      // Parse the file
      const parsed = await parseApkgFile(file1);
      
      // Add a new card
      const newNoteId = Date.now();
      const newCardId = Date.now() + 1;
      const modelId = Array.from(parsed.models.keys())[0];
      const deckId = Array.from(parsed.decks.keys())[1]; // First non-default deck
      
      parsed.notes.set(newNoteId, {
        id: newNoteId,
        modelId: modelId,
        fields: ['New Question', 'New Answer', 'Extra info'],
        tags: ['added-by-llmanki'],
        guid: `new-guid-${newNoteId}`,
        mod: Math.floor(Date.now() / 1000),
      });
      
      parsed.cards.set(newCardId, {
        id: newCardId,
        noteId: newNoteId,
        deckId: deckId,
        ordinal: 0,
        type: 'basic',
        queue: 0,
        due: 100,
        interval: 0,
        factor: 2500,
        reps: 0,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0,
      });
      
      // Export modified collection
      const file2 = await collectionToFile(parsed);
      
      // Parse again
      const reparsed = await parseApkgFile(file2);
      
      // Verify original data is preserved
      assertCollectionsEqual(original, reparsed, { 
        ignoreNewCardIds: new Set([newCardId]),
        ignoreNewNoteIds: new Set([newNoteId])
      });
      
      // Verify new card exists
      expect(reparsed.cards.has(newCardId)).toBe(true);
      expect(reparsed.notes.has(newNoteId)).toBe(true);
      
      const newNote = reparsed.notes.get(newNoteId);
      expect(newNote!.fields[0]).toBe('New Question');
      expect(newNote!.tags).toContain('added-by-llmanki');
    });
    
    it('should preserve data when modifying a card field', async () => {
      const original = createComprehensiveCollection();
      const file1 = await collectionToFile(original);
      const parsed = await parseApkgFile(file1);
      
      // Modify the first note's content
      const firstNoteId = Array.from(parsed.notes.keys())[0];
      const note = parsed.notes.get(firstNoteId)!;
      note.fields[0] = 'Modified Question Content';
      note.fields[1] = 'Modified Answer Content';
      
      // Export and re-parse
      const file2 = await collectionToFile(parsed);
      const reparsed = await parseApkgFile(file2);
      
      // Verify modification persisted
      const modifiedNote = reparsed.notes.get(firstNoteId);
      expect(modifiedNote!.fields[0]).toBe('Modified Question Content');
      expect(modifiedNote!.fields[1]).toBe('Modified Answer Content');
      
      // Verify other cards are unchanged
      expect(reparsed.cards.size).toBe(original.cards.size);
    });
    
    it('should preserve data when deleting a card', async () => {
      const original = createComprehensiveCollection();
      const file1 = await collectionToFile(original);
      const parsed = await parseApkgFile(file1);
      
      const originalCardCount = parsed.cards.size;
      
      // Delete a card and its note
      const cardToDelete = Array.from(parsed.cards.keys())[0];
      const noteToDelete = parsed.cards.get(cardToDelete)!.noteId;
      
      // Only delete note if no other cards use it
      const cardsUsingNote = Array.from(parsed.cards.values())
        .filter(c => c.noteId === noteToDelete);
      
      parsed.cards.delete(cardToDelete);
      if (cardsUsingNote.length === 1) {
        parsed.notes.delete(noteToDelete);
      }
      
      // Export excluding the deleted card
      const excludeSet = new Set([cardToDelete]);
      const blob = await exportCollection(parsed, excludeSet);
      const file2 = new File([blob], 'modified.apkg');
      const reparsed = await parseApkgFile(file2);
      
      // Verify deletion
      expect(reparsed.cards.has(cardToDelete)).toBe(false);
      expect(reparsed.cards.size).toBe(originalCardCount - 1);
    });
    
    it('should preserve data when moving a card to a different deck', async () => {
      const original = createComprehensiveCollection();
      const file1 = await collectionToFile(original);
      const parsed = await parseApkgFile(file1);
      
      // Move first card to a different deck
      const cardToMove = Array.from(parsed.cards.values())[0];
      const originalDeckId = cardToMove.deckId;
      const newDeckId = Array.from(parsed.decks.keys())
        .find(id => id !== originalDeckId && id !== 1)!;
      
      cardToMove.deckId = newDeckId;
      
      // Export and re-parse
      const file2 = await collectionToFile(parsed);
      const reparsed = await parseApkgFile(file2);
      
      // Verify move
      const movedCard = reparsed.cards.get(cardToMove.id);
      expect(movedCard!.deckId).toBe(newDeckId);
    });
    
    it('should preserve data when adding tags to a card', async () => {
      const original = createComprehensiveCollection();
      const file1 = await collectionToFile(original);
      const parsed = await parseApkgFile(file1);
      
      // Add tags to first note
      const firstNoteId = Array.from(parsed.notes.keys())[0];
      const note = parsed.notes.get(firstNoteId)!;
      note.tags = [...note.tags, 'new-tag-1', 'new-tag-2', 'llmanki-modified'];
      
      // Export and re-parse
      const file2 = await collectionToFile(parsed);
      const reparsed = await parseApkgFile(file2);
      
      const modifiedNote = reparsed.notes.get(firstNoteId);
      expect(modifiedNote!.tags).toContain('new-tag-1');
      expect(modifiedNote!.tags).toContain('new-tag-2');
      expect(modifiedNote!.tags).toContain('llmanki-modified');
    });
    
    it('should preserve data when updating card scheduling', async () => {
      const original = createComprehensiveCollection();
      const file1 = await collectionToFile(original);
      const parsed = await parseApkgFile(file1);
      
      // Update scheduling on a new card to make it a review card
      const newCard = Array.from(parsed.cards.values())
        .find(c => c.queue === 0);
      
      if (newCard) {
        newCard.queue = 2; // Review
        newCard.interval = 7;
        newCard.factor = 2750;
        newCard.reps = 3;
        newCard.due = 50;
      }
      
      // Export and re-parse
      const file2 = await collectionToFile(parsed);
      const reparsed = await parseApkgFile(file2);
      
      if (newCard) {
        const updatedCard = reparsed.cards.get(newCard.id);
        expect(updatedCard!.interval).toBe(7);
        expect(updatedCard!.factor).toBe(2750);
        expect(updatedCard!.reps).toBe(3);
      }
    });
    
    it('should preserve data when adding review history', async () => {
      const original = createComprehensiveCollection();
      const file1 = await collectionToFile(original);
      const parsed = await parseApkgFile(file1);
      
      // Find a card without review history
      const cardWithoutHistory = Array.from(parsed.cards.values())
        .find(c => !parsed.revlog.has(c.id));
      
      if (cardWithoutHistory) {
        // Add review history
        parsed.revlog.set(cardWithoutHistory.id, [
          {
            id: Date.now(),
            cardId: cardWithoutHistory.id,
            ease: 3,
            interval: 1,
            lastInterval: 0,
            factor: 2500,
            time: 5000,
            type: 0,
          },
        ]);
        
        // Export and re-parse
        const file2 = await collectionToFile(parsed);
        const reparsed = await parseApkgFile(file2);
        
        // Verify review history was added
        expect(reparsed.revlog.has(cardWithoutHistory.id)).toBe(true);
        expect(reparsed.revlog.get(cardWithoutHistory.id)!.length).toBe(1);
      }
    });
  });
  
  describe('Round-Trip with New Deck Creation', () => {
    
    it('should preserve all data when creating a new deck via Deck.create', async () => {
      const original = createComprehensiveCollection();
      const file1 = await collectionToFile(original);
      const parsed = await parseApkgFile(file1);
      
      // Create a new deck using the domain model
      const newDeck = Deck.create('LLMAnki Generated', parsed, {
        description: 'Deck created by LLMAnki',
      });
      
      // Add a card to the new deck
      await newDeck.createCard('Generated Question', 'Generated Answer', {
        type: 'basic',
        tags: ['generated'],
      });
      
      // Export and re-parse
      const file2 = await collectionToFile(parsed);
      const reparsed = await parseApkgFile(file2);
      
      // Verify new deck exists
      const generatedDeck = Array.from(reparsed.decks.values())
        .find(d => d.name === 'LLMAnki Generated');
      
      expect(generatedDeck).toBeDefined();
      expect(generatedDeck!.description).toBe('Deck created by LLMAnki');
      
      // Verify card is in new deck
      const cardsInNewDeck = getCardsInDeck(reparsed, generatedDeck!.id, false);
      expect(cardsInNewDeck.length).toBe(1);
    });
    
    it('should preserve hierarchy when creating nested decks', async () => {
      const original = createComprehensiveCollection();
      const file1 = await collectionToFile(original);
      const parsed = await parseApkgFile(file1);
      
      // Find the root test deck
      const rootDeck = Array.from(parsed.decks.values())
        .find(d => d.name === 'Test Deck');
      
      // Create a subdeck
      Deck.create('LLMAnki Subdeck', parsed, {
        description: 'A subdeck created by LLMAnki',
        parentId: rootDeck!.id,
      });
      
      // Export and re-parse
      const file2 = await collectionToFile(parsed);
      const reparsed = await parseApkgFile(file2);
      
      // Verify subdeck exists with correct name format
      const createdSubdeck = Array.from(reparsed.decks.values())
        .find(d => d.name === 'Test Deck::LLMAnki Subdeck');
      
      expect(createdSubdeck).toBeDefined();
    });
  });
  
  describe('Edge Cases', () => {
    
    it('should handle empty collection', async () => {
      const empty = Deck.createEmptyCollection();
      const file = await collectionToFile(empty);
      const parsed = await parseApkgFile(file);
      
      expect(parsed.cards.size).toBe(0);
      expect(parsed.notes.size).toBe(0);
      // Should have at least default deck
      expect(parsed.decks.size).toBeGreaterThanOrEqual(1);
    });
    
    it('should handle collection with only default deck', async () => {
      const collection: AnkiCollection = {
        decks: new Map([[1, {
          id: 1,
          name: 'Default',
          description: '',
          children: [],
          dyn: 0,
          conf: 1,
        }]]),
        models: new Map([[1, createDefaultModel(1)]]),
        notes: new Map(),
        cards: new Map(),
        revlog: new Map(),
        media: new Map(),
        deckTree: [{
          id: 1,
          name: 'Default',
          description: '',
          children: [],
          dyn: 0,
          conf: 1,
        }],
      };
      
      const file = await collectionToFile(collection);
      const parsed = await parseApkgFile(file);
      
      expect(parsed.decks.size).toBe(1);
      expect(parsed.decks.get(1)!.name).toBe('Default');
    });
    
    it('should handle notes with empty fields', async () => {
      const collection = createComprehensiveCollection();
      
      // Add a note with empty fields
      const emptyNoteId = Date.now();
      const emptyCardId = Date.now() + 1;
      const modelId = Array.from(collection.models.keys())[0];
      const deckId = Array.from(collection.decks.keys())[1];
      
      collection.notes.set(emptyNoteId, {
        id: emptyNoteId,
        modelId: modelId,
        fields: ['', '', ''],
        tags: [],
        guid: `empty-${emptyNoteId}`,
        mod: Math.floor(Date.now() / 1000),
      });
      
      collection.cards.set(emptyCardId, {
        id: emptyCardId,
        noteId: emptyNoteId,
        deckId: deckId,
        ordinal: 0,
        type: 'basic',
        queue: 0,
        due: 1,
        interval: 0,
        factor: 2500,
        reps: 0,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0,
      });
      
      const file = await collectionToFile(collection);
      const parsed = await parseApkgFile(file);
      
      const emptyNote = parsed.notes.get(emptyNoteId);
      expect(emptyNote).toBeDefined();
      expect(emptyNote!.fields).toEqual(['', '', '']);
    });
    
    it('should handle very long field content', async () => {
      const collection = createComprehensiveCollection();
      
      // Add a note with very long content
      const longContent = 'A'.repeat(10000);
      const longNoteId = Date.now();
      const longCardId = Date.now() + 1;
      const modelId = Array.from(collection.models.keys())[0];
      const deckId = Array.from(collection.decks.keys())[1];
      
      collection.notes.set(longNoteId, {
        id: longNoteId,
        modelId: modelId,
        fields: [longContent, 'Short answer', ''],
        tags: ['long-content'],
        guid: `long-${longNoteId}`,
        mod: Math.floor(Date.now() / 1000),
      });
      
      collection.cards.set(longCardId, {
        id: longCardId,
        noteId: longNoteId,
        deckId: deckId,
        ordinal: 0,
        type: 'basic',
        queue: 0,
        due: 1,
        interval: 0,
        factor: 2500,
        reps: 0,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0,
      });
      
      const file = await collectionToFile(collection);
      const parsed = await parseApkgFile(file);
      
      const longNote = parsed.notes.get(longNoteId);
      expect(longNote).toBeDefined();
      expect(longNote!.fields[0].length).toBe(10000);
    });
    
    it('should handle field content with SQL-problematic characters', async () => {
      const collection = createComprehensiveCollection();
      
      // Add a note with SQL-problematic content
      const sqlNoteId = Date.now();
      const sqlCardId = Date.now() + 1;
      const modelId = Array.from(collection.models.keys())[0];
      const deckId = Array.from(collection.decks.keys())[1];
      
      const problematicContent = "What's the answer? It's \"quoted\" and has a semicolon;";
      
      collection.notes.set(sqlNoteId, {
        id: sqlNoteId,
        modelId: modelId,
        fields: [problematicContent, "Answer with 'single' and \"double\" quotes", ''],
        tags: ['sql-test'],
        guid: `sql-${sqlNoteId}`,
        mod: Math.floor(Date.now() / 1000),
      });
      
      collection.cards.set(sqlCardId, {
        id: sqlCardId,
        noteId: sqlNoteId,
        deckId: deckId,
        ordinal: 0,
        type: 'basic',
        queue: 0,
        due: 1,
        interval: 0,
        factor: 2500,
        reps: 0,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0,
      });
      
      const file = await collectionToFile(collection);
      const parsed = await parseApkgFile(file);
      
      const sqlNote = parsed.notes.get(sqlNoteId);
      expect(sqlNote).toBeDefined();
      expect(sqlNote!.fields[0]).toBe(problematicContent);
      expect(sqlNote!.fields[1]).toContain("'single'");
      expect(sqlNote!.fields[1]).toContain('"double"');
    });
    
    it('should handle multiple cards from single note (reversed cards)', async () => {
      const collection = createComprehensiveCollection();
      const file = await collectionToFile(collection);
      const parsed = await parseApkgFile(file);
      
      // Find notes that have multiple cards
      const noteCardCounts = new Map<number, number>();
      for (const card of parsed.cards.values()) {
        const count = noteCardCounts.get(card.noteId) || 0;
        noteCardCounts.set(card.noteId, count + 1);
      }
      
      const multiCardNotes = Array.from(noteCardCounts.entries())
        .filter(([, count]) => count > 1);
      
      // Our test data has a reversed card note with 2 cards
      expect(multiCardNotes.length).toBeGreaterThan(0);
      
      const [noteId, cardCount] = multiCardNotes[0];
      expect(cardCount).toBe(2);
      
      // Verify the cards have different ordinals
      const cardsForNote = Array.from(parsed.cards.values())
        .filter(c => c.noteId === noteId);
      
      const ordinals = cardsForNote.map(c => c.ordinal);
      expect(ordinals).toContain(0);
      expect(ordinals).toContain(1);
    });
  });
  
  describe('Model Type Detection', () => {
    
    it('should correctly identify cloze model type through round-trip', async () => {
      const collection = createComprehensiveCollection();
      const file = await collectionToFile(collection);
      const parsed = await parseApkgFile(file);
      
      // Find the cloze model
      const clozeModel = Array.from(parsed.models.values())
        .find(m => m.name === 'Cloze');
      
      expect(clozeModel).toBeDefined();
      expect(clozeModel!.type).toBe(1); // Cloze type
    });
    
    it('should correctly identify reversed card type through templates', async () => {
      const collection = createComprehensiveCollection();
      const file = await collectionToFile(collection);
      const parsed = await parseApkgFile(file);
      
      // Find the reversed model
      const reversedModel = Array.from(parsed.models.values())
        .find(m => m.name.includes('reversed'));
      
      expect(reversedModel).toBeDefined();
      expect(reversedModel!.templates.length).toBe(2);
      expect(reversedModel!.templates[1].name.toLowerCase()).toContain('reverse');
    });
    
    it('should correctly identify type-in-answer model', async () => {
      const collection = createComprehensiveCollection();
      const file = await collectionToFile(collection);
      const parsed = await parseApkgFile(file);
      
      // Find the type-in model
      const typeModel = Array.from(parsed.models.values())
        .find(m => m.name.includes('type in'));
      
      expect(typeModel).toBeDefined();
      expect(typeModel!.templates[0].questionFormat).toContain('{{type:');
    });
  });
  
  describe('Multiple Round-Trips', () => {
    
    it('should preserve data through 3 consecutive round-trips', async () => {
      const original = createComprehensiveCollection();
      
      // First round-trip
      let file = await collectionToFile(original);
      let parsed = await parseApkgFile(file);
      
      // Second round-trip
      file = await collectionToFile(parsed);
      parsed = await parseApkgFile(file);
      
      // Third round-trip
      file = await collectionToFile(parsed);
      parsed = await parseApkgFile(file);
      
      // Verify data integrity
      assertCollectionsEqual(original, parsed);
    });
    
    it('should preserve modifications through multiple round-trips', async () => {
      const original = createComprehensiveCollection();
      let file = await collectionToFile(original);
      let parsed = await parseApkgFile(file);
      
      // Modification 1: Add a tag
      const firstNoteId = Array.from(parsed.notes.keys())[0];
      parsed.notes.get(firstNoteId)!.tags.push('round-1');
      
      // Round-trip 1
      file = await collectionToFile(parsed);
      parsed = await parseApkgFile(file);
      
      // Modification 2: Add another tag
      parsed.notes.get(firstNoteId)!.tags.push('round-2');
      
      // Round-trip 2
      file = await collectionToFile(parsed);
      parsed = await parseApkgFile(file);
      
      // Modification 3: Add yet another tag
      parsed.notes.get(firstNoteId)!.tags.push('round-3');
      
      // Round-trip 3
      file = await collectionToFile(parsed);
      parsed = await parseApkgFile(file);
      
      // Verify all modifications persisted
      const finalNote = parsed.notes.get(firstNoteId);
      expect(finalNote!.tags).toContain('round-1');
      expect(finalNote!.tags).toContain('round-2');
      expect(finalNote!.tags).toContain('round-3');
    });
  });
});
