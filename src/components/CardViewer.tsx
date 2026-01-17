import React, { useState, useEffect } from 'react';
import { Tag, FileText, Calendar, BarChart3, History, Trash2, Undo2, Pencil } from 'lucide-react';
import { RichTextField } from './RichTextField';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Scatter, ScatterChart, ZAxis
} from 'recharts';
import type { RenderedCard, SuggestedCard, CardType, ReviewLogEntry } from '../types';
import { getCardTypeName } from '../utils/cardRenderer';
import { useAppStore } from '../store/useAppStore';

type ViewerTab = 'content' | 'scheduling' | 'history' | 'fields';
type ChartTab = 'ease' | 'interval' | 'rating' | 'time';

interface CardViewerProps {
    card: RenderedCard | SuggestedCard;
    title?: string;
    isSuggestion?: boolean;
    onUpdateFields?: (cardId: number, fields: { name: string; value: string }[]) => void;
    editedFields?: { name: string; value: string }[];
    isEdited?: boolean;
    onRestoreEdits?: (cardId: number) => void;
}

// Helper to format queue type
function getQueueName(queue: number): string {
    switch (queue) {
        case -3: return 'Sched buried';
        case -2: return 'User buried';
        case -1: return 'Suspended';
        case 0: return 'New';
        case 1: return 'Learning';
        case 2: return 'Review';
        case 3: return 'Day learn (relearn)';
        case 4: return 'Preview';
        default: return `Unknown (${queue})`;
    }
}

// Helper to format review type
function getReviewTypeName(type: number): string {
    switch (type) {
        case 0: return 'Learn';
        case 1: return 'Review';
        case 2: return 'Relearn';
        case 3: return 'Filtered';
        case 4: return 'Manual';
        default: return `Unknown`;
    }
}

// Helper to format rating
function getRatingName(ease: number): string {
    switch (ease) {
        case 0: return 'Manual';
        case 1: return 'Again';
        case 2: return 'Hard';
        case 3: return 'Good';
        case 4: return 'Easy';
        default: return `${ease}`;
    }
}

// Helper to format interval (handles both positive days and negative seconds)
function formatInterval(interval: number): string {
    if (interval === 0) return 'New card';
    if (interval < 0) return `${-interval} seconds`;
    if (interval === 1) return '1 day';
    if (interval < 30) return `${interval} days`;
    if (interval < 365) return `${(interval / 30).toFixed(2)} months`;
    return `${(interval / 365).toFixed(2)} years`;
}

// Helper to format ease factor
function formatEase(factor: number): string {
    if (factor === 0) return 'N/A';
    return `${(factor / 10).toFixed(0)}%`;
}

// Helper to format timestamp to date string
function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0];
}

// Helper to format timestamp to date and time
function formatDateTime(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.toISOString().split('T')[0]} @ ${date.toTimeString().slice(0, 5)}`;
}

// Helper to format milliseconds to readable time
function formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(2)}s`;
    const minutes = seconds / 60;
    return `${minutes.toFixed(2)} minutes`;
}

// Helper to format short date for X axis
function formatShortDate(timestamp: number): string {
    const date = new Date(timestamp);
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate();
    const year = date.getFullYear().toString().slice(2);
    return `${month} ${day}, '${year}`;
}

// Rating color mapping
function getRatingColor(ease: number): string {
    switch (ease) {
        case 1: return '#EF4444'; // red - Again
        case 2: return '#F59E0B'; // yellow - Hard
        case 3: return '#22C55E'; // green - Good
        case 4: return '#3B82F6'; // blue - Easy
        default: return '#6B7280';
    }
}

// Custom tooltip for recharts
const CustomTooltip = ({ active, payload, formatValue }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 shadow-lg">
                <p className="text-xs text-gray-400">{formatShortDate(data.timestamp)}</p>
                <p className="text-sm text-white font-medium">
                    {formatValue ? formatValue(payload[0].value, data) : payload[0].value}
                </p>
            </div>
        );
    }
    return null;
};

export const CardViewer: React.FC<CardViewerProps> = ({
    card,
    title,
    isSuggestion = false,
    onUpdateFields,
    editedFields,
    isEdited = false,
    onRestoreEdits
}) => {
    const [activeTab, setActiveTab] = useState<ViewerTab>('content');
    const [chartTab, setChartTab] = useState<ChartTab>('ease');
    const [localFields, setLocalFields] = useState<{ name: string; value: string }[]>([]);
    const [editedBadgeHovered, setEditedBadgeHovered] = useState(false);

    // For delete button functionality
    const deleteCard = useAppStore(state => state.deleteCard);
    const restoreCard = useAppStore(state => state.restoreCard);
    const cards = useAppStore(state => state.cards);
    const getCard = useAppStore(state => state.getCard);

    // Handle both RenderedCard and SuggestedCard formats
    const isRenderedCard = 'front' in card && 'back' in card;

    let cardType: CardType;
    let css = '';
    let tags: string[] = [];
    // Base fields from the card object (may be stale if edited)
    let cardFields: { name: string; value: string }[] = [];

    // Scheduling data (only for rendered cards)
    let hasSchedulingData = false;
    let queue = 0;
    let interval = 0;
    let factor = 2500;
    let reps = 0;
    let lapses = 0;

    // Extended scheduling info
    let cardCreated = 0;
    let firstReview: number | null = null;
    let lastReview: number | null = null;
    let totalTime = 0;
    let reviewHistory: ReviewLogEntry[] = [];

    if (isRenderedCard) {
        const rc = card as RenderedCard;
        cardType = rc.type;
        css = rc.css;
        tags = rc.tags;
        cardFields = rc.fields;

        // Get scheduling data
        hasSchedulingData = true;
        queue = rc.queue;
        interval = rc.interval;
        factor = rc.factor;
        reps = rc.reps;
        lapses = rc.lapses;

        // Extended data
        cardCreated = rc.cardCreated;
        firstReview = rc.firstReview;
        lastReview = rc.lastReview;
        totalTime = rc.totalTime;
        reviewHistory = rc.reviewHistory || [];
    } else {
        const sc = card as SuggestedCard;
        cardType = sc.type;
        cardFields = sc.fields;
    }

    // Compute average time per review
    const avgTime = reps > 0 ? totalTime / reps : 0;

    // Only show tabs for rendered cards (not suggestions)
    const showTabs = isRenderedCard && !isSuggestion;

    // Get card ID for delete functionality and field updates (only for rendered cards)
    const cardId = isRenderedCard ? (card as RenderedCard).id : null;
    
    // Get card state from the store
    const cardState = cardId !== null ? cards.get(cardId) : null;
    const domainCard = cardId !== null ? getCard(cardId) : null;
    const isMarked = cardState?.isDeleted ?? false;
    const isGenerated = cardState?.origin === 'generated';

    // Compute the effective fields to display:
    // - If edited, use editedFields from store
    // - Otherwise, get original fields from the store (which is the source of truth)
    const effectiveFields = React.useMemo(() => {
        if (isEdited && editedFields) {
            return editedFields;
        }
        // For rendered cards, get the original fields from the domain card
        if (domainCard) {
            return domainCard.originalFields;
        }
        // Fallback to card fields
        return cardFields;
    }, [isEdited, editedFields, domainCard, cardFields]);

    // Initialize local fields from effective fields
    // This effect ensures local state syncs with the source of truth
    useEffect(() => {
        setLocalFields(effectiveFields.map(f => ({ ...f })));
    }, [effectiveFields]);

    // Handle field change
    const handleFieldChange = (index: number, newValue: string) => {
        const newFields = [...localFields];
        newFields[index] = { ...newFields[index], value: newValue };
        setLocalFields(newFields);

        // Notify parent to persist the change
        if (onUpdateFields && cardId !== null) {
            onUpdateFields(cardId, newFields);
        }
    };

    // Handle restore edits - unified handler for the revert button
    const handleRestoreEdits = () => {
        if (cardId !== null && onRestoreEdits) {
            onRestoreEdits(cardId);
        }
    };

    const handleToggleDelete = () => {
        if (cardId === null) return;

        // For generated cards, permanently delete them
        if (isGenerated) {
            deleteCard(cardId);
            return;
        }

        // For original cards, toggle mark for deletion
        if (isMarked) {
            restoreCard(cardId);
        } else {
            deleteCard(cardId);
        }
    };

    return (
        <div className={`rounded-lg overflow-hidden ${isMarked ? 'bg-red-900/30 border border-red-700' : 'bg-gray-800'}`}>
            {title && (
                <div className={`px-4 py-2 border-b flex items-center justify-between ${isMarked ? 'bg-red-900/50 border-red-700' : 'bg-gray-700 border-gray-600'}`}>
                    <h4 className="font-medium text-sm">{title}</h4>
                    <div className="flex items-center gap-2">
                        {/* Delete/Mark button - only for rendered cards, not suggestions */}
                        {isRenderedCard && !isSuggestion && (
                            <button
                                onClick={handleToggleDelete}
                                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${isMarked
                                    ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                                    : 'bg-red-600/80 hover:bg-red-600 text-red-100'
                                    }`}
                                title={isGenerated ? 'Permanently delete this generated card' : (isMarked ? 'Unmark for deletion' : 'Mark for deletion (will be excluded on export)')}
                            >
                                {isMarked && !isGenerated ? (
                                    <>
                                        <Undo2 className="w-3 h-3" />
                                        Restore
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-3 h-3" />
                                        {isGenerated ? 'Delete' : 'Delete'}
                                    </>
                                )}
                            </button>
                        )}
                        {/* Edited badge */}
                        {isEdited && isRenderedCard && !isSuggestion && (
                            <button
                                onClick={handleRestoreEdits}
                                onMouseEnter={() => setEditedBadgeHovered(true)}
                                onMouseLeave={() => setEditedBadgeHovered(false)}
                                className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${editedBadgeHovered
                                        ? 'bg-blue-600/80 text-blue-100 hover:bg-blue-500/80'
                                        : 'bg-yellow-600/80 text-yellow-100'
                                    }`}
                                title={editedBadgeHovered ? 'Restore original content' : 'Card has been edited'}
                            >
                                {editedBadgeHovered ? (
                                    <>
                                        <Undo2 className="w-3 h-3" />
                                        Revert
                                    </>
                                ) : (
                                    <>
                                        <Pencil className="w-3 h-3" />
                                        Edited
                                    </>
                                )}
                            </button>
                        )}
                        <span className={`px-2 py-0.5 text-xs rounded ${isSuggestion ? 'bg-green-600' : 'bg-blue-600'
                            }`}>
                            {getCardTypeName(cardType)}
                        </span>
                    </div>
                </div>
            )}

            {/* Tabs - only for rendered cards */}
            {showTabs && (
                <div className="flex border-b border-gray-600 bg-gray-750">
                    <button
                        onClick={() => setActiveTab('content')}
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${activeTab === 'content'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                            }`}
                    >
                        <FileText className="w-3.5 h-3.5" />
                        Content
                    </button>
                    <button
                        onClick={() => setActiveTab('scheduling')}
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${activeTab === 'scheduling'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                            }`}
                    >
                        <Calendar className="w-3.5 h-3.5" />
                        Info
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${activeTab === 'history'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                            }`}
                    >
                        <History className="w-3.5 h-3.5" />
                        Reviews
                    </button>
                    <button
                        onClick={() => setActiveTab('fields')}
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors ${activeTab === 'fields'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                            }`}
                    >
                        <BarChart3 className="w-3.5 h-3.5" />
                        Raw Fields
                    </button>
                </div>
            )}

            {/* Content Tab - Editable Fields */}
            {(!showTabs || activeTab === 'content') && (
                <>
                    {/* Tags */}
                    {!isSuggestion && tags.length > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2 text-xs text-gray-400 border-b border-gray-700">
                            <Tag className="w-3 h-3" />
                            {tags.join(', ')}
                        </div>
                    )}

                    <style>{css}</style>

                    {/* Editable Fields */}
                    <div className="p-4 space-y-4">
                        {localFields.map((field, index) => (
                            <RichTextField
                                key={field.name}
                                label={field.name}
                                value={field.value}
                                onChange={(newValue) => handleFieldChange(index, newValue)}
                                showClozeButton={cardType === 'cloze'}
                                placeholder={`Enter ${field.name.toLowerCase()}...`}
                                minHeight="80px"
                            />
                        ))}
                    </div>
                </>
            )}

            {/* Scheduling Tab - Card Info like Anki shows */}
            {showTabs && activeTab === 'scheduling' && hasSchedulingData && (
                <div className="p-4 space-y-4">
                    {/* Info Grid - matching Anki's card info display */}
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Added</span>
                            <span className="text-gray-200">{formatDate(cardCreated)}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">First Review</span>
                            <span className="text-gray-200">{firstReview ? formatDate(firstReview) : 'Never'}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Latest Review</span>
                            <span className="text-gray-200">{lastReview ? formatDate(lastReview) : 'Never'}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Reviews</span>
                            <span className="text-gray-200">{reps}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Lapses</span>
                            <span className={lapses > 0 ? 'text-orange-400' : 'text-gray-200'}>{lapses}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Average Time</span>
                            <span className="text-gray-200">{avgTime > 0 ? formatTime(avgTime) : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Total Time</span>
                            <span className="text-gray-200">{totalTime > 0 ? formatTime(totalTime) : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Card Type</span>
                            <span className="text-gray-200">{getCardTypeName(cardType)}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Note Type</span>
                            <span className="text-gray-200">{(card as RenderedCard).modelName}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Deck</span>
                            <span className="text-gray-200 text-right max-w-[200px] truncate" title={(card as RenderedCard).deckName}>
                                {(card as RenderedCard).deckName}
                            </span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Status</span>
                            <span className={`${queue === 0 ? 'text-blue-400' :
                                queue === 1 ? 'text-yellow-400' :
                                    queue === 2 ? 'text-green-400' :
                                        queue < 0 ? 'text-red-400' : 'text-gray-200'
                                }`}>
                                {getQueueName(queue)}
                            </span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Interval</span>
                            <span className="text-gray-200">{formatInterval(interval)}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Ease</span>
                            <span className="text-gray-200">{formatEase(factor)}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="text-gray-400 font-medium">Card ID</span>
                            <span className="text-gray-200 font-mono text-xs">{(card as RenderedCard).id}</span>
                        </div>
                        <div className="flex justify-between pb-1">
                            <span className="text-gray-400 font-medium">Note ID</span>
                            <span className="text-gray-200 font-mono text-xs">{(card as RenderedCard).noteId}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Review History Tab - with tabbed charts and table */}
            {showTabs && activeTab === 'history' && (
                <div className="p-4 space-y-4">
                    {reviewHistory.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            No review history available for this card.
                        </div>
                    ) : (
                        <>
                            {/* Chart Tabs */}
                            <div className="flex gap-1 border-b border-gray-700 pb-1">
                                {[
                                    { id: 'ease' as ChartTab, label: 'Ease', color: 'text-blue-400' },
                                    { id: 'interval' as ChartTab, label: 'Interval', color: 'text-green-400' },
                                    { id: 'rating' as ChartTab, label: 'Rating', color: 'text-yellow-400' },
                                    { id: 'time' as ChartTab, label: 'Time', color: 'text-purple-400' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setChartTab(tab.id)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${chartTab === tab.id
                                            ? `bg-gray-700 ${tab.color} border-b-2 border-current`
                                            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/50'
                                            }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Chart Area */}
                            <div className="bg-gray-700 rounded-lg p-4 h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    {chartTab === 'ease' ? (
                                        <LineChart data={reviewHistory.filter(r => r.factor > 0).map(r => ({
                                            timestamp: r.id,
                                            value: r.factor / 10,
                                            ease: r.ease
                                        }))}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                                            <XAxis
                                                dataKey="timestamp"
                                                tickFormatter={(ts) => formatShortDate(ts)}
                                                stroke="#9CA3AF"
                                                fontSize={11}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                domain={[130, 300]}
                                                tickFormatter={(v) => `${v}%`}
                                                stroke="#9CA3AF"
                                                fontSize={11}
                                                tickLine={false}
                                                width={45}
                                            />
                                            <Tooltip content={<CustomTooltip formatValue={(v: number) => `${v.toFixed(0)}%`} />} />
                                            <Line
                                                type="monotone"
                                                dataKey="value"
                                                stroke="#60A5FA"
                                                strokeWidth={2}
                                                dot={{ fill: '#60A5FA', r: 4 }}
                                                activeDot={{ r: 6, fill: '#3B82F6' }}
                                            />
                                        </LineChart>
                                    ) : chartTab === 'interval' ? (
                                        <LineChart data={reviewHistory.filter(r => r.interval > 0).map(r => ({
                                            timestamp: r.id,
                                            value: r.interval,
                                            ease: r.ease
                                        }))}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                                            <XAxis
                                                dataKey="timestamp"
                                                tickFormatter={(ts) => formatShortDate(ts)}
                                                stroke="#9CA3AF"
                                                fontSize={11}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                scale="log"
                                                domain={[1, 'auto']}
                                                tickFormatter={(v) => v >= 365 ? `${(v / 365).toFixed(0)}y` : v >= 30 ? `${(v / 30).toFixed(0)}mo` : `${v}d`}
                                                stroke="#9CA3AF"
                                                fontSize={11}
                                                tickLine={false}
                                                width={40}
                                            />
                                            <Tooltip content={<CustomTooltip formatValue={(v: number) => formatInterval(v)} />} />
                                            <Line
                                                type="monotone"
                                                dataKey="value"
                                                stroke="#22C55E"
                                                strokeWidth={2}
                                                dot={{ fill: '#22C55E', r: 4 }}
                                                activeDot={{ r: 6, fill: '#16A34A' }}
                                            />
                                        </LineChart>
                                    ) : chartTab === 'rating' ? (
                                        <ScatterChart data={reviewHistory.filter(r => r.ease > 0).map(r => ({
                                            timestamp: r.id,
                                            value: r.ease,
                                            color: getRatingColor(r.ease)
                                        }))}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                                            <XAxis
                                                dataKey="timestamp"
                                                tickFormatter={(ts) => formatShortDate(ts)}
                                                stroke="#9CA3AF"
                                                fontSize={11}
                                                tickLine={false}
                                                type="number"
                                                domain={['dataMin', 'dataMax']}
                                            />
                                            <YAxis
                                                domain={[0.5, 4.5]}
                                                ticks={[1, 2, 3, 4]}
                                                tickFormatter={(v) => getRatingName(v)}
                                                stroke="#9CA3AF"
                                                fontSize={11}
                                                tickLine={false}
                                                width={50}
                                            />
                                            <ZAxis range={[60, 60]} />
                                            <Tooltip content={<CustomTooltip formatValue={(v: number) => getRatingName(v)} />} />
                                            <Scatter
                                                dataKey="value"
                                                fill="#F59E0B"
                                                shape={(props: any) => {
                                                    const { cx, cy, payload } = props;
                                                    return <circle cx={cx} cy={cy} r={6} fill={payload.color} />;
                                                }}
                                            />
                                        </ScatterChart>
                                    ) : (
                                        <LineChart data={reviewHistory.filter(r => r.time > 0).map(r => ({
                                            timestamp: r.id,
                                            value: r.time / 1000,
                                            ease: r.ease
                                        }))}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                                            <XAxis
                                                dataKey="timestamp"
                                                tickFormatter={(ts) => formatShortDate(ts)}
                                                stroke="#9CA3AF"
                                                fontSize={11}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                scale="log"
                                                domain={[0.1, 'auto']}
                                                tickFormatter={(v) => v >= 60 ? `${(v / 60).toFixed(0)}m` : `${v.toFixed(0)}s`}
                                                stroke="#9CA3AF"
                                                fontSize={11}
                                                tickLine={false}
                                                width={35}
                                            />
                                            <Tooltip content={<CustomTooltip formatValue={(v: number) => `${v.toFixed(1)}s`} />} />
                                            <Line
                                                type="monotone"
                                                dataKey="value"
                                                stroke="#A855F7"
                                                strokeWidth={2}
                                                dot={{ fill: '#A855F7', r: 4 }}
                                                activeDot={{ r: 6, fill: '#9333EA' }}
                                            />
                                        </LineChart>
                                    )}
                                </ResponsiveContainer>
                            </div>

                            {/* Legend - only for rating tab */}
                            {chartTab === 'rating' && (
                                <div className="flex justify-center gap-4 text-xs text-gray-500">
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Again</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> Hard</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Good</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Easy</span>
                                </div>
                            )}

                            {/* Review History Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-gray-500 border-b border-gray-600">
                                            <th className="text-left py-2 px-2 font-medium">Date</th>
                                            <th className="text-left py-2 px-2 font-medium">Type</th>
                                            <th className="text-center py-2 px-2 font-medium">Rating</th>
                                            <th className="text-right py-2 px-2 font-medium">Interval</th>
                                            <th className="text-right py-2 px-2 font-medium">Ease</th>
                                            <th className="text-right py-2 px-2 font-medium">Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...reviewHistory].reverse().map((review, index) => (
                                            <tr key={index} className="border-b border-gray-700 hover:bg-gray-700/50">
                                                <td className="py-1.5 px-2 text-gray-300">{formatDateTime(review.id)}</td>
                                                <td className={`py-1.5 px-2 ${review.type === 0 ? 'text-blue-400' :
                                                    review.type === 1 ? 'text-green-400' :
                                                        review.type === 2 ? 'text-orange-400' :
                                                            'text-gray-400'
                                                    }`}>
                                                    {getReviewTypeName(review.type)}
                                                </td>
                                                <td className={`py-1.5 px-2 text-center font-medium ${review.ease === 1 ? 'text-red-400' :
                                                    review.ease === 2 ? 'text-yellow-400' :
                                                        review.ease === 3 ? 'text-green-400' :
                                                            review.ease === 4 ? 'text-blue-400' :
                                                                'text-gray-400'
                                                    }`}>
                                                    {review.ease}
                                                </td>
                                                <td className="py-1.5 px-2 text-right text-gray-300">{formatInterval(review.interval)}</td>
                                                <td className="py-1.5 px-2 text-right text-gray-300">{formatEase(review.factor)}</td>
                                                <td className="py-1.5 px-2 text-right text-gray-300">{formatTime(review.time)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Raw Fields Tab - Text/HTML editing */}
            {showTabs && activeTab === 'fields' && (
                <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                        <Pencil className="w-3 h-3" />
                        <span>Edit raw HTML content. For rich text editing, use the Content tab.</span>
                    </div>
                    {localFields.map((field, index) => (
                        <div key={index} className="bg-gray-700 rounded-lg p-3">
                            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">
                                {field.name}
                            </label>
                            <textarea
                                value={field.value}
                                onChange={(e) => handleFieldChange(index, e.target.value)}
                                className="w-full text-sm text-gray-200 font-mono bg-gray-800 p-2 rounded resize-y min-h-[60px] border border-transparent focus:border-blue-500 focus:outline-none transition-colors"
                                placeholder="(empty)"
                                rows={Math.max(2, (field.value?.split('\n').length || 1) + 1)}
                            />
                        </div>
                    ))}

                    {/* Card IDs */}
                    {isRenderedCard && (
                        <div className="bg-gray-700 rounded-lg p-3 mt-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Card Info</div>
                            <div className="text-xs text-gray-400 font-mono space-y-1">
                                <div>Card ID: {(card as RenderedCard).id}</div>
                                <div>Note ID: {(card as RenderedCard).noteId}</div>
                                <div>Deck: {(card as RenderedCard).deckName}</div>
                                <div>Model: {(card as RenderedCard).modelName}</div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
