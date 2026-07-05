// Lightweight live-translation helper. Uses the free MyMemory translation API
// (no API key required). Powers the in-call chat "live translate" feature so
// users who speak different languages can talk — the way Chamet does.
//
// Language codes are ISO-639-1 (en, ar, es, fr, hi, zh, ...).

const CACHE = new Map(); // "from|to|text" -> translated (tiny in-memory cache)
const CACHE_MAX = 500;

async function translate(text, from, to) {
  const clean = (text || '').trim();
  if (!clean) return '';
  if (!to || from === to) return clean;

  const key = `${from || 'auto'}|${to}|${clean}`;
  if (CACHE.has(key)) return CACHE.get(key);

  const pair = `${from || 'autodetect'}|${to}`;
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(clean) +
    '&langpair=' +
    encodeURIComponent(pair);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    const out = data?.responseData?.translatedText || clean;

    if (CACHE.size >= CACHE_MAX) CACHE.clear();
    CACHE.set(key, out);
    return out;
  } catch (err) {
    // On any failure, fall back to the original text so chat never breaks.
    return clean;
  }
}

module.exports = { translate };
