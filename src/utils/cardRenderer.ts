import type { AnkiCollection, AnkiCard, RenderedCard, CardType } from '../types';

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
  const imgRegex = /<img([^>]*)src=["']([^"']+)["']([^>]*)>/gi;
  const matches = [...result.matchAll(imgRegex)];
  
  for (const match of matches) {
    const [fullMatch, beforeSrc, filename, afterSrc] = match;
    
    // Try exact match first
    let blob = media.get(filename);
    
    // If not found, try fuzzy matching
    if (!blob) {
      // Try adding common prefixes (some Anki exports add digit prefixes)
      for (let i = 0; i <= 9; i++) {
        blob = media.get(`${i}${filename}`);
        if (blob) break;
      }
    }
    
    // Try finding by hash (the long hex string part)
    if (!blob) {
      const hashMatch = filename.match(/([a-f0-9]{32,})/i);
      if (hashMatch) {
        const hash = hashMatch[1];
        for (const [key, value] of media.entries()) {
          if (key.includes(hash)) {
            blob = value;
            break;
          }
        }
      }
    }
    
    if (blob) {
      const dataUrl = await blobToDataUrl(blob);
      result = result.replace(fullMatch, `<img${beforeSrc}src="${dataUrl}"${afterSrc}>`);
    } else {
      // Replace missing image with a placeholder
      result = result.replace(
        fullMatch, 
        `<div class="missing-media" style="display:inline-flex;align-items:center;gap:4px;padding:8px 12px;background:#374151;border:1px dashed #6b7280;border-radius:4px;color:#9ca3af;font-size:12px;">
          <span>🖼️</span>
          <span title="${filename}">${filename.length > 30 ? filename.slice(0, 30) + '...' : filename}</span>
        </div>`
      );
    }
  }
  
  // Also handle [sound:filename] references
  const soundRegex = /\[sound:([^\]]+)\]/gi;
  result = result.replace(soundRegex, (match, filename) => {
    const blob = media.get(filename);
    if (blob) {
      return `<span class="sound-reference" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:#374151;border-radius:4px;color:#9ca3af;font-size:12px;">🔊 ${filename}</span>`;
    }
    return `<span class="missing-media" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:#374151;border:1px dashed #6b7280;border-radius:4px;color:#9ca3af;font-size:12px;">🔇 ${filename}</span>`;
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
    // Return a placeholder for missing notes
    return {
      id: card.id,
      noteId: card.noteId,
      deckId: card.deckId,
      deckName: collection.decks.get(card.deckId)?.name || 'Unknown',
      modelName: 'Unknown',
      type: 'basic',
      front: '<span class="warning">⚠️ Note not found</span>',
      back: '<span class="warning">Note data is missing</span>',
      fields: [],
      tags: [],
      css: ''
    };
  }
  
  const model = collection.models.get(note.modelId);
  const deck = collection.decks.get(card.deckId);
  
  // If model not found, create a fallback rendering from raw fields
  if (!model) {
    console.warn(`Model ${note.modelId} not found for note ${note.id}, using fallback rendering`);
    
    // Check if it looks like a cloze card (has {{c1::...}} pattern)
    const firstField = note.fields[0] || '';
    const isCloze = /\{\{c\d+::/.test(firstField);
    
    if (isCloze) {
      // Render as cloze
      const clozeOrdinal = card.ordinal + 1;
      const front = processCloze(firstField, clozeOrdinal, false);
      const back = processCloze(firstField, clozeOrdinal, true);
      const extra = note.fields[1] || '';
      
      return {
        id: card.id,
        noteId: card.noteId,
        deckId: card.deckId,
        deckName: deck?.name || 'Unknown',
        modelName: `Unknown Model (${note.modelId})`,
        type: 'cloze',
        front: await processMediaReferences(front, collection.media),
        back: await processMediaReferences(back + (extra ? `<hr><div class="extra">${extra}</div>` : ''), collection.media),
        fields: note.fields.map((value, i) => ({ name: `Field ${i + 1}`, value })),
        tags: note.tags,
        css: ''
      };
    } else {
      // Render as basic card - first field is front, second is back
      const front = note.fields[0] || '(empty)';
      const back = note.fields[1] || note.fields[0] || '(empty)';
      
      return {
        id: card.id,
        noteId: card.noteId,
        deckId: card.deckId,
        deckName: deck?.name || 'Unknown',
        modelName: `Unknown Model (${note.modelId})`,
        type: 'basic',
        front: await processMediaReferences(front, collection.media),
        back: await processMediaReferences(back, collection.media),
        fields: note.fields.map((value, i) => ({ name: `Field ${i + 1}`, value })),
        tags: note.tags,
        css: ''
      };
    }
  }
  
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
      // Fallback: just show fields directly
      front = fields[0]?.value || '(empty)';
      back = fields[1]?.value || fields[0]?.value || '(empty)';
    } else {
      front = replaceFields(template.questionFormat, fields);
      back = replaceFields(template.answerFormat, fields);
    }
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
