import React, { useRef, useEffect, useCallback } from 'react';
import { Bold, Italic, Underline, Image, Type, List, ListOrdered, Undo, Redo } from 'lucide-react';
import type { SuggestedCard } from '../types';

interface CardEditorProps {
  card: SuggestedCard;
  onChange: (card: SuggestedCard) => void;
  onCancel: () => void;
  onSave: () => void;
}

export const CardEditor: React.FC<CardEditorProps> = ({ card, onChange, onCancel, onSave }) => {
  const editorRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  const handleFieldChange = useCallback((fieldName: string, value: string) => {
    const newFields = card.fields.map(f => 
      f.name === fieldName ? { ...f, value } : f
    );
    onChange({ ...card, fields: newFields });
  }, [card, onChange]);
  
  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
  }, []);
  
  const handlePaste = useCallback((e: React.ClipboardEvent, fieldName: string) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            const img = `<img src="${dataUrl}" alt="pasted image" />`;
            document.execCommand('insertHTML', false, img);
            
            // Update field value
            const editor = editorRefs.current.get(fieldName);
            if (editor) {
              handleFieldChange(fieldName, editor.innerHTML);
            }
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  }, [handleFieldChange]);
  
  const insertImage = useCallback((fieldName: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          
          const editor = editorRefs.current.get(fieldName);
          if (editor) {
            editor.focus();
            document.execCommand('insertHTML', false, `<img src="${dataUrl}" alt="inserted image" />`);
            handleFieldChange(fieldName, editor.innerHTML);
          }
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }, [handleFieldChange]);
  
  const handleInput = useCallback((fieldName: string, editor: HTMLDivElement) => {
    handleFieldChange(fieldName, editor.innerHTML);
  }, [handleFieldChange]);
  
  useEffect(() => {
    // Initialize editor content
    card.fields.forEach(field => {
      const editor = editorRefs.current.get(field.name);
      if (editor && editor.innerHTML !== field.value) {
        editor.innerHTML = field.value;
      }
    });
  }, []);
  
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-gray-700 border-b border-gray-600">
        <h4 className="font-medium">Edit Card</h4>
        <p className="text-xs text-gray-400 mt-1">Type: {card.type}</p>
      </div>
      
      <div className="p-4 space-y-4">
        {card.fields.map((field) => (
          <div key={field.name}>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {field.name}
            </label>
            
            {/* Toolbar */}
            <div className="flex items-center gap-1 mb-2 p-1 bg-gray-700 rounded">
              <button
                type="button"
                onClick={() => execCommand('bold')}
                className="p-1.5 hover:bg-gray-600 rounded"
                title="Bold (Ctrl+B)"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCommand('italic')}
                className="p-1.5 hover:bg-gray-600 rounded"
                title="Italic (Ctrl+I)"
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCommand('underline')}
                className="p-1.5 hover:bg-gray-600 rounded"
                title="Underline (Ctrl+U)"
              >
                <Underline className="w-4 h-4" />
              </button>
              
              <div className="w-px h-5 bg-gray-600 mx-1" />
              
              <button
                type="button"
                onClick={() => execCommand('insertUnorderedList')}
                className="p-1.5 hover:bg-gray-600 rounded"
                title="Bullet List"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCommand('insertOrderedList')}
                className="p-1.5 hover:bg-gray-600 rounded"
                title="Numbered List"
              >
                <ListOrdered className="w-4 h-4" />
              </button>
              
              <div className="w-px h-5 bg-gray-600 mx-1" />
              
              <button
                type="button"
                onClick={() => insertImage(field.name)}
                className="p-1.5 hover:bg-gray-600 rounded"
                title="Insert Image"
              >
                <Image className="w-4 h-4" />
              </button>
              
              <div className="w-px h-5 bg-gray-600 mx-1" />
              
              <button
                type="button"
                onClick={() => execCommand('undo')}
                className="p-1.5 hover:bg-gray-600 rounded"
                title="Undo (Ctrl+Z)"
              >
                <Undo className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => execCommand('redo')}
                className="p-1.5 hover:bg-gray-600 rounded"
                title="Redo (Ctrl+Y)"
              >
                <Redo className="w-4 h-4" />
              </button>
              
              <div className="flex-1" />
              
              {card.type === 'cloze' && (
                <button
                  type="button"
                  onClick={() => {
                    const selection = window.getSelection();
                    if (selection && selection.toString()) {
                      const clozeNum = (field.value.match(/\{\{c(\d+)::/g) || []).length + 1;
                      const clozeText = `{{c${clozeNum}::${selection.toString()}}}`;
                      execCommand('insertText', clozeText);
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded"
                  title="Create Cloze (select text first)"
                >
                  <Type className="w-3 h-3" />
                  Cloze
                </button>
              )}
            </div>
            
            {/* Editor */}
            <div
              ref={(el) => {
                if (el) editorRefs.current.set(field.name, el);
              }}
              contentEditable
              className="editor-content min-h-[100px] p-3"
              onInput={(e) => handleInput(field.name, e.currentTarget)}
              onPaste={(e) => handlePaste(e, field.name)}
              suppressContentEditableWarning
            />
          </div>
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
