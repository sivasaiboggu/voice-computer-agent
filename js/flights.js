const AIRPORTS_FOR_FLIGHTS = globalThis.PilotIntent.AIRPORTS; // intent.js loads first

// Pilot — seeded demo flight data.
// These are NOT live fares. Every flight is generated deterministically from
// the route + date, so the same search always returns the same results and
// the demo is repeatable. The UI labels this data as demo data everywhere.

const AIRLINES = [
  { name: 'IndiGo', prefix: '6E' },
  { name: 'Air India', prefix: 'AI' },
  { name: 'Air India Express', prefix: 'IX' },
  { name: 'SpiceJet', prefix: 'SG' },
  { name: 'Akasa Air', prefix: 'QP' },
  { name: 'Alliance Air', prefix: '9I' },
];

/** Small deterministic hash: same input string -> same 32-bit number. */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random generator from a seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatINR(n) {
  return '₹' + Number(n).toLocaleString('en-IN');
}

function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function minutesToTime(totalMin) {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Generate 8 seeded flights for a route + date.
 * Base fare and duration vary by route; each flight varies by seed, so the
 * cheapest flight is a real property of the generated set, not hard-coded.
 */
function generateFlights(origin, destination, dateISO) {
  const seed = hashString(`${origin}-${destination}-${dateISO}`);
  const rand = mulberry32(seed);
  // Route base: 3,100–6,400; duration: 65–175 minutes.
  const baseFare = 3100 + Math.floor(rand() * 3300);
  const baseDuration = 65 + Math.floor(rand() * 110);
  const flights = [];
  const usedDepartures = new Set();

  for (let i = 0; i < 8; i++) {
    const airline = AIRLINES[Math.floor(rand() * AIRLINES.length)];
    let departMin = 330 + Math.floor(rand() * 900); // 05:30–20:30
    departMin = Math.round(departMin / 5) * 5;
    while (usedDepartures.has(departMin)) departMin += 15;
    usedDepartures.add(departMin);
    const durationMin = baseDuration + Math.floor(rand() * 45) - 10;
    const price = baseFare + Math.floor(rand() * 2600) - 400;
    flights.push({
      id: `${origin}${destination}-${dateISO}-${i + 1}`,
      airline: airline.name,
      flightNo: `${airline.prefix}-${100 + Math.floor(rand() * 800)}`,
      depart: minutesToTime(departMin),
      arrive: minutesToTime(departMin + durationMin),
      durationMin,
      duration: formatDuration(durationMin),
      stops: 0,
      price: Math.max(1800, price),
      origin,
      destination,
      date: dateISO,
    });
  }
  return flights;
}

function sortFlights(flights, sort = 'cheapest') {
  const copy = [...flights];
  if (sort === 'fastest') copy.sort((a, b) => a.durationMin - b.durationMin || a.price - b.price);
  else if (sort === 'earliest') copy.sort((a, b) => a.depart.localeCompare(b.depart) || a.price - b.price);
  else copy.sort((a, b) => a.price - b.price || a.durationMin - b.durationMin);
  return copy;
}

function bestFlight(flights, sort = 'cheapest') {
  if (!flights || flights.length === 0) return null;
  return sortFlights(flights, sort)[0];
}

function airportCity(code) {
  const a = AIRPORTS_FOR_FLIGHTS.find((x) => x.code === code);
  return a ? a.city : code;
}

function airportLabel(code) {
  const a = AIRPORTS_FOR_FLIGHTS.find((x) => x.code === code);
  return a ? `${a.city} (${a.code})` : code;
}

const SORT_LABELS = {
  cheapest: 'Cheapest first',
  fastest: 'Fastest first',
  earliest: 'Earliest first',
};

globalThis.PilotFlights = {
  AIRPORTS: AIRPORTS_FOR_FLIGHTS, hashString, mulberry32, formatINR, formatDuration, minutesToTime,
  generateFlights, sortFlights, bestFlight, airportCity, airportLabel, SORT_LABELS,
};
