import JSZip from 'jszip';
import { decompress } from 'fzstd';
import type { AnkiCollection, AnkiDeck, AnkiModel, AnkiNote, AnkiCard, CardType, AnkiField, AnkiTemplate, ReviewLogEntry } from '../types';

// ============================================================================
// Constants from Anki database schema documentation
// ============================================================================

/** Field separator character (0x1f = 31) used in notes.flds column */
const FIELD_SEPARATOR = '\x1f';

/** Model types from col.models JSON */
const MODEL_TYPE = {
  STANDARD: 0,
  CLOZE: 1
} as const;

/** Card types from cards.type column */
const CARD_TYPE = {
  NEW: 0,
  LEARNING: 1,
  REVIEW: 2,
  RELEARNING: 3
};

/** Card queue states from cards.queue column */
const CARD_QUEUE = {
  USER_BURIED: -3,      // Scheduler 2+
  SCHED_BURIED: -2,     // Scheduler 2+ (or just "buried" in Scheduler 1)
  SUSPENDED: -1,
  NEW: 0,
  LEARNING: 1,
  REVIEW: 2,
  DAY_LEARN_RELEARN: 3, // In learning, next review >= 1 day
  PREVIEW: 4
} as const;

/** Review log types from revlog.type column - reserved for future use */
const _REVLOG_TYPE = {
  LEARN: 0,
  REVIEW: 1,
  RELEARN: 2,
  FILTERED: 3,
  MANUAL: 4,
  RESCHEDULED: 5
} as const;
// Suppress unused variable warning - kept for documentation
void _REVLOG_TYPE;

/** Deck configuration defaults */
const DECK_DEFAULTS = {
  DEFAULT_DECK_ID: 1,
  DEFAULT_CONF_ID: 1
} as const;

/**
 * Calculate checksum per Anki specification:
 * Integer representation of first 8 digits of SHA-1 hash of the first field.
 * This is used for duplicate checking in Anki.
 * Note: This async version uses Web Crypto API - prefer _calculateFieldChecksumSync for export.
 * Reserved for future use when async checksum is needed.
 */
async function _calculateFieldChecksum(fieldValue: string): Promise<number> {
  // Encode the string to UTF-8 bytes
  const encoder = new TextEncoder();
  const data = encoder.encode(fieldValue);
  
  // Calculate SHA-1 hash using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Convert first 4 bytes to hex string (8 hex digits)
  let hexString = '';
  for (let i = 0; i < 4; i++) {
    hexString += hashArray[i].toString(16).padStart(2, '0');
  }
  
  // Parse as integer
  return parseInt(hexString, 16);
}
// Suppress unused variable warning - reserved for future async checksum needs
void _calculateFieldChecksum;

/**
 * Synchronous fallback checksum calculation using a simple hash.
 * Used when Web Crypto API is not available.
 */
function calculateFieldChecksumSync(fieldValue: string): number {
  // Simple djb2-style hash as fallback
  let hash = 5381;
  for (let i = 0; i < fieldValue.length; i++) {
    hash = ((hash << 5) + hash) + fieldValue.charCodeAt(i);
    hash = hash >>> 0; // Convert to unsigned 32-bit integer
  }
  return hash;
}

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
  run(sql: string): void;
  export(): Uint8Array;
  close(): void;
}

let SQL: SqlJsStatic | null = null;
let sqlJsLoaded = false;

/**
 * Check if we should use the npm sql.js package (Node.js/test environment) vs browser CDN
 * In jsdom test environment, window exists but we still need to use npm package
 */
function shouldUseNpmSqlJs(): boolean {
  // If no window, definitely use npm
  if (typeof window === 'undefined') return true;
  
  // If no document, use npm
  if (typeof document === 'undefined') return true;
  
  // If window.initSqlJs already exists (browser loaded script), use browser version
  if (typeof window.initSqlJs === 'function') return false;
  
  // Check if we're in a test environment (vitest/jest with jsdom)
  // In jsdom, scripts don't actually execute, so we need to use npm package
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return true;
  if (typeof process !== 'undefined' && process.env?.VITEST) return true;
  
  // Otherwise, try browser approach
  return false;
}

async function loadSqlJs(): Promise<void> {
  if (sqlJsLoaded) return;
  
  if (shouldUseNpmSqlJs()) {
    // In Node.js/test environment, sql.js is loaded via import in getSql()
    sqlJsLoaded = true;
    return;
  }
  
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
    
    if (shouldUseNpmSqlJs()) {
      // In Node.js/test environment, use the npm package directly
      const initSqlJs = (await import('sql.js')).default;
      SQL = await initSqlJs();
    } else {
      SQL = await window.initSqlJs({
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`
      });
    }
  }
  return SQL;
}

function parseDecksJson(decksJson: string): Map<number, AnkiDeck> {
  const decks = new Map<number, AnkiDeck>();
  const parsed = JSON.parse(decksJson);
  
  for (const [id, deck] of Object.entries(parsed)) {
    const deckData = deck as { 
      name: string; 
      desc?: string; 
      dyn?: number;
      conf?: number;
    };
    decks.set(Number(id), {
      id: Number(id),
      name: deckData.name,
      description: deckData.desc || '',
      children: [],
      dyn: deckData.dyn,
      conf: deckData.conf
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
      latexPre?: string;
      latexPost?: string;
      sortf?: number;
      did?: number | null;
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
      css: modelData.css,
      latexPre: modelData.latexPre || '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}',
      latexPost: modelData.latexPost || '\\end{document}',
      sortField: modelData.sortf ?? 0,
      did: modelData.did ?? null
    });
  }
  
  return models;
}

/** Deck name separator used in hierarchical deck names (e.g., "Parent::Child") */
const DECK_NAME_SEPARATOR = '::';

function buildDeckTree(decks: Map<number, AnkiDeck>): AnkiDeck[] {
  const deckArray = Array.from(decks.values());
  const rootDecks: AnkiDeck[] = [];
  
  // Normalize deck names: convert \x1f to :: for consistent handling
  // (Some older Anki versions used field separator in deck names)
  for (const deck of deckArray) {
    if (deck.name.includes(FIELD_SEPARATOR)) {
      deck.name = deck.name.split(FIELD_SEPARATOR).join(DECK_NAME_SEPARATOR);
    }
  }
  
  // Sort by name to process parent decks first
  deckArray.sort((a, b) => a.name.localeCompare(b.name));
  
  for (const deck of deckArray) {
    const parts = deck.name.split(DECK_NAME_SEPARATOR);
    if (parts.length === 1) {
      // Root deck
      rootDecks.push(deck);
    } else {
      // Find parent
      const parentName = parts.slice(0, -1).join(DECK_NAME_SEPARATOR);
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

/**
 * Determines the card type based on the model definition.
 * Uses the model's type field (0=standard, 1=cloze) as primary indicator,
 * then falls back to template analysis for subtypes.
 */
function determineCardType(model: AnkiModel): CardType {
  // Use the authoritative model.type field per Anki documentation
  if (model.type === MODEL_TYPE.CLOZE) {
    return 'cloze';
  }
  
  // For standard models, analyze templates to determine subtype
  // Check if any template contains type-in-answer format
  const hasTypeAnswer = model.templates.some(t => 
    t.questionFormat.includes('{{type:') || t.answerFormat.includes('{{type:')
  );
  if (hasTypeAnswer) {
    return 'basic-type';
  }
  
  // Check for reversed cards by examining template names and structure
  // Standard reversed cards typically have multiple templates
  if (model.templates.length > 1) {
    const templateNames = model.templates.map(t => t.name.toLowerCase());
    const hasReversedTemplate = templateNames.some(name => 
      name.includes('reverse') || name.includes('card 2')
    );
    
    if (hasReversedTemplate) {
      // Check if it's "optional reversed" by examining model name
      const modelName = model.name.toLowerCase();
      if (modelName.includes('optional')) {
        return 'basic-optional-reversed';
      }
      return 'basic-reversed';
    }
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
          
          // Determine model type - check name for cloze indicator
          const isCloze = name.toLowerCase().includes('cloze');
          
          models.set(id, {
            id,
            name,
            type: isCloze ? MODEL_TYPE.CLOZE : MODEL_TYPE.STANDARD,
            fields,
            templates,
            css: '',
            latexPre: '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}',
            latexPost: '\\end{document}',
            sortField: 0,
            did: null
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
        fields: flds ? flds.split(FIELD_SEPARATOR) : [],
        tags: row[3] ? (row[3] as string).split(' ').filter(t => t) : [],
        guid: row[4] as string,
        mod: Number(row[5])
      });
    }
  }
  
  // Parse cards - include all fields per Anki database schema
  onProgress?.('Parsing cards...');
  const cards = new Map<number, AnkiCard>();
  const cardsResult = db.exec('SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags FROM cards');
  
  if (cardsResult.length > 0) {
    for (const row of cardsResult[0].values) {
      const cardId = row[0] as number;
      const noteId = row[1] as number;
      const note = notes.get(noteId);
      const model = note ? models.get(note.modelId) : undefined;
      
      // Column indices from SELECT: id(0), nid(1), did(2), ord(3), type(4), queue(5), due(6), ivl(7), factor(8), reps(9), lapses(10), left(11), odue(12), odid(13), flags(14)
      cards.set(cardId, {
        id: cardId,
        noteId: noteId,
        deckId: row[2] as number,
        ordinal: row[3] as number,
        type: model ? determineCardType(model) : 'basic',
        queue: row[5] as number,
        due: row[6] as number,
        interval: row[7] as number,
        factor: row[8] as number,
        reps: row[9] as number,
        lapses: row[10] as number,
        left: row[11] as number,
        odue: row[12] as number,
        odid: row[13] as number,
        flags: row[14] as number
      });
    }
  }
  
  // Parse review log (revlog table)
  onProgress?.('Parsing review history...');
  const revlog = new Map<number, ReviewLogEntry[]>();
  
  try {
    const revlogResult = db.exec('SELECT id, cid, ease, ivl, lastIvl, factor, time, type FROM revlog ORDER BY id ASC');
    
    if (revlogResult.length > 0) {
      for (const row of revlogResult[0].values) {
        const reviewId = row[0] as number;
        const cardId = row[1] as number;
        
        const entry: ReviewLogEntry = {
          id: reviewId,
          cardId: cardId,
          ease: row[2] as number,
          interval: row[3] as number,
          lastInterval: row[4] as number,
          factor: row[5] as number,
          time: row[6] as number,
          type: row[7] as number
        };
        
        if (!revlog.has(cardId)) {
          revlog.set(cardId, []);
        }
        revlog.get(cardId)!.push(entry);
      }
    }
  } catch (e) {
    console.warn('Could not parse revlog table:', e);
  }
  
  onProgress?.('Finalizing...');
  db.close();
  
  return {
    decks,
    models,
    notes,
    cards,
    revlog,
    media,
    deckTree
  };
}

export async function exportCollection(collection: AnkiCollection, excludeCardIds?: Set<number>): Promise<Blob> {
  // Create a proper .apkg file with SQLite database
  const sql = await getSql();
  const db = new sql.Database();
  
  // Create the schema (Anki 2.1.x format)
  db.exec(`
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
    );
    
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
    );
    
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
    );
    
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
    );
    
    CREATE TABLE graves (
      usn INTEGER NOT NULL,
      oid INTEGER NOT NULL,
      type INTEGER NOT NULL
    );
    
    CREATE INDEX ix_notes_usn ON notes (usn);
    CREATE INDEX ix_notes_csum ON notes (csum);
    CREATE INDEX ix_cards_usn ON cards (usn);
    CREATE INDEX ix_cards_nid ON cards (nid);
    CREATE INDEX ix_cards_sched ON cards (did, queue, due);
    CREATE INDEX ix_revlog_usn ON revlog (usn);
    CREATE INDEX ix_revlog_cid ON revlog (cid);
  `);
  
  const now = Math.floor(Date.now() / 1000);
  
  // Build models JSON with full field support per Anki schema
  const modelsObj: Record<string, any> = {};
  for (const [id, model] of collection.models) {
    modelsObj[id.toString()] = {
      id: id,
      name: model.name,
      type: model.type,
      mod: now,
      usn: -1,
      sortf: model.sortField ?? 0,
      did: model.did ?? null,
      tmpls: model.templates.map(t => ({
        name: t.name,
        ord: t.ordinal,
        qfmt: t.questionFormat,
        afmt: t.answerFormat,
        bqfmt: '',
        bafmt: '',
        did: null,
        bfont: '',
        bsize: 0
      })),
      flds: model.fields.map(f => ({
        name: f.name,
        ord: f.ordinal,
        sticky: f.sticky,
        rtl: false,
        font: 'Arial',
        size: 20,
        media: []
      })),
      css: model.css || '',
      latexPre: model.latexPre || '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}',
      latexPost: model.latexPost || '\\end{document}',
      latexsvg: false,
      req: [[0, 'any', [0]]]
    };
  }
  
  // Build decks JSON with full field support per Anki schema
  const decksObj: Record<string, any> = {};
  for (const [id, deck] of collection.decks) {
    const deckObj: Record<string, any> = {
      id: id,
      name: deck.name,
      desc: deck.description || '',
      mod: now,
      usn: -1,
      lrnToday: [0, 0],
      revToday: [0, 0],
      newToday: [0, 0],
      timeToday: [0, 0],
      collapsed: false,
      browserCollapsed: false,
      extendNew: 10,
      extendRev: 50
    };
    
    // Include dyn and conf fields per schema
    if (deck.dyn !== undefined) {
      deckObj.dyn = deck.dyn;
    } else {
      deckObj.dyn = 0; // Regular deck by default
    }
    
    // Only include conf for non-dynamic decks
    if (!deck.dyn) {
      deckObj.conf = deck.conf ?? DECK_DEFAULTS.DEFAULT_CONF_ID;
    }
    
    decksObj[id.toString()] = deckObj;
  }
  
  // Insert collection row
  db.exec(`
    INSERT INTO col VALUES (
      1,
      ${Math.floor(Date.now() / 1000) - 86400},
      ${now},
      ${now * 1000},
      11,
      0,
      -1,
      0,
      '{}',
      '${JSON.stringify(modelsObj).replace(/'/g, "''")}',
      '${JSON.stringify(decksObj).replace(/'/g, "''")}',
      '{"1":{"id":1,"mod":0,"name":"Default","usn":0,"maxTaken":60,"autoplay":true,"timer":0,"replayq":true,"new":{"bury":false,"delays":[1,10],"initialFactor":2500,"ints":[1,4,0],"order":1,"perDay":20},"rev":{"bury":false,"ease4":1.3,"ivlFct":1,"maxIvl":36500,"perDay":200,"hardFactor":1.2},"lapse":{"delays":[10],"leechAction":1,"leechFails":8,"minInt":1,"mult":0}}}',
      '{}'
    )
  `);
  
  // Filter cards if excludeCardIds is provided
  const cardsToExport = excludeCardIds
    ? Array.from(collection.cards.values()).filter(c => !excludeCardIds.has(c.id))
    : Array.from(collection.cards.values());
  
  // Get the set of note IDs that are still needed
  const neededNoteIds = new Set(cardsToExport.map(c => c.noteId));
  
  // Insert notes with proper field handling per Anki schema
  for (const [id, note] of collection.notes) {
    if (!neededNoteIds.has(id)) continue;
    
    // Join fields with 0x1f separator per Anki schema
    const flds = note.fields.join(FIELD_SEPARATOR);
    const sfld = note.fields[0] || '';
    // Tags are space-separated with leading/trailing spaces for LIKE queries
    const tags = note.tags.length > 0 ? ` ${note.tags.join(' ')} ` : '';
    
    // Calculate checksum per Anki spec (synchronous version for export)
    const csum = calculateFieldChecksumSync(sfld);
    
    db.exec(`
      INSERT INTO notes VALUES (
        ${id},
        '${note.guid.replace(/'/g, "''")}',
        ${note.modelId},
        ${note.mod},
        -1,
        '${tags.replace(/'/g, "''")}',
        '${flds.replace(/'/g, "''")}',
        '${sfld.replace(/'/g, "''")}',
        ${csum},
        0,
        ''
      )
    `);
  }
  
  // Insert cards with all fields per Anki schema
  for (const card of cardsToExport) {
    // Determine Anki type field based on card state
    let ankiType = CARD_TYPE.NEW;
    if (card.queue === CARD_QUEUE.LEARNING || card.queue === CARD_QUEUE.DAY_LEARN_RELEARN) {
      ankiType = CARD_TYPE.LEARNING;
    } else if (card.queue === CARD_QUEUE.REVIEW || card.interval > 0) {
      ankiType = CARD_TYPE.REVIEW;
    }
    
    db.exec(`
      INSERT INTO cards VALUES (
        ${card.id},
        ${card.noteId},
        ${card.deckId},
        ${card.ordinal},
        ${now},
        -1,
        ${ankiType},
        ${card.queue},
        ${card.due},
        ${card.interval},
        ${card.factor},
        ${card.reps},
        ${card.lapses},
        ${card.left ?? 0},
        ${card.odue ?? 0},
        ${card.odid ?? 0},
        ${card.flags ?? 0},
        ''
      )
    `);
  }
  
  // Insert revlog entries (only for cards that are being exported)
  const exportedCardIds = new Set(cardsToExport.map(c => c.id));
  for (const [cardId, entries] of collection.revlog) {
    if (!exportedCardIds.has(cardId)) continue;
    
    for (const entry of entries) {
      db.exec(`
        INSERT INTO revlog VALUES (
          ${entry.id},
          ${cardId},
          -1,
          ${entry.ease},
          ${entry.interval},
          ${entry.lastInterval},
          ${entry.factor},
          ${entry.time},
          ${entry.type}
        )
      `);
    }
  }
  
  // Export database to Uint8Array
  const dbData = db.export();
  db.close();
  
  // Create zip file
  const zip = new JSZip();
  
  // Add the database as collection.anki2
  zip.file('collection.anki2', dbData);
  
  // Add media files
  const mediaJson: Record<string, string> = {};
  let mediaIndex = 0;
  for (const [filename, blob] of collection.media) {
    mediaJson[mediaIndex.toString()] = filename;
    zip.file(mediaIndex.toString(), blob);
    mediaIndex++;
  }
  zip.file('media', JSON.stringify(mediaJson));
  
  // Generate the .apkg file
  const apkgBlob = await zip.generateAsync({ type: 'blob' });
  return apkgBlob;
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
