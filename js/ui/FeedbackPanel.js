/**
 * FeedbackPanel — in-game modal for submitting bug reports and feature
 * requests. Captures the current game state and recent log buffer
 * automatically, then opens a pre-filled GitHub issue URL in a new tab.
 *
 * No tokens are used — secrets must never appear in client-side code
 * that is pushed to a public repository.
 *
 * The public repo is read from <meta name="feedback-repo"> (injected at
 * deploy time). Without it (local dev), the button is hidden.
 */

import { LogBuffer } from '../core/LogBuffer.js?v=5cffe26';
import { formatNumber } from '../core/NumberFormatter.js?v=5cffe26';

export class FeedbackPanel {
  #repo   = null;
  #modal  = null;
  #getCtx = null; // () => { resources, upgrades, milestones, totalTime, version }

  constructor(getContextFn) {
    this.#getCtx = getContextFn;

    const repoMeta = document.querySelector('meta[name="feedback-repo"]');
    const repo = repoMeta?.content?.trim();
    this.#repo = (repo && repo !== 'dev') ? repo : null;
  }

  init() {
    this.#modal = document.getElementById('feedback-modal');
    if (!this.#modal) return;

    // Hide the open button in local dev (no repo configured)
    const openBtn = document.getElementById('feedback-open-btn');
    if (!this.#repo && openBtn) openBtn.style.display = 'none';

    openBtn?.addEventListener('click', () => this.#open());

    document.getElementById('feedback-close')
      ?.addEventListener('click', () => this.#close());

    this.#modal.addEventListener('click', e => {
      if (e.target === this.#modal) this.#close();
    });

    document.getElementById('feedback-submit')
      ?.addEventListener('click', () => this.#submit());
  }

  // ── Private ────────────────────────────────────────────────────────────────

  #open() {
    if (!this.#modal) return;
    this.#modal.classList.remove('hidden');
    this.#populateContext();
    document.getElementById('feedback-title')?.focus();
  }

  #close() {
    this.#modal?.classList.add('hidden');
    this.#clearStatus();
  }

  #submit() {
    const typeEl  = document.getElementById('feedback-type');
    const titleEl = document.getElementById('feedback-title');
    const bodyEl  = document.getElementById('feedback-body');

    const type  = typeEl?.value  ?? 'feedback';
    const title = titleEl?.value?.trim() ?? '';
    const body  = bodyEl?.value?.trim()  ?? '';

    if (!title) { this.#showStatus('error', 'Please enter a title.'); return; }
    if (!body)  { this.#showStatus('error', 'Please describe the issue or request.'); return; }

    const issueTitle = `[${this.#typeLabel(type)}] ${title}`;
    const issueBody  = this.#buildIssueBody(type, title, body);

    if (this.#repo) {
      this.#openGitHubUrl(issueTitle, issueBody, type);
      this.#showStatus('success', '↗ GitHub opened in a new tab — please submit the pre-filled issue.');
    } else {
      // Local dev: just log to console
      console.log('[FeedbackPanel] Feedback (no repo configured):\n', issueTitle, '\n', issueBody);
      this.#showStatus('success', '✓ Captured (no public repo configured — logged to console).');
    }

    if (titleEl) titleEl.value = '';
    if (bodyEl)  bodyEl.value  = '';
  }

  #openGitHubUrl(title, body, type) {
    const labels = `user-feedback,${this.#typeToLabel(type)}`;
    const safeBody = body.length > 4000 ? body.slice(0, 4000) + '\n\n_(truncated)_' : body;
    const url = `https://github.com/${this.#repo}/issues/new`
      + `?title=${encodeURIComponent(title)}`
      + `&body=${encodeURIComponent(safeBody)}`
      + `&labels=${encodeURIComponent(labels)}`;
    window.open(url, '_blank', 'noopener');
  }

  #buildIssueBody(type, title, userBody) {
    const ctx  = this.#captureGameContext();
    const logs = this.#captureLogs();
    const version = document.querySelector('meta[name="game-version"]')?.content ?? 'unknown';

    return [
      `## ${this.#typeEmoji(type)} ${title}`,
      '',
      userBody,
      '',
      '---',
      '',
      ctx,
      '',
      ...(logs ? [logs, ''] : []),
      '---',
      `_Submitted from in-game feedback panel — version \`${version}\` — ${new Date().toISOString()}_`,
    ].join('\n');
  }

  #captureGameContext() {
    const ctx = this.#getCtx?.();
    if (!ctx) return '### 🎮 Game State\n_(unavailable)_';

    const lines = ['### 🎮 Game State', ''];

    const resources = ctx.resources ? Object.values(ctx.resources).filter(r => r.visible) : [];
    if (resources.length) {
      lines.push('**Resources:**');
      for (const r of resources) {
        lines.push(`- ${r.displayLabel ?? r.id}: ${formatNumber(r.currentValue)}`);
      }
      lines.push('');
    }

    const upgrades = ctx.upgrades
      ? Object.entries(ctx.upgrades).filter(([, s]) => (s.level ?? 0) > 0)
      : [];
    if (upgrades.length) {
      lines.push('**Purchased Upgrades:**');
      for (const [id, s] of upgrades) lines.push(`- ${id}: level ${s.level}`);
      lines.push('');
    }

    const triggered = ctx.milestones
      ? Object.entries(ctx.milestones).filter(([, s]) => s.triggered).map(([id]) => id)
      : [];
    if (triggered.length) {
      lines.push(`**Milestones:** ${triggered.map(id => `\`${id}\``).join(', ')}`);
      lines.push('');
    }

    const mins = Math.round((ctx.totalTime ?? 0) / 60);
    lines.push(`**Time Played:** ${mins} min | **Version:** ${ctx.version ?? 'unknown'} | **UA:** ${navigator.userAgent.slice(0, 80)}`);
    return lines.join('\n');
  }

  #captureLogs() {
    const logs = LogBuffer.getLogs().filter(l => l.level !== 'DEBUG').slice(-25);
    if (!logs.length) return '';
    return [
      '### 🔍 Recent Warnings & Errors',
      '```',
      ...logs.map(l => `[${l.level}] ${l.time} ${l.msg}`),
      '```',
    ].join('\n');
  }

  #populateContext() {
    const el = document.getElementById('feedback-context-preview');
    if (!el) return;
    const ctx = this.#getCtx?.();
    if (!ctx) { el.textContent = '(unavailable)'; return; }
    const resources = Object.values(ctx.resources ?? {}).filter(r => r.visible);
    el.textContent = resources.map(r => `${r.displayLabel ?? r.id}: ${formatNumber(r.currentValue)}`).join(' · ');
  }

  #showStatus(type, html) {
    const el = document.getElementById('feedback-status');
    if (!el) return;
    el.className = `feedback-status feedback-status--${type}`;
    el.innerHTML = html;
    el.hidden = false;
  }

  #clearStatus() {
    const el = document.getElementById('feedback-status');
    if (el) { el.hidden = true; el.innerHTML = ''; }
  }

  #typeLabel(type)   { return { bug: 'Bug', feature: 'Feature Request', feedback: 'Feedback' }[type] ?? 'Feedback'; }
  #typeToLabel(type) { return { bug: 'bug', feature: 'feature-request', feedback: 'feedback' }[type] ?? 'feedback'; }
  #typeEmoji(type)   { return { bug: '🐛', feature: '✨', feedback: '💬' }[type] ?? '💬'; }
}
