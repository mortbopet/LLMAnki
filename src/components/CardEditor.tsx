import React from 'react';
import { RichTextField } from './RichTextField';
import type { SuggestedCard } from '../types';

interface CardEditorProps {
  card: SuggestedCard;
  onChange: (card: SuggestedCard) => void;
  onCancel: () => void;
  onSave: () => void;
}

/**
 * Card editor component for editing suggested cards.
 * Uses the shared RichTextField component for consistency.
 */
export const CardEditor: React.FC<CardEditorProps> = ({ card, onChange, onCancel, onSave }) => {
  const handleFieldChange = (fieldName: string, value: string) => {
    const newFields = card.fields.map(f =>
      f.name === fieldName ? { ...f, value } : f
    );
    onChange({ ...card, fields: newFields });
  };

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-700 border-b border-gray-600">
        <h4 className="font-medium">Edit Card</h4>
        <p className="text-xs text-gray-400 mt-1">Type: {card.type}</p>
      </div>

      <div className="p-4 space-y-4">
        {card.fields.map((field) => (
          <RichTextField
            key={field.name}
            label={field.name}
            value={field.value}
            onChange={(value: string) => handleFieldChange(field.name, value)}
            showClozeButton={card.type === 'cloze'}
            placeholder={`Enter ${field.name.toLowerCase()}...`}
            alwaysShowToolbar={true}
            minHeight="100px"
          />
        ))}

        {card.explanation && (
          <div className="p-3 bg-gray-700 rounded text-sm">
            <span className="font-medium text-gray-300">Why this format: </span>
            <span className="text-gray-400">{card.explanation}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
