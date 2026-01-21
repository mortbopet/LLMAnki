import React, { useMemo, useRef, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, ArrowDownCircle } from 'lucide-react';
import { JsonViewer } from '@textea/json-viewer';
import type { LLMLogEntry } from '../types';

interface LLMConsoleProps {
    logs: LLMLogEntry[];
    isDarkMode: boolean;
    onClear: () => void;
}

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();

const isObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

export const LLMConsole: React.FC<LLMConsoleProps> = ({ logs, isDarkMode, onClear }) => {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [follow, setFollow] = useState(true);
    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (follow && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [logs.length, follow]);

    const entries = useMemo(() => logs, [logs]);

    const toggleExpanded = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    return (
        <aside className={`w-full h-full flex-shrink-0 border-l overflow-hidden flex flex-col min-h-0 ${isDarkMode ? 'bg-anki-darker border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                <div className="text-sm font-semibold">LLM Console</div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setFollow(prev => !prev)}
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                        title="Auto-scroll to new logs"
                    >
                        <ArrowDownCircle className="w-3.5 h-3.5" />
                        {follow ? 'Following' : 'Follow'}
                    </button>
                    <button
                        onClick={onClear}
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear
                    </button>
                </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 text-xs">
                {entries.length === 0 ? (
                    <div className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>
                        No LLM activity yet.
                    </div>
                ) : (
                    entries.map(entry => {
                        const isExpanded = expanded.has(entry.id);
                        return (
                            <div key={entry.id} className={`rounded border px-2 py-1 ${isDarkMode ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                                <div className="flex items-center justify-between">
                                    <span className="font-mono">
                                        {formatTime(entry.timestamp)} • {entry.direction}
                                    </span>
                                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>
                                        {entry.providerId} • {entry.model}
                                    </span>
                                </div>
                                <div className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>
                                    {entry.endpoint}{entry.durationMs !== undefined ? ` • ${entry.durationMs}ms` : ''}
                                    {entry.status ? ` • ${entry.status}` : ''}
                                </div>
                                {entry.payload !== undefined && (
                                    <button
                                        onClick={() => toggleExpanded(entry.id)}
                                        className={`mt-1 flex items-center gap-1 text-xs ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}
                                    >
                                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                        {isExpanded ? 'Hide details' : 'Show details'}
                                    </button>
                                )}
                                {isExpanded && entry.payload !== undefined && (
                                    <div className="mt-2">
                                        {isObject(entry.payload) && ((entry.payload as Record<string, unknown>).headers || (entry.payload as Record<string, unknown>).body) ? (
                                            <div className="space-y-2">
                                                {'headers' in (entry.payload as Record<string, unknown>) && (
                                                    <div>
                                                        <div className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>headers</div>
                                                        <JsonViewer value={(entry.payload as Record<string, unknown>).headers} defaultInspectDepth={1} theme={isDarkMode ? 'dark' : 'light'} />
                                                    </div>
                                                )}
                                                {'body' in (entry.payload as Record<string, unknown>) && (
                                                    <div>
                                                        <div className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>body</div>
                                                        <JsonViewer value={(entry.payload as Record<string, unknown>).body} defaultInspectDepth={1} theme={isDarkMode ? 'dark' : 'light'} />
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div>
                                                <div className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>payload</div>
                                                <JsonViewer value={entry.payload} defaultInspectDepth={1} theme={isDarkMode ? 'dark' : 'light'} />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>
        </aside>
    );
};
