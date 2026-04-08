/**
 * Aeons: The Grand Unfolding — Entry Point
 * Bootstraps all game systems in dependency order.
 */

// === Core Imports ===
import { EventBus } from './core/EventBus.js';
import { GameLoop } from './core/GameLoop.js';
import { formatNumber, setNotationMode, getNotationMode } from './core/NumberFormatter.js';
import { SaveSystem } from './core/SaveSystem.js';

// === Engine Imports ===
import { ResourceManager } from './engine/ResourceManager.js';
import { UpgradeSystem } from './engine/UpgradeSystem.js';
import { MilestoneSystem } from './engine/MilestoneSystem.js';
import { StarManager } from './engine/StarManager.js';
import { EpochSystem } from './engine/EpochSystem.js';
import { MoteController } from './engine/MoteController.js';
import { ProceduralMoteGenerator } from './engine/ProceduralMoteGenerator.js';

// === Renderer Imports ===
import { CanvasRenderer } from './renderer/CanvasRenderer.js';

// === UI Imports ===
import { ResourcePanel } from './ui/ResourcePanel.js';
import { UpgradePanel } from './ui/UpgradePanel.js';
import { MilestoneNotification } from './ui/MilestoneNotification.js';
import { ChroniclePanel } from './ui/ChroniclePanel.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { OfflineProgress } from './ui/OfflineProgress.js';
import { EpochTransitionOverlay } from './ui/EpochTransitionOverlay.js';
import { ResidualBonusPanel } from './ui/ResidualBonusPanel.js';
import { StatsPanel } from './ui/StatsPanel.js';

// === Game State ===
let gameState = {
  epochId: 'epoch1',
  pathChoice: null,
  residualBonuses: [],
  aeonCount: 0,
  totalRealTime: 0,
  settings: {
    notationMode: 'shortSuffix',
    glowEnabled: true,
  },
};

// === System Instances ===
const resourceManager = new ResourceManager(EventBus);
const upgradeSystem = new UpgradeSystem(EventBus, resourceManager);
const milestoneSystem = new MilestoneSystem(EventBus, resourceManager);
const starManager = new StarManager(EventBus, resourceManager);
const epochSystem = new EpochSystem(EventBus, resourceManager, upgradeSystem, milestoneSystem, starManager, gameState);
const moteController = new MoteController(EventBus);
const proceduralMoteGenerator = new ProceduralMoteGenerator(EventBus);

// Cross-wire systems that need references to each other
resourceManager.setUpgradeSystem(upgradeSystem);
upgradeSystem.setMilestoneSystem(milestoneSystem);

const saveSystem = new SaveSystem(EventBus, resourceManager, upgradeSystem, milestoneSystem, starManager, epochSystem, gameState, moteController);

const canvasRenderer = new CanvasRenderer(EventBus);
const resourcePanel = new ResourcePanel(EventBus);
const upgradePanel = new UpgradePanel(EventBus, upgradeSystem);
const milestoneNotification = new MilestoneNotification(EventBus);
const chroniclePanel = new ChroniclePanel(EventBus, milestoneSystem);
const settingsPanel = new SettingsPanel(EventBus, saveSystem, gameState);
const offlineProgress = new OfflineProgress(EventBus);
const epochTransitionOverlay = new EpochTransitionOverlay(EventBus, epochSystem);
const residualBonusPanel = new ResidualBonusPanel(EventBus, gameState);
const statsPanel = new StatsPanel(EventBus);

// === Bootstrap ===
async function bootstrap() {
  console.debug('[main] Bootstrapping Aeons: The Grand Unfolding');

  // Init canvas
  const mainCanvas = document.getElementById('main-canvas');
  const glowCanvas = document.getElementById('glow-canvas');
  canvasRenderer.init(mainCanvas, glowCanvas);
  canvasRenderer.setMoteController(moteController);

  // Init UI panels
  resourcePanel.setResourceManager(resourceManager);
  resourcePanel.init();
  upgradePanel.init();
  milestoneNotification.init();
  chroniclePanel.init();
  settingsPanel.init();
  offlineProgress.init();
  epochTransitionOverlay.init();
  residualBonusPanel.init();
  statsPanel.init(resourceManager, upgradeSystem, milestoneSystem);

  // --- Click handling ---
  EventBus.on('click:primaryObject', (data) => {
    const clickValue = resourceManager.getClickValue();
    resourceManager.addClick('energy', clickValue);
    canvasRenderer.spawnFloatingNumber(`+${formatNumber(clickValue)}`, data.x, data.y);
    
    // Dev mode: also generate mass proportional to passive mass rate
    if (window.AEONS_DEBUG) {
      const massState = resourceManager.get('mass');
      if (massState) {
        // Mass click = passive mass rate per second (scales with upgrades)
        const massClickValue = Math.max(0.1, massState.passiveRatePerSec || 0);
        if (massClickValue > 0) {
          resourceManager.addClick('mass', massClickValue);
          const y = data.y - 24;
          canvasRenderer.spawnFloatingNumber(`+${formatNumber(massClickValue)}`, data.x, y);
        }
      }
    }
  });

  // --- Particle absorption (Gravitational Pull visual mechanic) ---
  EventBus.on('particle:absorbed', (data) => {
    // Quality-based base value
    const qualityMultipliers = [1.0, 1.5, 2.5, 5, 10];
    const qualityMult = qualityMultipliers[Math.min(data.quality || 0, 4)] || 1.0;
    let energyValue = qualityMult;

    // Apply all absorptionMultiplier upgrades (Quantum Fluctuation, Vacuum Harvesting, etc.)
    for (const { definition: def } of upgradeSystem.getAll()) {
      if (def.effectType === 'absorptionMultiplier') {
        const level = upgradeSystem.getLevel(def.id) || 0;
        if (level > 0) {
          energyValue *= Math.pow(def.effectMagnitude, level);
        }
      }
    }

    const roundedValue = Math.max(1, Math.round(energyValue));
    resourceManager.add('energy', roundedValue);

    // Floating number at absorption point
    const floatingText = roundedValue > 1 ? `+${roundedValue}` : '+1';
    canvasRenderer.spawnFloatingNumber(floatingText, data.screenX, data.screenY - 8);

    // Mote Densification: convert absorbed motes to mass
    if (data.quality !== undefined && data.quality >= 0) {
      const level = upgradeSystem.getLevel('upg_moteDensification') || 0;
      if (level > 0) {
        const densificationMult = Math.pow(1.5, level);
        const massGain = 0.1 * qualityMult * densificationMult;
        resourceManager.add('mass', massGain);
      }
    }
  });

  // --- Milestone reward application ---
  EventBus.on('milestone:triggered', (data) => {
    if (data.reward) {
      switch (data.reward.type) {
        case 'resource_grant':
          resourceManager.add(data.reward.target, data.reward.amount);
          break;
        case 'unlock_mechanic':
          if (data.reward.target === 'darkMatter_display') {
            resourceManager.setVisible('darkMatter', true);
          } else if (data.reward.target === 'darkMatter_generation') {
            resourceManager.setGenerationEnabled('darkMatter', true);
          } else if (data.reward.target === 'heavyElements_display') {
            resourceManager.setVisible('heavyElements', true);
          } else if (data.reward.target === 'star_lifecycle') {
            starManager.addStar();
          }
          break;
        case 'cap_increase':
          resourceManager.increaseCap(data.reward.target, data.reward.amount);
          break;
        case 'rate_bonus':
          resourceManager.applyRateBonus(data.reward.target, data.reward.amount);
          break;
      }
    }
  });

  // --- Star milestones ---
  EventBus.on('milestone:triggered', (data) => {
    if (data.milestoneId === 'ms_mainSequenceStar') {
      if (starManager.getStates().length === 0) {
        starManager.addStar();
      }
    }
  });

  // --- Upgrade:purchased -> star and mote effects ---
  EventBus.on('upgrade:purchased', (data) => {
    if (data.upgradeId === 'upg_parallelStars') {
      starManager.addStar();
    }
    // Upgrade effects that modify star manager
    if (data.upgradeId === 'upg_rapidCycling') {
      starManager.setDurationMult(0.8);
    }
    if (data.upgradeId === 'upg_starLifeExtension' || data.upgradeId === 'upg_elementalYield') {
      starManager.setYieldMult(upgradeSystem);
    }
    
    // Mote generation upgrades
    if (data.upgradeId === 'upg_moteGeneration') {
      // Calculate generation rate: base 5, multiplied by 1.5^level
      const level = upgradeSystem.getLevel('upg_moteGeneration');
      const rate = 5 * Math.pow(1.5, level);
      proceduralMoteGenerator.setGenerationRate(rate);
    }
    if (data.upgradeId === 'upg_moteQuality') {
      const level = upgradeSystem.getLevel('upg_moteQuality');
      proceduralMoteGenerator.setQualityLevel(level);
    }
  });

  // --- Settings changes ---
  EventBus.on('settings:changed', (data) => {
    if (data.key === 'notationMode') {
      setNotationMode(data.value);
      gameState.settings.notationMode = data.value;
    }
    if (data.key === 'glowEnabled') {
      gameState.settings.glowEnabled = data.value;
      canvasRenderer.setGlowEnabled(data.value);
    }
  });

  // --- Epoch transition ---
  EventBus.on('epoch:transition:complete', (data) => {
    if (data.canvasConfig) {
      canvasRenderer.loadEpochConfig(data.canvasConfig);
      // Set mote controller bounds from canvas config
      moteController.setBounds(data.canvasConfig.universeWidth, data.canvasConfig.universeHeight);
    } else {
      canvasRenderer.onEpochChange(data.epochId);
    }
  });

  // --- Register game loop tick callbacks ---
  GameLoop.onTick((dt) => {
    resourceManager.tick(dt);
    milestoneSystem.check();
    starManager.tick(dt);
    moteController.tick(dt);
    gameState.totalRealTime += dt;

    // --- Energy → Mass auto-conversion (Mass Accretion mechanic) ---
    const accretionLevel = upgradeSystem.getLevel('upg_massAccretion') || 0;
    if (accretionLevel > 0) {
      // Base: drain 10 energy/s, produce 1 mass/s per level
      const energyDrainPerSec = 10 * accretionLevel;
      const baseMassPerSec = 1 * accretionLevel;

      // Primal Synthesis efficiency boost (×1.4^level)
      const synthLevel = upgradeSystem.getLevel('upg_primalSynthesis') || 0;
      const efficiencyMult = synthLevel > 0 ? Math.pow(1.4, synthLevel) : 1;
      const massPerSec = baseMassPerSec * efficiencyMult;

      const energyState = resourceManager.get('energy');
      if (energyState && energyState.currentValue > 0) {
        const energyAvailable = energyState.currentValue;
        const energyToDrain = Math.min(energyAvailable, energyDrainPerSec * dt);
        const fraction = energyToDrain / (energyDrainPerSec * dt);
        const massProduced = massPerSec * dt * fraction;

        if (energyToDrain > 0.001) {
          resourceManager.spend('energy', energyToDrain);
          resourceManager.add('mass', massProduced);
          EventBus.emit('mass:converted', { energySpent: energyToDrain, massGained: massProduced });
        }
      }
    }
  });

  // Camera centering is handled in CanvasRenderer.onFrame() — no lerp needed

  // --- Register render frame callback ---
  GameLoop.onFrame((ts) => {
    canvasRenderer.onFrame(ts);
  });

  // --- Attempt load or fresh start ---
  let localStorageAvailable = true;
  try {
    localStorage.setItem('__aeons_test', '1');
    localStorage.removeItem('__aeons_test');
  } catch (e) {
    localStorageAvailable = false;
  }

  if (!localStorageAvailable) {
    showBanner('save-error-banner', '⚠ Progress cannot be saved in this browser mode.', 'warning');
  }

  const loaded = await saveSystem.load();
  console.log(`[Bootstrap] Save loaded: ${loaded}`);
  if (!loaded) {
    await epochSystem.loadEpoch('epoch1');
    console.log('[Bootstrap] Fresh epoch1 loaded');
  }

  // Initialise mote controller with home object position from canvas config
  {
    const ho = canvasRenderer.canvasConfig?.homeObject;
    const initX = ho?.worldX ?? 600;
    const initY = ho?.worldY ?? 1500;
    console.log(`[Bootstrap] MoteController init at (${initX}, ${initY})`);
    moteController.init(initX, initY);
    if (canvasRenderer.canvasConfig) {
      moteController.setBounds(
        canvasRenderer.canvasConfig.universeWidth,
        canvasRenderer.canvasConfig.universeHeight
      );
    }
  }

  // Apply saved settings
  setNotationMode(gameState.settings.notationMode);

  // Dev mode: boost initial resources for faster iteration
  if (window.AEONS_DEBUG) {
    resourceManager.add('energy', 50);    // 50 initial energy
    resourceManager.add('mass', 10);       // 10 initial mass
  }

  // Default glow off on mobile
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isMobile && gameState.settings.glowEnabled === undefined) {
    gameState.settings.glowEnabled = false;
  }
  canvasRenderer.setGlowEnabled(gameState.settings.glowEnabled);

  // Start systems
  if (localStorageAvailable) {
    saveSystem.startAutoSave();
  }
  GameLoop.start();

  // Tab conflict detection
  if (localStorageAvailable) {
    window.addEventListener('storage', (e) => {
      if (e.key === 'aeons_save_v1' && e.newValue !== null) {
        showBanner('tab-conflict-banner', '⚠ The game is open in another tab. Saving here may overwrite that session\'s progress.', 'warning');
      }
    });
  }

  // Debug mode
  if (window.AEONS_DEBUG) {
    window.aeons = {
      gameLoop: GameLoop,
      resourceManager,
      upgradeSystem,
      milestoneSystem,
      starManager,
      epochSystem,
      saveSystem,
      canvasRenderer,
      moteController,
      proceduralMoteGenerator,
      eventBus: EventBus,
      gameState,
    };
  }

  console.debug('[main] Bootstrap complete');
}

function showBanner(id, message, type) {
  const banner = document.getElementById(id);
  if (!banner) return;
  banner.className = `banner ${type}`;
  banner.innerHTML = `<span>${message}</span><button class="dismiss-btn" onclick="this.parentElement.classList.add('hidden')">Dismiss</button>`;
  banner.classList.remove('hidden');
}

// --- DOM Ready ---
document.addEventListener('DOMContentLoaded', bootstrap);
