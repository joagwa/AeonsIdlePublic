/**
 * ErrorReporter — catches unhandled exceptions and promise rejections,
 * then automatically files a GitHub issue assigned to the Copilot coding
 * agent so it can propose a fix. Requires approval for the resulting PR.
 *
 * A fine-grained PAT (issues:write only) is injected at deploy time via
 * <meta name="error-reporter-token">. Without it (local dev), errors are
 * only logged to console.
 */
export class ErrorReporter {
  #token = null;
  #repo   = null;
  #reported   = new Set(); // per-session dedup fingerprints
  #lastReport = 0;
  #cooldownMs = 30_000; // 30 s between any two reports

  /** Noise patterns we never want to file as issues. */
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
    const tokenMeta = document.querySelector('meta[name="error-reporter-token"]');
    const repoMeta  = document.querySelector('meta[name="error-reporter-repo"]');
    this.#token = tokenMeta?.content ?? null;
    this.#repo  = repoMeta?.content  ?? 'joagwa/AeonsIdle';

    if (!this.#token || this.#token === 'dev') {
      console.log('[ErrorReporter] No deploy token — errors logged locally only.');
      return;
    }

    window.onerror = (message, source, lineno, colno, error) => {
      this.#handle(error ?? new Error(String(message)), { source, lineno, colno });
      return false; // preserve default browser logging
    };

    window.addEventListener('unhandledrejection', (ev) => {
      const err = ev.reason instanceof Error
        ? ev.reason
        : new Error(String(ev.reason ?? 'Unhandled rejection'));
      this.#handle(err, { source: 'unhandledrejection' });
    });

    console.log(`[ErrorReporter] Active — issues → ${this.#repo}`);
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

    this.#createIssue(error, context).catch(e =>
      console.error('[ErrorReporter] Failed to create issue:', e)
    );
  }

  async #createIssue(error, context) {
    const title = `[Bug] ${(error.message ?? 'Unknown error').slice(0, 80)}`;

    // Deduplicate against existing open issues
    const q = encodeURIComponent(
      `repo:${this.#repo} is:open is:issue in:title "${title}"`
    );
    try {
      const searchResp = await fetch(
        `https://api.github.com/search/issues?q=${q}&per_page=1`,
        { headers: this.#headers() }
      );
      if (searchResp.ok) {
        const { total_count } = await searchResp.json();
        if (total_count > 0) {
          console.log('[ErrorReporter] Duplicate issue exists — skipping.');
          return;
        }
      }
    } catch {
      // Search failure is non-fatal; proceed to create anyway
    }

    const resp = await fetch(`https://api.github.com/repos/${this.#repo}/issues`, {
      method: 'POST',
      headers: { ...this.#headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body:      this.#buildBody(error, context),
        labels:    ['bug', 'automated-error'],
        assignees: ['Copilot'], // triggers Copilot coding agent
      }),
    });

    if (resp.ok) {
      const issue = await resp.json();
      console.log(`[ErrorReporter] Issue filed: ${issue.html_url}`);
    } else {
      console.error('[ErrorReporter] GitHub API error:', resp.status, await resp.text());
    }
  }

  #headers() {
    return {
      Authorization:        `Bearer ${this.#token}`,
      Accept:               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  #buildBody(error, context) {
    const stack = (error.stack ?? 'No stack trace')
      .split('\n').slice(0, 12).join('\n');
    const version = document.querySelector('meta[name="game-version"]')?.content ?? 'unknown';

    return [
      '## 🤖 Automated Bug Report',
      '',
      '_This issue was automatically created by the in-game error reporter._',
      '',
      '### Error',
      '```',
      `${error.name ?? 'Error'}: ${error.message ?? '(no message)'}`,
      '```',
      '',
      '### Stack Trace',
      '```',
      stack,
      '```',
      '',
      '### Environment',
      '| | |',
      '|---|---|',
      `| **Source** | \`${context.source ?? 'unknown'}\` |`,
      `| **Line / Col** | ${context.lineno ?? '?'} / ${context.colno ?? '?'} |`,
      `| **Game version** | \`${version}\` |`,
      `| **URL** | \`${window.location.href}\` |`,
      `| **Time (UTC)** | ${new Date().toISOString()} |`,
      `| **User agent** | ${navigator.userAgent} |`,
      '',
      '### Instructions for Copilot',
      '1. Analyse the stack trace to identify the root cause.',
      '2. Fix the issue without breaking existing game mechanics.',
      '3. Run `npm test` to verify no regressions.',
      '4. Add a regression test if appropriate.',
      '',
      '---',
      '_Please review and close this issue if it is not a real bug._',
    ].join('\n');
  }
}
