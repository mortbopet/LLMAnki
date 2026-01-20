import JSZip from 'jszip';
import { decompress } from 'fzstd';
import { ZstdCodec } from 'zstd-codec';
import { deserialize } from '@ygoe/msgpack';
import { anki } from '../proto/anki.js';
import type { AnkiCollection, AnkiDeck, AnkiModel, AnkiNote, AnkiCard, CardType, AnkiField, AnkiTemplate, ReviewLogEntry, MediaManifestFormat, AnkiSchemaFormat } from '../types';
import { getMediaManifestSerializer, createMediaManifestEntries, createPackageMetadata, PackageVersion } from './mediaManifest';
import type { MediaManifestEntry } from './mediaManifest';

// ============================================================================
// Zstd Compression Helper
// ============================================================================

// Lazy-loaded zstd streaming compressor instance
let zstdStreaming: { compress: (data: Uint8Array, level?: number) => Uint8Array } | null = null;

/**
 * Get the zstd compressor, initializing it if needed.
 * Uses zstd-codec's Streaming API for better compatibility and larger file support.
 */
async function getZstdCompressor(): Promise<{ compress: (data: Uint8Array, level?: number) => Uint8Array }> {
  if (zstdStreaming) {
    return zstdStreaming;
  }
  
  return new Promise((resolve, reject) => {
    ZstdCodec.run((zstd: { Streaming: new () => { compress: (data: Uint8Array, level?: number) => Uint8Array } }) => {
      try {
        zstdStreaming = new zstd.Streaming();
        resolve(zstdStreaming);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Compress data with zstd and return a copy of the compressed bytes.
 * This ensures the data is copied from Emscripten's heap before it can be reused.
 */
async function zstdCompress(data: Uint8Array): Promise<Uint8Array> {
  const compressor = await getZstdCompressor();
  const compressed = compressor.compress(data, 3); // Level 3 is zstd's default
  // Copy the data to ensure it's not a view into Emscripten's heap
  return new Uint8Array(compressed);
}

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

/**
 * Parse Protocol Buffers MediaEntries format used by Anki 23+.
 * Uses protobufjs library for proper decoding.
 */
function parseProtobufMediaEntries(bytes: Uint8Array): Record<string, string> | null {
  try {
    const decoded = anki.MediaEntries.decode(bytes);
    
    // Convert to plain JavaScript object for easier access
    const plainObj = anki.MediaEntries.toObject(decoded, {
      longs: Number,
      bytes: String,
      defaults: false,
    }) as { entries?: Array<{ name?: string; legacyZipFilename?: number }> };
    
    if (!plainObj.entries || plainObj.entries.length === 0) {
      return null;
    }
    
    const result: Record<string, string> = {};
    
    plainObj.entries.forEach((entry, index) => {
      if (entry.name) {
        // Use legacyZipFilename if present, otherwise use the array index
        const zipIndex = entry.legacyZipFilename !== undefined ? entry.legacyZipFilename : index;
        result[String(zipIndex)] = entry.name;
      }
    });
    
    return Object.keys(result).length > 0 ? result : null;
  } catch (e) {
    // Protobuf parse failed
    return null;
  }
}

/**
 * Parse MessagePack media manifest using @ygoe/msgpack library.
 * Some older Anki exports may use this format.
 */
function parseMessagePackMediaMap(bytes: Uint8Array): Record<string, string> | null {
  try {
    const parsed = deserialize(bytes);
    
    // Validate it's an object (map)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const result: Record<string, string> = {};
      
      // Convert to string->string map (indices are stored as numbers or strings)
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          result[String(key)] = value;
        }
      }
      
      if (Object.keys(result).length > 0) {
        console.log('[APKG Parser] Parsed MessagePack with', Object.keys(result).length, 'entries');
        return result;
      }
    }
    
    return null;
  } catch (e) {
    // MessagePack parse failed - this is expected for non-msgpack formats
    return null;
  }
}

/**
 * Parse Anki's text-based media manifest format (fallback).
 */
function parseTextMediaManifest(text: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  
  // Valid media file extensions
  const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'mp3', 'wav', 'ogg', 'mp4', 'webm', 'pdf', 'GIF', 'PNG', 'JPG', 'JPEG', 'SVG'];
  
  // The format appears to have entries like: <index><filename.ext>
  // The filename can contain letters, numbers, hyphens, underscores
  // We need to find all occurrences of: digits followed by a valid filename
  
  for (const ext of validExtensions) {
    // Match: digits, then filename chars, then .extension
    // Use a non-greedy match for the filename to stop at the extension
    const regex = new RegExp(`(\\d{1,4})([a-zA-Z][a-zA-Z0-9_\\-]*\\.${ext})(?=[^a-zA-Z0-9]|$)`, 'g');
    
    let match;
    while ((match = regex.exec(text)) !== null) {
      const [, index, filename] = match;
      // Only add if we haven't seen this index yet
      if (!result[index]) {
        result[index] = filename;
      }
    }
  }
  
  // Also try to find filenames that start with common prefixes
  // Pattern: index + prefix + hash + .ext
  const prefixes = ['paste-', 'latex-', 'image', 'px-'];
  for (const prefix of prefixes) {
    for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp']) {
      const regex = new RegExp(`(\\d{1,4})(${prefix}[a-zA-Z0-9_\\-]+\\.${ext})`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        const [, index, filename] = match;
        if (!result[index]) {
          result[index] = filename;
        }
      }
    }
  }
  
  if (Object.keys(result).length > 0) {
    console.log('[APKG Parser] Parsed text media manifest with', Object.keys(result).length, 'entries');
    const entries = Object.entries(result);
    console.log('[APKG Parser] First 5 entries:', entries.slice(0, 5));
    // Check if the problematic file exists
    const hasProblematicFile = Object.values(result).some(f => f.includes('7fd55ceeef137b5301bbf12d218e81e01bafd207'));
    console.log('[APKG Parser] Contains paste-7fd55ceeef137b5301bbf12d218e81e01bafd207?', hasProblematicFile);
    if (hasProblematicFile) {
      const found = Object.entries(result).find(([, v]) => v.includes('7fd55ceeef137b5301bbf12d218e81e01bafd207'));
      console.log('[APKG Parser] Found at:', found);
    }
    return result;
  }
  
  return null;
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
      dbData = new Uint8Array(decompress(dbData));
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
          mediaBytes = new Uint8Array(decompress(mediaBytes));
        } catch (decompressError) {
          console.error('Failed to decompress media manifest:', decompressError);
        }
      }
      
      // Try to parse as text/JSON first
      const mediaText = new TextDecoder('utf-8', { fatal: false }).decode(mediaBytes);
      
      // Check if it's valid JSON - Anki uses {"index": "filename", ...} format
      if (mediaText.trim().startsWith('{') && mediaText.includes('"')) {
        try {
          const mediaMap = JSON.parse(mediaText) as Record<string, string>;
          
          for (const [index, filename] of Object.entries(mediaMap)) {
            const mediaData = zip.file(index);
            if (mediaData) {
              let arrayBuffer = await mediaData.async('arraybuffer');
              let bytes = new Uint8Array(arrayBuffer);
              
              // Check if media file is zstd compressed
              if (bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
                bytes = new Uint8Array(decompress(bytes));
                arrayBuffer = bytes.buffer;
              }
              
              const mimeType = getMimeType(filename);
              const blob = new Blob([bytes], { type: mimeType });
              media.set(filename, blob);
            }
          }
        } catch (jsonError) {
          // JSON parse failed, will try other formats
        }
      }
      
      // If JSON didn't work, try Protocol Buffers (used by Anki 23+)
      if (media.size === 0) {
        
        // Try Protocol Buffers first (Anki 23+ with VERSION_LATEST)
        const protobufMap = parseProtobufMediaEntries(mediaBytes);
        
        if (protobufMap && Object.keys(protobufMap).length > 0) {
          for (const [index, filename] of Object.entries(protobufMap)) {
            const mediaData = zip.file(index);
            if (mediaData) {
              let arrayBuffer = await mediaData.async('arraybuffer');
              let bytes = new Uint8Array(arrayBuffer);
              
              // Check if media file is zstd compressed
              if (bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
                bytes = new Uint8Array(decompress(bytes));
                arrayBuffer = bytes.buffer;
              }
              
              const mimeType = getMimeType(filename);
              const blob = new Blob([bytes], { type: mimeType });
              media.set(filename, blob);
            }
          }
        }
      }
      
      // If Protobuf didn't work, try MessagePack
      if (media.size === 0) {
        const msgpackMap = parseMessagePackMediaMap(mediaBytes);
        
        if (msgpackMap && Object.keys(msgpackMap).length > 0) {
          for (const [index, filename] of Object.entries(msgpackMap)) {
            const mediaData = zip.file(index);
            if (mediaData) {
              let arrayBuffer = await mediaData.async('arraybuffer');
              let bytes = new Uint8Array(arrayBuffer);
              
              // Check if media file is zstd compressed
              if (bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
                bytes = new Uint8Array(decompress(bytes));
                arrayBuffer = bytes.buffer;
              }
              
              const mimeType = getMimeType(filename);
              const blob = new Blob([bytes], { type: mimeType });
              media.set(filename, blob);
            }
          }
        }
      }
      
      // If MessagePack didn't work, try text-based format parsing
      if (media.size === 0) {
        const textMap = parseTextMediaManifest(mediaText);
        
        if (textMap && Object.keys(textMap).length > 0) {
          let loaded = 0;
          let notFound = 0;
          for (const [index, filename] of Object.entries(textMap)) {
            const mediaData = zip.file(index);
            if (mediaData) {
              let arrayBuffer = await mediaData.async('arraybuffer');
              let bytes = new Uint8Array(arrayBuffer);
              
              // Check if media file is zstd compressed
              if (bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) {
                bytes = new Uint8Array(decompress(bytes));
                arrayBuffer = bytes.buffer;
              }
              
              const mimeType = getMimeType(filename);
              const blob = new Blob([bytes], { type: mimeType });
              media.set(filename, blob);
              loaded++;
            } else {
              notFound++;
            }
          }
        }
      }
      
      // Last resort: try loading all files with numeric names (no filename mapping)
      if (media.size === 0) {
        for (let i = 0; i <= 1000; i++) {
          const mediaData = zip.file(String(i));
          if (mediaData) {
            const blob = await mediaData.async('blob');
            media.set(String(i), blob);
          } else if (i > 10 && media.size === 0) {
            // Stop early if we haven't found any files
            break;
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse media file:', e);
      // Fallback: just load all numbered files
      for (let i = 0; i <= 100; i++) {
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
          const id = Number(row[0]);
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
      const cardId = Number(row[0]);
      const noteId = Number(row[1]);
      const note = notes.get(noteId);
      const model = note ? models.get(note.modelId) : undefined;
      
      // Column indices from SELECT: id(0), nid(1), did(2), ord(3), type(4), queue(5), due(6), ivl(7), factor(8), reps(9), lapses(10), left(11), odue(12), odid(13), flags(14)
      cards.set(cardId, {
        id: cardId,
        noteId: noteId,
        deckId: Number(row[2]),
        ordinal: Number(row[3]),
        type: model ? determineCardType(model) : 'basic',
        queue: Number(row[5]),
        due: Number(row[6]),
        interval: Number(row[7]),
        factor: Number(row[8]),
        reps: Number(row[9]),
        lapses: Number(row[10]),
        left: Number(row[11]),
        odue: Number(row[12]),
        odid: Number(row[13]),
        flags: Number(row[14])
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
        const reviewId = Number(row[0]);
        const cardId = Number(row[1]);
        
        const entry: ReviewLogEntry = {
          id: reviewId,
          cardId: cardId,
          ease: Number(row[2]),
          interval: Number(row[3]),
          lastInterval: Number(row[4]),
          factor: Number(row[5]),
          time: Number(row[6]),
          type: Number(row[7])
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
    deckTree,
    schemaFormat: hasNewSchema ? 'modern' : 'legacy',
    sourceApkg: file
  };
}

export interface ExportOptions {
  /** Card IDs to exclude from export */
  excludeCardIds?: Set<number>;
  /** Format for media manifest (default: 'modern' for Anki 23+) */
  mediaFormat?: MediaManifestFormat;
  /** Database schema format - if not specified, uses collection.schemaFormat or 'legacy' */
  schemaFormat?: AnkiSchemaFormat;
  /** If true and the collection was imported from an APKG, return the original bytes without re-encoding */
  preserveOriginal?: boolean;
  /** Optional progress callback for UI updates during export */
  onProgress?: (progress: { stage: string; percent: number }) => void;
}

// ============================================================================
// Protobuf Helper Functions
// ============================================================================

/**
 * Convert Uint8Array to hex string (browser-compatible alternative to Buffer.toString('hex'))
 */
function uint8ArrayToHex(data: Uint8Array): string {
  return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Creates the modern Anki 2.1.28+ database schema with separate tables
 * for notetypes, fields, templates, decks, deck_config, config, and tags.
 */
function createModernSchema(db: { exec: (sql: string) => void }): void {
  db.exec(`
    -- Core collection metadata (mostly empty in modern format)
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
    
    -- Notes table
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
    
    -- Cards table
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
    
    -- Review log
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
    
    -- Graves (deleted items)
    CREATE TABLE graves (
      usn INTEGER NOT NULL,
      oid INTEGER NOT NULL,
      type INTEGER NOT NULL
    );
    
    -- New schema tables for Anki 2.1.28+
    -- Note: COLLATE unicase removed because sql.js doesn't support custom collations.
    -- Anki will add its unicase collation when it opens the database.
    
    -- Notetypes (models)
    CREATE TABLE notetypes (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      mtime_secs INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      config BLOB NOT NULL
    );
    
    -- Fields for notetypes
    CREATE TABLE fields (
      ntid INTEGER NOT NULL,
      ord INTEGER NOT NULL,
      name TEXT NOT NULL,
      config BLOB NOT NULL,
      PRIMARY KEY (ntid, ord)
    ) WITHOUT ROWID;
    
    -- Templates for notetypes
    CREATE TABLE templates (
      ntid INTEGER NOT NULL,
      ord INTEGER NOT NULL,
      name TEXT NOT NULL,
      mtime_secs INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      config BLOB NOT NULL,
      PRIMARY KEY (ntid, ord)
    ) WITHOUT ROWID;
    
    -- Decks
    CREATE TABLE decks (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      mtime_secs INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      common BLOB NOT NULL,
      kind BLOB NOT NULL
    );
    
    -- Deck configurations
    CREATE TABLE deck_config (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      mtime_secs INTEGER NOT NULL,
      usn INTEGER NOT NULL,
      config BLOB NOT NULL
    );
    
    -- Key-value config store
    CREATE TABLE config (
      KEY TEXT NOT NULL PRIMARY KEY,
      usn INTEGER NOT NULL,
      mtime_secs INTEGER NOT NULL,
      val BLOB NOT NULL
    ) WITHOUT ROWID;
    
    -- Tags
    CREATE TABLE tags (
      tag TEXT NOT NULL PRIMARY KEY,
      usn INTEGER NOT NULL
    ) WITHOUT ROWID;
    
    -- Indexes
    CREATE INDEX ix_notes_usn ON notes (usn);
    CREATE INDEX ix_notes_csum ON notes (csum);
    CREATE INDEX ix_cards_usn ON cards (usn);
    CREATE INDEX ix_cards_nid ON cards (nid);
    CREATE INDEX ix_cards_sched ON cards (did, queue, due);
    CREATE INDEX ix_revlog_usn ON revlog (usn);
    CREATE INDEX ix_revlog_cid ON revlog (cid);
  `);
}

/**
 * Creates the legacy Anki schema (pre-2.1.28) with models/decks in col table.
 */
function createLegacySchema(db: { exec: (sql: string) => void }): void {
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
}

export async function exportCollection(
  collection: AnkiCollection, 
  options: ExportOptions = {}
): Promise<Blob> {
  const { excludeCardIds } = options;

  if (options.preserveOriginal && collection.sourceApkg) {
    return collection.sourceApkg;
  }

  let lastProgress = -1;
  const reportProgress = (stage: string, percent: number) => {
    if (!options.onProgress) return;
    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    if (clamped !== lastProgress) {
      lastProgress = clamped;
      options.onProgress({ stage, percent: clamped });
    }
  };

  const yieldProgress = async (stage: string, start: number, end: number, current: number, total: number, step: number) => {
    if (!options.onProgress) return;
    if (current % step === 0 || current === total) {
      const ratio = total === 0 ? 1 : current / total;
      reportProgress(stage, start + (end - start) * ratio);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };

  reportProgress('Preparing export', 0);
  
  // Determine schema format: use option, then collection's format, then default to 'legacy'
  // Legacy is safer default as it's compatible with older Anki versions
  const schemaFormat = options.schemaFormat ?? collection.schemaFormat ?? 'legacy';
  // Media format should match schema format for consistency
  const mediaFormat = schemaFormat === 'modern' ? 'modern' : 'legacy';
  
  // Create a proper .apkg file with SQLite database
  const sql = await getSql();
  const db = new sql.Database();
  
  const now = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();
  
  // Helper to convert Blob to Uint8Array (compatible with both browser and jsdom)
  const blobToUint8Array = async (blob: Blob): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(new Uint8Array(reader.result));
        } else {
          reject(new Error('FileReader did not return ArrayBuffer'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  };

  const computeSha1 = async (data: Uint8Array): Promise<Uint8Array> => {
    if (globalThis.crypto?.subtle?.digest) {
      const digestInput = new Uint8Array(data).buffer;
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-1', digestInput);
      return new Uint8Array(hashBuffer);
    }

    const { createHash } = await import('crypto');
    const hash = createHash('sha1');
    hash.update(data);
    return new Uint8Array(hash.digest());
  };
  
  if (schemaFormat === 'modern') {
    reportProgress('Building schema', 5);
    // Use the modern Anki 2.1.28+ schema
    createModernSchema(db);
    
    // Insert empty col row (data is in separate tables)
    db.exec(`
      INSERT INTO col VALUES (
        1,
        ${now - 86400},
        ${nowMs},
        ${nowMs},
        18,
        0,
        0,
        0,
        '',
        '',
        '',
        '',
        ''
      )
    `);
    
    // Insert notetypes, fields, and templates
    for (const [id, model] of collection.models) {
      // Encode notetype config
      const notetypeConfig = anki.NotetypeConfig.create({
        kind: model.type as anki.NotetypeConfig.Kind,
        sortFieldIdx: model.sortField ?? 0,
        css: model.css || '',
        latexPre: model.latexPre || '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}',
        latexPost: model.latexPost || '\\end{document}',
        latexSvg: false
      });
      const notetypeConfigBytes = anki.NotetypeConfig.encode(notetypeConfig).finish();
      
      db.exec(`INSERT INTO notetypes VALUES (${id}, '${model.name.replace(/'/g, "''")}', ${now}, -1, x'${uint8ArrayToHex(notetypeConfigBytes)}')`);
      
      // Insert fields
      for (const field of model.fields) {
        const fieldConfig = anki.NoteFieldConfig.create({
          sticky: field.sticky || false,
          rtl: false,
          fontName: 'Arial',
          fontSize: 20,
          description: '',
          plainText: false,
          collapsed: false,
          excludeFromSearch: false
        });
        const fieldConfigBytes = anki.NoteFieldConfig.encode(fieldConfig).finish();
        
        db.exec(`INSERT INTO fields VALUES (${id}, ${field.ordinal}, '${field.name.replace(/'/g, "''")}', x'${uint8ArrayToHex(fieldConfigBytes)}')`);
      }
      
      // Insert templates
      for (const tmpl of model.templates) {
        const templateConfig = anki.CardTemplateConfig.create({
          qFormat: tmpl.questionFormat,
          aFormat: tmpl.answerFormat,
          qFormatBrowser: '',
          aFormatBrowser: '',
          targetDeckId: 0,
          browserFontName: '',
          browserFontSize: 0
        });
        const templateConfigBytes = anki.CardTemplateConfig.encode(templateConfig).finish();
        
        db.exec(`INSERT INTO templates VALUES (${id}, ${tmpl.ordinal}, '${tmpl.name.replace(/'/g, "''")}', ${now}, -1, x'${uint8ArrayToHex(templateConfigBytes)}')`);
      }
    }
    
    // Insert decks
    for (const [id, deck] of collection.decks) {
      const common = anki.DeckCommon.create({
        studyCollapsed: false,
        browserCollapsed: false,
        lastDayStudied: 0,
        newStudied: 0,
        reviewStudied: 0,
        millisecondsStudied: 0
      });
      const commonBytes = anki.DeckCommon.encode(common).finish();
      
      const kind = anki.DeckKindContainer.create({
        normal: {
          configId: deck.conf ?? 1,
          extendNew: 10,
          extendReview: 50,
          description: deck.description || '',
          markdownDescription: false
        }
      });
      const kindBytes = anki.DeckKindContainer.encode(kind).finish();
      
      db.exec(`INSERT INTO decks VALUES (${id}, '${deck.name.replace(/'/g, "''")}', ${now}, -1, x'${uint8ArrayToHex(commonBytes)}', x'${uint8ArrayToHex(kindBytes)}')`);
    }
    
    // Insert default deck config
    const deckConfig = anki.DeckConfigConfig.create({
      learnSteps: [1, 10],
      relearnSteps: [10],
      newPerDay: 20,
      reviewsPerDay: 200,
      newPerDayMinimum: 0,
      initialEase: 2.5,
      easyMultiplier: 1.3,
      hardMultiplier: 1.2,
      lapseMultiplier: 0,
      intervalMultiplier: 1.0,
      maximumReviewInterval: 36500,
      minimumLapseInterval: 1,
      graduatingIntervalGood: 1,
      graduatingIntervalEasy: 4,
      leechThreshold: 8,
      leechAction: anki.DeckConfigConfig.LeechAction.LEECH_ACTION_TAG_ONLY
    });
    const deckConfigBytes = anki.DeckConfigConfig.encode(deckConfig).finish();
    db.exec(`INSERT INTO deck_config VALUES (1, 'Default', 0, 0, x'${uint8ArrayToHex(deckConfigBytes)}')`);
    
    // Insert config key-value pairs
    // activeDecks: [1] encoded as JSON bytes
    const activeDecks = new TextEncoder().encode('[1]');
    db.exec(`INSERT INTO config VALUES ('activeDecks', 0, 0, x'${uint8ArrayToHex(activeDecks)}')`);
    
    // curDeck: 1 as int64 little-endian
    const curDeck = new Uint8Array(8);
    new DataView(curDeck.buffer).setBigInt64(0, 1n, true);
    db.exec(`INSERT INTO config VALUES ('curDeck', 0, 0, x'${uint8ArrayToHex(curDeck)}')`);
    
    // creationOffset: local timezone offset
    const tzOffset = new Date().getTimezoneOffset();
    const creationOffset = new Int32Array([tzOffset]);
    db.exec(`INSERT INTO config VALUES ('creationOffset', 0, 0, x'${uint8ArrayToHex(new Uint8Array(creationOffset.buffer))}')`);
    
    // localOffset: same as creation offset typically
    db.exec(`INSERT INTO config VALUES ('localOffset', 0, 0, x'${uint8ArrayToHex(new Uint8Array(creationOffset.buffer))}')`);
    
  } else {
    reportProgress('Building schema', 5);
    // Use the legacy schema
    createLegacySchema(db);
    
    // Build models JSON with full field support per Anki schema
    const modelsObj: Record<string, unknown> = {};
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
    const decksObj: Record<string, unknown> = {};
    for (const [id, deck] of collection.decks) {
      const deckObj: Record<string, unknown> = {
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
      
      if (deck.dyn !== undefined) {
        deckObj.dyn = deck.dyn;
      } else {
        deckObj.dyn = 0;
      }
      
      if (!deck.dyn) {
        deckObj.conf = deck.conf ?? DECK_DEFAULTS.DEFAULT_CONF_ID;
      }
      
      decksObj[id.toString()] = deckObj;
    }
    
    // Insert collection row with JSON data
    db.exec(`
      INSERT INTO col VALUES (
        1,
        ${now - 86400},
        ${now},
        ${nowMs},
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
  }
  
  // Filter cards if excludeCardIds is provided
  const cardsToExport = excludeCardIds
    ? Array.from(collection.cards.values()).filter(c => !excludeCardIds.has(c.id))
    : Array.from(collection.cards.values());
  
  // Get the set of note IDs that are still needed
  const neededNoteIds = new Set(cardsToExport.map(c => c.noteId));
  
  // Insert notes with proper field handling per Anki schema
  reportProgress('Writing notes', 10);
  let noteIndex = 0;
  const totalNotes = neededNoteIds.size;
  for (const [id, note] of collection.notes) {
    if (!neededNoteIds.has(id)) continue;
    
    const flds = note.fields.join(FIELD_SEPARATOR);
    const sfld = note.fields[0] || '';
    const tags = note.tags.length > 0 ? ` ${note.tags.join(' ')} ` : '';
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

    noteIndex++;
    await yieldProgress('Writing notes', 10, 35, noteIndex, totalNotes, 200);
  }
  
  // Insert cards with all fields per Anki schema
  reportProgress('Writing cards', 35);
  let cardIndex = 0;
  const totalCards = cardsToExport.length;
  for (const card of cardsToExport) {
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

    cardIndex++;
    await yieldProgress('Writing cards', 35, 55, cardIndex, totalCards, 200);
  }
  
  // Insert revlog entries
  reportProgress('Writing review history', 55);
  const exportedCardIds = new Set(cardsToExport.map(c => c.id));
  let revIndex = 0;
  let totalRev = 0;
  for (const [cardId, entries] of collection.revlog) {
    if (!exportedCardIds.has(cardId)) continue;
    totalRev += entries.length;
  }
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

      revIndex++;
      await yieldProgress('Writing review history', 55, 65, revIndex, totalRev, 500);
    }
  }
  
  // Export database to Uint8Array
  reportProgress('Finalizing database', 65);
  const dbData = db.export();
  db.close();
  
  // Create zip file
  const zip = new JSZip();
  
  if (schemaFormat === 'modern') {
    reportProgress('Packaging collection', 70);
    // VERSION_LATEST format with zstd compression
    const metaData = createPackageMetadata(PackageVersion.VERSION_LATEST);
    zip.file('meta', metaData);
    
    // Compress database with zstd
    reportProgress('Compressing database', 75);
    const compressedDb = await zstdCompress(dbData);
    zip.file('collection.anki21b', compressedDb);
    
    // Create a SEPARATE legacy database for collection.anki2 (backward compatibility)
    // Anki's modern format includes both: anki21b (modern/actual) and anki2 (legacy/fallback)
    const legacyDb = new sql.Database();
    createLegacySchema(legacyDb);
    
    // Build models JSON for legacy format
    const modelsObj: Record<string, unknown> = {};
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
    
    // Build decks JSON for legacy format
    const decksObj: Record<string, unknown> = {};
    for (const [id, deck] of collection.decks) {
      const deckObj: Record<string, unknown> = {
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
      if (deck.dyn !== undefined) {
        deckObj.dyn = deck.dyn;
      } else {
        deckObj.dyn = 0;
      }
      if (!deck.dyn) {
        deckObj.conf = deck.conf ?? DECK_DEFAULTS.DEFAULT_CONF_ID;
      }
      decksObj[id.toString()] = deckObj;
    }
    
    // Insert col row with legacy JSON data
    legacyDb.exec(`
      INSERT INTO col VALUES (
        1,
        ${now - 86400},
        ${now},
        ${nowMs},
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
    
    // Insert notes into legacy db
    for (const [id, note] of collection.notes) {
      if (!neededNoteIds.has(id)) continue;
      const flds = note.fields.join(FIELD_SEPARATOR);
      const sfld = note.fields[0] || '';
      const tags = note.tags.length > 0 ? ` ${note.tags.join(' ')} ` : '';
      const csum = calculateFieldChecksumSync(sfld);
      legacyDb.exec(`
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
    
    // Insert cards into legacy db
    for (const card of cardsToExport) {
      let ankiType = CARD_TYPE.NEW;
      if (card.queue === CARD_QUEUE.LEARNING || card.queue === CARD_QUEUE.DAY_LEARN_RELEARN) {
        ankiType = CARD_TYPE.LEARNING;
      } else if (card.queue === CARD_QUEUE.REVIEW || card.interval > 0) {
        ankiType = CARD_TYPE.REVIEW;
      }
      legacyDb.exec(`
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
    
    // Insert revlog into legacy db
    for (const [cardId, entries] of collection.revlog) {
      if (!exportedCardIds.has(cardId)) continue;
      for (const entry of entries) {
        legacyDb.exec(`
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
    
    const legacyDbData = legacyDb.export();
    legacyDb.close();
    
    // Include the legacy database for compatibility
    zip.file('collection.anki2', legacyDbData);
    
    // Add media files (zstd compressed)
    reportProgress('Processing media', 80);
    let mediaIndex = 0;
    const manifestEntries: MediaManifestEntry[] = [];
    const totalMedia = collection.media.size;
    for (const [filename, blob] of collection.media) {
      const mediaData = await blobToUint8Array(blob);
      const sha1 = await computeSha1(mediaData);
      manifestEntries.push({
        index: mediaIndex,
        filename,
        size: mediaData.length,
        sha1
      });
      const compressedMedia = await zstdCompress(mediaData);
      zip.file(mediaIndex.toString(), compressedMedia);
      mediaIndex++;
      await yieldProgress('Processing media', 80, 90, mediaIndex, totalMedia, 5);
    }
    
    // Serialize media manifest (protobuf format) and compress with zstd
    reportProgress('Writing media manifest', 92);
    const serializer = getMediaManifestSerializer(mediaFormat);
    const manifestData = serializer.serialize(manifestEntries);
    const compressedManifest = await zstdCompress(manifestData);
    zip.file('media', compressedManifest);
  } else {
    reportProgress('Packaging collection', 70);
    // Legacy format: uncompressed collection.anki2
    zip.file('collection.anki2', dbData);
    
    // Add media files (uncompressed)
    reportProgress('Processing media', 80);
    let mediaIndex = 0;
    const totalMedia = collection.media.size;
    for (const [, blob] of collection.media) {
      zip.file(mediaIndex.toString(), blob);
      mediaIndex++;
      await yieldProgress('Processing media', 80, 90, mediaIndex, totalMedia, 10);
    }
    
    // Serialize media manifest (legacy format uses JSON)
    reportProgress('Writing media manifest', 92);
    const serializer = getMediaManifestSerializer(mediaFormat);
    const entries = createMediaManifestEntries(collection.media, false);
    const manifestData = serializer.serialize(entries);
    zip.file('media', new Uint8Array(manifestData));
  }
  
  // Generate the .apkg file
  reportProgress('Finalizing package', 98);
  const apkgBlob = await zip.generateAsync({ type: 'blob' });
  reportProgress('Export complete', 100);
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
