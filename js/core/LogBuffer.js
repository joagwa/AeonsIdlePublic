/**
 * LogBuffer — intercepts console.warn / error / debug and keeps a
 * circular buffer of the last MAX_ENTRIES messages for inclusion in
 * bug reports and feedback submissions.
 *
 * Call LogBuffer.install() once at startup, then LogBuffer.getLogs()
 * anywhere to read recent entries.
 */

const MAX_ENTRIES = 60;

const _entries = [];
let _installed = false;

function _push(level, args) {
  const msg = args.map(a => {
    try {
      return typeof a === 'object' ? JSON.stringify(a) : String(a);
    } catch {
      return '[unserializable]';
    }
  }).join(' ');

  _entries.push({
    level,
    time: new Date().toISOString().slice(11, 23), // HH:MM:SS.mmm
    msg: msg.slice(0, 300),
  });

  if (_entries.length > MAX_ENTRIES) _entries.shift();
}

export const LogBuffer = {
  install() {
    if (_installed) return;
    _installed = true;

    const orig = { warn: console.warn, error: console.error, debug: console.debug };

    console.warn  = (...a) => { _push('WARN',  a); orig.warn.apply(console, a); };
    console.error = (...a) => { _push('ERROR', a); orig.error.apply(console, a); };
    console.debug = (...a) => { _push('DEBUG', a); orig.debug.apply(console, a); };
  },

  /** @returns {{ level: string, time: string, msg: string }[]} */
  getLogs() {
    return [..._entries];
  },
};
