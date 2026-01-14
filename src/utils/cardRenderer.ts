import type { AnkiCollection, AnkiCard, AnkiNote, AnkiModel, RenderedCard, CardType } from '../types';

// Replace Anki field references like {{FieldName}} with actual values
function replaceFields(template: string, fields: { name: string; value: string }[]): string {
  let result = template;
  
  for (const field of fields) {
    // Standard field replacement
    const regex = new RegExp(`\\{\\{${field.name}\\}\\}`, 'gi');
    result = result.replace(regex, field.value);
    
    // Conditional field (show if not empty)
    const conditionalRegex = new RegExp(`\\{\\{#${field.name}\\}\\}([\\s\\S]*?)\\{\\{/${field.name}\\}\\}`, 'gi');
    result = result.replace(conditionalRegex, field.value.trim() ? '$1' : '');
    
    // Negative conditional (show if empty)
    const negativeRegex = new RegExp(`\\{\\{\\^${field.name}\\}\\}([\\s\\S]*?)\\{\\{/${field.name}\\}\\}`, 'gi');
    result = result.replace(negativeRegex, field.value.trim() ? '' : '$1');
  }
  
  // Remove FrontSide placeholder from back (it's for showing front on back)
  result = result.replace(/\{\{FrontSide\}\}/gi, '');
  
  // Clean up any remaining unmatched mustache tags
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  
  return result;
}

// Process cloze deletions
function processCloze(text: string, clozeOrdinal: number, showAnswer: boolean): string {
  let result = text;
  
  // Match {{c1::answer::hint}} or {{c1::answer}}
  const clozeRegex = /\{\{c(\d+)::([^}]+?)(?:::([^}]+))?\}\}/g;
  
  result = result.replace(clozeRegex, (match, num, answer, hint) => {
    const clozeNum = parseInt(num);
    
    if (clozeNum === clozeOrdinal) {
      if (showAnswer) {
        return `<span class="cloze">${answer}</span>`;
      } else {
        const hintText = hint ? hint : '[...]';
        return `<span class="cloze cloze-hint">${hintText}</span>`;
      }
    } else {
      // Show other clozes as-is (revealed)
      return answer;
    }
  });
  
  return result;
}

// Convert media references to data URLs
export async function processMediaReferences(
  html: string,
  media: Map<string, Blob>
): Promise<string> {
  let result = html;
  
  // Find all img src references
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  const matches = [...result.matchAll(imgRegex)];
  
  for (const match of matches) {
    const filename = match[1];
    const blob = media.get(filename);
    
    if (blob) {
      const dataUrl = await blobToDataUrl(blob);
      result = result.replace(match[0], match[0].replace(filename, dataUrl));
    }
  }
  
  // Also handle [sound:filename] references
  const soundRegex = /\[sound:([^\]]+)\]/gi;
  result = result.replace(soundRegex, (match, filename) => {
    const blob = media.get(filename);
    if (blob) {
      // For audio, we'll create an audio element placeholder
      return `<span class="sound-reference" data-filename="${filename}">🔊 ${filename}</span>`;
    }
    return match;
  });
  
  return result;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export async function renderCard(
  collection: AnkiCollection,
  card: AnkiCard
): Promise<RenderedCard> {
  const note = collection.notes.get(card.noteId);
  if (!note) {
    throw new Error(`Note not found for card ${card.id}`);
  }
  
  const model = collection.models.get(note.modelId);
  if (!model) {
    throw new Error(`Model not found for note ${note.id}`);
  }
  
  const deck = collection.decks.get(card.deckId);
  
  // Build field map
  const fields = model.fields.map((field, index) => ({
    name: field.name,
    value: note.fields[index] || ''
  }));
  
  let front: string;
  let back: string;
  
  if (model.type === 1) {
    // Cloze type - ordinal is 0-based, cloze numbers are 1-based
    const clozeOrdinal = card.ordinal + 1;
    const mainField = fields[0]?.value || '';
    
    front = processCloze(mainField, clozeOrdinal, false);
    back = processCloze(mainField, clozeOrdinal, true);
    
    // Add extra field if exists
    if (fields.length > 1 && fields[1]?.value) {
      back += `<hr><div class="extra">${fields[1].value}</div>`;
    }
  } else {
    // Standard card type
    const template = model.templates[card.ordinal];
    if (!template) {
      throw new Error(`Template not found for card ordinal ${card.ordinal}`);
    }
    
    front = replaceFields(template.questionFormat, fields);
    back = replaceFields(template.answerFormat, fields);
  }
  
  // Process media references
  front = await processMediaReferences(front, collection.media);
  back = await processMediaReferences(back, collection.media);
  
  return {
    id: card.id,
    noteId: card.noteId,
    deckId: card.deckId,
    deckName: deck?.name || 'Unknown',
    modelName: model.name,
    type: card.type,
    front,
    back,
    fields,
    tags: note.tags,
    css: model.css
  };
}

export function getCardTypeName(type: CardType): string {
  switch (type) {
    case 'basic':
      return 'Basic';
    case 'basic-reversed':
      return 'Basic (and reversed)';
    case 'basic-optional-reversed':
      return 'Basic (optional reversed)';
    case 'basic-type':
      return 'Basic (type in answer)';
    case 'cloze':
      return 'Cloze';
    default:
      return 'Unknown';
  }
}

export function extractClozeNumbers(text: string): number[] {
  const regex = /\{\{c(\d+)::/g;
  const numbers = new Set<number>();
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    numbers.add(parseInt(match[1]));
  }
  
  return Array.from(numbers).sort((a, b) => a - b);
}

export function createClozeText(text: string, clozeNumber: number): string {
  return `{{c${clozeNumber}::${text}}}`;
}

export function addClozeHint(clozeText: string, hint: string): string {
  // Transforms {{c1::answer}} to {{c1::answer::hint}}
  return clozeText.replace(/\}\}$/, `::${hint}}}`);
}
