/**
 * EpochTransitionOverlay — Full-screen overlay for epoch transitions.
 * Shows narrative text and a continue button; triggers epochSystem.transition().
 */

export class EpochTransitionOverlay {
  constructor(EventBus, epochSystem) {
    this.eventBus = EventBus;
    this.epochSystem = epochSystem;
    this.overlay = null;
    this.transitionReady = false;
    this._beginBtn = null;
  }

  init() {
    this.overlay = document.getElementById('epoch-transition-overlay');

    this._onMilestone = (data) => this._handleMilestone(data);
    this.eventBus.on('milestone:triggered', this._onMilestone);
  }

  _handleMilestone({ milestoneId, isEpochTransitionTrigger }) {
    if (milestoneId === 'ms_stablePlanet' || isEpochTransitionTrigger) {
      this.transitionReady = true;
      this._showBeginButton();
    }
  }

  _showBeginButton() {
    // Inject a floating transition button into the toolbar area
    if (this._beginBtn) return;

    const toolbar = document.getElementById('toolbar');
    if (!toolbar) return;

    this._beginBtn = document.createElement('button');
    this._beginBtn.className = 'toolbar-btn epoch-transition-btn';
    this._beginBtn.textContent = '🌟 Begin Epoch Transition';
    this._beginBtn.addEventListener('click', () => this.show());
    toolbar.appendChild(this._beginBtn);
  }

  show() {
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = '';
    this.overlay.classList.add('epoch-crossfade');

    const content = document.createElement('div');
    content.className = 'epoch-overlay-content';

    const heading = document.createElement('h1');
    heading.className = 'epoch-heading';
    heading.textContent = 'Epoch 1 → Epoch 2';
    content.appendChild(heading);

    const narrative = document.createElement('p');
    narrative.className = 'epoch-narrative';
    narrative.textContent =
      'A world solidifies in the void. Liquid water pools on its surface. ' +
      'The primordial universe has done its work — the conditions for ' +
      'something extraordinary are assembling.';
    content.appendChild(narrative);

    const continueBtn = document.createElement('button');
    continueBtn.className = 'epoch-continue-btn';
    continueBtn.textContent = 'Continue →';
    continueBtn.addEventListener('click', () => this._doTransition());
    content.appendChild(continueBtn);

    const footer = document.createElement('div');
    footer.className = 'epoch-footer';
    footer.textContent = 'Epoch 2 — The Primordial Soup: Coming Soon';
    content.appendChild(footer);

    this.overlay.appendChild(content);
  }

  _doTransition() {
    if (this.epochSystem && typeof this.epochSystem.transition === 'function') {
      this.epochSystem.transition();
    }

    // Remove the begin button from toolbar
    if (this._beginBtn && this._beginBtn.parentNode) {
      this._beginBtn.parentNode.removeChild(this._beginBtn);
      this._beginBtn = null;
    }

    // Fade out overlay after a delay
    setTimeout(() => {
      this.overlay.classList.add('hidden');
      this.overlay.classList.remove('epoch-crossfade');
    }, 3000);
  }
}
