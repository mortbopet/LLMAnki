import React from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface SystemPromptUpdateModalProps {
    onAcceptNew: () => void;
    onKeepOld: () => void;
}

export const SystemPromptUpdateModal: React.FC<SystemPromptUpdateModalProps> = ({
    onAcceptNew,
    onKeepOld
}) => {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="px-6 py-4 bg-yellow-600/20 border-b border-yellow-600/30 flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-yellow-500" />
                    <h2 className="text-lg font-semibold text-yellow-400">
                        System Prompt Updated
                    </h2>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <p className="text-gray-300">
                        The default system prompt has been updated in this version of the app. 
                        Your current settings are using an older version of the prompt.
                    </p>
                    
                    <p className="text-gray-400 text-sm">
                        You can either:
                    </p>
                    
                    <ul className="text-sm text-gray-400 space-y-2 ml-4">
                        <li className="flex items-start gap-2">
                            <span className="text-green-400 font-bold">•</span>
                            <span><strong className="text-green-400">Accept the new prompt</strong> — Get the latest improvements and bug fixes</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-400 font-bold">•</span>
                            <span><strong className="text-blue-400">Keep your current prompt</strong> — If you've customized it and want to preserve your changes</span>
                        </li>
                    </ul>
                    
                    <p className="text-gray-500 text-xs italic">
                        You can always reset to the default prompt later in Settings.
                    </p>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-700/50 flex justify-end gap-3">
                    <button
                        onClick={onKeepOld}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4" />
                        Keep My Prompt
                    </button>
                    <button
                        onClick={onAcceptNew}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Accept New Prompt
                    </button>
                </div>
            </div>
        </div>
    );
};
