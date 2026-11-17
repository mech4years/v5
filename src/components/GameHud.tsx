import React, { useRef } from 'react';
import {
  BookOpen,
  Flashlight,
  HeartPulse,
  Pause,
  Radio,
  Shield,
  Volume2,
  Zap,
} from 'lucide-react';
import { CHARACTERS, WEAPONS } from '../game/data';
import { CharacterId, GameSettings, HudSnapshot } from '../game/types';

interface Props {
  hud: HudSnapshot;
  characterId: CharacterId;
  settings: GameSettings;
  onLockPointer: () => void;
  onPause: () => void;
  onOpenInventory: () => void;
  onOpenDatabase?: () => void;
  onTouchMove: (x: number, y: number) => void;
  onTouchLook: (dx: number, dy: number) => void;
  onTouchAction: (
    action:
      | 'shoot_start'
      | 'shoot_end'
      | 'aim'
      | 'reload'
      | 'interact'
      | 'ability'
      | 'flashlight'
      | 'jump'
      | 'switch'
      | 'heal'
      | 'portal_orange'
  ) => void;
}

const COMPASS_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export const GameHud: React.FC<Props> = ({
  hud,
  characterId,
  settings,
  onLockPointer,
  onPause,
  onOpenInventory,
  onOpenDatabase,
  onTouchMove,
  onTouchLook,
  onTouchAction,
}) => {
  const charDef = CHARACTERS[characterId];
  const isPortalSlot = hud.activeSlot === 2;
  const activeWeapon = hud.activeSlot === 2 ? null : hud.weapons[hud.activeSlot];
  const weaponDef = activeWeapon ? WEAPONS[activeWeapon.id] : WEAPONS.portal_gun;
  const portalHud = hud.portalHud;
  const secondarySlot = hud.activeSlot === 0 ? 1 : 0;
  const secondaryWeapon = hud.weapons[secondarySlot];

  const cardinalIdx = Math.round(hud.compassHeading / 45) % 8;
  const cardinal = COMPASS_LABELS[cardinalIdx];

  const prongGap = hud.isAiming
    ? Math.round(3 + hud.moveSpread * 4)
    : Math.round(7 + hud.moveSpread * 12);

  let objDirArrow = '';
  let objGuideText = '';
  if (hud.objectiveBearingDeg !== null) {
    if (Math.abs(hud.objectiveBearingDeg) <= 18) {
      objDirArrow = '▲';
      objGuideText = 'AHEAD';
    } else if (hud.objectiveBearingDeg > 18 && hud.objectiveBearingDeg <= 135) {
      objDirArrow = '▶';
      objGuideText = 'RIGHT';
    } else if (hud.objectiveBearingDeg < -18 && hud.objectiveBearingDeg >= -135) {
      objDirArrow = '◀';
      objGuideText = 'LEFT';
    } else {
      objDirArrow = '▼';
      objGuideText = 'BEHIND';
    }
  }

  const moveStartRef = useRef<{ x: number; y: number } | null>(null);
  const lookLastRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none [text-shadow:0_1px_4px_rgba(0,0,0,0.95)]">
      {/* Sniper Scope Optical Overlay during ADS */}
      {hud.isSniperAds && (
        <div
          className="fixed inset-0 pointer-events-none flex items-center justify-center"
          style={{
            background:
              'radial-gradient(circle at center, transparent 29%, rgba(3,4,6,0.92) 34%, rgba(2,3,5,0.98) 65%)',
          }}
        >
          <div className="relative w-[min(62vw,62vh)] h-[min(62vw,62vh)] rounded-full border border-sky-400/35 flex items-center justify-center">
            <div className="absolute inset-x-0 top-1/2 h-px bg-sky-300/35" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-sky-300/35" />
            <div className="w-2 h-2 rounded-full bg-red-500/90" />
            <div className="absolute bottom-5 text-[10px] font-mono-tech tracking-widest text-sky-300/80">
              4.5X BALLISTIC OPTIC · M99 LONGBOW
            </div>
          </div>
        </div>
      )}

      {/* Damage Vignette */}
      {hud.damageFlash > 0.02 && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-75"
          style={{
            opacity: Math.min(0.85, hud.damageFlash),
            boxShadow: 'inset 0 0 110px 45px rgba(185, 28, 28, 0.85)',
          }}
        />
      )}

      {/* Top Row: Transparent Objective (Left), Minimalist Compass & Alerts (Center), Quick Actions & Minimap (Right) */}
      <div className="flex items-start justify-between p-4 sm:p-5 gap-4">
        {/* Top-Left Minimalist Objective */}
        <div className="max-w-xs sm:max-w-sm border-l-2 border-sky-400/80 pl-3 py-0.5">
          <div className="flex items-center gap-2 text-[11px] font-mono-tech tracking-widest text-sky-300">
            <span>OBJECTIVE</span>
            <span aria-hidden="true">·</span>
            <span className="text-zinc-300">{charDef.callsign}</span>
            {hud.objectiveDistance !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-300 tabular-nums">{hud.objectiveDistance}M</span>
              </>
            )}
          </div>
          <div
            className={`font-display font-semibold text-zinc-100 mt-0.5 tracking-wide ${
              settings.largeHudText ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
            }`}
          >
            {hud.objectiveTitle}
          </div>
          <div
            className={`text-zinc-200/90 mt-0.5 leading-snug ${
              settings.largeHudText ? 'text-sm' : 'text-xs'
            }`}
          >
            {hud.objectiveDetail}
          </div>
          {hud.subObjectiveProgress && (
            <div className="text-[11px] font-mono-tech text-sky-300 mt-1 tabular-nums">
              {hud.subObjectiveProgress}
            </div>
          )}
          <div className="flex items-center gap-2.5 text-[11px] font-mono-tech text-zinc-300/85 mt-1 tabular-nums">
            <span className="text-amber-300">SALVAGE {hud.salvageCores}</span>
            {hud.secretsTotalInLevel > 0 && (
              <>
                <span className="text-zinc-500">·</span>
                <span>
                  SECRETS {hud.secretsFoundInLevel}/{hud.secretsTotalInLevel}
                </span>
              </>
            )}
            {hud.inZeroG && <span className="text-sky-300 font-semibold">· ZERO-G</span>}
            {hud.inWater && <span className="text-cyan-300 font-semibold">· SUBMERGED</span>}
          </div>
          {hud.checkpointSavedTimer > 0 && (
            <div className="text-[11px] font-mono-tech text-amber-300 mt-1">
              CHECKPOINT SAVED
            </div>
          )}
        </div>

        {/* Top-Center Transparent Compass & Tactical Alerts */}
        <div className="flex flex-col items-center gap-2.5">
          <div className="px-3 py-1 flex items-center gap-3 text-xs font-mono-tech text-zinc-200 tabular-nums border-b border-zinc-400/25">
            <span>{String(hud.compassHeading).padStart(3, '0')}°</span>
            <span className="text-red-400 font-semibold">{cardinal}</span>
            {hud.objectiveDistance !== null && settings.navigationAssist && (
              <>
                <span className="text-zinc-500">·</span>
                <span className="text-amber-300 font-semibold">
                  {objDirArrow} {objGuideText} {hud.objectiveDistance}m
                </span>
              </>
            )}
            <span className="text-zinc-500">·</span>
            <span>KILLS {hud.enemiesDefeated}</span>
          </div>

          {hud.boss.active && (
            <div className="w-[300px] sm:w-[460px] px-2 py-1">
              <div className="flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold tracking-wider text-red-400">
                    {hud.boss.name}
                  </span>
                  {hud.boss.isEnraged && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono-tech font-bold border border-red-500/80 text-red-200">
                      ENRAGED
                    </span>
                  )}
                </div>
                <span className="font-mono-tech text-[11px] text-zinc-200">
                  {hud.boss.subtitle}
                </span>
              </div>
              <div className="w-full h-2 bg-black/45 border border-red-500/40 mt-1 overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-all duration-100"
                  style={{ width: `${Math.max(0, (hud.boss.health / hud.boss.maxHealth) * 100)}%` }}
                />
              </div>
              {hud.boss.activeWarning && (
                <div className="mt-1 text-center text-[11px] font-mono-tech font-bold tracking-[0.16em] text-amber-300">
                  ⚠ {hud.boss.activeWarning}
                </div>
              )}
            </div>
          )}

          {hud.radioBanner && (
            <div className="max-w-lg px-4 py-1.5 text-center border-b border-red-400/35">
              <div className="flex items-center justify-center gap-2 text-[11px] font-mono-tech text-red-300">
                <Radio className="w-3.5 h-3.5" />
                <span>{hud.radioBanner.speaker}</span>
              </div>
              <p
                className={`text-zinc-100 mt-0.5 leading-snug ${
                  settings.largeHudText ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'
                }`}
              >
                {hud.radioBanner.text}
              </p>
            </div>
          )}

          {hud.secretToast && (
            <div className="max-w-md border-y border-amber-400/75 px-5 py-1.5 text-center">
              <div className="text-[11px] font-mono-tech tracking-widest text-amber-300">
                SECRET DISCOVERED · +{hud.secretToast.salvage} SALVAGE CORES
              </div>
              <div className="font-display text-sm font-bold text-zinc-100 mt-0.5">
                {hud.secretToast.title}
              </div>
            </div>
          )}

          {portalHud?.toast && (
            <div
              className="max-w-md bg-black/70 border-t-2 border-b-2 px-6 py-2 text-center"
              style={{
                borderTopColor: '#38bdf8',
                borderBottomColor: '#fb923c',
              }}
            >
              <div className="text-[10px] font-mono-tech tracking-[0.22em] text-sky-300">
                APERTURE SCIENCE // QUANTUM HARDWARE
              </div>
              <div className="font-display text-sm font-bold text-zinc-100 mt-0.5">
                {portalHud.toast.title}
              </div>
              <div className="text-[11px] font-mono-tech text-orange-300 mt-0.5">
                {portalHud.toast.subtitle}
              </div>
            </div>
          )}

          {hud.missionBanner && (
            <div
              className="mt-4 max-w-xl border-y border-red-500/70 px-8 py-3 text-center transition-opacity duration-300"
              style={{ opacity: Math.min(1, hud.missionBanner.timer / 1.2) }}
            >
              <div className="font-display text-lg sm:text-2xl font-bold tracking-[0.22em] text-zinc-100">
                {hud.missionBanner.title}
              </div>
              <div className="text-xs sm:text-sm font-mono-tech tracking-wider text-red-300 mt-1">
                {hud.missionBanner.objective}
              </div>
            </div>
          )}

          {hud.chapterIntro && !hud.missionBanner && (
            <div
              className="mt-6 max-w-xl border-y border-red-500/70 px-8 py-3 text-center transition-opacity duration-300"
              style={{ opacity: Math.min(1, hud.chapterIntro.timer / 1.0) }}
            >
              <div className="text-[11px] font-mono-tech tracking-[0.26em] text-red-300">
                CHAPTER {String(hud.chapterIntro.number).padStart(2, '0')} · {hud.chapterIntro.region}
              </div>
              <div className="font-display text-xl sm:text-2xl font-bold tracking-[0.18em] text-zinc-100 mt-1">
                {hud.chapterIntro.title}
              </div>
              <div className="text-xs font-mono-tech tracking-wider text-amber-300 mt-1">
                {hud.chapterIntro.subtitle}
              </div>
            </div>
          )}
        </div>

        {/* Top-Right Quick Actions & Minimalist Radar */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 pointer-events-auto">
            {onOpenDatabase && (
              <button
                onClick={onOpenDatabase}
                className="bg-black/25 hover:bg-black/50 border-b border-sky-400/50 px-2.5 py-1 text-[11px] font-mono-tech text-sky-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>[K] DB</span>
              </button>
            )}
            <button
              onClick={onOpenInventory}
              className="bg-black/25 hover:bg-black/50 border-b border-zinc-400/40 px-2.5 py-1 text-[11px] font-mono-tech text-zinc-200 transition-colors cursor-pointer"
            >
              [TAB] LOGS
            </button>
            <button
              onClick={onPause}
              className="bg-black/25 hover:bg-black/50 border-b border-zinc-400/40 px-2.5 py-1 text-[11px] font-mono-tech text-zinc-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>ESC</span>
            </button>
          </div>

          {settings.showMinimap && (
            <div className="w-28 h-28 rounded-full bg-black/25 border border-zinc-400/30 relative overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center opacity-25">
                <div className="w-16 h-16 rounded-full border border-zinc-400" />
              </div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-zinc-100 rotate-45" />
              {hud.minimapBlips.map((b, idx) => {
                const dx = b.x - hud.minimapPlayer.x;
                const dz = b.z - hud.minimapPlayer.z;
                const cosY = Math.cos(hud.minimapPlayer.yaw);
                const sinY = Math.sin(hud.minimapPlayer.yaw);
                const rx = dx * cosY - dz * sinY;
                const rz = dx * sinY + dz * cosY;
                const scale = 1.4;
                const px = Math.max(-48, Math.min(48, rx * scale));
                const py = Math.max(-48, Math.min(48, rz * scale));
                const color =
                  b.kind === 'objective'
                    ? 'bg-sky-400 w-2.5 h-2.5'
                    : b.kind === 'boss'
                      ? 'bg-red-500 w-3 h-3'
                      : 'bg-red-400 w-2 h-2';
                return (
                  <div
                    key={idx}
                    className={`absolute rounded-full ${color}`}
                    style={{
                      left: `calc(50% + ${px}px)`,
                      top: `calc(50% + ${py}px)`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Center Dynamic Reticle, Hitmarker & Reload */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
        {!hud.isSniperAds && isPortalSlot && (
          <div className="relative w-16 h-16 flex flex-col items-center justify-center">
            <svg viewBox="0 0 64 64" className="w-12 h-12 overflow-visible">
              {/* Surface Lock Calibration Halo */}
              {portalHud?.surfaceInRange && (
                <circle
                  cx="32"
                  cy="32"
                  r="19"
                  fill="none"
                  stroke={
                    portalHud?.blueActive && portalHud?.orangeActive
                      ? '#34d399'
                      : !portalHud?.blueActive
                        ? '#38bdf8'
                        : '#fb923c'
                  }
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  strokeOpacity="0.8"
                />
              )}
              {/* Left Blue Portal Arc */}
              <path
                d="M 27 12 C 15 16, 12 24, 12 32 C 12 40, 15 48, 27 52"
                fill="none"
                stroke="#38bdf8"
                strokeWidth={portalHud?.blueActive ? 3.2 : 1.7}
                strokeLinecap="round"
                strokeOpacity={portalHud?.blueActive ? 1 : 0.38}
              />
              {/* Right Orange Portal Arc */}
              <path
                d="M 37 12 C 49 16, 52 24, 52 32 C 52 40, 49 48, 37 52"
                fill="none"
                stroke="#fb923c"
                strokeWidth={portalHud?.orangeActive ? 3.2 : 1.7}
                strokeLinecap="round"
                strokeOpacity={portalHud?.orangeActive ? 1 : 0.38}
              />
              {/* Center Calibration Dot */}
              <circle
                cx="32"
                cy="32"
                r={portalHud?.surfaceInRange ? 2.6 : 2.0}
                fill={
                  portalHud?.lastFired === 'blue'
                    ? '#38bdf8'
                    : portalHud?.lastFired === 'orange'
                      ? '#fb923c'
                      : portalHud?.surfaceInRange
                        ? '#ffffff'
                        : '#a1a1aa'
                }
              />
            </svg>
            {portalHud?.blueActive && portalHud?.orangeActive && (
              <div className="mt-1 px-1.5 py-0.5 bg-black/55 border border-emerald-400/60 text-[9px] font-mono-tech tracking-widest text-emerald-300 whitespace-nowrap">
                LINKED {portalHud.linkDistanceM != null ? `${portalHud.linkDistanceM}M` : ''}
              </div>
            )}
          </div>
        )}

        {!hud.isSniperAds && !isPortalSlot && (
          <div className="relative w-12 h-12 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-zinc-100/90" />
            <div
              className="absolute w-[1.5px] h-2 bg-zinc-100/85"
              style={{ transform: `translateY(-${prongGap}px)` }}
            />
            <div
              className="absolute w-[1.5px] h-2 bg-zinc-100/85"
              style={{ transform: `translateY(${prongGap}px)` }}
            />
            <div
              className="absolute h-[1.5px] w-2 bg-zinc-100/85"
              style={{ transform: `translateX(-${prongGap}px)` }}
            />
            <div
              className="absolute h-[1.5px] w-2 bg-zinc-100/85"
              style={{ transform: `translateX(${prongGap}px)` }}
            />

            {hud.hitMarkerTimer > 0 && (
              <div
                className={`absolute w-7 h-7 border-2 rotate-45 pointer-events-none ${
                  hud.hitMarkerCrit ? 'border-amber-400 scale-110' : 'border-red-500'
                }`}
              />
            )}
          </div>
        )}

        {hud.hitMarkerTimer > 0 && hud.hitMarkerCrit && (
          <div className="mt-0.5 text-[10px] font-mono-tech tracking-widest text-amber-400 font-bold">
            CRIT
          </div>
        )}

        {hud.isReloading && (
          <div className="mt-3 w-28 bg-black/45 border border-zinc-500/40 p-0.5">
            <div
              className="h-1 bg-amber-400 transition-all duration-75"
              style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Floating Near-Object Interact Prompt */}
      {hud.interactPrompt && (
        <div
          className="fixed z-25 pointer-events-none"
          style={
            hud.interactScreenPos
              ? {
                  left: `${hud.interactScreenPos.x * 100}%`,
                  top: `${hud.interactScreenPos.y * 100}%`,
                  transform: 'translate(-50%, -120%)',
                }
              : {
                  left: '50%',
                  bottom: '5.5rem',
                  transform: 'translateX(-50%)',
                }
          }
        >
          <div
            className={`px-3 py-1 bg-black/45 border-b-2 ${
              hud.interactEducationId
                ? 'border-sky-400 text-sky-200'
                : 'border-amber-400 text-amber-200'
            } font-mono-tech tracking-wider whitespace-nowrap ${
              settings.largeHudText ? 'text-sm sm:text-base' : 'text-xs'
            }`}
          >
            {hud.interactEducationId && (
              <span className="text-[10px] text-sky-400 mr-2 font-semibold">FIELD SCAN</span>
            )}
            <span>{hud.interactPrompt}</span>
          </div>
        </div>
      )}

      {/* Bottom-Center Mouse Lock & Minimalist Key Hints */}
      {!settings.touchControls && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-20">
          {!hud.pointerLocked && (
            <button
              onClick={onLockPointer}
              className="pointer-events-auto bg-red-950/75 hover:bg-red-900/90 border border-red-500/80 px-4 py-1 text-[11px] font-mono-tech tracking-widest text-zinc-100 cursor-pointer transition-colors"
            >
              CLICK VIEWPORT TO ENGAGE MOUSE LOOK
            </button>
          )}
          <div className="hidden xl:flex items-center gap-2.5 text-[10px] font-mono-tech text-zinc-300/70 whitespace-nowrap">
            <span>WASD</span>
            <span>·</span>
            <span>SHIFT SPRINT</span>
            <span>·</span>
            <span>E INTERACT</span>
            <span>·</span>
            <span>
              {isPortalSlot ? 'LMB BLUE · RMB ORANGE · R PAIR · G CLEAR' : 'R RELOAD'}
            </span>
            <span>·</span>
            <span>{portalHud?.unlocked ? '1/2/3 WEAPONS' : '1/2 SWAP'}</span>
            <span>·</span>
            <span>Q ABILITY</span>
            <span>·</span>
            <span>K DATABASE</span>
          </div>
        </div>
      )}

      {/* Bottom HUD Corners: Minimalist Vitals (Left) & Weapon/Ability (Right) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 sm:p-5 flex items-end justify-between gap-4 pointer-events-none">
        {/* Bottom-Left Transparent Vitals */}
        <div className="w-56 sm:w-64 space-y-1.5 tabular-nums border-l-2 border-red-500/75 pl-3">
          <div className="flex items-center justify-between text-xs font-mono-tech">
            <span className="flex items-center gap-1.5 text-zinc-200">
              <HeartPulse className="w-3.5 h-3.5 text-red-400" />
              <span>HP</span>
            </span>
            <span className="text-zinc-100 font-bold text-sm">
              {hud.health} <span className="text-zinc-400 font-normal text-xs">/ {hud.maxHealth}</span>
            </span>
          </div>
          <div className="w-full h-1.5 bg-black/45 overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                hud.health < 30 ? 'bg-red-500' : 'bg-red-600'
              }`}
              style={{ width: `${Math.max(0, (hud.health / hud.maxHealth) * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono-tech">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <Shield className="w-3 h-3 text-sky-400" />
              <span>ARMOR</span>
            </span>
            <span className="text-zinc-200">
              {hud.armor} / {hud.maxArmor}
            </span>
          </div>
          <div className="w-full h-1 bg-black/45 overflow-hidden">
            <div
              className="h-full bg-sky-400 transition-all duration-100"
              style={{ width: `${Math.max(0, (hud.armor / hud.maxArmor) * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono-tech text-zinc-300/90">
            <span>STAMINA {hud.stamina}%</span>
            <span className="flex items-center gap-2.5">
              <span className="flex items-center gap-1">
                <Flashlight className={`w-3 h-3 ${hud.flashlightOn ? 'text-amber-400' : 'text-zinc-400'}`} />
                <span>[F] {hud.flashlightBattery}%</span>
              </span>
              <span>[H] ×{hud.medkits}</span>
            </span>
          </div>
          <div className="w-full h-0.5 bg-black/40 overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                hud.stamina < 25 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, hud.stamina))}%` }}
            />
          </div>
        </div>

        {/* Bottom-Right Transparent Weapon & Ammo */}
        <div
          className={`w-64 sm:w-72 space-y-1 text-right tabular-nums border-r-2 pr-3 ${
            isPortalSlot ? 'border-sky-400/85' : 'border-amber-400/70'
          }`}
        >
          <div className="text-[10px] font-mono-tech text-zinc-300 tracking-wider">
            {weaponDef.category} · SLOT {hud.activeSlot + 1}
          </div>
          <div className="font-display text-sm font-semibold text-zinc-100 tracking-wide">
            {weaponDef.name}
          </div>

          {isPortalSlot ? (
            <div className="space-y-1">
              <div className="flex items-baseline justify-end gap-2 font-mono-tech">
                <span className="text-3xl font-bold leading-none text-sky-300">∞</span>
                <span className="text-xs text-zinc-300 tracking-wider">
                  ZERO-POINT · {portalHud?.upgrades.length ?? 0}/5 MODS
                </span>
              </div>
              <div className="flex items-center justify-end gap-2 text-[10px] font-mono-tech">
                <span
                  className={`px-1.5 py-0.5 border ${
                    portalHud?.blueActive
                      ? 'border-sky-400 bg-sky-950/70 text-sky-200 font-bold'
                      : 'border-zinc-700 bg-black/40 text-zinc-400'
                  }`}
                >
                  [LMB] BLUE
                </span>
                <span
                  className={`px-1.5 py-0.5 border ${
                    portalHud?.orangeActive
                      ? 'border-orange-400 bg-orange-950/70 text-orange-200 font-bold'
                      : 'border-zinc-700 bg-black/40 text-zinc-400'
                  }`}
                >
                  [RMB] ORANGE
                </span>
                <span className="text-sky-200/85">[R] PAIR</span>
                <span className="text-zinc-400">[G] CLEAR</span>
              </div>
            </div>
          ) : (
            <div className="flex items-baseline justify-end gap-1.5 font-mono-tech">
              <span
                className={`text-3xl font-bold leading-none ${
                  activeWeapon!.ammoInMag <= 4 ? 'text-red-400' : 'text-zinc-100'
                }`}
              >
                {String(activeWeapon!.ammoInMag).padStart(2, '0')}
              </span>
              <span className="text-sm text-zinc-300">/ {activeWeapon!.reserveAmmo}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-0.5 text-[10px] font-mono-tech">
            {isPortalSlot ? (
              <span className="text-zinc-300/80 truncate max-w-[130px]">
                [1] {WEAPONS[hud.weapons[0].id].name} · [2] {WEAPONS[hud.weapons[1].id].name}
              </span>
            ) : (
              <>
                <span className="text-zinc-300/80 truncate max-w-[110px]">
                  [{secondarySlot + 1}] {WEAPONS[secondaryWeapon.id].name}
                </span>
                {portalHud?.unlocked && (
                  <span className="text-sky-300 font-semibold">[3] PORTAL</span>
                )}
              </>
            )}
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-red-400" />
              {hud.abilityActive ? (
                <span className="text-amber-300">
                  {charDef.ability.name} {hud.abilityActiveRemaining.toFixed(1)}s
                </span>
              ) : hud.abilityCooldownRemaining > 0 ? (
                <span className="text-zinc-300">
                  [Q] {hud.abilityCooldownRemaining.toFixed(0)}s
                </span>
              ) : (
                <span className="text-red-300 font-semibold">[Q] {charDef.ability.name}</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile Touch Controls Overlay */}
      {settings.touchControls && (
        <div className="fixed inset-0 pointer-events-none z-30">
          <div
            className="fixed bottom-32 left-6 w-28 h-28 rounded-full border border-zinc-500/70 bg-black/35 pointer-events-auto touch-none flex items-center justify-center"
            onTouchStart={(e) => {
              const t = e.touches[0];
              moveStartRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchMove={(e) => {
              if (!moveStartRef.current) return;
              const t = e.touches[0];
              const dx = Math.max(-40, Math.min(40, t.clientX - moveStartRef.current.x)) / 40;
              const dy = Math.max(-40, Math.min(40, t.clientY - moveStartRef.current.y)) / 40;
              onTouchMove(dx, dy);
            }}
            onTouchEnd={() => {
              moveStartRef.current = null;
              onTouchMove(0, 0);
            }}
          >
            <div className="w-10 h-10 rounded-full bg-zinc-400/50 border border-zinc-300/60" />
          </div>

          <div
            className="fixed top-20 right-0 w-1/2 h-1/2 pointer-events-auto touch-none"
            onTouchStart={(e) => {
              const t = e.touches[0];
              lookLastRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchMove={(e) => {
              if (!lookLastRef.current) return;
              const t = e.touches[0];
              onTouchLook(t.clientX - lookLastRef.current.x, t.clientY - lookLastRef.current.y);
              lookLastRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={() => {
              lookLastRef.current = null;
            }}
          />

          <div className="fixed bottom-32 right-6 grid grid-cols-3 gap-2 pointer-events-auto">
            <button
              onTouchStart={() => onTouchAction('shoot_start')}
              onTouchEnd={() => onTouchAction('shoot_end')}
              className={`w-14 h-14 border text-xs font-mono-tech text-white ${
                isPortalSlot
                  ? 'bg-sky-700/80 border-sky-400'
                  : 'bg-red-800/75 border-red-500'
              }`}
            >
              {isPortalSlot ? 'BLUE' : 'FIRE'}
            </button>
            {isPortalSlot ? (
              <button
                onClick={() => onTouchAction('portal_orange')}
                className="w-14 h-14 bg-orange-700/80 border border-orange-400 text-xs font-mono-tech text-white"
              >
                ORANGE
              </button>
            ) : (
              <button
                onClick={() => onTouchAction('aim')}
                className="w-14 h-14 bg-black/50 border border-zinc-500 text-xs font-mono-tech text-zinc-200"
              >
                AIM
              </button>
            )}
            <button
              onClick={() => onTouchAction(portalHud?.unlocked ? 'switch' : 'reload')}
              className="w-14 h-14 bg-black/50 border border-zinc-500 text-xs font-mono-tech text-zinc-200"
            >
              {portalHud?.unlocked ? 'SWAP' : 'RELOAD'}
            </button>
            <button
              onClick={() => onTouchAction('interact')}
              className="w-14 h-14 bg-amber-900/70 border border-amber-400 text-xs font-mono-tech text-amber-100"
            >
              USE
            </button>
            <button
              onClick={() => onTouchAction('ability')}
              className="w-14 h-14 bg-black/50 border border-red-600 text-xs font-mono-tech text-red-300"
            >
              SKILL
            </button>
            <button
              onClick={() => onTouchAction('flashlight')}
              className="w-14 h-14 bg-black/50 border border-zinc-500 text-xs font-mono-tech text-zinc-200"
            >
              LIGHT
            </button>
          </div>
        </div>
      )}

      <div className="sr-only">
        <Volume2 />
      </div>
    </div>
  );
};
