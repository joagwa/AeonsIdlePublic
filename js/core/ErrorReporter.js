/**
 * ErrorReporter — catches unhandled exceptions and promise rejections,
 * then shows a dismissible in-game banner with a "Report →" link that
 * pre-fills a GitHub issue in the public tracker.
 *
 * No tokens are used. Secrets must never appear in client-side code
 * that is pushed to a public repository.
 */
export class ErrorReporter {
  #publicRepo = null;
  #reported   = new Set();
  #lastReport = 0;
  #cooldownMs = 30_000;

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
    const repoMeta = document.querySelector('meta[name="feedback-repo"]');
    const repo = repoMeta?.content?.trim();
    this.#publicRepo = (repo && repo !== 'dev') ? repo : null;

    window.onerror = (message, source, lineno, colno, error) => {
      this.#handle(error ?? new Error(String(message)), { source, lineno, colno });
      return false;
    };

    window.addEventListener('unhandledrejection', (ev) => {
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

    this.#showBanner(error, context);
  }

  #showBanner(error, context) {
    let container = document.getElementById('error-reporter-banner');
    if (!container) {
      container = document.createElement('div');
      container.id = 'error-reporter-banner';
      document.body.appendChild(container);
    }

    const msg = (error.message ?? 'Unknown error').slice(0, 90);
    const reportUrl = this.#buildReportUrl(error, context);

    const item = document.createElement('div');
    item.className = 'error-banner-item';
    item.innerHTML =
      `<span class="error-banner-msg">⚠ ${msg}</span>` +
      (reportUrl
        ? `<a class="error-banner-link" href="${reportUrl}" target="_blank" rel="noopener">Report →</a>`
        : '') +
      `<button class="error-banner-dismiss" aria-label="Dismiss">✕</button>`;

    item.querySelector('.error-banner-dismiss').addEventListener('click', () => item.remove());
    container.appendChild(item);

    // Auto-dismiss after 20 s
    setTimeout(() => item.remove(), 20_000);
  }

  #buildReportUrl(error, context) {
    if (!this.#publicRepo) return null;
    const version = document.querySelector('meta[name="game-version"]')?.content ?? 'unknown';
    const title   = `[Bug] ${(error.message ?? 'Unknown error').slice(0, 80)}`;
    const stack   = (error.stack ?? 'No stack trace').split('\n').slice(0, 8).join('\n');
    const body = [
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

    return `https://github.com/${this.#publicRepo}/issues/new`
      + `?title=${encodeURIComponent(title)}`
      + `&body=${encodeURIComponent(body.slice(0, 4000))}`
      + `&labels=${encodeURIComponent('bug,automated-error')}`;
  }
}
