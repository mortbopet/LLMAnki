import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageResize from 'tiptap-extension-resize-image';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough, Image as ImageIcon,
    List, ListOrdered, Undo, Redo, Type, Link as LinkIcon,
    AlignLeft, AlignCenter, AlignRight, Subscript as SubIcon, Superscript as SuperIcon,
    Highlighter, Code
} from 'lucide-react';

interface RichTextFieldProps {
    /** Field label displayed above the editor */
    label: string;
    /** Current HTML value */
    value: string;
    /** Called when the value changes */
    onChange: (value: string) => void;
    /** Whether to show the cloze button (for cloze card types) */
    showClozeButton?: boolean;
    /** Optional placeholder text */
    placeholder?: string;
    /** Minimum height of the editor */
    minHeight?: string;
    /** Whether to always show the toolbar (vs only on focus) */
    alwaysShowToolbar?: boolean;
    /** Optional additional class name for the container */
    className?: string;
}

/**
 * A rich text field editor using TipTap.
 * Provides formatting, lists, images, and cloze deletion support.
 */
export const RichTextField: React.FC<RichTextFieldProps> = ({
    label,
    value,
    onChange,
    showClozeButton = false,
    placeholder = '(empty)',
    minHeight = '80px',
    alwaysShowToolbar = false,
    className = ''
}) => {
    const [isFocused, setIsFocused] = useState(false);
    // Track whether user has made any changes (vs editor initialization/normalization)
    const hasUserEdited = useRef(false);
    // Track the last value we sent via onChange to avoid duplicate calls
    const lastEmittedValue = useRef(value);
    // Track if this is the initial mount
    const isInitialMount = useRef(true);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false, // Disable headings for Anki cards
            }),
            ImageResize.configure({
                inline: true,
                allowBase64: true,
            }),
            Placeholder.configure({
                placeholder,
                emptyEditorClass: 'is-editor-empty',
            }),
            Underline,
            Link.configure({
                openOnClick: false, // Don't open links when editing
                HTMLAttributes: {
                    class: 'text-blue-400 underline cursor-pointer',
                },
            }),
            TextAlign.configure({
                types: ['paragraph'],
            }),
            Subscript,
            Superscript,
            Highlight.configure({
                multicolor: false,
            }),
            TextStyle,
            Color,
        ],
        content: value,
        editorProps: {
            attributes: {
                class: 'prose prose-invert max-w-none focus:outline-none',
                style: `min-height: ${minHeight}`,
            },
            handlePaste: (view, event) => {
                const items = event.clipboardData?.items;
                if (!items) return false;

                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        event.preventDefault();
                        const file = item.getAsFile();
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                const dataUrl = e.target?.result as string;
                                view.dispatch(
                                    view.state.tr.replaceSelectionWith(
                                        view.state.schema.nodes.image.create({ src: dataUrl })
                                    )
                                );
                            };
                            reader.readAsDataURL(file);
                        }
                        return true;
                    }
                }
                return false;
            },
            // Mark that user is actively editing when they type/interact
            handleKeyDown: () => {
                hasUserEdited.current = true;
                return false; // Don't prevent default
            },
            handleClick: () => {
                // Don't mark as edited on click alone
                return false;
            },
        },
        onUpdate: ({ editor }) => {
            // Only emit changes if user has actually edited
            // This prevents false positives from TipTap normalizing content on init
            if (!hasUserEdited.current) return;

            const html = editor.getHTML();
            // TipTap returns <p></p> for empty content, normalize to empty string
            const normalizedHtml = html === '<p></p>' ? '' : html;

            // Only call onChange if value actually changed from what we last emitted
            if (normalizedHtml !== lastEmittedValue.current) {
                lastEmittedValue.current = normalizedHtml;
                onChange(normalizedHtml);
            }
        },
        onFocus: () => setIsFocused(true),
        onBlur: () => setIsFocused(false),
        onTransaction: ({ transaction }) => {
            // Mark as edited when the document actually changes (not just selection)
            // This catches image resizing and other programmatic changes
            if (transaction.docChanged) {
                hasUserEdited.current = true;
            }
        },
    });

    // Update editor content when value prop changes externally
    useEffect(() => {
        if (editor) {
            const currentHtml = editor.getHTML();
            const normalizedCurrent = currentHtml === '<p></p>' ? '' : currentHtml;
            // Only update if the value is actually different from what's in the editor
            // This prevents fighting with user input while they're typing
            if (normalizedCurrent !== value && lastEmittedValue.current !== value) {
                // Reset edit tracking when content is set externally (e.g., revert)
                hasUserEdited.current = false;
                lastEmittedValue.current = value;
                editor.commands.setContent(value || '');
            }
        }
    }, [editor, value]);

    // Reset hasUserEdited when component receives new value prop (e.g., switching cards)
    useEffect(() => {
        hasUserEdited.current = false;
        lastEmittedValue.current = value;
        isInitialMount.current = false;
    }, [value]);

    // Helper to mark that user has edited before running a command
    const runWithEditMark = useCallback((command: () => void) => {
        hasUserEdited.current = true;
        command();
    }, []);

    const insertImage = useCallback(() => {
        if (!editor) return;
        hasUserEdited.current = true;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target?.result as string;
                    editor.chain().focus().setImage({ src: dataUrl }).run();
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    }, [editor]);

    const handleInsertCloze = useCallback(() => {
        if (!editor) return;
        hasUserEdited.current = true;

        const { from, to } = editor.state.selection;
        if (from === to) return; // No selection

        const selectedText = editor.state.doc.textBetween(from, to);

        // Find the highest cloze number in the current value
        const clozeMatches = value.match(/\{\{c(\d+)::/g) || [];
        const maxClozeNum = clozeMatches.reduce((max, match) => {
            const num = parseInt(match.match(/\d+/)?.[0] || '0', 10);
            return Math.max(max, num);
        }, 0);
        const clozeNum = maxClozeNum + 1;
        const clozeText = `{{c${clozeNum}::${selectedText}}}`;

        editor.chain().focus().deleteSelection().insertContent(clozeText).run();
    }, [editor, value]);

    const handleInsertLink = useCallback(() => {
        if (!editor) return;
        hasUserEdited.current = true;

        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('Enter URL:', previousUrl || 'https://');

        if (url === null) return; // Cancelled

        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
        } else {
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }
    }, [editor]);

    const showToolbar = alwaysShowToolbar || isFocused;

    if (!editor) {
        return null;
    }

    return (
        <div className={`rich-text-field ${className}`}>
            <label className="block text-sm font-medium text-gray-300 mb-2">
                {label}
            </label>

            {/* Toolbar */}
            <div
                className={`flex flex-wrap items-center gap-1 mb-2 p-1 bg-gray-700 rounded transition-all duration-75 ${showToolbar ? 'opacity-100' : 'opacity-0 max-h-0 overflow-hidden mb-0 p-0'
                    }`}
                onMouseDown={(e) => e.preventDefault()} // Prevent blur
            >
                {/* Text formatting */}
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().toggleBold().run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive('bold') ? 'bg-gray-600' : ''}`}
                    title="Bold (Ctrl+B)"
                >
                    <Bold className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().toggleItalic().run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive('italic') ? 'bg-gray-600' : ''}`}
                    title="Italic (Ctrl+I)"
                >
                    <Italic className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().toggleUnderline().run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive('underline') ? 'bg-gray-600' : ''}`}
                    title="Underline (Ctrl+U)"
                >
                    <UnderlineIcon className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().toggleStrike().run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive('strike') ? 'bg-gray-600' : ''}`}
                    title="Strikethrough"
                >
                    <Strikethrough className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().toggleHighlight().run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive('highlight') ? 'bg-gray-600' : ''}`}
                    title="Highlight"
                >
                    <Highlighter className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().toggleCode().run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive('code') ? 'bg-gray-600' : ''}`}
                    title="Inline Code"
                >
                    <Code className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-gray-600 mx-1" />

                {/* Sub/Superscript */}
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().toggleSubscript().run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive('subscript') ? 'bg-gray-600' : ''}`}
                    title="Subscript"
                >
                    <SubIcon className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().toggleSuperscript().run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive('superscript') ? 'bg-gray-600' : ''}`}
                    title="Superscript"
                >
                    <SuperIcon className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-gray-600 mx-1" />

                {/* Text alignment */}
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().setTextAlign('left').run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive({ textAlign: 'left' }) ? 'bg-gray-600' : ''}`}
                    title="Align Left"
                >
                    <AlignLeft className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().setTextAlign('center').run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive({ textAlign: 'center' }) ? 'bg-gray-600' : ''}`}
                    title="Align Center"
                >
                    <AlignCenter className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().setTextAlign('right').run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive({ textAlign: 'right' }) ? 'bg-gray-600' : ''}`}
                    title="Align Right"
                >
                    <AlignRight className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-gray-600 mx-1" />

                {/* Lists */}
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().toggleBulletList().run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive('bulletList') ? 'bg-gray-600' : ''}`}
                    title="Bullet List"
                >
                    <List className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().toggleOrderedList().run())}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive('orderedList') ? 'bg-gray-600' : ''}`}
                    title="Numbered List"
                >
                    <ListOrdered className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-gray-600 mx-1" />

                {/* Insert */}
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={handleInsertLink}
                    className={`p-1.5 hover:bg-gray-600 rounded ${editor.isActive('link') ? 'bg-gray-600' : ''}`}
                    title="Insert Link"
                >
                    <LinkIcon className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={insertImage}
                    className="p-1.5 hover:bg-gray-600 rounded"
                    title="Insert Image"
                >
                    <ImageIcon className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-gray-600 mx-1" />

                {/* Undo/Redo */}
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().undo().run())}
                    disabled={!editor.can().undo()}
                    className="p-1.5 hover:bg-gray-600 rounded disabled:opacity-50"
                    title="Undo (Ctrl+Z)"
                >
                    <Undo className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => runWithEditMark(() => editor.chain().focus().redo().run())}
                    disabled={!editor.can().redo()}
                    className="p-1.5 hover:bg-gray-600 rounded disabled:opacity-50"
                    title="Redo (Ctrl+Y)"
                >
                    <Redo className="w-4 h-4" />
                </button>

                <div className="flex-1" />

                {showClozeButton && (
                    <button
                        type="button"
                        tabIndex={-1}
                        onClick={handleInsertCloze}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded"
                        title="Create Cloze (select text first)"
                    >
                        <Type className="w-3 h-3" />
                        Cloze
                    </button>
                )}
            </div>

            {/* Editor */}
            <EditorContent
                editor={editor}
                className="p-3 bg-gray-800 border border-gray-600 rounded-lg focus-within:border-blue-500 transition-colors [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:text-gray-500 [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none"
            />
        </div>
    );
};
