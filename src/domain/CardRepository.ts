/**
 * Card Repository
 * 
 * This module provides the unified interface for all card operations.
 * It acts as the single source of truth for card state, bridging the
 * domain model with the Zustand store and persistence layer.
 * 
 * Key responsibilities:
 * - Converting raw Anki collection data to domain Card objects
 * - Managing the card state cache
 * - Coordinating mutations and persistence
 * - Providing query methods for components
 */

import type { AnkiCollection, AnkiCard, CardField, SuggestedCard } from '../types';
import type { ICard, CardStateData, CardSchedulingData, CardReviewData } from './types';
import { createGeneratedCardData } from './Card';
import { processMediaReferences } from '../utils/cardRenderer';

/**
 * Process cloze deletions for rendering
 */
function processCloze(text: string, clozeOrdinal: number, showAnswer: boolean): string {
  let result = text;
  const clozeRegex = /\{\{c(\d+)::([^}]+?)(?:::([^}]+))?\}\}/g;
  
  result = result.replace(clozeRegex, (_match, num, answer, hint) => {
    const clozeNum = parseInt(num);
    
    if (clozeNum === clozeOrdinal) {
      if (showAnswer) {
        return `<span class="cloze">${answer}</span>`;
      } else {
        const hintText = hint ? hint : '[...]';
        return `<span class="cloze cloze-hint">${hintText}</span>`;
      }
    } else {
      return answer;
    }
  });
  
  return result;
}

/**
 * Replace Anki field references in templates
 */
function replaceFields(template: string, fields: CardField[]): string {
  let result = template;
  
  for (const field of fields) {
    const regex = new RegExp(`\\{\\{${field.name}\\}\\}`, 'gi');
    result = result.replace(regex, field.value);
    
    const conditionalRegex = new RegExp(`\\{\\{#${field.name}\\}\\}([\\s\\S]*?)\\{\\{/${field.name}\\}\\}`, 'gi');
    result = result.replace(conditionalRegex, field.value.trim() ? '$1' : '');
    
    const negativeRegex = new RegExp(`\\{\\{\\^${field.name}\\}\\}([\\s\\S]*?)\\{\\{/${field.name}\\}\\}`, 'gi');
    result = result.replace(negativeRegex, field.value.trim() ? '' : '$1');
  }
  
  result = result.replace(/\{\{FrontSide\}\}/gi, '');
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  
  return result;
}

/**
 * Render front and back HTML for a card
 */
async function renderCardContent(
  collection: AnkiCollection,
  card: AnkiCard,
  fields: CardField[],
  modelType: number,
  templates: { questionFormat: string; answerFormat: string }[],
): Promise<{ front: string; back: string }> {
  const template = templates[card.ordinal] || templates[0];
  
  if (!template) {
    // Fallback rendering
    const front = fields[0]?.value || '(empty)';
    const back = fields[1]?.value || fields[0]?.value || '(empty)';
    return {
      front: await processMediaReferences(front, collection.media),
      back: await processMediaReferences(back, collection.media),
    };
  }
  
  let front: string;
  let back: string;
  
  if (modelType === 1) {
    // Cloze type
    const clozeOrdinal = card.ordinal + 1;
    const mainField = fields[0]?.value || '';
    
    front = processCloze(mainField, clozeOrdinal, false);
    back = processCloze(mainField, clozeOrdinal, true);
    
    if (fields.length > 1 && fields[1]?.value) {
      back += `<hr><div class="extra">${fields[1].value}</div>`;
    }
  } else {
    // Standard type
    front = replaceFields(template.questionFormat, fields);
    back = replaceFields(template.answerFormat, fields);
  }
  
  return {
    front: await processMediaReferences(front, collection.media),
    back: await processMediaReferences(back, collection.media),
  };
}

/**
 * Create a new generated card from a suggestion
 */
export async function createGeneratedCard(
  collection: AnkiCollection,
  suggestedCard: SuggestedCard,
  deckId: number,
  sourceCard?: ICard,
  inheritMetadata?: boolean,
): Promise<{ cardStateData: CardStateData; ankiCard: AnkiCard; ankiNote: { id: number; modelId: number; fields: string[]; tags: string[]; guid: string; mod: number } }> {
  const { generateUniqueId } = await import('./Deck');
  const cardId = generateUniqueId();
  const noteId = generateUniqueId();
  
  // Find appropriate model
  let modelId: number | null = null;
  for (const [id, model] of collection.models) {
    if (suggestedCard.type === 'cloze' && model.type === 1) {
      modelId = id;
      break;
    } else if (suggestedCard.type !== 'cloze' && model.type === 0) {
      modelId = id;
      break;
    }
  }
  
  if (modelId === null) {
    modelId = collection.models.keys().next().value ?? 0;
  }
  
  const model = collection.models.get(modelId);
  const deck = collection.decks.get(deckId);
  
  // Create Anki note
  const now = Date.now();
  const ankiNote = {
    id: noteId,
    modelId,
    fields: suggestedCard.fields.map(f => f.value),
    tags: ['llmanki-generated'],
    guid: `llmanki-${cardId}`,
    mod: Math.floor(now / 1000),
  };
  
  // Create Anki card with optional metadata inheritance
  const sourceScheduling = sourceCard?.scheduling;
  const shouldInherit = inheritMetadata && sourceScheduling;
  
  const ankiCard: AnkiCard = {
    id: cardId,
    noteId,
    deckId,
    ordinal: 0,
    type: suggestedCard.type,
    queue: shouldInherit ? sourceScheduling.queue : 0,
    due: shouldInherit ? sourceScheduling.due : 0,
    interval: shouldInherit ? sourceScheduling.interval : 0,
    factor: shouldInherit ? sourceScheduling.factor : 2500,
    reps: shouldInherit ? sourceScheduling.reps : 0,
    lapses: shouldInherit ? sourceScheduling.lapses : 0,
  };
  
  // Render content
  const templates = model?.templates.map(t => ({
    questionFormat: t.questionFormat,
    answerFormat: t.answerFormat,
  })) || [];
  
  const { front, back } = await renderCardContent(
    collection,
    ankiCard,
    suggestedCard.fields,
    model?.type || 0,
    templates,
  );
  
  const scheduling: CardSchedulingData = {
    queue: ankiCard.queue,
    due: ankiCard.due,
    interval: ankiCard.interval,
    factor: ankiCard.factor,
    reps: ankiCard.reps,
    lapses: ankiCard.lapses,
  };
  
  const reviewData: CardReviewData = sourceCard?.reviewData ? {
    ...sourceCard.reviewData,
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
    deckId,
    type: suggestedCard.type,
    fields: suggestedCard.fields,
    deckName: deck?.name || 'Unknown',
    modelName: model?.name || 'Unknown',
    css: model?.css || '',
    front,
    back,
    scheduling,
    reviewData,
  });
  
  return { cardStateData, ankiCard, ankiNote };
}

/**
 * Re-render card content after field updates
 */
export async function rerenderCardContent(
  collection: AnkiCollection,
  cardState: CardStateData,
): Promise<{ front: string; back: string }> {
  const note = collection.notes.get(cardState.noteId);
  const model = note ? collection.models.get(note.modelId) : null;
  
  // Create a mock AnkiCard for rendering
  const mockCard: AnkiCard = {
    id: cardState.cardId,
    noteId: cardState.noteId,
    deckId: cardState.deckId,
    ordinal: 0,
    type: cardState.type,
    queue: cardState.scheduling?.queue || 0,
    due: cardState.scheduling?.due || 0,
    interval: cardState.scheduling?.interval || 0,
    factor: cardState.scheduling?.factor || 2500,
    reps: cardState.scheduling?.reps || 0,
    lapses: cardState.scheduling?.lapses || 0,
  };
  
  const templates = model?.templates.map(t => ({
    questionFormat: t.questionFormat,
    answerFormat: t.answerFormat,
  })) || [];
  
  return renderCardContent(
    collection,
    mockCard,
    cardState.currentFields,
    model?.type || 0,
    templates,
  );
}

/**
 * Get cards in a specific deck (including subdecks optionally)
 */
export function filterCardsByDeck(
  cards: Map<number, ICard>,
  collection: AnkiCollection,
  deckId: number,
  includeSubdecks: boolean,
): ICard[] {
  const targetDeckIds = new Set<number>([deckId]);
  
  if (includeSubdecks) {
    // Get all subdeck IDs
    const addSubdecks = (deck: { id: number; children: { id: number; children: any[] }[] }) => {
      for (const child of deck.children) {
        targetDeckIds.add(child.id);
        addSubdecks(child);
      }
    };
    
    const rootDeck = collection.decks.get(deckId);
    if (rootDeck) {
      addSubdecks(rootDeck);
    }
  }
  
  const result: ICard[] = [];
  for (const card of cards.values()) {
    if (targetDeckIds.has(card.deckId)) {
      result.push(card);
    }
  }
  
  return result;
}
