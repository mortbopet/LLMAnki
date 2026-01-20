import React, { useMemo, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

interface ExportDeletionFilterModalProps {
    deckName: string;
    filterText: string;
    onClose: () => void;
}

export const ExportDeletionFilterModal: React.FC<ExportDeletionFilterModalProps> = ({
    deckName,
    filterText,
    onClose,
}) => {
    const [copied, setCopied] = useState(false);

    const message = useMemo(() => {
        return `Exported deck "${deckName}". To delete cards that were marked for deletion in LLMAnki, please copy the following filter string into the Anki cards browser filter, and delete the cards manually.`;
    }, [deckName]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(filterText);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch (error) {
            console.error('Failed to copy filter text:', error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl shadow-2xl max-w-xl w-full border border-gray-700">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <h2 className="text-lg font-semibold text-white">Delete Marked Cards in Anki</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
                        title="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-4 space-y-3">
                    <p className="text-sm text-gray-300">{message}</p>
                    <textarea
                        readOnly
                        value={filterText}
                        className="w-full h-28 p-3 text-sm font-mono rounded-lg bg-gray-900/60 border border-gray-700 text-gray-200 resize-none"
                    />
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied' : 'Copy filter'}
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
