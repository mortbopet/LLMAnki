import React, { useMemo, useRef, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, CreditCard, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { parseApkgFile } from '../utils/ankiParser';
import { useToastStore } from '../store/useToastStore';
import type { AnkiDeck } from '../types';

interface DeckNodeProps {
    deck: AnkiDeck;
    level: number;
    expanded: Set<number>;
    onToggle: (deckId: number) => void;
}

const DeckNode: React.FC<DeckNodeProps> = ({ deck, level, expanded, onToggle }) => {
    const selectedDeckId = useAppStore(state => state.selectedDeckId);
    const selectDeck = useAppStore(state => state.selectDeck);
    const collection = useAppStore(state => state.collection);
    const analyzingDeckId = useAppStore(state => state.analyzingDeckId);

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

    return (
        <div>
            <div
                className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-700'
                    }`}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={() => selectDeck(deck.id)}
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
                    <FolderOpen className="w-4 h-4 text-yellow-500" />
                ) : (
                    <Folder className="w-4 h-4 text-yellow-500" />
                )}

                <span className="flex-1 truncate text-sm">{displayName}</span>

                {isAnalyzing && (
                    <span title="Analyzing deck...">
                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    </span>
                )}

                {totalCount > 0 && (
                    <span className="flex items-center gap-1 text-xs text-gray-400" title={`${directCount} in this deck, ${totalCount} total including subdecks`}>
                        <CreditCard className="w-3 h-3" />
                        {hasChildren && directCount !== totalCount ? (
                            <span>{directCount}<span className="text-gray-500">/{totalCount}</span></span>
                        ) : (
                            <span>{totalCount}</span>
                        )}
                    </span>
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
    const addToast = useToastStore(state => state.addToast);
    const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
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
            addToast({
                type: 'success',
                title: 'Deck loaded successfully',
                message: `Found ${collection.decks.size} decks and ${collection.cards.size} cards`
            });
        } catch (error) {
            console.error('Failed to parse APKG file:', error);
            setIsLoadingCollection(false);
            setLoadingProgress(null);
            addToast({
                type: 'error',
                title: 'Failed to load deck',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }, [setCollection, addToast, setIsLoadingCollection, setLoadingProgress]);

    const handleFolderClick = () => {
        fileInputRef.current?.click();
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
            <div
                className="flex flex-col items-center justify-center h-full text-gray-400 p-4 cursor-pointer hover:text-gray-300 transition-colors"
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
        );
    }

    return (
        <div className="h-full overflow-y-auto p-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
                Decks
            </h3>
            {collection.deckTree.map(deck => (
                <DeckNode
                    key={deck.id}
                    deck={deck}
                    level={0}
                    expanded={expanded}
                    onToggle={handleToggle}
                />
            ))}
        </div>
    );
};
