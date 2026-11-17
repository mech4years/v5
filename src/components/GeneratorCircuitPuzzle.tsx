import React, { useEffect, useMemo, useState } from 'react';
import { Lightbulb, RotateCcw, Zap, CheckCircle2, Ban } from 'lucide-react';
import { HorrorAudioEngine } from '../game/audio';

interface Coord {
  r: number;
  c: number;
}

interface CircuitBoard {
  size: number;
  start: Coord;
  end: Coord;
  blocked: Set<string>;
}

interface GeneratorCircuitPuzzleProps {
  puzzleId: string;
  levelNumber: number;
  audio: HorrorAudioEngine | null;
  onComplete: () => void;
}

const keyOf = (r: number, c: number) => `${r},${c}`;

const isAdjacent = (a: Coord, b: Coord) =>
  Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

function bfsShortestPath(
  size: number,
  from: Coord,
  to: Coord,
  blocked: Set<string>,
  avoid: Set<string>
): Coord[] | null {
  const queue: Coord[][] = [[from]];
  const visited = new Set<string>([keyOf(from.r, from.c)]);
  const dirs = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];

  while (queue.length > 0) {
    const path = queue.shift()!;
    const head = path[path.length - 1];
    if (head.r === to.r && head.c === to.c) return path;

    for (const [dr, dc] of dirs) {
      const nr = head.r + dr;
      const nc = head.c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const k = keyOf(nr, nc);
      if (visited.has(k) || blocked.has(k)) continue;
      if (avoid.has(k) && !(nr === to.r && nc === to.c)) continue;
      visited.add(k);
      queue.push([...path, { r: nr, c: nc }]);
    }
  }
  return null;
}

function buildGuaranteedBoard(puzzleId: string, levelNumber: number): CircuitBoard {
  const size = levelNumber >= 6 ? 4 : 3;
  // Seeded deterministic PRNG from puzzleId so resetting or revisiting feels structured
  let seed = 0;
  for (let i = 0; i < puzzleId.length; i++) {
    seed = (seed * 31 + puzzleId.charCodeAt(i) + levelNumber * 17) >>> 0;
  }
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const start: Coord = { r: 0, c: 0 };
  const end: Coord = { r: size - 1, c: size - 1 };

  for (let attempt = 0; attempt < 40; attempt++) {
    const blocked = new Set<string>();
    const desiredBlocked = size === 3 ? 2 : 4;
    let tries = 0;
    while (blocked.size < desiredBlocked && tries < 30) {
      tries++;
      const r = Math.floor(nextRand() * size);
      const c = Math.floor(nextRand() * size);
      if ((r === start.r && c === start.c) || (r === end.r && c === end.c)) continue;
      blocked.add(keyOf(r, c));
    }
    const solution = bfsShortestPath(size, start, end, blocked, new Set());
    if (solution && solution.length >= size + 1) {
      return { size, start, end, blocked };
    }
  }

  // Fallback guaranteed board
  const fallbackBlocked = new Set<string>(size === 3 ? ['0,2', '2,0'] : ['0,2', '1,2', '3,0']);
  return { size, start, end, blocked: fallbackBlocked };
}

export const GeneratorCircuitPuzzle: React.FC<GeneratorCircuitPuzzleProps> = ({
  puzzleId,
  levelNumber,
  audio,
  onComplete,
}) => {
  const board = useMemo(
    () => buildGuaranteedBoard(puzzleId, levelNumber),
    [puzzleId, levelNumber]
  );

  const [path, setPath] = useState<Coord[]>([board.start]);
  const [hintCoord, setHintCoord] = useState<Coord | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>(
    'Connect START to END across adjacent power nodes without crossing blocked cells.'
  );
  const [solvedAnim, setSolvedAnim] = useState(false);

  useEffect(() => {
    setPath([board.start]);
    setHintCoord(null);
    setSolvedAnim(false);
  }, [board]);

  const pathKeys = useMemo(() => new Set(path.map((p) => keyOf(p.r, p.c))), [path]);
  const head = path[path.length - 1];

  const handleCellClick = (r: number, c: number) => {
    if (solvedAnim) return;
    const k = keyOf(r, c);
    if (board.blocked.has(k)) {
      audio?.playPuzzleError();
      setStatusMsg('Faulty burnt relay! Choose an unblocked adjacent node.');
      return;
    }

    // Backtrack if user clicks the immediately previous node in the chain
    if (path.length >= 2) {
      const prev = path[path.length - 2];
      if (prev.r === r && prev.c === c) {
        audio?.playClick(false);
        setPath(path.slice(0, -1));
        setHintCoord(null);
        setStatusMsg('Stepped back one node.');
        return;
      }
    }

    if (pathKeys.has(k)) {
      setStatusMsg('Node already energized in current circuit.');
      return;
    }

    const clicked: Coord = { r, c };
    if (!isAdjacent(head, clicked)) {
      audio?.playPuzzleError();
      setStatusMsg('Nodes must connect horizontally or vertically (no diagonals).');
      return;
    }

    const nextPath = [...path, clicked];
    setPath(nextPath);
    setHintCoord(null);

    if (r === board.end.r && c === board.end.c) {
      audio?.playPuzzleSolve();
      setSolvedAnim(true);
      setStatusMsg('CIRCUIT CLOSED — FULL GENERATOR CURRENT FLOWING!');
      window.setTimeout(() => {
        onComplete();
      }, 950);
    } else {
      audio?.playClick(true);
      setStatusMsg(`Circuit linked (${nextPath.length} nodes). Continue toward END.`);
    }
  };

  const handleReset = () => {
    if (solvedAnim) return;
    audio?.playClick(false);
    setPath([board.start]);
    setHintCoord(null);
    setStatusMsg('Circuit reset to START node.');
  };

  const handleHint = () => {
    if (solvedAnim) return;
    const avoid = new Set(path.slice(0, -1).map((p) => keyOf(p.r, p.c)));
    let solution = bfsShortestPath(board.size, head, board.end, board.blocked, avoid);
    if (!solution || solution.length < 2) {
      // Current path ran into a dead end; compute hint from START instead
      const fresh = bfsShortestPath(board.size, board.start, board.end, board.blocked, new Set());
      if (fresh && fresh.length >= 2) {
        setPath([board.start]);
        setHintCoord(fresh[1]);
        audio?.playClick(true);
        setStatusMsg('Dead-end cleared. Hint highlights the next valid node from START.');
        return;
      }
      return;
    }
    setHintCoord(solution[1]);
    audio?.playClick(true);
    setStatusMsg(`Hint: connect to highlighted node (${solution[1].r + 1}, ${solution[1].c + 1}).`);
  };

  return (
    <div data-testid="generator-circuit-puzzle" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0d1118] border border-sky-500/40 px-4 py-2.5">
        <div>
          <div className="text-[10px] font-mono-tech uppercase tracking-[0.2em] text-sky-400">
            PHASE 2 OF 2 · CONNECT-THE-DOTS CIRCUIT ({board.size}×{board.size})
          </div>
          <p className="text-xs text-zinc-300 mt-0.5">{statusMsg}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="circuit-hint-btn"
            onClick={handleHint}
            disabled={solvedAnim}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-amber-500/60 bg-amber-950/50 hover:bg-amber-900/60 text-amber-200 text-xs font-mono-tech disabled:opacity-40 cursor-pointer"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            HINT
          </button>
          <button
            type="button"
            data-testid="circuit-reset-btn"
            onClick={handleReset}
            disabled={solvedAnim}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-zinc-600 bg-zinc-900 hover:border-zinc-400 text-zinc-200 text-xs font-mono-tech disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            RESET
          </button>
        </div>
      </div>

      {/* Grid with SVG Wire Overlay */}
      <div className="relative mx-auto w-full max-w-[340px] aspect-square bg-[#06090f] border border-zinc-800 rounded-lg p-3">
        <div
          className="grid gap-2.5 w-full h-full relative z-10"
          style={{
            gridTemplateColumns: `repeat(${board.size}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${board.size}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: board.size * board.size }).map((_, idx) => {
            const r = Math.floor(idx / board.size);
            const c = idx % board.size;
            const k = keyOf(r, c);
            const isStart = r === board.start.r && c === board.start.c;
            const isEnd = r === board.end.r && c === board.end.c;
            const isBlocked = board.blocked.has(k);
            const pathIdx = path.findIndex((p) => p.r === r && p.c === c);
            const inPath = pathIdx !== -1;
            const isHead = head.r === r && head.c === c;
            const isHint = hintCoord?.r === r && hintCoord?.c === c;
            const isNextValid = !isBlocked && !inPath && isAdjacent(head, { r, c });

            return (
              <button
                key={k}
                type="button"
                data-testid={`circuit-node-${r}-${c}`}
                onClick={() => handleCellClick(r, c)}
                className={`relative rounded-lg border-2 flex flex-col items-center justify-center font-mono-tech transition-all cursor-pointer ${
                  isBlocked
                    ? 'bg-red-950/40 border-red-900/70 text-red-500/80 cursor-not-allowed'
                    : solvedAnim && inPath
                      ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.55)] scale-[1.03]'
                      : isHead
                        ? 'bg-sky-500/30 border-sky-300 text-white shadow-[0_0_14px_rgba(56,189,248,0.5)]'
                        : inPath
                          ? 'bg-sky-900/50 border-sky-500 text-sky-200'
                          : isHint
                            ? 'bg-amber-500/25 border-amber-400 text-amber-200 animate-pulse'
                            : isEnd
                              ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-300 hover:bg-emerald-900/40'
                              : isNextValid
                                ? 'bg-slate-900 border-slate-500 text-slate-200 hover:border-sky-400'
                                : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                {isBlocked ? (
                  <>
                    <Ban className="w-4 h-4" />
                    <span className="text-[9px] mt-0.5">FAULT</span>
                  </>
                ) : isStart ? (
                  <>
                    <Zap className="w-4 h-4 text-sky-300" />
                    <span className="text-[10px] font-bold">START</span>
                  </>
                ) : isEnd ? (
                  <>
                    {solvedAnim ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                    ) : (
                      <Zap className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className="text-[10px] font-bold">END</span>
                  </>
                ) : (
                  <span className="text-xs font-bold tabular-nums">
                    {inPath ? `#${pathIdx}` : '•'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono-tech text-zinc-400">
        <span>CLICK ADJACENT NODES TO WIRE · CLICK PREVIOUS TO STEP BACK</span>
        <span>NO TIMER · UNLIMITED ATTEMPTS</span>
      </div>
    </div>
  );
};
