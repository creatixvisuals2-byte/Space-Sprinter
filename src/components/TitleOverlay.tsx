import React from 'react';

interface TitleOverlayProps {
  bestScore: number;
  onStart: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({ bestScore, onStart }) => {
  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 sm:p-10 md:p-14">
      <div className="my-auto max-w-md pointer-events-auto">
        {/* Bespoke inline SVG Title Lockup */}
        <svg
          viewBox="0 0 420 128"
          className="w-full max-w-[390px] h-auto mb-6 drop-shadow-[0_6px_22px_rgba(14,165,233,0.35)]"
          role="img"
          aria-label="Starlance Vanguard"
        >
          <defs>
            <linearGradient id="lanceGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#e0f2fe" />
              <stop offset="55%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
          </defs>
          {/* Starfighter Wing Crest */}
          <path
            d="M12 52 L44 26 L56 44 L96 48 L54 58 L44 76 Z"
            fill="#0c1938"
            stroke="#38bdf8"
            strokeWidth="2.5"
          />
          <polygon points="48,48 82,50 48,54" fill="#fbbf24" />
          {/* Main Title */}
          <text
            x="14"
            y="102"
            fill="url(#lanceGrad)"
            fontFamily="'Chakra Petch', 'Space Grotesk', sans-serif"
            fontSize="48"
            fontWeight="700"
            letterSpacing="3"
          >
            STARLANCE
          </text>
          <text
            x="114"
            y="48"
            fill="#94a3b8"
            fontFamily="'JetBrains Mono', monospace"
            fontSize="14"
            fontWeight="700"
            letterSpacing="6"
          >
            VANGUARD
          </text>
          <line x1="16" y1="116" x2="365" y2="116" stroke="#1e3a8a" strokeWidth="2" />
          <line x1="16" y1="116" x2="145" y2="116" stroke="#38bdf8" strokeWidth="2.5" />
        </svg>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="font-display cursor-pointer px-8 py-3.5 rounded-lg bg-sky-400 hover:bg-sky-300 active:translate-y-0.5 text-slate-950 font-bold text-lg tracking-wider uppercase shadow-[0_0_28px_rgba(56,189,248,0.45)] transition-transform duration-150 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Launch Mission
          </button>

          {bestScore > 0 && (
            <div className="px-4 py-2 rounded-lg bg-[#091128]/90 border border-sky-900/70">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-sky-400/80">
                High Score
              </div>
              <div className="font-mono-num text-xl font-bold text-amber-300">
                {bestScore.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Single flat inline control hint */}
      <div className="text-xs sm:text-sm text-slate-300/85 tracking-wide font-medium hud-text-stroke">
        WASD / Arrows Steer · Space / Click Fire Laser · Collect Cores for Mega-Laser · P Pause
      </div>
    </div>
  );
};
