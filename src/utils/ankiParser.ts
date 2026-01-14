import JSZip from 'jszip';
import { decompress } from 'fzstd';
import { decode as msgpackDecode } from '@msgpack/msgpack';
import type { AnkiCollection, AnkiDeck, AnkiModel, AnkiNote, AnkiCard, CardType, AnkiField, AnkiTemplate } from '../types';

// Get MIME type from filename extension
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'pdf': 'application/pdf',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Declare global initSqlJs that will be loaded from CDN
declare global {
  interface Window {
    initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
  }
}

interface SqlJsStatic {
  Database: new (data?: ArrayLike<number>) => Database;
}

interface Database {
  exec(sql: string): { columns: string[]; values: unknown[][] }[];
  close(): void;
}

let SQL: SqlJsStatic | null = null;
let sqlJsLoaded = false;

async function loadSqlJs(): Promise<void> {
  if (sqlJsLoaded) return;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sql.js.org/dist/sql-wasm.js';
    script.onload = () => {
      sqlJsLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function getSql(): Promise<SqlJsStatic> {
  if (!SQL) {
    await loadSqlJs();
    SQL = await window.initSqlJs({
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
  
  // Anki uses either '::' or '\x1f' (Unit Separator) as hierarchy delimiter
  const getSeparator = (name: string): string => {
    if (name.includes('\x1f')) return '\x1f';
    if (name.includes('::')) return '::';
    return '::';
  };
  
  // Normalize deck names: convert \x1f to :: for consistent handling
  for (const deck of deckArray) {
    if (deck.name.includes('\x1f')) {
      deck.name = deck.name.split('\x1f').join('::');
    }
  }
  
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
        // Parent doesn't exist as a separate deck - still add to root
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

export async function parseApkgFile(file: File, onProgress?: (progress: string) => void): Promise<AnkiCollection> {
  onProgress?.('Loading SQL.js...');
  const sql = await getSql();
  
  onProgress?.('Extracting archive...');
  const zip = await JSZip.loadAsync(file);
  
  const allFiles = Object.keys(zip.files);
  
  // Extract collection database - try multiple possible locations
  // IMPORTANT: Check anki21b FIRST - newer Anki exports include both anki2 (placeholder) and anki21b (real data)
  let collectionFile = zip.file('collection.anki21b')
    || zip.file('collection.anki21')
    || zip.file('collection.anki2');
  
  // Check for anki21 folder structure (some exports)
  if (!collectionFile) {
    const anki21Folder = zip.folder('anki21');
    if (anki21Folder) {
      collectionFile = anki21Folder.file('collection.anki21b') 
        || anki21Folder.file('collection.anki21')
        || anki21Folder.file('collection.anki2');
    }
  }
  
  if (!collectionFile) {
    throw new Error('Invalid .apkg file: missing collection database. Files found: ' + allFiles.join(', '));
  }
  
  onProgress?.('Reading collection database...');
  let collectionData = await collectionFile.async('arraybuffer');
  let dbData = new Uint8Array(collectionData);
  
  // Check if this is a zstd-compressed file (anki21b)
  // zstd files start with magic bytes 0x28, 0xB5, 0x2F, 0xFD
  if (collectionFile.name.endsWith('.anki21b') || 
      (dbData.length >= 4 && dbData[0] === 0x28 && dbData[1] === 0xB5 && dbData[2] === 0x2F && dbData[3] === 0xFD)) {
    try {
      onProgress?.('Decompressing database...');
      dbData = decompress(dbData);
    } catch (e) {
      console.error('Failed to decompress:', e);
      throw new Error('Failed to decompress Anki database. The file may be corrupted.');
    }
  }
  
  onProgress?.('Parsing database...');
  const db = new sql.Database(dbData);
  
  // Parse media
  onProgress?.('Loading media files...');
  const media = new Map<string, Blob>();
  const allZipFiles = Object.keys(zip.files);
  
  // Check for media manifest file
  const mediaFile = zip.file('media');
  const mediaFolder = zip.folder('media');
  
  if (mediaFile) {
    try {
      // Get raw bytes
      const mediaContent = await mediaFile.async('arraybuffer');
      let mediaBytes = new Uint8Array(mediaContent);
      
      // Check for zstd compression (magic bytes: 28 b5 2f fd)
      if (mediaBytes[0] === 0x28 && mediaBytes[1] === 0xb5 && mediaBytes[2] === 0x2f && mediaBytes[3] === 0xfd) {
        try {
          mediaBytes = decompress(mediaBytes);
        } catch (decompressError) {
          console.error('Failed to decompress media manifest:', decompressError);
        }
      }
      
      // Try to parse as text/JSON first
      const mediaText = new TextDecoder('utf-8', { fatal: false }).decode(mediaBytes);
      
      // Check if it's valid JSON
      if (mediaText.trim().startsWith('{') && mediaText.includes('"')) {
        try {
          const mediaMap = JSON.parse(mediaText) as Record<string, string>;
          
          for (const [index, filename] of Object.entries(mediaMap)) {
            const mediaData = zip.file(index);
            if (mediaData) {
              const arrayBuffer = await mediaData.async('arraybuffer');
              const mimeType = getMimeType(filename);
              const blob = new Blob([arrayBuffer], { type: mimeType });
              media.set(filename, blob);
              // Also store without any leading digits for fuzzy matching
              const cleanFilename = filename.replace(/^\d+/, '');
              if (cleanFilename !== filename) {
                media.set(cleanFilename, blob);
              }
            }
          }
        } catch {
          // JSON parse failed, will try binary parsing
        }
      }
      
      // If JSON didn't work, try to parse the binary format
      if (media.size === 0) {
        const allText = new TextDecoder('utf-8', { fatal: false }).decode(mediaBytes);
        
        // Extract all filenames in order of appearance
        // Match any reasonable filename with common extensions
        const filenameRegex = /([a-zA-Z][\w-]*(?:-[a-f0-9]+)?\.(?:jpg|jpeg|png|gif|svg|webp|mp3|wav|ogg|mp4|webm|pdf|bmp))/gi;
        const filenames: string[] = [];
        let match;
        
        while ((match = filenameRegex.exec(allText)) !== null) {
          const fn = match[1];
          // Only add if not duplicate
          if (!filenames.includes(fn)) {
            filenames.push(fn);
          }
        }
        
        // Map to files 0, 1, 2... in order
        for (let i = 0; i < filenames.length; i++) {
          const mediaData = zip.file(String(i));
          if (mediaData) {
            let arrayBuffer = await mediaData.async('arraybuffer');
            let bytes = new Uint8Array(arrayBuffer);
            
            // Check if media file is zstd compressed (magic bytes: 28 b5 2f fd)
            if (bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
              bytes = decompress(bytes);
              arrayBuffer = bytes.buffer;
            }
            
            const mimeType = getMimeType(filenames[i]);
            const blob = new Blob([bytes], { type: mimeType });
            media.set(filenames[i], blob);
          }
        }
      }
      
      // Last resort: try loading all files with numeric names
      if (media.size === 0) {
        for (let i = 0; i <= 100; i++) {
          const mediaData = zip.file(String(i));
          if (mediaData) {
            const blob = await mediaData.async('blob');
            media.set(String(i), blob);
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse media file:', e);
      // Fallback: just load all numbered files
      for (let i = 0; i <= 60; i++) {
        const mediaData = zip.file(String(i));
        if (mediaData) {
          const blob = await mediaData.async('blob');
          media.set(String(i), blob);
        }
      }
    }
  } else {
    // Try to load media files directly (some exports have them without manifest)
    for (const fileName of allZipFiles) {
      // Media files are typically numeric or have image/audio extensions
      if (/^\d+$/.test(fileName) && !zip.files[fileName].dir) {
        try {
          const mediaData = zip.file(fileName);
          if (mediaData) {
            const blob = await mediaData.async('blob');
            media.set(fileName, blob);
          }
        } catch {
          // Ignore errors for individual files
        }
      }
    }
  }
  
  // Parse collection metadata - handle both old and new Anki formats
  onProgress?.('Parsing deck structure...');
  let models: Map<number, AnkiModel>;
  let decks: Map<number, AnkiDeck>;
  
  // First, let's see what tables exist
  const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const tableNames = tablesResult.length > 0 
    ? tablesResult[0].values.map(row => row[0] as string) 
    : [];
  
  // Check if this is the new schema (has 'notetypes' table) or old (has 'col' with JSON)
  const hasNewSchema = tableNames.includes('notetypes');
  
  if (!hasNewSchema) {
    // Old format - models and decks in col table as JSON strings
    const colResult = db.exec('SELECT models, decks FROM col');
    
    if (colResult.length > 0 && colResult[0].values[0][0]) {
      const modelsJson = colResult[0].values[0][0] as string;
      const decksJson = colResult[0].values[0][1] as string;
      
      models = parseModelsJson(modelsJson);
      decks = parseDecksJson(decksJson);
    } else {
      throw new Error('Invalid collection: could not parse deck metadata');
    }
  } else {
    // New Anki 2.1.50+ format - models and decks are in separate tables
    models = new Map<number, AnkiModel>();
    decks = new Map<number, AnkiDeck>();
    
    // Parse notetypes (models) from new format
    try {
      const notetypesResult = db.exec('SELECT id, name FROM notetypes');
      
      if (notetypesResult.length > 0) {
        for (const row of notetypesResult[0].values) {
          // Handle BigInt by converting to string first, then to number if safe
          const rawId = row[0];
          const idStr = String(rawId);
          const id = Number(idStr);
          const name = row[1] as string;
          
          // Parse fields - use string interpolation carefully for large IDs
          const fieldsResult = db.exec(`SELECT name, ord FROM fields WHERE ntid = ${idStr} ORDER BY ord`);
          const fields: AnkiField[] = fieldsResult.length > 0 
            ? fieldsResult[0].values.map(f => ({ name: f[0] as string, ordinal: Number(f[1]), sticky: false }))
            : [{ name: 'Front', ordinal: 0, sticky: false }, { name: 'Back', ordinal: 1, sticky: false }];
          
          // Parse templates - check which columns exist
          let templatesResult;
          try {
            // Try new format first (qfmt/afmt might be stored differently)
            const templateSchema = db.exec("PRAGMA table_info(templates)");
            const templateCols = templateSchema.length > 0 
              ? templateSchema[0].values.map(row => row[1] as string)
              : [];
            
            if (templateCols.includes('qfmt')) {
              templatesResult = db.exec(`SELECT name, ord, qfmt, afmt FROM templates WHERE ntid = ${idStr} ORDER BY ord`);
            } else if (templateCols.includes('config')) {
              // New format stores templates with config blob - use default templates
              templatesResult = db.exec(`SELECT name, ord FROM templates WHERE ntid = ${idStr} ORDER BY ord`);
            } else {
              templatesResult = { length: 0 } as any;
            }
          } catch (e) {
            console.warn(`Failed to query templates for ${name}:`, e);
            templatesResult = { length: 0 } as any;
          }
          
          const templates: AnkiTemplate[] = templatesResult.length > 0
            ? templatesResult[0].values.map((t: unknown[]) => ({
                name: t[0] as string,
                ordinal: Number(t[1]),
                questionFormat: (t[2] as string) || '{{Front}}',
                answerFormat: (t[3] as string) || '{{FrontSide}}<hr>{{Back}}'
              }))
            : [{ name: 'Card 1', ordinal: 0, questionFormat: '{{Front}}', answerFormat: '{{FrontSide}}<hr>{{Back}}' }];
          
          const isCloze = name.toLowerCase().includes('cloze');
          
          models.set(id, {
            id,
            name,
            type: isCloze ? 1 : 0,
            fields,
            templates,
            css: ''
          });
        }
      }
    } catch (e) {
      console.warn('Error parsing notetypes:', e);
    }
    
    // Parse decks from new format
    try {
      const decksResult = db.exec('SELECT id, name FROM decks');
      
      if (decksResult.length > 0) {
        for (const row of decksResult[0].values) {
          const id = row[0] as number;
          const name = row[1] as string;
          decks.set(id, {
            id,
            name,
            description: '',
            children: []
          });
        }
      }
    } catch (e) {
      console.warn('Error parsing decks:', e);
    }
    
    // If no decks found, create a default one
    if (decks.size === 0) {
      decks.set(1, { id: 1, name: 'Default', description: '', children: [] });
    }
  }
  
  const deckTree = buildDeckTree(decks);
  
  // Parse notes - check which columns exist
  onProgress?.('Parsing notes...');
  const notes = new Map<number, AnkiNote>();
  
  // Get notes table schema to handle both old (mid) and new (ntid) formats
  let notesQuery = 'SELECT id, mid, flds, tags, guid, mod FROM notes';
  try {
    // First try to check schema
    const schemaResult = db.exec("PRAGMA table_info(notes)");
    const columns = schemaResult.length > 0 
      ? schemaResult[0].values.map(row => row[1] as string)
      : [];
    
    // New Anki may use 'ntid' instead of 'mid'
    if (columns.includes('ntid') && !columns.includes('mid')) {
      notesQuery = 'SELECT id, ntid as mid, flds, tags, guid, mod FROM notes';
    }
  } catch (e) {
    console.warn('Could not check notes schema:', e);
  }
  
  const notesResult = db.exec(notesQuery);
  
  if (notesResult.length > 0) {
    for (const row of notesResult[0].values) {
      const noteId = Number(row[0]);
      const modelId = Number(row[1]);
      const flds = row[2] as string;
      notes.set(noteId, {
        id: noteId,
        modelId: modelId,
        fields: flds ? flds.split('\x1f') : [],
        tags: row[3] ? (row[3] as string).split(' ').filter(t => t) : [],
        guid: row[4] as string,
        mod: Number(row[5])
      });
    }
  }
  
  // Parse cards
  onProgress?.('Parsing cards...');
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
  
  onProgress?.('Finalizing...');
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
