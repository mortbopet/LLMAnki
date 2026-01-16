import React from 'react';
import {
    BarChart3,
    Lightbulb,
    Star,
    TrendingUp,
    AlertCircle,
    Target,
    CheckCircle2,
    AlertTriangle,
    ArrowRight
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { CardCarousel } from './CardCarousel';
import { SuggestedCardsList } from './SuggestedCardsList';
import type { DeckAnalysisResult, SuggestedCard, KnowledgeCoverage } from '../types';

interface DeckAnalysisPanelProps {
    result: DeckAnalysisResult;
}

// Component to display knowledge coverage
const KnowledgeCoverageSection: React.FC<{ coverage: KnowledgeCoverage }> = ({ coverage }) => {
    const getCoverageColor = (level: string) => {
        switch (level) {
            case 'excellent': return 'text-green-400 bg-green-500/20 border-green-500/30';
            case 'good': return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
            case 'fair': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
            case 'poor': return 'text-red-400 bg-red-500/20 border-red-500/30';
            default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
        }
    };

    const getImportanceColor = (importance: string) => {
        switch (importance) {
            case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30';
            case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
            case 'low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    };

    return (
        <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-purple-500" />
                Knowledge Coverage
            </h3>

            {/* Coverage Score */}
            <div className="flex items-center gap-4 mb-4">
                <div className={`px-3 py-1.5 rounded-lg border font-medium ${getCoverageColor(coverage.overallCoverage)}`}>
                    {coverage.overallCoverage.charAt(0).toUpperCase() + coverage.overallCoverage.slice(1)} Coverage
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full ${coverage.coverageScore >= 7 ? 'bg-green-500' :
                                coverage.coverageScore >= 5 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                            style={{ width: `${coverage.coverageScore * 10}%` }}
                        />
                    </div>
                    <span className="text-sm text-gray-400">{coverage.coverageScore}/10</span>
                </div>
            </div>

            {/* Coverage Summary */}
            {coverage.summary && (
                <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                    {coverage.summary}
                </p>
            )}

            {/* Covered Topics */}
            {coverage.coveredTopics.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        Well-Covered Topics
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {coverage.coveredTopics.map((topic, idx) => (
                            <span key={idx} className="px-2.5 py-1 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20">
                                {topic}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Knowledge Gaps */}
            {coverage.gaps.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                        Knowledge Gaps
                    </h4>
                    <div className="space-y-2">
                        {coverage.gaps.map((gap, idx) => (
                            <div key={idx} className="bg-gray-700/50 rounded-lg p-3">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <span className="font-medium text-sm text-gray-200">{gap.topic}</span>
                                    <span className={`px-2 py-0.5 text-xs rounded border ${getImportanceColor(gap.importance)}`}>
                                        {gap.importance}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400">{gap.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recommendations */}
            {coverage.recommendations.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-1.5">
                        <ArrowRight className="w-4 h-4 text-blue-500" />
                        Recommendations
                    </h4>
                    <ul className="space-y-1.5">
                        {coverage.recommendations.map((rec, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                                <span className="text-blue-400 mt-1">•</span>
                                {rec}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export const DeckAnalysisPanel: React.FC<DeckAnalysisPanelProps> = ({ result }) => {
    const addCardToDeck = useAppStore(state => state.addCardToDeck);
    const selectedDeckId = useAppStore(state => state.selectedDeckId);
    const llmConfig = useAppStore(state => state.llmConfig);
    const markDeckSuggestedCardAdded = useAppStore(state => state.markDeckSuggestedCardAdded);

    // Get layout preference (default to carousel for backwards compatibility)
    const suggestedCardsLayout = llmConfig.suggestedCardsLayout || 'carousel';

    // Track which cards have been added
    const addedIndices = result.addedSuggestedCardIndices || [];

    const handleAddCard = (card: SuggestedCard, index: number) => {
        if (selectedDeckId !== null) {
            addCardToDeck(card, selectedDeckId);
            // Mark this card as added in the cache
            markDeckSuggestedCardAdded(result.deckId, index);
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
                        <div className={`text-2xl font-bold ${result.analyzedCards === 0 ? 'text-gray-500' :
                                result.averageScore >= 7 ? 'text-green-400' :
                                    result.averageScore >= 5 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                            {result.analyzedCards === 0 ? 'N/A' : `${result.averageScore}/10`}
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

            {/* Knowledge Coverage */}
            {result.knowledgeCoverage && (
                <KnowledgeCoverageSection coverage={result.knowledgeCoverage} />
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
                                <span className="text-xs text-gray-400 mt-1">{score}</span>
                            </div>
                        );
                    })}
                </div>
                <div className="text-center text-xs text-gray-400 mt-2">
                    Card Quality Score (1-10)
                </div>
            </div>

            {/* Suggested New Cards - With added state */}
            {result.suggestedNewCards.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-semibold flex items-center gap-2 mb-4">
                        <Lightbulb className="w-5 h-5 text-blue-500" />
                        Suggested New Cards ({result.suggestedNewCards.length})
                        {addedIndices.length > 0 && (
                            <span className="text-xs text-gray-500 font-normal">
                                • {addedIndices.length} added
                            </span>
                        )}
                    </h3>

                    {suggestedCardsLayout === 'list' ? (
                        <SuggestedCardsList
                            cards={result.suggestedNewCards}
                            onAddCard={(card, index) => handleAddCard(card, index)}
                            showActions={true}
                            titlePrefix="Suggestion"
                            addedIndices={addedIndices}
                        />
                    ) : (
                        <CardCarousel
                            cards={result.suggestedNewCards}
                            onAddCard={(card, index) => handleAddCard(card, index)}
                            showActions={true}
                            titlePrefix="Suggestion"
                            addedIndices={addedIndices}
                        />
                    )}
                </div>
            )}
        </div>
    );
};
