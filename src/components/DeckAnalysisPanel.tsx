import React from 'react';
import {
    BarChart3,
    AlertTriangle,
    Lightbulb,
    Star,
    TrendingUp,
    AlertCircle,
    Tag
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { CardCarousel } from './CardCarousel';
import type { DeckAnalysisResult, SuggestedCard } from '../types';

interface DeckAnalysisPanelProps {
    result: DeckAnalysisResult;
}

export const DeckAnalysisPanel: React.FC<DeckAnalysisPanelProps> = ({ result }) => {
    const addCardToDeck = useAppStore(state => state.addCardToDeck);
    const selectedDeckId = useAppStore(state => state.selectedDeckId);

    const handleAddCard = (card: SuggestedCard) => {
        if (selectedDeckId !== null) {
            addCardToDeck(card, selectedDeckId);
        }
    };

    // Find the max count for scaling the bar chart
    const maxCount = Math.max(...result.scoreDistribution.map(d => d.count), 1);

    // Calculate total suggested cards (from individual analyses + deck-level suggestions)
    const suggestedCardsCount = (result.totalSuggestedFromCards ?? 0) + result.suggestedNewCards.length;

    return (
        <div className="space-y-6">
            {/* Error Display */}
            {result.error && (
                <div className="bg-red-900/30 border border-red-600 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-red-400 mb-1">Analysis Error</h3>
                            <p className="text-sm text-red-300">{result.error}</p>
                        </div>
                    </div>
                </div>
            )}

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
                            {suggestedCardsCount}
                        </div>
                        <div className="text-xs text-gray-400">Suggested Cards</div>
                    </div>
                </div>
            </div>

            {/* Deck Summary - Now immediately after Overview */}
            {result.deckSummary && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                        <Star className="w-5 h-5 text-yellow-500" />
                        Deck Summary
                    </h3>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{result.deckSummary}</p>
                </div>
            )}

            {/* Score Distribution */}
            <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                    Score Distribution
                </h3>

                <div className="flex items-end gap-1 h-32">
                    {result.scoreDistribution.map(({ score, count }) => {
                        const heightPercent = maxCount > 0 ? (count / maxCount) * 100 : 0;
                        return (
                            <div key={score} className="flex-1 flex flex-col items-center h-full">
                                {/* Bar container - takes remaining space */}
                                <div className="flex-1 flex flex-col justify-end w-full">
                                    {count > 0 && (
                                        <span className="text-xs text-gray-400 text-center mb-1">{count}</span>
                                    )}
                                    <div
                                        className={`w-full rounded-t transition-all ${score >= 7 ? 'bg-green-500' :
                                            score >= 4 ? 'bg-yellow-500' : 'bg-red-500'
                                            }`}
                                        style={{
                                            height: `${heightPercent}%`,
                                            minHeight: count > 0 ? '4px' : '0'
                                        }}
                                    />
                                </div>
                                {/* Score label */}
                                <span className="text-xs text-gray-400 mt-1">{score}</span>
                            </div>
                        );
                    })}
                </div>
                <div className="text-center text-xs text-gray-400 mt-2">
                    Card Quality Score (1-10)
                </div>
            </div>

            {/* Classified Issues - LLM-organized categories */}
            {result.classifiedIssues && result.classifiedIssues.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                        <Tag className="w-5 h-5 text-purple-500" />
                        Issue Categories
                    </h3>
                    <div className="space-y-4">
                        {result.classifiedIssues.map(({ category, issues }) => (
                            <div key={category}>
                                <h4 className="text-sm font-medium text-purple-400 mb-2">{category}</h4>
                                <ul className="space-y-1 pl-4">
                                    {issues.map((issueItem, idx) => (
                                        <li key={idx} className="text-sm text-gray-400 flex items-start gap-2">
                                            <span className="text-gray-600">•</span>
                                            <span>{issueItem.issue}</span>
                                            <span className="text-gray-500 text-xs">({issueItem.count})</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Common Issues - Fallback if no classified issues */}
            {(!result.classifiedIssues || result.classifiedIssues.length === 0) && result.commonIssues.length > 0 && (
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

            {/* Suggested New Cards - Using Swiper Carousel */}
            {result.suggestedNewCards.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-semibold flex items-center gap-2 mb-4">
                        <Lightbulb className="w-5 h-5 text-blue-500" />
                        Suggested New Cards ({result.suggestedNewCards.length})
                    </h3>

                    <CardCarousel
                        cards={result.suggestedNewCards}
                        onAddCard={(card) => handleAddCard(card)}
                        showActions={true}
                        titlePrefix="Suggestion"
                    />
                </div>
            )}
        </div>
    );
};
