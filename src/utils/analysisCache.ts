/**
 * Analysis Cache Utility
 * 
 * Provides persistent caching of card analysis results using localStorage.
 * Uses content hashing (deck name + fields) to ensure cached results can be 
 * shared across different deck files when the content is identical.
 */

// Cache storage key prefix
const GLOBAL_CACHE_KEY = 'llmanki-global-analysis-cache';
const DECK_STATE_PREFIX = 'llmanki-deck-state-';

interface PersistedDeckStateSnapshot {
  fileName?: string;
  cards?: Array<{ analysis?: unknown | null }>;
}

// Interface for a cached card analysis (global cache entry)
interface GlobalCachedAnalysis {
  cacheKey: string; // Hash of deckName + fields
  deckName: string; // For debugging/display
  result: import('../types').LLMAnalysisResult;
  cachedAt: number; // timestamp
}

/**
 * Get the global analysis cache
 */
function getGlobalCache(): Map<string, GlobalCachedAnalysis> {
  const cache = new Map<string, GlobalCachedAnalysis>();
  
  try {
    const dataJson = localStorage.getItem(GLOBAL_CACHE_KEY);
    
    if (dataJson) {
      const data: GlobalCachedAnalysis[] = JSON.parse(dataJson);
      for (const entry of data) {
        cache.set(entry.cacheKey, entry);
      }
    }
  } catch (e) {
    console.error('Failed to load global cache:', e);
  }
  
  return cache;
}

/**
 * Clear all analysis caches
 */
export function clearAllCaches(): void {
  try {
    // Clear global cache
    localStorage.removeItem(GLOBAL_CACHE_KEY);
    
    // Also clear any legacy deck caches
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('llmanki-analysis-cache-')) {
        keysToRemove.push(key);
      }
      if (key && key.startsWith(DECK_STATE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    
    // Clear the index
    localStorage.removeItem('llmanki-analysis-cache-index');
  } catch (e) {
    console.error('Failed to clear all caches:', e);
  }
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
 * Get global cache statistics
 */
export function getGlobalCacheStats(): { entryCount: number; sizeBytes: number; deckNames: string[] } {
  const globalCache = getGlobalCache();
  const deckNames = new Set<string>();
  let entryCount = globalCache.size;
  
  for (const entry of globalCache.values()) {
    if (entry.deckName) {
      deckNames.add(entry.deckName);
    }
  }
  
  let sizeBytes = 0;
  try {
    const globalData = localStorage.getItem(GLOBAL_CACHE_KEY);
    if (globalData) {
      sizeBytes = new Blob([globalData]).size;
    }
    // Include per-deck persisted state (card-level analyses stored with deck state)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DECK_STATE_PREFIX)) continue;
      const json = localStorage.getItem(key);
      if (!json) continue;
      sizeBytes += new Blob([json]).size;
      try {
        const deckState = JSON.parse(json) as PersistedDeckStateSnapshot;
        if (deckState.fileName) {
          deckNames.add(deckState.fileName);
        }
        if (Array.isArray(deckState.cards)) {
          for (const card of deckState.cards) {
            if (card?.analysis) {
              entryCount += 1;
            }
          }
        }
      } catch {
        // Ignore parse errors for individual entries
      }
    }
  } catch (e) {
    // Ignore errors
  }
  
  return {
    entryCount,
    sizeBytes,
    deckNames: Array.from(deckNames).sort()
  };
}
