import React from 'react';
import { CheckCircle, Plus, Trash2, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const PendingChanges: React.FC = () => {
  const pendingChanges = useAppStore(state => state.pendingChanges);
  const commitChange = useAppStore(state => state.commitChange);
  const clearPendingChanges = useAppStore(state => state.clearPendingChanges);
  
  const uncommittedCount = pendingChanges.filter(c => !c.committed).length;
  
  if (pendingChanges.length === 0) return null;
  
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">
          Pending Changes ({uncommittedCount} uncommitted)
        </h3>
        <button
          onClick={clearPendingChanges}
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Clear All
        </button>
      </div>
      
      <div className="space-y-2">
        {pendingChanges.map((change, index) => (
          <div 
            key={index}
            className={`flex items-center justify-between p-2 rounded ${
              change.committed ? 'bg-green-900/30' : 'bg-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {change.type === 'add' ? (
                <Plus className="w-4 h-4 text-green-500" />
              ) : (
                <Trash2 className="w-4 h-4 text-red-500" />
              )}
              <span className="text-sm">
                {change.type === 'add' 
                  ? `Add new ${change.newCard?.type} card`
                  : `Delete card #${change.originalCardId}`
                }
              </span>
            </div>
            
            {change.committed ? (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle className="w-3 h-3" />
                Committed
              </span>
            ) : (
              <button
                onClick={() => commitChange(index)}
                className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              >
                Commit
              </button>
            )}
          </div>
        ))}
      </div>
      
      {uncommittedCount > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          Click "Commit" on each change to apply it to the deck. Committed changes will be saved when you export the deck.
        </p>
      )}
    </div>
  );
};
