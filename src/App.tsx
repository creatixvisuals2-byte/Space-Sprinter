import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { StatusModal } from './components/StatusModal';
import { TitleOverlay } from './components/TitleOverlay';
import { SpaceGameEngine } from './game/SpaceGameEngine';
import { GAME_CONSTANTS, HudSnapshot } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  score: 0,
  bestScore: 0,
  hull: GAME_CONSTANTS.maxHull,
  maxHull: GAME_CONSTANTS.maxHull,
  level: 1,
  maxLevels: GAME_CONSTANTS.maxLevels,
  levelProgress: 0,
  nextLevelSeconds: GAME_CONSTANTS.levelDurationSeconds,
  levelBanner: null,
  powerUpRemaining: 0,
  powerUpDuration: GAME_CONSTANTS.powerUpDuration,
  combo: 0,
  aliensDefeated: 0,
  starsDodged: 0,
  shotsIntercepted: 0,
  lasersFired: 0,
  muted: false,
  damageFlash: 0,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SpaceGameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const phaseRef = useRef(hud.phase);
  phaseRef.current = hud.phase;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new SpaceGameEngine(container, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.startGame();
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    engineRef.current?.startGame();
  }, []);

  const handlePause = useCallback(() => {
    engineRef.current?.pauseGame();
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resumeGame();
  }, []);

  const handleTitle = useCallback(() => {
    engineRef.current?.returnToTitle();
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (phaseRef.current === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleStart();
      } else if (
        (phaseRef.current === 'gameover' || phaseRef.current === 'victory') &&
        e.code === 'Enter'
      ) {
        e.preventDefault();
        handleStart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStart]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#030611]">
      {/* Isolated WebGL mount container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {hud.phase === 'title' && (
        <TitleOverlay bestScore={hud.bestScore} onStart={handleStart} />
      )}

      {(hud.phase === 'playing' || hud.phase === 'paused') && (
        <GameHud hud={hud} onToggleMute={handleToggleMute} onPause={handlePause} />
      )}

      <StatusModal
        hud={hud}
        onResume={handleResume}
        onRestart={handleStart}
        onTitle={handleTitle}
      />
    </main>
  );
}
