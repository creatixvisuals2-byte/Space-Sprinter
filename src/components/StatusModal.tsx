import React from 'react';
import { HudSnapshot } from '../game/types';

interface StatusModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  hud,
  onResume,
  onRestart,
  onTitle,
}) => {
  if (hud.phase !== 'paused' && hud.phase !== 'gameover' && hud.phase !== 'victory') {
    return null;
  }

  const isPaused = hud.phase === 'paused';
  const isVictory = hud.phase === 'victory';

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center p-4 bg-[#030612]/75"
      role="dialog"
      aria-modal="true"
      aria-label={
        isPaused ? 'Mission Paused' : isVictory ? 'Sector Cleared' : 'Mission Failed'
      }
    >
      <div className="w-full max-w-md rounded-xl bg-[#091229] border border-sky-500/40 p-7 shadow-[0_24px_64px_rgba(0,0,0,0.85)]">
        <div
          className={`text-[11px] font-bold tracking-[0.22em] uppercase mb-1 ${
            isVictory ? 'text-amber-300' : 'text-sky-400'
          }`}
        >
          {isPaused
            ? 'Flight Deck Hold'
            : isVictory
              ? 'All 6 Sectors Conquered'
              : 'Hull Breached'}
        </div>
        <h2 className="font-display text-3xl font-bold text-white tracking-wide mb-5">
          {isPaused ? 'Mission Paused' : isVictory ? 'Victory' : 'Game Over'}
        </h2>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg bg-[#050a18] border border-slate-800 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Score
            </div>
            <div className="font-mono-num text-xl font-bold text-white mt-0.5">
              {hud.score.toLocaleString()}
            </div>
          </div>

          <div className="rounded-lg bg-[#050a18] border border-slate-800 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Best
            </div>
            <div className="font-mono-num text-xl font-bold text-amber-300 mt-0.5">
              {hud.bestScore.toLocaleString()}
            </div>
          </div>

          <div className="rounded-lg bg-[#050a18] border border-slate-800 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Level
            </div>
            <div className="font-mono-num text-xl font-bold text-sky-300 mt-0.5">
              {hud.level}/{hud.maxLevels}
            </div>
          </div>
        </div>

        {!isPaused && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 bg-[#050a18] border border-slate-800/80 rounded-lg px-3.5 py-2.5 mb-6 font-mono-num">
            <span>Aliens: {hud.aliensDefeated}</span>
            <span>Shots Blocked: {hud.shotsIntercepted}</span>
            <span>Stars: {hud.starsDodged}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {isPaused ? (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onResume();
              }}
              className="font-display cursor-pointer flex-1 py-3 px-5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold uppercase tracking-wider transition-colors"
            >
              Resume
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="font-display cursor-pointer flex-1 py-3 px-5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold uppercase tracking-wider transition-colors"
            >
              {isVictory ? 'Play Again' : 'Try Again'}
            </button>
          )}

          {isPaused && (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="font-display cursor-pointer py-3 px-5 rounded-lg bg-[#111f45] hover:bg-[#192c61] text-sky-100 border border-sky-700/60 font-bold uppercase tracking-wider transition-colors"
            >
              Restart
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onTitle();
            }}
            className="font-display cursor-pointer py-3 px-5 rounded-lg bg-[#0d1733] hover:bg-[#16244c] text-slate-200 border border-slate-700 font-bold uppercase tracking-wider transition-colors"
          >
            Title
          </button>
        </div>
      </div>
    </div>
  );
};
