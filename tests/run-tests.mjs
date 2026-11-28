// Pilot — tests for the intent parser and seeded flight data.
// Run: node tests/run-tests.mjs   (or: npm test)
// "Today" is fixed to Monday 23 Nov 2026 so weekday resolution is exact.

import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/intent.js'; // side effect: sets globalThis.PilotIntent
import '../js/flights.js'; // side effect: sets globalThis.PilotFlights
const {
  parseCommand, resolveDate, resolveSort, resolvePassengers,
  nextWeekday, formatISO, formatDateLabel, validateAiIntent,
} = globalThis.PilotIntent;
const {
  generateFlights, sortFlights, bestFlight, formatINR, formatDuration,
} = globalThis.PilotFlights;

const TODAY = new Date(2026, 10, 23); // Monday 23 Nov 2026
const DEFAULTS = { origin: 'DEL', destination: 'BLR', passengers: 1 };

/* ---------- date resolution ---------- */

test('nextWeekday: Friday after Mon 23 Nov 2026 is 27 Nov 2026', () => {
  assert.equal(formatISO(nextWeekday('friday', TODAY)), '2026-11-27');
});

test('nextWeekday: Monday after Monday is 7 days later', () => {
  assert.equal(formatISO(nextWeekday('monday', TODAY)), '2026-11-30');
});

test('resolveDate: "tomorrow" is 24 Nov 2026', () => {
  assert.equal(resolveDate('flight tomorrow', TODAY), '2026-11-24');
});

test('resolveDate: explicit "5 December" is 2026-12-05', () => {
  assert.equal(resolveDate('flight on 5 december', TODAY), '2026-12-05');
});

test('resolveDate: "27 Nov" is 2026-11-27', () => {
  assert.equal(resolveDate('flight on 27 nov', TODAY), '2026-11-27');
});

test('resolveDate: ISO date passes through', () => {
  assert.equal(resolveDate('flight on 2026-12-25', TODAY), '2026-12-25');
});

test('resolveDate: "next monday" is 30 Nov 2026', () => {
  assert.equal(resolveDate('flight next monday', TODAY), '2026-11-30');
});

test('formatDateLabel: 2026-11-27 reads Fri 27 Nov 2026', () => {
  assert.equal(formatDateLabel('2026-11-27'), 'Fri 27 Nov 2026');
});

/* ---------- sort + passengers ---------- */

test('resolveSort defaults to cheapest', () => {
  assert.equal(resolveSort('book a flight friday'), 'cheapest');
  assert.equal(resolveSort('cheapest flight'), 'cheapest');
  assert.equal(resolveSort('fastest flight'), 'fastest');
  assert.equal(resolveSort('earliest flight'), 'earliest');
  assert.equal(resolveSort('quickest flight'), 'fastest');
});

test('resolvePassengers reads digits and words', () => {
  assert.equal(resolvePassengers('for 2 people'), 2);
  assert.equal(resolvePassengers('for two people'), 2);
  assert.equal(resolvePassengers('3 passengers'), 3);
  assert.equal(resolvePassengers('just me'), 1);
  assert.equal(resolvePassengers('book a flight'), null);
});

/* ---------- full command parsing ---------- */

test('wow command: "book me the cheapest flight Friday"', () => {
  const i = parseCommand('book me the cheapest flight Friday', { today: TODAY, defaults: DEFAULTS });
  assert.equal(i.action, 'flight_search');
  assert.equal(i.origin, 'DEL');
  assert.equal(i.destination, 'BLR');
  assert.equal(i.date, '2026-11-27');
  assert.equal(i.dateLabel, 'Fri 27 Nov 2026');
  assert.equal(i.sort, 'cheapest');
  assert.equal(i.passengers, 1);
  assert.deepEqual(i.filledFromDefaults, ['origin', 'destination', 'passengers']);
});

test('from/to route with tomorrow and 2 people', () => {
  const i = parseCommand('fastest flight from Mumbai to Delhi tomorrow for 2 people', { today: TODAY, defaults: DEFAULTS });
  assert.equal(i.origin, 'BOM');
  assert.equal(i.destination, 'DEL');
  assert.equal(i.date, '2026-11-24');
  assert.equal(i.sort, 'fastest');
  assert.equal(i.passengers, 2);
  assert.deepEqual(i.filledFromDefaults, []);
});

test('"earliest flight to Hyderabad on 5 December"', () => {
  const i = parseCommand('earliest flight to Hyderabad on 5 December', { today: TODAY, defaults: DEFAULTS });
  assert.equal(i.origin, 'DEL');
  assert.equal(i.destination, 'HYD');
  assert.equal(i.date, '2026-12-05');
  assert.equal(i.sort, 'earliest');
  assert.deepEqual(i.filledFromDefaults, ['origin', 'passengers']);
});

test('"cheapest flight Delhi to Goa next Monday"', () => {
  const i = parseCommand('cheapest flight Delhi to Goa next Monday', { today: TODAY, defaults: DEFAULTS });
  assert.equal(i.origin, 'DEL');
  assert.equal(i.destination, 'GOI');
  assert.equal(i.date, '2026-11-30');
  assert.equal(i.sort, 'cheapest');
});

test('city aliases: Bangalore, Bombay, Madras resolve', () => {
  const i = parseCommand('flight from Bangalore to Bombay', { today: TODAY, defaults: DEFAULTS });
  assert.equal(i.origin, 'BLR');
  assert.equal(i.destination, 'BOM');
});

test('airport codes are understood', () => {
  const i = parseCommand('flight DEL to CCU friday', { today: TODAY, defaults: DEFAULTS });
  assert.equal(i.origin, 'DEL');
  assert.equal(i.destination, 'CCU');
  assert.equal(i.date, '2026-11-27');
});

test('non-flight command is unsupported, not guessed', () => {
  const i = parseCommand('play some music', { today: TODAY, defaults: DEFAULTS });
  assert.equal(i.action, 'unsupported');
  const empty = parseCommand('', { today: TODAY, defaults: DEFAULTS });
  assert.equal(empty.action, 'unsupported');
});

test('validateAiIntent accepts a good Gemini object and rejects same-city', () => {
  const ok = validateAiIntent(
    { origin: 'DEL', destination: 'BLR', date: '2026-11-27', sort: 'cheapest', passengers: 2 },
    { today: TODAY, defaults: DEFAULTS },
  );
  assert.equal(ok.action, 'flight_search');
  assert.equal(ok.parseSource, 'gemini');
  assert.equal(ok.passengers, 2);
  const bad = validateAiIntent(
    { origin: 'DEL', destination: 'DEL', date: '2026-11-27', sort: 'cheapest', passengers: 1 },
    { today: TODAY, defaults: DEFAULTS },
  );
  assert.equal(bad, null);
});

/* ---------- seeded flights ---------- */

test('generateFlights returns 8 deterministic flights for a route+date', () => {
  const a = generateFlights('DEL', 'BLR', '2026-11-27');
  const b = generateFlights('DEL', 'BLR', '2026-11-27');
  assert.equal(a.length, 8);
  assert.deepEqual(a, b); // same input -> same flights
  const c = generateFlights('DEL', 'BOM', '2026-11-27');
  assert.notDeepEqual(a, c); // different route -> different flights
  for (const f of a) {
    assert.ok(f.airline && f.flightNo && f.depart && f.arrive);
    assert.ok(f.durationMin >= 55 && f.durationMin <= 220);
    assert.ok(f.price >= 1800);
    assert.equal(f.stops, 0);
    assert.equal(f.origin, 'DEL');
    assert.equal(f.destination, 'BLR');
  }
});

test('departure times are unique within one search', () => {
  const flights = generateFlights('DEL', 'BLR', '2026-11-27');
  const times = new Set(flights.map((f) => f.depart));
  assert.equal(times.size, 8);
});

test('sortFlights cheapest puts the lowest price first', () => {
  const flights = generateFlights('DEL', 'BLR', '2026-11-27');
  const sorted = sortFlights(flights, 'cheapest');
  const min = Math.min(...flights.map((f) => f.price));
  assert.equal(sorted[0].price, min);
  assert.ok(sorted.every((f, i) => i === 0 || f.price >= sorted[i - 1].price));
});

test('sortFlights fastest puts the shortest duration first', () => {
  const flights = generateFlights('DEL', 'BLR', '2026-11-27');
  const sorted = sortFlights(flights, 'fastest');
  const min = Math.min(...flights.map((f) => f.durationMin));
  assert.equal(sorted[0].durationMin, min);
});

test('sortFlights earliest puts the first departure first', () => {
  const flights = generateFlights('DEL', 'BLR', '2026-11-27');
  const sorted = sortFlights(flights, 'earliest');
  const min = flights.map((f) => f.depart).sort()[0];
  assert.equal(sorted[0].depart, min);
});

test('bestFlight agrees with the sorted first row for each sort', () => {
  const flights = generateFlights('BOM', 'HYD', '2026-12-05');
  for (const sort of ['cheapest', 'fastest', 'earliest']) {
    assert.equal(bestFlight(flights, sort).id, sortFlights(flights, sort)[0].id);
  }
  assert.equal(bestFlight([], 'cheapest'), null);
});

test('formatINR uses Indian grouping', () => {
  assert.equal(formatINR(4299), '₹4,299');
  assert.equal(formatINR(12500), '₹12,500');
});

test('formatDuration renders hours and minutes', () => {
  assert.equal(formatDuration(115), '1h 55m');
  assert.equal(formatDuration(45), '45m');
});


test('resolveDate: "day after tomorrow" is 25 Nov 2026, not tomorrow', () => {
  assert.equal(resolveDate('flight day after tomorrow', TODAY), '2026-11-25');
  assert.equal(resolveDate('fly to mumbai day after tomorrow', TODAY), '2026-11-25');
});

test('parseCommand: "day after tomorrow" survives the full parse', () => {
  const intent = parseCommand('book me a flight from Delhi to Mumbai day after tomorrow', { today: TODAY });
  assert.equal(intent.action, 'flight_search');
  assert.equal(intent.date, '2026-11-25');
  assert.deepEqual(intent.filledFromDefaults, ['passengers']);
});
