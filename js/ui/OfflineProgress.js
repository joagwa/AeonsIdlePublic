/**
 * OfflineProgress — Modal showing resource gains accumulated while away.
 */

import { formatNumber } from '../core/NumberFormatter.js?v=d57f9ab';

export class OfflineProgress {
  constructor(EventBus) {
    this.eventBus = EventBus;
    this.modal = null;
  }

  init() {
    this.modal = document.getElementById('offline-progress-modal');

    this._onOfflineProgress = (data) => this._handleOffline(data);
    this.eventBus.on('save:offline_progress_applied', this._onOfflineProgress);
  }

  _handleOffline({ elapsedSeconds, gains }) {
    if (!gains || !this._hasAnyGain(gains)) return;

    this.modal.innerHTML = '';
    this.modal.classList.remove('hidden');

    const content = document.createElement('div');
    content.className = 'modal-content offline-content';

    const heading = document.createElement('h2');
    heading.textContent = 'Welcome Back!';
    content.appendChild(heading);

    const timeP = document.createElement('p');
    timeP.className = 'offline-time';
    timeP.textContent = `You were away for ${this._formatDuration(elapsedSeconds)}`;
    content.appendChild(timeP);

    const gainsDiv = document.createElement('div');
    gainsDiv.className = 'offline-gains';
    const parts = [];
    for (const [resourceId, amount] of Object.entries(gains)) {
      if (amount > 0) {
        parts.push(`+${formatNumber(amount)} ${resourceId}`);
      }
    }
    gainsDiv.textContent = parts.join(' · ');
    content.appendChild(gainsDiv);

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'offline-dismiss';
    dismissBtn.textContent = 'Continue';
    dismissBtn.addEventListener('click', () => this._dismiss());
    content.appendChild(dismissBtn);

    this.modal.appendChild(content);

    this._autoDismissTimer = setTimeout(() => this._dismiss(), 8000);
  }

  _dismiss() {
    if (this._autoDismissTimer) {
      clearTimeout(this._autoDismissTimer);
      this._autoDismissTimer = null;
    }
    this.modal.classList.add('hidden');
  }

  _hasAnyGain(gains) {
    for (const amount of Object.values(gains)) {
      if (amount > 0) return true;
    }
    return false;
  }

  _formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0 && minutes > 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    if (hours > 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
}
