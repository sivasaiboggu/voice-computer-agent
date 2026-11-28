// Pilot — intent parser (pure functions, no DOM).
// Loaded as a classic script (works from file:// with no CORS issue for
// ES modules) and in Node (tests import this file for its side effects).
// Everything is exposed on globalThis.PilotIntent.
// Two parsers exist in the app: this local one (always available) and
// Gemini (js/app.js) when the user saves their own free API key.

const AIRPORTS = [
  { code: 'DEL', city: 'Delhi', name: 'Indira Gandhi International' },
  { code: 'BLR', city: 'Bengaluru', name: 'Kempegowda International' },
  { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj International' },
  { code: 'HYD', city: 'Hyderabad', name: 'Rajiv Gandhi International' },
  { code: 'MAA', city: 'Chennai', name: 'Chennai International' },
  { code: 'CCU', city: 'Kolkata', name: 'Netaji Subhas Chandra Bose International' },
  { code: 'PNQ', city: 'Pune', name: 'Pune Airport' },
  { code: 'JAI', city: 'Jaipur', name: 'Jaipur International' },
  { code: 'COK', city: 'Kochi', name: 'Cochin International' },
  { code: 'AMD', city: 'Ahmedabad', name: 'Sardar Vallabhbhai Patel International' },
  { code: 'GOI', city: 'Goa', name: 'Manohar International (Mopa)' },
  { code: 'LKO', city: 'Lucknow', name: 'Chaudhary Charan Singh International' },
];

const CITY_ALIASES = {
  delhi: 'DEL', 'new delhi': 'DEL',
  bengaluru: 'BLR', bangalore: 'BLR',
  mumbai: 'BOM', bombay: 'BOM',
  hyderabad: 'HYD',
  chennai: 'MAA', madras: 'MAA',
  kolkata: 'CCU', calcutta: 'CCU',
  pune: 'PNQ', poona: 'PNQ',
  jaipur: 'JAI',
  kochi: 'COK', cochin: 'COK',
  ahmedabad: 'AMD',
  goa: 'GOI',
  lucknow: 'LKO',
};

// Airport codes themselves are also understood.
for (const a of AIRPORTS) CITY_ALIASES[a.code.toLowerCase()] = a.code;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAYS_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function formatISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY_SHORT[date.getDay()]} ${d} ${MON_SHORT[m - 1]} ${y}`;
}

/** Next occurrence of the named weekday strictly after `today`. */
function nextWeekday(name, today = new Date()) {
  const idx = WEEKDAYS.indexOf(name);
  if (idx === -1) return null;
  const base = startOfDay(today);
  let diff = (idx - base.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  return addDays(base, diff);
}

/** The upcoming occurrence of the weekday, including today ("this Friday"). */
function thisWeekday(name, today = new Date()) {
  const idx = WEEKDAYS.indexOf(name);
  if (idx === -1) return null;
  const base = startOfDay(today);
  const diff = (idx - base.getDay() + 7) % 7;
  return addDays(base, diff);
}

function monthIndex(token) {
  const t = token.toLowerCase();
  let i = MONTHS.indexOf(t);
  if (i !== -1) return i;
  return MONTHS_SHORT.indexOf(t);
}

/**
 * Resolve a date mention inside lower-cased text.
 * Returns an ISO date string, or null when nothing is found.
 * Explicit dates in the past roll to next year (a flight is always ahead).
 */
function resolveDate(text, today = new Date()) {
  const base = startOfDay(today);
  const lower = text.toLowerCase();

  // ISO: 2026-11-27
  let m = lower.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // dd/mm/yyyy or dd-mm-yyyy
  m = lower.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (m) return formatISO(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])));

  // "27 november" / "27 nov" / "november 27" / "5th december"
  m = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/);
  if (!m) {
    m = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (m) m = [m[0], m[2], m[1]];
  }
  if (m) {
    const day = Number(m[1]);
    const month = monthIndex(m[2]);
    let date = new Date(base.getFullYear(), month, day);
    if (date < base) date = new Date(base.getFullYear() + 1, month, day);
    return formatISO(date);
  }

  // "day after tomorrow" must be checked before "tomorrow": it contains
  // the word "tomorrow", and the plain check below would match first.
  if (/\bday after tomorrow\b/.test(lower)) return formatISO(addDays(base, 2));
  if (/\btomorrow\b/.test(lower)) return formatISO(addDays(base, 1));
  if (/\btoday\b/.test(lower)) return formatISO(base);

  // "this friday" = the upcoming one, including today.
  m = lower.match(/\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/);
  if (m) {
    const full = WEEKDAYS_SHORT.includes(m[1]) ? WEEKDAYS[WEEKDAYS_SHORT.indexOf(m[1])] : m[1];
    return formatISO(thisWeekday(full, base));
  }

  // "next friday" / plain "friday" = next occurrence strictly after today.
  m = lower.match(/\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/);
  if (m) {
    const full = WEEKDAYS_SHORT.includes(m[1]) ? WEEKDAYS[WEEKDAYS_SHORT.indexOf(m[1])] : m[1];
    return formatISO(nextWeekday(full, base));
  }

  return null;
}

function cityPattern() {
  // Longest names first so "new delhi" wins over "delhi".
  const names = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');
}

function findCities(lower) {
  const re = cityPattern();
  const found = [];
  let m;
  while ((m = re.exec(lower)) !== null) {
    found.push({ name: m[1], code: CITY_ALIASES[m[1]], index: m.index });
  }
  return found;
}

function resolveSort(text) {
  const lower = text.toLowerCase();
  if (/\b(fastest|quickest|shortest)\b/.test(lower)) return 'fastest';
  if (/\b(earliest|first flight|morning flight)\b/.test(lower)) return 'earliest';
  return 'cheapest'; // default: "cheapest", "lowest price", or unstated
}

function resolvePassengers(text) {
  const lower = text.toLowerCase();
  let m = lower.match(/\b(\d{1,2})\s*(people|passengers|persons|adults|tickets|seats)\b/);
  if (m) return Math.min(9, Math.max(1, Number(m[1])));
  m = lower.match(/\bfor\s+(one|two|three|four|five|six|seven|eight|nine)\b/);
  if (m) return WORD_NUMBERS[m[1]];
  m = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine)\s*(people|passengers|persons|adults|tickets)\b/);
  if (m) return WORD_NUMBERS[m[1]];
  if (/\b(just me|solo|alone|by myself)\b/.test(lower)) return 1;
  return null;
}

const DEFAULTS = { origin: 'DEL', destination: 'BLR', passengers: 1 };

/**
 * Parse a typed or spoken command into a flight-search intent.
 * Returns { action: 'unsupported', raw } when it is not a flight request,
 * otherwise a full intent with every field filled (defaults marked).
 */
function parseCommand(rawText, options = {}) {
  const today = options.today ? new Date(options.today) : new Date();
  const defaults = { ...DEFAULTS, ...(options.defaults || {}) };
  const raw = String(rawText || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) return { action: 'unsupported', raw, reason: 'empty' };
  if (!/\b(flight|fly|ticket|plane)\b/.test(lower)) {
    return { action: 'unsupported', raw, reason: 'not-a-flight-command' };
  }

  const filledFromDefaults = [];
  let origin = null;
  let destination = null;

  // "from X to Y"
  let m = lower.match(/from\s+([a-z ]+?)\s+to\s+([a-z ]+?)(?:\s+(?:on|for|tomorrow|today|next|this|cheapest|fastest|earliest|\d)|$)/);
  const cities = findCities(lower);
  const cityByName = (name) => CITY_ALIASES[name.trim()];

  if (m && cityByName(m[1]) && cityByName(m[2])) {
    origin = cityByName(m[1]);
    destination = cityByName(m[2]);
  } else {
    // "X to Y" — first city before "to", first city after it.
    const toIdx = lower.search(/\bto\b/);
    if (toIdx !== -1) {
      const before = cities.filter((c) => c.index < toIdx);
      const after = cities.filter((c) => c.index > toIdx);
      if (before.length && after.length) {
        origin = before[before.length - 1].code;
        destination = after[0].code;
      } else if (after.length) {
        destination = after[0].code;
      }
    }
    if (!destination && cities.length === 1) {
      // "flight to Bengaluru" or just "flight Bengaluru": the one city
      // named after "flight"/"to" is the destination.
      destination = cities[0].code;
    } else if (!origin && !destination && cities.length >= 2) {
      origin = cities[0].code;
      destination = cities[1].code;
    }
    if (!origin && !destination && cities.length === 1) destination = cities[0].code;
  }

  if (!origin) { origin = defaults.origin; filledFromDefaults.push('origin'); }
  if (!destination) { destination = defaults.destination; filledFromDefaults.push('destination'); }
  // Same city both ends: the user named one city; treat it as destination.
  if (origin === destination) {
    destination = defaults.destination === origin ? 'BLR' : defaults.destination;
    if (!filledFromDefaults.includes('destination')) filledFromDefaults.push('destination');
  }

  const date = resolveDate(lower, today) || formatISO(nextWeekday('friday', today));
  if (!resolveDate(lower, today)) filledFromDefaults.push('date');

  const passengers = resolvePassengers(lower) ?? defaults.passengers;
  if (resolvePassengers(lower) === null) filledFromDefaults.push('passengers');

  return {
    action: 'flight_search',
    origin,
    destination,
    date,
    dateLabel: formatDateLabel(date),
    sort: resolveSort(lower),
    passengers,
    tripType: 'oneway',
    filledFromDefaults,
    parseSource: 'local',
    raw,
  };
}

/** Validate a Gemini-returned intent object; returns a clean intent or null. */
function validateAiIntent(obj, options = {}) {
  if (!obj || typeof obj !== 'object') return null;
  const today = options.today ? new Date(options.today) : new Date();
  const defaults = { ...DEFAULTS, ...(options.defaults || {}) };
  const codes = new Set(AIRPORTS.map((a) => a.code));
  const origin = codes.has(String(obj.origin || '').toUpperCase()) ? String(obj.origin).toUpperCase() : defaults.origin;
  const destination = codes.has(String(obj.destination || '').toUpperCase()) ? String(obj.destination).toUpperCase() : defaults.destination;
  if (origin === destination) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(obj.date || '')) ? String(obj.date) : formatISO(nextWeekday('friday', today));
  const sort = ['cheapest', 'fastest', 'earliest'].includes(obj.sort) ? obj.sort : 'cheapest';
  const passengers = Number.isInteger(obj.passengers) && obj.passengers >= 1 && obj.passengers <= 9
    ? obj.passengers : defaults.passengers;
  const filledFromDefaults = [];
  if (!codes.has(String(obj.origin || '').toUpperCase())) filledFromDefaults.push('origin');
  if (!codes.has(String(obj.destination || '').toUpperCase())) filledFromDefaults.push('destination');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(obj.date || ''))) filledFromDefaults.push('date');
  if (!(Number.isInteger(obj.passengers) && obj.passengers >= 1 && obj.passengers <= 9)) filledFromDefaults.push('passengers');
  return {
    action: 'flight_search',
    origin, destination, date,
    dateLabel: formatDateLabel(date),
    sort, passengers,
    tripType: 'oneway',
    filledFromDefaults,
    parseSource: 'gemini',
    raw: String(obj.raw || ''),
  };
}

globalThis.PilotIntent = {
  AIRPORTS, CITY_ALIASES, WEEKDAYS, MONTHS, WORD_NUMBERS, DEFAULTS,
  startOfDay, addDays, formatISO, formatDateLabel, nextWeekday, thisWeekday,
  resolveDate, resolveSort, resolvePassengers, parseCommand, validateAiIntent,
};
