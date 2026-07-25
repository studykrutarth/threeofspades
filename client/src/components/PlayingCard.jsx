import clsx from 'clsx';
import { SUIT_SYMBOLS, getCardPoints, isRedSuit } from '../lib/cards';

export default function PlayingCard({
  card,
  onClick,
  className,
  style,
  isPlayable = true,
  dimmed = false,
  highlight = false,
  size = 'md'
}) {
  const sizes = {
    mini: 'w-6 h-9',      // face-down slivers in an opponent's fan
    xs: 'w-11 h-16',
    sm: 'w-16 h-24 text-xs',
    md: 'w-[4.5rem] h-[6.5rem]',
    lg: 'w-24 h-36',
  };
  const isSmall = size === 'sm' || size === 'xs' || size === 'mini';

  // Card back
  if (!card) {
    return (
      <div className={clsx(
        "rounded-lg shadow-lg flex items-center justify-center cursor-default select-none overflow-hidden",
        sizes[size],
        className
      )}
      style={{
        background: 'linear-gradient(145deg, #24457a, #12294d)',
        // A light rim separates each card in an overlapping fan.
        border: '1.5px solid rgba(255,255,255,0.55)',
        boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
        ...style,
      }}>
        {/* Swap this block for real back art later — it fills the whole face. */}
        <div className="w-full h-full"
             style={{
               background:
                 'repeating-linear-gradient(-45deg, transparent 0 4px, rgba(212,168,67,0.22) 4px 8px),' +
                 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(212,168,67,0.22) 4px 8px)',
             }} />
      </div>
    );
  }

  const isRed = isRedSuit(card.suit);
  const suitSymbol = SUIT_SYMBOLS[card.suit] || card.suit;
  const rankDisplay = card.rank;
  const cardColor = isRed ? 'var(--color-card-red)' : 'var(--color-card-black)';

  const points = getCardPoints(card);
  const isThreeOfSpades = points === 30;
  const clickable = isPlayable && !dimmed && Boolean(onClick);

  return (
    <div
      onClick={clickable ? onClick : undefined}
      className={clsx(
        "relative rounded-xl flex flex-col overflow-hidden select-none",
        "transition-all duration-200 ease-out",
        sizes[size],
        clickable ? "cursor-pointer hover:-translate-y-2.5 hover:shadow-2xl hover:z-10" : "cursor-default",
        dimmed && "grayscale",
        className
      )}
      style={{
        background: isThreeOfSpades
          ? 'linear-gradient(145deg, #fffbeb, #fef3c7)'
          : 'linear-gradient(145deg, #ffffff, #f1f5f9)',
        border: highlight
          ? '2px solid var(--color-emerald-500)'
          : isThreeOfSpades
            ? '1.5px solid var(--color-gold-500)'
            : '1px solid rgba(0,0,0,0.08)',
        boxShadow: highlight
          ? '0 0 16px rgba(16,185,129,0.5)'
          : isThreeOfSpades
            ? '0 4px 16px rgba(212,168,67,0.3)'
            : '0 2px 8px rgba(0,0,0,0.15)',
        color: cardColor,
        opacity: dimmed ? 0.4 : 1,
        ...style,
      }}
    >
      {/* Gold shimmer on 3♠ */}
      {isThreeOfSpades && (
        <div className="absolute inset-0 animate-shimmer pointer-events-none"
             style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(212,168,67,0.15) 50%, transparent 100%)', backgroundSize: '200% 100%' }} />
      )}

      {/* Top-left corner. The point badge lives here rather than on the right
          edge so it survives being overlapped in a fanned hand. */}
      <div className="absolute top-1.5 left-1.5 flex flex-col items-center leading-none z-10">
        <span className="font-extrabold" style={{ fontSize: isSmall ? '0.7rem' : '0.85rem' }}>{rankDisplay}</span>
        <span style={{ fontSize: isSmall ? '0.75rem' : '0.9rem' }}>{suitSymbol}</span>
        {points > 0 && (
          <span className="mt-1 font-extrabold rounded px-1 leading-tight"
                style={{
                  fontSize: '0.5rem',
                  background: isThreeOfSpades ? 'var(--color-gold-500)' : 'rgba(30,41,59,0.85)',
                  color: isThreeOfSpades ? 'var(--color-felt-900)' : '#f1f5f9'
                }}>
            {points}
          </span>
        )}
      </div>

      {/* Center suit — large */}
      <div className="flex-grow flex items-center justify-center relative z-10">
        <span className="opacity-70" style={{ fontSize: size === 'xs' ? '1.2rem' : size === 'sm' ? '1.8rem' : size === 'md' ? '2.2rem' : '3rem' }}>
          {suitSymbol}
        </span>
      </div>

      {/* Bottom-right corner */}
      {size !== 'xs' && (
        <div className="absolute bottom-1.5 right-2 flex flex-col items-center rotate-180 leading-none z-10">
          <span className="font-extrabold" style={{ fontSize: size === 'sm' ? '0.7rem' : '0.85rem' }}>{rankDisplay}</span>
          <span style={{ fontSize: size === 'sm' ? '0.75rem' : '0.9rem' }}>{suitSymbol}</span>
        </div>
      )}

    </div>
  );
}
