/**
 * Deck Domain Model
 * 
 * This module provides the Deck class - the primary interface for managing decks
 * and creating cards. All card creation should go through a Deck instance.
 * 
 * Key responsibilities:
 * - Creating cards within the deck
 * - Creating subdecks
 * - Exporting to .apkg format
 * - Managing deck hierarchy
 */

import type {
  AnkiDeck,
  AnkiModel,
  AnkiNote,
  AnkiCard,
  AnkiCollection,
  CardType,
  CardField,
  SuggestedCard,
} from '../types';
import type { CardStateData, ICard, CardSchedulingData, CardReviewData } from './types';
import { createGeneratedCardData } from './Card';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

// ============================================================================
// Types
// ============================================================================

/** Origin of a deck - whether it was loaded from a file or created in-app */
export type DeckOrigin = 'original' | 'generated';

/** Configuration for creating a new card */
export interface CreateCardOptions {
  /** Card type (basic, cloze, etc.) */
  type?: CardType;
  /** Tags to apply to the card */
  tags?: string[];
  /** Source card for potential metadata inheritance */
  sourceCard?: ICard;
  /** Whether to inherit scheduling metadata from source card */
  inheritMetadata?: boolean;
}

/** Configuration for creating a new deck */
export interface CreateDeckOptions {
  /** Deck description */
  description?: string;
  /** Parent deck ID (for subdecks) */
  parentId?: number;
}

/** Data needed to export a deck */
export interface DeckExportData {
  deck: AnkiDeck;
  notes: AnkiNote[];
  cards: AnkiCard[];
  model: AnkiModel;
  media: Map<string, Blob>;
}

// ============================================================================
// ID Generation
// ============================================================================

let idCounter = 0;

/**
 * Generate a unique ID for new decks, cards, and notes.
 * Uses timestamp + counter to ensure uniqueness even within the same millisecond.
 * When testSeed is set, generates deterministic IDs based on the seed.
 */
let testSeed: number | null = null;

export function generateUniqueId(): number {
  idCounter = (idCounter + 1) % 1000;
  if (testSeed !== null) {
    // In test mode, generate deterministic IDs
    return testSeed + idCounter;
  }
  return Date.now() * 1000 + idCounter;
}

/**
 * Reset the ID counter (for testing purposes)
 * @param seed - Optional seed value for deterministic ID generation in tests
 */
export function resetIdCounter(seed?: number): void {
  idCounter = 0;
  testSeed = seed ?? null;
}

// ============================================================================
// Default Model
// ============================================================================

/** Default LaTeX preamble per Anki specification */
const DEFAULT_LATEX_PRE = '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}';

/** Default LaTeX postamble per Anki specification */
const DEFAULT_LATEX_POST = '\\end{document}';

/**
 * Create a default Basic model for new decks
 */
export function createDefaultModel(modelId: number): AnkiModel {
  return {
    id: modelId,
    name: 'Basic',
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
        answerFormat: '{{FrontSide}}<hr id="answer">{{Back}}',
      },
    ],
    css: '.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }',
    latexPre: DEFAULT_LATEX_PRE,
    latexPost: DEFAULT_LATEX_POST,
    sortField: 0,
    did: null,
  };
}

/**
 * Create a Cloze model for cloze deletions
 */
export function createClozeModel(modelId: number): AnkiModel {
  return {
    id: modelId,
    name: 'Cloze',
    type: 1,
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
    css: '.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; } .cloze { font-weight: bold; color: blue; }',
    latexPre: DEFAULT_LATEX_PRE,
    latexPost: DEFAULT_LATEX_POST,
    sortField: 0,
    did: null,
  };
}

// ============================================================================
// Deck Class
// ============================================================================

/**
 * Represents a deck in the application.
 * 
 * This is the primary interface for deck operations. All card creation
 * should go through a Deck instance.
 * 
 * @example
 * ```ts
 * // Create a new deck
 * const deck = Deck.create('My Deck');
 * 
 * // Add a card to the deck
 * const cardData = await deck.createCard('Front text', 'Back text');
 * 
 * // Create a subdeck
 * const subdeck = deck.createSubdeck('Subdeck Name');
 * 
 * // Export to .apkg
 * const blob = await deck.export(collection);
 * ```
 */
export class Deck {
  private readonly _data: AnkiDeck;
  private readonly _origin: DeckOrigin;
  private readonly _collection: AnkiCollection;

  private constructor(data: AnkiDeck, origin: DeckOrigin, collection: AnkiCollection) {
    this._data = data;
    this._origin = origin;
    this._collection = collection;
  }

  // === Static Factory Methods ===

  /**
   * Create a new deck within a collection.
   * If no collection exists, this will fail - use createEmptyCollection() first.
   */
  /**
   * Helper to find a deck in the deckTree by ID (recursive search)
   */
  private static findInTree(tree: AnkiDeck[], deckId: number): AnkiDeck | null {
    for (const deck of tree) {
      if (deck.id === deckId) return deck;
      const found = Deck.findInTree(deck.children, deckId);
      if (found) return found;
    }
    return null;
  }

  static create(
    name: string,
    collection: AnkiCollection,
    options: CreateDeckOptions = {}
  ): Deck {
    const deckId = generateUniqueId();
    
    // Build full deck name (with parent path if subdeck)
    let fullName = name;
    if (options.parentId) {
      const parentDeck = collection.decks.get(options.parentId);
      if (parentDeck) {
        fullName = `${parentDeck.name}::${name}`;
      }
    }
    
    const deckData: AnkiDeck = {
      id: deckId,
      name: fullName,
      description: options.description || '',
      parentId: options.parentId,
      children: [],
      dyn: 0,   // Regular deck (not filtered)
      conf: 1,  // Default deck config
    };
    
    // Add to collection's decks Map
    collection.decks.set(deckId, deckData);
    
    // Update parent's children array (in both decks Map AND deckTree)
    if (options.parentId) {
      // Update the parent in the decks Map
      const parentInMap = collection.decks.get(options.parentId);
      if (parentInMap) {
        parentInMap.children.push(deckData);
      }
      
      // Also update the parent in the deckTree (might be a different object due to Immer)
      const parentInTree = Deck.findInTree(collection.deckTree, options.parentId);
      if (parentInTree && parentInTree !== parentInMap) {
        parentInTree.children.push(deckData);
      }
    } else {
      // Add to deck tree as top-level
      collection.deckTree.push(deckData);
    }
    
    // Ensure default model exists
    if (collection.models.size === 0) {
      const modelId = generateUniqueId();
      collection.models.set(modelId, createDefaultModel(modelId));
    }
    
    return new Deck(deckData, 'generated', collection);
  }

  /**
   * Wrap an existing AnkiDeck in a Deck instance
   */
  static fromAnkiDeck(ankiDeck: AnkiDeck, collection: AnkiCollection, origin: DeckOrigin = 'original'): Deck {
    return new Deck(ankiDeck, origin, collection);
  }

  /**
   * Create an empty collection (for when no .apkg has been loaded)
   */
  static createEmptyCollection(): AnkiCollection {
    const modelId = generateUniqueId();
    const clozeModelId = generateUniqueId();
    
    return {
      decks: new Map([[1, { id: 1, name: 'Default', description: '', children: [] }]]),
      models: new Map([
        [modelId, createDefaultModel(modelId)],
        [clozeModelId, createClozeModel(clozeModelId)],
      ]),
      notes: new Map(),
      cards: new Map(),
      revlog: new Map(),
      media: new Map(),
      deckTree: [],
    };
  }

  // === Properties ===

  get id(): number {
    return this._data.id;
  }

  get name(): string {
    return this._data.name;
  }

  /** Short name (without parent path) */
  get shortName(): string {
    const parts = this._data.name.split('::');
    return parts[parts.length - 1];
  }

  get description(): string {
    return this._data.description;
  }

  get origin(): DeckOrigin {
    return this._origin;
  }

  get parentId(): number | undefined {
    return this._data.parentId;
  }

  get children(): Deck[] {
    return this._data.children.map(child => Deck.fromAnkiDeck(child, this._collection, this._origin));
  }

  get data(): AnkiDeck {
    return this._data;
  }

  // === Card Creation ===

  /**
   * Create a new card in this deck.
   * This is the primary method for adding cards to a deck.
   * 
   * @param front - Front content of the card
   * @param back - Back content of the card
   * @param options - Additional options
   * @returns Card state data and Anki entities for store integration
   */
  async createCard(
    front: string,
    back: string,
    options: CreateCardOptions = {}
  ): Promise<{
    cardStateData: CardStateData;
    ankiCard: AnkiCard;
    ankiNote: AnkiNote;
  }> {
    const type = options.type || 'basic';
    const fields: CardField[] = [
      { name: 'Front', value: front },
      { name: 'Back', value: back },
    ];
    
    // Create a SuggestedCard structure for compatibility with existing code
    const suggestedCard: SuggestedCard = {
      type,
      fields,
      explanation: '',
    };
    
    return this.createCardFromSuggestion(suggestedCard, options);
  }

  /**
   * Create a card from a SuggestedCard (from LLM analysis)
   */
  async createCardFromSuggestion(
    suggestedCard: SuggestedCard,
    options: CreateCardOptions = {}
  ): Promise<{
    cardStateData: CardStateData;
    ankiCard: AnkiCard;
    ankiNote: AnkiNote;
  }> {
    const now = generateUniqueId();
    const cardId = now;
    const noteId = now + 1;
    
    // Find appropriate model
    let modelId: number | null = null;
    for (const [id, model] of this._collection.models) {
      if (suggestedCard.type === 'cloze' && model.type === 1) {
        modelId = id;
        break;
      } else if (suggestedCard.type !== 'cloze' && model.type === 0) {
        modelId = id;
        break;
      }
    }
    
    if (modelId === null) {
      modelId = this._collection.models.keys().next().value ?? generateUniqueId();
      if (!this._collection.models.has(modelId)) {
        this._collection.models.set(modelId, createDefaultModel(modelId));
      }
    }
    
    const model = this._collection.models.get(modelId)!;
    const tags = options.tags || ['llmanki-generated'];
    
    // Create Anki note
    const ankiNote: AnkiNote = {
      id: noteId,
      modelId,
      fields: suggestedCard.fields.map(f => f.value),
      tags,
      guid: `llmanki-${now}`,
      mod: Math.floor(Date.now() / 1000),
    };
    
    // Create Anki card with optional metadata inheritance
    const sourceScheduling = options.sourceCard?.scheduling;
    const shouldInherit = options.inheritMetadata && sourceScheduling;
    
    const ankiCard: AnkiCard = {
      id: cardId,
      noteId,
      deckId: this._data.id,
      ordinal: 0,
      type: suggestedCard.type,
      queue: shouldInherit ? sourceScheduling.queue : 0,
      due: shouldInherit ? sourceScheduling.due : 0,
      interval: shouldInherit ? sourceScheduling.interval : 0,
      factor: shouldInherit ? sourceScheduling.factor : 2500,
      reps: shouldInherit ? sourceScheduling.reps : 0,
      lapses: shouldInherit ? sourceScheduling.lapses : 0,
      left: 0,
      odue: 0,
      odid: 0,
      flags: 0,
    };
    
    // Add to collection
    this._collection.notes.set(noteId, ankiNote);
    this._collection.cards.set(cardId, ankiCard);
    
    // Create card state data
    const scheduling: CardSchedulingData = {
      queue: ankiCard.queue,
      due: ankiCard.due,
      interval: ankiCard.interval,
      factor: ankiCard.factor,
      reps: ankiCard.reps,
      lapses: ankiCard.lapses,
    };
    
    const reviewData: CardReviewData = options.sourceCard?.reviewData ? {
      ...options.sourceCard.reviewData,
      cardCreated: cardId,
    } : {
      cardCreated: cardId,
      firstReview: null,
      lastReview: null,
      totalTime: 0,
      reviewHistory: [],
    };
    
    const cardStateData = createGeneratedCardData({
      cardId,
      noteId,
      deckId: this._data.id,
      type: suggestedCard.type,
      fields: suggestedCard.fields,
      deckName: this._data.name,
      modelName: model.name,
      css: model.css,
      front: suggestedCard.fields[0]?.value || '',
      back: suggestedCard.fields[1]?.value || '',
      scheduling,
      reviewData,
    });
    
    return { cardStateData, ankiCard, ankiNote };
  }

  // === Subdeck Creation ===

  /**
   * Create a subdeck under this deck
   */
  createSubdeck(name: string, description?: string): Deck {
    return Deck.create(name, this._collection, {
      description,
      parentId: this._data.id,
    });
  }

  // === Deck Management ===

  /**
   * Get the number of cards in this deck
   * @param includeSubdecks - If true, also count cards in all subdecks
   */
  getCardCount(includeSubdecks: boolean = false): number {
    const targetDeckIds = new Set<number>([this._data.id]);
    
    if (includeSubdecks) {
      const addChildren = (deck: AnkiDeck) => {
        for (const child of deck.children) {
          targetDeckIds.add(child.id);
          addChildren(child);
        }
      };
      addChildren(this._data);
    }
    
    let count = 0;
    for (const [, card] of this._collection.cards) {
      if (targetDeckIds.has(card.deckId)) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * Get cards in this deck from a card state map
   * @param cards - Map of card states (from the store)
   * @param includeSubdecks - If true, also include cards from subdecks
   */
  getCards(cards: Map<number, ICard>, includeSubdecks: boolean = false): ICard[] {
    const targetDeckIds = new Set<number>([this._data.id]);
    
    if (includeSubdecks) {
      const addChildren = (deck: AnkiDeck) => {
        for (const child of deck.children) {
          targetDeckIds.add(child.id);
          addChildren(child);
        }
      };
      addChildren(this._data);
    }
    
    const result: ICard[] = [];
    for (const card of cards.values()) {
      if (targetDeckIds.has(card.deckId)) {
        result.push(card);
      }
    }
    
    return result;
  }

  /**
   * Rename this deck
   * @param newName - The new short name (without parent path)
   */
  rename(newName: string): void {
    if (this._data.id === 1) return; // Can't rename default deck
    
    // Build full name with parent path
    let fullName = newName;
    if (this._data.parentId) {
      const parent = this._collection.decks.get(this._data.parentId);
      if (parent) {
        fullName = `${parent.name}::${newName}`;
      }
    }
    
    const oldName = this._data.name;
    this._data.name = fullName;
    
    // Update children's names
    const updateChildNames = (d: AnkiDeck, oldPrefix: string, newPrefix: string) => {
      for (const child of d.children) {
        child.name = child.name.replace(oldPrefix, newPrefix);
        updateChildNames(child, oldPrefix, newPrefix);
      }
    };
    
    updateChildNames(this._data, oldName, fullName);
  }

  /**
   * Move this deck to a new parent
   * @param newParentId - ID of the new parent deck, or null for top-level
   */
  moveTo(newParentId: number | null): void {
    if (this._data.id === 1) return; // Can't move default deck
    
    const oldParentId = this._data.parentId;
    
    // Remove from old parent
    if (oldParentId) {
      const oldParent = this._collection.decks.get(oldParentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter(c => c.id !== this._data.id);
      }
    } else {
      this._collection.deckTree = this._collection.deckTree.filter(d => d.id !== this._data.id);
    }
    
    // Add to new parent
    this._data.parentId = newParentId ?? undefined;
    
    // Update name
    const shortName = this._data.name.split('::').pop() || this._data.name;
    if (newParentId) {
      const newParent = this._collection.decks.get(newParentId);
      if (newParent) {
        this._data.name = `${newParent.name}::${shortName}`;
        newParent.children.push(this._data);
      }
    } else {
      this._data.name = shortName;
      this._collection.deckTree.push(this._data);
    }
    
    // Update children's names recursively
    const updateChildNames = (d: AnkiDeck) => {
      for (const child of d.children) {
        const childShortName = child.name.split('::').pop() || child.name;
        child.name = `${d.name}::${childShortName}`;
        updateChildNames(child);
      }
    };
    
    updateChildNames(this._data);
  }

  /**
   * Delete this deck
   * @param deleteCards - If true, delete cards in this deck; if false, move them to Default deck
   * @param deleteSubdecks - If true, also delete subdecks; if false, promote them to parent level
   */
  delete(deleteCards: boolean = false, deleteSubdecks: boolean = false): void {
    if (this._data.id === 1) return; // Can't delete default deck
    
    // Handle subdecks
    if (deleteSubdecks) {
      // Recursively delete all subdecks
      const deleteRecursive = (d: AnkiDeck) => {
        for (const child of d.children) {
          deleteRecursive(child);
          this._collection.decks.delete(child.id);
        }
      };
      deleteRecursive(this._data);
    } else {
      // Promote subdecks to parent level
      const parentId = this._data.parentId;
      for (const child of this._data.children) {
        child.parentId = parentId;
        // Update name to remove this deck from the path
        if (parentId) {
          const parent = this._collection.decks.get(parentId);
          if (parent) {
            child.name = `${parent.name}::${child.name.split('::').pop()}`;
            parent.children.push(child);
          }
        } else {
          child.name = child.name.split('::').pop() || child.name;
          this._collection.deckTree.push(child);
        }
      }
    }
    
    // Handle cards
    if (deleteCards) {
      // Delete all cards in this deck
      const cardsToDelete: number[] = [];
      const notesToCheck = new Set<number>();
      
      for (const [cardId, card] of this._collection.cards) {
        if (card.deckId === this._data.id) {
          cardsToDelete.push(cardId);
          notesToCheck.add(card.noteId);
        }
      }
      
      for (const cardId of cardsToDelete) {
        this._collection.cards.delete(cardId);
      }
      
      // Delete orphaned notes
      for (const noteId of notesToCheck) {
        let hasCards = false;
        for (const card of this._collection.cards.values()) {
          if (card.noteId === noteId) {
            hasCards = true;
            break;
          }
        }
        if (!hasCards) {
          this._collection.notes.delete(noteId);
        }
      }
    } else {
      // Move cards to default deck
      for (const [, card] of this._collection.cards) {
        if (card.deckId === this._data.id) {
          card.deckId = 1;
        }
      }
    }
    
    // Remove from parent's children
    if (this._data.parentId) {
      const parent = this._collection.decks.get(this._data.parentId);
      if (parent) {
        parent.children = parent.children.filter(c => c.id !== this._data.id);
      }
    } else {
      // Remove from deck tree
      this._collection.deckTree = this._collection.deckTree.filter(d => d.id !== this._data.id);
    }
    
    // Finally, remove the deck itself
    this._collection.decks.delete(this._data.id);
  }

  // === Export ===

  /**
   * Export this deck (and optionally its subdecks) to an .apkg file
   */
  async export(includeSubdecks: boolean = true): Promise<Blob> {
    // Dynamically import to avoid bundling these in the main app if not needed
    const [sqlModule, JSZip] = await Promise.all([
      import('sql.js/dist/sql-wasm.js'),
      import('jszip').then(m => m.default),
    ]);

    const initSqlJs = (sqlModule.default ?? sqlModule) as
      | ((config?: { locateFile?: (file: string) => string }) => Promise<{ Database: new () => { export: () => Uint8Array; close: () => void } }>)
      | undefined;
    if (typeof initSqlJs !== 'function') {
      throw new Error('sql.js initSqlJs export not found');
    }

    const SQL = await initSqlJs({
      locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file)
    });
    const db = new SQL.Database();
    
    // Collect all deck IDs to export
    const deckIds = new Set<number>([this._data.id]);
    if (includeSubdecks) {
      const addChildren = (deck: AnkiDeck) => {
        for (const child of deck.children) {
          deckIds.add(child.id);
          addChildren(child);
        }
      };
      addChildren(this._data);
    }
    
    // Collect cards and notes for these decks
    const cardsToExport: AnkiCard[] = [];
    const noteIds = new Set<number>();
    
    for (const [, card] of this._collection.cards) {
      if (deckIds.has(card.deckId)) {
        cardsToExport.push(card);
        noteIds.add(card.noteId);
      }
    }
    
    const notesToExport: AnkiNote[] = [];
    for (const noteId of noteIds) {
      const note = this._collection.notes.get(noteId);
      if (note) {
        notesToExport.push(note);
      }
    }
    
    // Create schema and insert data
    this.createAnkiSchema(db);
    this.insertCollectionMetadata(db, deckIds);
    this.insertNotes(db, notesToExport);
    this.insertCards(db, cardsToExport);
    
    // Export database
    const dbBinary = db.export();
    db.close();
    
    // Create zip
    const zip = new JSZip();
    zip.file('collection.anki21', dbBinary);
    zip.file('media', '{}'); // TODO: Handle media files
    
    return zip.generateAsync({ type: 'blob' });
  }

  private createAnkiSchema(db: any): void {
    db.run(`
      CREATE TABLE col (
        id INTEGER PRIMARY KEY,
        crt INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        scm INTEGER NOT NULL,
        ver INTEGER NOT NULL,
        dty INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        ls INTEGER NOT NULL,
        conf TEXT NOT NULL,
        models TEXT NOT NULL,
        decks TEXT NOT NULL,
        dconf TEXT NOT NULL,
        tags TEXT NOT NULL
      )
    `);
    
    db.run(`
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY,
        guid TEXT NOT NULL,
        mid INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        tags TEXT NOT NULL,
        flds TEXT NOT NULL,
        sfld TEXT NOT NULL,
        csum INTEGER NOT NULL,
        flags INTEGER NOT NULL,
        data TEXT NOT NULL
      )
    `);
    
    db.run(`
      CREATE TABLE cards (
        id INTEGER PRIMARY KEY,
        nid INTEGER NOT NULL,
        did INTEGER NOT NULL,
        ord INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        type INTEGER NOT NULL,
        queue INTEGER NOT NULL,
        due INTEGER NOT NULL,
        ivl INTEGER NOT NULL,
        factor INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        lapses INTEGER NOT NULL,
        left INTEGER NOT NULL,
        odue INTEGER NOT NULL,
        odid INTEGER NOT NULL,
        flags INTEGER NOT NULL,
        data TEXT NOT NULL
      )
    `);
    
    db.run(`
      CREATE TABLE revlog (
        id INTEGER PRIMARY KEY,
        cid INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        ease INTEGER NOT NULL,
        ivl INTEGER NOT NULL,
        lastIvl INTEGER NOT NULL,
        factor INTEGER NOT NULL,
        time INTEGER NOT NULL,
        type INTEGER NOT NULL
      )
    `);
    
    db.run(`
      CREATE TABLE graves (
        usn INTEGER NOT NULL,
        oid INTEGER NOT NULL,
        type INTEGER NOT NULL
      )
    `);
  }

  private insertCollectionMetadata(db: any, deckIds: Set<number>): void {
    const now = Math.floor(Date.now() / 1000);
    
    // Build models JSON
    const modelsObj: Record<string, any> = {};
    for (const [id, model] of this._collection.models) {
      modelsObj[id] = {
        id: model.id,
        name: model.name,
        type: model.type,
        mod: now,
        usn: -1,
        sortf: 0,
        did: this._data.id,
        tmpls: model.templates.map(t => ({
          name: t.name,
          qfmt: t.questionFormat,
          afmt: t.answerFormat,
          ord: t.ordinal,
          did: null,
          bqfmt: '',
          bafmt: '',
        })),
        flds: model.fields.map(f => ({
          name: f.name,
          ord: f.ordinal,
          sticky: f.sticky,
          rtl: false,
          font: 'Arial',
          size: 20,
          media: [],
        })),
        css: model.css,
        latexPre: '',
        latexPost: '',
        latexsvg: false,
        req: [[0, 'all', [0]]],
        tags: [],
        vers: [],
      };
    }
    
    // Build decks JSON
    const decksObj: Record<string, any> = {
      '1': {
        id: 1,
        name: 'Default',
        desc: '',
        mod: now,
        usn: -1,
        lrnToday: [0, 0],
        revToday: [0, 0],
        newToday: [0, 0],
        timeToday: [0, 0],
        collapsed: false,
        browserCollapsed: false,
        extendNew: 0,
        extendRev: 0,
      },
    };
    
    for (const deckId of deckIds) {
      const deck = this._collection.decks.get(deckId);
      if (deck) {
        decksObj[deckId] = {
          id: deck.id,
          name: deck.name,
          desc: deck.description,
          mod: now,
          usn: -1,
          lrnToday: [0, 0],
          revToday: [0, 0],
          newToday: [0, 0],
          timeToday: [0, 0],
          collapsed: false,
          browserCollapsed: false,
          extendNew: 0,
          extendRev: 0,
        };
      }
    }
    
    // Deck config
    const dconfJson = JSON.stringify({
      '1': {
        id: 1,
        name: 'Default',
        new: { delays: [1, 10], ints: [1, 4, 0], initialFactor: 2500, order: 1, perDay: 20 },
        rev: { perDay: 200, ease4: 1.3, ivlFct: 1, maxIvl: 36500, fuzz: 0.05 },
        lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 0 },
        maxTaken: 60,
        timer: 0,
        autoplay: true,
        replayq: true,
        mod: now,
        usn: -1,
      },
    });
    
    // Conf
    const confJson = JSON.stringify({
      activeDecks: [1],
      curDeck: this._data.id,
      newSpread: 0,
      collapseTime: 1200,
      timeLim: 0,
      estTimes: true,
      dueCounts: true,
      curModel: this._collection.models.keys().next().value,
      nextPos: 1,
      sortType: 'noteFld',
      sortBackwards: false,
      addToCur: true,
    });
    
    db.run(
      `INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, now - 86400, now * 1000, now * 1000, 11, 0, 0, 0, confJson, JSON.stringify(modelsObj), JSON.stringify(decksObj), dconfJson, '{}']
    );
  }

  private insertNotes(db: any, notes: AnkiNote[]): void {
    for (const note of notes) {
      const fields = note.fields.join('\x1f');
      const tags = note.tags.join(' ');
      
      db.run(
        `INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [note.id, note.guid, note.modelId, note.mod, -1, tags, fields, note.fields[0] || '', 0, 0, '']
      );
    }
  }

  private insertCards(db: any, cards: AnkiCard[]): void {
    for (const card of cards) {
      const typeNum = card.type === 'cloze' ? 1 : 0;
      
      db.run(
        `INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [card.id, card.noteId, card.deckId, card.ordinal, Math.floor(Date.now() / 1000), -1, typeNum, card.queue, card.due, card.interval, card.factor, card.reps, card.lapses, 0, 0, 0, 0, '']
      );
    }
  }
}
