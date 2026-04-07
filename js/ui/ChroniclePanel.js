/**
 * ChroniclePanel — Timeline log of triggered milestones.
 * Toggles visibility with the upgrade panel.
 */

export class ChroniclePanel {
  constructor(EventBus, milestoneSystem) {
    this.eventBus = EventBus;
    this.milestoneSystem = milestoneSystem;
    this.listEl = null;
    this.toggleBtn = null;
    this.chroniclePanel = null;
    this.upgradePanel = null;
  }

  init() {
    this.listEl = document.getElementById('chronicle-list');
    this.toggleBtn = document.getElementById('chronicle-toggle');
    this.chroniclePanel = document.getElementById('chronicle-panel');
    this.upgradePanel = document.getElementById('upgrade-panel');

    // Populate from existing log
    const log = this.milestoneSystem.getChronicleLog();
    if (log && log.length) {
      for (const entry of log) {
        this._appendEntry(entry.title, entry.triggeredAt);
      }
    }

    // Toggle behaviour
    this.toggleBtn.addEventListener('click', () => this._toggle());

    this._onMilestoneTriggered = (data) => {
      this._appendEntry(data.title, data.triggeredAt);
    };
    this.eventBus.on('milestone:triggered', this._onMilestoneTriggered);
  }

  _toggle() {
    const isHidden = this.chroniclePanel.classList.contains('hidden');
    if (isHidden) {
      this.chroniclePanel.classList.remove('hidden');
      this.upgradePanel.classList.add('hidden');
    } else {
      this.chroniclePanel.classList.add('hidden');
      this.upgradePanel.classList.remove('hidden');
    }
  }

  _appendEntry(title, timestamp) {
    const el = document.createElement('div');
    el.className = 'chronicle-entry';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'chronicle-title';
    titleDiv.textContent = title;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'chronicle-time';
    timeDiv.textContent = this._formatTime(timestamp);

    el.appendChild(titleDiv);
    el.appendChild(timeDiv);
    this.listEl.appendChild(el);
  }

  _formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
}
