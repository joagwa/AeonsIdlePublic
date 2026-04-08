/**
 * Aeons: The Grand Unfolding — Entry Point
 * Bootstraps all game systems in dependency order.
 */

// === Core Imports ===
import { EventBus } from './core/EventBus.js?v=553db90';
import { GameLoop } from './core/GameLoop.js?v=553db90';
import { formatNumber, setNotationMode, getNotationMode } from './core/NumberFormatter.js?v=553db90';
import { SaveSystem } from './core/SaveSystem.js?v=553db90';
import { UpdateChecker } from './core/UpdateChecker.js?v=553db90';

// === Engine Imports ===
import { ResourceManager } from './engine/ResourceManager.js?v=553db90';
import { UpgradeSystem } from './engine/UpgradeSystem.js?v=553db90';
import { MilestoneSystem } from './engine/MilestoneSystem.js?v=553db90';
import { StarManager } from './engine/StarManager.js?v=553db90';
import { EpochSystem } from './engine/EpochSystem.js?v=553db90';
import { MoteController } from './engine/MoteController.js?v=553db90';
import { ProceduralMoteGenerator } from './engine/ProceduralMoteGenerator.js?v=553db90';

// === Renderer Imports ===
import { CanvasRenderer } from './renderer/CanvasRenderer.js?v=553db90';

// === UI Imports ===
import { ResourcePanel } from './ui/ResourcePanel.js?v=553db90';
import { UpgradePanel } from './ui/UpgradePanel.js?v=553db90';
import { MilestoneNotification } from './ui/MilestoneNotification.js?v=553db90';
import { ChroniclePanel } from './ui/ChroniclePanel.js?v=553db90';
import { SettingsPanel } from './ui/SettingsPanel.js?v=553db90';
import { OfflineProgress } from './ui/OfflineProgress.js?v=553db90';
import { EpochTransitionOverlay } from './ui/EpochTransitionOverlay.js?v=553db90';
import { ResidualBonusPanel } from './ui/ResidualBonusPanel.js?v=553db90';
import { StatsPanel } from './ui/StatsPanel.js?v=553db90';
import { GoalWidget } from './ui/GoalWidget.js?v=553db90';
import { MobileTabBar } from './ui/MobileTabBar.js?v=553db90';

// === Game State ===
let gameState = {
  epochId: 'epoch1',
  pathChoice: null,
  residualBonuses: [],
  aeonCount: 0,
  totalRealTime: 0,
  cosmicEchoCount: 0,
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
const goalWidget = new GoalWidget(EventBus, milestoneSystem, resourceManager);
const mobileTabBar = new MobileTabBar(EventBus);

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
  goalWidget.init();
  mobileTabBar.init();

  // --- Particle Storm state (tracks absorption bonus end time) ---
  let _particleStormEndTime = 0;

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

    // Triple energy absorption during Particle Storm
    const stormBonus = (_particleStormEndTime > 0 && Date.now() < _particleStormEndTime) ? 3 : 1;
    resourceManager.add('energy', roundedValue * stormBonus);

    // Floating number at absorption point
    const floatingText = roundedValue * stormBonus > 1 ? `+${roundedValue * stormBonus}` : '+1';
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
    const rewards = Array.isArray(data.reward)
      ? data.reward
      : data.reward
      ? [data.reward]
      : [];

    for (const reward of rewards) {
      switch (reward.type) {
        case 'resource_grant':
          resourceManager.add(reward.target, reward.amount);
          break;
        case 'unlock_mechanic':
          if (reward.target === 'darkMatter_display') {
            resourceManager.setVisible('darkMatter', true);
          } else if (reward.target === 'darkMatter_generation') {
            resourceManager.setGenerationEnabled('darkMatter', true);
          } else if (reward.target === 'heavyElements_display') {
            resourceManager.setVisible('heavyElements', true);
          } else if (reward.target === 'star_lifecycle') {
            starManager.addStar();
          }
          break;
        case 'cap_increase':
          resourceManager.increaseCap(reward.target, reward.amount);
          break;
        case 'rate_bonus':
          resourceManager.applyRateBonus(reward.target, reward.amount);
          break;
        case 'particle_storm':
          canvasRenderer.activateParticleStorm(30_000);
          _particleStormEndTime = Date.now() + 30_000;
          setTimeout(() => { _particleStormEndTime = 0; }, 30_000);
          break;
        case 'cosmic_echo':
          gameState.cosmicEchoCount = (gameState.cosmicEchoCount || 0) + 1;
          resourceManager.applyRateBonus('mass', 0.2);
          resourceManager.applyCapBonus('energy', 1000);
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
    if (data.upgradeId === 'upg_moteGeneration' || data.upgradeId === 'upg_moteFlood' || data.upgradeId === 'upg_voidSaturation') {
      const genLevel = upgradeSystem.getLevel('upg_moteGeneration');
      const floodLevel = upgradeSystem.getLevel('upg_moteFlood');
      const satLevel = upgradeSystem.getLevel('upg_voidSaturation');
      const rate = 5 * Math.pow(1.5, genLevel) * Math.pow(2.0, floodLevel) * Math.pow(3.0, satLevel);
      proceduralMoteGenerator.setGenerationRate(rate);
      // Increase void particle density proportional to generation rate
      const voidCount = Math.min(500, Math.floor(80 + rate));
      if (canvasRenderer.particleSystem) {
        canvasRenderer.particleSystem.spawnInitialParticles('void', voidCount);
      }
    }
    if (data.upgradeId === 'upg_moteQuality') {
      const level = upgradeSystem.getLevel('upg_moteQuality');
      proceduralMoteGenerator.setQualityLevel(level);
      canvasRenderer.particleSystem.setQualityLevel(level);
    }

    // Show conversion slider when Mass Accretion is unlocked
    if (data.upgradeId === 'upg_massAccretion') {
      const sliderRow = document.getElementById('conversion-slider-row');
      if (sliderRow) sliderRow.classList.remove('hidden');
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
      // Restrict procedural mote generation to defined regions
      if (typeof proceduralMoteGenerator.setValidRegions === 'function') {
        proceduralMoteGenerator.setValidRegions(data.canvasConfig.regions);
      }
    } else {
      canvasRenderer.onEpochChange(data.epochId);
    }
  });

  // --- Register game loop tick callbacks ---

  // --- Conversion slider wiring ---
  const convSlider = document.getElementById('conversion-slider');
  const convPct = document.getElementById('conversion-pct');
  if (convSlider) {
    convSlider.addEventListener('input', () => {
      const val = parseInt(convSlider.value, 10) / 100;
      canvasRenderer.setConversionRate(val);
      if (convPct) convPct.textContent = `${Math.round(val * 100)}% rate`;
    });
    // Set initial label
    if (convPct) convPct.textContent = `${convSlider.value}% rate`;
  }

  // Timer-based conversion accumulator
  let _conversionAccumulator = 0;

  GameLoop.onTick((dt) => {
    resourceManager.tick(dt);
    milestoneSystem.check();
    starManager.tick(dt);
    gameState.totalRealTime += dt;

    // --- Energy → Mass timer-based pulse conversion ---
    const accretionLevel = upgradeSystem.getLevel('upg_massAccretion') || 0;
    if (accretionLevel > 0) {
      const conversionRate = canvasRenderer.getConversionRate(); // 0..1 from slider
      if (conversionRate > 0) {
        // Advance accumulator proportional to slider rate
        _conversionAccumulator += dt * conversionRate;

        // Base pulse interval 2s; Rapid Accretion shrinks it ×0.8/level, Singularity Engine ×0.7/level
        const rapidLevel = upgradeSystem.getLevel('upg_rapidAccretion') || 0;
        const singularityLevel = upgradeSystem.getLevel('upg_singularityEngine') || 0;
        const pulseInterval = Math.max(0.05, 2.0 * Math.pow(0.8, rapidLevel) * Math.pow(0.7, singularityLevel));

        while (_conversionAccumulator >= pulseInterval) {
          _conversionAccumulator -= pulseInterval;

          // Energy cost per pulse = accretionLevel × 10
          const energyCost = accretionLevel * 10;
          const energyState = resourceManager.get('energy');
          const energyAvailable = energyState ? energyState.currentValue : 0;

          if (energyAvailable >= energyCost * 0.01) {
            // Partial pulse if not enough energy
            const fraction = Math.min(1, energyAvailable / energyCost);
            const energyToDrain = energyCost * fraction;

            // Mass per pulse = accretionLevel × efficiency (primalSynthesis) × bulk multiplier (massForge)
            const synthLevel = upgradeSystem.getLevel('upg_primalSynthesis') || 0;
            const forgeLevel = upgradeSystem.getLevel('upg_massForge') || 0;
            const efficiencyMult = Math.pow(1.4, synthLevel) * Math.pow(1.5, forgeLevel);
            const massGained = accretionLevel * efficiencyMult * fraction;

            resourceManager.spend('energy', energyToDrain);
            resourceManager.add('mass', massGained);
            EventBus.emit('mass:converted', { energySpent: energyToDrain, massGained });
          }
        }
      } else {
        _conversionAccumulator = 0;
      }
    }
  });

  // Camera centering is handled in CanvasRenderer.onFrame() — no lerp needed

  // --- Register render frame callback (mote movement runs here for 60fps smoothness) ---
  let _lastFrameTs = null;
  GameLoop.onFrame((ts) => {
    if (_lastFrameTs !== null) {
      const realDt = Math.min((ts - _lastFrameTs) / 1000, 0.1);
      moteController.tick(realDt);
    }
    _lastFrameTs = ts;
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
    const initX = ho?.worldX ?? 2000;
    const initY = ho?.worldY ?? 2500;
    console.log(`[Bootstrap] MoteController init at (${initX}, ${initY})`);
    moteController.init(initX, initY, mainCanvas);
    if (canvasRenderer.canvasConfig) {
      moteController.setBounds(
        canvasRenderer.canvasConfig.universeWidth,
        canvasRenderer.canvasConfig.universeHeight
      );
      // Restrict procedural mote generation to defined regions
      if (typeof proceduralMoteGenerator.setValidRegions === 'function') {
        proceduralMoteGenerator.setValidRegions(canvasRenderer.canvasConfig.regions);
      }
    }
  }

  // Apply saved settings
  setNotationMode(gameState.settings.notationMode);

  // Show conversion slider if Mass Accretion was already purchased
  if (upgradeSystem.getLevel('upg_massAccretion') > 0) {
    const sliderRow = document.getElementById('conversion-slider-row');
    if (sliderRow) sliderRow.classList.remove('hidden');
  }

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

  // --- Update Checker ---
  const gameVersion = document.querySelector('meta[name="game-version"]')?.content || 'dev';
  const updateChecker = new UpdateChecker(EventBus, gameVersion);
  EventBus.on('update:available', (data) => {
    showUpdateBanner(data.newVersion);
  });
  updateChecker.start();

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

function showUpdateBanner(newVersion) {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.className = 'banner info';
  banner.innerHTML = `
    <span>🔄 A new version of Aeons is available!</span>
    <button class="refresh-btn" onclick="window.location.reload()">Refresh Now</button>
    <button class="dismiss-btn" onclick="this.parentElement.classList.add('hidden')">Later</button>
  `;
  banner.classList.remove('hidden');
}

// --- DOM Ready ---
document.addEventListener('DOMContentLoaded', bootstrap);
