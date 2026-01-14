import JSZip from 'jszip';
import initSqlJs, { Database } from 'sql.js';
import type { AnkiCollection, AnkiDeck, AnkiModel, AnkiNote, AnkiCard, CardType } from '../types';

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function getSql() {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`
    });
  }
  return SQL;
}

function parseDecksJson(decksJson: string): Map<number, AnkiDeck> {
  const decks = new Map<number, AnkiDeck>();
  const parsed = JSON.parse(decksJson);
  
  for (const [id, deck] of Object.entries(parsed)) {
    const deckData = deck as { name: string; desc?: string };
    decks.set(Number(id), {
      id: Number(id),
      name: deckData.name,
      description: deckData.desc || '',
      children: []
    });
  }
  
  return decks;
}

function parseModelsJson(modelsJson: string): Map<number, AnkiModel> {
  const models = new Map<number, AnkiModel>();
  const parsed = JSON.parse(modelsJson);
  
  for (const [id, model] of Object.entries(parsed)) {
    const modelData = model as {
      name: string;
      type: number;
      flds: { name: string; ord: number; sticky: boolean }[];
      tmpls: { name: string; ord: number; qfmt: string; afmt: string }[];
      css: string;
    };
    
    models.set(Number(id), {
      id: Number(id),
      name: modelData.name,
      type: modelData.type,
      fields: modelData.flds.map(f => ({
        name: f.name,
        ordinal: f.ord,
        sticky: f.sticky
      })),
      templates: modelData.tmpls.map(t => ({
        name: t.name,
        ordinal: t.ord,
        questionFormat: t.qfmt,
        answerFormat: t.afmt
      })),
      css: modelData.css
    });
  }
  
  return models;
}

function buildDeckTree(decks: Map<number, AnkiDeck>): AnkiDeck[] {
  const deckArray = Array.from(decks.values());
  const rootDecks: AnkiDeck[] = [];
  
  // Sort by name to process parent decks first
  deckArray.sort((a, b) => a.name.localeCompare(b.name));
  
  for (const deck of deckArray) {
    const parts = deck.name.split('::');
    if (parts.length === 1) {
      // Root deck
      rootDecks.push(deck);
    } else {
      // Find parent
      const parentName = parts.slice(0, -1).join('::');
      const parent = deckArray.find(d => d.name === parentName);
      if (parent) {
        deck.parentId = parent.id;
        parent.children.push(deck);
      } else {
        rootDecks.push(deck);
      }
    }
  }
  
  return rootDecks;
}

function determineCardType(model: AnkiModel): CardType {
  if (model.type === 1) {
    return 'cloze';
  }
  
  const name = model.name.toLowerCase();
  if (name.includes('reversed') && name.includes('optional')) {
    return 'basic-optional-reversed';
  }
  if (name.includes('reversed')) {
    return 'basic-reversed';
  }
  if (name.includes('type')) {
    return 'basic-type';
  }
  
  return 'basic';
}

export async function parseApkgFile(file: File): Promise<AnkiCollection> {
  const sql = await getSql();
  const zip = await JSZip.loadAsync(file);
  
  // Extract collection.anki2 (SQLite database)
  const collectionFile = zip.file('collection.anki2') || zip.file('collection.anki21');
  if (!collectionFile) {
    throw new Error('Invalid .apkg file: missing collection database');
  }
  
  const collectionData = await collectionFile.async('arraybuffer');
  const db = new sql.Database(new Uint8Array(collectionData));
  
  // Parse media
  const media = new Map<string, Blob>();
  const mediaFile = zip.file('media');
  if (mediaFile) {
    const mediaJson = await mediaFile.async('text');
    const mediaMap = JSON.parse(mediaJson) as Record<string, string>;
    
    for (const [index, filename] of Object.entries(mediaMap)) {
      const mediaData = zip.file(index);
      if (mediaData) {
        const blob = await mediaData.async('blob');
        media.set(filename, blob);
      }
    }
  }
  
  // Parse collection metadata
  const colResult = db.exec('SELECT models, decks FROM col')[0];
  if (!colResult) {
    throw new Error('Invalid collection: missing col table');
  }
  
  const modelsJson = colResult.values[0][0] as string;
  const decksJson = colResult.values[0][1] as string;
  
  const models = parseModelsJson(modelsJson);
  const decks = parseDecksJson(decksJson);
  const deckTree = buildDeckTree(decks);
  
  // Parse notes
  const notes = new Map<number, AnkiNote>();
  const notesResult = db.exec('SELECT id, mid, flds, tags, guid, mod FROM notes');
  if (notesResult.length > 0) {
    for (const row of notesResult[0].values) {
      const noteId = row[0] as number;
      notes.set(noteId, {
        id: noteId,
        modelId: row[1] as number,
        fields: (row[2] as string).split('\x1f'),
        tags: (row[3] as string).split(' ').filter(t => t),
        guid: row[4] as string,
        mod: row[5] as number
      });
    }
  }
  
  // Parse cards
  const cards = new Map<number, AnkiCard>();
  const cardsResult = db.exec('SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards');
  if (cardsResult.length > 0) {
    for (const row of cardsResult[0].values) {
      const cardId = row[0] as number;
      const noteId = row[1] as number;
      const note = notes.get(noteId);
      const model = note ? models.get(note.modelId) : undefined;
      
      cards.set(cardId, {
        id: cardId,
        noteId: noteId,
        deckId: row[2] as number,
        ordinal: row[3] as number,
        type: model ? determineCardType(model) : 'basic',
        queue: row[4] as number,
        due: row[5] as number,
        interval: row[6] as number,
        factor: row[7] as number,
        reps: row[8] as number,
        lapses: row[9] as number
      });
    }
  }
  
  db.close();
  
  return {
    decks,
    models,
    notes,
    cards,
    media,
    deckTree
  };
}

export function exportCollection(collection: AnkiCollection): Promise<Blob> {
  // This would rebuild the .apkg file
  // For now, we'll implement a simplified version
  return new Promise(async (resolve) => {
    const zip = new JSZip();
    
    // Create a simple media.json
    const mediaJson: Record<string, string> = {};
    let mediaIndex = 0;
    for (const [filename, blob] of collection.media) {
      mediaJson[mediaIndex.toString()] = filename;
      zip.file(mediaIndex.toString(), blob);
      mediaIndex++;
    }
    zip.file('media', JSON.stringify(mediaJson));
    
    // For a full implementation, we would need to rebuild the SQLite database
    // This is complex and would require sql.js to create/modify the database
    // For now, we'll just export the structure
    
    const blob = await zip.generateAsync({ type: 'blob' });
    resolve(blob);
  });
}

export function getCardsInDeck(collection: AnkiCollection, deckId: number, includeSubdecks: boolean = true): AnkiCard[] {
  const targetDeckIds = new Set<number>([deckId]);
  
  if (includeSubdecks) {
    const deck = collection.decks.get(deckId);
    if (deck) {
      const addChildren = (d: AnkiDeck) => {
        for (const child of d.children) {
          targetDeckIds.add(child.id);
          addChildren(child);
        }
      };
      addChildren(deck);
    }
  }
  
  return Array.from(collection.cards.values()).filter(card => targetDeckIds.has(card.deckId));
}

export function getDeckPath(collection: AnkiCollection, deckId: number): string {
  const deck = collection.decks.get(deckId);
  return deck?.name || 'Unknown Deck';
}
