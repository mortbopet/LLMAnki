import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import { Plus, Edit3, Trash2, Check, X } from 'lucide-react';
import { CardViewer } from './CardViewer';
import type { SuggestedCard } from '../types';
import type { Swiper as SwiperType } from 'swiper';

// Swiper styles are bundled - we'll use inline styles for customization

interface CardCarouselProps {
    cards: SuggestedCard[];
    onAddCard?: (card: SuggestedCard, index: number) => void;
    onEditCard?: (index: number) => void;
    onRemoveCard?: (index: number) => void;
    onRemoveAddedCard?: (index: number) => void;
    showActions?: boolean;
    titlePrefix?: string;
    initialSlide?: number;
    onSlideChange?: (index: number) => void;
    addedIndices?: number[];
}

export const CardCarousel: React.FC<CardCarouselProps> = ({
    cards,
    onAddCard,
    onEditCard,
    onRemoveCard,
    onRemoveAddedCard,
    showActions = true,
    titlePrefix = 'Card',
    initialSlide = 0,
    onSlideChange,
    addedIndices = []
}) => {
    if (cards.length === 0) return null;

    const handleSlideChange = (swiper: SwiperType) => {
        onSlideChange?.(swiper.activeIndex);
    };

    return (
        <div className="card-carousel-container">
            <Swiper
                modules={[Navigation, Pagination]}
                spaceBetween={16}
                slidesPerView={1.15}
                centeredSlides={true}
                navigation={true}
                initialSlide={initialSlide}
                onSlideChange={handleSlideChange}
                pagination={{
                    clickable: true,
                    dynamicBullets: true
                }}
                breakpoints={{
                    640: {
                        slidesPerView: 1.2,
                    },
                    1024: {
                        slidesPerView: 1.25,
                    }
                }}
                className="card-swiper"
            >
                {cards.map((card, index) => {
                    const isAdded = addedIndices.includes(index);
                    return (
                        <SwiperSlide key={index}>
                            <div className={`relative group pb-4 ${isAdded ? 'opacity-50' : ''}`}>
                                <div className={`rounded-lg shadow-lg shadow-black/30 transition-shadow overflow-hidden ${isAdded
                                    ? 'ring-1 ring-gray-500/30'
                                    : 'ring-1 ring-green-500/30 hover:shadow-xl hover:shadow-black/40'
                                    }`}>
                                    {/* Added Badge */}
                                    {isAdded && (
                                        <div className="px-4 py-2 bg-gray-700/80 border-b border-gray-600 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Check className="w-4 h-4 text-green-400" />
                                                <span className="text-sm text-green-400 font-medium">Added to deck</span>
                                            </div>
                                            {onRemoveAddedCard && (
                                                <button
                                                    onClick={() => onRemoveAddedCard(index)}
                                                    className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                                                    title="Remove from deck"
                                                >
                                                    <X className="w-3 h-3" />
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {/* Explanation at top of card */}
                                    {card.explanation && !isAdded && (
                                        <div className="px-4 py-3 bg-gradient-to-r from-green-900/30 to-emerald-900/20 border-b border-green-500/20">
                                            <p className="text-sm text-green-200/90 italic">
                                                {card.explanation}
                                            </p>
                                        </div>
                                    )}
                                    <CardViewer
                                        card={card}
                                        title={`${titlePrefix} ${index + 1}`}
                                        isSuggestion
                                    />
                                </div>

                                {/* Action buttons - only show if not already added */}
                                {showActions && !isAdded && (
                                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                        {onEditCard && (
                                            <button
                                                onClick={() => onEditCard(index)}
                                                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                                                title="Edit card"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                        )}
                                        {onRemoveCard && (
                                            <button
                                                onClick={() => onRemoveCard(index)}
                                                className="p-2 bg-gray-700 hover:bg-red-600 rounded-lg transition-colors"
                                                title="Remove suggestion"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                        {onAddCard && (
                                            <button
                                                onClick={() => onAddCard(card, index)}
                                                className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-sm font-medium"
                                                title="Add to deck"
                                            >
                                                <Plus className="w-4 h-4 inline mr-1" />
                                                Add
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </SwiperSlide>
                    );
                })}
            </Swiper>

            <style>{`
                .card-carousel-container {
                    position: relative;
                    padding: 0 20px;
                }
                
                .card-swiper {
                    padding-bottom: 40px !important;
                }
                
                .card-swiper .swiper-slide {
                    opacity: 0.4;
                    transform: scale(0.95);
                    transition: opacity 0.3s, transform 0.3s;
                }
                
                .card-swiper .swiper-slide-active {
                    opacity: 1;
                    transform: scale(1);
                }
                
                .card-swiper .swiper-button-prev,
                .card-swiper .swiper-button-next {
                    color: #ffffff;
                    background: #3b82f6;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                    transition: background-color 0.2s, transform 0.2s;
                }
                
                .card-swiper .swiper-button-prev:after,
                .card-swiper .swiper-button-next:after {
                    font-size: 14px;
                    font-weight: bold;
                }
                
                .card-swiper .swiper-button-prev:hover,
                .card-swiper .swiper-button-next:hover {
                    background: #2563eb;
                    transform: scale(1.1);
                }
                
                .card-swiper .swiper-button-disabled {
                    opacity: 0.3;
                    background: #6b7280;
                }
                
                .card-swiper .swiper-button-disabled:hover {
                    transform: none;
                }
                
                .card-swiper .swiper-pagination-bullet {
                    background: #6b7280;
                    opacity: 0.5;
                }
                
                .card-swiper .swiper-pagination-bullet-active {
                    background: #60a5fa;
                    opacity: 1;
                }
            `}</style>
        </div>
    );
};
