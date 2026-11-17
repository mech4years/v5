import * as THREE from 'three';
import { cloneTiledTexture, ProceduralTextureSet } from '../textures';
import { BuiltWorld } from '../worldBuilder';
import {
  addConsoleInteractable,
  addDestructibleBarricade,
  addDetailedPillar,
  addDynamicDoor,
  addFireSpot,
  addFloorDecal,
  addLabCryoChamber,
  addLevelExitGate,
  addMeteorCrater,
  addMetroPlatform,
  addMilitaryTankWreck,
  addPerimeterWalls,
  addPickup,
  addPipeConduit,
  addRoomLighting,
  addSaveAndWorkbench,
  addSolidBox,
  addStandardFloor,
  addStructuralArchRibs,
  addWallXWithDoor,
  addWallZWithDoor,
  createLevelContext,
  finalizeLevelWorld,
  makeTiledMat,
} from './levelShared';

// ============================================================================
// LEVEL 05 — THE UNDERGROUND (Metro Platforms, Steam Tunnels + THE FORGEMASTER Boss)
// ============================================================================
export function buildLevel5World(
  scene: THREE.Scene,
  textures: ProceduralTextureSet
): BuiltWorld {
  const ctx = createLevelContext(scene, textures, 0x0a0504, 0x130805, 0.018);

  const floorMat = makeTiledMat(ctx, {
    map: textures.grateMap,
    normalMap: textures.grateNormal,
    roughnessMap: textures.grateRoughness,
    metalnessMap: textures.grateMetalness,
    repeatX: 16,
    repeatY: 32,
    color: 0xb8aca6,
    roughness: 0.62,
    metalness: 0.72,
    normalScale: 1.5,
  });
  const ironWall = makeTiledMat(ctx, {
    map: textures.metalPlateMap,
    normalMap: textures.metalNormal,
    roughnessMap: textures.metalRoughness,
    repeatX: 8,
    repeatY: 3,
    color: 0x4b342e,
    roughness: 0.52,
    metalness: 0.8,
    normalScale: 1.4,
  });
  const darkSteel = makeTiledMat(ctx, {
    map: textures.metalPlateMap,
    normalMap: textures.metalNormal,
    repeatX: 2,
    repeatY: 2,
    color: 0x1e222a,
    metalness: 0.88,
    roughness: 0.34,
  });
  const hazMat = makeTiledMat(ctx, {
    map: textures.hazardStripeMap,
    normalMap: textures.metalNormal,
    repeatX: 3,
    repeatY: 1,
    roughness: 0.45,
    metalness: 0.45,
  });
  const moltenMat = new THREE.MeshStandardMaterial({
    color: 0xff5a1f,
    emissive: 0xea580c,
    emissiveIntensity: 2.2,
    roughness: 0.18,
  });
  ctx.disposeables.push(moltenMat);

  addStandardFloor(ctx, 68, 128, 0, -35, floorMat, 12.0, ironWall);
  addPerimeterWalls(ctx, -32, 32, -96, 24, 12.0, ironWall);
  addStructuralArchRibs(ctx, -31.4, 31.4, [12, -14, -40, -56, -74, -88], 12.0, darkSteel, ironWall);

  // 1. SUNKEN METRO PLATFORM & RAIL BED at arrival sector
  addMetroPlatform(ctx, -14, 4, 28);

  // Shorted electrical junction spark emitters
  ctx.sparkEmitters.push(
    { position: new THREE.Vector3(-14, 3.8, 6), interval: 1.4, timer: 0.2 },
    { position: new THREE.Vector3(14, 3.8, -12), interval: 1.8, timer: 0.9 }
  );

  // Entry Metro / Conveyor Hall -> Foundry Crucible Arena separated by blast door
  addWallXWithDoor(ctx, -28, -32, 32, 12.0, 1.2, 0, 7.0, 5.2, ironWall);
  addDynamicDoor(ctx, 'door_l5_boss', 0, -28, 7.0, 5.2, 0.7, 0x27272a, 0xf59e0b);

  // Detailed Multi-Part Conveyor Lines + Hydraulic Stamping Presses
  [-12, 12].forEach((px) => {
    addSolidBox(ctx, px, 1.1, -6, 3.6, 2.2, 16, ironWall);
    addSolidBox(ctx, px, 6.5, -6, 4.2, 4.0, 4.2, ironWall);
    // Hazard safety collar & chrome hydraulic piston shafts
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.35, 16.1), hazMat);
    bumper.position.set(px, 2.15, -6);
    const dieBlock = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.45, 4.4), hazMat);
    dieBlock.position.set(px, 4.45, -6);
    [-1.2, 1.2].forEach((rx) => {
      const ram = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 3.2, 10),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.94, roughness: 0.18 })
      );
      ram.position.set(px + rx, 3.4, -6);
      scene.add(ram);
    });
    scene.add(bumper, dieBlock);
  });

  // Boss Arena structural detailed pillars & curbed molten slag vats on flanks
  [-16, 16].forEach((vx) => {
    [-54, -76].forEach((vz) => {
      addDetailedPillar(ctx, vx, vz, 3.2, 7.6, 3.2, ironWall, darkSteel, 0xf97316);
    });
    const curbX = vx * 1.48;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.52, 16.8), darkSteel);
    curb.position.set(curbX, 0.26, -64);
    const vat = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.58, 15.8), moltenMat);
    vat.position.set(curbX, 0.28, -64);
    scene.add(curb, vat);
    ctx.colliders.push({
      minX: curbX - 3.2,
      maxX: curbX + 3.2,
      minY: 0,
      maxY: 0.75,
      minZ: -72.4,
      maxZ: -55.6,
      tag: 'slag_vat',
    });
    addPipeConduit(ctx, curbX, 4.8, -64, curbX, 1.2, -64, 0.34, darkSteel, hazMat);
    addFireSpot(ctx, `l5_molten_${vx}`, vx * 1.4, 0.5, -64, 1.4);
  });

  addFloorDecal(ctx, 0, -64, 10, 10, textures.scorchDecalMap, 0.85, 0.3);
  addFloorDecal(ctx, 0, -14, 5, 5, textures.scorchDecalMap, 0.72, -0.5);

  // Secret Slag Catwalk Stash enclosed flush with x=32 perimeter (x: 17..32, z: -24..-8)
  addSolidBox(ctx, 24.5, 3.0, -8, 15.5, 6.0, 0.8, ironWall);
  addSolidBox(ctx, 24.5, 3.0, -24, 15.5, 6.0, 0.8, ironWall);
  addWallZWithDoor(ctx, 17, -24, -8, 6.0, 0.8, -16, 4.5, 2.4, ironWall);
  addSolidBox(ctx, 24.5, 6.2, -16, 15.5, 0.4, 16.5, ironWall);
  addDestructibleBarricade(ctx, 'l5_secret_plate', 17, -16, 0.75, 2.4, 4.6, 0xb45309);
  addPickup(ctx, 'sec_05_stash', 'secret_cache', 'CLAIM FOUNDRY ALLOY STASH (+2 SALVAGE)', 25, 0.5, -19, 0xf59e0b, {
    secretId: 'sec_05_foundry',
    secretTitle: 'SMELTER CATWALK CACHE',
  });

  addConsoleInteractable(
    ctx,
    'l5_furnace_puzzle',
    'puzzle',
    'BALANCE CRUCIBLE MANIFOLD TO OPEN FOUNDRY',
    0,
    -25.2,
    0xf59e0b,
    { puzzleId: 'puz_05_furnace', doorId: 'door_l5_boss' }
  );
  addConsoleInteractable(ctx, 'l5_hazard_west', 'hazard_switch', 'PULL WEST CRUCIBLE PURGE VALVE (STUN BOSS)', -20, -64, 0xef4444);
  addConsoleInteractable(ctx, 'l5_hazard_east', 'hazard_switch', 'PULL EAST CRUCIBLE PURGE VALVE (STUN BOSS)', 20, -64, 0xef4444);

  addSaveAndWorkbench(ctx, 'l5', -18, 10, -18, -18);
  addLevelExitGate(ctx, 'l5_exit', 'DESCEND INTO BLACKSITE 09 (LEVEL 06)', 0, -92, 2);

  addPickup(ctx, 'l5_lore_1', 'lore', 'READ FOUNDRY OVERSEER REPORT', 5, 0.5, 10, 0x60a5fa, {
    loreId: 'doc_factory_shift',
  });
  addPickup(ctx, 'l5_lore_2', 'lore', 'READ CRUCIBLE PURGE MANUAL', -6, 0.5, -20, 0x60a5fa, {
    loreId: 'doc_forgemaster_weakness',
  });
  addPickup(ctx, 'l5_lore_3', 'lore', 'PLAY SMELTER FLOOR AUDIO LOG', 16, 0.5, -42, 0xf87171, {
    loreId: 'audio_factory_last',
  });
  addPickup(ctx, 'l5_med_1', 'medkit', 'COLLECT TRAUMA PACK (+35 HP)', -22, 0.35, -44, 0x22c55e);
  addPickup(ctx, 'l5_med_2', 'medkit', 'COLLECT TRAUMA PACK (+35 HP)', 22, 0.35, -76, 0x22c55e);
  addPickup(ctx, 'l5_ammo_1', 'ammo', 'COLLECT FOUNDRY AMMO CRATE', -22, 0.35, -76, 0xf59e0b);
  addPickup(ctx, 'l5_ammo_2', 'ammo', 'COLLECT FOUNDRY AMMO CRATE', 22, 0.35, -44, 0xf59e0b);

  addRoomLighting(ctx, [
    [0, 9.5, 8, 0xf59e0b, false],
    [0, 10.5, -58, 0xff6b1a, true],
    [-16, 8.5, -72, 0xef4444, false],
    [16, 8.5, -72, 0xef4444, false],
  ]);

  ctx.enemySpawns.push(
    { id: 'l5_scrapper_1', type: 'scrapper', position: new THREE.Vector3(-4, 0, -6), patrolTarget: new THREE.Vector3(5, 0, -14), initiallyActive: true },
    { id: 'l5_brute_1', type: 'brute_enemy', position: new THREE.Vector3(6, 0, -18), patrolTarget: new THREE.Vector3(-5, 0, -18), initiallyActive: true },
    { id: 'l5_boss_forgemaster', type: 'forgemaster', position: new THREE.Vector3(0, 0, -72), patrolTarget: new THREE.Vector3(0, 0, -54), initiallyActive: true, isBoss: true }
  );

  return finalizeLevelWorld(ctx, new THREE.Vector3(0, 0, 18), 0, new THREE.Vector3(0, 0, -64));
}

// ============================================================================
// LEVEL 06 — THE FORGOTTEN LABORATORY (Classified Research & Cryo Chambers + THE SENTINEL Boss)
// ============================================================================
export function buildLevel6World(
  scene: THREE.Scene,
  textures: ProceduralTextureSet
): BuiltWorld {
  const ctx = createLevelContext(scene, textures, 0x03050a, 0x060912, 0.019);

  const floorMat = makeTiledMat(ctx, {
    map: textures.metalPlateMap,
    normalMap: textures.metalNormal,
    roughnessMap: textures.metalRoughness,
    metalnessMap: textures.metalMetalness,
    repeatX: 16,
    repeatY: 30,
    color: 0x334155,
    metalness: 0.78,
    roughness: 0.34,
    normalScale: 1.35,
  });
  const grateMat = makeTiledMat(ctx, {
    map: textures.grateMap,
    normalMap: textures.grateNormal,
    roughnessMap: textures.grateRoughness,
    repeatX: 2,
    repeatY: 28,
    roughness: 0.44,
    metalness: 0.85,
  });
  const bunkerWall = makeTiledMat(ctx, {
    map: textures.metalPlateMap,
    normalMap: textures.metalNormal,
    roughnessMap: textures.metalRoughness,
    repeatX: 8,
    repeatY: 2,
    color: 0x475569,
    roughness: 0.42,
    metalness: 0.84,
    normalScale: 1.3,
  });
  const darkTrim = makeTiledMat(ctx, {
    map: textures.metalPlateMap,
    normalMap: textures.metalNormal,
    repeatX: 2,
    repeatY: 2,
    color: 0x0f172a,
    metalness: 0.9,
    roughness: 0.28,
  });
  const telemetryBayMat = makeTiledMat(ctx, {
    map: textures.serverRackMap,
    normalMap: textures.serverRackNormal,
    emissiveMap: textures.serverRackEmissive,
    repeatX: 2,
    repeatY: 1,
    emissive: 0xffffff,
    emissiveIntensity: 1.1,
    roughness: 0.32,
    metalness: 0.72,
  });

  addStandardFloor(ctx, 64, 126, 0, -35, floorMat, 7.6, bunkerWall);
  const centerStrip = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 120), grateMat);
  centerStrip.rotation.x = -Math.PI / 2;
  centerStrip.position.set(0, 0.015, -35);
  centerStrip.receiveShadow = true;
  scene.add(centerStrip);

  addPerimeterWalls(ctx, -30, 30, -96, 24, 7.6, bunkerWall);
  addStructuralArchRibs(ctx, -29.4, 29.4, [14, -8, -24, -44, -60, -78], 7.6, darkTrim, bunkerWall);

  // 1. CRYOGENIC RESEARCH SPECIMEN CHAMBERS
  addLabCryoChamber(ctx, -14, -12, 0);
  addLabCryoChamber(ctx, 14, -12, 0);
  addLabCryoChamber(ctx, -14, -42, 0); // Shattered cryo pod where biological subject breached containment!

  // Entry -> Security & Weapons Lab -> Armory Vault -> Sentinel Hangar
  addWallXWithDoor(ctx, 2, -30, 30, 7.6, 1.0, 0, 5.5, 4.2, bunkerWall);
  addWallXWithDoor(ctx, -32, -30, 30, 7.6, 1.0, 0, 6.6, 4.6, bunkerWall);
  addDynamicDoor(ctx, 'door_l6_vault', 0, -32, 6.6, 4.6, 0.6, 0x1e293b, 0xef4444);

  // Perimeter Security Server Banks mounted cleanly along East & West walls
  [-28.2, 28.2].forEach((bx) => {
    [-10, -20, -48, -72].forEach((bz) => {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.4, 5.2), telemetryBayMat);
      bank.position.set(bx, 2.2, bz);
      bank.castShadow = true;
      scene.add(bank);
      ctx.colliders.push({
        minX: bx - 0.8,
        maxX: bx + 0.8,
        minY: 0,
        maxY: 4.4,
        minZ: bz - 2.6,
        maxZ: bz + 2.6,
        tag: 'server_bank',
      });
    });
  });

  addPipeConduit(ctx, -18, 6.4, 20, -18, 6.4, -90, 0.22, darkTrim);
  addPipeConduit(ctx, 18, 6.4, 20, 18, 6.4, -90, 0.22, darkTrim);

  // Detailed Tactical Blast Pillars in Sentinel Boss Hangar
  [-14, 14].forEach((px) => {
    [-48, -72].forEach((pz) => {
      addDetailedPillar(ctx, px, pz, 3.0, 7.6, 3.0, bunkerWall, darkTrim, 0xef4444);
    });
  });

  addFloorDecal(ctx, 0, -60, 8, 8, textures.scorchDecalMap, 0.78, 0.2);
  addFloorDecal(ctx, -4, -14, 3.5, 3.5, textures.bloodDecalMap, 0.68, 0.9);

  // Secret Blacksite Armory Vault behind destructible steel shutter (x: -30..-12, z: -22..-6)
  addSolidBox(ctx, -21, 3.8, -6, 18.5, 7.6, 0.8, bunkerWall);
  addSolidBox(ctx, -21, 3.8, -22, 18.5, 7.6, 0.8, bunkerWall);
  addWallZWithDoor(ctx, -12, -22, -6, 7.6, 0.8, -14, 4.2, 2.6, bunkerWall);
  addSolidBox(ctx, -21, 7.75, -14, 18.5, 0.4, 16.5, bunkerWall);
  addDestructibleBarricade(ctx, 'l6_secret_shutter', -12, -14, 0.75, 2.6, 4.3, 0xef4444);
  addPickup(ctx, 'sec_06_stash', 'secret_cache', 'CLAIM BLACKSITE PROTOTYPE CORES (+2 SALVAGE)', -23, 0.5, -14, 0xf59e0b, {
    secretId: 'sec_06_armory',
    secretTitle: 'BLACKSITE PROTOTYPE ARMORY',
  });

  addConsoleInteractable(
    ctx,
    'l6_security_puzzle',
    'puzzle',
    'BYPASS BLACKSITE 09 SECURITY LOCKS (MATH PUZZLE)',
    14,
    -26,
    0xf59e0b,
    { puzzleId: 'puz_06_security', doorId: 'door_l6_vault' }
  );

  addSaveAndWorkbench(ctx, 'l6', 20, -8, 20, -18);
  addLevelExitGate(ctx, 'l6_exit', 'ENTER THE FLOODED SECTOR (LEVEL 07)', 0, -92, 2);

  addPickup(ctx, 'l6_lore_1', 'lore', 'READ BLACKSITE 09 CLASSIFIED FILE', -18, 0.5, 12, 0x60a5fa, {
    loreId: 'doc_blacksite_clearance',
  });
  addPickup(ctx, 'l6_lore_2', 'lore', 'READ AEGIS SENTINEL DOSSIER', 18, 0.5, 8, 0x60a5fa, {
    loreId: 'doc_sentinel_spec',
  });
  addPickup(ctx, 'l6_lore_3', 'lore', 'PLAY DIRECTOR VAULT RECORDING', 0, 0.5, -84, 0xf87171, {
    loreId: 'audio_blacksite_truth',
  });
  addPickup(ctx, 'l6_med_1', 'medkit', 'COLLECT MILITARY TRAUMA KIT (+35 HP)', -22, 0.35, -56, 0x22c55e);
  addPickup(ctx, 'l6_ammo_1', 'ammo', 'COLLECT ARMORY AMMO CRATE', 22, 0.35, -56, 0xf59e0b);
  addPickup(ctx, 'l6_bat_1', 'battery', 'COLLECT TACTICAL CELL', 0, 0.35, -16, 0x38bdf8);

  addRoomLighting(ctx, [
    [0, 6.8, 12, 0x38bdf8, false],
    [0, 6.8, -16, 0xef4444, true],
    [0, 6.8, -60, 0xef4444, true],
    [0, 6.8, -86, 0x22c55e, false],
  ]);

  ctx.enemySpawns.push(
    { id: 'l6_crawler_1', type: 'crawler', position: new THREE.Vector3(-4, 0, -8), patrolTarget: new THREE.Vector3(6, 0, -14), initiallyActive: true },
    { id: 'l6_brute_1', type: 'brute_enemy', position: new THREE.Vector3(8, 0, -18), patrolTarget: new THREE.Vector3(-4, 0, -22), initiallyActive: true },
    { id: 'l6_boss_sentinel', type: 'sentinel', position: new THREE.Vector3(0, 0, -68), patrolTarget: new THREE.Vector3(0, 0, -48), initiallyActive: true, isBoss: true }
  );

  return finalizeLevelWorld(ctx, new THREE.Vector3(0, 0, 19), 0, new THREE.Vector3(0, 0, -60));
}

// ============================================================================
// LEVEL 07 — THE IRON GRAVEYARD (Military Proving Grounds, Tank Wrecks, Flooded Bays + THE DROWNED MACHINE Boss)
// ============================================================================
export function buildLevel7World(
  scene: THREE.Scene,
  textures: ProceduralTextureSet
): BuiltWorld {
  const ctx = createLevelContext(scene, textures, 0x02090d, 0x04151c, 0.022);

  const dampConcrete = makeTiledMat(ctx, {
    map: textures.concreteMap,
    normalMap: textures.concreteNormal,
    roughnessMap: textures.concreteRoughness,
    repeatX: 16,
    repeatY: 32,
    color: 0x3b5862,
    roughness: 0.24,
    metalness: 0.35,
    normalScale: 1.5,
  });
  const rustSteel = makeTiledMat(ctx, {
    map: textures.metalPlateMap,
    normalMap: textures.metalNormal,
    roughnessMap: textures.metalRoughness,
    repeatX: 8,
    repeatY: 2,
    color: 0x2e434d,
    metalness: 0.74,
    roughness: 0.45,
    normalScale: 1.35,
  });
  const darkTrim = makeTiledMat(ctx, {
    map: textures.grateMap,
    normalMap: textures.grateNormal,
    repeatX: 2,
    repeatY: 2,
    color: 0x23353e,
    metalness: 0.84,
    roughness: 0.38,
  });

  // Animated shimmering ripple normal map on drainable water surfaces
  const animWaterNormal = cloneTiledTexture(textures.waterNormalMap, 8, 8, ctx.disposeables);
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0ea5e9,
    emissive: 0x0369a1,
    emissiveIntensity: 0.38,
    normalMap: animWaterNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    transparent: true,
    opacity: 0.64,
    roughness: 0.06,
    metalness: 0.14,
  });
  ctx.disposeables.push(waterMat);
  ctx.animatedProps.push({
    kind: 'uvScroll',
    texture: animWaterNormal,
    speed: 0.055,
    speed2: 0.032,
  });

  addStandardFloor(ctx, 64, 126, 0, -35, dampConcrete, 7.6, rustSteel);
  addPerimeterWalls(ctx, -30, 30, -96, 24, 7.6, rustSteel);
  addStructuralArchRibs(ctx, -29.4, 29.4, [12, -16, -48, -68, -86], 7.6, darkTrim, rustSteel);

  // 1. SCULPTED HEAVY MILITARY TANK WRECKS
  addMilitaryTankWreck(ctx, -14, 10, 0.4);  // Scorched hull with blown left tread near entrance
  addMilitaryTankWreck(ctx, 16, -20, -0.7); // Submerged gun bastion flanking middle flooded bay
  addMilitaryTankWreck(ctx, -15, -58, 2.2);  // Decayed armored unit guarding Drowned Machine sanctum

  addPipeConduit(ctx, -22, 5.6, 20, -22, 5.6, -90, 0.35, rustSteel, darkTrim);
  addPipeConduit(ctx, 22, 5.6, 20, 22, 5.6, -90, 0.35, rustSteel, darkTrim);

  addWallXWithDoor(ctx, 0, -30, 30, 7.6, 1.0, 0, 6.0, 4.4, rustSteel);
  addWallXWithDoor(ctx, -36, -30, 30, 7.6, 1.0, 0, 6.2, 4.4, rustSteel);

  addFloorDecal(ctx, -24, 14, 5.2, 5.2, textures.mossDecalMap, 0.85, 0.3);
  addFloorDecal(ctx, 24, -18, 4.8, 4.8, textures.mossDecalMap, 0.82, -0.7);
  addFloorDecal(ctx, -24, -52, 5.0, 5.0, textures.mossDecalMap, 0.8, 0.9);

  // 3 Drainable Flooded Water Sections
  const createWaterSection = (
    id: string,
    label: string,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number
  ) => {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), waterMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((minX + maxX) * 0.5, 1.05, (minZ + maxZ) * 0.5);
    scene.add(plane);
    ctx.waterSections.push({
      state: {
        id,
        label,
        currentY: 1.05,
        targetY: 1.05,
        drainedY: 0.04,
        bounds: { minX, maxX, minZ, maxZ },
      },
      mesh: plane,
    });
  };

  createWaterSection('water_sec_1', 'NORTH CORRIDOR BAY', -28, 28, -34, -2);
  createWaterSection('water_sec_2', 'HYDROLOGY RESEARCH BAY', -28, 28, -64, -38);
  createWaterSection('water_sec_3', 'TURBINE BOSS BASIN', -28, 28, -94, -64);

  // Submerged Research Annex (x: 13..30, z: -58..-42)
  addSolidBox(ctx, 21.5, 3.8, -42, 17.5, 7.6, 0.8, rustSteel);
  addSolidBox(ctx, 21.5, 3.8, -58, 17.5, 7.6, 0.8, rustSteel);
  addWallZWithDoor(ctx, 13, -58, -42, 7.6, 0.8, -50, 4.0, 2.4, rustSteel);
  addSolidBox(ctx, 21.5, 7.75, -50, 17.5, 0.4, 16.5, rustSteel);
  addDestructibleBarricade(ctx, 'l7_secret_bulkhead', 13, -50, 0.75, 2.4, 4.1, 0x0ea5e9);
  addPickup(ctx, 'sec_07_stash', 'secret_cache', 'CLAIM SUBMERGED RESEARCH CACHE (+2 SALVAGE)', 23, 0.5, -50, 0xf59e0b, {
    secretId: 'sec_07_submerged',
    secretTitle: 'HIDDEN HYDROLOGY CHAMBER',
  });

  // Pump Puzzle + 3 Section Drain Switches
  addConsoleInteractable(
    ctx,
    'l7_pump_puzzle',
    'puzzle',
    'SOLVE SUMP FLOW EQUATION TO POWER PUMPS',
    -12,
    8,
    0xf59e0b,
    { puzzleId: 'puz_07_pump' }
  );
  addConsoleInteractable(ctx, 'l7_pump_1', 'pump_switch', 'DRAIN BAY ALPHA (SECTOR 1)', -18, -6, 0x38bdf8, {
    waterSectionId: 'water_sec_1',
  });
  addConsoleInteractable(ctx, 'l7_pump_2', 'pump_switch', 'DRAIN BAY BETA (SECTOR 2)', -18, -40, 0x38bdf8, {
    waterSectionId: 'water_sec_2',
  });
  addConsoleInteractable(ctx, 'l7_pump_3', 'pump_switch', 'DRAIN TURBINE BASIN (SECTOR 3)', 18, -40, 0x38bdf8, {
    waterSectionId: 'water_sec_3',
  });

  // Detailed Cylindrical Hydro-Turbine Generators in Boss Basin
  [-12, 12].forEach((px) => {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.65, 6.2, 14), rustSteel);
    cyl.position.set(px, 3.1, -74);
    cyl.castShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.62, 0.14, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0284c7, emissiveIntensity: 1.2 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(px, 2.2, -74);
    scene.add(cyl, ring);
    ctx.colliders.push({
      minX: px - 1.5,
      maxX: px + 1.5,
      minY: 0,
      maxY: 6.2,
      minZ: -75.5,
      maxZ: -72.5,
    });
  });

  addSaveAndWorkbench(ctx, 'l7', 14, 12, 14, 4);
  addLevelExitGate(ctx, 'l7_exit', 'DESCEND INTO BIO-MECHANICAL NEST (LEVEL 08)', 0, -92, 2);

  addPickup(ctx, 'l7_lore_1', 'lore', 'READ HYDROLOGY DRAIN PROTOCOL', 6, 0.5, 14, 0x60a5fa, {
    loreId: 'doc_flooded_pumps',
  });
  addPickup(ctx, 'l7_lore_2', 'lore', 'READ THE DROWNED MACHINE FILE', -8, 0.5, -24, 0x60a5fa, {
    loreId: 'doc_drowned_machine',
  });
  addPickup(ctx, 'l7_lore_3', 'lore', 'PLAY HIDDEN ANNEX AUDIO LOG', 20, 0.5, -48, 0xf87171, {
    loreId: 'audio_flooded_diver',
  });
  addPickup(ctx, 'l7_med_1', 'medkit', 'COLLECT WATERPROOF MEDKIT (+35 HP)', -20, 0.35, -22, 0x22c55e);
  addPickup(ctx, 'l7_ammo_1', 'ammo', 'COLLECT AMMO CRATE', 22.5, 0.35, -16.5, 0xf59e0b);
  addPickup(ctx, 'l7_bat_1', 'battery', 'COLLECT LAMP BATTERY', 0, 0.35, -48, 0x38bdf8);

  addRoomLighting(ctx, [
    [0, 6.8, 12, 0x38bdf8, false],
    [0, 6.8, -18, 0x0ea5e9, true],
    [0, 6.8, -52, 0x38bdf8, false],
    [0, 6.8, -78, 0xef4444, true],
  ]);

  ctx.enemySpawns.push(
    { id: 'l7_crawler_1', type: 'crawler', position: new THREE.Vector3(-4, 0, -14), patrolTarget: new THREE.Vector3(6, 0, -24), initiallyActive: true },
    { id: 'l7_scrapper_1', type: 'scrapper', position: new THREE.Vector3(8, 0, -48), patrolTarget: new THREE.Vector3(-6, 0, -48), initiallyActive: true },
    { id: 'l7_boss_drowned', type: 'drowned_machine', position: new THREE.Vector3(0, 0, -76), patrolTarget: new THREE.Vector3(0, 0, -58), initiallyActive: true, isBoss: true }
  );

  return finalizeLevelWorld(ctx, new THREE.Vector3(0, 0, 19), 0, new THREE.Vector3(0, 0, -72));
}

// ============================================================================
// LEVEL 08 — GROUND ZERO (Massive Meteor Crater, Alien Spires + THE GUARDIAN Boss)
// ============================================================================
export function buildLevel8World(
  scene: THREE.Scene,
  textures: ProceduralTextureSet
): BuiltWorld {
  const ctx = createLevelContext(scene, textures, 0x0a0204, 0x160308, 0.021);

  const floorMat = makeTiledMat(ctx, {
    map: textures.infectedFleshMap,
    normalMap: textures.infectedFleshNormal,
    roughnessMap: textures.infectedFleshRoughness,
    emissiveMap: textures.infectedEmissiveMap,
    repeatX: 16,
    repeatY: 30,
    color: 0x621b26,
    emissive: 0x991b1b,
    emissiveIntensity: 0.72,
    roughness: 0.48,
    metalness: 0.3,
    normalScale: 1.65,
  });
  const rootWall = makeTiledMat(ctx, {
    map: textures.infectedFleshMap,
    normalMap: textures.infectedFleshNormal,
    emissiveMap: textures.infectedEmissiveMap,
    repeatX: 9,
    repeatY: 3,
    color: 0x521821,
    emissive: 0x7f1d1d,
    emissiveIntensity: 0.55,
    roughness: 0.42,
    metalness: 0.42,
    normalScale: 1.5,
  });
  const metallicVein = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0xe11d48,
    emissiveIntensity: 1.65,
    roughness: 0.2,
    metalness: 0.35,
  });
  const chitinRibMat = makeTiledMat(ctx, {
    map: textures.boneMap,
    normalMap: textures.boneNormal,
    repeatX: 2,
    repeatY: 4,
    color: 0x452b2e,
    roughness: 0.45,
    metalness: 0.5,
  });
  ctx.disposeables.push(metallicVein);
  ctx.animatedProps.push({
    kind: 'pulseEmissive',
    material: metallicVein,
    speed: 2.2,
    amplitude: 0.65,
  });

  addStandardFloor(ctx, 72, 130, 0, -36, floorMat, 11.0, rootWall);
  addPerimeterWalls(ctx, -34, 34, -98, 24, 11.0, rootWall);
  // Biomechanical calcified rib arches spanning overhead
  addStructuralArchRibs(ctx, -33.2, 33.2, [12, -8, -42, -58, -74, -88], 11.0, chitinRibMat, metallicVein);

  // 1. MASSIVE GROUND ZERO METEOR CRATER & ALIEN IMPACT CORE
  addMeteorCrater(ctx, 0, -56, 26, 'ground_zero_crater');

  addWallXWithDoor(ctx, -26, -34, 34, 11.0, 1.4, 0, 7.0, 5.2, rootWall);
  addDynamicDoor(ctx, 'door_l8_heart', 0, -26, 7.0, 5.2, 0.7, 0x3b0712, 0xef4444);

  // Towering Metallic Root Pillars with pulsing arterial veins & bioluminescent spore clusters
  [
    [-16, -6],
    [16, -6],
    [-18, -62],
    [18, -50],
    [-16, -78],
    [16, -78],
  ].forEach(([rx, rz], idx) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 2.35, 11, 12), rootWall);
    trunk.position.set(rx, 5.5, rz);
    trunk.castShadow = true;
    const ribCage = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 2.0, 3.2, 8, 1, true), chitinRibMat);
    ribCage.position.set(rx, 4.5, rz);
    const vein = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.22, 8, 18), metallicVein);
    vein.rotation.x = Math.PI / 2;
    vein.position.set(rx, 3.2, rz);
    const veinTop = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.16, 8, 18), metallicVein);
    veinTop.rotation.x = Math.PI / 2;
    veinTop.position.set(rx, 7.4, rz);
    scene.add(trunk, ribCage, vein, veinTop);
    ctx.animatedProps.push({
      kind: 'hoverSpin',
      object: vein,
      speed: idx % 2 === 0 ? 0.65 : -0.65,
      baseY: 3.2,
      amplitude: 0.25,
      phase: idx,
    });
    ctx.colliders.push({
      minX: rx - 1.85,
      maxX: rx + 1.85,
      minY: 0,
      maxY: 11,
      minZ: rz - 1.85,
      maxZ: rz + 1.85,
    });
  });

  addFloorDecal(ctx, 0, -64, 9, 9, textures.bloodDecalMap, 0.85, 0.4);
  addFloorDecal(ctx, -6, -12, 5, 5, textures.bloodDecalMap, 0.75, -0.5);

  // Secret Root Cocoon Vault (x: -34..-18, z: -56..-40)
  addSolidBox(ctx, -26, 4.0, -40, 16.5, 8.0, 0.9, rootWall);
  addSolidBox(ctx, -26, 4.0, -56, 16.5, 8.0, 0.9, rootWall);
  addWallZWithDoor(ctx, -18, -56, -40, 8.0, 0.9, -48, 4.2, 2.6, rootWall);
  addSolidBox(ctx, -26, 8.15, -48, 16.5, 0.4, 16.6, rootWall);
  addDestructibleBarricade(ctx, 'l8_secret_membrane', -18, -48, 0.8, 2.6, 4.3, 0x991b1b);
  addPickup(ctx, 'sec_08_stash', 'secret_cache', 'HARVEST NEST CORE STASH (+2 SALVAGE)', -26, 0.5, -48, 0xf59e0b, {
    secretId: 'sec_08_nest',
    secretTitle: 'LIVING ROOT SANCTUM',
  });

  addConsoleInteractable(
    ctx,
    'l8_bio_puzzle',
    'puzzle',
    'CALIBRATE NEURAL ROOT RESONANCE DAMPER',
    0,
    -23.2,
    0xf59e0b,
    { puzzleId: 'puz_08_bio', doorId: 'door_l8_heart' }
  );

  addSaveAndWorkbench(ctx, 'l8', 18, 10, 18, -18);
  addLevelExitGate(ctx, 'l8_exit', 'ASCEND TO ORBITAL LAUNCH FACILITY (LEVEL 09)', 0, -94, 2);

  addPickup(ctx, 'l8_lore_1', 'lore', 'READ XENO-BOTANICAL REPORT', -6, 0.5, 10, 0x60a5fa, {
    loreId: 'doc_nest_ecology',
  });
  addPickup(ctx, 'l8_lore_2', 'lore', 'READ HYMN OF THE ROOT', 8, 0.5, -14, 0x60a5fa, {
    loreId: 'doc_choir_gospel',
  });
  addPickup(ctx, 'l8_lore_3', 'lore', 'PLAY HEART CHAMBER RECORDING', 0, 0.5, -86, 0xf87171, {
    loreId: 'audio_nest_guardian',
  });
  addPickup(ctx, 'l8_med_1', 'medkit', 'COLLECT MEDKIT (+35 HP)', -22, 0.35, -62, 0x22c55e);
  addPickup(ctx, 'l8_ammo_1', 'ammo', 'COLLECT HEAVY AMMO CRATE', 22, 0.35, -62, 0xf59e0b);
  addPickup(ctx, 'l8_bat_1', 'battery', 'COLLECT FLASHLIGHT CELL', 0, 0.35, -36, 0x38bdf8);

  addRoomLighting(ctx, [
    [0, 8.5, 10, 0xef4444, true],
    [0, 8.5, -16, 0xb91c1c, false],
    [0, 9.0, -56, 0xef4444, true],
    [0, 9.0, -82, 0x22c55e, false],
  ]);

  ctx.enemySpawns.push(
    { id: 'l8_stalker_1', type: 'stalker', position: new THREE.Vector3(-8, 0, -6), patrolTarget: new THREE.Vector3(8, 0, -14), initiallyActive: true },
    { id: 'l8_broodmind_1', type: 'broodmind', position: new THREE.Vector3(6, 0, -16), patrolTarget: new THREE.Vector3(-4, 0, -18), initiallyActive: true },
    { id: 'l8_boss_guardian', type: 'guardian', position: new THREE.Vector3(0, 0, -72), patrolTarget: new THREE.Vector3(0, 0, -50), initiallyActive: true, isBoss: true }
  );

  return finalizeLevelWorld(ctx, new THREE.Vector3(0, 0, 19), 0, new THREE.Vector3(0, 0, -66));
}
