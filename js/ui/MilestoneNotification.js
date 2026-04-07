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
    switch (reward.type) {
      case 'resource_grant':
        return `Reward: +${reward.amount} ${reward.target}`;
      case 'unlock_mechanic':
        return `Unlocked: ${reward.target}`;
      case 'cap_increase':
        return `Cap +${reward.amount} ${reward.target}`;
      case 'rate_bonus':
        return `Rate +${reward.amount} ${reward.target}`;
      default:
        return '';
    }
  }
}
