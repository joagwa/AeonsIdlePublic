/**
 * MilestoneNotification — Slide-in popups when milestones trigger.
 * Auto-dismisses after a duration based on text length; tracks shown IDs.
 */

export class MilestoneNotification {
  constructor(EventBus) {
    this.eventBus = EventBus;
    this.container = null;
    this.shownIds = new Set();
  }

  init() {
    this.container = document.getElementById('milestone-notification-area');

    this._onMilestoneTriggered = (data) => this._handleMilestone(data);
    this.eventBus.on('milestone:triggered', this._onMilestoneTriggered);
  }

  _handleMilestone({ milestoneId, title, flavourText, reward, triggeredAt }) {
    if (this.shownIds.has(milestoneId)) return;
    this.shownIds.add(milestoneId);

    const popup = document.createElement('div');
    popup.className = 'milestone-popup';

    const heading = document.createElement('h3');
    heading.textContent = title;
    popup.appendChild(heading);

    if (flavourText) {
      const p = document.createElement('p');
      p.textContent = flavourText;
      popup.appendChild(p);
    }

    if (reward) {
      const rewardLine = document.createElement('div');
      rewardLine.className = 'milestone-reward';
      rewardLine.style.whiteSpace = 'pre-line';
      rewardLine.textContent = this._formatReward(reward);
      popup.appendChild(rewardLine);
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'milestone-dismiss';
    dismissBtn.textContent = '✕';
    dismissBtn.addEventListener('click', () => this._dismiss(popup, timerId));
    popup.appendChild(dismissBtn);

    this.container.appendChild(popup);

    // Auto-dismiss: min 4s, scale with text length, max 8s
    const textLen = (title || '').length + (flavourText || '').length;
    const duration = Math.min(8000, Math.max(4000, textLen * 50));

    const timerId = setTimeout(() => this._dismiss(popup, null), duration);
  }

  _dismiss(popup, timerId) {
    if (timerId) clearTimeout(timerId);
    if (popup.parentNode) {
      popup.classList.add('dismissing');
      // Allow CSS transition before removal
      setTimeout(() => {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
      }, 300);
    }
  }

  _formatReward(reward) {
    const rewards = Array.isArray(reward) ? reward : [reward];
    return rewards
      .map((r) => {
        switch (r.type) {
          case 'resource_grant':
            return `Reward: +${r.amount} ${r.target}`;
          case 'unlock_mechanic':
            return `Unlocked: ${r.target}`;
          case 'cap_increase':
            return `Cap +${r.amount} ${r.target}`;
          case 'rate_bonus':
            return `Rate +${r.amount} ${r.target}/s`;
          case 'particle_storm':
            return `⚡ Particle Storm: 30s void eruption (+3× energy absorption)`;
          case 'cosmic_echo':
            return `✦ Cosmic Echo: +0.2 mass/s · +1K energy cap (permanent)`;
          default:
            return '';
        }
      })
      .filter(Boolean)
      .join('\n');
  }
}
