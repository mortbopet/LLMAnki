import React, { useMemo, useRef, useCallback, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, CreditCard, Loader2, Plus, FolderPlus, MoreVertical, Trash2, Edit2, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../store/useAppStore';
import { parseApkgFile } from '../utils/ankiParser';
import type { AnkiDeck } from '../types';

interface DeckNodeProps {
    deck: AnkiDeck;
    level: number;
    expanded: Set<number>;
    onToggle: (deckId: number) => void;
    onCreateSubdeck: (parentId: number) => void;
    onDelete: (deckId: number) => void;
    onRename: (deckId: number, newName: string) => void;
    isGenerated: boolean;
}

const DeckNode: React.FC<DeckNodeProps> = ({ deck, level, expanded, onToggle, onCreateSubdeck, onDelete, onRename, isGenerated }) => {
    const selectedDeckId = useAppStore(state => state.selectedDeckId);
    const selectDeck = useAppStore(state => state.selectDeck);
    const collection = useAppStore(state => state.collection);
    const analyzingDeckId = useAppStore(state => state.analyzingDeckId);
    const generatedDeckIds = useAppStore(state => state.generatedDeckIds);

    const [showMenu, setShowMenu] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');

    const isExpanded = expanded.has(deck.id);
    const isSelected = selectedDeckId === deck.id;
    const hasChildren = deck.children.length > 0;
    const isAnalyzing = analyzingDeckId === deck.id;

    // Get all deck IDs including this deck and all descendants
    const getAllDeckIds = (d: AnkiDeck): number[] => {
        return [d.id, ...d.children.flatMap(child => getAllDeckIds(child))];
    };

    const { directCount, totalCount } = useMemo(() => {
        if (!collection) return { directCount: 0, totalCount: 0 };

        const cards = Array.from(collection.cards.values());
        const direct = cards.filter(c => c.deckId === deck.id).length;

        const allDeckIds = new Set(getAllDeckIds(deck));
        const total = cards.filter(c => allDeckIds.has(c.deckId)).length;

        return { directCount: direct, totalCount: total };
    }, [collection, deck]);

    const displayName = deck.name.includes('::')
        ? deck.name.split('::').pop()
        : deck.name;

    const handleStartRename = () => {
        setRenameValue(displayName || deck.name);
        setIsRenaming(true);
        setShowMenu(false);
    };

    const handleConfirmRename = () => {
        if (renameValue.trim()) {
            onRename(deck.id, renameValue.trim());
        }
        setIsRenaming(false);
    };

    const handleCancelRename = () => {
        setIsRenaming(false);
        setRenameValue('');
    };

    return (
        <div>
            <div
                className={`group flex items-center gap-1 py-1 px-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'
                    }`}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={() => !isRenaming && selectDeck(deck.id)}
            >
                {hasChildren ? (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle(deck.id);
                        }}
                        className="p-0.5 hover:bg-gray-600 rounded"
                    >
                        {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                    </button>
                ) : (
                    <span className="w-5" />
                )}

                {isExpanded || !hasChildren ? (
                    <FolderOpen className={`w-4 h-4 ${isGenerated ? 'text-green-500' : 'text-yellow-500'}`} />
                ) : (
                    <Folder className={`w-4 h-4 ${isGenerated ? 'text-green-500' : 'text-yellow-500'}`} />
                )}

                {isRenaming ? (
                    <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                        <input
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleConfirmRename();
                                if (e.key === 'Escape') handleCancelRename();
                            }}
                            className="flex-1 px-1 py-0.5 text-sm bg-gray-800 border border-gray-600 rounded text-white"
                            autoFocus
                        />
                        <button onClick={handleConfirmRename} className="p-0.5 hover:bg-gray-600 rounded">
                            <Check className="w-3 h-3 text-green-400" />
                        </button>
                        <button onClick={handleCancelRename} className="p-0.5 hover:bg-gray-600 rounded">
                            <X className="w-3 h-3 text-red-400" />
                        </button>
                    </div>
                ) : (
                    <span className="flex-1 truncate text-sm">{displayName}</span>
                )}

                {isAnalyzing && (
                    <span title="Analyzing deck...">
                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    </span>
                )}

                {!isRenaming && totalCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-400" title={`${directCount} in this deck, ${totalCount} total including subdecks`}>
                        <CreditCard className="w-3 h-3" />
                        {hasChildren && directCount !== totalCount ? (
                            <span>{directCount}<span className="text-gray-500">/{totalCount}</span></span>
                        ) : (
                            <span>{totalCount}</span>
                        )}
                    </span>
                )}

                {!isRenaming && (
                    <div className="relative">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMenu(!showMenu);
                            }}
                            className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${isSelected ? 'hover:bg-blue-500' : 'hover:bg-gray-600'}`}
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>

                        {showMenu && (
                            <div
                                className="absolute right-0 top-6 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-[140px]"
                                onClick={e => e.stopPropagation()}
                            >
                                <button
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2"
                                    onClick={() => {
                                        onCreateSubdeck(deck.id);
                                        setShowMenu(false);
                                    }}
                                >
                                    <FolderPlus className="w-4 h-4" />
                                    New Subdeck
                                </button>
                                <button
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2"
                                    onClick={handleStartRename}
                                >
                                    <Edit2 className="w-4 h-4" />
                                    Rename
                                </button>
                                {deck.id !== 1 && (
                                    <button
                                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2 text-red-400"
                                        onClick={() => {
                                            onDelete(deck.id);
                                            setShowMenu(false);
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Delete
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {isExpanded && hasChildren && (
                <div>
                    {deck.children.map(child => (
                        <DeckNode
                            key={child.id}
                            deck={child}
                            level={level + 1}
                            expanded={expanded}
                            onToggle={onToggle}
                            onCreateSubdeck={onCreateSubdeck}
                            onDelete={onDelete}
                            onRename={onRename}
                            isGenerated={generatedDeckIds.has(child.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const DeckBrowser: React.FC = () => {
    const collection = useAppStore(state => state.collection);
    const setCollection = useAppStore(state => state.setCollection);
    const setIsLoadingCollection = useAppStore(state => state.setIsLoadingCollection);
    const setLoadingProgress = useAppStore(state => state.setLoadingProgress);
    const createDeck = useAppStore(state => state.createDeck);
    const createSubdeck = useAppStore(state => state.createSubdeck);
    const deleteDeckAction = useAppStore(state => state.deleteDeck);
    const renameDeck = useAppStore(state => state.renameDeck);
    const generatedDeckIds = useAppStore(state => state.generatedDeckIds);
    const createEmptyCollection = useAppStore(state => state.createEmptyCollection);

    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [isCreatingDeck, setIsCreatingDeck] = useState(false);
    const [newDeckName, setNewDeckName] = useState('');
    const [pendingSubdeckParent, setPendingSubdeckParent] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoadingCollection(true);
        setLoadingProgress('Reading file...');

        try {
            const collection = await parseApkgFile(file, (progress) => {
                setLoadingProgress(progress);
            });
            setCollection(collection, file.name);
            toast.success('Deck loaded successfully', {
                description: `Found ${collection.decks.size} decks and ${collection.cards.size} cards`
            });
        } catch (error) {
            console.error('Failed to parse APKG file:', error);
            setIsLoadingCollection(false);
            setLoadingProgress(null);
            toast.error('Failed to load deck', {
                description: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }, [setCollection, setIsLoadingCollection, setLoadingProgress]);

    const handleFolderClick = () => {
        fileInputRef.current?.click();
    };

    const handleCreateDeck = () => {
        if (!newDeckName.trim()) return;

        if (pendingSubdeckParent !== null) {
            const deckId = createSubdeck(pendingSubdeckParent, newDeckName.trim());
            if (deckId) {
                toast.success('Subdeck created', { description: newDeckName.trim() });
                // Auto-expand parent
                setExpanded(prev => new Set([...prev, pendingSubdeckParent]));
            }
        } else {
            const deckId = createDeck(newDeckName.trim());
            if (deckId) {
                toast.success('Deck created', { description: newDeckName.trim() });
            }
        }

        setNewDeckName('');
        setIsCreatingDeck(false);
        setPendingSubdeckParent(null);
    };

    const handleStartCreateDeck = () => {
        if (!collection) {
            createEmptyCollection();
        }
        setIsCreatingDeck(true);
        setPendingSubdeckParent(null);
    };

    const handleStartCreateSubdeck = (parentId: number) => {
        setIsCreatingDeck(true);
        setPendingSubdeckParent(parentId);
        setNewDeckName('');
    };

    const handleDeleteDeck = (deckId: number) => {
        const deck = collection?.decks.get(deckId);
        if (!deck) return;

        // Simple confirm for now
        if (confirm(`Delete "${deck.name.split('::').pop()}"? Cards will be moved to the Default deck.`)) {
            deleteDeckAction(deckId, false, false);
            toast.success('Deck deleted');
        }
    };

    const handleRenameDeck = (deckId: number, newName: string) => {
        renameDeck(deckId, newName);
        toast.success('Deck renamed');
    };

    // Auto-expand all decks with children on initial load
    React.useEffect(() => {
        if (collection) {
            const expandAll = (decks: AnkiDeck[]): number[] => {
                const ids: number[] = [];
                for (const deck of decks) {
                    if (deck.children.length > 0) {
                        ids.push(deck.id);
                        ids.push(...expandAll(deck.children));
                    }
                }
                return ids;
            };
            setExpanded(new Set(expandAll(collection.deckTree)));
        }
    }, [collection]);

    const handleToggle = (deckId: number) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(deckId)) {
                next.delete(deckId);
            } else {
                next.add(deckId);
            }
            return next;
        });
    };

    if (!collection) {
        return (
            <div className="flex flex-col h-full">
                <div
                    className="flex flex-col items-center justify-center flex-1 text-gray-400 p-4 cursor-pointer hover:text-gray-300 transition-colors"
                    onClick={handleFolderClick}
                >
                    <Folder className="w-12 h-12 mb-2 opacity-50 hover:opacity-75 transition-opacity" />
                    <p className="text-sm text-center">Load an Anki deck to browse cards</p>
                    <p className="text-xs text-center mt-1 text-blue-400">Click to open file browser</p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".apkg"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </div>
                <div className="p-2 border-t border-gray-700">
                    <button
                        onClick={handleStartCreateDeck}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Create New Deck
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-2">
                <div className="flex items-center justify-between mb-2 px-2">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Decks
                    </h3>
                    <button
                        onClick={handleStartCreateDeck}
                        className="p-1 hover:bg-gray-700 rounded transition-colors"
                        title="Create new deck"
                    >
                        <Plus className="w-4 h-4 text-gray-400 hover:text-white" />
                    </button>
                </div>

                {isCreatingDeck && (
                    <div className="mb-2 px-2">
                        <div className="flex items-center gap-1 p-2 bg-gray-800 rounded border border-gray-700">
                            <FolderPlus className="w-4 h-4 text-green-500" />
                            <input
                                type="text"
                                value={newDeckName}
                                onChange={e => setNewDeckName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleCreateDeck();
                                    if (e.key === 'Escape') {
                                        setIsCreatingDeck(false);
                                        setNewDeckName('');
                                        setPendingSubdeckParent(null);
                                    }
                                }}
                                placeholder={pendingSubdeckParent ? 'Subdeck name...' : 'Deck name...'}
                                className="flex-1 px-1 py-0.5 text-sm bg-transparent border-none outline-none text-white placeholder-gray-500"
                                autoFocus
                            />
                            <button onClick={handleCreateDeck} className="p-0.5 hover:bg-gray-600 rounded">
                                <Check className="w-4 h-4 text-green-400" />
                            </button>
                            <button
                                onClick={() => {
                                    setIsCreatingDeck(false);
                                    setNewDeckName('');
                                    setPendingSubdeckParent(null);
                                }}
                                className="p-0.5 hover:bg-gray-600 rounded"
                            >
                                <X className="w-4 h-4 text-red-400" />
                            </button>
                        </div>
                        {pendingSubdeckParent && (
                            <p className="text-xs text-gray-500 mt-1 ml-6">
                                Creating subdeck under: {collection.decks.get(pendingSubdeckParent)?.name.split('::').pop()}
                            </p>
                        )}
                    </div>
                )}

                {collection.deckTree.map(deck => (
                    <DeckNode
                        key={deck.id}
                        deck={deck}
                        level={0}
                        expanded={expanded}
                        onToggle={handleToggle}
                        onCreateSubdeck={handleStartCreateSubdeck}
                        onDelete={handleDeleteDeck}
                        onRename={handleRenameDeck}
                        isGenerated={generatedDeckIds.has(deck.id)}
                    />
                ))}
            </div>

            <div className="p-2 border-t border-gray-700">
                <button
                    onClick={handleFolderClick}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                >
                    <Folder className="w-3 h-3" />
                    Load .apkg file
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".apkg"
                    onChange={handleFileChange}
                    className="hidden"
                />
            </div>
        </div>
    );
};
