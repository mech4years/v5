import React, { useState } from 'react';
import { BookOpen, FileText, Globe, Package, ShieldAlert, Volume2, X, Zap } from 'lucide-react';
import { FACTIONS, LORE_ENTRIES, PORTAL_UPGRADES, WORLD_REGIONS } from '../game/data';
import { HudSnapshot } from '../game/types';

interface Props {
  hud: HudSnapshot;
  onClose: () => void;
  onOpenDatabase?: () => void;
}

export const InventoryDrawer: React.FC<Props> = ({ hud, onClose, onOpenDatabase }) => {
  const [tab, setTab] = useState<'inventory' | 'lore' | 'world' | 'factions'>('inventory');

  return (
    <div className="fixed inset-0 z-40 bg-black/85 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-4xl bg-[#0b0d12] border border-zinc-800 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 gap-3">
          <div>
            <h2 className="font-display text-xl font-bold tracking-wider text-zinc-100">
              FIELD DATAPAD &amp; INVENTORY
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Collected equipment, recovered HELIOS recordings, regional intel, and factions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onOpenDatabase && (
              <button
                onClick={onOpenDatabase}
                className="px-3 py-1.5 border border-sky-700/80 bg-sky-950/40 hover:bg-sky-900/50 text-xs font-mono-tech text-sky-200 flex items-center gap-1.5 cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-sky-400" />
                <span>SCIENTIFIC DATABASE</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 border border-zinc-700 hover:border-red-500 text-xs font-mono-tech text-zinc-200 flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>CLOSE</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-zinc-800 bg-[#080a0e]">
          <button
            onClick={() => setTab('inventory')}
            className={`px-4 py-2 text-xs font-mono-tech flex items-center gap-2 cursor-pointer transition-colors ${
              tab === 'inventory' ? 'bg-red-950 text-red-200 border border-red-700' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>INVENTORY ({hud.inventory.length})</span>
          </button>
          <button
            onClick={() => setTab('lore')}
            className={`px-4 py-2 text-xs font-mono-tech flex items-center gap-2 cursor-pointer transition-colors ${
              tab === 'lore' ? 'bg-red-950 text-red-200 border border-red-700' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>DOCUMENTS & AUDIO ({hud.collectedLoreIds.length}/36)</span>
          </button>
          <button
            onClick={() => setTab('world')}
            className={`px-4 py-2 text-xs font-mono-tech flex items-center gap-2 cursor-pointer transition-colors ${
              tab === 'world' ? 'bg-red-950 text-red-200 border border-red-700' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>WORLD SECTORS</span>
          </button>
          <button
            onClick={() => setTab('factions')}
            className={`px-4 py-2 text-xs font-mono-tech flex items-center gap-2 cursor-pointer transition-colors ${
              tab === 'factions' ? 'bg-red-950 text-red-200 border border-red-700' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>FACTIONS</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {tab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hud.inventory.map((item) => (
                <div key={item.id} className="border border-zinc-800 bg-[#080a0e] p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-semibold text-zinc-100">{item.name}</span>
                    <span className="font-mono-tech text-xs text-amber-400 tabular-nums">QTY {item.quantity}</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5">{item.description}</p>
                </div>
              ))}
              <div className="border border-zinc-800 bg-[#080a0e] p-4">
                <div className="flex items-center justify-between">
                  <span className="font-display font-semibold text-zinc-100">Sector Grid & Secrets</span>
                  <span className={`font-mono-tech text-xs ${hud.powerRestored ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {hud.powerRestored ? 'POWER ONLINE' : 'AUXILIARY'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1.5 tabular-nums">
                  Hidden caches found in current chapter: {hud.secretsFoundInLevel}/{hud.secretsTotalInLevel}
                </p>
              </div>
              <div className="md:col-span-2 border border-sky-900/60 bg-[#080d14] p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display font-semibold text-zinc-100 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-sky-400" />
                    <span>Aperture Science Handheld Portal Device [Slot 3]</span>
                  </span>
                  <span
                    className={`font-mono-tech text-xs ${
                      hud.portalHud?.unlocked ? 'text-sky-300' : 'text-zinc-500'
                    }`}
                  >
                    {hud.portalHud?.unlocked
                      ? `ONLINE · ${hud.portalHud.upgrades.length}/5 MODULES`
                      : 'NOT YET RECOVERED (CH.01 BREACH HATCH)'}
                  </span>
                </div>
                {hud.portalHud?.unlocked && (
                  <>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-tech">
                      <span className={hud.portalHud.blueActive ? 'text-sky-300' : 'text-zinc-500'}>
                        BLUE TUNNEL [LMB]: {hud.portalHud.blueActive ? 'ACTIVE' : 'STANDBY'}
                      </span>
                      <span className={hud.portalHud.orangeActive ? 'text-orange-300' : 'text-zinc-500'}>
                        ORANGE TUNNEL [RMB]: {hud.portalHud.orangeActive ? 'ACTIVE' : 'STANDBY'}
                      </span>
                      <span className="text-zinc-400">[G] FIZZLE PORTALS</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {PORTAL_UPGRADES.map((upg) => {
                        const installed = hud.portalHud.upgrades.includes(upg.id);
                        return (
                          <div
                            key={upg.id}
                            className={`border px-3 py-2 text-xs ${
                              installed
                                ? 'border-sky-700/70 bg-sky-950/35 text-zinc-200'
                                : 'border-zinc-800/80 bg-black/30 text-zinc-500'
                            }`}
                          >
                            <div className="flex items-center justify-between font-mono-tech text-[10px]">
                              <span style={{ color: installed ? upg.accentColor : undefined }}>
                                {upg.shortLabel}
                              </span>
                              <span>{installed ? 'INSTALLED' : `CH.${String(upg.missionNumber).padStart(2, '0')}`}</span>
                            </div>
                            <div className="font-semibold mt-0.5">{upg.name}</div>
                            {installed && (
                              <div className="text-[11px] text-zinc-400 mt-0.5">{upg.description}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {tab === 'lore' && (
            <div className="space-y-4">
              {hud.collectedLoreIds.length === 0 ? (
                <div className="border border-zinc-800 bg-[#080a0e] p-6 text-center text-sm text-zinc-400">
                  No documents or audio recordings recovered yet. Search vehicles, laboratories, checkpoints, and alien chambers.
                </div>
              ) : (
                hud.collectedLoreIds.map((id) => {
                  const entry = LORE_ENTRIES[id];
                  if (!entry) return null;
                  return (
                    <div key={id} className="border border-zinc-800 bg-[#080a0e] p-4 space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="font-display font-semibold text-zinc-100 flex items-center gap-2">
                          {entry.kind === 'audio' ? (
                            <Volume2 className="w-4 h-4 text-red-400" />
                          ) : (
                            <FileText className="w-4 h-4 text-amber-400" />
                          )}
                          <span>{entry.title}</span>
                        </h3>
                        <span className="font-mono-tech text-[11px] text-zinc-400">
                          CH.{String(entry.levelNumber).padStart(2, '0')} · {entry.faction} · {entry.timestamp}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">{entry.content}</p>
                      {entry.transcript && (
                        <p className="text-xs font-mono-tech text-red-300 bg-black/50 p-3 border border-red-900/40">
                          {entry.transcript}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'world' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {WORLD_REGIONS.map((region) => (
                <div key={region.id} className="border border-zinc-800 bg-[#080a0e] p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-zinc-100">{region.name}</span>
                    <span className="font-mono-tech text-[11px] text-red-400">{region.status}</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{region.description}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'factions' && (
            <div className="space-y-3">
              {FACTIONS.map((fac) => (
                <div key={fac.id} className="border border-zinc-800 bg-[#080a0e] p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-zinc-100">{fac.name}</span>
                    <span className="text-xs italic text-red-400">"{fac.motto}"</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{fac.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
