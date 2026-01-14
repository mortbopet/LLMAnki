import React from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Lightbulb, 
  Star,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Trash2,
  Plus
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { CardViewer } from './CardViewer';
import { CardEditor } from './CardEditor';
import type { LLMAnalysisResult, SuggestedCard } from '../types';

interface AnalysisPanelProps {
  result: LLMAnalysisResult;
}

const CriteriaCheck: React.FC<{ label: string; passed: boolean }> = ({ label, passed }) => (
  <div className="flex items-center gap-2">
    {passed ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <XCircle className="w-4 h-4 text-red-500" />
    )}
    <span className={passed ? 'text-green-400' : 'text-red-400'}>{label}</span>
  </div>
);

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ result }) => {
  const { feedback, suggestedCards, deleteOriginal, deleteReason } = result;
  
  const suggestedCardsState = useAppStore(state => state.suggestedCards);
  const updateSuggestedCard = useAppStore(state => state.updateSuggestedCard);
  const removeSuggestedCard = useAppStore(state => state.removeSuggestedCard);
  const editingSuggestionIndex = useAppStore(state => state.editingSuggestionIndex);
  const setEditingSuggestionIndex = useAppStore(state => state.setEditingSuggestionIndex);
  const addPendingChange = useAppStore(state => state.addPendingChange);
  const selectedCard = useAppStore(state => state.selectedCard);
  
  const handleEditCard = (index: number) => {
    setEditingSuggestionIndex(index);
  };
  
  const handleSaveEdit = (index: number, card: SuggestedCard) => {
    updateSuggestedCard(index, card);
    setEditingSuggestionIndex(null);
  };
  
  const handleCommitCard = (card: SuggestedCard) => {
    addPendingChange({
      type: 'add',
      originalCardId: selectedCard?.id,
      newCard: card,
      committed: false
    });
  };
  
  const handleDeleteOriginal = () => {
    if (selectedCard) {
      addPendingChange({
        type: 'delete',
        originalCardId: selectedCard.id,
        committed: false
      });
    }
  };
  
  // Use local suggestedCards state which can be edited
  const displayCards = suggestedCardsState.length > 0 ? suggestedCardsState : suggestedCards;
  
  return (
    <div className="space-y-6">
      {/* Score Overview */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            Analysis Score
          </h3>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${
              feedback.overallScore >= 7 ? 'text-green-500' :
              feedback.overallScore >= 4 ? 'text-yellow-500' : 'text-red-500'
            }`}>
              {feedback.overallScore}/10
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <CriteriaCheck label="Unambiguous" passed={feedback.isUnambiguous} />
          <CriteriaCheck label="Atomic" passed={feedback.isAtomic} />
          <CriteriaCheck label="Recognizable" passed={feedback.isRecognizable} />
          <CriteriaCheck label="Active Recall" passed={feedback.isActiveRecall} />
        </div>
      </div>
      
      {/* Issues */}
      {feedback.issues.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Issues Found
          </h3>
          <ul className="space-y-2">
            {feedback.issues.map((issue, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <ThumbsDown className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <span className="text-gray-300">{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Suggestions */}
      {feedback.suggestions.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            Suggestions
          </h3>
          <ul className="space-y-2">
            {feedback.suggestions.map((suggestion, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <ThumbsUp className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                <span className="text-gray-300">{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Detailed Reasoning */}
      {feedback.reasoning && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Detailed Analysis</h3>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{feedback.reasoning}</p>
        </div>
      )}
      
      {/* Delete Recommendation */}
      {deleteOriginal && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <h3 className="font-semibold flex items-center gap-2 mb-2 text-red-400">
            <Trash2 className="w-5 h-5" />
            Deletion Recommended
          </h3>
          <p className="text-sm text-gray-300 mb-3">{deleteReason}</p>
          <button
            onClick={handleDeleteOriginal}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Mark Original for Deletion
          </button>
        </div>
      )}
      
      {/* Suggested Cards */}
      {displayCards.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Plus className="w-5 h-5 text-green-500" />
            Suggested Replacement Cards ({displayCards.length})
          </h3>
          
          {displayCards.map((card, index) => (
            <div key={index} className="relative">
              {editingSuggestionIndex === index ? (
                <CardEditor
                  card={card}
                  onChange={(updated) => updateSuggestedCard(index, updated)}
                  onCancel={() => setEditingSuggestionIndex(null)}
                  onSave={() => handleSaveEdit(index, card)}
                />
              ) : (
                <div className="relative group">
                  <CardViewer
                    card={card}
                    title={`Suggested Card ${index + 1}`}
                    isSuggestion
                  />
                  
                  {/* Action buttons */}
                  <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditCard(index)}
                      className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                      title="Edit card"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeSuggestedCard(index)}
                      className="p-2 bg-gray-700 hover:bg-red-600 rounded-lg transition-colors"
                      title="Remove suggestion"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleCommitCard(card)}
                      className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-sm font-medium"
                      title="Add to deck"
                    >
                      <Plus className="w-4 h-4 inline mr-1" />
                      Add
                    </button>
                  </div>
                </div>
              )}
              
              {card.explanation && editingSuggestionIndex !== index && (
                <p className="mt-2 text-sm text-gray-400 italic">
                  💡 {card.explanation}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
