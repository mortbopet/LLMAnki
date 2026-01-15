/**
 * Analysis Cache Utility
 * 
 * Provides persistent caching of card analysis results using localStorage.
 * Uses content hashing to ensure cached results are only used when the card
 * content matches exactly.
 */

import type { LLMAnalysisResult, AnkiCard, AnkiNote } from '../types';

// Cache storage key prefix
const CACHE_PREFIX = 'llmanki-analysis-cache-';
const CACHE_INDEX_KEY = 'llmanki-analysis-cache-index';
const STATE_PREFIX = 'llmanki-state-';

// Interface for a cached card analysis
export interface CachedCardAnalysis {
  cardId: number;
  contentHash: string;
  result: LLMAnalysisResult;
  cachedAt: number; // timestamp
}

// Interface for deck cache metadata
export interface DeckCacheInfo {
  deckFileName: string;
  cardCount: number;
  sizeBytes: number;
  lastUpdated: number;
}

// Interface for the cache index
export interface CacheIndex {
  decks: Record<string, DeckCacheInfo>; // deckFileName -> info
}

// Interface for deck state (generated cards, marked for deletion, edited cards)
export interface DeckState {
  generatedCardIds: number[];
  markedForDeletion: number[];
  // Store the actual generated cards and notes for full restoration
  generatedCards: Array<{
    card: AnkiCard;
    note: AnkiNote;
  }>;
  // Store edited card fields - keyed by noteId
  editedCards?: Record<number, { name: string; value: string }[]>;
  lastUpdated: number;
}

/**
 * Generate a simple hash for card content to detect changes.
 * Uses a fast string hash algorithm (djb2).
 */
export function generateContentHash(fields: { name: string; value: string }[]): string {
  // Combine all field values into a single string
  const content = fields
    .map(f => `${f.name}:${f.value}`)
    .join('|');
  
  // djb2 hash algorithm
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
  }
  
  // Convert to hex string
  return (hash >>> 0).toString(16);
}

/**
 * Get the storage key for a deck's cache
 */
function getDeckCacheKey(deckFileName: string): string {
  // Sanitize filename for use as storage key
  const sanitized = deckFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${CACHE_PREFIX}${sanitized}`;
}

/**
 * Get the cache index (list of all cached decks)
 */
export function getCacheIndex(): CacheIndex {
  try {
    const indexJson = localStorage.getItem(CACHE_INDEX_KEY);
    if (indexJson) {
      return JSON.parse(indexJson);
    }
  } catch (e) {
    console.error('Failed to parse cache index:', e);
  }
  return { decks: {} };
}

/**
 * Save the cache index
 */
function saveCacheIndex(index: CacheIndex): void {
  try {
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.error('Failed to save cache index:', e);
  }
}

/**
 * Get cached analyses for a deck
 */
export function getDeckCache(deckFileName: string): Map<number, CachedCardAnalysis> {
  const cache = new Map<number, CachedCardAnalysis>();
  
  try {
    const key = getDeckCacheKey(deckFileName);
    const dataJson = localStorage.getItem(key);
    
    if (dataJson) {
      const data: CachedCardAnalysis[] = JSON.parse(dataJson);
      for (const entry of data) {
        cache.set(entry.cardId, entry);
      }
    }
  } catch (e) {
    console.error('Failed to load deck cache:', e);
  }
  
  return cache;
}

/**
 * Save cached analyses for a deck
 */
export function saveDeckCache(
  deckFileName: string,
  cache: Map<number, CachedCardAnalysis>
): void {
  try {
    const key = getDeckCacheKey(deckFileName);
    const data = Array.from(cache.values());
    const dataJson = JSON.stringify(data);
    
    localStorage.setItem(key, dataJson);
    
    // Update cache index
    const index = getCacheIndex();
    index.decks[deckFileName] = {
      deckFileName,
      cardCount: cache.size,
      sizeBytes: new Blob([dataJson]).size,
      lastUpdated: Date.now()
    };
    saveCacheIndex(index);
  } catch (e) {
    console.error('Failed to save deck cache:', e);
    // If storage is full, we just continue without caching
    if (e instanceof Error && e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, cache not saved');
    }
  }
}

/**
 * Get a cached analysis for a specific card, verifying the content hash matches
 */
export function getCachedAnalysis(
  deckFileName: string,
  cardId: number,
  fields: { name: string; value: string }[]
): LLMAnalysisResult | null {
  const cache = getDeckCache(deckFileName);
  const entry = cache.get(cardId);
  
  if (!entry) {
    return null;
  }
  
  // Verify content hash matches
  const currentHash = generateContentHash(fields);
  if (entry.contentHash !== currentHash) {
    // Content has changed, don't use cached result
    return null;
  }
  
  return entry.result;
}

/**
 * Cache an analysis result for a card
 */
export function cacheAnalysisResult(
  deckFileName: string,
  cardId: number,
  fields: { name: string; value: string }[],
  result: LLMAnalysisResult
): void {
  const cache = getDeckCache(deckFileName);
  
  cache.set(cardId, {
    cardId,
    contentHash: generateContentHash(fields),
    result,
    cachedAt: Date.now()
  });
  
  saveDeckCache(deckFileName, cache);
}

/**
 * Clear cache for a specific deck
 */
export function clearDeckCache(deckFileName: string): void {
  try {
    const key = getDeckCacheKey(deckFileName);
    localStorage.removeItem(key);
    
    // Update cache index
    const index = getCacheIndex();
    delete index.decks[deckFileName];
    saveCacheIndex(index);
  } catch (e) {
    console.error('Failed to clear deck cache:', e);
  }
}

/**
 * Clear all analysis caches
 */
export function clearAllCaches(): void {
  try {
    const index = getCacheIndex();
    
    // Remove all deck caches
    for (const deckFileName of Object.keys(index.decks)) {
      const key = getDeckCacheKey(deckFileName);
      localStorage.removeItem(key);
    }
    
    // Clear the index
    localStorage.removeItem(CACHE_INDEX_KEY);
  } catch (e) {
    console.error('Failed to clear all caches:', e);
  }
}

/**
 * Get total cache size in bytes
 */
export function getTotalCacheSize(): number {
  const index = getCacheIndex();
  let total = 0;
  
  for (const info of Object.values(index.decks)) {
    total += info.sizeBytes;
  }
  
  return total;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Bulk cache multiple analysis results (more efficient than caching one by one)
 */
export function bulkCacheAnalysisResults(
  deckFileName: string,
  results: Array<{
    cardId: number;
    fields: { name: string; value: string }[];
    result: LLMAnalysisResult;
  }>
): void {
  const cache = getDeckCache(deckFileName);
  
  for (const { cardId, fields, result } of results) {
    cache.set(cardId, {
      cardId,
      contentHash: generateContentHash(fields),
      result,
      cachedAt: Date.now()
    });
  }
  
  saveDeckCache(deckFileName, cache);
}

/**
 * Load cached results into a Map, filtering by content hash
 */
export function loadValidCachedResults(
  deckFileName: string,
  cards: Array<{ id: number; fields: { name: string; value: string }[] }>
): Map<number, LLMAnalysisResult> {
  const validResults = new Map<number, LLMAnalysisResult>();
  const cache = getDeckCache(deckFileName);
  
  for (const card of cards) {
    const entry = cache.get(card.id);
    if (entry) {
      const currentHash = generateContentHash(card.fields);
      if (entry.contentHash === currentHash) {
        validResults.set(card.id, entry.result);
      }
    }
  }
  
  return validResults;
}

/**
 * Get the storage key for a deck's state
 */
function getDeckStateKey(deckFileName: string): string {
  const sanitized = deckFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${STATE_PREFIX}${sanitized}`;
}

/**
 * Get the saved state for a deck (generated cards, marked for deletion)
 */
export function getDeckState(deckFileName: string): DeckState | null {
  try {
    const key = getDeckStateKey(deckFileName);
    const dataJson = localStorage.getItem(key);
    
    if (dataJson) {
      return JSON.parse(dataJson);
    }
  } catch (e) {
    console.error('Failed to load deck state:', e);
  }
  
  return null;
}

/**
 * Save deck state (generated cards, marked for deletion)
 */
export function saveDeckState(
  deckFileName: string,
  state: DeckState
): void {
  try {
    const key = getDeckStateKey(deckFileName);
    const dataJson = JSON.stringify(state);
    localStorage.setItem(key, dataJson);
  } catch (e) {
    console.error('Failed to save deck state:', e);
    if (e instanceof Error && e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, state not saved');
    }
  }
}

/**
 * Clear state for a specific deck
 */
export function clearDeckState(deckFileName: string): void {
  try {
    const key = getDeckStateKey(deckFileName);
    localStorage.removeItem(key);
  } catch (e) {
    console.error('Failed to clear deck state:', e);
  }
}

/**
 * Update marked for deletion in deck state
 */
export function updateMarkedForDeletion(
  deckFileName: string,
  markedForDeletion: Set<number>
): void {
  const existingState = getDeckState(deckFileName);
  const newState: DeckState = {
    generatedCardIds: existingState?.generatedCardIds || [],
    markedForDeletion: Array.from(markedForDeletion),
    generatedCards: existingState?.generatedCards || [],
    lastUpdated: Date.now()
  };
  saveDeckState(deckFileName, newState);
}

/**
 * Update generated cards in deck state
 */
export function updateGeneratedCards(
  deckFileName: string,
  generatedCardIds: Set<number>,
  generatedCards: Array<{ card: AnkiCard; note: AnkiNote }>
): void {
  const existingState = getDeckState(deckFileName);
  const newState: DeckState = {
    generatedCardIds: Array.from(generatedCardIds),
    markedForDeletion: existingState?.markedForDeletion || [],
    generatedCards,
    lastUpdated: Date.now()
  };
  saveDeckState(deckFileName, newState);
}
