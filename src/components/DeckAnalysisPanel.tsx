import React from 'react';
import {
    BarChart3,
    AlertTriangle,
    Lightbulb,
    Star,
    TrendingUp,
    Plus
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { CardViewer } from './CardViewer';
import type { DeckAnalysisResult, SuggestedCard } from '../types';

interface DeckAnalysisPanelProps {
    result: DeckAnalysisResult;
}

export const DeckAnalysisPanel: React.FC<DeckAnalysisPanelProps> = ({ result }) => {
    const addPendingChange = useAppStore(state => state.addPendingChange);

    const handleAddCard = (card: SuggestedCard) => {
        addPendingChange({
            type: 'add',
            newCard: card,
            committed: false
        });
    };

    // Find the max count for scaling the bar chart
    const maxCount = Math.max(...result.scoreDistribution.map(d => d.count), 1);

    return (
        <div className="space-y-6">
            {/* Overview Stats */}
            <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-blue-500" />
                    Deck Overview
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-blue-400">{result.totalCards}</div>
                        <div className="text-xs text-gray-400">Total Cards</div>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-400">{result.analyzedCards}</div>
                        <div className="text-xs text-gray-400">Analyzed</div>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                        <div className={`text-2xl font-bold ${result.averageScore >= 7 ? 'text-green-400' :
                                result.averageScore >= 5 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                            {result.averageScore}/10
                        </div>
                        <div className="text-xs text-gray-400">Avg Score</div>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-purple-400">
                            {result.suggestedNewCards.length}
                        </div>
                        <div className="text-xs text-gray-400">Suggested Cards</div>
                    </div>
                </div>
            </div>

            {/* Score Distribution */}
            <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                    Score Distribution
                </h3>

                <div className="flex items-end gap-1 h-32">
                    {result.scoreDistribution.map(({ score, count }) => (
                        <div key={score} className="flex-1 flex flex-col items-center gap-1">
                            <div
                                className={`w-full rounded-t transition-all ${score >= 7 ? 'bg-green-500' :
                                        score >= 4 ? 'bg-yellow-500' : 'bg-red-500'
                                    }`}
                                style={{
                                    height: `${(count / maxCount) * 100}%`,
                                    minHeight: count > 0 ? '4px' : '0'
                                }}
                            />
                            <span className="text-xs text-gray-400">{score}</span>
                        </div>
                    ))}
                </div>
                <div className="text-center text-xs text-gray-400 mt-2">
                    Card Quality Score (1-10)
                </div>
            </div>

            {/* Common Issues */}
            {result.commonIssues.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-orange-500" />
                        Common Issues
                    </h3>
                    <ul className="space-y-2">
                        {result.commonIssues.map(({ issue, count }, index) => (
                            <li key={index} className="flex items-center justify-between text-sm">
                                <span className="text-gray-300 flex-1 truncate">{issue}</span>
                                <span className="text-gray-500 ml-2">{count} cards</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Deck Summary */}
            {result.deckSummary && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                        <Star className="w-5 h-5 text-yellow-500" />
                        Deck Summary
                    </h3>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{result.deckSummary}</p>
                </div>
            )}

            {/* Suggested New Cards */}
            {result.suggestedNewCards.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-semibold flex items-center gap-2 mb-4">
                        <Lightbulb className="w-5 h-5 text-blue-500" />
                        Suggested New Cards
                    </h3>

                    <div className="space-y-4">
                        {result.suggestedNewCards.map((card, index) => (
                            <div key={index} className="border border-gray-600 rounded-lg overflow-hidden">
                                <CardViewer card={card} title={`Suggestion ${index + 1}`} isSuggestion />

                                {card.explanation && (
                                    <div className="px-4 py-2 bg-gray-700 text-sm text-gray-300 border-t border-gray-600">
                                        {card.explanation}
                                    </div>
                                )}

                                <div className="px-4 py-2 bg-gray-700 border-t border-gray-600 flex justify-end">
                                    <button
                                        onClick={() => handleAddCard(card)}
                                        className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add to Pending
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
