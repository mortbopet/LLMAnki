import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import { Plus, Edit3, Trash2 } from 'lucide-react';
import { CardViewer } from './CardViewer';
import type { SuggestedCard } from '../types';
import type { Swiper as SwiperType } from 'swiper';

// Swiper styles are bundled - we'll use inline styles for customization

interface CardCarouselProps {
    cards: SuggestedCard[];
    onAddCard?: (card: SuggestedCard, index: number) => void;
    onEditCard?: (index: number) => void;
    onRemoveCard?: (index: number) => void;
    showActions?: boolean;
    titlePrefix?: string;
    initialSlide?: number;
    onSlideChange?: (index: number) => void;
}

export const CardCarousel: React.FC<CardCarouselProps> = ({
    cards,
    onAddCard,
    onEditCard,
    onRemoveCard,
    showActions = true,
    titlePrefix = 'Card',
    initialSlide = 0,
    onSlideChange
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
                {cards.map((card, index) => (
                    <SwiperSlide key={index}>
                        <div className="relative group pb-4">
                            <CardViewer
                                card={card}
                                title={`${titlePrefix} ${index + 1}`}
                                isSuggestion
                            />

                            {card.explanation && (
                                <p className="mt-2 text-sm text-gray-400 italic px-1">
                                    {card.explanation}
                                </p>
                            )}

                            {/* Action buttons */}
                            {showActions && (
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
                ))}
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
                    color: #60a5fa;
                    background: rgba(31, 41, 55, 0.9);
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    --swiper-navigation-size: 20px;
                }
                
                .card-swiper .swiper-button-prev:hover,
                .card-swiper .swiper-button-next:hover {
                    background: rgba(55, 65, 81, 0.95);
                }
                
                .card-swiper .swiper-button-disabled {
                    opacity: 0.3;
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
