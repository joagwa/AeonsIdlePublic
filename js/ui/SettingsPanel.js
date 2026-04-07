/**
 * SettingsPanel — Modal with notation, glow, save/export/import/reset controls.
 */

export class SettingsPanel {
  constructor(EventBus, saveSystem, gameState) {
    this.eventBus = EventBus;
    this.saveSystem = saveSystem;
    this.gameState = gameState;
    this.modal = null;
    this.body = null;
  }

  init() {
    this.modal = document.getElementById('settings-modal');
    this.body = document.getElementById('settings-body');
    const toggleBtn = document.getElementById('settings-toggle');
    const closeBtn = document.getElementById('settings-close');

    this._buildUI();

    // Toggle open/close
    toggleBtn.addEventListener('click', () => this._open());
    closeBtn.addEventListener('click', () => this._close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this._close();
    });

    this._onSaveCompleted = () => this._flashSaved();
    this._onSettingsChanged = (data) => this._syncUI(data);

    this.eventBus.on('save:completed', this._onSaveCompleted);
    this.eventBus.on('settings:changed', this._onSettingsChanged);
  }

  _open() {
    this.modal.classList.remove('hidden');
  }

  _close() {
    this.modal.classList.add('hidden');
  }

  _buildUI() {
    this.body.innerHTML = '';

    // --- Notation selector ---
    const notationGroup = this._group('Notation');
    const notationSelect = document.createElement('select');
    notationSelect.className = 'settings-select';
    const modes = [
      { value: 'shortSuffix', label: 'Short Suffix (1.5K)' },
      { value: 'scientific', label: 'Scientific (1.5e3)' },
    ];
    for (const m of modes) {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      if (this.gameState.settings.notationMode === m.value) opt.selected = true;
      notationSelect.appendChild(opt);
    }
    notationSelect.addEventListener('change', () => {
      this.eventBus.emit('settings:changed', { key: 'notationMode', value: notationSelect.value });
    });
    notationGroup.appendChild(notationSelect);
    this.body.appendChild(notationGroup);
    this._notationSelect = notationSelect;

    // --- Glow toggle ---
    const glowGroup = this._group('Glow Effects');
    const glowLabel = document.createElement('label');
    glowLabel.className = 'settings-checkbox-label';
    const glowCheck = document.createElement('input');
    glowCheck.type = 'checkbox';
    glowCheck.checked = this.gameState.settings.glowEnabled !== false;
    glowCheck.addEventListener('change', () => {
      this.eventBus.emit('settings:changed', { key: 'glowEnabled', value: glowCheck.checked });
    });
    glowLabel.appendChild(glowCheck);
    glowLabel.appendChild(document.createTextNode(' Enable glow'));
    glowGroup.appendChild(glowLabel);
    this.body.appendChild(glowGroup);
    this._glowCheck = glowCheck;

    // --- Debug mode toggle ---
    const debugGroup = this._group('Debug');
    const debugLabel = document.createElement('label');
    debugLabel.className = 'settings-checkbox-label';
    const debugCheck = document.createElement('input');
    debugCheck.type = 'checkbox';
    debugCheck.checked = window.AEONS_DEBUG === true;
    debugCheck.addEventListener('change', () => {
      window.AEONS_DEBUG = debugCheck.checked;
      const msg = debugCheck.checked 
        ? '🔧 Debug mode ON (5x click, +50/+10 resources)' 
        : '🔧 Debug mode OFF (production settings)';
      console.log(msg);
    });
    debugLabel.appendChild(debugCheck);
    debugLabel.appendChild(document.createTextNode(' Enable dev features'));
    const debugNote = document.createElement('small');
    debugNote.style.display = 'block';
    debugNote.style.marginTop = '8px';
    debugNote.style.opacity = '0.7';
    debugNote.textContent = '(5x click, +50/+10 resources)';
    debugGroup.appendChild(debugLabel);
    debugGroup.appendChild(debugNote);
    this.body.appendChild(debugGroup);
    this._debugCheck = debugCheck;

    // --- Save Now ---
    const saveGroup = this._group('Save');
    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-btn';
    saveBtn.textContent = 'Save Now';
    this._saveStatus = document.createElement('span');
    this._saveStatus.className = 'settings-status';
    saveBtn.addEventListener('click', () => {
      this.saveSystem.save('manual');
      this._saveStatus.textContent = ' Saved! ✓';
      setTimeout(() => { this._saveStatus.textContent = ''; }, 2000);
    });
    saveGroup.appendChild(saveBtn);
    saveGroup.appendChild(this._saveStatus);
    this.body.appendChild(saveGroup);

    // --- Export Save ---
    const exportGroup = this._group('Export');
    const exportBtn = document.createElement('button');
    exportBtn.className = 'settings-btn';
    exportBtn.textContent = 'Export Save';
    const exportArea = document.createElement('textarea');
    exportArea.className = 'settings-textarea';
    exportArea.readOnly = true;
    exportArea.rows = 3;
    const copyBtn = document.createElement('button');
    copyBtn.className = 'settings-btn settings-btn-sm';
    copyBtn.textContent = 'Copy';
    copyBtn.style.display = 'none';
    exportBtn.addEventListener('click', () => {
      const data = this.saveSystem.export();
      exportArea.value = data;
      copyBtn.style.display = '';
    });
    copyBtn.addEventListener('click', () => {
      exportArea.select();
      navigator.clipboard.writeText(exportArea.value).catch(() => {
        document.execCommand('copy');
      });
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });
    exportGroup.appendChild(exportBtn);
    exportGroup.appendChild(exportArea);
    exportGroup.appendChild(copyBtn);
    this.body.appendChild(exportGroup);

    // --- Import Save ---
    const importGroup = this._group('Import');
    const importArea = document.createElement('textarea');
    importArea.className = 'settings-textarea';
    importArea.rows = 3;
    importArea.placeholder = 'Paste save data here...';
    const importBtn = document.createElement('button');
    importBtn.className = 'settings-btn';
    importBtn.textContent = 'Apply';
    const importStatus = document.createElement('span');
    importStatus.className = 'settings-status';
    importBtn.addEventListener('click', () => {
      const result = this.saveSystem.import(importArea.value.trim());
      if (result && result.success) {
        importStatus.textContent = ' Import successful! Reloading...';
        setTimeout(() => location.reload(), 500);
      } else {
        importStatus.textContent = ` Error: ${(result && result.error) || 'Invalid data'}`;
        setTimeout(() => { importStatus.textContent = ''; }, 4000);
      }
    });
    importGroup.appendChild(importArea);
    importGroup.appendChild(importBtn);
    importGroup.appendChild(importStatus);
    this.body.appendChild(importGroup);

    // --- Reset Game (2-step confirm) ---
    const resetGroup = this._group('Danger Zone');
    const resetBtn = document.createElement('button');
    resetBtn.className = 'settings-btn settings-btn-danger';
    resetBtn.textContent = 'Reset Game';
    let resetStage = 0;
    resetBtn.addEventListener('click', () => {
      if (resetStage === 0) {
        resetBtn.textContent = 'Are you sure?';
        resetStage = 1;
        setTimeout(() => {
          if (resetStage === 1) {
            resetBtn.textContent = 'Reset Game';
            resetStage = 0;
          }
        }, 5000);
      } else if (resetStage === 1) {
        resetBtn.textContent = 'This cannot be undone. Confirm?';
        resetStage = 2;
        setTimeout(() => {
          if (resetStage === 2) {
            resetBtn.textContent = 'Reset Game';
            resetStage = 0;
          }
        }, 5000);
      } else {
        this.saveSystem.reset();
        resetBtn.textContent = 'Reset Game';
        resetStage = 0;
        location.reload();
      }
    });
    resetGroup.appendChild(resetBtn);
    this.body.appendChild(resetGroup);
  }

  _group(label) {
    const div = document.createElement('div');
    div.className = 'settings-group';
    const h = document.createElement('h3');
    h.textContent = label;
    div.appendChild(h);
    return div;
  }

  _flashSaved() {
    if (this._saveStatus) {
      this._saveStatus.textContent = ' Saved!';
      setTimeout(() => { this._saveStatus.textContent = ''; }, 2000);
    }
  }

  _syncUI({ key, value }) {
    if (key === 'notationMode' && this._notationSelect) {
      this._notationSelect.value = value;
    }
    if (key === 'glowEnabled' && this._glowCheck) {
      this._glowCheck.checked = value;
    }
  }
}
