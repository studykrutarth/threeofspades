import clsx from 'clsx';

const SUIT_MAP = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_MAP = { A: 'A', K: 'K', Q: 'Q', J: 'J', '10': '10', '9': '9', '8': '8', '7': '7', '6': '6', '5': '5', '4': '4', '3': '3', '2': '2' };

export default function PlayingCard({ card, onClick, className, isPlayable = true, size = 'md' }) {
  const sizes = {
    sm: 'w-16 h-24 text-xs',
    md: 'w-[4.5rem] h-[6.5rem]',
    lg: 'w-24 h-36',
  };

  // Card back
  if (!card) {
    return (
      <div className={clsx(
        "rounded-xl shadow-lg flex items-center justify-center cursor-default select-none",
        sizes[size],
        className
      )}
      style={{
        background: 'linear-gradient(145deg, #1e3a5f, #0f1f3a)',
        border: '1.5px solid rgba(255,255,255,0.1)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}>
        <div className="w-[80%] h-[85%] rounded-lg opacity-30"
             style={{
               border: '1px solid rgba(212,168,67,0.3)',
               background: 'repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(212,168,67,0.06) 3px, rgba(212,168,67,0.06) 6px)',
             }} />
      </div>
    );
  }

  const isRed = card.suit === 'H' || card.suit === 'D';
  const suitSymbol = SUIT_MAP[card.suit] || card.suit;
  const rankDisplay = RANK_MAP[card.rank] || card.rank;
  const cardColor = isRed ? 'var(--color-card-red)' : 'var(--color-card-black)';

  // Special card highlight for 3♠
  const isThreeOfSpades = card.rank === '3' && card.suit === 'S';

  return (
    <div 
      onClick={isPlayable ? onClick : undefined}
      className={clsx(
        "relative rounded-xl flex flex-col overflow-hidden select-none",
        "transition-all duration-200 ease-out",
        sizes[size],
        isPlayable && onClick ? "cursor-pointer hover:-translate-y-2.5 hover:shadow-2xl hover:z-10" : "cursor-default",
        className
      )}
      style={{
        background: isThreeOfSpades 
          ? 'linear-gradient(145deg, #fffbeb, #fef3c7)'
          : 'linear-gradient(145deg, #ffffff, #f1f5f9)',
        border: isThreeOfSpades
          ? '1.5px solid var(--color-gold-500)'
          : '1px solid rgba(0,0,0,0.08)',
        boxShadow: isThreeOfSpades
          ? '0 4px 16px rgba(212,168,67,0.3)'
          : '0 2px 8px rgba(0,0,0,0.15)',
        color: cardColor,
      }}
    >
      {/* Gold shimmer on 3♠ */}
      {isThreeOfSpades && (
        <div className="absolute inset-0 animate-shimmer pointer-events-none" 
             style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(212,168,67,0.15) 50%, transparent 100%)', backgroundSize: '200% 100%' }} />
      )}

      {/* Top-left corner */}
      <div className="absolute top-1.5 left-2 flex flex-col items-center leading-none z-10">
        <span className="font-extrabold" style={{ fontSize: size === 'sm' ? '0.7rem' : '0.85rem' }}>{rankDisplay}</span>
        <span style={{ fontSize: size === 'sm' ? '0.75rem' : '0.9rem' }}>{suitSymbol}</span>
      </div>
      
      {/* Center suit — large */}
      <div className="flex-grow flex items-center justify-center relative z-10">
        <span className="opacity-70" style={{ fontSize: size === 'sm' ? '1.8rem' : size === 'md' ? '2.2rem' : '3rem' }}>
          {suitSymbol}
        </span>
      </div>
      
      {/* Bottom-right corner */}
      <div className="absolute bottom-1.5 right-2 flex flex-col items-center rotate-180 leading-none z-10">
        <span className="font-extrabold" style={{ fontSize: size === 'sm' ? '0.7rem' : '0.85rem' }}>{rankDisplay}</span>
        <span style={{ fontSize: size === 'sm' ? '0.75rem' : '0.9rem' }}>{suitSymbol}</span>
      </div>

      {/* Point badge */}
      {isThreeOfSpades && (
        <div className="absolute top-1 right-1 text-[0.55rem] font-extrabold px-1 py-0.5 rounded"
             style={{ background: 'var(--color-gold-500)', color: 'var(--color-felt-900)' }}>
          30
        </div>
      )}
    </div>
  );
}
