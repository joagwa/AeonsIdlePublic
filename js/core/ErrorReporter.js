/**
 * ErrorReporter — catches unhandled exceptions and promise rejections.
 *
 * Reporting strategy (in priority order):
 *   1. POST to the Cloudflare Worker proxy (fully automatic, no user action).
 *      Worker URL injected at deploy time via <meta name="error-reporter-endpoint">.
 *   2. Fallback: show a dismissible in-game banner with a pre-filled
 *      "Report →" GitHub issues URL for manual submission.
 *
 * No tokens ever appear in client-side code or committed files.
 */
export class ErrorReporter {
  #workerEndpoint = null;
  #publicRepo     = null;
  #reported       = new Set();
  #lastReport     = 0;
  #cooldownMs     = 30_000;

  static #NOISE = [
    /^Script error\.?$/i,
    /ResizeObserver loop/i,
    /Loading chunk/i,
    /^NetworkError/i,
    /Failed to fetch/i,
    /Load failed/i,
    /Non-Error promise rejection/i,
  ];

  constructor() {
    const endpointMeta = document.querySelector('meta[name="error-reporter-endpoint"]');
    const endpoint = endpointMeta?.content?.trim();
    this.#workerEndpoint = (endpoint && endpoint !== 'dev') ? endpoint : null;

    const repoMeta = document.querySelector('meta[name="feedback-repo"]');
    const repo = repoMeta?.content?.trim();
    this.#publicRepo = (repo && repo !== 'dev') ? repo : null;

    window.onerror = (message, source, lineno, colno, error) => {
      this.#handle(error ?? new Error(String(message)), { source, lineno, colno });
      return false;
    };

    window.addEventListener('unhandledrejection', ev => {
      const err = ev.reason instanceof Error
        ? ev.reason
        : new Error(String(ev.reason ?? 'Unhandled rejection'));
      this.#handle(err, { source: 'unhandledrejection' });
    });
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  #handle(error, context) {
    const msg = error?.message ?? '';
    if (ErrorReporter.#NOISE.some(re => re.test(msg))) return;

    const fingerprint = `${msg}|${context.source ?? ''}|${context.lineno ?? ''}`;
    if (this.#reported.has(fingerprint)) return;

    const now = Date.now();
    if (now - this.#lastReport < this.#cooldownMs) return;

    this.#reported.add(fingerprint);
    this.#lastReport = now;

    if (this.#workerEndpoint) {
      this.#postToWorker(error, context);
    } else {
      this.#showBanner(error, context, /* autoReported */ false);
    }
  }

  async #postToWorker(error, context) {
    const { title, issueBody } = this.#buildIssueContent(error, context);
    try {
      const resp = await fetch(this.#workerEndpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title, issueBody, labels: ['bug', 'auto-error'] }),
      });

      if (resp.ok) {
        const { url, number } = await resp.json();
        this.#showBanner(error, context, /* autoReported */ true, url, number);
      } else {
        console.warn('[ErrorReporter] Worker responded', resp.status, '— falling back to URL');
        this.#showBanner(error, context, /* autoReported */ false);
      }
    } catch (fetchErr) {
      console.warn('[ErrorReporter] Worker unreachable:', fetchErr.message, '— falling back to URL');
      this.#showBanner(error, context, /* autoReported */ false);
    }
  }

  #showBanner(error, context, autoReported, issueUrl, issueNumber) {
    let container = document.getElementById('error-reporter-banner');
    if (!container) {
      container = document.createElement('div');
      container.id = 'error-reporter-banner';
      document.body.appendChild(container);
    }

    const msg = (error.message ?? 'Unknown error').slice(0, 90);
    let actionHtml;
    if (autoReported && issueUrl) {
      actionHtml = `<a class="error-banner-link" href="${issueUrl}" target="_blank" rel="noopener">#${issueNumber} ↗</a>`;
    } else {
      const reportUrl = this.#buildReportUrl(error, context);
      actionHtml = reportUrl
        ? `<a class="error-banner-link" href="${reportUrl}" target="_blank" rel="noopener">Report →</a>`
        : '';
    }

    const item = document.createElement('div');
    item.className = 'error-banner-item';
    item.innerHTML =
      `<span class="error-banner-msg">${autoReported ? '✓ Reported' : '⚠'} ${msg}</span>` +
      actionHtml +
      `<button class="error-banner-dismiss" aria-label="Dismiss">✕</button>`;

    item.querySelector('.error-banner-dismiss').addEventListener('click', () => item.remove());
    container.appendChild(item);

    setTimeout(() => item.remove(), autoReported ? 8_000 : 20_000);
  }

  #buildIssueContent(error, context) {
    const version = document.querySelector('meta[name="game-version"]')?.content ?? 'unknown';
    const stack   = (error.stack ?? 'No stack trace').split('\n').slice(0, 10).join('\n');
    const title   = `[Bug] ${(error.message ?? 'Unknown error').slice(0, 80)}`;
    const issueBody = [
      `**Error:** \`${error.name ?? 'Error'}: ${error.message ?? ''}\``,
      '',
      '**Stack trace:**',
      '```',
      stack,
      '```',
      '',
      `**Version:** \`${version}\` | **Source:** \`${context.source ?? 'unknown'}\` line ${context.lineno ?? '?'}`,
      `**Time:** ${new Date().toISOString()} | **UA:** ${navigator.userAgent.slice(0, 80)}`,
    ].join('\n');
    return { title, issueBody };
  }

  #buildReportUrl(error, context) {
    if (!this.#publicRepo) return null;
    const { title, issueBody } = this.#buildIssueContent(error, context);
    return `https://github.com/${this.#publicRepo}/issues/new`
      + `?title=${encodeURIComponent(title)}`
      + `&body=${encodeURIComponent(issueBody.slice(0, 4000))}`
      + `&labels=${encodeURIComponent('bug,auto-error')}`;
  }
}
