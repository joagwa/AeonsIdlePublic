/**
 * FeedbackPanel — in-game modal for submitting bug reports and feature
 * requests. Captures the current game state and recent log buffer
 * automatically.
 *
 * Submission strategy (in priority order):
 *   1. POST to the Cloudflare Worker proxy → issue created silently,
 *      no GitHub account needed, works for Enterprise Managed Users.
 *   2. Fallback: open a pre-filled github.com/issues/new URL in a new
 *      tab (requires the user to be logged into a non-EMU GitHub account).
 *   3. Local dev (no endpoint, no repo): log to console only.
 *
 * No tokens ever appear in client-side code or committed files.
 */

import { LogBuffer } from '../core/LogBuffer.js?v=0ceebd9';
import { formatNumber } from '../core/NumberFormatter.js?v=0ceebd9';

export class FeedbackPanel {
  #workerEndpoint = null;
  #repo           = null;
  #modal          = null;
  #getCtx         = null;

  constructor(getContextFn) {
    this.#getCtx = getContextFn;

    const endpointMeta = document.querySelector('meta[name="error-reporter-endpoint"]');
    const endpoint = endpointMeta?.content?.trim();
    this.#workerEndpoint = (endpoint && endpoint !== 'dev') ? endpoint : null;

    const repoMeta = document.querySelector('meta[name="feedback-repo"]');
    const repo = repoMeta?.content?.trim();
    this.#repo = (repo && repo !== 'dev') ? repo : null;
  }

  init() {
    this.#modal = document.getElementById('feedback-modal');
    if (!this.#modal) return;

    const openBtn = document.getElementById('feedback-open-btn');
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

  async #submit() {
    const typeEl  = document.getElementById('feedback-type');
    const titleEl = document.getElementById('feedback-title');
    const bodyEl  = document.getElementById('feedback-body');
    const submitBtn = document.getElementById('feedback-submit');

    const type  = typeEl?.value  ?? 'feedback';
    const title = titleEl?.value?.trim() ?? '';
    const body  = bodyEl?.value?.trim()  ?? '';

    if (!title) { this.#showStatus('error', 'Please enter a title.'); return; }
    if (!body)  { this.#showStatus('error', 'Please describe the issue or request.'); return; }

    const issueTitle = `[${this.#typeLabel(type)}] ${title}`;
    const issueBody  = this.#buildIssueBody(type, title, body);
    const labels     = ['user-feedback', this.#typeToLabel(type)];

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

    try {
      if (this.#workerEndpoint) {
        // Primary: Worker creates the issue server-side — no GitHub login needed
        const resp = await fetch(this.#workerEndpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ title: issueTitle, issueBody, labels }),
        });

        if (resp.ok) {
          const { url, number } = await resp.json();
          this.#showStatus('success',
            `✅ Submitted! <a href="${url}" target="_blank" rel="noopener">View issue #${number} on GitHub ↗</a>`);
          if (titleEl) titleEl.value = '';
          if (bodyEl)  bodyEl.value  = '';
          return;
        }
        // Worker failed — fall through to URL approach
        console.warn('[FeedbackPanel] Worker responded', resp.status, '— trying URL fallback');
      }

      if (this.#repo) {
        // Fallback: open pre-filled GitHub URL (requires non-EMU GitHub login)
        this.#openGitHubUrl(issueTitle, issueBody, labels);
        this.#showStatus('success', '↗ GitHub opened in a new tab — please submit the pre-filled issue.');
        if (titleEl) titleEl.value = '';
        if (bodyEl)  bodyEl.value  = '';
        return;
      }

      // Local dev
      console.log('[FeedbackPanel] Feedback (no endpoint configured):\n', issueTitle, '\n', issueBody);
      this.#showStatus('success', '✓ Captured (local dev — logged to console).');
      if (titleEl) titleEl.value = '';
      if (bodyEl)  bodyEl.value  = '';

    } catch (err) {
      console.error('[FeedbackPanel] Submit error:', err);
      // Network error on Worker — try URL fallback before giving up
      if (this.#repo) {
        this.#openGitHubUrl(issueTitle, issueBody, labels);
        this.#showStatus('success', '↗ GitHub opened as fallback — please submit the pre-filled issue.');
      } else {
        this.#showStatus('error', `Failed to submit: ${err.message}`);
      }
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit'; }
    }
  }

  #openGitHubUrl(title, body, labels) {
    const safeBody = body.length > 4000 ? body.slice(0, 4000) + '\n\n_(truncated)_' : body;
    const url = `https://github.com/${this.#repo}/issues/new`
      + `?title=${encodeURIComponent(title)}`
      + `&body=${encodeURIComponent(safeBody)}`
      + `&labels=${encodeURIComponent(labels.join(','))}`;
    window.open(url, '_blank', 'noopener');
  }

  #buildIssueBody(type, title, userBody) {
    const ctx     = this.#captureGameContext();
    const logs    = this.#captureLogs();
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
