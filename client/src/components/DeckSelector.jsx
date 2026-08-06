import { useState } from 'react';
import PlayingCard from './PlayingCard';

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUIT_NAMES = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
// On-dark variants — the card-face black is invisible against the panel.
const SUIT_COLORS = { S: '#e2e8f0', H: '#ef4444', D: '#ef4444', C: '#e2e8f0' };

export default function DeckSelector({ onSelect, excludeCards = [], allowedCardIds = null, maxSelect = 2 }) {
  const [selectedIds, setSelectedIds] = useState([]);

  // Generate deck excluding owned cards and any cards not in play this round
  const deck = [];
  SUITS.forEach(suit => {
    RANKS.forEach(rank => {
      const id = `${rank}${suit}`;
      if (excludeCards.includes(id)) return;
      if (allowedCardIds && !allowedCardIds.includes(id)) return;
      deck.push({ id, suit, rank });
    });
  });

  const handleCardClick = (cardId) => {
    if (selectedIds.includes(cardId)) {
      setSelectedIds(selectedIds.filter(id => id !== cardId));
    } else if (selectedIds.length < maxSelect) {
      setSelectedIds([...selectedIds, cardId]);
    }
  };

  const handleConfirm = () => {
    if (selectedIds.length === maxSelect) {
      onSelect(selectedIds);
    }
  };

  return (
    <div className="panel p-6 mt-6 animate-float-in">
      {/* Header */}
      <div className="flex justify-between items-start gap-4 mb-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-white tracking-wide" style={{ fontFamily: 'var(--font-heading)' }}>
            Select Partner Cards
          </h3>
          <p className="text-xs opacity-40 mt-0.5 leading-snug">
            Choose 2 cards you do not hold. Their owners become your hidden partners.
          </p>
        </div>
        <button
          onClick={handleConfirm}
          disabled={selectedIds.length !== maxSelect}
          className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm ${selectedIds.length === maxSelect ? 'btn-accent' : 'btn-ghost opacity-50 cursor-not-allowed'}`}
        >
          Confirm {selectedIds.length}/{maxSelect}
        </button>
      </div>
      
      {/* Card grid by suit */}
      <div className="overflow-y-auto max-h-[28rem] pr-2 space-y-6">
        {SUITS.map(suit => (
          <div key={suit}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl" style={{ color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
              <h4 className="label text-sm font-semibold uppercase tracking-wider">{SUIT_NAMES[suit]}</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {deck.filter(c => c.suit === suit).map(card => {
                const isSelected = selectedIds.includes(card.id);
                return (
                  <div key={card.id} className="relative transition-transform duration-200">
                    <PlayingCard 
                      card={card}
                      size="sm"
                      onClick={() => handleCardClick(card.id)}
                      className={isSelected 
                        ? "ring-2 ring-offset-2 scale-105"
                        : "opacity-80 hover:opacity-100"
                      }
                      style={isSelected ? { 
                        '--tw-ring-color': 'var(--color-warn)',
                        '--tw-ring-offset-color': 'var(--color-surface)',
                      } : {}}
                    />
                    {isSelected && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shadow-lg"
                           style={{ background: 'var(--color-warn)', color: 'var(--color-bg)' }}>
                        ✓
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
