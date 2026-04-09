/**
 * MobileTabBar — Bottom tab navigation for mobile (≤600px).
 *
 * Renders a fixed 56px tab bar at the bottom of the screen. Tapping a tab
 * slides up a 50vh panel drawer; tapping the same tab again (or the ▼
 * collapse button in the drawer header) slides it back down.
 *
 * Panel visibility inside the drawer is managed by toggling the
 * `.mobile-panel-active` class; CSS handles all show/hide and animation.
 */

export class MobileTabBar {
  constructor(EventBus) {
    this.bus = EventBus;
    this._activePanel = null;
    this._drawerOpen = false;
    this._mq = null;

    this._tabs = [
      { panelId: 'stats-panel',          label: 'Stats',     icon: '📊' },
      { panelId: 'resource-panel',        label: 'Resources', icon: '⚡' },
      { panelId: 'upgrade-panel',         label: 'Upgrades',  icon: '🔬' },
      { panelId: 'chronicle-panel',       label: 'Chronicle', icon: '📜' },
      { panelId: 'residual-bonus-panel',  label: 'Legacy',    icon: '✨' },
    ];
  }

  init() {
    this._mq = window.matchMedia('(max-width: 600px)');

    if (this._mq.matches) {
      this._setup();
    }

    this._mq.addEventListener('change', (e) => {
      if (e.matches) {
        this._setup();
      } else {
        this._teardown();
      }
    });
  }

  // ── Setup / teardown ───────────────────────────────────────────────────────

  _setup() {
    // Chronicle panel is hidden by default on desktop; expose it for tabs.
    // Upgrade panel may also be hidden if Chronicle was open on desktop.
    const chronicle = document.getElementById('chronicle-panel');
    if (chronicle) {
      this._chronicleWasHidden = chronicle.classList.contains('hidden');
      chronicle.classList.remove('hidden');
    }
    const upgrade = document.getElementById('upgrade-panel');
    if (upgrade) upgrade.classList.remove('hidden');

    // Drawer close button.
    const closeBtn = document.getElementById('mobile-drawer-close');
    if (closeBtn) {
      closeBtn._mobileHandler = () => this._closeDrawer();
      closeBtn.addEventListener('click', closeBtn._mobileHandler);
    }

    // Settings button in drawer header opens the settings modal.
    const settingsBtn = document.getElementById('mobile-settings-btn');
    if (settingsBtn) {
      settingsBtn._mobileHandler = () => {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.classList.remove('hidden');
      };
      settingsBtn.addEventListener('click', settingsBtn._mobileHandler);
    }

    // Tab buttons.
    document.querySelectorAll('.mobile-tab').forEach(tab => {
      tab._mobileHandler = () => this._onTabClick(tab);
      tab.addEventListener('click', tab._mobileHandler);
    });

    // Open Resources by default.
    this._openPanel('resource-panel');
  }

  _teardown() {
    // Remove all mobile-specific DOM state.
    this._closeDrawer();

    this._tabs.forEach(({ panelId }) => {
      const el = document.getElementById(panelId);
      if (el) el.classList.remove('mobile-panel-active');
    });

    // Restore chronicle panel to its pre-mobile state (desktop: toggled by toolbar button).
    const chronicle = document.getElementById('chronicle-panel');
    if (chronicle && this._chronicleWasHidden !== false) {
      chronicle.classList.add('hidden');
    }
    // Restore upgrade panel (may have been hidden if Chronicle was open).
    const upgrade = document.getElementById('upgrade-panel');
    if (upgrade) upgrade.classList.remove('hidden');

    // Remove listeners.
    const closeBtn = document.getElementById('mobile-drawer-close');
    if (closeBtn?._mobileHandler) {
      closeBtn.removeEventListener('click', closeBtn._mobileHandler);
      delete closeBtn._mobileHandler;
    }

    const settingsBtn = document.getElementById('mobile-settings-btn');
    if (settingsBtn?._mobileHandler) {
      settingsBtn.removeEventListener('click', settingsBtn._mobileHandler);
      delete settingsBtn._mobileHandler;
    }

    document.querySelectorAll('.mobile-tab').forEach(tab => {
      if (tab._mobileHandler) {
        tab.removeEventListener('click', tab._mobileHandler);
        delete tab._mobileHandler;
      }
      tab.classList.remove('active');
    });

    this._activePanel = null;
  }

  // ── Interaction handlers ───────────────────────────────────────────────────

  _onTabClick(tab) {
    const panelId = tab.dataset.panel;

    // Same tab tapped while open → collapse.
    if (this._activePanel === panelId && this._drawerOpen) {
      this._closeDrawer();
    } else {
      this._openPanel(panelId);
    }
  }

  // ── Drawer state ───────────────────────────────────────────────────────────

  _openPanel(panelId) {
    this._activePanel = panelId;
    this._drawerOpen = true;

    // Show only the selected panel inside the drawer.
    this._tabs.forEach(({ panelId: id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('mobile-panel-active', id === panelId);
    });

    // Update drawer header title.
    const titleEl = document.getElementById('mobile-drawer-title');
    if (titleEl) {
      const tab = this._tabs.find(t => t.panelId === panelId);
      if (tab) titleEl.textContent = `${tab.icon} ${tab.label}`;
    }

    // Slide drawer up.
    const drawer = document.getElementById('ui-layer');
    if (drawer) drawer.classList.add('drawer-open');

    // Highlight active tab.
    document.querySelectorAll('.mobile-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.panel === panelId);
    });

    // Notify renderer to shift camera into the visible area above the drawer.
    // Drawer is 50vh, so the visible canvas centre shifts up by 25vh.
    this.bus.emit('ui:mobile:drawer:state', {
      open: true,
      offsetY: window.innerHeight * 0.25,
    });
  }

  _closeDrawer() {
    this._drawerOpen = false;

    const drawer = document.getElementById('ui-layer');
    if (drawer) drawer.classList.remove('drawer-open');

    document.querySelectorAll('.mobile-tab').forEach(btn => btn.classList.remove('active'));

    // Restore camera to centre of full canvas.
    this.bus.emit('ui:mobile:drawer:state', { open: false, offsetY: 0 });
  }
}
