import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorrorAudioEngine } from './audio';
import {
  createTentaclePhysicsState,
  createTitanforgedNeckState,
  TentaclePhysicsState,
  TitanforgedNeckState,
  triggerNeckDamageReaction,
  updateMonsterTentacles,
  updateTitanforgedNeckAnimation,
} from './animation';
import {
  CHARACTERS,
  LORE_ENTRIES,
  MISSIONS,
  PORTAL_UPGRADE_MAP,
  PUZZLES,
  WEAPONS,
  getUpgradedWeaponStats,
  loadCampaignState,
  saveCampaignState,
} from './data';
import { VolumetricFireSystem } from './fireSystem';
import {
  createGeneratorChallenge,
  GeneratorChallengeState,
} from './generatorMath';
import {
  buildEnemyModel,
  buildFirstPersonRig,
  buildSupportDrone,
  EnemyModelRefs,
  FirstPersonRigRefs,
} from './models';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import {
  CampaignState,
  ChapterStats,
  CharacterId,
  CheckpointSave,
  EnemyAIState,
  EnemyType,
  EndingId,
  GameSettings,
  HudSnapshot,
  InventoryItem,
  MinimapBlip,
  MissionDef,
  PortalUpgradeId,
  WeaponId,
  WeaponRuntimeState,
} from './types';
import {
  addApertureWorldObjects,
  addEducationalWorldObjects,
  buildMissionOneWorld,
  buildTitanforgedArenaWorld,
  BuiltWorld,
  InteractableObject,
} from './worldBuilder';
import { buildLevel2World, buildLevel3World, buildLevel4World } from './levels/levelsAct1';
import {
  buildLevel5World,
  buildLevel6World,
  buildLevel7World,
  buildLevel8World,
} from './levels/levelsAct2';
import {
  buildLevel9World,
  buildLevel10World,
  buildLevel11World,
  buildLevel12World,
} from './levels/levelsAct3';
import {
  createMonsterAIRuntime,
  determineDesiredAIState,
  evaluateMonsterVision,
  computeSteeredDirection,
  MONSTER_PROFILES,
  MonsterAIRuntime,
  selectNextAttackKind,
  SoundEventBus,
} from './monsterAI';
import {
  createMonsterAnimState,
  MonsterAnimationState,
  triggerMonsterAttack,
  triggerMonsterStagger,
  updateMonsterAnimations,
} from './monsterAnimations';
import {
  countSoundOcclusions,
  NavGrid,
} from './navigation';
import { SurfaceKind } from './types';

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _portalZAxis = new THREE.Vector3(0, 0, 1);
const _portalQuat = new THREE.Quaternion();
const _portalExitPos = new THREE.Vector3();
const _portalAltAxis = new THREE.Vector3(0, 1, 0);

const PortalVortexVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PortalVortexFragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uRimColor;
  uniform float uLinked;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float angle = atan(p.y, p.x);

    float swirl = sin(angle * 5.0 + r * 11.0 - uTime * (4.2 + 2.2 * uLinked)) * 0.5 + 0.5;
    float ripple = sin(r * 18.0 - uTime * 6.5) * 0.5 + 0.5;
    float edgeMask = smoothstep(0.64, 0.99, r);
    float innerFade = 1.0 - smoothstep(0.0, 0.82, r);

    vec3 coreCol = mix(vec3(0.02, 0.04, 0.09), uColor * 1.25, innerFade * (0.32 + 0.62 * uLinked) + swirl * 0.34 * uLinked);
    coreCol += uColor * ripple * 0.28 * (0.35 + 0.72 * uLinked);
    coreCol = mix(coreCol, uRimColor * (1.55 + 0.45 * uLinked), pow(edgeMask, 1.2));

    float alpha = mix(0.86, 0.99, edgeMask) * (0.8 + 0.2 * uLinked);
    gl_FragColor = vec4(coreCol, alpha);
  }
`;

interface ActivePortal {
  color: 'blue' | 'orange';
  center: THREE.Vector3;
  normal: THREE.Vector3;
  group: THREE.Group;
  vortexMat: THREE.ShaderMaterial;
  rimMat: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  openAnim: number;
}

const CinematicHorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered, centered);
      vec2 caOffset = centered * (r2 * 0.0042);
      float r = texture2D(tDiffuse, vUv + caOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - caOffset).b;
      vec3 col = vec3(r, g, b);
      float vig = smoothstep(0.92, 0.24, r2);
      col *= mix(0.66, 1.0, vig);
      float grain = (hash12(vUv * 512.0 + fract(uTime * 17.3)) - 0.5) * 0.022;
      col += grain;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

interface EnemyEntity {
  id: string;
  type: EnemyType;
  refs: EnemyModelRefs;
  state: EnemyAIState;
  position: THREE.Vector3;
  patrolTarget: THREE.Vector3;
  homePosition: THREE.Vector3;
  yaw: number;
  health: number;
  maxHealth: number;
  speed: number;
  detectRange: number;
  attackRange: number;
  damage: number;
  attackCooldown: number;
  stunTimer: number;
  searchTimer: number;
  lastKnownPlayerPos: THREE.Vector3;
  active: boolean;
  ambushTag?: string;
  isBoss: boolean;
  bossPhase: number;
  armArmorBroken: boolean;
  hollowExposed: boolean;
  dwellerEmerged: boolean;
  rangedCooldown: number;
  hitFlashTimer: number;
  stompCooldown: number;
  legDamaged: boolean;
  shriekCooldown: number;
  broodReleased: boolean;
  flankSign: number;
  huskCollapsed: boolean;
  prevYaw: number;
  burnDamageCooldown: number;
  hurtTwitchTimer: number;
  vocalTimer: number;
  regenCooldown: number;
  leapVel: THREE.Vector3;
  leapAirTimer: number;
  neckState?: TitanforgedNeckState;
  tentacleState: TentaclePhysicsState;
  ai: MonsterAIRuntime;
  anim: MonsterAnimationState;
}

interface ShockwaveEffect {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  center: THREE.Vector3;
  age: number;
  maxAge: number;
  maxRadius: number;
  kind: 'stomp' | 'crusher' | 'gravity';
  damage: number;
  hitChecked: boolean;
}

interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  life: number;
  fromPlayer: boolean;
}

interface ImpactParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

interface TracerBeam {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onLoreCollected: (loreId: string) => void;
  onCampaignSync?: (campaign: CampaignState) => void;
  onPauseRequested: () => void;
  onPlayerDied: () => void;
  onOpenEducation?: (entryId: string) => void;
  onMissionComplete: (
    finaleTitle: string,
    summary: string,
    stats?: ChapterStats,
    endingChoice?: EndingId
  ) => void;
}

export const SAVE_STORAGE_KEY = 'twhr_checkpoint_v1';

const BOSS_TYPES: Set<EnemyType> = new Set([
  'titanforged',
  'hollow_dweller',
  'forgemaster',
  'drowned_machine',
  'guardian',
  'helios_unit',
  'titan',
  'origin',
]);

const BOSS_DISPLAY_NAMES: Partial<Record<EnemyType, { name: string; subtitle: string }>> = {
  forgemaster: { name: 'THE FORGEMASTER', subtitle: 'SMELTER CRUCIBLE OVERLORD' },
  sentinel: { name: 'THE SENTINEL', subtitle: 'AEGIS-IX CORRUPTED COMBAT MECH' },
  drowned_machine: { name: 'THE DROWNED MACHINE', subtitle: 'SUBMERGED HYDRO-ELECTRIC CONSTRUCT' },
  guardian: { name: 'THE GUARDIAN', subtitle: 'APEX BIO-MECHANICAL ROOT WARDEN' },
  titan: { name: 'THE TITAN', subtitle: 'HEAVY ORBITAL CONSTRUCTION WALKER' },
  helios_unit: { name: 'HELIOS DEFENCE UNIT', subtitle: 'CORRUPTED MAINFRAME WARDEN' },
  origin: { name: 'THE ORIGIN', subtitle: 'FIRST SUBTERRANEAN CORE' },
  titanforged: { name: 'THE TITANFORGED', subtitle: 'BIOMECHANICAL SIEGE CONSTRUCT' },
  hollow_dweller: { name: 'THE HOLLOW DWELLER', subtitle: 'DETACHED PARASITIC CORE' },
};

export class FirstPersonGameEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private audio: HorrorAudioEngine;
  private settings: GameSettings;
  private campaign: CampaignState;
  private missionDef: MissionDef;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private horrorPass: ShaderPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTextureSet;
  private isSoftwareGl: boolean;
  private contextLost = false;
  private frameId = 0;
  private disposed = false;

  private world!: BuiltWorld;
  private missionId: string;
  private characterId: CharacterId;

  // Player Physics & Camera
  private playerPos = new THREE.Vector3(0, 0.25, 39.2);
  private playerVel = new THREE.Vector3();
  private playerYaw = 0;
  private playerPitch = 0;
  private currentEyeHeight = 1.68;
  private grounded = true;
  private stepDist = 0;
  private landDip = 0;
  private hurtRoll = 0;
  private inZeroG = false;
  private inWater = false;

  // Player Survival & Stats
  private health = 100;
  private maxHealth = 100;
  private armor = 75;
  private maxArmor = 75;
  private stamina = 100;
  private medkits = 1;
  private salvageEarnedInLevel = 0;
  private keycards: string[] = [];
  private collectedLoreIds: string[] = [];
  private levelDocsFound = 0;
  private levelSecretsFound = 0;
  private inventory: InventoryItem[] = [];
  private enemiesDefeated = 0;
  private elapsedSeconds = 0;

  // Flashlight
  private flashlight!: THREE.SpotLight;
  private flashlightTarget!: THREE.Object3D;
  private flashlightOn = true;
  private flashlightBattery = 100;

  // First-person Weapon Rig & Aperture Portal System
  private fpRigs: [FirstPersonRigRefs, FirstPersonRigRefs, FirstPersonRigRefs | null] | null = null;
  private weaponStates: [WeaponRuntimeState, WeaponRuntimeState];
  private activeSlot: 0 | 1 | 2 = 0;
  private fireTimer = 0;
  private isReloading = false;
  private reloadTimer = 0;
  private reloadDuration = 1.6;
  private recoilOffset = 0;
  private muzzleFlashTimer = 0;
  private switchAnimTimer = 0;
  private meleeAnimTimer = 0;
  private healAnimTimer = 0;
  private abilityAnimTimer = 0;
  private deathAnimTimer = 0;

  private portals: { blue: ActivePortal | null; orange: ActivePortal | null } = {
    blue: null,
    orange: null,
  };
  private portalCooldown = 0;
  private portalClawAnim = 0;
  private portalLastFired: 'blue' | 'orange' | null = null;
  private portalToast: { title: string; subtitle: string; timer: number } | null = null;
  private tachyonBoostTimer = 0;
  private tachyonArmorCooldown = 0;
  private enemyPortalCooldowns = new Map<string, number>();
  private prevFallVelY = 0;

  // Special Ability
  private abilityActive = false;
  private abilityActiveRemaining = 0;
  private abilityCooldownRemaining = 0;
  private droneMesh: THREE.Group | null = null;
  private droneZapTimer = 0;
  private pulseRingMesh: THREE.Mesh | null = null;
  private pulseRingLife = 0;

  // Input State
  private keys: Record<string, boolean> = {};
  private mouseDownLeft = false;
  private mouseDownRight = false;
  private pointerLocked = false;
  private dragLookActive = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private ambientCreakTimer = 9.0;
  private paused = false;
  private isDead = false;
  private missionEnded = false;
  private touchMoveVec = { x: 0, y: 0 };

  // Mission Progression & Modals
  private missionStage = 0;
  private solvedPuzzles = new Set<string>();
  private activatedInteractables = new Set<string>();
  private drivesCollected = 0;
  private pumpsDrained = 0;
  private activePuzzleId: string | null = null;
  private activePuzzleTarget: InteractableObject | null = null;
  private generatorChallenges = new Map<string, GeneratorChallengeState>();
  private usedGeneratorSignatures = new Set<string>();
  private workbenchOpen = false;
  private endingChoiceOpen = false;

  private powerRestored = false;
  private gateUnlocked = false;
  private gateOpenAnim = 0;
  private apcOpenAnim = 0;
  private terminalAccessed = false;
  private finaleTimer = -1;
  private objectiveTitle = '';
  private objectiveDetail = '';
  private subObjectiveProgress: string | null = null;
  private objectiveTarget: { x: number; z: number } | null = null;
  private radioBanner: { speaker: string; text: string } | null = null;
  private radioBannerTimer = 0;
  private missionBanner: { title: string; objective: string; timer: number } | null = null;
  private chapterIntro: {
    number: number;
    title: string;
    region: string;
    subtitle: string;
    timer: number;
  } | null = null;
  private secretToast: { title: string; salvage: number; timer: number } | null = null;
  private introWakeupTimer = 0;
  private introDoorSpeed = 2.4;
  private hitMarkerTimer = 0;
  private hitMarkerCrit = false;
  private damageFlash = 0;
  private shakeIntensity = 0;
  private checkpointSavedTimer = 0;
  private knockbackVel = new THREE.Vector3();
  private bossWarningText: string | null = null;
  private bossWarningTimer = 0;
  private currentShadowSize = 512;

  // Entities
  private enemies: EnemyEntity[] = [];
  private projectiles: Projectile[] = [];
  private particles: ImpactParticle[] = [];
  private tracers: TracerBeam[] = [];
  private shockwaves: ShockwaveEffect[] = [];
  private sharedParticleGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  private sharedProjectileGeo = new THREE.SphereGeometry(0.18, 8, 8);
  private fireSystem!: VolumetricFireSystem;
  private colossusNeckState = createTitanforgedNeckState();
  private distantNeckState = createTitanforgedNeckState();
  private colossusTentacles: TentaclePhysicsState | null = null;
  private distantTentacles: TentaclePhysicsState | null = null;
  private fireHazardCooldown = 0;
  private waterShockCooldown = 0;
  private navGrid: NavGrid | null = null;
  private soundBus = new SoundEventBus();
  private horrorAmbientTimer = 7.5;
  private lastHudPush = 0;
  private lastTime = performance.now();
  private forgeHitsCount = 0;

  // Educational Reader, Co-op Freeze & Objective Beacons
  private isCoopSession = false;
  private educationOpenId: string | null = null;
  private educationFrozen = false;
  private beaconPool: {
    group: THREE.Group;
    beam: THREE.Mesh;
    ring: THREE.Mesh;
    marker: THREE.Mesh;
    beamMat: THREE.MeshBasicMaterial;
    ringMat: THREE.MeshBasicMaterial;
    markerMat: THREE.MeshBasicMaterial;
  }[] = [];
  private beaconGeoBeam: THREE.CylinderGeometry | null = null;
  private beaconGeoRing: THREE.RingGeometry | null = null;
  private beaconGeoMarker: THREE.OctahedronGeometry | null = null;

  constructor(
    container: HTMLElement,
    characterId: CharacterId,
    missionId: string,
    settings: GameSettings,
    audio: HorrorAudioEngine,
    callbacks: EngineCallbacks,
    restoreSave?: CheckpointSave | null,
    introMode: 'none' | 'cutscene_end' | 'cutscene_skip' = 'none',
    campaignState?: CampaignState
  ) {
    this.container = container;
    this.characterId = characterId;
    this.missionId = missionId;
    this.settings = { ...settings };
    this.audio = audio;
    this.callbacks = callbacks;
    this.campaign = campaignState ? { ...campaignState } : loadCampaignState();
    this.missionDef = MISSIONS.find((m) => m.id === missionId) ?? MISSIONS[0];

    const charDef = CHARACTERS[characterId];
    this.maxHealth = charDef.stats.health;
    this.health = charDef.stats.health;
    this.maxArmor = charDef.stats.armor;
    this.armor = charDef.stats.armor;
    this.medkits = Math.max(1, this.campaign.medkits);
    this.collectedLoreIds = [...this.campaign.collectedLoreIds];

    const primId = charDef.primaryWeapon;
    const secId: WeaponId = this.campaign.equippedSecondary || 'pistol';
    const primDef = getUpgradedWeaponStats(primId, this.campaign.weaponUpgrades[primId]);
    const secDef = getUpgradedWeaponStats(secId, this.campaign.weaponUpgrades[secId]);

    const savedPrim = this.campaign.weaponAmmo[primId];
    const savedSec = this.campaign.weaponAmmo[secId];
    this.weaponStates = [
      {
        id: primId,
        ammoInMag: savedPrim ? Math.min(primDef.magSize, Math.max(1, savedPrim.mag)) : primDef.magSize,
        reserveAmmo: savedPrim
          ? Math.min(primDef.reserveMax, Math.max(primDef.magSize, savedPrim.reserve))
          : Math.floor(primDef.reserveMax * 0.8),
      },
      {
        id: secId,
        ammoInMag: savedSec ? Math.min(secDef.magSize, Math.max(1, savedSec.mag)) : secDef.magSize,
        reserveAmmo: savedSec
          ? Math.min(secDef.reserveMax, Math.max(secDef.magSize, savedSec.reserve))
          : Math.floor(secDef.reserveMax * 0.75),
      },
    ];

    this.syncInventoryList();

    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const aspect = w / h;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, aspect, 0.08, 240);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.38, 0.5, 0.8);
      this.composer.addPass(this.bloomPass);
      this.horrorPass = new ShaderPass(CinematicHorrorShader);
      this.composer.addPass(this.horrorPass);
      this.composer.addPass(new OutputPass());
    }

    this.textures = createProceduralTextures(this.renderer);

    // Setup Flashlight attached to camera rig
    this.flashlight = new THREE.SpotLight(0xfff4e0, 5.5, 44, Math.PI / 5.2, 0.45, 1.5);
    this.flashlight.position.set(0.18, -0.1, -0.1);
    this.flashlight.castShadow = !this.isSoftwareGl;
    this.flashlight.shadow.mapSize.set(512, 512);
    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, -0.05, -10);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // Build first-person weapon rigs attached to camera
    const primRig = buildFirstPersonRig(characterId, primId, this.textures);
    const secRig = buildFirstPersonRig(characterId, secId, this.textures);
    secRig.root.visible = false;
    const portalRig = this.campaign.portalGunUnlocked
      ? buildFirstPersonRig(characterId, 'portal_gun', this.textures)
      : null;
    if (portalRig) {
      portalRig.root.visible = false;
      this.camera.add(portalRig.root);
    }
    this.camera.add(primRig.root);
    this.camera.add(secRig.root);
    this.fpRigs = [primRig, secRig, portalRig];

    // Build Mission World for all 12 campaign chapters + bonus Crucible arena
    this.buildSelectedWorld(introMode, restoreSave);
    this.navGrid = new NavGrid(this.world.colliders, this.world.destructibleBarricades);

    // Initialize Volumetric Fire, Smoke, Wind & Rain System
    const enableRain =
      missionId === 'mission_01' ||
      missionId === 'mission_04' ||
      missionId === 'mission_09' ||
      missionId === 'mission_crucible';
    this.fireSystem = new VolumetricFireSystem(
      this.scene,
      this.textures,
      this.world.fireEmitters,
      this.world.sparkEmitters,
      enableRain
    );
    if (this.world.horizonColossusRefs) {
      this.colossusTentacles = createTentaclePhysicsState(this.world.horizonColossusRefs);
    }
    if (this.world.distantTitan) {
      this.distantTentacles = createTentaclePhysicsState(this.world.distantTitan);
    }

    // Spawn Enemies
    this.spawnEnemies();

    // Apply initial Graphics Quality preset
    this.applyGraphicsQuality();

    // Restore Checkpoint if requested
    if (restoreSave && restoreSave.missionId === missionId) {
      this.applyCheckpoint(restoreSave);
      this.navGrid?.rebuild(this.world.colliders, this.world.destructibleBarricades);
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.camera.position.set(
      this.playerPos.x,
      this.playerPos.y + this.currentEyeHeight,
      this.playerPos.z
    );
    this.camera.rotation.set(this.playerPitch, this.playerYaw, 0, 'YXZ');
    this.camera.updateMatrixWorld(true);
    this.pushHud(true);
    this.lastTime = performance.now();
    this.loop();
  }

  private buildSelectedWorld(
    introMode: 'none' | 'cutscene_end' | 'cutscene_skip',
    restoreSave?: CheckpointSave | null
  ): void {
    switch (this.missionId) {
      case 'mission_crucible': {
        this.world = buildTitanforgedArenaWorld(this.scene, this.textures);
        this.playerPos.set(0, 0.05, 24);
        this.playerYaw = 0;
        this.missionStage = 10;
        this.objectiveTitle = 'ELIMINATE THE TITANFORGED';
        this.objectiveDetail =
          'Target the segmented Blood Worm Head and shatter chest armor to expose The Hollow.';
        this.objectiveTarget = { x: 0, z: -20 };
        this.showRadio('TACTICAL UPLINK', 'Seismic anomaly confirmed. Heavy biomechanical siege platform ahead.');
        this.audio.setBossMusic(true);
        break;
      }
      case 'mission_02': {
        this.world = buildLevel2World(this.scene, this.textures);
        this.setupLevelStart(
          'RESTORE ESTATE POWER & ACCESS',
          'Restore Breaker B-2 (-20, -6), retrieve the Estate Master Key (20, -8), calibrate the substation relay (-20, -24), and unlock the villa gate.',
          { x: -20, z: -6 },
          'Spore concentration rising through the overgrown gardens. Watch the villa balconies for THE CRAWLER.'
        );
        break;
      }
      case 'mission_03': {
        this.world = buildLevel3World(this.scene, this.textures);
        this.setupLevelStart(
          'RECOVER THREE RESEARCH DRIVES',
          'Locate all 3 encrypted research drives inside The Dead Mall concourse before unlocking the central security vault.',
          { x: -20, z: -12 },
          'Stay silent when THE WATCHER sweeps the retail concourse. Drives remaining: 3.'
        );
        this.subObjectiveProgress = 'DRIVES: 0 / 3';
        break;
      }
      case 'mission_04': {
        this.world = buildLevel4World(this.scene, this.textures);
        this.setupLevelStart(
          'SECURE TRANSPORT & COMMS TOWER',
          'Secure the military transport (-20, -68) and calibrate the emergency comms tower (18, -74) across the construction zone.',
          { x: -20, z: -68 },
          'Tower crane and scaffolding active. Avoid THE HUNTER along the lower deck.'
        );
        this.subObjectiveProgress = 'OBJECTIVES: 0 / 2';
        break;
      }
      case 'mission_05': {
        this.world = buildLevel5World(this.scene, this.textures);
        this.setupLevelStart(
          'BALANCE SUBTERRANEAN CRUCIBLE',
          'Solve the metro pressure lock (0, -25) to enter the Smelter Arena and defeat THE FORGEMASTER. Use Purge Valves (-20/+20, -64) to melt its armor!',
          { x: 0, z: -25 },
          'Underground metro and foundry lines have gone feral. Thermal surge detected beyond the platform.'
        );
        break;
      }
      case 'mission_06': {
        this.world = buildLevel6World(this.scene, this.textures);
        this.setupLevelStart(
          'BYPASS FORGOTTEN LABORATORY SECURITY',
          'Solve the research security override (14, -26) to breach the hangar and neutralize THE SENTINEL combat mech.',
          { x: 14, z: -26 },
          'Classified research telemetry ahead. Cryo containment breach confirmed.'
        );
        break;
      }
      case 'mission_07': {
        this.world = buildLevel7World(this.scene, this.textures);
        this.setupLevelStart(
          'POWER & DRAIN THE IRON GRAVEYARD',
          'Solve the sump flow equation (-12, 8), then activate all 3 Drain Pumps to drain the tank graveyard and weaken THE DROWNED MACHINE.',
          { x: -12, z: 8 },
          'Coolant water carries lethal charge until sump pumps clear the flooded proving grounds.'
        );
        this.subObjectiveProgress = 'BAYS DRAINED: 0 / 3';
        break;
      }
      case 'mission_08': {
        this.world = buildLevel8World(this.scene, this.textures);
        this.setupLevelStart(
          'NEUTRALIZE METEOR CRATER RESONANCE',
          'Solve the neural damper (0, -23) to enter Ground Zero crater and slay THE GUARDIAN.',
          { x: 0, z: -23 },
          'Massive impact crater detected. Metallic root networks pulse with 4.18 Hz signals.'
        );
        break;
      }
      case 'mission_09': {
        this.world = buildLevel9World(this.scene, this.textures);
        this.setupLevelStart(
          'ELIMINATE THE TITANFORGED',
          'Solve the orbital ignition bus (12, -25) to reach the Ares-IX launch apron and destroy THE TITAN.',
          { x: 12, z: -25 },
          'Ares-IX booster remains on the pad. Heavy biomechanical siege platform active on apron.'
        );
        break;
      }
      case 'mission_10': {
        this.world = buildLevel10World(this.scene, this.textures);
        this.setupLevelStart(
          'SEVER THE FINAL SIGNAL',
          'Sever the 18-meter dish azimuth lock (0, -25) and destroy the HELIOS DEFENCE UNIT inside the satellite bunker.',
          { x: 0, z: -25 },
          'HELIOS main array dish carrier lock is at 99%. Storm conditions critical—shut down its internal guardian.'
        );
        break;
      }
      case 'mission_11': {
        this.world = buildLevel11World(this.scene, this.textures);
        this.setupLevelStart(
          'RESTART AETHER STATION REACTOR',
          'Restart the orbital reactor (0, -25), navigate the zero-gravity ring, and retrieve the deep-space interferometry tape.',
          { x: 0, z: -25 },
          'Hull breach in Ring B. Gravity stabilizers offline—watch for THE VOID WALKER.'
        );
        break;
      }
      case 'mission_12': {
        this.world = buildLevel12World(this.scene, this.textures);
        this.setupLevelStart(
          'UNLOCK CHAMBER ZERO SANCTUM',
          'Align the Spire Key (0, -19), defeat THE ORIGIN, and access the Master HELIOS Control Spire.',
          { x: 0, z: -19 },
          'Four kilometers beneath Earth. The signal ends—or begins—right here.'
        );
        break;
      }
      case 'mission_01':
      default: {
        this.world = buildMissionOneWorld(this.scene, this.textures);
        this.playerPos.set(0, 0.25, 38.0);
        this.playerYaw = 0;
        this.objectiveTitle = 'ESCAPE THE TRANSPORT';
        this.objectiveDetail = 'Open the APC emergency breach hatch (E) and step into New Eden.';
        this.objectiveTarget = { x: 0, z: 34 };

        if ((introMode === 'cutscene_end' || introMode === 'cutscene_skip') && !restoreSave) {
          const hatch = this.world.interactables.find((i) => i.id === 'apc_hatch');
          if (hatch) hatch.consumed = true;
          if (this.world.apcColliderIndex !== undefined) {
            this.world.colliders[this.world.apcColliderIndex].maxY = -10;
          }
          this.missionStage = 1;
          this.objectiveTitle = 'MISSION 01: THE QUARANTINE ZONE';
          this.objectiveDetail =
            'Restore generator power (-16, -22), take the Checkpoint Keycard (12.8, -14), and reach the HELIOS terminal.';
          this.objectiveTarget = { x: 0, z: -26 };
          this.missionBanner = {
            title: 'MISSION 01: THE QUARANTINE ZONE',
            objective: 'OBJECTIVE: Find an entrance to the underground research facility.',
            timer: introMode === 'cutscene_end' ? 8.5 : 6.5,
          };

          if (introMode === 'cutscene_end') {
            this.currentEyeHeight = 0.92;
            this.playerPitch = -0.04;
            this.introWakeupTimer = 1.4;
            this.apcOpenAnim = 0.01;
            this.introDoorSpeed = 0.28;
            this.audio.playDoorHydraulicOpen();
          } else {
            this.apcOpenAnim = 0.25;
            this.introDoorSpeed = 1.6;
          }
        } else {
          this.showRadio('EMERGENCY CHANNEL // BROKEN', 'All remaining units... New Eden has fallen... stay away from infected machinery.');
          this.audio.playRadioStatic();
        }
        break;
      }
    }

    addEducationalWorldObjects(this.missionId, this.scene, this.world);
    addApertureWorldObjects(
      this.missionId,
      this.scene,
      this.world,
      this.textures,
      this.campaign.portalGunUnlocked,
      this.campaign.portalUpgrades,
      this.playerPos
    );
    this.initObjectiveBeacons();

    if (this.missionId !== 'mission_01') {
      this.chapterIntro = {
        number: this.missionDef.number,
        title: this.missionDef.title,
        region: this.missionDef.region,
        subtitle: `PRIMARY THREAT: ${this.missionDef.primaryMonster}`,
        timer: 4.5,
      };
    } else if (introMode === 'none') {
      this.chapterIntro = {
        number: 1,
        title: this.missionDef.title,
        region: this.missionDef.region,
        subtitle: 'PRIMARY THREAT: THE SCRAPPER',
        timer: 4.0,
      };
    }
  }

  private setupLevelStart(
    objTitle: string,
    objDetail: string,
    target: { x: number; z: number } | null,
    radioMsg: string
  ): void {
    if (this.world.spawnPosition) {
      this.playerPos.copy(this.world.spawnPosition);
    } else {
      this.playerPos.set(0, 0.05, 18);
    }
    this.playerYaw = this.world.spawnYaw ?? 0;
    this.missionStage = 0;
    this.objectiveTitle = objTitle;
    this.objectiveDetail = objDetail;
    this.objectiveTarget = target;
    this.showRadio(`UNIT 09 // CH.${String(this.missionDef.number).padStart(2, '0')}`, radioMsg);
    this.audio.playRadioStatic();
  }

  private applyCheckpoint(save: CheckpointSave): void {
    this.playerPos.set(save.playerPos.x, save.playerPos.y, save.playerPos.z);
    this.playerYaw = save.playerYaw;
    this.health = Math.max(25, save.health);
    this.armor = save.armor;
    this.medkits = Math.max(save.medkits, this.medkits);
    this.flashlightBattery = save.flashlightBattery;
    this.powerRestored = save.powerRestored;
    this.gateUnlocked = save.gateUnlocked;
    this.terminalAccessed = save.terminalAccessed;
    this.keycards = [...save.keycards];
    this.collectedLoreIds = Array.from(new Set([...this.collectedLoreIds, ...save.collectedLoreIds]));
    this.missionStage = save.missionStage;

    save.solvedPuzzleIds?.forEach((pid) => this.solvedPuzzles.add(pid));
    save.activatedInteractables?.forEach((iid) => {
      this.activatedInteractables.add(iid);
      const item = this.world.interactables.find((it) => it.id === iid);
      if (item) {
        item.consumed = true;
        if (item.doorId) this.openDynamicDoor(item.doorId);
        if (item.waterSectionId) {
          const ws = this.world.waterSections?.find((w) => w.state.id === item.waterSectionId);
          if (ws) {
            ws.state.targetY = ws.state.drainedY;
            ws.state.currentY = ws.state.drainedY;
            ws.mesh.position.y = ws.state.drainedY;
          }
          this.pumpsDrained += 1;
        }
      }
    });

    if (this.missionId === 'mission_01') {
      if (this.missionStage >= 1 && this.world.apcColliderIndex !== undefined) {
        this.world.colliders[this.world.apcColliderIndex].maxY = -10;
        if (this.world.apcDoorLeft) this.world.apcDoorLeft.rotation.y = 1.52;
        if (this.world.apcDoorRight) this.world.apcDoorRight.rotation.y = -1.52;
        this.apcOpenAnim = 1;
      }
      if (this.gateUnlocked && this.world.gateColliderIndex !== undefined) {
        this.world.colliders[this.world.gateColliderIndex].maxY = -10;
        this.gateOpenAnim = 1;
      }
    }
    this.syncInventoryList();
  }

  private saveCheckpoint(checkpointId: string): void {
    const save: CheckpointSave = {
      missionId: this.missionId,
      characterId: this.characterId,
      checkpointId,
      playerPos: { x: this.playerPos.x, y: this.playerPos.y, z: this.playerPos.z },
      playerYaw: this.playerYaw,
      health: this.health,
      armor: this.armor,
      medkits: this.medkits,
      flashlightBattery: this.flashlightBattery,
      powerRestored: this.powerRestored,
      gateUnlocked: this.gateUnlocked,
      terminalAccessed: this.terminalAccessed,
      keycards: [...this.keycards],
      collectedLoreIds: [...this.collectedLoreIds],
      solvedPuzzleIds: Array.from(this.solvedPuzzles),
      activatedInteractables: Array.from(this.activatedInteractables),
      missionStage: this.missionStage,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
      this.checkpointSavedTimer = 3.0;
    } catch {
      // ignore storage quota
    }
    this.syncCampaignToStorage();
  }

  private syncCampaignToStorage(): void {
    this.campaign.medkits = this.medkits;
    this.campaign.collectedLoreIds = Array.from(
      new Set([...this.campaign.collectedLoreIds, ...this.collectedLoreIds])
    );
    this.weaponStates.forEach((ws) => {
      this.campaign.weaponAmmo[ws.id] = { mag: ws.ammoInMag, reserve: ws.reserveAmmo };
    });
    saveCampaignState(this.campaign);
    this.callbacks.onCampaignSync?.({ ...this.campaign });
  }

  private spawnEnemies(): void {
    const diffMult =
      this.settings.difficulty === 'nightmare'
        ? 1.35
        : this.settings.difficulty === 'survivor'
          ? 0.78
          : 1.0;
    const threatScale = 0.85 + 0.15 * (this.missionDef.levelThreatMult ?? 1.0);

    const baseStats: Record<
      EnemyType,
      { hp: number; speed: number; detect: number; range: number; dmg: number }
    > = {
      crawler: { hp: 70, speed: 6.1, detect: 21, range: 2.0, dmg: 12 },
      stalker: { hp: 115, speed: 4.9, detect: 24, range: 2.4, dmg: 18 },
      brute_enemy: { hp: 230, speed: 3.1, detect: 18, range: 2.8, dmg: 25 },
      sentinel: { hp: 240, speed: 3.5, detect: 32, range: 22.0, dmg: 16 },
      screamer: { hp: 85, speed: 4.2, detect: 28, range: 13.0, dmg: 10 },
      carrier: { hp: 260, speed: 2.4, detect: 20, range: 2.9, dmg: 20 },
      titan: { hp: 920, speed: 2.8, detect: 38, range: 5.0, dmg: 32 },
      titanforged: { hp: 1400, speed: 3.3, detect: 60, range: 28.0, dmg: 22 },
      hollow_dweller: { hp: 480, speed: 6.4, detect: 65, range: 2.9, dmg: 24 },
      scrapper: { hp: 155, speed: 4.2, detect: 24, range: 2.6, dmg: 20 },
      watcher: { hp: 195, speed: 3.7, detect: 30, range: 2.9, dmg: 24 },
      hunter: { hp: 230, speed: 5.8, detect: 30, range: 2.7, dmg: 22 },
      forgemaster: { hp: 1150, speed: 2.7, detect: 42, range: 4.6, dmg: 28 },
      drowned_machine: { hp: 1050, speed: 3.0, detect: 42, range: 18.0, dmg: 22 },
      broodmind: { hp: 260, speed: 2.1, detect: 28, range: 14.0, dmg: 15 },
      guardian: { hp: 1280, speed: 3.1, detect: 44, range: 4.8, dmg: 29 },
      helios_unit: { hp: 1180, speed: 3.4, detect: 46, range: 24.0, dmg: 20 },
      void_walker: { hp: 215, speed: 4.8, detect: 32, range: 16.0, dmg: 19 },
      origin: { hp: 1650, speed: 3.2, detect: 52, range: 26.0, dmg: 25 },
    };

    this.world.enemySpawns.forEach((sp, idx) => {
      const refs = buildEnemyModel(sp.type, this.textures);
      refs.group.position.copy(sp.position);
      refs.group.visible = sp.initiallyActive;
      this.scene.add(refs.group);

      const st = baseStats[sp.type];
      const profile = MONSTER_PROFILES[sp.type];
      const isBoss = Boolean(sp.isBoss || BOSS_TYPES.has(sp.type));
      const mult = isBoss ? diffMult : diffMult * threatScale;
      const bossHpBoost = sp.type === 'sentinel' && isBoss ? 3.2 : 1.0;

      this.enemies.push({
        id: sp.id,
        type: sp.type,
        refs,
        state: 'PATROL',
        position: sp.position.clone(),
        patrolTarget: sp.patrolTarget.clone(),
        homePosition: sp.position.clone(),
        yaw: 0,
        health: Math.round(st.hp * mult * bossHpBoost),
        maxHealth: Math.round(st.hp * mult * bossHpBoost),
        speed: st.speed,
        detectRange: Math.max(st.detect, profile.visionRange),
        attackRange: st.range,
        damage: Math.round(st.dmg * diffMult * (isBoss ? 1.0 : 0.9 + 0.1 * threatScale)),
        attackCooldown: 0,
        stunTimer: 0,
        searchTimer: 0,
        lastKnownPlayerPos: sp.position.clone(),
        active: sp.initiallyActive,
        ambushTag: sp.ambushTag,
        isBoss,
        bossPhase: 1,
        armArmorBroken: false,
        hollowExposed: false,
        dwellerEmerged: false,
        rangedCooldown: 1.5,
        hitFlashTimer: 0,
        stompCooldown: 0.7,
        legDamaged: false,
        shriekCooldown: 1.0,
        broodReleased: false,
        flankSign: idx % 2 === 0 ? 1 : -1,
        huskCollapsed: false,
        prevYaw: 0,
        burnDamageCooldown: 0,
        hurtTwitchTimer: 0,
        vocalTimer: 0,
        regenCooldown: 7.0,
        leapVel: new THREE.Vector3(),
        leapAirTimer: 0,
        neckState:
          sp.type === 'titanforged' ||
          sp.type === 'titan' ||
          sp.type === 'forgemaster' ||
          sp.type === 'guardian' ||
          sp.type === 'origin'
            ? createTitanforgedNeckState()
            : undefined,
        tentacleState: createTentaclePhysicsState(refs),
        ai: createMonsterAIRuntime(sp.position, isBoss),
        anim: createMonsterAnimState(),
      });
    });
  }

  private spawnRuntimeEnemy(type: EnemyType, pos: THREE.Vector3, healthOverride?: number): EnemyEntity {
    const diffMult =
      this.settings.difficulty === 'nightmare' ? 1.35 : this.settings.difficulty === 'survivor' ? 0.78 : 1.0;
    const radius = this.getEnemyCollisionRadius(type);
    const groundY = this.groundHeightAt(pos.x, pos.z);
    const resolved = this.resolveHorizontalCollision(pos.x, pos.z, groundY, radius);
    const spawnPos = new THREE.Vector3(resolved.x, groundY, resolved.z);

    const refs = buildEnemyModel(type, this.textures);
    refs.group.position.copy(spawnPos);
    if (type === 'crawler') refs.group.scale.setScalar(0.82);
    this.scene.add(refs.group);

    const isDweller = type === 'hollow_dweller';
    const hp = healthOverride ?? Math.round((isDweller ? 480 : 52) * diffMult);
    const ent: EnemyEntity = {
      id: `${type}_dyn_${Math.random().toString(36).slice(2, 7)}`,
      type,
      refs,
      state: 'CHASE',
      position: spawnPos.clone(),
      patrolTarget: this.playerPos.clone(),
      homePosition: spawnPos.clone(),
      yaw: 0,
      health: hp,
      maxHealth: hp,
      speed: isDweller ? 7.2 : 6.8,
      detectRange: isDweller ? 65 : 28,
      attackRange: isDweller ? 3.2 : 2.0,
      damage: Math.round((isDweller ? 24 : 10) * diffMult),
      attackCooldown: 0.4,
      stunTimer: 0,
      searchTimer: 0,
      lastKnownPlayerPos: this.playerPos.clone(),
      active: true,
      isBoss: isDweller,
      bossPhase: isDweller ? 4 : 1,
      armArmorBroken: false,
      hollowExposed: true,
      dwellerEmerged: true,
      rangedCooldown: 1.5,
      hitFlashTimer: 0,
      stompCooldown: 0.8,
      legDamaged: false,
      shriekCooldown: 2,
      broodReleased: true,
      flankSign: Math.random() > 0.5 ? 1 : -1,
      huskCollapsed: false,
      prevYaw: 0,
      burnDamageCooldown: 0,
      hurtTwitchTimer: 0,
      vocalTimer: 0,
      regenCooldown: 9.0,
      leapVel: new THREE.Vector3(),
      leapAirTimer: 0,
      neckState:
        type === 'titanforged' ||
        type === 'titan' ||
        type === 'forgemaster' ||
        type === 'guardian' ||
        type === 'origin'
          ? createTitanforgedNeckState()
          : undefined,
      tentacleState: createTentaclePhysicsState(refs),
      ai: createMonsterAIRuntime(spawnPos, isDweller),
      anim: createMonsterAnimState(),
    };
    this.enemies.push(ent);
    return ent;
  }

  private setBossWarning(text: string, duration = 1.65): void {
    this.bossWarningText = text;
    this.bossWarningTimer = Math.max(this.bossWarningTimer, duration);
  }

  private spawnBossShockwave(
    center: THREE.Vector3,
    kind: 'stomp' | 'crusher' | 'gravity',
    maxRadius: number,
    maxAge: number,
    damage: number
  ): void {
    const color = kind === 'gravity' ? 0xc026d3 : kind === 'crusher' ? 0xf97316 : 0xf59e0b;
    const geo = new THREE.RingGeometry(0.65, 1.35, 36);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, this.groundHeightAt(center.x, center.z) + 0.14, center.z);
    this.scene.add(mesh);
    this.shockwaves.push({
      mesh,
      mat,
      center: center.clone(),
      age: 0,
      maxAge,
      maxRadius,
      kind,
      damage,
      hitChecked: false,
    });
  }

  private applyGraphicsQuality(): void {
    const q = this.settings.graphicsQuality ?? 'high';
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    let pixelCap = 1.5;
    let shadows = !this.isSoftwareGl;
    let shadowSize = 1024;
    let bloomEnabled = true;
    let bloomStrength = 0.36;
    let bloomRadius = 0.5;
    let horrorEnabled = true;
    let exposure = 1.15;
    let fxScale = 1.0;

    if (q === 'low') {
      pixelCap = 1.0;
      shadows = false;
      shadowSize = 512;
      bloomEnabled = false;
      horrorEnabled = false;
      exposure = 1.12;
      fxScale = 0.4;
    } else if (q === 'medium') {
      pixelCap = 1.25;
      shadows = !this.isSoftwareGl;
      shadowSize = 512;
      bloomEnabled = false;
      horrorEnabled = true;
      exposure = 1.14;
      fxScale = 0.72;
    } else if (q === 'high') {
      pixelCap = 1.5;
      shadows = !this.isSoftwareGl;
      shadowSize = 1024;
      bloomEnabled = true;
      bloomStrength = 0.36;
      horrorEnabled = true;
      exposure = 1.15;
      fxScale = 1.0;
    } else if (q === 'ultra') {
      pixelCap = 2.0;
      shadows = !this.isSoftwareGl;
      shadowSize = 2048;
      bloomEnabled = true;
      bloomStrength = 0.45;
      bloomRadius = 0.56;
      horrorEnabled = true;
      exposure = 1.18;
      fxScale = 1.2;
    } else {
      // cinematic
      pixelCap = 2.0;
      shadows = !this.isSoftwareGl;
      shadowSize = 2048;
      bloomEnabled = true;
      bloomStrength = 0.56;
      bloomRadius = 0.64;
      horrorEnabled = true;
      exposure = 1.24;
      fxScale = 1.35;
    }

    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(dpr, pixelCap));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.toneMappingExposure = exposure;

    this.flashlight.castShadow = shadows;
    if (shadows && this.currentShadowSize !== shadowSize) {
      this.currentShadowSize = shadowSize;
      this.flashlight.shadow.mapSize.set(shadowSize, shadowSize);
      if (this.flashlight.shadow.map) {
        this.flashlight.shadow.map.dispose();
        this.flashlight.shadow.map = null;
      }
    }

    if (this.bloomPass) {
      this.bloomPass.enabled = !this.isSoftwareGl && bloomEnabled;
      this.bloomPass.strength = bloomStrength;
      this.bloomPass.radius = bloomRadius;
    }
    if (this.horrorPass) {
      this.horrorPass.enabled = !this.isSoftwareGl && horrorEnabled;
    }
    this.composer?.setSize(w, h);
    this.fireSystem?.setQualityScale(fxScale);
  }

  private showRadio(speaker: string, text: string): void {
    this.radioBanner = { speaker, text };
    this.radioBannerTimer = 6.0;
  }

  public updateSettings(next: GameSettings): void {
    this.settings = { ...next };
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.audio.applySettings(this.settings);
    this.applyGraphicsQuality();
  }

  public setPaused(val: boolean): void {
    this.paused = val;
    if (val && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
  }

  public setCoopSession(val: boolean): void {
    this.isCoopSession = val;
    if (this.educationOpenId) {
      this.educationFrozen = !val;
      this.pushHud(true);
    }
  }

  public setEducationModalOpen(entryId: string | null): void {
    this.educationOpenId = entryId;
    this.educationFrozen = Boolean(entryId) && !this.isCoopSession;
    this.keys = {};
    this.mouseDownLeft = false;
    this.mouseDownRight = false;
    this.dragLookActive = false;
    if (entryId) {
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    } else {
      this.requestPointerLock();
    }
    this.pushHud(true);
  }

  public requestPointerLock(): void {
    if (this.paused || this.isDead || this.missionEnded || this.educationOpenId) return;
    this.audio.unlock();
    try {
      const res = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch {
      // pointer lock may not be available in some headless/touch environments
    }
  }

  // Public API for Puzzle, Workbench & Ending Modals
  public getGeneratorChallenge(puzzleId: string): GeneratorChallengeState {
    const existing = this.generatorChallenges.get(puzzleId);
    if (existing) return existing;
    const created = createGeneratorChallenge(puzzleId, this.usedGeneratorSignatures);
    this.generatorChallenges.set(puzzleId, created);
    return created;
  }

  public updateGeneratorChallenge(puzzleId: string, state: GeneratorChallengeState): void {
    this.generatorChallenges.set(puzzleId, state);
  }

  public solvePuzzle(puzzleId: string, solved: boolean): void {
    const target = this.activePuzzleTarget;
    this.activePuzzleId = null;
    this.activePuzzleTarget = null;
    this.keys = {};
    this.paused = false;

    if (solved && !this.solvedPuzzles.has(puzzleId)) {
      this.solvedPuzzles.add(puzzleId);
      this.generatorChallenges.delete(puzzleId);
      this.audio.playPuzzleSolve();
      if (target) {
        this.activatedInteractables.add(target.id);
        this.applyPuzzleSolvedEffect(puzzleId, target);
      }
    }
    this.requestPointerLock();
    this.pushHud(true);
  }

  public refreshCampaignState(nextCampaign: CampaignState): void {
    this.campaign = { ...nextCampaign };
    this.medkits = Math.max(this.medkits, this.campaign.medkits);

    const primId = this.weaponStates[0].id;
    const newSecId: WeaponId = this.campaign.equippedSecondary || 'pistol';
    const primDef = getUpgradedWeaponStats(primId, this.campaign.weaponUpgrades[primId]);
    const secDef = getUpgradedWeaponStats(newSecId, this.campaign.weaponUpgrades[newSecId]);

    this.weaponStates[0].ammoInMag = Math.min(primDef.magSize, this.weaponStates[0].ammoInMag);
    this.weaponStates[0].reserveAmmo = Math.max(
      this.weaponStates[0].reserveAmmo,
      this.campaign.weaponAmmo[primId]?.reserve ?? this.weaponStates[0].reserveAmmo
    );

    if (this.weaponStates[1].id !== newSecId) {
      this.weaponStates[1] = {
        id: newSecId,
        ammoInMag: secDef.magSize,
        reserveAmmo: Math.floor(secDef.reserveMax * 0.8),
      };
      if (this.fpRigs) {
        this.camera.remove(this.fpRigs[1].root);
        this.disposeObject3D(this.fpRigs[1].root);
        const newRig = buildFirstPersonRig(this.characterId, newSecId, this.textures);
        newRig.root.visible = this.activeSlot === 1;
        this.camera.add(newRig.root);
        this.fpRigs[1] = newRig;
      }
    } else {
      this.weaponStates[1].reserveAmmo = Math.max(
        this.weaponStates[1].reserveAmmo,
        this.campaign.weaponAmmo[newSecId]?.reserve ?? this.weaponStates[1].reserveAmmo
      );
    }
    if (this.campaign.portalGunUnlocked) {
      this.ensurePortalRig();
    }
    this.syncInventoryList();
    this.pushHud(true);
  }

  public closeWorkbench(updatedCampaign?: CampaignState): void {
    if (updatedCampaign) {
      this.refreshCampaignState(updatedCampaign);
    }
    this.workbenchOpen = false;
    this.paused = false;
    this.requestPointerLock();
    this.pushHud(true);
  }

  public selectEnding(endingId: EndingId): void {
    this.endingChoiceOpen = false;
    this.missionEnded = true;
    this.audio.setBossMusic(false);
    this.audio.playEndingStinger();

    if (!this.campaign.endingsReached.includes(endingId)) {
      this.campaign.endingsReached.push(endingId);
    }
    if (endingId === 'secret') {
      this.campaign.secretEndingUnlocked = true;
    }
    this.completeCurrentMissionInCampaign();

    const titles: Record<string, string> = {
      regular: 'OPTION 1 // THE REGULAR ENDING: THE LAST SIGNAL',
      secret: 'OPTION 2 // THE SECRET ENDING: THE THING BEYOND THE STARS',
      A: 'ENDING A // NETWORK SEVERED',
      B: 'ENDING B // SIGNAL REDIRECTED',
      C: 'ENDING C // THE SIGNAL ANSWERED',
    };
    const summaries: Record<string, string> = {
      regular: 'The signal has been silenced. The invasion has been stopped. But Earth will never be the same. Campaign Complete. [POST-CREDITS: Abandoned research facility recording — "We believed the signal was the source... We were wrong. End of transmission."]',
      secret: 'You stopped the invasion, but you brought something worse to our attention. THEY were never the end. The next threat has arrived. <SECRET ENDING UNLOCKED: THE ONE WHO SAW THE TRUTH>',
      A: 'You shattered the Master HELIOS Spire. Every dish fell silent—yet beneath the crust, the metallic roots continue to spread in the dark.',
      B: 'You inverted the 4.18 Hz carrier frequency away from Earth, sending the alien hive dormant while buying humanity another century to rebuild.',
      C: 'You opened the deep-space channel at full amplitude. Something vast beyond the Moon acknowledged the call—and humanity stepped toward a new synthesis.',
    };

    const stats = this.buildChapterStats();
    this.callbacks.onMissionComplete(
      titles[endingId] || 'MISSION COMPLETE',
      summaries[endingId] || 'Campaign completed.',
      stats,
      endingId
    );
  }

  private applyPuzzleSolvedEffect(puzzleId: string, target: InteractableObject): void {
    this.soundBus.emit(
      target.position.x,
      target.position.y,
      target.position.z,
      38,
      'generator_on',
      this.elapsedSeconds
    );

    if (puzzleId === 'puz_01_gen') {
      target.consumed = true;
      this.powerRestored = true;
      if (this.world.powerCableMesh) {
        const mat = this.world.powerCableMesh.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(0x22c55e);
        mat.emissiveIntensity = 1.6;
      }
      this.showRadio('GRID RESTORED', 'Generator online at 100% power! Auxiliary power routed to Checkpoint Kestrel Gate.');
      this.audio.playAlarmBeep();
      this.objectiveTitle = 'UNLOCK CHECKPOINT GATE';
      this.objectiveDetail = 'Return to the Checkpoint Override Panel (6.4, -27) with the keycard to open the blast gate.';
      this.objectiveTarget = { x: 6.4, z: -26.8 };
      return;
    }

    target.consumed = true;
    this.powerRestored = true;

    if (puzzleId === 'puz_02_elec') {
      this.showRadio('RELAY CALIBRATED', 'Electrical relay synchronized! Unlock the north blast door (0, -61) once ventilation & maintenance key are ready.');
      this.objectiveTarget = { x: -4.5, z: -60.5 };
      return;
    }

    if (puzzleId === 'puz_04_comms') {
      this.showRadio('COMMS TOWER ONLINE', 'Emergency jamming cleared! Highway 9 evacuation gate is clear.');
      this.checkLevel4Progression();
      return;
    }

    if (puzzleId === 'puz_07_pump') {
      this.showRadio('PUMP BUS POWERED', 'Sump impeller grid energized! Activate all 3 Sector Drain Pumps.');
      this.objectiveTitle = 'DRAIN THREE FLOODED BAYS';
      this.objectiveDetail = 'Flip Pump Stations Alpha (-18, -6), Beta (-18, -40), and Gamma (18, -40).';
      this.objectiveTarget = { x: -18, z: -6 };
      return;
    }

    if (target.doorId) {
      this.openDynamicDoor(target.doorId);
    }

    if (puzzleId === 'puz_03_lab') {
      this.missionStage = 2;
      this.objectiveTitle = 'ESCAPE PROJECT GENESIS';
      this.objectiveDetail = 'Central Laboratory unlocked! Proceed north to the dead city lift (0, -90).';
      this.objectiveTarget = { x: 0, z: -90 };
      this.showRadio('LAB SEAL OPENED', 'Central Laboratory blast door unlocked.');
    } else if (puzzleId === 'puz_05_furnace') {
      this.missionStage = 1;
      this.objectiveTitle = 'DEFEAT THE FORGEMASTER';
      this.objectiveDetail = 'Enter the Crucible Arena! Pull West/East Purge Valves (-20/+20, -64) to melt boss armor!';
      this.objectiveTarget = { x: 0, z: -64 };
      this.audio.setBossMusic(true);
      this.showRadio('SMELTER BREACHED', 'Crucible Blast Door open. THE FORGEMASTER awaits!');
    } else if (puzzleId === 'puz_06_security') {
      this.missionStage = 1;
      this.objectiveTitle = 'DESTROY THE SENTINEL';
      this.objectiveDetail = 'Enter Blacksite Hangar and neutralize the infected AEGIS-IX Sentinel.';
      this.objectiveTarget = { x: 0, z: -68 };
      this.audio.setBossMusic(true);
      this.showRadio('ARMORY VAULT OPENED', 'Security lock bypassed. Combat mech active inside hangar!');
    } else if (puzzleId === 'puz_08_bio') {
      this.missionStage = 1;
      this.objectiveTitle = 'SLAY THE GUARDIAN';
      this.objectiveDetail = 'Enter the Heart Chamber and destroy THE GUARDIAN of the metallic roots.';
      this.objectiveTarget = { x: 0, z: -72 };
      this.audio.setBossMusic(true);
      this.showRadio('RESONANCE INVERTED', 'Bio-root barrier parted. Guardian waking ahead!');
    } else if (puzzleId === 'puz_09_orbital') {
      this.missionStage = 1;
      this.objectiveTitle = 'ENDURE THE TITAN';
      this.objectiveDetail = 'Cross Launch Pad 01 and defeat THE TITAN construction mech.';
      this.objectiveTarget = { x: 0, z: -70 };
      this.audio.setBossMusic(true);
      this.showRadio('PAD LOCKS RELEASED', 'Launch apron unlocked. Orbital walker inbound!');
    } else if (puzzleId === 'puz_10_helios') {
      this.missionStage = 1;
      this.objectiveTitle = 'DEFEAT HELIOS DEFENCE UNIT';
      this.objectiveDetail = 'Enter Server Hall Omega and destroy the corrupted HELIOS mainframe warden.';
      this.objectiveTarget = { x: 0, z: -68 };
      this.audio.setBossMusic(true);
      this.showRadio('CORE VAULT OPENED', 'Azimuth lock severed. Mainframe defence unit engaged!');
    } else if (puzzleId === 'puz_11_station') {
      this.missionStage = 1;
      this.objectiveTitle = 'RECOVER INTERFEROMETRY TAPE';
      this.objectiveDetail = 'Cross the zero-gravity ring (10, -48) to retrieve the deep-space signal log.';
      this.objectiveTarget = { x: 10, z: -48 };
      this.showRadio('REACTOR ONLINE', 'Station power restored. Airlock to Ring B is open.');
    } else if (puzzleId === 'puz_12_origin') {
      this.missionStage = 1;
      this.objectiveTitle = 'DESTROY THE ORIGIN';
      this.objectiveDetail = 'Enter Chamber Zero and defeat THE ORIGIN to unlock the Master HELIOS Spire.';
      this.objectiveTarget = { x: 0, z: -68 };
      this.audio.setBossMusic(true);
      this.showRadio('SANCTUM UNLOCKED', 'The Chamber Zero bridge is open. Finish what began in 3059.');
    }
  }

  private openDynamicDoor(doorId: string): void {
    const door = this.world.dynamicDoors?.find((d) => d.id === doorId);
    if (!door || door.opened) return;
    door.opened = true;
    if (this.world.colliders[door.colliderIndex]) {
      this.world.colliders[door.colliderIndex].maxY = -10;
    }
    this.navGrid?.rebuild(this.world.colliders, this.world.destructibleBarricades);
    this.soundBus.emit(
      door.mesh.position.x,
      door.mesh.position.y,
      door.mesh.position.z,
      24,
      'door_open',
      this.elapsedSeconds
    );
    this.audio.playDoorHydraulicOpen();
  }

  // Mobile Touch Control API
  public setTouchMove(x: number, y: number): void {
    this.touchMoveVec.x = x;
    this.touchMoveVec.y = y;
  }

  public addTouchLook(dx: number, dy: number): void {
    const sens = 0.004 * this.settings.mouseSensitivity;
    this.playerYaw -= dx * sens;
    const inv = this.settings.invertY ? -1 : 1;
    this.playerPitch = THREE.MathUtils.clamp(this.playerPitch - dy * sens * inv, -1.45, 1.45);
  }

  public triggerTouchAction(
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
  ): void {
    if (
      this.paused ||
      this.isDead ||
      this.missionEnded ||
      this.educationOpenId
    ) {
      return;
    }
    this.audio.unlock();
    if (action === 'shoot_start') {
      this.mouseDownLeft = true;
      this.tryShoot();
    } else if (action === 'shoot_end') {
      this.mouseDownLeft = false;
    } else if (action === 'portal_orange') {
      if (this.activeSlot === 2 && this.campaign.portalGunUnlocked) {
        this.firePortal('orange');
      }
    } else if (action === 'aim') {
      if (this.activeSlot === 2) {
        this.firePortal('orange');
      } else {
        this.mouseDownRight = !this.mouseDownRight;
      }
    } else if (action === 'reload') this.startReload();
    else if (action === 'interact') this.tryInteract();
    else if (action === 'ability') this.activateAbility();
    else if (action === 'flashlight') this.toggleFlashlight();
    else if (action === 'jump') this.tryJump();
    else if (action === 'switch') this.cycleWeaponSlot(1);
    else if (action === 'heal') this.useMedkit();
  }

  private cycleWeaponSlot(dir: 1 | -1): void {
    const slots: (0 | 1 | 2)[] = this.campaign.portalGunUnlocked ? [0, 1, 2] : [0, 1];
    const idx = slots.indexOf(this.activeSlot);
    const nextIdx = (idx + dir + slots.length) % slots.length;
    this.switchWeapon(slots[nextIdx]);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.educationOpenId) return;
    this.keys[e.code] = true;
    if (e.code === 'Escape') {
      if (this.activePuzzleId || this.workbenchOpen || this.endingChoiceOpen) return;
      if (!this.isDead && !this.missionEnded && !this.paused) {
        this.setPaused(true);
        this.callbacks.onPauseRequested();
      }
      return;
    }
    if (this.paused || this.isDead || this.missionEnded) return;

    if (e.code === 'KeyF') this.toggleFlashlight();
    else if (e.code === 'KeyR') this.startReload();
    else if (e.code === 'KeyE') this.tryInteract();
    else if (e.code === 'KeyQ') this.activateAbility();
    else if (e.code === 'KeyH') this.useMedkit();
    else if (e.code === 'KeyV') this.performMelee();
    else if (e.code === 'KeyG' && this.campaign.portalGunUnlocked) this.clearPortals(true);
    else if (e.code === 'Digit1') this.switchWeapon(0);
    else if (e.code === 'Digit2') this.switchWeapon(1);
    else if (e.code === 'Digit3' && this.campaign.portalGunUnlocked) this.switchWeapon(2);
    else if (e.code === 'Space') this.tryJump();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.paused || this.isDead || this.missionEnded || this.educationOpenId) return;
    if (!this.pointerLocked && !this.dragLookActive) return;
    const sens = 0.0021 * this.settings.mouseSensitivity * (this.mouseDownRight ? 0.58 : 1.0);
    const dx = this.pointerLocked ? e.movementX : e.clientX - this.lastMouseX;
    const dy = this.pointerLocked ? e.movementY : e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.playerYaw -= dx * sens;
    const inv = this.settings.invertY ? -1 : 1;
    this.playerPitch = THREE.MathUtils.clamp(
      this.playerPitch - dy * sens * inv,
      -1.45,
      1.45
    );
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.paused || this.isDead || this.missionEnded || this.educationOpenId) return;
    this.audio.unlock();
    if (!this.pointerLocked && !this.settings.touchControls) {
      this.requestPointerLock();
      this.dragLookActive = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
    if (e.button === 0) {
      this.mouseDownLeft = true;
      this.tryShoot();
    } else if (e.button === 2) {
      if (this.activeSlot === 2) {
        this.firePortal('orange');
      } else {
        this.mouseDownRight = true;
      }
    } else if (e.button === 1) {
      this.performMelee();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.mouseDownLeft = false;
      this.dragLookActive = false;
    } else if (e.button === 2) {
      this.mouseDownRight = false;
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.paused || this.isDead || this.educationOpenId) return;
    if (Math.abs(e.deltaY) > 5) {
      this.cycleWeaponSlot(e.deltaY > 0 ? 1 : -1);
    }
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.pointerLocked) {
      this.mouseDownLeft = false;
      this.mouseDownRight = false;
    }
    this.pushHud(true);
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
  };

  private onContextRestored = () => {
    this.contextLost = false;
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    window.addEventListener('resize', this.onResize);
  }

  private toggleFlashlight(): void {
    if (this.flashlightBattery <= 0 && !this.flashlightOn) return;
    this.flashlightOn = !this.flashlightOn;
    this.audio.playClick(this.flashlightOn);
    this.pushHud(true);
  }

  private tryJump(): void {
    if (this.grounded) {
      this.playerVel.y = this.inZeroG ? 7.8 : 6.2;
      this.grounded = false;
    }
  }

  private ensurePortalRig(): FirstPersonRigRefs | null {
    if (!this.fpRigs) return null;
    if (!this.fpRigs[2]) {
      const portalRig = buildFirstPersonRig(this.characterId, 'portal_gun', this.textures);
      portalRig.root.visible = this.activeSlot === 2;
      this.camera.add(portalRig.root);
      this.fpRigs[2] = portalRig;
    }
    return this.fpRigs[2];
  }

  private hasPortalUpgrade(id: PortalUpgradeId): boolean {
    return this.campaign.portalUpgrades.includes(id);
  }

  private switchWeapon(slot: 0 | 1 | 2): void {
    if (slot === this.activeSlot || this.isReloading) return;
    if (slot === 2) {
      if (!this.campaign.portalGunUnlocked) return;
      this.ensurePortalRig();
      this.mouseDownRight = false;
    }
    this.activeSlot = slot;
    this.switchAnimTimer = 0.28;
    if (this.fpRigs) {
      this.fpRigs[0].root.visible = slot === 0;
      this.fpRigs[1].root.visible = slot === 1;
      if (this.fpRigs[2]) {
        this.fpRigs[2].root.visible = slot === 2;
      }
    }
    this.audio.playClick(false);
    this.pushHud(true);
  }

  private getActiveWeaponDef(slot: 0 | 1 | 2 = this.activeSlot) {
    if (slot === 2) return WEAPONS.portal_gun;
    const id = this.weaponStates[slot].id;
    return getUpgradedWeaponStats(id, this.campaign.weaponUpgrades[id]);
  }

  private startReload(): void {
    if (this.activeSlot === 2) {
      if (!this.campaign.portalGunUnlocked) return;
      // Pressing [R] with the Portal Device smart-pairs the next opposing portal automatically
      const nextColor: 'blue' | 'orange' = !this.portals.blue
        ? 'blue'
        : !this.portals.orange
          ? 'orange'
          : this.portalLastFired === 'blue'
            ? 'orange'
            : 'blue';
      this.firePortal(nextColor);
      return;
    }
    const wState = this.weaponStates[this.activeSlot];
    const wDef = this.getActiveWeaponDef();
    if (this.isReloading || wState.ammoInMag >= wDef.magSize || wState.reserveAmmo <= 0) return;
    this.isReloading = true;
    const speedMult = this.characterId === 'raven' && this.abilityActive ? 0.6 : 1.0;
    this.reloadDuration = wDef.reloadTime * speedMult;
    this.reloadTimer = this.reloadDuration;
    this.audio.playReload();
    this.pushHud(true);
  }

  private finishReload(): void {
    if (this.activeSlot === 2) {
      this.isReloading = false;
      this.reloadTimer = 0;
      return;
    }
    const wState = this.weaponStates[this.activeSlot];
    const wDef = this.getActiveWeaponDef();
    const needed = wDef.magSize - wState.ammoInMag;
    const taken = Math.min(needed, wState.reserveAmmo);
    wState.ammoInMag += taken;
    wState.reserveAmmo -= taken;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.pushHud(true);
  }

  private clearPortals(playSound = false): void {
    (['blue', 'orange'] as const).forEach((c) => {
      const p = this.portals[c];
      if (!p) return;
      this.scene.remove(p.group);
      this.disposeObject3D(p.group);
      this.portals[c] = null;
    });
    if (playSound) {
      this.audio.playPortalFizzle();
      this.portalClawAnim = 0.28;
    }
    this.pushHud(true);
  }

  private raycastGroundSurface(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxRange: number
  ): { dist: number; point: THREE.Vector3; normal: THREE.Vector3 } | null {
    if (dir.y >= -0.005) return null;
    const step = 0.85;
    let prevT = 0.35;
    const steps = Math.ceil(maxRange / step);
    for (let s = 1; s <= steps; s++) {
      const t = Math.min(maxRange, 0.35 + s * step);
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;
      const gy = this.groundHeightAt(px, pz);
      if (py <= gy) {
        let lo = prevT;
        let hi = t;
        for (let b = 0; b < 8; b++) {
          const mid = 0.5 * (lo + hi);
          const mx = origin.x + dir.x * mid;
          const my = origin.y + dir.y * mid;
          const mz = origin.z + dir.z * mid;
          if (my <= this.groundHeightAt(mx, mz)) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        const hitX = origin.x + dir.x * hi;
        const hitZ = origin.z + dir.z * hi;
        const hitY = this.groundHeightAt(hitX, hitZ);
        const eps = 0.25;
        const gx = this.groundHeightAt(hitX + eps, hitZ) - this.groundHeightAt(hitX - eps, hitZ);
        const gz = this.groundHeightAt(hitX, hitZ + eps) - this.groundHeightAt(hitX, hitZ - eps);
        const normal = new THREE.Vector3(-gx, 2 * eps, -gz).normalize();
        return {
          dist: hi,
          point: new THREE.Vector3(hitX, hitY, hitZ),
          normal,
        };
      }
      prevT = t;
      if (t >= maxRange) break;
    }
    return null;
  }

  private findPortalSurfaceHit(
    maxRange: number
  ): { dist: number; point: THREE.Vector3; normal: THREE.Vector3 } | null {
    this.camera.getWorldDirection(_dir);
    const colliderHit = this.raycastWorldColliders(this.camera.position, _dir, maxRange);
    const floorHit = this.raycastGroundSurface(this.camera.position, _dir, maxRange);
    if (colliderHit && (!floorHit || colliderHit.dist <= floorHit.dist)) {
      return { dist: colliderHit.dist, point: colliderHit.point, normal: colliderHit.normal };
    }
    if (floorHit) {
      return floorHit;
    }
    return null;
  }

  private firePortal(color: 'blue' | 'orange'): void {
    if (!this.campaign.portalGunUnlocked) return;
    if (this.fireTimer > 0 && this.portalLastFired === color) return;

    const tachyon = this.hasPortalUpgrade('portal_tachyon_core');
    this.fireTimer = tachyon ? 0.1 : 0.18;
    this.recoilOffset = Math.min(0.11, this.recoilOffset + 0.026);
    this.portalClawAnim = 0.42;
    this.portalLastFired = color;

    const hexColor = color === 'blue' ? 0x0ea5e9 : 0xf97316;
    const rimHex = color === 'blue' ? 0x38bdf8 : 0xfb923c;
    const rig = this.fpRigs?.[2];
    if (rig) {
      if (rig.portalCoreMat) {
        rig.portalCoreMat.color.setHex(rimHex);
        rig.portalCoreMat.emissive.setHex(hexColor);
      }
      if (rig.muzzleFlash.material instanceof THREE.MeshBasicMaterial) {
        rig.muzzleFlash.material.color.setHex(rimHex);
      }
      rig.muzzleLight.color.setHex(rimHex);
      this.muzzleFlashTimer = 0.075;
    }

    const muzzleOrigin = new THREE.Vector3();
    if (rig) {
      rig.muzzleFlash.getWorldPosition(muzzleOrigin);
    } else {
      muzzleOrigin.copy(this.camera.position).add(new THREE.Vector3(0.12, -0.08, -0.4));
    }

    const maxRange = this.hasPortalUpgrade('portal_range') ? 185 : 85;
    const surfaceHit = this.findPortalSurfaceHit(maxRange);

    const hitPoint = surfaceHit ? surfaceHit.point.clone() : null;
    const hitNormal = surfaceHit ? surfaceHit.normal.clone() : null;

    const tracerEnd =
      hitPoint ?? this.camera.position.clone().addScaledVector(_dir, Math.min(maxRange, 48));
    this.spawnTracerBeam(muzzleOrigin, tracerEnd, rimHex);

    if (!hitPoint || !hitNormal) {
      this.audio.playPortalFizzle();
      this.spawnImpactParticles(tracerEnd, rimHex, 8);
      this.pushHud(true);
      return;
    }

    // Instead of fizzling when fired near the opposing portal, automatically slide sideways so both portals stay linked
    const otherColor = color === 'blue' ? 'orange' : 'blue';
    const otherPortal = this.portals[otherColor];
    if (otherPortal && otherPortal.center.distanceTo(hitPoint) < 1.55) {
      const upRef = Math.abs(hitNormal.y) > 0.8 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      const tangentU = new THREE.Vector3().crossVectors(upRef, hitNormal).normalize();
      const away = hitPoint.clone().sub(otherPortal.center);
      away.addScaledVector(hitNormal, -away.dot(hitNormal));
      if (away.lengthSq() < 0.02) {
        away.copy(tangentU);
      } else {
        away.normalize();
      }
      hitPoint.copy(otherPortal.center).addScaledVector(away, 1.68);
      if (Math.abs(hitNormal.y) > 0.8) {
        hitPoint.y = this.groundHeightAt(hitPoint.x, hitPoint.z);
      }
    }

    this.placePortal(color, hitPoint, hitNormal);
    this.audio.playPortalFire(color);
    this.spawnImpactParticles(hitPoint, rimHex, 10);
    this.pushHud(true);
  }

  private placePortal(
    color: 'blue' | 'orange',
    rawPoint: THREE.Vector3,
    normal: THREE.Vector3
  ): void {
    const prev = this.portals[color];
    if (prev) {
      this.scene.remove(prev.group);
      this.disposeObject3D(prev.group);
      this.portals[color] = null;
    }

    const center = rawPoint.clone().addScaledVector(normal, 0.06);
    // Keep vertical wall portals within effortless walk-through height unless placed on upper stories
    if (Math.abs(normal.y) < 0.65) {
      const floorHere = this.groundHeightAt(center.x, center.z);
      if (center.y < floorHere + 1.08) {
        center.y = floorHere + 1.08;
      } else if (center.y <= floorHere + 2.35) {
        center.y = Math.min(center.y, floorHere + 1.42);
      }
    }

    const group = new THREE.Group();
    group.position.copy(center);

    if (normal.z < -0.999 && Math.abs(normal.x) < 0.001 && Math.abs(normal.y) < 0.001) {
      _portalQuat.setFromAxisAngle(_portalAltAxis, Math.PI);
    } else {
      _portalQuat.setFromUnitVectors(_portalZAxis, normal);
    }
    group.quaternion.copy(_portalQuat);

    const coreCol = color === 'blue' ? new THREE.Color(0x0284c7) : new THREE.Color(0xea580c);
    const rimCol = color === 'blue' ? new THREE.Color(0x38bdf8) : new THREE.Color(0xfb923c);
    const paired = Boolean(this.portals[color === 'blue' ? 'orange' : 'blue']);

    const vortexGeo = new THREE.CircleGeometry(0.76, 30);
    const vortexMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: this.elapsedSeconds },
        uColor: { value: coreCol },
        uRimColor: { value: rimCol },
        uLinked: { value: paired ? 1.0 : 0.0 },
      },
      vertexShader: PortalVortexVertexShader,
      fragmentShader: PortalVortexFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const vortexMesh = new THREE.Mesh(vortexGeo, vortexMat);
    vortexMesh.scale.set(1.0, 1.78, 1.0);
    vortexMesh.renderOrder = 3;

    const rimGeo = new THREE.RingGeometry(0.74, 0.86, 32);
    const rimMat = new THREE.MeshBasicMaterial({
      color: color === 'blue' ? 0x38bdf8 : 0xf97316,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.scale.set(1.0, 1.78, 1.0);
    rimMesh.position.z = 0.015;
    rimMesh.renderOrder = 4;

    const light = new THREE.PointLight(color === 'blue' ? 0x38bdf8 : 0xf97316, 2.5, 9, 2);
    light.position.z = 0.45;

    group.add(vortexMesh, rimMesh, light);
    group.scale.setScalar(0.15);
    this.scene.add(group);

    this.portals[color] = {
      color,
      center,
      normal: normal.clone(),
      group,
      vortexMat,
      rimMat,
      light,
      openAnim: 0.05,
    };
  }

  private updatePortals(dt: number): void {
    const linked = Boolean(this.portals.blue && this.portals.orange);
    (['blue', 'orange'] as const).forEach((c) => {
      const p = this.portals[c];
      if (!p) return;
      p.openAnim = Math.min(1, p.openAnim + dt * 6.5);
      const s = THREE.MathUtils.lerp(0.15, 1.0, p.openAnim);
      p.group.scale.setScalar(s);
      p.vortexMat.uniforms.uTime.value = this.elapsedSeconds;
      p.vortexMat.uniforms.uLinked.value = linked ? 1.0 : 0.0;
      p.light.intensity = linked ? 2.8 + Math.sin(this.elapsedSeconds * 5) * 0.4 : 1.5;
    });
  }

  private checkPortalBulletRelay(
    ray: THREE.Ray,
    maxDist: number,
    damage: number,
    hitTargets: THREE.Mesh[]
  ): void {
    if (!this.portals.blue || !this.portals.orange) return;
    if (!this.hasPortalUpgrade('portal_combat_relay')) return;

    const candidates: [ActivePortal, ActivePortal][] = [
      [this.portals.blue, this.portals.orange],
      [this.portals.orange, this.portals.blue],
    ];

    for (const [entry, exit] of candidates) {
      const distToEntry = ray.origin.distanceTo(entry.center);
      if (distToEntry > maxDist + 1.5) continue;
      if (ray.distanceSqToPoint(entry.center) > 1.48 * 1.48) continue;

      // Determine exit shot direction: auto-lock toward nearest active enemy in exit hemisphere, else straight out exit normal
      const relayDir = exit.normal.clone();
      let bestScore = -1;
      for (const e of this.enemies) {
        if (!e.active || e.state === 'DEAD' || e.huskCollapsed) continue;
        _vec3A.copy(e.position).add(new THREE.Vector3(0, 1.2, 0)).sub(exit.center);
        const d = _vec3A.length();
        if (d < 0.5 || d > 55) continue;
        _vec3A.divideScalar(d);
        const align = _vec3A.dot(exit.normal);
        if (align > 0.2 && align > bestScore) {
          bestScore = align;
          relayDir.copy(_vec3A);
        }
      }

      const relayOrigin = exit.center.clone().addScaledVector(exit.normal, 0.22);
      const exitWallHit = this.raycastWorldColliders(relayOrigin, relayDir, 65);
      const exitMaxDist = exitWallHit ? exitWallHit.dist : 65;

      _raycaster.set(relayOrigin, relayDir);
      _raycaster.far = exitMaxDist;
      const relayHits = _raycaster.intersectObjects(hitTargets, false);
      const relayColor = exit.color === 'blue' ? 0x38bdf8 : 0xf97316;

      if (relayHits.length > 0) {
        const hit = relayHits[0];
        const enemy = hit.object.userData.ownerEnemy as EnemyEntity;
        const zone = (hit.object.userData.hitZone as string) || 'body';
        this.damageEnemy(enemy, Math.round(damage * 1.25), zone, hit.point);
        this.spawnImpactParticles(hit.point, relayColor, 7);
        this.spawnTracerBeam(relayOrigin, hit.point, relayColor);
      } else {
        const endPt = exitWallHit
          ? exitWallHit.point
          : relayOrigin.clone().addScaledVector(relayDir, 32);
        this.spawnTracerBeam(relayOrigin, endPt, relayColor);
        this.spawnImpactParticles(endPt, relayColor, 3);
      }
      break;
    }
  }

  private handleLongFallLanding(impactSpeed: number): void {
    if (!this.hasPortalUpgrade('portal_fall_boots') || impactSpeed < 11.0) return;

    this.audio.playLongFallShockwave();
    this.shakeIntensity = Math.max(this.shakeIntensity, 0.036);

    // Expanding Aperture kinetic ring
    const geo = new THREE.RingGeometry(0.45, 1.0, 28);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.playerPos.x, this.playerPos.y + 0.14, this.playerPos.z);
    this.scene.add(mesh);
    this.shockwaves.push({
      mesh,
      mat,
      center: this.playerPos.clone(),
      age: 0,
      maxAge: 0.45,
      maxRadius: 6.5,
      kind: 'gravity',
      damage: 0,
      hitChecked: true,
    });

    const bonusDmg = Math.round(THREE.MathUtils.clamp((impactSpeed - 9) * 5.2, 28, 85));
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.state === 'DEAD' || enemy.huskCollapsed) continue;
      if (enemy.position.distanceTo(this.playerPos) <= 6.8) {
        this.damageEnemy(enemy, bonusDmg, 'body', enemy.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
        enemy.stunTimer = Math.max(enemy.stunTimer, 1.8);
        if (!enemy.isBoss) enemy.state = 'STUNNED';
      }
    }
  }

  private useMedkit(): void {
    if (this.medkits <= 0 || this.health >= this.maxHealth) return;
    this.medkits -= 1;
    this.health = Math.min(this.maxHealth, this.health + 35);
    this.healAnimTimer = 0.55;
    this.audio.playClick(true);
    this.syncInventoryList();
    this.pushHud(true);
  }

  private performMelee(): void {
    if (this.meleeAnimTimer > 0 || this.isReloading) return;
    this.meleeAnimTimer = 0.36;
    this.audio.playClick(false);

    this.camera.getWorldDirection(_dir);
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.state === 'DEAD') continue;
      _vec3A.copy(enemy.position).add(new THREE.Vector3(0, 1.2, 0)).sub(this.camera.position);
      const dist = _vec3A.length();
      if (dist < 3.0 && _vec3A.normalize().dot(_dir) > 0.55) {
        this.damageEnemy(enemy, 36, 'body', enemy.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
        enemy.stunTimer = Math.max(enemy.stunTimer, 0.75);
      }
    }

    // Melee also damages nearby destructible obstacles & props
    for (const bar of this.world.destructibleBarricades) {
      if (bar.destroyed) continue;
      if (bar.position.distanceTo(this.playerPos) < 3.1) {
        this.damageDestructible(bar, 55);
      }
    }
  }

  private damageDestructible(
    bar: BuiltWorld['destructibleBarricades'][number],
    amount: number
  ): void {
    if (bar.destroyed) return;
    const kind = bar.kind ?? 'barricade';
    if (bar.health === undefined) {
      bar.maxHealth = kind === 'glass' ? 20 : kind === 'crate' ? 55 : 85;
      bar.health = bar.maxHealth;
    }
    bar.health -= amount;
    const color = kind === 'glass' ? 0x7dd3fc : kind === 'crate' ? 0xd97706 : 0xf59e0b;

    if (bar.health > 0) {
      this.spawnImpactParticles(bar.position, color, 4);
      return;
    }

    bar.destroyed = true;
    bar.mesh.visible = false;
    if (this.world.colliders[bar.colliderIndex]) {
      this.world.colliders[bar.colliderIndex].maxY = -10;
    }
    this.navGrid?.rebuild(this.world.colliders, this.world.destructibleBarricades);
    this.spawnImpactParticles(bar.position, color, 16);
    const dist = bar.position.distanceTo(this.playerPos);
    const dx = bar.position.x - this.playerPos.x;
    const dz = bar.position.z - this.playerPos.z;
    const pan = THREE.MathUtils.clamp((dx * Math.cos(this.playerYaw) - dz * Math.sin(this.playerYaw)) / (dist || 1), -1, 1);
    this.audio.playDestructionSound(kind, dist, pan);
    this.soundBus.emit(bar.position.x, bar.position.y, bar.position.z, 22, 'object_break', this.elapsedSeconds);
  }

  private shatterBarricade(bar: BuiltWorld['destructibleBarricades'][number]): void {
    this.damageDestructible(bar, 999);
  }

  private activateAbility(): void {
    if (this.abilityCooldownRemaining > 0 || this.abilityActive) return;
    const ab = CHARACTERS[this.characterId].ability;
    this.abilityActive = true;
    this.abilityActiveRemaining = ab.duration;
    this.abilityCooldownRemaining = ab.cooldown;
    this.abilityAnimTimer = 0.45;

    if (this.characterId === 'raven') {
      this.audio.playAbility('overdrive');
    } else if (this.characterId === 'ghost') {
      this.audio.playAbility('shadow');
    } else if (this.characterId === 'brute') {
      this.audio.playAbility('fortress');
    } else if (this.characterId === 'nyx') {
      this.audio.playAbility('reboot');
      this.armor = Math.min(this.maxArmor, this.armor + 25);
      this.health = Math.min(this.maxHealth, this.health + 20);
      this.droneMesh = buildSupportDrone();
      this.droneMesh.position.copy(this.playerPos).add(new THREE.Vector3(1.2, 2.0, -1.2));
      this.scene.add(this.droneMesh);
    } else if (this.characterId === 'zero') {
      this.audio.playAbility('pulse');
      const ringGeo = new THREE.RingGeometry(0.5, 1.2, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfb7185,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      });
      this.pulseRingMesh = new THREE.Mesh(ringGeo, ringMat);
      this.pulseRingMesh.rotation.x = -Math.PI / 2;
      this.pulseRingMesh.position.copy(this.playerPos).setY(0.4);
      this.scene.add(this.pulseRingMesh);
      this.pulseRingLife = 0.65;

      for (const enemy of this.enemies) {
        if (!enemy.active || enemy.state === 'DEAD') continue;
        if (enemy.position.distanceTo(this.playerPos) <= 16.5) {
          this.damageEnemy(enemy, 75, 'body', enemy.position.clone().add(new THREE.Vector3(0, 1.4, 0)));
          enemy.stunTimer = 4.0;
          enemy.state = 'STUNNED';
        }
      }
    }
    this.pushHud(true);
  }

  private tryShoot(): void {
    if (this.activeSlot === 2) {
      this.firePortal('blue');
      return;
    }
    if (this.fireTimer > 0 || this.isReloading || this.switchAnimTimer > 0) return;
    const wState = this.weaponStates[this.activeSlot];
    const wDef = this.getActiveWeaponDef();

    if (wState.ammoInMag <= 0) {
      this.startReload();
      return;
    }

    wState.ammoInMag -= 1;
    const rateMult = this.characterId === 'raven' && this.abilityActive ? 1.5 : 1.0;
    this.fireTimer = 1 / (wDef.fireRate * rateMult);
    this.recoilOffset = Math.min(0.14, this.recoilOffset + wDef.recoilKick);
    this.playerPitch = Math.min(1.45, this.playerPitch + wDef.recoilKick * 0.25);
    this.shakeIntensity = Math.max(
      this.shakeIntensity,
      wDef.id === 'sniper_rifle' || wDef.id === 'plasma_lance'
        ? 0.022
        : wDef.id === 'shotgun'
          ? 0.018
          : wDef.id === 'heavy_mg'
            ? 0.011
            : 0.006
    );
    this.muzzleFlashTimer = 0.055;
    this.audio.playGunshot(wDef.id);

    // Gunshot Acoustic Alert via Wall-Occluded SoundEventBus
    const ghostStealth = this.characterId === 'ghost' && this.abilityActive;
    if (!ghostStealth) {
      const noiseRadius = wDef.id === 'tactical_rifle' ? 16 : wDef.id === 'sniper_rifle' ? 42 : 30;
      this.soundBus.emit(
        this.playerPos.x,
        this.playerPos.y,
        this.playerPos.z,
        noiseRadius,
        'gunshot',
        this.elapsedSeconds,
        'player'
      );
    }

    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    const moveFactor = Math.min(0.014, horizSpeed * 0.0018);
    const spread = (this.mouseDownRight ? wDef.adsSpread : wDef.spread) + moveFactor;

    const hitTargets: THREE.Mesh[] = [];
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.state === 'DEAD' || enemy.huskCollapsed) continue;
      for (const hm of enemy.refs.hitMeshes) {
        if (hm.visible) {
          hm.userData.ownerEnemy = enemy;
          hitTargets.push(hm);
        }
      }
    }

    const rig = this.fpRigs?.[this.activeSlot];
    const tracerOrigin = new THREE.Vector3();
    if (rig) {
      rig.muzzleFlash.getWorldPosition(tracerOrigin);
    } else {
      tracerOrigin.copy(this.camera.position).add(new THREE.Vector3(0.12, -0.08, -0.4));
    }

    const tracerColor = wDef.isEnergy
      ? wDef.id === 'plasma_lance'
        ? 0x38bdf8
        : 0xfb7185
      : 0xfde68a;

    const pellets = wDef.pellets ?? 1;
    for (let p = 0; p < pellets; p++) {
      const sx = (Math.random() - 0.5) * spread;
      const sy = (Math.random() - 0.5) * spread;

      this.camera.getWorldDirection(_dir);
      _dir.x += sx;
      _dir.y += sy;
      _dir.normalize();

      const wallHit = this.raycastWorldColliders(this.camera.position, _dir, wDef.range);
      const maxRayDist = wallHit ? wallHit.dist : wDef.range;

      _raycaster.set(this.camera.position, _dir);
      _raycaster.far = maxRayDist;

      this.checkPortalBulletRelay(_raycaster.ray, maxRayDist, wDef.damage, hitTargets);

      const hits = _raycaster.intersectObjects(hitTargets, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const enemy = hit.object.userData.ownerEnemy as EnemyEntity;
        const zone = (hit.object.userData.hitZone as string) || 'body';
        this.damageEnemy(enemy, wDef.damage, zone, hit.point);
        this.spawnImpactParticles(
          hit.point,
          zone === 'armor' || zone === 'arm_armor' ? 0xf59e0b : 0xef4444,
          pellets > 1 ? 3 : 7
        );
        this.spawnTracerBeam(
          tracerOrigin,
          hit.point,
          wDef.isEnergy ? (wDef.id === 'plasma_lance' ? 0x38bdf8 : 0xfb7185) : 0xfcd34d
        );
      } else {
        const endPt = wallHit
          ? wallHit.point
          : this.camera.position.clone().addScaledVector(_dir, Math.min(wDef.range, 36));
        this.spawnImpactParticles(endPt, wDef.isEnergy ? 0x38bdf8 : 0xfbbf24, pellets > 1 ? 1 : 3);
        this.spawnTracerBeam(tracerOrigin, endPt, tracerColor);

        // Shootable destructible barricades, crates, and glass partitions (blocked by solid walls)
        let damagedBarricade = false;
        if (wallHit) {
          const hitBar = this.world.destructibleBarricades.find(
            (b) => !b.destroyed && b.colliderIndex === wallHit.colliderIndex
          );
          if (hitBar) {
            this.damageDestructible(hitBar, wDef.damage);
            damagedBarricade = true;
          }
        }
        if (!damagedBarricade) {
          for (const bar of this.world.destructibleBarricades) {
            if (bar.destroyed) continue;
            const dBar = bar.position.distanceTo(this.camera.position);
            if (dBar <= Math.min(26, maxRayDist + 0.45) && _raycaster.ray.distanceSqToPoint(bar.position) < 3.6) {
              this.damageDestructible(bar, wDef.damage);
            }
          }
        }

        // Check if gunfire triggers fuel leak wreck flare-up (only if unobstructed)
        if (this.world.destructibleFireEvents) {
          for (const ev of this.world.destructibleFireEvents) {
            if (ev.triggered || ev.kind !== 'fuel_wreck') continue;
            const dEv = ev.position.distanceTo(this.camera.position);
            const distSq = _raycaster.ray.distanceSqToPoint(ev.position);
            if (distSq < 4.5 && dEv <= Math.min(42, maxRayDist + 0.8)) {
              this.triggerFuelWreckExplosion(ev);
            }
          }
        }
      }
    }

    if (wState.ammoInMag === 0 && wState.reserveAmmo > 0) {
      this.startReload();
    }
  }

  private triggerFuelWreckExplosion(ev: NonNullable<BuiltWorld['destructibleFireEvents']>[number]): void {
    if (ev.triggered) return;
    ev.triggered = true;
    this.fireSystem.spawnBurst(ev.position, false, 36);
    this.fireSystem.spawnBurst(ev.position, true, 18);
    if (ev.emitterIndex !== undefined && this.world.fireEmitters[ev.emitterIndex]) {
      const em = this.world.fireEmitters[ev.emitterIndex];
      em.scale = 2.05;
      em.intensity = 1.35;
      if (em.baseLightIntensity) em.baseLightIntensity = 14;
    }
    this.audio.playArmorShatter(ev.position.distanceTo(this.playerPos), 0);
    this.shakeIntensity = Math.max(this.shakeIntensity, 0.025);
    this.showRadio('HAZARD ALERT', 'Fuel tank ruptured on infected vehicle!');
  }

  private damageEnemy(
    enemy: EnemyEntity,
    baseDamage: number,
    zone: string,
    hitPoint: THREE.Vector3
  ): void {
    if (enemy.huskCollapsed) return;

    let mult = 1.0;
    let isCrit = false;

    if (zone === 'head') {
      mult = 1.75;
      isCrit = true;
      if (enemy.type === 'crawler' || enemy.type === 'stalker' || enemy.type === 'screamer') {
        enemy.stunTimer = Math.max(enemy.stunTimer, 0.16);
      }
    } else if (zone === 'neck') {
      mult = 1.38;
      isCrit = true;
    } else if (zone === 'hollow_dweller') {
      mult = enemy.hollowExposed ? 2.4 : 0.45;
      isCrit = enemy.hollowExposed;
    } else if (zone === 'chest_armor' && (enemy.type === 'titanforged' || enemy.type === 'forgemaster')) {
      mult = enemy.hollowExposed ? 1.25 : 0.78;
    } else if (zone === 'armor' || zone === 'arm_armor') {
      mult = 0.72;
    } else if (zone === 'leg') {
      mult = 0.88;
      if (!enemy.legDamaged) {
        enemy.legDamaged = true;
        enemy.speed *= 0.68;
      }
    }

    // Drowned Machine takes reduced damage while water basin is still flooded!
    if (enemy.type === 'drowned_machine' && this.inWater) {
      mult *= 0.65;
    }

    const finalDmg = Math.max(1, Math.round(baseDamage * mult));
    const lateralOffset =
      (hitPoint.x - enemy.position.x) * Math.cos(enemy.yaw) -
      (hitPoint.z - enemy.position.z) * Math.sin(enemy.yaw);
    if (enemy.neckState && (zone === 'neck' || zone === 'head')) {
      triggerNeckDamageReaction(enemy.neckState, finalDmg / Math.max(1, enemy.maxHealth), lateralOffset);
      this.fireSystem.spawnBurst(hitPoint, true, 12);
    }
    triggerMonsterStagger(enemy.anim, zone, lateralOffset, isCrit || finalDmg > 25);
    enemy.hurtTwitchTimer = isCrit ? 0.55 : 0.35;
    enemy.health = Math.max(0, enemy.health - finalDmg);
    enemy.hitFlashTimer = 0.1;
    this.hitMarkerTimer = 0.16;
    this.hitMarkerCrit = isCrit;
    this.audio.playHitMarker(isCrit);

    if (enemy.health > 0) {
      const distDmg = enemy.position.distanceTo(this.camera.position);
      const dxD = enemy.position.x - this.camera.position.x;
      const dzD = enemy.position.z - this.camera.position.z;
      const panD = THREE.MathUtils.clamp((dxD * Math.cos(this.playerYaw) - dzD * Math.sin(this.playerYaw)) / (distDmg || 1), -1, 1);
      this.audio.playMonsterVocal(enemy.type, 'damage', distDmg, panD, 0);
      enemy.vocalTimer = Math.max(enemy.vocalTimer, 0.48);
    } else {
      enemy.vocalTimer = Math.max(enemy.vocalTimer, 0.9);
    }

    if (enemy.state === 'PATROL' || enemy.state === 'SEARCH' || enemy.state === 'HIDING') {
      enemy.state = 'CHASE';
      enemy.lastKnownPlayerPos.copy(this.playerPos);
    }

    // Physical Destructible Armor Shedding
    const hpRatio = enemy.health / enemy.maxHealth;
    if (enemy.refs.destructibleArmor.length > 0) {
      let brokeAny = false;
      enemy.refs.destructibleArmor.forEach((da) => {
        if (!da.broken && hpRatio <= da.hpThreshold) {
          da.broken = true;
          da.mesh.visible = false;
          brokeAny = true;
        }
      });
      if (brokeAny) {
        this.spawnImpactParticles(hitPoint, 0xf59e0b, 14);
        this.audio.playArmorShatter(enemy.position.distanceTo(this.playerPos), 0);
      }
    }

    // Carrier / Broodmind Spawn Release below 55% HP
    if ((enemy.type === 'carrier' || enemy.type === 'broodmind') && !enemy.broodReleased && hpRatio <= 0.55) {
      enemy.broodReleased = true;
      if (enemy.refs.carrierSac) enemy.refs.carrierSac.scale.multiplyScalar(0.75);
      this.spawnImpactParticles(enemy.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xef4444, 14);
      this.spawnRuntimeEnemy('crawler', enemy.position.clone().add(new THREE.Vector3(-1.1, 0, 0.8)));
      this.spawnRuntimeEnemy('crawler', enemy.position.clone().add(new THREE.Vector3(1.1, 0, 0.8)));
      this.showRadio('BIOMETRIC ALERT', `${enemy.type === 'broodmind' ? 'Broodmind' : 'Carrier'} ruptured — bio-crawlers emerging!`);
    }

    // TITANFORGED Multi-Phase Transitions
    if (enemy.type === 'titanforged') {
      if (hpRatio <= 0.75 && enemy.bossPhase < 2) {
        enemy.bossPhase = 2;
        this.audio.setBossPhase(2);
        this.setBossWarning('PHASE 2 — SHOULDER ARMOR SHATTERED', 2.2);
        if (enemy.refs.armParts) {
          enemy.refs.armParts.forEach((part, idx) => {
            if (idx % 2 === 0) part.visible = false;
          });
        }
        this.spawnImpactParticles(enemy.position.clone().add(new THREE.Vector3(0, 5.0, 0)), 0xf59e0b, 18);
        this.showRadio('COMBAT SCANNER', 'TITANFORGED Phase 2: Outer shoulder armor shattered! Target the Blood Worm Head!');
        this.audio.playEnemyRoar(6, true, 0);
        if (enemy.neckState) enemy.neckState.roarTimer = 1.4;
      }
      if (hpRatio <= 0.5 && !enemy.armArmorBroken) {
        enemy.armArmorBroken = true;
        enemy.bossPhase = 3;
        this.audio.setBossPhase(3);
        this.setBossWarning('PHASE 3 — THE HOLLOW EXPOSED', 2.6);
        enemy.hollowExposed = true;
        if (enemy.refs.chestHatchLeft) enemy.refs.chestHatchLeft.rotation.y = -1.35;
        if (enemy.refs.chestHatchRight) enemy.refs.chestHatchRight.rotation.y = 1.35;
        if (enemy.refs.hollowCavity) enemy.refs.hollowCavity.visible = true;
        if (enemy.neckState) enemy.neckState.roarTimer = 1.7;
        this.showRadio(
          'HELIOS BIOMETRIC ALERT',
          'THE HOLLOW IS OPEN! The Titanforged is only armor—something is inside its chest!'
        );
        this.audio.playEnemyRoar(4, true);
      }
      if (hpRatio <= 0.35 && !enemy.dwellerEmerged) {
        enemy.dwellerEmerged = true;
        enemy.bossPhase = 4;
        this.audio.setBossPhase(4);
        this.setBossWarning('PHASE 4 — THE HOLLOW DWELLER DETACHED!', 2.8);
        enemy.huskCollapsed = true;
        if (enemy.refs.hollowDweller) enemy.refs.hollowDweller.visible = false;
        this.spawnImpactParticles(enemy.position.clone().add(new THREE.Vector3(0, 4.0, 1.2)), 0xef4444, 24);
        this.audio.playTitanMechShutdown(enemy.position.distanceTo(this.playerPos), 0);
        this.audio.playHollowFrenzyShriek(6, 0);
        const emergePos = enemy.position.clone().add(new THREE.Vector3(0, 0, 3.2));
        this.spawnRuntimeEnemy('hollow_dweller', emergePos, Math.max(280, enemy.health));
        this.showRadio(
          'CRITICAL BREACH',
          'THE HOLLOW DWELLER HAS DETACHED FROM THE HUSK! Destroy the parasitic core creature!'
        );
      }
    }

    if (enemy.isBoss && enemy.type !== 'titanforged' && enemy.type !== 'hollow_dweller' && hpRatio <= 0.5 && enemy.bossPhase < 2) {
      enemy.bossPhase = 2;
      enemy.speed *= 1.18;
      this.audio.setBossPhase(2);
      this.audio.playEnemyRoar(5, true, 0);
      this.showRadio('BOSS PHASE 2', `${BOSS_DISPLAY_NAMES[enemy.type]?.name ?? 'HOSTILE TITAN'} entered rage phase!`);
    }

    if (enemy.type === 'hollow_dweller' && hpRatio <= 0.4 && enemy.bossPhase < 5) {
      enemy.bossPhase = 5;
      enemy.speed = 8.0;
      this.audio.setBossPhase(5);
      this.setBossWarning('FINAL PHASE — HOLLOW FRENZY!', 2.6);
      this.audio.playHollowFrenzyShriek(enemy.position.distanceTo(this.playerPos), 0);
      this.showRadio('CRITICAL', 'FINAL PHASE — THE HOLLOW DWELLER IS FRANTIC!');
    }

    if (enemy.health <= 0 && enemy.state !== 'DEAD') {
      enemy.state = 'DEAD';
      this.enemiesDefeated += 1;
      this.campaign.totalKills += 1;
      const distKill = enemy.position.distanceTo(this.camera.position);
      const dxK = enemy.position.x - this.camera.position.x;
      const dzK = enemy.position.z - this.camera.position.z;
      const panK = THREE.MathUtils.clamp((dxK * Math.cos(this.playerYaw) - dzK * Math.sin(this.playerYaw)) / (distKill || 1), -1, 1);
      this.spawnImpactParticles(hitPoint, 0xdc2626, 16);
      this.audio.playMonsterVocal(enemy.type, 'death', distKill, panK, 0);
      if (enemy.type === 'titanforged') {
        this.audio.playTitanMechShutdown(distKill, panK);
      }

      // Salvage Core drops
      let salvageDrop = 0;
      if (enemy.isBoss) {
        salvageDrop = 3;
      } else if (
        enemy.type === 'scrapper' ||
        enemy.type === 'watcher' ||
        enemy.type === 'hunter' ||
        enemy.type === 'broodmind' ||
        enemy.type === 'void_walker' ||
        enemy.type === 'sentinel' ||
        enemy.type === 'carrier' ||
        enemy.type === 'brute_enemy'
      ) {
        salvageDrop = 1;
      } else if (this.enemiesDefeated % 3 === 0) {
        salvageDrop = 1;
      }
      if (salvageDrop > 0) {
        this.campaign.salvageCores += salvageDrop;
        this.salvageEarnedInLevel += salvageDrop;
        this.syncCampaignToStorage();
      }

      if ((enemy.type === 'carrier' || enemy.type === 'broodmind') && !enemy.broodReleased) {
        enemy.broodReleased = true;
        this.spawnRuntimeEnemy('crawler', enemy.position.clone().add(new THREE.Vector3(0.8, 0, 0.5)));
      }

      // Boss defeats per mission
      if (this.missionId === 'mission_crucible' && (enemy.type === 'titanforged' || enemy.type === 'hollow_dweller')) {
        this.audio.setBossMusic(false);
        this.missionEnded = true;
        this.completeCurrentMissionInCampaign();
        window.setTimeout(() => {
          this.callbacks.onMissionComplete(
            'THE TITANFORGED FELLED',
            'You shattered the armored shell and destroyed the Hollow Dweller tethered within.',
            this.buildChapterStats()
          );
        }, 1400);
        return;
      }

      if (enemy.isBoss && this.missionId !== 'mission_crucible') {
        this.audio.setBossMusic(false);
        if (this.missionId === 'mission_12') {
          if (this.forgeHitsCount < 6) {
            this.campaign.secretEndingUnlocked = true;
            this.syncCampaignToStorage();
            this.showRadio('ANOMALOUS SIGNAL', 'YOU HAVE DISCOVERED SOMETHING THAT WAS NEVER MEANT TO BE FOUND.');
            window.setTimeout(() => {
              this.showRadio('COSMIC TELEMETRY', 'AN UNEXPECTED SIGNAL HAS BEEN DETECTED BEYOND THE STARS.');
            }, 3200);
          }
          this.missionStage = 2;
          this.objectiveTitle = 'ACCESS MASTER HELIOS CONTROL SPIRE';
          this.objectiveDetail = 'Proceed north to the Control Spire (0, -94) to decide the fate of HELIOS.';
          this.objectiveTarget = { x: 0, z: -94 };
          this.showRadio('THE ORIGIN SHATTERED', 'Master HELIOS Control Spire unlocked ahead! (+3 Salvage Cores)');
        } else {
          this.missionStage = 2;
          const exitObj = this.world.interactables.find((i) => i.kind === 'level_exit');
          this.objectiveTitle = 'PROCEED TO NEXT SECTOR';
          this.objectiveDetail = `${BOSS_DISPLAY_NAMES[enemy.type]?.name ?? 'BOSS'} eliminated! Proceed to the exit gate (+3 Salvage Cores).`;
          if (exitObj) {
            this.objectiveTarget = { x: exitObj.position.x, z: exitObj.position.z };
          }
          this.showRadio('BOSS NEUTRALIZED', 'Sector exit unlocked. Advance to the extraction airlock!');
        }
      } else if (enemy.ambushTag === 'terminal_ambush') {
        const remainingAmbush = this.enemies.some(
          (e) => e.ambushTag === 'terminal_ambush' && e.state !== 'DEAD'
        );
        if (!remainingAmbush && this.missionStage === 3) {
          this.advanceMissionStage(4);
        }
      }
    }
  }

  private spawnImpactParticles(origin: THREE.Vector3, color: number, count: number): void {
    const mat = new THREE.MeshBasicMaterial({ color });
    mat.userData.activeParticles = count;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sharedParticleGeo, mat);
      mesh.position.copy(origin);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 7,
          Math.random() * 5,
          (Math.random() - 0.5) * 7
        ),
        life: 0.45 + Math.random() * 0.25,
      });
    }
  }

  private spawnTracerBeam(start: THREE.Vector3, end: THREE.Vector3, color: number): void {
    const dist = start.distanceTo(end);
    if (dist < 0.3) return;
    const len = Math.min(dist, 42);
    const geo = new THREE.CylinderGeometry(0.012, 0.018, len, 5);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const dir = end.clone().sub(start).normalize();
    mesh.position.copy(start).addScaledVector(dir, len * 0.5);
    mesh.lookAt(end);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.075, maxLife: 0.075 });
  }

  private findClosestInteractable(): InteractableObject | null {
    let best: InteractableObject | null = null;
    let bestScore = Infinity;
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(_dir);

    for (const item of this.world.interactables) {
      if (item.consumed || !item.mesh.visible) continue;
      const dist = item.position.distanceTo(this.playerPos);
      if (dist > item.radius + 0.9) continue;
      _vec3A.copy(item.position).sub(this.camera.position).normalize();
      const dot = _vec3A.dot(_dir);
      const minDot = dist < 2.4 ? 0.15 : 0.42;
      if (dot > minDot) {
        const score = dist / Math.max(0.25, dot);
        if (score < bestScore) {
          best = item;
          bestScore = score;
        }
      }
    }
    return best;
  }

  private openPuzzleModal(puzzleId: string, target: InteractableObject): void {
    if (!PUZZLES[puzzleId]) return;
    this.activePuzzleId = puzzleId;
    this.activePuzzleTarget = target;
    this.keys = {};
    this.setPaused(true);
    this.pushHud(true);
  }

  private checkLevel4Progression(): void {
    const hasTransport = this.activatedInteractables.has('l4_transport');
    const hasComms = this.solvedPuzzles.has('puz_04_comms');
    const count = (hasTransport ? 1 : 0) + (hasComms ? 1 : 0);
    this.subObjectiveProgress = `OBJECTIVES: ${count} / 2`;
    if (hasTransport && hasComms) {
      this.missionStage = 2;
      this.objectiveTitle = 'REACH HIGHWAY 9 EXTRACTION';
      this.objectiveDetail = 'Both systems online! Proceed north to the Iron Factory tunnel (0, -96).';
      this.objectiveTarget = { x: 0, z: -96 };
      this.subObjectiveProgress = null;
      this.showRadio('EVAC ROUTE CLEAR', 'Transport and comms tower active. Move to the Iron Factory access gate!');
    } else if (hasTransport) {
      this.missionStage = 1;
      this.objectiveTarget = { x: 18, z: -74 };
    } else if (hasComms) {
      this.missionStage = 1;
      this.objectiveTarget = { x: -20, z: -68 };
    }
  }

  private tryInteract(): void {
    const target = this.findClosestInteractable();
    if (!target) return;
    this.audio.playClick(true);

    const isLootContainer =
      target.kind === 'medkit' ||
      target.kind === 'ammo' ||
      target.kind === 'battery' ||
      target.kind === 'secret_cache';

    if (isLootContainer) {
      if (target.hasTheBook === undefined) {
        target.hasTheBook = Math.random() < 0.3; // 30% random spawn chance for 'The Book'
      }
      if (target.hasTheBook && !target.bookCollected) {
        target.bookCollected = true;
        const sprintKeyActive = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
        if (sprintKeyActive) {
          // Trigger immediate, high-intensity jumpscare sequence using existing audio and visual systems
          this.audio.playScreamerShriek(1.5, 0);
          this.audio.playSilhouetteStinger();
          this.audio.playEnemyRoar(2, true, 0);
          this.damageFlash = 0.95;
          this.shakeIntensity = Math.max(this.shakeIntensity, 0.09);
          this.showRadio('THE BOOK DISCOVERED', 'ANOMALOUS CODEX RECOVERED — IT SAW YOU RUNNING.');
        } else {
          this.showRadio('THE BOOK DISCOVERED', 'Anomalous codex "The Book" recovered from loot container.');
        }
        if (!this.collectedLoreIds.includes('doc_the_book')) {
          this.collectedLoreIds.push('doc_the_book');
          this.levelDocsFound += 1;
          this.callbacks.onLoreCollected('doc_the_book');
        }
        if (!this.inventory.some((i) => i.id === 'the_book')) {
          this.inventory.push({
            id: 'the_book',
            name: 'THE BOOK',
            kind: 'intel',
            description: 'An anomalous codex bound in cold metallic leather. Found inside a loot container.',
            quantity: 1,
          });
        }
        this.syncCampaignToStorage();
      }
    }

    if (target.kind === 'apc_hatch') {
      target.consumed = true;
      this.apcOpenAnim = 0.01;
      if (this.world.apcColliderIndex !== undefined) {
        this.world.colliders[this.world.apcColliderIndex].maxY = -10;
      }
      this.navGrid?.rebuild(this.world.colliders, this.world.destructibleBarricades);
      this.soundBus.emit(target.position.x, target.position.y, target.position.z, 24, 'door_open', this.elapsedSeconds);
      this.advanceMissionStage(1);
      this.pushHud(true);
      return;
    }

    if (target.kind === 'medkit') {
      target.consumed = true;
      target.mesh.visible = false;
      if (this.health < this.maxHealth) {
        this.health = Math.min(this.maxHealth, this.health + 35);
      } else {
        this.medkits += 1;
      }
      this.syncInventoryList();
      this.syncCampaignToStorage();
      return;
    }

    if (target.kind === 'ammo') {
      target.consumed = true;
      target.mesh.visible = false;
      this.weaponStates.forEach((ws) => {
        const def = getUpgradedWeaponStats(ws.id, this.campaign.weaponUpgrades[ws.id]);
        ws.reserveAmmo = Math.min(def.reserveMax, ws.reserveAmmo + def.magSize * 2);
      });
      this.syncCampaignToStorage();
      return;
    }

    if (target.kind === 'battery') {
      target.consumed = true;
      target.mesh.visible = false;
      this.flashlightBattery = 100;
      return;
    }

    if (target.kind === 'keycard') {
      target.consumed = true;
      target.mesh.visible = false;
      this.keycards.push('CHECKPOINT_KEYCARD');
      this.activatedInteractables.add(target.id);
      this.syncInventoryList();
      this.showRadio('KEY ACQUIRED', 'Access keycard secured. Proceed to the power / gate override.');
      return;
    }

    if (target.kind === 'portal_gun') {
      target.consumed = true;
      target.mesh.visible = false;
      this.campaign.portalGunUnlocked = true;
      this.ensurePortalRig();
      this.switchWeapon(2);
      this.audio.playPortalUpgrade();
      this.portalToast = {
        title: 'APERTURE HANDHELD PORTAL DEVICE ACQUIRED',
        subtitle: 'LMB: Blue Portal  ·  RMB: Orange Portal  ·  [3] Equip  ·  [G] Clear',
        timer: 6.5,
      };
      this.showRadio(
        'APERTURE FIELD CACHE',
        'Aperture Science Handheld Portal Device synced to Slot [3]. Left-Click fires Blue, Right-Click fires Orange!'
      );
      this.syncCampaignToStorage();
      this.syncInventoryList();
      this.pushHud(true);
      return;
    }

    if (target.kind === 'portal_upgrade' && target.portalUpgradeId) {
      target.consumed = true;
      target.mesh.visible = false;
      const upgDef = PORTAL_UPGRADE_MAP[target.portalUpgradeId];
      if (!this.campaign.portalUpgrades.includes(target.portalUpgradeId)) {
        this.campaign.portalUpgrades.push(target.portalUpgradeId);
      }
      this.audio.playPortalUpgrade();
      this.portalToast = {
        title: `PORTAL UPGRADE: ${upgDef?.name.toUpperCase() ?? target.portalUpgradeId}`,
        subtitle: upgDef?.description ?? 'Aperture module integrated.',
        timer: 6.2,
      };
      this.showRadio(
        'APERTURE UPGRADE INSTALLED',
        `${upgDef?.name ?? 'Module'}: ${upgDef?.description ?? ''}`
      );
      this.syncCampaignToStorage();
      this.syncInventoryList();
      this.pushHud(true);
      return;
    }

    if (target.kind === 'educational_scan' && target.educationId) {
      // Keep the 3D object visible and persistent in the world; mark scanned for beacon clearing
      target.consumed = false;
      target.scannedOnce = true;
      target.mesh.visible = true;
      const ringMesh = target.mesh.userData?.ringMesh as THREE.Mesh | undefined;
      if (ringMesh && ringMesh.material instanceof THREE.MeshBasicMaterial) {
        ringMesh.material.color.setHex(0x38bdf8);
        ringMesh.material.opacity = 0.25;
      }
      this.setEducationModalOpen(target.educationId);
      this.callbacks.onOpenEducation?.(target.educationId);
      return;
    }

    if (target.kind === 'lore' && target.loreId) {
      target.consumed = true;
      target.mesh.visible = false;
      if (!this.collectedLoreIds.includes(target.loreId)) {
        this.collectedLoreIds.push(target.loreId);
        this.levelDocsFound += 1;
        this.callbacks.onLoreCollected(target.loreId);
      } else {
        this.levelDocsFound += 1;
      }
      this.syncCampaignToStorage();
      const entry = LORE_ENTRIES[target.loreId];
      if (entry) this.showRadio(entry.title, entry.content.slice(0, 145) + '...');

      if (this.missionId === 'mission_11' && target.loreId === 'doc_signal_truth') {
        this.missionStage = 2;
        this.objectiveTitle = 'BOARD DROP POD TO CHAMBER ZERO';
        this.objectiveDetail = 'Signal origin uncovered! Proceed to the orbital drop pod (0, -90).';
        this.objectiveTarget = { x: 0, z: -90 };
      }
      this.pushHud(true);
      return;
    }

    if (target.kind === 'puzzle' || (target.kind === 'generator' && target.puzzleId)) {
      if (target.puzzleId && !this.solvedPuzzles.has(target.puzzleId)) {
        this.openPuzzleModal(target.puzzleId, target);
        return;
      }
    }

    if (target.kind === 'generator') {
      target.consumed = true;
      this.powerRestored = true;
      this.soundBus.emit(target.position.x, target.position.y, target.position.z, 38, 'generator_on', this.elapsedSeconds);
      if (this.world.powerCableMesh) {
        const mat = this.world.powerCableMesh.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(0x22c55e);
        mat.emissiveIntensity = 1.6;
      }
      this.showRadio('GRID RESTORED', 'Auxiliary power routed to Checkpoint Kestrel Gate.');
      this.audio.playAlarmBeep();
      this.objectiveTitle = 'UNLOCK CHECKPOINT GATE';
      this.objectiveDetail = 'Return to the Checkpoint Override Panel (6.4, -27) to open the blast gate.';
      this.objectiveTarget = { x: 6.4, z: -26.8 };
      return;
    }

    if (target.kind === 'save_point') {
      this.saveCheckpoint(target.id);
      this.audio.playSaveChime();
      this.showRadio('FIELD TERMINAL', 'Progress & Armory inventory saved to local databank.');
      this.pushHud(true);
      return;
    }

    if (target.kind === 'workbench') {
      this.syncCampaignToStorage();
      this.workbenchOpen = true;
      this.setPaused(true);
      this.pushHud(true);
      return;
    }

    if (target.kind === 'secret_cache') {
      target.consumed = true;
      target.mesh.visible = false;
      const reward = this.missionId === 'mission_12' ? 3 : 2;
      this.campaign.salvageCores += reward;
      this.salvageEarnedInLevel += reward;
      this.levelSecretsFound += 1;
      if (target.secretId && !this.campaign.secretsFoundIds.includes(target.secretId)) {
        this.campaign.secretsFoundIds.push(target.secretId);
      }
      this.secretToast = {
        title: target.secretTitle || 'HIDDEN SUPPLY CACHE',
        salvage: reward,
        timer: 4.5,
      };
      this.audio.playPuzzleSolve();
      this.syncCampaignToStorage();
      this.pushHud(true);
      return;
    }

    if (target.kind === 'vent_valve') {
      target.consumed = true;
      this.activatedInteractables.add(target.id);
      this.audio.playDoorHydraulicOpen();
      this.showRadio('VENTILATION RESTORED', 'Turbine B-2 active! Spore haze clearing across the sub-level.');
      this.objectiveTarget = { x: -20, z: -24 };
      return;
    }

    if (target.kind === 'research_drive') {
      target.consumed = true;
      target.mesh.visible = false;
      this.activatedInteractables.add(target.id);
      this.drivesCollected += 1;
      this.subObjectiveProgress = `DRIVES: ${this.drivesCollected} / 3`;
      this.showRadio('DATA RECOVERED', `Research Drive ${this.drivesCollected}/3 secured.`);
      if (target.id === 'l3_drive_3') {
        this.audio.playEnemyRoar(6, true);
        this.showRadio('CONTAINMENT BREACH!', 'Containment cylinder ruptured! Watchers & Scrappers converging!');
        this.enemies.forEach((e) => {
          if (e.ambushTag === 'genesis_breach') {
            e.active = true;
            e.refs.group.visible = true;
            e.state = 'CHASE';
          }
        });
      }
      if (this.drivesCollected >= 3) {
        this.missionStage = 1;
        this.objectiveTitle = 'UNLOCK CENTRAL LABORATORY';
        this.objectiveDetail = 'All 3 drives recovered! Solve the Central Lab Cipher (-5.2, -64.2).';
        this.objectiveTarget = { x: -5.2, z: -64.2 };
      }
      return;
    }

    if (target.kind === 'transport_console') {
      target.consumed = true;
      this.activatedInteractables.add(target.id);
      this.audio.playAlarmBeep();
      this.showRadio('TRANSPORT SECURED', 'Military transport unlocked and ready near Highway 9.');
      this.checkLevel4Progression();
      return;
    }

    if (target.kind === 'hazard_switch') {
      target.consumed = true;
      this.activatedInteractables.add(target.id);
      this.audio.playMachineCrusher();
      this.shakeIntensity = Math.max(this.shakeIntensity, 0.04);
      const boss = this.enemies.find((e) => e.type === 'forgemaster' && e.state !== 'DEAD');
      if (boss) {
        boss.stunTimer = 3.5;
        boss.state = 'STUNNED';
        const purgeDmg = Math.round(boss.maxHealth * 0.24);
        this.fireSystem.spawnBurst(boss.position.clone().add(new THREE.Vector3(0, 3, 0)), false, 30);
        this.damageEnemy(boss, purgeDmg, 'head', boss.position.clone().add(new THREE.Vector3(0, 3, 0)));
        this.showRadio('CRUCIBLE PURGE!', 'Superheated slag flooded THE FORGEMASTER—armor melted & stunned for 3.5s!');
      } else {
        this.showRadio('CRUCIBLE PURGE!', 'Molten slag purge discharged across the foundry deck.');
      }
      return;
    }

    if (target.kind === 'pump_switch') {
      if (!this.solvedPuzzles.has('puz_07_pump')) {
        this.showRadio('PUMPS UNPOWERED', 'Solve the Sump Flow Equation (-12, 8) before draining the bays.');
        return;
      }
      target.consumed = true;
      this.activatedInteractables.add(target.id);
      this.pumpsDrained += 1;
      this.audio.playWaterDrain();
      if (target.waterSectionId) {
        const ws = this.world.waterSections?.find((w) => w.state.id === target.waterSectionId);
        if (ws) ws.state.targetY = ws.state.drainedY;
      }
      this.subObjectiveProgress = `BAYS DRAINED: ${this.pumpsDrained} / 3`;
      this.showRadio('SUMP PUMP ACTIVE', `Bay drained (${this.pumpsDrained}/3). Water levels dropping.`);
      if (this.pumpsDrained >= 3) {
        this.missionStage = 1;
        this.subObjectiveProgress = null;
        this.objectiveTitle = 'DEFEAT THE DROWNED MACHINE';
        this.objectiveDetail = 'All bays drained! Hidden Hydrology Chamber unmasked on East flank; neutralize THE DROWNED MACHINE.';
        this.objectiveTarget = { x: 0, z: -76 };
        this.audio.setBossMusic(true);
      }
      return;
    }

    if (target.kind === 'comm_relay') {
      target.consumed = true;
      this.audio.playRadioStatic();
      if (target.loreId && !this.collectedLoreIds.includes(target.loreId)) {
        this.collectedLoreIds.push(target.loreId);
        this.levelDocsFound += 1;
        this.callbacks.onLoreCollected(target.loreId);
      }
      this.syncCampaignToStorage();
      this.showRadio('DEAD RELAY 04', '"The Choir rerouted the grid into HELIOS... DO NOT LET THEM HEAR YOU."');
      return;
    }

    if (target.kind === 'locked_container') {
      const canOpen = this.keycards.includes('CHECKPOINT_KEYCARD') || this.characterId === 'nyx';
      if (!canOpen) {
        this.showRadio('CONTAINER LOCKED', 'Requires Checkpoint Keycard or Combat Engineer bypass.');
        return;
      }
      target.consumed = true;
      target.mesh.scale.y = 0.45;
      this.medkits += 1;
      this.weaponStates.forEach((ws) => {
        const def = getUpgradedWeaponStats(ws.id, this.campaign.weaponUpgrades[ws.id]);
        ws.reserveAmmo = Math.min(def.reserveMax, ws.reserveAmmo + def.magSize * 2);
      });
      if (target.loreId && !this.collectedLoreIds.includes(target.loreId)) {
        this.collectedLoreIds.push(target.loreId);
        this.levelDocsFound += 1;
        this.callbacks.onLoreCollected(target.loreId);
      }
      this.syncInventoryList();
      this.syncCampaignToStorage();
      this.showRadio('SCRAPBORN CACHE OPENED', 'Recovered +1 Medkit, ammunition magazines, and Scrapborn manifest.');
      return;
    }

    if (target.kind === 'gate_panel') {
      const canBypass = this.characterId === 'nyx';
      if (this.missionId === 'mission_02') {
        if (!this.activatedInteractables.has('l2_vent_valve')) {
          this.showRadio('VENTILATION LOCK', 'Restore Turbine B-2 (-20, -6) before opening the north blast door.');
          return;
        }
        if (!this.solvedPuzzles.has('puz_02_elec') && !canBypass) {
          this.showRadio('GRID UNCALIBRATED', 'Solve the Electrical Relay Puzzle (-20, -24) first.');
          return;
        }
        if (!this.keycards.includes('CHECKPOINT_KEYCARD') && !canBypass) {
          this.showRadio('KEY REQUIRED', 'Recover the Maintenance Access Key from the East Room (20, -8).');
          return;
        }
        target.consumed = true;
        if (target.doorId) this.openDynamicDoor(target.doorId);
        this.missionStage = 2;
        this.objectiveTitle = 'ENTER PROJECT GENESIS';
        this.objectiveDetail = 'Blast door unlocked! Proceed north to the laboratory lift (0, -88).';
        this.objectiveTarget = { x: 0, z: -88 };
        this.saveCheckpoint('l2_blast_gate');
        return;
      }

      if (!this.powerRestored && !canBypass) {
        this.showRadio('LOCKED — NO POWER', 'Follow the red power cable up the west ramp to restore generator power.');
        return;
      }
      if (!this.keycards.includes('CHECKPOINT_KEYCARD') && !canBypass) {
        this.showRadio('ACCESS DENIED', 'Checkpoint Keycard required. Check the east guard booth.');
        return;
      }
      target.consumed = true;
      this.gateUnlocked = true;
      this.gateOpenAnim = 0.01;
      if (this.world.gateColliderIndex !== undefined) {
        this.world.colliders[this.world.gateColliderIndex].maxY = -10;
      }
      this.navGrid?.rebuild(this.world.colliders, this.world.destructibleBarricades);
      this.soundBus.emit(target.position.x, target.position.y, target.position.z, 26, 'door_open', this.elapsedSeconds);
      this.advanceMissionStage(2);
      this.saveCheckpoint('checkpoint_gate');
      return;
    }

    if (target.kind === 'terminal') {
      target.consumed = true;
      this.terminalAccessed = true;
      this.advanceMissionStage(3);
      this.saveCheckpoint('helios_terminal');
      return;
    }

    if (target.kind === 'final_recording') {
      target.consumed = true;
      target.mesh.visible = false;
      if (!this.collectedLoreIds.includes('audio_sentinel_blackbox')) {
        this.collectedLoreIds.push('audio_sentinel_blackbox');
        this.levelDocsFound += 1;
        this.callbacks.onLoreCollected('audio_sentinel_blackbox');
      }
      this.advanceMissionStage(5);
      return;
    }

    if (target.kind === 'level_exit') {
      const req = target.stageReq ?? 1;
      if (this.missionStage < req) {
        this.showRadio('EXIT SEALED', 'Complete the current sector objective before descending.');
        return;
      }
      target.consumed = true;
      this.missionEnded = true;
      this.audio.setBossMusic(false);
      this.audio.playDoorHydraulicOpen();
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
      this.completeCurrentMissionInCampaign();
      const stats = this.buildChapterStats();
      this.callbacks.onMissionComplete(
        `${this.missionDef.title} CLEARED`,
        `Operative ${CHARACTERS[this.characterId].callsign} secured the extraction route (+${this.missionDef.isBossMission ? 3 : 2} Bonus Salvage Cores).`,
        stats
      );
      return;
    }

    if (target.kind === 'ending_console') {
      const req = target.stageReq ?? 2;
      if (this.missionStage < req) {
        this.showRadio('SPIRE LOCKED', 'Neutralize THE ORIGIN before accessing the Master HELIOS Control Spire.');
        return;
      }
      this.endingChoiceOpen = true;
      this.setPaused(true);
      this.pushHud(true);
      return;
    }

    this.pushHud(true);
  }

  private completeCurrentMissionInCampaign(): void {
    const bonus = this.missionDef.isBossMission ? 3 : 2;
    this.campaign.salvageCores += bonus;
    this.salvageEarnedInLevel += bonus;
    if (!this.campaign.completedMissionIds.includes(this.missionId)) {
      this.campaign.completedMissionIds.push(this.missionId);
    }
    if (!this.missionDef.isBonusArena && this.missionDef.number >= this.campaign.unlockedLevel) {
      this.campaign.unlockedLevel = Math.min(12, this.missionDef.number + 1);
    }
    this.syncCampaignToStorage();
  }

  private buildChapterStats(): ChapterStats {
    return {
      missionId: this.missionId,
      missionNumber: this.missionDef.number,
      missionTitle: this.missionDef.title,
      enemiesDefeated: this.enemiesDefeated,
      elapsedSeconds: Math.floor(this.elapsedSeconds),
      salvageEarned: this.salvageEarnedInLevel,
      docsFound: this.levelDocsFound,
      docsTotal: this.missionDef.docCount,
      secretsFound: this.levelSecretsFound,
      secretsTotal: this.missionDef.secretCount,
    };
  }

  private advanceMissionStage(stage: number): void {
    this.missionStage = stage;
    if (stage === 1) {
      this.objectiveTitle = 'EXPLORE NEW EDEN & BREACH CHECKPOINT';
      this.objectiveDetail = 'Solve the west catwalk generator (-16, -22) and recover the Checkpoint Keycard (12.8, -14).';
      this.objectiveTarget = { x: 0, z: -26 };
      this.showRadio('RECON LOG', 'New Eden perimeter compromised. THE SCRAPPER patrols the industrial avenue.');
    } else if (stage === 2) {
      this.objectiveTitle = 'LOCATE WORKING MILITARY TERMINAL';
      this.objectiveDetail = 'Proceed north past the alien spire to the active HELIOS terminal.';
      this.objectiveTarget = { x: 0, z: -72 };
      this.showRadio('CHECKPOINT CLEARED', 'HELIOS signal strength spiking ahead. Underground hatch lies beyond the terminal.');
    } else if (stage === 3) {
      this.objectiveTitle = 'SURVIVE AMBUSH / ENTER UNDERGROUND';
      this.objectiveDetail = 'Defeat the Sentinel ambush or enter the Underground Facility hatch north of the console (0, -80).';
      this.objectiveTarget = { x: 0, z: -80.4 };
      this.showRadio('HELIOS TERMINAL', 'ALERT: HELIOS global array hijacked — deep-space beacon transmitting! HOSTILES INBOUND!');
      this.audio.playEnemyRoar(10, true);
      this.enemies.forEach((e) => {
        if (e.ambushTag === 'terminal_ambush') {
          e.active = true;
          e.refs.group.visible = true;
          e.state = 'CHASE';
        }
      });
      const bb = this.world.interactables.find((i) => i.id === 'final_blackbox');
      if (bb) bb.mesh.visible = true;
    } else if (stage === 4) {
      this.objectiveTitle = 'DESCEND INTO THE UNDERGROUND';
      this.objectiveDetail = 'Enter the Underground Facility hatch (0, -80) or inspect the HELIOS blackbox (1.8, -72).';
      this.objectiveTarget = { x: 0, z: -80.4 };
      this.showRadio('THREAT NEUTRALIZED', 'Underground Vault Hatch unlocked directly ahead!');
    } else if (stage === 5) {
      this.objectiveTitle = 'THE WORLD HAS ROTTEN';
      this.objectiveDetail = 'Something immense is moving through the ruins...';
      this.objectiveTarget = null;
      this.showRadio('BLACKBOX RECORDING', '"HELIOS was never supposed to transmit. Shut it down before—"');
      this.audio.playRadioStatic();
      this.audio.playEnemyRoar(15, true);
      if (this.world.distantTitan) {
        this.world.distantTitan.group.visible = true;
      }
      this.finaleTimer = 4.6;
    }
  }

  private syncInventoryList(): void {
    const items: InventoryItem[] = [
      {
        id: 'item_medkit',
        name: 'Tactical Medkit',
        kind: 'medkit',
        description: 'Press [H] to restore 35 Health.',
        quantity: this.medkits,
      },
      {
        id: 'item_salvage',
        name: 'Salvage Cores',
        kind: 'salvage',
        description: 'Used at Armory Workbenches to upgrade weapons & unlock new hardware.',
        quantity: this.campaign.salvageCores,
      },
    ];
    if (this.keycards.includes('CHECKPOINT_KEYCARD')) {
      items.push({
        id: 'item_keycard',
        name: 'Facility Access Keycard',
        kind: 'keycard',
        description: 'Unlocks sealed security gates and military containers.',
        quantity: 1,
      });
    }
    if (this.campaign.portalGunUnlocked) {
      items.push({
        id: 'item_portal_gun',
        name: 'Aperture Portal Device [Slot 3]',
        kind: 'salvage',
        description: `Fires linked Blue & Orange quantum portals (${this.campaign.portalUpgrades.length}/5 Aperture upgrades installed).`,
        quantity: 1 + this.campaign.portalUpgrades.length,
      });
    }
    this.inventory = items;
  }

  private disposeObject3D(root: THREE.Object3D): void {
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material?.dispose();
      }
    });
  }

  private getEnemyCollisionRadius(type: EnemyType): number {
    return type === 'titanforged' ||
      type === 'forgemaster' ||
      type === 'titan' ||
      type === 'origin' ||
      type === 'guardian'
      ? 1.4
      : type === 'hunter' ||
          type === 'brute_enemy' ||
          type === 'sentinel' ||
          type === 'drowned_machine' ||
          type === 'helios_unit'
        ? 0.85
        : 0.48;
  }

  private raycastWorldColliders(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number
  ): { dist: number; point: THREE.Vector3; normal: THREE.Vector3; colliderIndex: number } | null {
    let bestT = maxDist;
    let bestIdx = -1;
    let bestNx = 0;
    let bestNy = 0;
    let bestNz = 1;

    for (let i = 0; i < this.world.colliders.length; i++) {
      const box = this.world.colliders[i];
      if (box.maxY < 0.1) continue;

      let tmin = 0;
      let tmax = bestT;
      let hitNx = 0;
      let hitNy = 0;
      let hitNz = 0;

      // X slab
      if (Math.abs(dir.x) < 1e-6) {
        if (origin.x < box.minX || origin.x > box.maxX) continue;
      } else {
        const invX = 1 / dir.x;
        let t1 = (box.minX - origin.x) * invX;
        let t2 = (box.maxX - origin.x) * invX;
        let nx = invX > 0 ? -1 : 1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tmin) {
          tmin = t1;
          hitNx = nx;
          hitNy = 0;
          hitNz = 0;
        }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      // Y slab
      if (Math.abs(dir.y) < 1e-6) {
        if (origin.y < box.minY || origin.y > box.maxY) continue;
      } else {
        const invY = 1 / dir.y;
        let t1 = (box.minY - origin.y) * invY;
        let t2 = (box.maxY - origin.y) * invY;
        let ny = invY > 0 ? -1 : 1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tmin) {
          tmin = t1;
          hitNx = 0;
          hitNy = ny;
          hitNz = 0;
        }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      // Z slab
      if (Math.abs(dir.z) < 1e-6) {
        if (origin.z < box.minZ || origin.z > box.maxZ) continue;
      } else {
        const invZ = 1 / dir.z;
        let t1 = (box.minZ - origin.z) * invZ;
        let t2 = (box.maxZ - origin.z) * invZ;
        let nz = invZ > 0 ? -1 : 1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        if (t1 > tmin) {
          tmin = t1;
          hitNx = 0;
          hitNy = 0;
          hitNz = nz;
        }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (tmin > 0.02 && tmin < bestT && (hitNx !== 0 || hitNy !== 0 || hitNz !== 0)) {
        bestT = tmin;
        bestIdx = i;
        bestNx = hitNx;
        bestNy = hitNy;
        bestNz = hitNz;
      }
    }

    if (bestIdx < 0) return null;
    return {
      dist: bestT,
      point: new THREE.Vector3(
        origin.x + dir.x * bestT,
        origin.y + dir.y * bestT,
        origin.z + dir.z * bestT
      ),
      normal: new THREE.Vector3(bestNx, bestNy, bestNz),
      colliderIndex: bestIdx,
    };
  }

  private resolveHorizontalCollision(
    x: number,
    z: number,
    y: number,
    radius = 0.48
  ): { x: number; z: number } {
    let nx = x;
    let nz = z;
    for (let pass = 0; pass < 2; pass++) {
      for (const box of this.world.colliders) {
        if (box.maxY < 0.25) continue;
        if (y + 1.6 < box.minY || y > box.maxY) continue;
        const closestX = Math.max(box.minX, Math.min(nx, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(nz, box.maxZ));
        const dx = nx - closestX;
        const dz = nz - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq) || 0.0001;
          const overlap = radius - dist;
          nx += (dx / dist) * overlap;
          nz += (dz / dist) * overlap;
        }
      }
    }
    return { x: nx, z: nz };
  }

  private moveEnemyWithCollision(
    enemy: EnemyEntity,
    dirX: number,
    dirZ: number,
    stepDist: number
  ): void {
    const radius = this.getEnemyCollisionRadius(enemy.type);

    const tryStep = (vx: number, vz: number) => {
      const tx = enemy.position.x + vx * stepDist;
      const tz = enemy.position.z + vz * stepDist;
      const res = this.resolveHorizontalCollision(tx, tz, enemy.position.y, radius);
      const moved = Math.hypot(res.x - enemy.position.x, res.z - enemy.position.z);
      return { res, moved };
    };

    const primary = tryStep(dirX, dirZ);
    if (primary.moved >= stepDist * 0.45) {
      enemy.position.x = primary.res.x;
      enemy.position.z = primary.res.z;
      return;
    }

    // Wall / doorway avoidance steering at +/- 40 deg and +/- 75 deg
    const baseAngle = Math.atan2(dirZ, dirX);
    let best = primary;
    const offsets = [0.7, -0.7, 1.3, -1.3];
    for (const off of offsets) {
      const a = baseAngle + off;
      const cand = tryStep(Math.cos(a), Math.sin(a));
      if (cand.moved > best.moved) {
        best = cand;
      }
    }
    enemy.position.x = best.res.x;
    enemy.position.z = best.res.z;
  }

  private getSurfaceAt(x: number, z: number): SurfaceKind {
    if (this.world.waterSections) {
      for (const ws of this.world.waterSections) {
        const b = ws.state.bounds;
        if (
          ws.state.currentY > 0.2 &&
          x >= b.minX &&
          x <= b.maxX &&
          z >= b.minZ &&
          z <= b.maxZ
        ) {
          return 'water';
        }
      }
    }
    if (this.world.surfaceZones) {
      for (let i = this.world.surfaceZones.length - 1; i >= 0; i--) {
        const sz = this.world.surfaceZones[i];
        if (x >= sz.minX && x <= sz.maxX && z >= sz.minZ && z <= sz.maxZ) {
          return sz.surface;
        }
      }
    }
    for (const ramp of this.world.ramps) {
      if (x >= ramp.minX && x <= ramp.maxX && z >= ramp.minZ && z <= ramp.maxZ) {
        return 'metal';
      }
    }
    if (
      this.missionId === 'mission_03' ||
      this.missionId === 'mission_06' ||
      this.missionId === 'mission_10' ||
      this.missionId === 'mission_11'
    ) {
      return 'metal';
    }
    if (
      this.missionId === 'mission_02' ||
      this.missionId === 'mission_05' ||
      this.missionId === 'mission_07'
    ) {
      return 'industrial';
    }
    if (this.missionId === 'mission_08' || this.missionId === 'mission_12') {
      return 'dirt';
    }
    if (this.missionId === 'mission_crucible') {
      return 'gravel';
    }
    return 'concrete';
  }

  private groundHeightAt(x: number, z: number): number {
    for (const ramp of this.world.ramps) {
      if (x >= ramp.minX && x <= ramp.maxX && z >= ramp.minZ && z <= ramp.maxZ) {
        if (ramp.zStart === ramp.zEnd) return ramp.yEnd;
        const t = THREE.MathUtils.clamp((z - ramp.zStart) / (ramp.zEnd - ramp.zStart), 0, 1);
        return THREE.MathUtils.lerp(ramp.yStart, ramp.yEnd, t);
      }
    }
    if (this.missionId === 'mission_01' && Math.abs(x) < 2.0 && z > 33.8 && z < 42.0) return 0.25;
    return 0;
  }

  private damagePlayer(amount: number): void {
    if (this.isDead || this.missionEnded) return;
    const hasActiveBoss = this.enemies.some((e) => e.isBoss && e.state !== 'DEAD') || this.missionId === 'mission_12';
    if (hasActiveBoss) {
      this.forgeHitsCount += 1;
    }
    let dmg = amount;
    if (this.characterId === 'brute' && this.abilityActive) {
      dmg *= 0.35;
    }
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.6);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health = Math.max(0, this.health - dmg);
    this.damageFlash = 0.75;
    this.shakeIntensity = Math.max(this.shakeIntensity, 0.032);
    this.hurtRoll = (Math.random() > 0.5 ? 1 : -1) * 0.08;
    this.audio.playPlayerHurt();

    if (this.health <= 0 && !this.isDead) {
      this.isDead = true;
      this.deathAnimTimer = 0.01;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
      this.callbacks.onPlayerDied();
    }
  }

  private updatePlayer(dt: number): void {
    const charDef = CHARACTERS[this.characterId];
    const isCrouching = Boolean(this.keys['ControlLeft'] || this.keys['ControlRight'] || this.keys['KeyC']);
    const wantsSprint = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !isCrouching && !this.mouseDownRight;
    const isSprinting = wantsSprint && this.stamina > 5;

    // Check Zero-Gravity zones & Flooded Water sections
    let gravityScale = 1.0;
    this.inZeroG = false;
    if (this.world.gravityZones) {
      for (const gz of this.world.gravityZones) {
        if (
          this.playerPos.x >= gz.minX &&
          this.playerPos.x <= gz.maxX &&
          this.playerPos.z >= gz.minZ &&
          this.playerPos.z <= gz.maxZ
        ) {
          gravityScale = gz.gravityScale;
          this.inZeroG = true;
          break;
        }
      }
    }

    this.inWater = false;
    if (this.world.waterSections) {
      for (const ws of this.world.waterSections) {
        const b = ws.state.bounds;
        if (
          ws.state.currentY > 0.35 &&
          this.playerPos.x >= b.minX &&
          this.playerPos.x <= b.maxX &&
          this.playerPos.z >= b.minZ &&
          this.playerPos.z <= b.maxZ
        ) {
          this.inWater = true;
          break;
        }
      }
    }

    // Arrow key camera look fallback
    const keyTurn = (this.keys['ArrowLeft'] ? 1 : 0) - (this.keys['ArrowRight'] ? 1 : 0);
    const keyPitch = (this.keys['ArrowUp'] ? 1 : 0) - (this.keys['ArrowDown'] ? 1 : 0);
    if (keyTurn !== 0) this.playerYaw += keyTurn * 2.1 * dt * this.settings.mouseSensitivity;
    if (keyPitch !== 0) {
      this.playerPitch = THREE.MathUtils.clamp(
        this.playerPitch + keyPitch * 1.4 * dt * this.settings.mouseSensitivity,
        -1.45,
        1.45
      );
    }

    let moveForward = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0) - this.touchMoveVec.y;
    let moveRight = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0) + this.touchMoveVec.x;

    const len = Math.hypot(moveForward, moveRight);
    if (len > 1) {
      moveForward /= len;
      moveRight /= len;
    }

    if (isSprinting && len > 0.1) {
      this.stamina = Math.max(0, this.stamina - 22 * dt);
    } else {
      this.stamina = Math.min(100, this.stamina + 16 * dt);
    }

    if (this.portalCooldown > 0) this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    if (this.portalClawAnim > 0) this.portalClawAnim = Math.max(0, this.portalClawAnim - dt);
    if (this.tachyonBoostTimer > 0) this.tachyonBoostTimer = Math.max(0, this.tachyonBoostTimer - dt);
    if (this.tachyonArmorCooldown > 0)
      this.tachyonArmorCooldown = Math.max(0, this.tachyonArmorCooldown - dt);

    const baseSpeed = 4.2 + (charDef.stats.speed / 100) * 2.2;
    let targetSpeed = baseSpeed;
    if (isCrouching) targetSpeed *= 0.58;
    else if (isSprinting) targetSpeed *= 1.48;
    if (this.inWater) targetSpeed *= 0.72;
    if (this.characterId === 'raven' && this.abilityActive) targetSpeed *= 1.45;
    if (this.tachyonBoostTimer > 0) targetSpeed *= 1.35;

    const sinY = Math.sin(this.playerYaw);
    const cosY = Math.cos(this.playerYaw);
    const wishX = (-sinY * moveForward + cosY * moveRight) * targetSpeed;
    const wishZ = (-cosY * moveForward - sinY * moveRight) * targetSpeed;

    const accel = this.inZeroG ? 5.5 : 12;
    this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, wishX, accel, dt);
    this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, wishZ, accel, dt);
    this.knockbackVel.x = THREE.MathUtils.damp(this.knockbackVel.x, 0, 4.8, dt);
    this.knockbackVel.z = THREE.MathUtils.damp(this.knockbackVel.z, 0, 4.8, dt);

    // Gravity & Grounding
    this.playerVel.y -= 18.5 * gravityScale * dt;
    this.prevFallVelY = this.playerVel.y;
    const nextX = this.playerPos.x + (this.playerVel.x + this.knockbackVel.x) * dt;
    const nextZ = this.playerPos.z + (this.playerVel.z + this.knockbackVel.z) * dt;
    const resolved = this.resolveHorizontalCollision(nextX, nextZ, this.playerPos.y);
    this.playerPos.x = resolved.x;
    this.playerPos.z = resolved.z;

    this.playerPos.y += this.playerVel.y * dt;
    const floorY = this.groundHeightAt(this.playerPos.x, this.playerPos.z);
    if (this.playerPos.y <= floorY) {
      if (!this.grounded && this.prevFallVelY < -4) {
        this.landDip = 0.08;
        const pSurf = this.getSurfaceAt(this.playerPos.x, this.playerPos.z);
        this.audio.playFootstep(true, isCrouching);
        if (pSurf !== 'concrete') {
          this.audio.playSurfaceFootstep(pSurf, 'medium', 1.15, 2.2, 0, 0);
        }
        if (!(this.characterId === 'ghost' && this.abilityActive)) {
          this.soundBus.emit(this.playerPos.x, this.playerPos.y, this.playerPos.z, 14, 'footstep_run', this.elapsedSeconds, 'player');
        }
        this.handleLongFallLanding(-this.prevFallVelY);
      }
      this.playerPos.y = floorY;
      this.playerVel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // Aperture Portal Teleportation Check (full capsule height + generous floor/wall capture)
    if (this.portals.blue && this.portals.orange && this.portalCooldown <= 0) {
      const pairs: [ActivePortal, ActivePortal][] = [
        [this.portals.blue, this.portals.orange],
        [this.portals.orange, this.portals.blue],
      ];
      for (const [entry, exit] of pairs) {
        const footY = this.playerPos.y + 0.04;
        const headY = this.playerPos.y + 1.72;
        const clampedY = THREE.MathUtils.clamp(entry.center.y, footY, headY);
        _vec3A.set(this.playerPos.x, clampedY, this.playerPos.z);
        _vec3B.copy(_vec3A).sub(entry.center);
        const signedPlaneDist = _vec3B.dot(entry.normal);
        const planeDist = Math.abs(signedPlaneDist);
        _vec3C.copy(_vec3B).addScaledVector(entry.normal, -signedPlaneDist);
        const inPlaneDist = _vec3C.length();

        const isFloorOrCeil = Math.abs(entry.normal.y) > 0.65;
        const maxInPlane = isFloorOrCeil ? 1.38 : 1.45;
        const maxPlane = isFloorOrCeil ? 1.15 : 1.12;
        const verticalOffset = Math.abs(this.playerPos.y + 0.9 - entry.center.y);
        const verticalOk = isFloorOrCeil ? planeDist < maxPlane : verticalOffset < 1.58;

        if (inPlaneDist < maxInPlane && planeDist < maxPlane && verticalOk) {
          const inSpeed = Math.max(this.playerVel.length(), 7.2);
          const momentumBoost = this.hasPortalUpgrade('portal_momentum');
          const launchSpeed = momentumBoost
            ? THREE.MathUtils.clamp(inSpeed * 1.38, 12.0, 25.0)
            : THREE.MathUtils.clamp(inSpeed * 0.98, 6.8, 14.5);

          _portalExitPos.copy(exit.center).addScaledVector(exit.normal, 1.38);
          const outY = exit.normal.y > 0.7 ? exit.center.y + 0.28 : _portalExitPos.y - 0.95;
          const outRes = this.resolveHorizontalCollision(_portalExitPos.x, _portalExitPos.z, Math.max(0, outY));
          const exitFloor = this.groundHeightAt(outRes.x, outRes.z);
          this.playerPos.set(
            outRes.x,
            Math.max(exitFloor + (exit.normal.y > 0.7 ? 0.32 : 0.02), outY),
            outRes.z
          );

          // Rotate player yaw cleanly when passing between vertical surfaces
          if (Math.abs(entry.normal.y) < 0.65 && Math.abs(exit.normal.y) < 0.65) {
            const entryInYaw = Math.atan2(entry.normal.x, entry.normal.z);
            const exitOutYaw = Math.atan2(-exit.normal.x, -exit.normal.z);
            this.playerYaw += exitOutYaw - entryInYaw;
          }

          this.playerVel.copy(exit.normal).multiplyScalar(launchSpeed);
          if (exit.normal.y > 0.7) {
            this.playerVel.y = Math.max(this.playerVel.y, momentumBoost ? 14.0 : 9.6);
          } else if (momentumBoost) {
            this.playerVel.y = Math.max(this.playerVel.y, 4.4);
          }

          if (this.hasPortalUpgrade('portal_tachyon_core')) {
            this.tachyonBoostTimer = 3.5;
            if (this.tachyonArmorCooldown <= 0) {
              this.armor = Math.min(this.maxArmor, this.armor + 8);
              this.tachyonArmorCooldown = 6.0;
            }
          }

          this.portalCooldown = 0.32;
          this.grounded = false;
          this.damageFlash = Math.max(this.damageFlash, 0.22);
          this.audio.playPortalTransit();
          this.spawnImpactParticles(
            exit.center,
            exit.color === 'blue' ? 0x38bdf8 : 0xf97316,
            12
          );
          break;
        }
      }
    }

    // Footsteps, Acoustic Footstep Radius & Head Bob
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (this.grounded && horizSpeed > 0.6) {
      const prevStep = Math.floor(this.stepDist / 2.0);
      this.stepDist += horizSpeed * dt;
      if (Math.floor(this.stepDist / 2.0) > prevStep) {
        if (!(this.characterId === 'ghost' && this.abilityActive)) {
          const pSurf = this.getSurfaceAt(this.playerPos.x, this.playerPos.z);
          this.audio.playFootstep(isSprinting, isCrouching);
          if (pSurf !== 'concrete') {
            this.audio.playSurfaceFootstep(pSurf, 'medium', isSprinting ? 1.15 : isCrouching ? 0.45 : 0.75, 2.5, 0, 0);
          }
          if (!isCrouching) {
            this.soundBus.emit(
              this.playerPos.x,
              this.playerPos.y,
              this.playerPos.z,
              isSprinting ? 19 : 8.5,
              isSprinting ? 'footstep_run' : 'footstep_walk',
              this.elapsedSeconds,
              'player'
            );
          }
        }
      }
    }

    const standingUp = this.introWakeupTimer > 0;
    if (standingUp) {
      this.introWakeupTimer = Math.max(0, this.introWakeupTimer - dt);
    }
    const targetEye = standingUp ? 1.68 : isCrouching ? 1.02 : 1.68;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, standingUp ? 3.2 : 10, dt);
    this.landDip = THREE.MathUtils.damp(this.landDip, 0, 12, dt);
    this.hurtRoll = THREE.MathUtils.damp(this.hurtRoll, 0, 8, dt);

    this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 14, dt);
    const shakeScale = this.settings.reducedMotion ? 0.15 : 1.0;
    const shakeX = (Math.random() - 0.5) * this.shakeIntensity * shakeScale;
    const shakeY = (Math.random() - 0.5) * this.shakeIntensity * shakeScale;

    const bobAmp =
      !this.settings.reducedMotion && this.grounded
        ? Math.min(0.045, horizSpeed * 0.0065)
        : 0;
    const bobY = Math.sin(this.stepDist * 3.1) * bobAmp;
    const bobX = Math.cos(this.stepDist * 1.55) * bobAmp * 0.6;

    this.camera.position.set(
      this.playerPos.x + bobX + shakeX,
      this.playerPos.y + this.currentEyeHeight + bobY - this.landDip + shakeY,
      this.playerPos.z
    );

    const crouchTilt = isCrouching ? 0.03 : 0;
    this.camera.rotation.set(this.playerPitch, this.playerYaw, this.hurtRoll + crouchTilt, 'YXZ');

    // ADS FOV smooth damping
    const wDef = this.getActiveWeaponDef();
    const targetFov = this.mouseDownRight && this.activeSlot !== 2 ? wDef.adsFov : this.settings.fov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }

    // Update Flashlight
    if (this.flashlightOn && this.flashlightBattery > 0) {
      this.flashlightBattery = Math.max(0, this.flashlightBattery - 0.65 * dt);
      const lowFlicker = this.flashlightBattery < 15 && Math.sin(this.elapsedSeconds * 28) > 0.65 ? 0.4 : 1;
      this.flashlight.intensity = 5.5 * lowFlicker;
    } else {
      this.flashlight.intensity = 0;
    }

    this.updateFirstPersonRig(dt, horizSpeed, isSprinting);
  }

  private updateFirstPersonRig(dt: number, horizSpeed: number, isSprinting: boolean): void {
    if (!this.fpRigs) return;
    const rig = this.fpRigs[this.activeSlot] ?? this.fpRigs[0];
    const piv = rig.weaponPivot;

    if (this.fireTimer > 0) this.fireTimer -= dt;
    if (this.mouseDownLeft && this.getActiveWeaponDef().automatic) {
      this.tryShoot();
    }

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
    if (this.switchAnimTimer > 0) this.switchAnimTimer = Math.max(0, this.switchAnimTimer - dt);
    if (this.meleeAnimTimer > 0) this.meleeAnimTimer = Math.max(0, this.meleeAnimTimer - dt);
    if (this.healAnimTimer > 0) this.healAnimTimer = Math.max(0, this.healAnimTimer - dt);
    if (this.abilityAnimTimer > 0) this.abilityAnimTimer = Math.max(0, this.abilityAnimTimer - dt);

    this.recoilOffset = THREE.MathUtils.damp(this.recoilOffset, 0, 16, dt);

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      rig.muzzleFlash.visible = true;
      rig.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
      rig.muzzleLight.intensity = 6;
    } else {
      rig.muzzleFlash.visible = false;
      rig.muzzleLight.intensity = 0;
    }

    // Animate Aperture Emitter Claws & Spinning Quantum Housing on Portal Gun rig
    if (this.activeSlot === 2 && rig.portalClaws) {
      const flare = this.portalClawAnim > 0 ? Math.sin((this.portalClawAnim / 0.42) * Math.PI) * 0.36 : 0;
      rig.portalClaws.forEach((claw, idx) => {
        const idleBreath = Math.sin(this.elapsedSeconds * 3.2 + idx * 2.1) * 0.03;
        claw.rotation.x = THREE.MathUtils.damp(claw.rotation.x, -flare + idleBreath, 18, dt);
      });
      if (rig.portalRingGroup) {
        rig.portalRingGroup.rotation.z += dt * (this.portalClawAnim > 0 ? 5.2 : 0.45);
      }
      if (rig.portalIndicatorL) {
        rig.portalIndicatorL.color.setHex(this.portals.blue ? 0x38bdf8 : 0x1e3a5f);
      }
      if (rig.portalIndicatorR) {
        rig.portalIndicatorR.color.setHex(this.portals.orange ? 0xf97316 : 0x5c2d12);
      }
    }

    const breath = Math.sin(this.elapsedSeconds * 2.1) * 0.004;
    const swayX = Math.cos(this.stepDist * 1.55) * Math.min(0.018, horizSpeed * 0.0025);
    const swayY = Math.abs(Math.sin(this.stepDist * 1.55)) * Math.min(0.018, horizSpeed * 0.0025);

    const aiming = this.mouseDownRight && !this.isReloading && this.activeSlot !== 2;
    const adsX = aiming ? 0.0 : 0.2;
    const adsY = aiming ? -0.155 : -0.22;
    const adsZ = aiming ? -0.24 : -0.28;

    const reloadDip = this.isReloading ? Math.sin((this.reloadTimer / this.reloadDuration) * Math.PI) * 0.14 : 0;
    const switchDip = this.switchAnimTimer > 0 ? Math.sin((this.switchAnimTimer / 0.28) * Math.PI) * 0.2 : 0;
    const meleeThrust = this.meleeAnimTimer > 0 ? Math.sin((this.meleeAnimTimer / 0.36) * Math.PI) * 0.28 : 0;
    const sprintRot = isSprinting && !aiming ? 0.32 : 0;

    piv.position.x = THREE.MathUtils.damp(piv.position.x, adsX + swayX, 16, dt);
    piv.position.y = THREE.MathUtils.damp(
      piv.position.y,
      adsY + breath - swayY - reloadDip - switchDip - this.healAnimTimer * 0.15,
      16,
      dt
    );
    piv.position.z = THREE.MathUtils.damp(piv.position.z, adsZ + this.recoilOffset - meleeThrust, 18, dt);

    piv.rotation.x = THREE.MathUtils.damp(
      piv.rotation.x,
      this.recoilOffset * 1.4 - (this.isReloading ? 0.35 : 0) + (this.abilityAnimTimer > 0 ? 0.3 : 0),
      16,
      dt
    );
    piv.rotation.y = THREE.MathUtils.damp(piv.rotation.y, sprintRot + (this.meleeAnimTimer > 0 ? 0.6 : 0), 14, dt);

    if (this.activeSlot !== 2) {
      rig.magazine.position.y = this.isReloading ? -0.22 : -0.1;
    }

    const wDef = this.getActiveWeaponDef();
    const sniperAds = wDef.id === 'sniper_rifle' && this.mouseDownRight && !this.isReloading;
    rig.root.visible = !sniperAds;
  }

  private updateEnemies(dt: number): void {
    this.soundBus.prune(this.elapsedSeconds);
    const ghostStealth = this.characterId === 'ghost' && this.abilityActive;
    const isFlashlightOn = this.flashlightOn && this.flashlightBattery > 0;
    const isPlayerCrouching = Boolean(this.keys['ControlLeft'] || this.keys['ControlRight'] || this.keys['KeyC']);
    const playerMovingFast = Math.hypot(this.playerVel.x, this.playerVel.z) > 2.2;

    // Pairwise soft separation so swarming monsters do not stack inside each other
    if (!(this.educationFrozen && !this.isCoopSession)) {
      for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (!a.active || a.state === 'DEAD' || a.huskCollapsed) continue;
      const ra = this.getEnemyCollisionRadius(a.type);
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (!b.active || b.state === 'DEAD' || b.huskCollapsed) continue;
        const rb = this.getEnemyCollisionRadius(b.type);
        const minSep = ra + rb + 0.14;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minSep * minSep) {
          const dist = Math.sqrt(dSq) || 0.01;
          const overlap = Math.min(0.45, minSep - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          const weightA = a.isBoss ? 0.15 : 0.5;
          const weightB = b.isBoss ? 0.15 : 0.5;
          if (!a.isBoss || b.isBoss) {
            const rA = this.resolveHorizontalCollision(
              a.position.x - nx * overlap * weightA,
              a.position.z - nz * overlap * weightA,
              a.position.y,
              ra
            );
            a.position.x = rA.x;
            a.position.z = rA.z;
          }
          if (!b.isBoss || a.isBoss) {
            const rB = this.resolveHorizontalCollision(
              b.position.x + nx * overlap * weightB,
              b.position.z + nz * overlap * weightB,
              b.position.y,
              rb
            );
            b.position.x = rB.x;
            b.position.z = rB.z;
          }
        }
      }
      }
    }

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;

      if (enemy.hurtTwitchTimer > 0) enemy.hurtTwitchTimer = Math.max(0, enemy.hurtTwitchTimer - dt);
      if (enemy.vocalTimer > 0) enemy.vocalTimer = Math.max(0, enemy.vocalTimer - dt);

      if (enemy.hitFlashTimer > 0) {
        enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
        const flashOn = enemy.hitFlashTimer > 0 && enemy.state !== 'DEAD' && !enemy.huskCollapsed;
        enemy.refs.flashMaterials?.forEach((m, idx) => {
          const base = enemy.refs.flashBaseEmissives?.[idx];
          if (flashOn) {
            m.emissive.setHex(0xffffff);
            m.emissiveIntensity = 0.45;
          } else if (base) {
            m.emissive.setHex(base.hex);
            m.emissiveIntensity = base.intensity;
          } else {
            m.emissive.setHex(idx === 2 ? 0x7f1d1d : 0x000000);
            m.emissiveIntensity = idx === 2 ? 0.95 : 0;
          }
        });
      }

      const distToCam = enemy.position.distanceTo(this.camera.position);
      _vec3C.copy(enemy.position).sub(this.camera.position);
      const rightX = Math.cos(this.playerYaw);
      const rightZ = -Math.sin(this.playerYaw);
      const pan = THREE.MathUtils.clamp((_vec3C.x * rightX + _vec3C.z * rightZ) / (distToCam || 1), -1, 1);
      const groundY = this.groundHeightAt(enemy.position.x, enemy.position.z);

      if (enemy.state === 'DEAD') {
        if (enemy.anim.deathTimer < 3.4) {
          updateMonsterAnimations(enemy.refs, enemy.anim, {
            dt,
            time: this.elapsedSeconds,
            type: enemy.type,
            aiState: 'DEAD',
            position: enemy.position,
            yaw: enemy.yaw,
            actualHorizMoved: 0,
            turnRate: 0,
            targetPos: this.playerPos,
            healthRatio: 0,
            legDamaged: enemy.legDamaged,
            isScreaming: false,
            isVocalizing: enemy.vocalTimer > 0,
            distToCam,
            bossPhase: enemy.bossPhase,
            onMechSpark: (pos) => {
              this.fireSystem.spawnBurst(pos.clone().add(new THREE.Vector3(0, 1.2, 0)), true, 6);
            },
          });
          if (enemy.neckState) {
            updateTitanforgedNeckAnimation(enemy.refs, enemy.neckState, {
              dt,
              time: this.elapsedSeconds,
              ownerPos: enemy.position,
              ownerYaw: enemy.yaw,
              targetPos: this.playerPos,
              lastKnownPos: enemy.lastKnownPlayerPos,
              targetOccluded: true,
              aiState: 'DEAD',
              hollowExposed: enemy.hollowExposed,
              bossPhase: enemy.bossPhase,
            });
          }
          updateMonsterTentacles(enemy.refs, enemy.tentacleState, {
            dt,
            time: this.elapsedSeconds,
            enemyType: enemy.type,
            aiState: 'DEAD',
            moveSpeed: 0,
            turnRate: 0,
            distToCam,
            groundY,
            healthRatio: 0,
            hollowExposed: enemy.hollowExposed,
            isScreaming: false,
            colliders: this.world.colliders,
            fireZones: this.world.fireHazardZones,
          });
        }
        continue;
      }

      if (enemy.huskCollapsed) {
        enemy.refs.group.rotation.x = THREE.MathUtils.damp(enemy.refs.group.rotation.x, 0.42, 4, dt);
        enemy.refs.group.position.y = THREE.MathUtils.damp(enemy.refs.group.position.y, groundY - 1.25, 4, dt);
        updateMonsterTentacles(enemy.refs, enemy.tentacleState, {
          dt,
          time: this.elapsedSeconds,
          enemyType: enemy.type,
          aiState: 'DEAD',
          moveSpeed: 0,
          turnRate: 0,
          distToCam,
          groundY,
          healthRatio: 0,
          hollowExposed: true,
          colliders: this.world.colliders,
        });
        continue;
      }

      if (this.educationFrozen && !this.isCoopSession) {
        updateMonsterAnimations(enemy.refs, enemy.anim, {
          dt: Math.min(dt, 0.016),
          time: this.elapsedSeconds,
          type: enemy.type,
          aiState: enemy.state,
          position: enemy.position,
          yaw: enemy.yaw,
          actualHorizMoved: 0,
          turnRate: 0,
          targetPos: this.playerPos,
          healthRatio: enemy.health / Math.max(1, enemy.maxHealth),
          legDamaged: enemy.legDamaged,
          isScreaming: false,
          isVocalizing: false,
          distToCam,
          bossPhase: enemy.bossPhase,
          frozen: true,
        });
        continue;
      }

      const profile = MONSTER_PROFILES[enemy.type];
      if (enemy.attackCooldown > 0) enemy.attackCooldown -= dt;
      if (enemy.rangedCooldown > 0) enemy.rangedCooldown -= dt;
      if (enemy.shriekCooldown > 0) enemy.shriekCooldown -= dt;
      if (enemy.ai.repathTimer > 0) enemy.ai.repathTimer -= dt;
      if (enemy.ai.vocalCooldown > 0) enemy.ai.vocalCooldown -= dt;

      const wasStunned = enemy.stunTimer > 0;
      if (enemy.stunTimer > 0) {
        enemy.stunTimer = Math.max(0, enemy.stunTimer - dt);
      }

      const targetPos = this.droneMesh ? this.droneMesh.position : this.playerPos;
      const distToTarget = enemy.position.distanceTo(targetPos);
      const healthRatio = enemy.health / Math.max(1, enemy.maxHealth);

      const alreadyAlert =
        enemy.state === 'CHASE' || enemy.state === 'ATTACK' || enemy.state === 'BOSS_INTRO';
      const losVisible = evaluateMonsterVision(
        enemy.position,
        enemy.yaw,
        targetPos,
        profile,
        this.world.colliders,
        isPlayerCrouching,
        isFlashlightOn,
        ghostStealth,
        playerMovingFast,
        alreadyAlert
      );

      const heardEvent = !ghostStealth
        ? this.soundBus.findBestHeardEvent(
            enemy.position.x,
            enemy.position.z,
            profile.hearingMult,
            this.world.colliders,
            enemy.id
          )
        : null;

      const aiDecision = determineDesiredAIState({
        currentState: enemy.state,
        type: enemy.type,
        healthRatio,
        distToTarget,
        losVisible,
        heardEvent,
        ai: enemy.ai,
        enemyPos: enemy.position,
        targetPos,
        lastKnownPlayerPos: enemy.lastKnownPlayerPos,
        searchTimer: enemy.searchTimer,
        stunTimer: enemy.stunTimer,
        navGrid: this.navGrid,
        colliders: this.world.colliders,
        dt,
      });

      enemy.state = aiDecision.nextState;
      enemy.searchTimer = aiDecision.nextSearchTimer;

      if (wasStunned && enemy.stunTimer <= 0 && enemy.state === 'STUNNED') {
        enemy.state = 'CHASE';
      }

      const occludedWalls =
        distToCam < 56
          ? countSoundOcclusions(
              enemy.position.x,
              enemy.position.z,
              this.camera.position.x,
              this.camera.position.z,
              this.world.colliders
            )
          : 3;

      if (enemy.regenCooldown > 0) enemy.regenCooldown = Math.max(0, enemy.regenCooldown - dt);
      if (enemy.leapAirTimer > 0) {
        enemy.leapAirTimer = Math.max(0, enemy.leapAirTimer - dt);
        this.moveEnemyWithCollision(enemy, enemy.leapVel.x, enemy.leapVel.z, dt);
      }

      if (aiDecision.justAlerted) {
        enemy.vocalTimer = Math.max(enemy.vocalTimer, 0.85);
        if (enemy.type === 'screamer') {
          this.audio.playScreamerShriek(distToCam, pan);
        } else {
          this.audio.playMonsterVocal(enemy.type, 'warning', distToCam, pan, occludedWalls);
        }
        if (enemy.state === 'BOSS_INTRO') {
          this.audio.setBossMusic(true, enemy.bossPhase);
          this.audio.playEnemyRoar(Math.min(10, distToCam), true, pan);
          this.shakeIntensity = Math.max(this.shakeIntensity, 0.032);
          if (enemy.neckState) enemy.neckState.roarTimer = 1.65;
          const bossMeta = BOSS_DISPLAY_NAMES[enemy.type];
          this.showRadio('APEX THREAT DETECTED', `${bossMeta?.name ?? enemy.type.toUpperCase()} — ${bossMeta?.subtitle ?? 'ENGAGING'}`);
        }
      }

      // Screamer acoustic pack shriek
      if (
        enemy.type === 'screamer' &&
        (enemy.state === 'CHASE' || enemy.state === 'ATTACK') &&
        enemy.shriekCooldown <= 0
      ) {
        enemy.shriekCooldown = 6.5;
        enemy.vocalTimer = Math.max(enemy.vocalTimer, 1.35);
        this.audio.playScreamerShriek(distToCam, pan);
        this.soundBus.emit(
          enemy.position.x,
          enemy.position.y,
          enemy.position.z,
          36,
          'shriek',
          this.elapsedSeconds,
          enemy.id
        );
        this.showRadio('ACOUSTIC SPIKE', 'Screamer shriek detected — nearby biomechanical units converging!');
        for (const other of this.enemies) {
          if (
            other !== enemy &&
            other.active &&
            other.state !== 'DEAD' &&
            other.position.distanceTo(enemy.position) < 34
          ) {
            other.lastKnownPlayerPos.copy(targetPos);
            if (other.state === 'PATROL' || other.state === 'SEARCH') {
              other.state = 'SEARCH';
              other.searchTimer = 7.0;
            }
          }
        }
      }

      // Periodic monster breathing / growling / metallic clicks
      if (enemy.ai.vocalCooldown <= 0) {
        enemy.ai.vocalCooldown =
          (enemy.state === 'PATROL' || enemy.state === 'SEARCH' ? 6.5 : 4.2) + Math.random() * 5.0;
        if (distToCam < 44 && enemy.state !== 'HIDING') {
          this.audio.playMonsterVocal(enemy.type, 'idle', distToCam, pan, occludedWalls);
          enemy.vocalTimer = Math.max(enemy.vocalTimer, 0.65);
        }
      }

      // Determine movement target, desired speed, and combat actions
      const speedScale =
        (enemy.legDamaged ? 0.68 : 1.0) *
        (enemy.type === 'hollow_dweller' && enemy.bossPhase >= 5
          ? 1.28
          : enemy.isBoss && enemy.bossPhase >= 2
            ? 1.15
            : 1.0);
      let moveGoal: THREE.Vector3 | null = null;
      let desiredSpeed = 0;

      if (enemy.state === 'STUNNED' || enemy.state === 'BOSS_INTRO') {
        desiredSpeed = 0;
        _vec3B.copy(targetPos).sub(enemy.position);
        const targetYaw = Math.atan2(_vec3B.x, _vec3B.z);
        let diff = targetYaw - enemy.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        enemy.yaw += diff * Math.min(1, dt * profile.turnRate);
      } else if (enemy.state === 'PATROL') {
        moveGoal = enemy.patrolTarget;
        desiredSpeed = profile.walkSpeed * 0.72 * speedScale;
        if (enemy.position.distanceTo(enemy.patrolTarget) < 1.4) {
          const tmp = enemy.patrolTarget.clone();
          enemy.patrolTarget.copy(enemy.homePosition);
          enemy.homePosition.copy(tmp);
          enemy.ai.repathTimer = 0;
        }
      } else if (enemy.state === 'SEARCH') {
        const distLastKnown = Math.hypot(
          enemy.lastKnownPlayerPos.x - enemy.position.x,
          enemy.lastKnownPlayerPos.z - enemy.position.z
        );
        if (distLastKnown < 2.2) {
          enemy.ai.searchSweepAngle += dt * 1.45;
          const sx = enemy.lastKnownPlayerPos.x + Math.cos(enemy.ai.searchSweepAngle) * 3.2;
          const sz = enemy.lastKnownPlayerPos.z + Math.sin(enemy.ai.searchSweepAngle) * 3.2;
          if (!this.navGrid || this.navGrid.isWorldWalkable(sx, sz, false)) {
            moveGoal = _vec3C.set(sx, enemy.lastKnownPlayerPos.y, sz);
          } else {
            moveGoal = enemy.lastKnownPlayerPos;
          }
        } else {
          moveGoal = enemy.lastKnownPlayerPos;
        }
        desiredSpeed = profile.walkSpeed * 1.08 * speedScale;
      } else if (enemy.state === 'RETREAT') {
        if (enemy.ai.hideTarget && enemy.position.distanceTo(enemy.ai.hideTarget) > 1.4) {
          moveGoal = enemy.ai.hideTarget;
        } else {
          _vec3A.copy(enemy.position).sub(targetPos).setY(0).normalize();
          moveGoal = _vec3C.copy(enemy.position).addScaledVector(_vec3A, 6);
        }
        desiredSpeed = profile.runSpeed * 0.9 * speedScale;
      } else if (enemy.state === 'HIDING') {
        if (enemy.ai.hideTarget && enemy.position.distanceTo(enemy.ai.hideTarget) > 1.25) {
          moveGoal = enemy.ai.hideTarget;
          desiredSpeed = profile.walkSpeed * speedScale;
        } else {
          desiredSpeed = 0;
          _vec3B.copy(enemy.lastKnownPlayerPos).sub(enemy.position);
          const targetYaw = Math.atan2(_vec3B.x, _vec3B.z);
          let diff = targetYaw - enemy.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          enemy.yaw += diff * Math.min(1, dt * profile.turnRate);
        }
      } else if (enemy.state === 'CHASE') {
        if (profile.flankBias !== 0 && distToTarget > 5.0 && distToTarget < 18) {
          _vec3A.copy(targetPos).sub(enemy.position).setY(0).normalize();
          const flankPt = _vec3C
            .copy(targetPos)
            .add(
              new THREE.Vector3(
                -_vec3A.z * enemy.flankSign * 3.6 * profile.flankBias,
                0,
                _vec3A.x * enemy.flankSign * 3.6 * profile.flankBias
              )
            );
          moveGoal = !this.navGrid || this.navGrid.isWorldWalkable(flankPt.x, flankPt.z, false) ? flankPt : targetPos;
        } else {
          moveGoal = targetPos;
        }
        desiredSpeed = profile.runSpeed * speedScale;

        // Hollow Dweller mid-range predatory leap initiation during CHASE
        if (
          enemy.type === 'hollow_dweller' &&
          losVisible &&
          distToTarget >= 3.8 &&
          distToTarget <= 11.5 &&
          enemy.attackCooldown <= 0 &&
          enemy.anim.animState !== 'ATTACK'
        ) {
          const kind = selectNextAttackKind(enemy.type, distToTarget, enemy.ai, {
            healthRatio,
            bossPhase: enemy.bossPhase,
          });
          triggerMonsterAttack(enemy.anim, kind, profile.weightClass);
          enemy.attackCooldown = enemy.anim.attackDuration + (enemy.bossPhase >= 5 ? 0.25 : 0.55);
          this.setBossWarning(
            kind === 'leap_attack' ? 'INCOMING HOLLOW LEAP!' : 'HOLLOW TENTACLE LASH!',
            1.15
          );
        }
      } else if (enemy.state === 'ATTACK') {
        _vec3B.copy(targetPos).sub(enemy.position);
        const targetYaw = Math.atan2(_vec3B.x, _vec3B.z);
        let diff = targetYaw - enemy.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        enemy.yaw += diff * Math.min(1, dt * profile.turnRate);

        if (enemy.type === 'titanforged') {
          if (distToTarget > 6.0 && enemy.anim.animState !== 'ATTACK') {
            moveGoal = targetPos;
            desiredSpeed = profile.walkSpeed * 0.95 * speedScale;
          }
          if (enemy.attackCooldown <= 0 && enemy.anim.animState !== 'ATTACK') {
            const kind = selectNextAttackKind('titanforged', distToTarget, enemy.ai, {
              healthRatio,
              bossPhase: enemy.bossPhase,
              regenCooldown: enemy.regenCooldown,
            });
            triggerMonsterAttack(enemy.anim, kind, profile.weightClass);
            if (kind === 'parasite_regen') {
              enemy.regenCooldown = 14.0;
              this.setBossWarning('PARASITE REGENERATION — SHOOT HEAD/NECK TO INTERRUPT!', 2.2);
            } else if (kind === 'titanic_stomp') {
              this.setBossWarning('TITANIC STOMP — JUMP TO CLEAR SHOCKWAVE!', 1.65);
            } else if (kind === 'gravity_pulse') {
              this.setBossWarning('GRAVITY PULSE CHARGING!', 1.85);
            } else if (kind === 'ground_crusher') {
              this.setBossWarning('GROUND CRUSHER INCOMING!', 1.55);
            } else if (kind === 'tentacle_sweep') {
              this.setBossWarning('COLOSSAL TENTACLE SWEEP!', 1.45);
            } else if (kind === 'tentacle_grab') {
              this.setBossWarning('TENTACLE GRAB — DODGE CLEAR!', 1.45);
            }
            enemy.attackCooldown = enemy.anim.attackDuration + (enemy.bossPhase >= 3 ? 0.55 : 0.85);
          } else if (distToTarget > 12.0 && enemy.rangedCooldown <= 0 && enemy.anim.animState !== 'ATTACK') {
            enemy.rangedCooldown = enemy.bossPhase >= 2 ? 1.55 : 2.1;
            this.fireEnemyProjectile(enemy, targetPos);
          }
        } else if (profile.hasRanged && distToTarget >= profile.rangedMinDist) {
          if (enemy.rangedCooldown <= 0) {
            enemy.rangedCooldown = enemy.isBoss ? (enemy.bossPhase >= 2 ? 1.25 : 1.75) : 1.95;
            this.fireEnemyProjectile(enemy, targetPos);
          }
          if (enemy.isBoss && distToTarget > profile.rangedMinDist + 2.0) {
            moveGoal = targetPos;
            desiredSpeed = profile.walkSpeed * 0.9 * speedScale;
          }
        } else if (enemy.type === 'screamer' && distToTarget < 6.0) {
          _vec3A.copy(targetPos).sub(enemy.position).setY(0).normalize();
          moveGoal = _vec3C.copy(enemy.position).addScaledVector(_vec3A, -3.5);
          desiredSpeed = profile.walkSpeed * speedScale;
        } else {
          if (distToTarget > enemy.attackRange * 0.88 && enemy.anim.animState !== 'ATTACK') {
            moveGoal = targetPos;
            desiredSpeed = profile.runSpeed * 0.85 * speedScale;
          }
          if (
            enemy.attackCooldown <= 0 &&
            distToTarget <= enemy.attackRange + (enemy.type === 'hollow_dweller' ? 1.6 : 0.8) &&
            enemy.anim.animState !== 'ATTACK'
          ) {
            const kind = selectNextAttackKind(enemy.type, distToTarget, enemy.ai, {
              healthRatio,
              bossPhase: enemy.bossPhase,
            });
            triggerMonsterAttack(enemy.anim, kind, profile.weightClass);
            if (enemy.type === 'hollow_dweller') {
              if (kind === 'frenzied_attack') this.setBossWarning('HOLLOW FRENZY BARRAGE!', 1.25);
              else if (kind === 'grab_throw') this.setBossWarning('HOLLOW GRAB — EVADE!', 1.25);
              else if (kind === 'leap_attack') this.setBossWarning('HOLLOW LEAP!', 1.15);
            }
            enemy.attackCooldown =
              enemy.anim.attackDuration +
              (enemy.type === 'hollow_dweller' && enemy.bossPhase >= 5
                ? 0.14
                : profile.weightClass === 'small'
                  ? 0.25
                  : 0.55);
          }
        }
      }

      const prevX = enemy.position.x;
      const prevZ = enemy.position.z;

      if (moveGoal && desiredSpeed > 0.05 && enemy.anim.animState !== 'ATTACK') {
        const hasDir = computeSteeredDirection(
          enemy.position,
          moveGoal,
          enemy.ai,
          this.navGrid,
          profile.strength >= 2,
          _vec3B,
          profile.collisionRadius >= 0.8
        );
        if (hasDir) {
          const targetYaw = Math.atan2(_vec3B.x, _vec3B.z);
          let diff = targetYaw - enemy.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          enemy.yaw += diff * Math.min(1, dt * profile.turnRate);

          const rate = desiredSpeed > enemy.ai.currentSpeed ? profile.accel : profile.decel;
          enemy.ai.currentSpeed = THREE.MathUtils.damp(enemy.ai.currentSpeed, desiredSpeed, rate, dt);
          this.moveEnemyWithCollision(enemy, _vec3B.x, _vec3B.z, enemy.ai.currentSpeed * dt);
        } else {
          enemy.ai.currentSpeed = THREE.MathUtils.damp(enemy.ai.currentSpeed, 0, profile.decel, dt);
        }
      } else {
        enemy.ai.currentSpeed = THREE.MathUtils.damp(enemy.ai.currentSpeed, 0, profile.decel, dt);
        if (enemy.ai.currentSpeed > 0.15) {
          this.moveEnemyWithCollision(
            enemy,
            Math.sin(enemy.yaw),
            Math.cos(enemy.yaw),
            enemy.ai.currentSpeed * dt
          );
        }
      }

      const actualHorizMoved = Math.hypot(enemy.position.x - prevX, enemy.position.z - prevZ);

      // Stuck mitigation & destructible obstacle smashing
      if (moveGoal && desiredSpeed > 0.4 && enemy.anim.animState !== 'ATTACK') {
        if (actualHorizMoved < desiredSpeed * dt * 0.14) {
          enemy.ai.stuckTimer += dt;
          if (enemy.ai.stuckTimer > 0.65) {
            enemy.ai.stuckTimer = 0;
            enemy.ai.repathTimer = 0;
            enemy.flankSign *= -1;
          }
        } else {
          enemy.ai.stuckTimer = Math.max(0, enemy.ai.stuckTimer - dt * 2);
        }
      } else {
        enemy.ai.stuckTimer = 0;
      }

      for (const bar of this.world.destructibleBarricades) {
        if (bar.destroyed) continue;
        const reqStrength = bar.minStrength ?? 3;
        if (profile.strength < reqStrength) continue;
        const reach = enemy.isBoss ? 4.3 : 2.35;
        if (enemy.position.distanceTo(bar.position) < reach) {
          this.damageDestructible(bar, profile.strength * 45);
          if (enemy.anim.animState !== 'ATTACK' && enemy.attackCooldown <= 0.2) {
            triggerMonsterAttack(enemy.anim, profile.isMech ? 'heavy_slam' : 'claw', profile.weightClass);
            enemy.attackCooldown = enemy.anim.attackDuration;
          }
        }
      }

      // Grounding onto ramps/floors + Void Walker hover
      const nextGroundY = this.groundHeightAt(enemy.position.x, enemy.position.z);
      if (enemy.type === 'void_walker') {
        enemy.position.y = nextGroundY + 0.25 + Math.sin(this.elapsedSeconds * 2.4 + enemy.flankSign) * 0.22;
      } else {
        enemy.position.y = THREE.MathUtils.damp(enemy.position.y, nextGroundY, 22, dt);
      }

      // Aperture Phase-Lock Combat Relay: Monsters entering linked portals warp & suffer quantum shear
      if (
        this.portals.blue &&
        this.portals.orange &&
        this.hasPortalUpgrade('portal_combat_relay')
      ) {
        const lastCd = this.enemyPortalCooldowns.get(enemy.id) ?? 0;
        if (lastCd > 0) {
          this.enemyPortalCooldowns.set(enemy.id, Math.max(0, lastCd - dt));
        } else {
          const pairs: [ActivePortal, ActivePortal][] = [
            [this.portals.blue, this.portals.orange],
            [this.portals.orange, this.portals.blue],
          ];
          for (const [entry, exit] of pairs) {
            const dxP = enemy.position.x - entry.center.x;
            const dzP = enemy.position.z - entry.center.z;
            const distHoriz = Math.hypot(dxP, dzP);
            if (distHoriz < (enemy.isBoss ? 2.1 : 1.75) && Math.abs(enemy.position.y + 0.9 - entry.center.y) < 2.0) {
              this.enemyPortalCooldowns.set(enemy.id, 3.5);
              if (!enemy.isBoss) {
                const outRes = this.resolveHorizontalCollision(
                  exit.center.x + exit.normal.x * 1.45,
                  exit.center.z + exit.normal.z * 1.45,
                  this.groundHeightAt(exit.center.x, exit.center.z),
                  this.getEnemyCollisionRadius(enemy.type)
                );
                enemy.position.set(outRes.x, this.groundHeightAt(outRes.x, outRes.z), outRes.z);
                enemy.stunTimer = Math.max(enemy.stunTimer, 1.65);
                enemy.state = 'STUNNED';
                this.damageEnemy(enemy, 38, 'body', enemy.position.clone().add(new THREE.Vector3(0, 1.1, 0)));
              } else {
                enemy.stunTimer = Math.max(enemy.stunTimer, 0.45);
                this.damageEnemy(enemy, 45, 'body', enemy.position.clone().add(new THREE.Vector3(0, 1.8, 0)));
              }
              this.audio.playPortalTransit();
              this.spawnImpactParticles(
                enemy.position.clone().add(new THREE.Vector3(0, 1.0, 0)),
                exit.color === 'blue' ? 0x38bdf8 : 0xf97316,
                10
              );
              break;
            }
          }
        }
      }

      // Creature <-> Fire Interactions
      if (enemy.burnDamageCooldown > 0) enemy.burnDamageCooldown -= dt;
      if (this.world.fireHazardZones.length > 0) {
        for (const fz of this.world.fireHazardZones) {
          const distFire = enemy.position.distanceTo(fz.position);
          if (enemy.type === 'stalker' && distFire < fz.heatRadius + 2.2) {
            _vec3A.copy(enemy.position).sub(fz.position).setY(0).normalize();
            this.moveEnemyWithCollision(enemy, _vec3A.x, _vec3A.z, 3.8 * dt);
          } else if (enemy.type === 'brute_enemy' && distFire < fz.heatRadius && enemy.burnDamageCooldown <= 0) {
            enemy.burnDamageCooldown = 0.9;
            this.fireSystem.spawnBurst(enemy.position, false, 10);
            this.damageEnemy(enemy, 10, 'body', enemy.position);
          } else if (enemy.isBoss && distFire < fz.heatRadius + 1.4 && actualHorizMoved > 0.01 && Math.sin(this.elapsedSeconds * 12) > 0.9) {
            this.fireSystem.spawnBurst(enemy.position, true, 8);
          }
        }
      }

      enemy.refs.group.position.copy(enemy.position);
      enemy.refs.group.rotation.y = enemy.yaw;

      let yawDelta = enemy.yaw - enemy.prevYaw;
      while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
      while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
      const entityTurnRate = yawDelta / Math.max(dt, 0.001);
      enemy.prevYaw = enemy.yaw;

      updateMonsterAnimations(enemy.refs, enemy.anim, {
        dt,
        time: this.elapsedSeconds,
        type: enemy.type,
        aiState: enemy.state,
        position: enemy.position,
        yaw: enemy.yaw,
        actualHorizMoved,
        turnRate: entityTurnRate,
        targetPos,
        healthRatio,
        legDamaged: enemy.legDamaged,
        isScreaming: enemy.type === 'screamer' && enemy.shriekCooldown > 4.5,
        isVocalizing: enemy.vocalTimer > 0,
        distToCam,
        bossPhase: enemy.bossPhase,
        onFootstep: (weight, speedRatio) => {
          const surf = this.getSurfaceAt(enemy.position.x, enemy.position.z);
          this.audio.playSurfaceFootstep(surf, weight, speedRatio, distToCam, pan, occludedWalls);
          if ((weight === 'boss' || weight === 'large') && distToCam < 24) {
            const shakeAmt = (weight === 'boss' ? 0.016 : 0.007) * (1 - distToCam / 26);
            this.shakeIntensity = Math.max(this.shakeIntensity, shakeAmt);
          }
        },
        onAttackWindup: (kind) => {
          enemy.vocalTimer = Math.max(enemy.vocalTimer, 0.7);
          this.audio.playAttackWindupSound(kind, profile.isMech, distToCam, pan);
          this.audio.playMonsterVocal(enemy.type, 'attack', distToCam, pan, occludedWalls);
          if (enemy.type === 'hollow_dweller') {
            this.audio.playHollowClawScrape(distToCam, pan);
          }
        },
        onAttackHit: (kind, dmgMult, reachBonus) => {
          const curDist = enemy.position.distanceTo(targetPos);
          const dxA = targetPos.x - enemy.position.x;
          const dzA = targetPos.z - enemy.position.z;
          let angDiff = Math.atan2(dxA, dzA) - enemy.yaw;
          while (angDiff > Math.PI) angDiff -= Math.PI * 2;
          while (angDiff < -Math.PI) angDiff += Math.PI * 2;

          if (!this.droneMesh && curDist <= enemy.attackRange + reachBonus && Math.abs(angDiff) < 1.35) {
            this.damagePlayer(Math.round(enemy.damage * dmgMult));
            this.audio.playAttackImpactSound(kind, distToCam, pan);
            if (kind === 'heavy_slam' || kind === 'charge' || kind === 'tentacle_sweep') {
              this.shakeIntensity = Math.max(this.shakeIntensity, 0.042);
            }
          }
        },
        onBossSpecialEffect: (event, kind, worldPos) => {
          const dP = worldPos.distanceTo(this.playerPos);
          const awayDir = _vec3A.copy(this.playerPos).sub(worldPos).setY(0);
          if (awayDir.lengthSq() > 0.001) awayDir.normalize();
          else awayDir.set(Math.sin(enemy.yaw), 0, Math.cos(enemy.yaw));

          if (event === 'stomp_impact') {
            this.audio.playTitanStompImpact(dP, pan);
            this.shakeIntensity = Math.max(this.shakeIntensity, 0.058);
            this.fireSystem.spawnBurst(worldPos, false, 18);
            this.spawnImpactParticles(worldPos.clone().add(new THREE.Vector3(0, 0.35, 0)), 0x9ca3af, 18);
            this.spawnBossShockwave(worldPos, 'stomp', 19.0, 0.85, Math.round(enemy.damage * 1.15));
            for (const bar of this.world.destructibleBarricades) {
              if (!bar.destroyed && bar.position.distanceTo(worldPos) < 8.5) {
                this.damageDestructible(bar, 120);
              }
            }
            if (!this.droneMesh && dP < 4.5) {
              this.damagePlayer(Math.round(enemy.damage * 1.35));
              this.knockbackVel.addScaledVector(awayDir, 10.5);
            }
          } else if (event === 'crusher_impact') {
            this.audio.playTitanStompImpact(dP, pan);
            this.shakeIntensity = Math.max(this.shakeIntensity, 0.065);
            const strikeCenter = worldPos
              .clone()
              .add(new THREE.Vector3(Math.sin(enemy.yaw) * 3.8, 0.3, Math.cos(enemy.yaw) * 3.8));
            this.spawnImpactParticles(strikeCenter, 0xd97706, 22);
            this.fireSystem.spawnBurst(strikeCenter, false, 16);
            this.spawnBossShockwave(strikeCenter, 'crusher', 9.5, 0.5, 0);
            for (const bar of this.world.destructibleBarricades) {
              if (!bar.destroyed && bar.position.distanceTo(strikeCenter) < 6.5) {
                this.damageDestructible(bar, 150);
              }
            }
            if (!this.droneMesh && strikeCenter.distanceTo(this.playerPos) < 5.6) {
              this.damagePlayer(Math.round(enemy.damage * 1.45));
              this.knockbackVel.addScaledVector(awayDir, 12.0);
              this.playerVel.y = Math.max(this.playerVel.y, 4.2);
            }
          } else if (event === 'gravity_charge') {
            this.audio.playTitanGravityPulse(true, dP, pan);
            this.fireSystem.spawnBurst(worldPos.clone().add(new THREE.Vector3(0, 4.2, 0)), true, 16);
          } else if (event === 'gravity_release') {
            this.audio.playTitanGravityPulse(false, dP, pan);
            this.shakeIntensity = Math.max(this.shakeIntensity, 0.06);
            const pulseOrigin = worldPos.clone().add(new THREE.Vector3(0, 0.4, 0));
            this.spawnBossShockwave(pulseOrigin, 'gravity', 22.0, 0.72, 0);
            this.spawnImpactParticles(worldPos.clone().add(new THREE.Vector3(0, 3.8, 0)), 0xc026d3, 22);
            if (!this.droneMesh && dP < 20.0) {
              const force = THREE.MathUtils.clamp(1 - dP / 20.0, 0.25, 1.0);
              this.damagePlayer(Math.round(enemy.damage * (0.65 + force * 0.65)));
              this.knockbackVel.addScaledVector(awayDir, 15.0 * force);
              this.playerVel.y = Math.max(this.playerVel.y, 5.2 * force);
            }
          } else if (event === 'regen_pulse') {
            this.audio.playTitanRegenSound(dP, pan);
            this.spawnImpactParticles(worldPos.clone().add(new THREE.Vector3(0, 4.2, 0)), 0xef4444, 14);
          } else if (event === 'regen_heal') {
            if (enemy.health > 0 && !enemy.huskCollapsed) {
              const healAmt = Math.round(enemy.maxHealth * 0.08);
              enemy.health = Math.min(enemy.maxHealth, enemy.health + healAmt);
              this.spawnImpactParticles(worldPos.clone().add(new THREE.Vector3(0, 4.2, 0)), 0x22c55e, 16);
              this.showRadio('BIOLOGICAL SURGE', 'THE TITANFORGED regenerated damaged bio-organic plating!');
            }
          } else if (event === 'grab_reach') {
            const reach = kind === 'tentacle_grab' ? 9.5 : 4.8;
            if (!this.droneMesh && dP <= reach) {
              this.audio.playGrabImpact(kind === 'tentacle_grab', dP, pan);
              this.damagePlayer(Math.round(enemy.damage * 0.85));
              this.playerVel.y = Math.max(this.playerVel.y, 4.8);
              this.knockbackVel.addScaledVector(awayDir, 3.5);
            }
          } else if (event === 'grab_release') {
            const reach = kind === 'tentacle_grab' ? 10.5 : 5.4;
            if (!this.droneMesh && dP <= reach) {
              this.audio.playGrabImpact(true, dP, pan);
              this.damagePlayer(Math.round(enemy.damage * 0.75));
              this.knockbackVel.addScaledVector(awayDir, kind === 'tentacle_grab' ? 16.0 : 13.5);
              this.playerVel.y = Math.max(this.playerVel.y, 5.8);
              this.shakeIntensity = Math.max(this.shakeIntensity, 0.052);
            }
          } else if (event === 'hollow_leap_launch') {
            this.audio.playHollowLeapSound(dP, pan);
            const dirToTarget = _vec3B.copy(targetPos).sub(worldPos).setY(0);
            const lenL = dirToTarget.length() || 1;
            dirToTarget.divideScalar(lenL);
            const leapSpeed = Math.min(18.5, Math.max(10.0, lenL * 2.1));
            enemy.leapVel.set(dirToTarget.x * leapSpeed, 0, dirToTarget.z * leapSpeed);
            enemy.leapAirTimer = 0.36;
          } else if (event === 'hollow_leap_land') {
            enemy.leapAirTimer = 0;
            this.audio.playAttackImpactSound('heavy_slam', dP, pan);
            this.spawnImpactParticles(worldPos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xef4444, 14);
            if (!this.droneMesh && dP < 3.8) {
              this.damagePlayer(Math.round(enemy.damage * 1.32));
              this.knockbackVel.addScaledVector(awayDir, 9.0);
              this.shakeIntensity = Math.max(this.shakeIntensity, 0.044);
            }
          } else if (event === 'hollow_frenzy_slash') {
            this.audio.playHollowClawScrape(dP, pan);
            if (!this.droneMesh && dP < 4.2) {
              this.damagePlayer(Math.round(enemy.damage * 0.62));
              this.audio.playAttackImpactSound('claw_strike', dP, pan);
              this.shakeIntensity = Math.max(this.shakeIntensity, 0.028);
            }
          }
        },
        onJawSnap: () => {
          this.audio.playJawSnap(enemy.isBoss || profile.weightClass === 'large', distToCam, pan);
        },
        onMechSpark: (pos) => {
          this.fireSystem.spawnBurst(pos.clone().add(new THREE.Vector3(0, 1.4, 0)), true, 8);
        },
      });

      if (enemy.neckState) {
        const occluded = occludedWalls > 0;
        updateTitanforgedNeckAnimation(enemy.refs, enemy.neckState, {
          dt,
          time: this.elapsedSeconds,
          ownerPos: enemy.position,
          ownerYaw: enemy.yaw,
          targetPos,
          lastKnownPos: enemy.lastKnownPlayerPos,
          targetOccluded: occluded,
          aiState: enemy.state,
          hollowExposed: enemy.hollowExposed,
          bossPhase: enemy.bossPhase,
          onStrikeHit: (_kind, headWorldPos, range) => {
            if (!this.droneMesh && headWorldPos.distanceTo(this.playerPos) <= range) {
              this.damagePlayer(enemy.damage * 1.15);
              this.shakeIntensity = Math.max(this.shakeIntensity, 0.045);
              this.audio.playEnemyRoar(4, true, 0);
            }
          },
          onNeckSpark: (sparkPos) => {
            this.fireSystem.spawnBurst(sparkPos, true, 14);
            this.audio.playArmorShatter(sparkPos.distanceTo(this.playerPos), 0);
          },
        });
      }

      const isHeavyTentacle = enemy.isBoss || profile.weightClass === 'large';
      const atkProg =
        enemy.anim.animState === 'ATTACK'
          ? enemy.anim.attackElapsed / Math.max(0.1, enemy.anim.attackDuration)
          : 0;
      updateMonsterTentacles(enemy.refs, enemy.tentacleState, {
        dt,
        time: this.elapsedSeconds,
        enemyType: enemy.type,
        aiState: enemy.state,
        moveSpeed: actualHorizMoved / Math.max(dt, 0.001),
        turnRate: entityTurnRate,
        distToCam,
        groundY: nextGroundY,
        healthRatio,
        hurtTwitchTimer: enemy.hurtTwitchTimer,
        isVocalizing: enemy.vocalTimer > 0,
        targetPos,
        hollowExposed: enemy.hollowExposed,
        isScreaming: enemy.type === 'screamer' && enemy.shriekCooldown > 4.5,
        activeAttackKind: enemy.anim.animState === 'ATTACK' ? enemy.anim.attackKind : undefined,
        activeAttackProgress: atkProg,
        isFrenzied: enemy.type === 'hollow_dweller' && enemy.bossPhase >= 5,
        colliders: this.world.colliders,
        fireZones: this.world.fireHazardZones,
        onTentacleWindup: () => {
          this.audio.playTentacleWhoosh(isHeavyTentacle, distToCam, pan, occludedWalls);
        },
        onTentacleWallImpact: (impactPos) => {
          this.audio.playTentacleImpact(
            isHeavyTentacle,
            true,
            impactPos.distanceTo(this.camera.position),
            pan,
            occludedWalls
          );
          this.fireSystem.spawnBurst(impactPos, true, isHeavyTentacle ? 8 : 4);
        },
        onTentacleAttackHit: (tipPos) => {
          if (!this.droneMesh && tipPos.distanceTo(this.playerPos) < 2.8) {
            this.damagePlayer(Math.round(enemy.damage * 0.65));
            this.audio.playTentacleImpact(isHeavyTentacle, false, distToCam, pan, occludedWalls);
          }
        },
      });

      if (enemy.refs.hollowDweller && enemy.hollowExposed) {
        enemy.refs.hollowDweller.rotation.y += dt * 2.2;
        enemy.refs.hollowDweller.position.y = Math.sin(this.elapsedSeconds * 6) * 0.18;
      }
    }
  }

  private fireEnemyProjectile(enemy: EnemyEntity, target: THREE.Vector3): void {
    const start = enemy.position
      .clone()
      .add(new THREE.Vector3(0, enemy.isBoss ? 4.4 : 1.9, 0));
    const dir = target.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(start).normalize();
    const color =
      enemy.type === 'drowned_machine' || enemy.type === 'helios_unit'
        ? 0x38bdf8
        : enemy.type === 'void_walker' || enemy.type === 'origin'
          ? 0xf43f5e
          : 0xef4444;
    const mesh = new THREE.Mesh(
      this.sharedProjectileGeo,
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.scale.setScalar(enemy.isBoss ? 1.65 : 0.9);
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      velocity: dir.multiplyScalar(enemy.isBoss ? 22 : 18),
      damage: enemy.damage,
      life: 3.5,
      fromPlayer: false,
    });
  }

  private updateProjectilesAndParticles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;

      const stepLen = p.velocity.length() * dt;
      let remove = p.life <= 0;

      if (!remove && stepLen > 0.001) {
        _dir.copy(p.velocity).divideScalar(stepLen / dt);
        const wallHit = this.raycastWorldColliders(p.mesh.position, _dir, stepLen);
        if (wallHit) {
          this.spawnImpactParticles(wallHit.point, 0xef4444, 4);
          remove = true;
        }
      }

      if (!remove) {
        _vec3A.copy(p.mesh.position);
        p.mesh.position.addScaledVector(p.velocity, dt);
        if (!p.fromPlayer) {
          const hitDist = p.mesh.position.distanceTo(this.camera.position);
          const midDist = _vec3A.lerp(p.mesh.position, 0.5).distanceTo(this.camera.position);
          if (Math.min(hitDist, midDist) < 0.85) {
            this.damagePlayer(p.damage);
            remove = true;
          }
        }
      }

      if (remove) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.projectiles.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.velocity.y -= 12 * dt;
      pt.mesh.position.addScaledVector(pt.velocity, dt);
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        const mat = pt.mesh.material as THREE.MeshBasicMaterial;
        if (typeof mat.userData.activeParticles === 'number') {
          mat.userData.activeParticles -= 1;
          if (mat.userData.activeParticles <= 0) mat.dispose();
        }
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      (tr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (tr.life / tr.maxLife) * 0.78);
      if (tr.life <= 0) {
        this.scene.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        (tr.mesh.material as THREE.MeshBasicMaterial).dispose();
        this.tracers.splice(i, 1);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      const t = Math.min(1, sw.age / sw.maxAge);
      const radius = 1 + t * sw.maxRadius;
      sw.mesh.scale.set(radius, radius, 1);
      sw.mat.opacity = Math.max(0, (1 - t) * 0.85);

      if (sw.kind === 'stomp' && !sw.hitChecked && !this.droneMesh && sw.damage > 0) {
        const horizDist = Math.hypot(this.playerPos.x - sw.center.x, this.playerPos.z - sw.center.z);
        const playerClearHeight = this.playerPos.y - this.groundHeightAt(this.playerPos.x, this.playerPos.z);
        if (Math.abs(horizDist - radius) < 1.55 && playerClearHeight < 0.55) {
          sw.hitChecked = true;
          this.damagePlayer(sw.damage);
          const dirOut = _vec3A.copy(this.playerPos).sub(sw.center).setY(0);
          if (dirOut.lengthSq() > 0.001) dirOut.normalize();
          this.knockbackVel.addScaledVector(dirOut, 9.5);
          this.playerVel.y = Math.max(this.playerVel.y, 3.6);
          this.shakeIntensity = Math.max(this.shakeIntensity, 0.048);
        }
      }

      if (sw.age >= sw.maxAge) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mat.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    if (this.bossWarningTimer > 0) {
      this.bossWarningTimer = Math.max(0, this.bossWarningTimer - dt);
      if (this.bossWarningTimer <= 0) {
        this.bossWarningText = null;
      }
    }
  }

  private updateAbilitiesAndWorld(dt: number): void {
    if (this.abilityCooldownRemaining > 0) {
      this.abilityCooldownRemaining = Math.max(0, this.abilityCooldownRemaining - dt);
    }
    if (this.abilityActive) {
      this.abilityActiveRemaining -= dt;
      if (this.abilityActiveRemaining <= 0) {
        this.abilityActive = false;
        this.abilityActiveRemaining = 0;
        if (this.droneMesh) {
          this.scene.remove(this.droneMesh);
          this.disposeObject3D(this.droneMesh);
          this.droneMesh = null;
        }
      }
    }

    if (this.droneMesh) {
      this.droneMesh.position.x = this.playerPos.x + Math.cos(this.elapsedSeconds * 2) * 1.8;
      this.droneMesh.position.z = this.playerPos.z + Math.sin(this.elapsedSeconds * 2) * 1.8;
      this.droneMesh.position.y = this.playerPos.y + 2.1 + Math.sin(this.elapsedSeconds * 4) * 0.15;
      this.droneZapTimer -= dt;
      if (this.droneZapTimer <= 0) {
        this.droneZapTimer = 0.95;
        for (const enemy of this.enemies) {
          if (enemy.active && enemy.state !== 'DEAD' && enemy.position.distanceTo(this.droneMesh.position) < 12) {
            this.damageEnemy(enemy, 18, 'body', enemy.position.clone().add(new THREE.Vector3(0, 1, 0)));
            break;
          }
        }
      }
    }

    if (this.pulseRingMesh) {
      this.pulseRingLife -= dt;
      const s = 1 + (0.65 - this.pulseRingLife) * 24;
      this.pulseRingMesh.scale.set(s, s, 1);
      (this.pulseRingMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, this.pulseRingLife / 0.65);
      if (this.pulseRingLife <= 0) {
        this.scene.remove(this.pulseRingMesh);
        this.pulseRingMesh.geometry.dispose();
        (this.pulseRingMesh.material as THREE.Material).dispose();
        this.pulseRingMesh = null;
      }
    }

    // Dynamic Doors Animation across all levels
    if (this.world.dynamicDoors) {
      for (const door of this.world.dynamicDoors) {
        if (door.opened && door.currentOffsetY < door.openOffsetY) {
          door.currentOffsetY = Math.min(door.openOffsetY, door.currentOffsetY + dt * 3.8);
          door.mesh.position.y = door.mesh.userData.baseY
            ? (door.mesh.userData.baseY as number) + door.currentOffsetY
            : 2.1 + door.currentOffsetY;
        }
      }
    }

    // Drainable Water Planes (Level 07)
    if (this.world.waterSections) {
      for (const ws of this.world.waterSections) {
        if (Math.abs(ws.state.currentY - ws.state.targetY) > 0.01) {
          ws.state.currentY = THREE.MathUtils.damp(ws.state.currentY, ws.state.targetY, 2.2, dt);
          ws.mesh.position.y = ws.state.currentY;
          if (ws.state.currentY <= 0.08) {
            ws.mesh.visible = false;
          }
        }
      }
    }

    if (this.horrorPass?.uniforms?.uTime) {
      this.horrorPass.uniforms.uTime.value = this.elapsedSeconds;
    }

    // Animated Environmental Props (Earth rotation, holo rings, water shimmer, turbine fans, bio-veins)
    if (this.world.animatedProps) {
      for (let i = 0; i < this.world.animatedProps.length; i++) {
        const ap = this.world.animatedProps[i];
        if (ap.kind === 'spinY' && ap.object) {
          ap.object.rotation.y += ap.speed * dt;
        } else if (ap.kind === 'hoverSpin' && ap.object) {
          ap.object.rotation.y += ap.speed * dt;
          ap.object.position.y =
            (ap.baseY ?? 0) + Math.sin(this.elapsedSeconds * 1.4 + (ap.phase ?? 0)) * (ap.amplitude ?? 0.25);
        } else if (ap.kind === 'bobY' && ap.object) {
          ap.object.position.y =
            (ap.baseY ?? 0) + Math.sin(this.elapsedSeconds * ap.speed + (ap.phase ?? 0)) * (ap.amplitude ?? 0.3);
        } else if (ap.kind === 'uvScroll' && ap.texture) {
          ap.texture.offset.x = (ap.texture.offset.x + ap.speed * dt) % 1;
          ap.texture.offset.y = (ap.texture.offset.y + (ap.speed2 ?? 0) * dt) % 1;
        } else if (ap.kind === 'pulseEmissive' && ap.material) {
          ap.material.emissiveIntensity =
            1.35 + Math.sin(this.elapsedSeconds * ap.speed + (ap.phase ?? 0)) * (ap.amplitude ?? 0.55);
        }
      }
    }

    // Electrified Coolant Damage in Level 07 if Drowned Machine is alive & player is in flooded water
    if (this.waterShockCooldown > 0) this.waterShockCooldown -= dt;
    if (
      this.inWater &&
      this.waterShockCooldown <= 0 &&
      this.enemies.some((e) => e.type === 'drowned_machine' && e.state !== 'DEAD')
    ) {
      this.waterShockCooldown = 2.6;
      this.damagePlayer(5);
    }

    // APC & Checkpoint Gate Door animations
    if (this.apcOpenAnim > 0 && this.apcOpenAnim < 1) {
      this.apcOpenAnim = Math.min(1, this.apcOpenAnim + dt * this.introDoorSpeed);
      const ease = 1 - Math.pow(1 - this.apcOpenAnim, 2);
      if (this.world.apcDoorLeft && this.world.apcDoorRight) {
        this.world.apcDoorLeft.rotation.y = THREE.MathUtils.lerp(0, 1.52, ease);
        this.world.apcDoorRight.rotation.y = THREE.MathUtils.lerp(0, -1.52, ease);
      } else if (this.world.apcHatchDoor) {
        this.world.apcHatchDoor.position.y = THREE.MathUtils.lerp(1.5, 4.3, ease);
      }
    }
    if (this.gateOpenAnim > 0 && this.gateOpenAnim < 1 && this.world.checkpointGateLeft && this.world.checkpointGateRight) {
      this.gateOpenAnim = Math.min(1, this.gateOpenAnim + dt * 0.9);
      this.world.checkpointGateLeft.position.x = THREE.MathUtils.lerp(-3.0, -8.5, this.gateOpenAnim);
      this.world.checkpointGateRight.position.x = THREE.MathUtils.lerp(3.0, 8.5, this.gateOpenAnim);
    }

    this.world.flickerLights.forEach((fl, i) => {
      if (fl.light.position.distanceToSquared(this.playerPos) > 3800) return;
      const n = Math.sin(this.elapsedSeconds * fl.speed + i * 2.1);
      fl.light.intensity = fl.base * (n > 0.85 ? 0.25 : 0.85 + 0.15 * n);
    });

    if (this.world.smokePoints) {
      const pos = this.world.smokePoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let py = pos.getY(i) - dt * 0.45;
        if (py < 0.1) py = 15;
        pos.setY(i, py);
      }
      pos.needsUpdate = true;
    }

    this.fireSystem.update(dt, this.elapsedSeconds, this.camera.position);

    if (this.world.destructibleFireEvents) {
      for (const ev of this.world.destructibleFireEvents) {
        if (ev.kind === 'falling_sign') {
          if (!ev.triggered && this.playerPos.distanceTo(ev.position) < 13.5) {
            ev.triggered = true;
            this.fireSystem.spawnBurst(ev.position, true, 20);
            this.fireSystem.spawnBurst(ev.position, false, 14);
            this.audio.playArmorShatter(ev.position.distanceTo(this.playerPos), 0);
          }
          if (ev.triggered && ev.fallProgress < 1) {
            ev.fallProgress = Math.min(1, ev.fallProgress + dt * 1.8);
            const ease = ev.fallProgress * ev.fallProgress;
            ev.mesh.position.y = THREE.MathUtils.lerp(4.35, 0.55, ease);
            ev.mesh.position.x = THREE.MathUtils.lerp(15.65, 14.9, ease);
            ev.mesh.rotation.z = ease * 1.35;
          }
        } else if (ev.kind === 'fuel_wreck') {
          if (!ev.triggered && this.playerPos.distanceTo(ev.position) < 6.2) {
            this.triggerFuelWreckExplosion(ev);
          }
        }
      }
    }

    if (this.fireHazardCooldown > 0) this.fireHazardCooldown -= dt;
    if (!this.isDead && !this.missionEnded && this.fireHazardCooldown <= 0) {
      for (let i = 0; i < this.world.fireEmitters.length; i++) {
        const em = this.world.fireEmitters[i];
        if (em.isStructural || em.position.y > 2.2) continue;
        if (this.playerPos.distanceTo(em.position) < 1.55) {
          this.fireHazardCooldown = 0.9;
          this.damagePlayer(6);
          this.showRadio('THERMAL HAZARD', 'Extreme heat — step back from open flames!');
          break;
        }
      }
    }

    if (this.world.horizonColossus) {
      this.world.horizonColossus.position.x = -55 + Math.sin(this.elapsedSeconds * 0.08) * 18;
      if (this.world.horizonColossusRefs && this.colossusTentacles) {
        updateTitanforgedNeckAnimation(this.world.horizonColossusRefs, this.colossusNeckState, {
          dt,
          time: this.elapsedSeconds,
          ownerPos: this.world.horizonColossus.position,
          ownerYaw: this.world.horizonColossus.rotation.y,
          targetPos: this.playerPos,
          lastKnownPos: this.playerPos,
          targetOccluded: false,
          aiState: 'PATROL',
          hollowExposed: false,
          bossPhase: 1,
        });
        updateMonsterTentacles(this.world.horizonColossusRefs, this.colossusTentacles, {
          dt,
          time: this.elapsedSeconds,
          enemyType: 'titanforged',
          aiState: 'PATROL',
          moveSpeed: 1.5,
          turnRate: 0,
          distToCam: 90,
        });
      }
    }

    if (this.finaleTimer > 0) {
      this.finaleTimer -= dt;
      if (this.world.distantTitan) {
        this.world.distantTitan.group.position.x += dt * 7.2;
        updateTitanforgedNeckAnimation(this.world.distantTitan, this.distantNeckState, {
          dt,
          time: this.elapsedSeconds,
          ownerPos: this.world.distantTitan.group.position,
          ownerYaw: this.world.distantTitan.group.rotation.y,
          targetPos: this.playerPos,
          lastKnownPos: this.playerPos,
          targetOccluded: false,
          aiState: 'CHASE',
          hollowExposed: false,
          bossPhase: 1,
        });
        if (this.distantTentacles) {
          updateMonsterTentacles(this.world.distantTitan, this.distantTentacles, {
            dt,
            time: this.elapsedSeconds,
            enemyType: 'titanforged',
            aiState: 'CHASE',
            moveSpeed: 7.2,
            turnRate: 0,
            distToCam: 45,
          });
        }
      }
      if (this.finaleTimer <= 0 && !this.missionEnded) {
        this.missionEnded = true;
        if (document.pointerLockElement === this.renderer.domElement) {
          document.exitPointerLock();
        }
        this.completeCurrentMissionInCampaign();
        this.callbacks.onMissionComplete(
          'THE WORLD HAS ROTTEN',
          'HELIOS is transmitting into deep space. Something colossal is already moving through the ash of New Eden.',
          this.buildChapterStats()
        );
      }
    }
  }

  private pushHud(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastHudPush < 50) return;
    this.lastHudPush = now;

    const closest = this.findClosestInteractable();
    const blips: MinimapBlip[] = [];
    for (const e of this.enemies) {
      if (!e.active || e.state === 'DEAD' || e.huskCollapsed) continue;
      blips.push({
        x: e.position.x,
        z: e.position.z,
        kind: e.isBoss ? 'boss' : 'enemy',
      });
    }
    if (this.objectiveTarget) {
      blips.push({ x: this.objectiveTarget.x, z: this.objectiveTarget.z, kind: 'objective' });
    }

    const dwellerEntity = this.enemies.find((e) => e.type === 'hollow_dweller' && e.active && e.state !== 'DEAD');
    const activeBossEntity =
      dwellerEntity ??
      this.enemies.find(
        (e) =>
          e.isBoss &&
          e.active &&
          e.state !== 'DEAD' &&
          !e.huskCollapsed &&
          (e.state === 'CHASE' ||
            e.state === 'ATTACK' ||
            e.position.distanceTo(this.playerPos) < 42 ||
            e.health < e.maxHealth)
      );

    const heading = (((-this.playerYaw * 180) / Math.PI) % 360 + 360) % 360;

    let objectiveDistance: number | null = null;
    let objectiveBearingDeg: number | null = null;
    if (this.objectiveTarget) {
      const dx = this.objectiveTarget.x - this.playerPos.x;
      const dz = this.objectiveTarget.z - this.playerPos.z;
      objectiveDistance = Math.round(Math.hypot(dx, dz));
      const worldYaw = Math.atan2(-dx, -dz);
      let rel = ((worldYaw - this.playerYaw) * 180) / Math.PI;
      while (rel > 180) rel -= 360;
      while (rel < -180) rel += 360;
      objectiveBearingDeg = Math.round(-rel);
    }

    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    const activeWepDef = this.getActiveWeaponDef();
    const isSniperAds = activeWepDef.id === 'sniper_rifle' && this.mouseDownRight && !this.isReloading;

    const bossLabel = activeBossEntity ? BOSS_DISPLAY_NAMES[activeBossEntity.type] : undefined;
    const bossSubtitle =
      activeBossEntity?.type === 'hollow_dweller'
        ? 'PHASE 4+ — DETACHED BIOLOGICAL CORE'
        : activeBossEntity?.type === 'titanforged' && activeBossEntity.hollowExposed
          ? 'PHASE 3 — THE HOLLOW BREACHED'
          : activeBossEntity && activeBossEntity.bossPhase >= 2
            ? `${bossLabel?.subtitle ?? 'BOSS'} · PHASE ${activeBossEntity.bossPhase}`
            : bossLabel?.subtitle ?? 'APEX BIOMECHANICAL THREAT';

    let interactScreenPos: { x: number; y: number } | null = null;
    if (closest) {
      _vec3A.copy(closest.position);
      _vec3A.y += 0.45;
      _vec3A.project(this.camera);
      if (_vec3A.z > -1 && _vec3A.z < 1) {
        let sx = THREE.MathUtils.clamp((_vec3A.x + 1) * 0.5, 0.14, 0.86);
        let sy = THREE.MathUtils.clamp((1 - _vec3A.y) * 0.5, 0.16, 0.80);
        if (Math.abs(sx - 0.5) < 0.09 && Math.abs(sy - 0.5) < 0.08) {
          sy = Math.min(0.80, sy + 0.11);
        }
        interactScreenPos = { x: sx, y: sy };
      }
    }

    this.callbacks.onHudUpdate({
      health: Math.ceil(this.health),
      maxHealth: this.maxHealth,
      armor: Math.ceil(this.armor),
      maxArmor: this.maxArmor,
      stamina: Math.round(this.stamina),
      flashlightOn: this.flashlightOn,
      flashlightBattery: Math.round(this.flashlightBattery),
      activeSlot: this.activeSlot,
      weapons: [{ ...this.weaponStates[0] }, { ...this.weaponStates[1] }],
      portalHud: {
        unlocked: this.campaign.portalGunUnlocked,
        blueActive: Boolean(this.portals.blue),
        orangeActive: Boolean(this.portals.orange),
        lastFired: this.portalLastFired,
        upgrades: [...this.campaign.portalUpgrades],
        toast: this.portalToast ? { ...this.portalToast } : null,
        surfaceInRange:
          this.activeSlot === 2 && this.campaign.portalGunUnlocked
            ? Boolean(this.findPortalSurfaceHit(this.hasPortalUpgrade('portal_range') ? 185 : 85))
            : false,
        linkDistanceM:
          this.portals.blue && this.portals.orange
            ? Math.round(this.portals.blue.center.distanceTo(this.portals.orange.center))
            : null,
      },
      isReloading: this.isReloading,
      reloadProgress: this.isReloading ? 1 - this.reloadTimer / this.reloadDuration : 0,
      isAiming: this.mouseDownRight && this.activeSlot !== 2,
      isCrouching: Boolean(this.keys['ControlLeft'] || this.keys['ControlRight'] || this.keys['KeyC']),
      isSprinting: Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && this.stamina > 5,
      abilityActive: this.abilityActive,
      abilityActiveRemaining: this.abilityActiveRemaining,
      abilityCooldownRemaining: this.abilityCooldownRemaining,
      abilityCooldownTotal: CHARACTERS[this.characterId].ability.cooldown,
      medkits: this.medkits,
      salvageCores: this.campaign.salvageCores,
      keycards: [...this.keycards],
      powerRestored: this.powerRestored,
      objectiveTitle: this.objectiveTitle,
      objectiveDetail: this.objectiveDetail,
      subObjectiveProgress: this.subObjectiveProgress,
      objectiveTarget: this.objectiveTarget,
      objectiveDistance,
      objectiveBearingDeg,
      compassHeading: Math.round(heading),
      interactPrompt: closest ? `[E] ${closest.label}` : null,
      interactScreenPos,
      interactEducationId: closest?.educationId ?? null,
      monstersFrozen: this.educationFrozen,
      radioBanner: this.radioBanner,
      missionBanner: this.missionBanner,
      chapterIntro: this.chapterIntro,
      secretToast: this.secretToast,
      hitMarkerTimer: this.hitMarkerTimer,
      hitMarkerCrit: this.hitMarkerCrit,
      isSniperAds,
      moveSpread: Math.min(1, horizSpeed / 7.5 + this.recoilOffset * 4),
      damageFlash: this.damageFlash,
      pointerLocked: this.pointerLocked,
      checkpointSavedTimer: this.checkpointSavedTimer,
      boss: activeBossEntity
        ? {
            active: true,
            name: bossLabel?.name ?? activeBossEntity.type.toUpperCase(),
            subtitle: bossSubtitle,
            phase: activeBossEntity.bossPhase,
            health: activeBossEntity.health,
            maxHealth: activeBossEntity.maxHealth,
            hollowExposed: activeBossEntity.hollowExposed,
            activeWarning: this.bossWarningText,
            isEnraged: activeBossEntity.bossPhase >= 5 || (activeBossEntity.type === 'titanforged' && activeBossEntity.bossPhase >= 3),
          }
        : {
            active: false,
            name: '',
            subtitle: '',
            phase: 0,
            health: 0,
            maxHealth: 1,
            hollowExposed: false,
            activeWarning: null,
            isEnraged: false,
          },
      minimapPlayer: { x: this.playerPos.x, z: this.playerPos.z, yaw: this.playerYaw },
      minimapBlips: blips,
      collectedLoreIds: [...this.collectedLoreIds],
      secretsFoundInLevel: this.levelSecretsFound,
      secretsTotalInLevel: this.missionDef.secretCount,
      inZeroG: this.inZeroG,
      inWater: this.inWater,
      activePuzzleId: this.activePuzzleId,
      workbenchOpen: this.workbenchOpen,
      endingChoiceOpen: this.endingChoiceOpen,
      inventory: [...this.inventory],
      enemiesDefeated: this.enemiesDefeated,
      elapsedSeconds: Math.floor(this.elapsedSeconds),
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private loop = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (!this.paused) {
      this.elapsedSeconds += dt;
      if (this.radioBannerTimer > 0) {
        this.radioBannerTimer -= dt;
        if (this.radioBannerTimer <= 0) this.radioBanner = null;
      }
      if (this.missionBanner) {
        this.missionBanner.timer -= dt;
        if (this.missionBanner.timer <= 0) this.missionBanner = null;
      }
      if (this.chapterIntro) {
        this.chapterIntro.timer -= dt;
        if (this.chapterIntro.timer <= 0) this.chapterIntro = null;
      }
      if (this.secretToast) {
        this.secretToast.timer -= dt;
        if (this.secretToast.timer <= 0) this.secretToast = null;
      }
      if (this.portalToast) {
        this.portalToast.timer -= dt;
        if (this.portalToast.timer <= 0) this.portalToast = null;
      }
      this.updatePortals(dt);
      if (this.hitMarkerTimer > 0) this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
      if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 1.4);
      if (this.checkpointSavedTimer > 0) this.checkpointSavedTimer = Math.max(0, this.checkpointSavedTimer - dt);

      if (!this.isDead && !this.missionEnded && !this.educationOpenId) {
        this.updatePlayer(dt);
        this.ambientCreakTimer -= dt;
        if (this.ambientCreakTimer <= 0) {
          this.ambientCreakTimer = 10 + Math.random() * 8;
          this.audio.playAmbientCreak((Math.random() - 0.5) * 1.6);
        }
        this.horrorAmbientTimer -= dt;
        if (this.horrorAmbientTimer <= 0) {
          this.horrorAmbientTimer = 6.5 + Math.random() * 7.5;
          const events = [
            'distant_shriek',
            'corridor_steps',
            'metal_creak',
            'elec_buzz',
            'machinery_hum',
            'heavy_breath',
            'wind_gust',
            'distant_impact',
          ] as const;
          const evKind = events[Math.floor(Math.random() * events.length)];
          this.audio.playAmbientHorrorEvent(
            evKind,
            (Math.random() - 0.5) * 1.8,
            20 + Math.random() * 24
          );
        }
      } else if (this.isDead) {
        this.deathAnimTimer = Math.min(1, this.deathAnimTimer + dt * 2.2);
        this.camera.position.y = THREE.MathUtils.lerp(1.5, 0.35, this.deathAnimTimer);
        this.camera.rotation.z = THREE.MathUtils.lerp(0, 0.65, this.deathAnimTimer);
      }

      this.updateEnemies(dt);
      if (!(this.educationFrozen && !this.isCoopSession)) {
        this.updateProjectilesAndParticles(dt);
        this.updateAbilitiesAndWorld(dt);
      }
      this.updateObjectiveBeacons(dt);
      this.pushHud();
    }

    if (!this.contextLost) {
      if (!this.isSoftwareGl && this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.loop);
    } else {
      this.frameId = requestAnimationFrame(this.loop);
    }
  };

  private initObjectiveBeacons(): void {
    for (const b of this.beaconPool) {
      this.scene.remove(b.group);
      b.beamMat.dispose();
      b.ringMat.dispose();
      b.markerMat.dispose();
    }
    this.beaconPool = [];

    if (!this.beaconGeoBeam) {
      this.beaconGeoBeam = new THREE.CylinderGeometry(0.12, 0.32, 6.2, 12, 1, true);
      this.beaconGeoRing = new THREE.RingGeometry(0.55, 0.85, 24);
      this.beaconGeoMarker = new THREE.OctahedronGeometry(0.22, 0);
    }

    for (let i = 0; i < 6; i++) {
      const group = new THREE.Group();
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      const markerMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        depthTest: true,
      });

      const beam = new THREE.Mesh(this.beaconGeoBeam ?? undefined, beamMat);
      beam.position.y = 3.2;
      beam.renderOrder = 2;

      const ring = new THREE.Mesh(this.beaconGeoRing ?? undefined, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09;
      ring.renderOrder = 2;

      const marker = new THREE.Mesh(this.beaconGeoMarker ?? undefined, markerMat);
      marker.position.y = 2.0;
      marker.renderOrder = 2;

      group.add(beam, ring, marker);
      group.visible = false;
      this.scene.add(group);
      this.beaconPool.push({ group, beam, ring, marker, beamMat, ringMat, markerMat });
    }
  }

  private updateObjectiveBeacons(dt: number): void {
    if (this.beaconPool.length === 0) return;

    const desired: { x: number; y: number; z: number; color: number; scale: number }[] = [];

    // 1. Main Objective Beacon (Blue)
    if (this.objectiveTarget) {
      const gy = this.groundHeightAt(this.objectiveTarget.x, this.objectiveTarget.z);
      desired.push({
        x: this.objectiveTarget.x,
        y: gy,
        z: this.objectiveTarget.z,
        color: 0x38bdf8,
        scale: 1.0,
      });
    }

    // 2. Active Boss / Danger Beacon (Red)
    const activeBoss = this.enemies.find(
      (e) => e.isBoss && e.active && e.state !== 'DEAD' && !e.huskCollapsed
    );
    if (activeBoss) {
      desired.push({
        x: activeBoss.position.x,
        y: activeBoss.position.y,
        z: activeBoss.position.z,
        color: 0xef4444,
        scale: 1.35,
      });
    }

    // 3. Nearest Collectibles / Lore / Unscanned Educational Stations / Aperture Caches
    const yellowCandidates: { x: number; y: number; z: number; distSq: number; color: number }[] = [];
    for (const item of this.world.interactables) {
      if (item.consumed || !item.mesh.visible) continue;
      const isEdu = item.kind === 'educational_scan' && !item.scannedOnce;
      const isAperture = item.kind === 'portal_gun' || item.kind === 'portal_upgrade';
      const isHighlight =
        isEdu ||
        isAperture ||
        item.kind === 'secret_cache' ||
        item.kind === 'lore' ||
        item.kind === 'keycard';
      if (!isHighlight) continue;
      const dx = item.position.x - this.playerPos.x;
      const dz = item.position.z - this.playerPos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq > 58 * 58) continue;
      yellowCandidates.push({
        x: item.position.x,
        y: Math.max(0, item.position.y - 0.5),
        z: item.position.z,
        distSq: dSq,
        color: isAperture ? 0x22d3ee : 0xfbbf24,
      });
    }
    yellowCandidates.sort((a, b) => a.distSq - b.distSq);
    for (let i = 0; i < Math.min(4, yellowCandidates.length); i++) {
      const c = yellowCandidates[i];
      desired.push({ x: c.x, y: c.y, z: c.z, color: c.color, scale: c.color === 0x22d3ee ? 0.85 : 0.72 });
    }

    const pulse = 0.5 + 0.5 * Math.sin(this.elapsedSeconds * 3.2);
    for (let i = 0; i < this.beaconPool.length; i++) {
      const slot = this.beaconPool[i];
      const target = desired[i];
      if (!target) {
        slot.group.visible = false;
        continue;
      }

      // Occlusion check so objective beams never visually clip through solid walls
      _vec3A.set(target.x, target.y + 1.4, target.z);
      _dir.copy(_vec3A).sub(this.camera.position);
      const dist = _dir.length();
      if (dist > 1.8) {
        _dir.divideScalar(dist);
        const wallHit = this.raycastWorldColliders(this.camera.position, _dir, dist - 0.9);
        if (wallHit) {
          slot.group.visible = false;
          continue;
        }
      }

      slot.group.visible = true;
      slot.group.position.set(target.x, target.y, target.z);
      slot.group.scale.setScalar(target.scale);
      slot.beamMat.color.setHex(target.color);
      slot.ringMat.color.setHex(target.color);
      slot.markerMat.color.setHex(target.color);

      const distFade = dist < 2.2 ? THREE.MathUtils.clamp((dist - 1.0) / 1.2, 0.15, 1) : 1;
      slot.beamMat.opacity = (0.14 + pulse * 0.08) * distFade;
      slot.ringMat.opacity = (0.34 + pulse * 0.22) * distFade;
      slot.markerMat.opacity = 0.8 * distFade;

      const ringScale = 0.88 + pulse * 0.28;
      slot.ring.scale.set(ringScale, ringScale, 1);
      slot.marker.position.y = 1.9 + Math.sin(this.elapsedSeconds * 2.5 + i) * 0.22;
      slot.marker.rotation.y += dt * 1.8;
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    window.removeEventListener('resize', this.onResize);

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }

    for (const b of this.beaconPool) {
      this.scene.remove(b.group);
      b.beamMat.dispose();
      b.ringMat.dispose();
      b.markerMat.dispose();
    }
    this.beaconPool = [];
    this.beaconGeoBeam?.dispose();
    this.beaconGeoRing?.dispose();
    this.beaconGeoMarker?.dispose();

    this.clearPortals(false);
    this.enemyPortalCooldowns.clear();

    for (const sw of this.shockwaves) {
      this.scene.remove(sw.mesh);
      sw.mesh.geometry.dispose();
      sw.mat.dispose();
    }
    this.shockwaves = [];
    this.sharedParticleGeo.dispose();
    this.sharedProjectileGeo.dispose();
    this.textures.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
