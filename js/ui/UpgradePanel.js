/**
 * UpgradePanel — Renders upgrade cards grouped by cost resource.
 * Supports multi-level upgrades with level progress badges and pip indicators.
 * Only shows upgrades whose cost-resource has been unlocked.
 */

import { formatNumber } from '../core/NumberFormatter.js?v=688067a';

const GROUP_ORDER = ['energy', 'mass', 'darkMatter', 'heavyElements'];
const GROUP_LABELS = {
  energy:        '⚡ Energy Upgrades',
  mass:          '⚫ Mass Upgrades',
  darkMatter:    '🌑 Dark Matter Upgrades',
  heavyElements: '⚗️ Heavy Element Upgrades',
};

export class UpgradePanel {
  constructor(EventBus, upgradeSystem) {
    this.eventBus = EventBus;
    this.upgradeSystem = upgradeSystem;
    this.container = null;
    this.cards = {};
    this._collapsedGroups = new Set(); // track which groups are collapsed
    this._collapsed = false; // whole-panel collapse
  }

  init() {
    this.container = document.getElementById('upgrade-list');
    this._renderAll();

    this.eventBus.on('upgrade:purchased',             () => this._renderAll());
    this.eventBus.on('upgrade:affordability:changed', () => this._refreshCardStates());
    this.eventBus.on('milestone:triggered',           () => this._renderAll());
    this.eventBus.on('resource:visibility:changed',   () => this._renderAll());
    this.eventBus.on('epoch:transition:complete',     () => this._renderAll());

    const header = document.getElementById('upgrade-panel-header');
    if (header) header.addEventListener('click', () => this._toggleCollapse());
  }

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  _renderAll() {
    this.container.innerHTML = '';
    this.cards = {};

    const all = this.upgradeSystem.getAll();
    if (!all || all.length === 0) return;

    // Only show upgrades whose cost-resource is visible (or already leveled)
    const visible = all.filter(({ definition: def }) => this.upgradeSystem.isVisible(def.id));

    // Group by costResource
    const groups = new Map();
    for (const upg of visible) {
      const key = upg.definition.costResource;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(upg);
    }

    const orderedKeys = [
      ...GROUP_ORDER.filter(k => groups.has(k)),
      ...[...groups.keys()].filter(k => !GROUP_ORDER.includes(k)),
    ];

    for (const key of orderedKeys) {
      const upgList = groups.get(key);

      // Sort: canBuy+leveled > canBuy+new > cost-locked > gate-locked > maxed
      upgList.sort((a, b) => this._sortPriority(a) - this._sortPriority(b) || a.definition.baseCost - b.definition.baseCost);

      // Skip group if everything in it is maxed
      if (upgList.every(u => u.state.purchased)) continue;

      const isCollapsed = this._collapsedGroups.has(key);
      const activeCount = upgList.filter(u => !u.state.purchased).length;

      const header = document.createElement('div');
      header.className = 'upgrade-group-header';
      header.innerHTML = `<span class="group-toggle">${isCollapsed ? '▶' : '▼'}</span> ${GROUP_LABELS[key] || key} <span class="group-count">(${activeCount})</span>`;
      header.style.cursor = 'pointer';
      header.addEventListener('click', () => {
        if (this._collapsedGroups.has(key)) {
          this._collapsedGroups.delete(key);
        } else {
          this._collapsedGroups.add(key);
        }
        this._renderAll();
      });
      this.container.appendChild(header);

      if (!isCollapsed) {
        for (const { definition: def, state } of upgList) {
          if (state.purchased) continue; // hide maxed upgrades
          const canBuy = this.upgradeSystem.canPurchase(def.id);
          const lockReason = this.upgradeSystem.getLockReason(def.id);
          const card = this._createCard(def, state, canBuy, lockReason);
          this.cards[def.id] = card;
          this.container.appendChild(card.el);
        }
      }
    }

    if (Object.keys(this.cards).length === 0) {
      const empty = document.createElement('div');
      empty.className = 'upgrade-empty';
      empty.textContent = 'All upgrades purchased!';
      this.container.appendChild(empty);
    }
  }

  /** 0=canBuy+leveled, 1=canBuy+new, 2=cost-locked, 3=gate-locked, 4=maxed */
  _sortPriority({ definition: def, state }) {
    if (state.purchased) return 4;
    if (this.upgradeSystem.canPurchase(def.id)) return state.level > 0 ? 0 : 1;
    if (this.upgradeSystem.getLockReason(def.id) === null) return 2;
    return 3;
  }

  _refreshCardStates() {
    const allUpgrades = this.upgradeSystem.getAll();
    for (const [upgradeId, card] of Object.entries(this.cards)) {
      if (card.el.classList.contains('purchased')) continue;
      const upg = allUpgrades.find(u => u.definition.id === upgradeId);
      if (upg?.state?.purchased) { this._renderAll(); return; }
      const canBuy = this.upgradeSystem.canPurchase(upgradeId);
      const lockReason = this.upgradeSystem.getLockReason(upgradeId);
      // Update displayed cost (scales with level for multi-level upgrades)
      if (card.costDiv) {
        const def = upg?.definition;
        if (def) {
          const cost = this.upgradeSystem.getCost(upgradeId);
          card.costDiv.textContent = `Cost: ${formatNumber(cost)} ${def.costResource || ''}`.trim();
        }
      }
      this._applyState(card, false, canBuy, lockReason);
    }
  }

  // ---------------------------------------------------------------
  // Mechanical hint
  // ---------------------------------------------------------------

  /** Generates a one-line mechanical effect summary for an upgrade card. */
  _mechHint(def) {
    const mag = def.effectMagnitude;
    const target = def.effectTarget || '';
    const multi = (def.maxLevel || 1) > 1 ? ' per level' : '';
    // formatRate handles small decimals (0.2 → "0.2"), formatNumber floors them to 0
    const fmtMag = mag < 1000 && mag !== Math.floor(mag) ? mag.toFixed(1) : formatNumber(mag);
    switch (def.effectType) {
      case 'rateAdditive':
        return `⚙ +${fmtMag} ${target}/s${multi}`;
      case 'rateMultiplier':
        return `⚙ ×${mag} ${target} rate${multi}`;
      case 'clickMultiplier':
        return `⚙ ×${mag} click power${multi}`;
      case 'capIncrease':
        return `⚙ +${formatNumber(mag)} ${target} storage${multi}`;
      case 'unlock': {
        const unlockLabels = {
          moteMovement: '⚙ Enables WASD movement',
          moteSpeed: `⚙ +${fmtMag} max speed${multi}`,
          moteTurn: `⚙ +${fmtMag} turn speed${multi}`,
          tractorBeam: `⚙ +${fmtMag} pull range${multi}`,
        };
        return unlockLabels[target] || `⚙ Unlocks ${target}`;
      }
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------
  // Card creation
  // ---------------------------------------------------------------

  _createCard(def, state, canBuy, lockReason) {
    const maxLevel = def.maxLevel || 1;
    const isMultiLevel = maxLevel > 1;

    const el = document.createElement('div');
    el.className = 'upgrade-card';
    el.dataset.id = def.id;

    // Title row: name + optional level badge
    const titleRow = document.createElement('div');
    titleRow.className = 'upgrade-title-row';

    const nameDiv = document.createElement('span');
    nameDiv.className = 'upgrade-name';
    nameDiv.textContent = def.name;
    titleRow.appendChild(nameDiv);

    if (isMultiLevel) {
      const badge = document.createElement('span');
      badge.className = 'upgrade-level-badge';
      badge.textContent = `Lv ${state.level}/${maxLevel}`;
      titleRow.appendChild(badge);
    }

    const descDiv = document.createElement('div');
    descDiv.className = 'upgrade-desc';
    descDiv.textContent = def.description;

    const hint = this._mechHint(def);
    let hintDiv = null;
    if (hint) {
      hintDiv = document.createElement('div');
      hintDiv.className = 'upgrade-mechanic';
      hintDiv.textContent = hint;
    }

    const costDiv = document.createElement('div');
    costDiv.className = 'upgrade-cost';
    const cost = this.upgradeSystem.getCost(def.id);
    costDiv.textContent = `Cost: ${formatNumber(cost)} ${def.costResource || ''}`.trim();

    // Level pip track for multi-level upgrades
    let pipsEl = null;
    if (isMultiLevel) {
      pipsEl = document.createElement('div');
      pipsEl.className = 'upgrade-level-pips';
      for (let i = 0; i < maxLevel; i++) {
        const pip = document.createElement('span');
        pip.className = 'pip' + (i < state.level ? ' filled' : '');
        pipsEl.appendChild(pip);
      }
    }

    const lockDiv = document.createElement('div');
    lockDiv.className = 'upgrade-lock';

    const btn = document.createElement('button');
    btn.className = 'upgrade-btn';
    btn.textContent = isMultiLevel
      ? (state.level > 0 ? '↑ Upgrade' : 'Unlock')
      : 'Buy';
    btn.addEventListener('click', () => this.upgradeSystem.purchase(def.id));

    el.appendChild(titleRow);
    el.appendChild(descDiv);
    if (hintDiv) el.appendChild(hintDiv);
    el.appendChild(costDiv);
    if (pipsEl) el.appendChild(pipsEl);
    el.appendChild(lockDiv);
    el.appendChild(btn);

    const card = { el, nameDiv, costDiv, lockDiv, btn, pipsEl, maxLevel };
    this._applyState(card, false, canBuy, lockReason);
    return card;
  }

  _applyState(card, purchased, canBuy, lockReason) {
    const { el, costDiv, lockDiv, btn } = card;

    el.classList.remove('purchased', 'affordable', 'unaffordable', 'locked');
    costDiv.classList.remove('can-afford');
    lockDiv.textContent = '';
    btn.disabled = false;

    if (purchased) {
      el.classList.add('purchased');
      btn.textContent = '✓ Maxed';
      btn.disabled = true;
      return;
    }

    if (lockReason) {
      el.classList.add('locked');
      lockDiv.textContent = `🔒 ${lockReason}`;
      btn.disabled = true;
      return;
    }

    if (canBuy) {
      el.classList.add('affordable');
      costDiv.classList.add('can-afford');
    } else {
      el.classList.add('unaffordable');
      btn.disabled = true;
    }
  }

  _toggleCollapse() {
    this._collapsed = !this._collapsed;
    const body = document.getElementById('upgrade-body');
    const panel = document.getElementById('upgrade-panel');
    if (body) body.classList.toggle('collapsed', this._collapsed);
    if (panel) panel.classList.toggle('panel-collapsed', this._collapsed);
    const icon = document.querySelector('#upgrade-panel-header .collapse-icon');
    if (icon) icon.textContent = this._collapsed ? '▼' : '▲';
  }
}

