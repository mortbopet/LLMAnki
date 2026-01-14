import React from 'react';
import { Tag } from 'lucide-react';
import type { RenderedCard, SuggestedCard, CardType } from '../types';
import { getCardTypeName } from '../utils/cardRenderer';

interface CardViewerProps {
    card: RenderedCard | SuggestedCard;
    title?: string;
    isSuggestion?: boolean;
}

export const CardViewer: React.FC<CardViewerProps> = ({
    card,
    title,
    isSuggestion = false
}) => {
    // Handle both RenderedCard and SuggestedCard formats
    const isRenderedCard = 'front' in card && 'back' in card;

    let front: string;
    let back: string;
    let cardType: CardType;
    let css = '';
    let tags: string[] = [];

    if (isRenderedCard) {
        const rc = card as RenderedCard;
        front = rc.front;
        back = rc.back;
        cardType = rc.type;
        css = rc.css;
        tags = rc.tags;
    } else {
        const sc = card as SuggestedCard;
        cardType = sc.type;

        if (cardType === 'cloze') {
            // For cloze, the first field contains the cloze text
            const clozeField = sc.fields.find(f => f.name.toLowerCase() === 'text' || f.name.toLowerCase() === 'front');
            const text = clozeField?.value || sc.fields[0]?.value || '';

            // Show the raw cloze text (user will see cloze syntax like {{c1::answer}})
            front = text;

            // For "back"/Extra section, show the extra field if present, otherwise empty
            const extraField = sc.fields.find(f => f.name.toLowerCase() === 'extra' || f.name.toLowerCase() === 'back');
            back = extraField?.value || '<span class="text-gray-400 italic">No extra content</span>';
        } else {
            // Basic card
            const frontField = sc.fields.find(f => f.name.toLowerCase() === 'front');
            const backField = sc.fields.find(f => f.name.toLowerCase() === 'back');
            front = frontField?.value || sc.fields[0]?.value || '';
            back = backField?.value || sc.fields[1]?.value || '';
        }
    }

    return (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
            {title && (
                <div className="px-4 py-2 bg-gray-700 border-b border-gray-600 flex items-center justify-between">
                    <h4 className="font-medium text-sm">{title}</h4>
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs rounded ${isSuggestion ? 'bg-green-600' : 'bg-blue-600'
                            }`}>
                            {getCardTypeName(cardType)}
                        </span>
                    </div>
                </div>
            )}

            {/* Tags */}
            {!isSuggestion && tags.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 text-xs text-gray-400 border-b border-gray-700">
                    <Tag className="w-3 h-3" />
                    {tags.join(', ')}
                </div>
            )}

            <style>{css}</style>

            {/* Front / Text */}
            <div className="p-4 border-b border-gray-700">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                    {cardType === 'cloze' ? 'Text' : 'Front'}
                </div>
                <div
                    className="prose prose-sm max-w-none bg-white text-gray-900 p-4 rounded-lg"
                    dangerouslySetInnerHTML={{ __html: front }}
                />
            </div>

            {/* Back / Extra */}
            <div className="p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                    {cardType === 'cloze' ? 'Extra (optional)' : 'Back'}
                </div>
                <div
                    className="prose prose-sm max-w-none bg-gray-100 text-gray-900 p-4 rounded-lg"
                    dangerouslySetInnerHTML={{ __html: back }}
                />
            </div>
        </div>
    );
};
