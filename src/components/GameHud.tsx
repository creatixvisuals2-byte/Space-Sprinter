import React from 'react';
import { HudSnapshot } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  onToggleMute: () => void;
  onPause: () => void;
}

const HullPipIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden="true">
    <polygon
      points="12,2 21,7 19,17 12,22 5,17 3,7"
      fill={active ? '#38bdf8' : 'rgba(15, 23, 42, 0.85)'}
      stroke={active ? '#e0f2fe' : '#334155'}
      strokeWidth="2"
    />
    {active && (
      <polygon points="12,5 17,8 16,14 12,17 8,14 7,8" fill="#bae6fd" opacity="0.55" />
    )}
    {!active && (
      <line x1="7" y1="7" x2="17" y2="17" stroke="#475569" strokeWidth="1.8" />
    )}
  </svg>
);

export const GameHud: React.FC<GameHudProps> = ({ hud, onToggleMute, onPause }) => {
  const isPowered = hud.powerUpRemaining > 0;
  const powerPct = Math.min(100, Math.max(0, (hud.powerUpRemaining / hud.powerUpDuration) * 100));
  const levelPct = Math.min(100, Math.max(0, hud.levelProgress * 100));
  const lowHull = hud.hull === 1;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-6">
      {/* Peripheral Damage / Low Hull Vignette */}
      {(hud.damageFlash > 0.02 || lowHull) && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-150"
          style={{
            opacity: Math.max(hud.damageFlash * 0.75, lowHull ? 0.35 : 0),
            boxShadow: 'inset 0 0 110px rgba(244, 63, 94, 0.85)',
          }}
        />
      )}

      {/* Top Perimeter Clusters */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Score & Hull Integrity */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <div>
              <div className="text-[11px] font-bold tracking-[0.2em] uppercase text-sky-300/80 hud-text-stroke">
                Score
              </div>
              <div
                className="font-mono-num text-3xl sm:text-4xl font-bold text-white hud-text-stroke leading-none"
                data-testid="hud-score"
              >
                {Math.round(hud.score).toLocaleString()}
              </div>
            </div>

            {hud.combo >= 2 && (
              <div className="px-2.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/70">
                <span className="font-mono-num text-sm font-bold text-amber-300">
                  x{Math.min(4, 1 + Math.floor(hud.combo / 4) * 0.5).toFixed(1)}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5" aria-label={`Hull ${hud.hull} of ${hud.maxHull}`}>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-slate-300/80 mr-1 hud-text-stroke">
              Hull
            </span>
            {Array.from({ length: hud.maxHull }).map((_, i) => (
              <HullPipIcon key={i} active={i < hud.hull} />
            ))}
          </div>
        </div>

        {/* Top-Right: Level Progress (6 Levels, 60s each) & Utility Controls */}
        <div className="flex items-start gap-3">
          <div className="text-right mr-1">
            <div className="flex items-baseline justify-end gap-2">
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-sky-300/80 hud-text-stroke">
                Level
              </span>
              <span className="font-mono-num text-2xl font-bold text-sky-200 hud-text-stroke leading-none">
                {String(hud.level).padStart(2, '0')}
                <span className="text-sm text-slate-400">/{String(hud.maxLevels).padStart(2, '0')}</span>
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-end gap-2">
              <div className="w-20 h-1.5 rounded-full bg-slate-900/90 border border-sky-900/70 overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-[width] duration-150"
                  style={{ width: `${levelPct}%` }}
                />
              </div>
              <span className="font-mono-num text-[11px] font-bold text-slate-300 hud-text-stroke">
                {hud.nextLevelSeconds}s
              </span>
            </div>
          </div>

          <button
            type="button"
            tabIndex={-1}
            aria-label={hud.muted ? 'Unmute Audio' : 'Mute Audio'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="pointer-events-auto cursor-pointer w-10 h-10 rounded-lg bg-[#0a132c]/90 hover:bg-[#13224a] border border-sky-700/60 flex items-center justify-center text-sky-200 transition-colors"
            title="Mute [M]"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
              {hud.muted ? (
                <path d="M22 9l-6 6M16 9l6 6" strokeLinecap="round" />
              ) : (
                <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" strokeLinecap="round" />
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause Game"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="pointer-events-auto cursor-pointer w-10 h-10 rounded-lg bg-[#0a132c]/90 hover:bg-[#13224a] border border-sky-700/60 flex items-center justify-center text-sky-200 transition-colors"
            title="Pause [P]"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Transient Sector / Level Advance Banner (Upper Safe Band, non-blocking) */}
      <div className="flex justify-center">
        {hud.levelBanner && (
          <div className="px-5 py-2 rounded-lg bg-[#071026]/90 border border-sky-400/60 shadow-[0_0_24px_rgba(56,189,248,0.25)]">
            <span className="font-display text-sm sm:text-base font-bold tracking-[0.18em] uppercase text-sky-200">
              {hud.levelBanner}
            </span>
          </div>
        )}
      </div>

      {/* Bottom-Center Hyperbeam Overcharge Meter */}
      <div className="flex justify-center pb-1">
        {isPowered && (
          <div
            className="w-full max-w-xs px-4 py-2.5 rounded-lg bg-[#120d05]/95 border border-amber-400/80 shadow-[0_0_24px_rgba(251,191,36,0.35)]"
            data-testid="powerup-meter"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-display text-xs font-bold tracking-[0.16em] uppercase text-amber-300">
                Hyperbeam Overcharge
              </span>
              <span className="font-mono-num text-sm font-bold text-amber-100">
                {hud.powerUpRemaining.toFixed(1)}s
              </span>
            </div>
            <div className="h-2 w-full rounded-sm bg-slate-900 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-[width] duration-75"
                style={{ width: `${powerPct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
