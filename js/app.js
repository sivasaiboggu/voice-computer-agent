// Pilot — console UI: voice input, intent parsing (local + Gemini),
// the agent runner that operates the demo flight page, and run history.
// No key is bundled. Without a Gemini key the local parser runs everything.

// Classic script: intent.js and flights.js load first. Their top-level
// names (AIRPORTS, parseCommand, generateFlights, ...) are already in scope
// here — classic scripts share the global lexical scope, so re-declaring
// them would throw "Identifier has already been declared".
// (globalThis.PilotIntent / PilotFlights exist for debuggers and Node tests.)

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SETTINGS_KEY = 'pilot.settings.v1';
const RUNS_KEY = 'pilot.runs.v1';
const GEMINI_MODEL = 'gemini-2.5-flash'; // stable, verified Nov 2026

const EXAMPLE_COMMANDS = [
  'book me the cheapest flight Friday',
  'fastest flight from Mumbai to Delhi tomorrow for 2 people',
  'earliest flight to Hyderabad on 5 December',
  'cheapest flight Delhi to Goa next Monday',
];

/* ---------------- settings ---------------- */

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      homeCity: saved.homeCity || DEFAULTS.origin,
      defaultDestination: saved.defaultDestination || DEFAULTS.destination,
      defaultPassengers: saved.defaultPassengers || DEFAULTS.passengers,
      geminiKey: saved.geminiKey || '',
      narration: saved.narration !== false,
      micLang: saved.micLang || 'en-IN',
    };
  } catch {
    return {
      homeCity: DEFAULTS.origin, defaultDestination: DEFAULTS.destination,
      defaultPassengers: DEFAULTS.passengers, geminiKey: '',
      narration: true, micLang: 'en-IN',
    };
  }
}

let settings = loadSettings();
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/* ---------------- element refs ---------------- */

const micBtn = $('micBtn');
const micStatus = $('micStatus');
const transcriptEl = $('transcript');
const commandInput = $('commandInput');
const commandForm = $('commandForm');
const understandBtn = $('understandBtn');
const exampleChips = $('exampleChips');
const intentEmpty = $('intentEmpty');
const intentArea = $('intentArea');
const unsupportedArea = $('unsupportedArea');
const parseBadge = $('parseBadge');
const intentOrigin = $('intentOrigin');
const intentDestination = $('intentDestination');
const intentDate = $('intentDate');
const intentPassengers = $('intentPassengers');
const intentSort = $('intentSort');
const intentDateLabel = $('intentDateLabel');
const destDefaultTag = $('destDefaultTag');
const intentNote = $('intentNote');
const runBtn = $('runBtn');
const clearIntentBtn = $('clearIntentBtn');
const feedEl = $('feed');
const feedEmpty = $('feedEmpty');
const historyList = $('historyList');
const historyEmpty = $('historyEmpty');
const flightForm = $('flightForm');
const flightOrigin = $('flightOrigin');
const flightDestination = $('flightDestination');
const flightDate = $('flightDate');
const flightSort = $('flightSort');
const resultsTitle = $('resultsTitle');
const resultsCount = $('resultsCount');
const resultsList = $('resultsList');
const resultsEmpty = $('resultsEmpty');
const stopCard = $('stopCard');
const stopText = $('stopText');

let currentIntent = null;
let running = false;
let stepCount = 0;

/* ---------------- selects ---------------- */

function airportOptions(select, selected) {
  select.innerHTML = '';
  for (const a of AIRPORTS) {
    const opt = document.createElement('option');
    opt.value = a.code;
    opt.textContent = `${a.city} (${a.code})`;
    if (a.code === selected) opt.selected = true;
    select.appendChild(opt);
  }
}

airportOptions(intentOrigin, settings.homeCity);
airportOptions(intentDestination, settings.defaultDestination);
airportOptions(flightOrigin, settings.homeCity);
airportOptions(flightDestination, settings.defaultDestination);
airportOptions($('setHomeCity'), settings.homeCity);
airportOptions($('setDefaultDest'), settings.defaultDestination);
$('setPassengers').value = settings.defaultPassengers;
$('setMicLang').value = settings.micLang;
$('setGeminiKey').value = settings.geminiKey;
$('setNarration').checked = settings.narration;
flightDate.value = formatISO(nextWeekday('friday', new Date()));

/* ---------------- example chips ---------------- */

for (const text of EXAMPLE_COMMANDS) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.textContent = '“' + text + '”';
  chip.addEventListener('click', () => {
    commandInput.value = text;
    commandInput.focus();
    understandCommand(text);
  });
  exampleChips.appendChild(chip);
}

/* ---------------- narration + feed ---------------- */

function speak(text) {
  if (!settings.narration || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = settings.micLang || 'en-IN';
    window.speechSynthesis.speak(u);
  } catch { /* narration is best-effort */ }
}

function feedAdd(text) {
  feedEmpty.hidden = true;
  stepCount += 1;
  const li = document.createElement('li');
  const no = document.createElement('span');
  no.className = 'step-no';
  no.textContent = stepCount;
  const body = document.createElement('span');
  body.textContent = text;
  const time = document.createElement('span');
  time.className = 'step-time';
  time.textContent = new Date().toLocaleTimeString('en-IN', { hour12: false });
  li.append(no, body, time);
  feedEl.appendChild(li);
  li.scrollIntoView({ block: 'nearest' });
  speak(text);
}

function feedReset() {
  feedEl.innerHTML = '';
  feedEmpty.hidden = false;
  stepCount = 0;
}

/* ---------------- flight results ---------------- */

function renderResults(flights, sort, winnerId) {
  resultsList.innerHTML = '';
  const sorted = sortFlights(flights, sort);
  const winner = winnerId || (sorted[0] && sorted[0].id);
  if (sorted.length === 0) {
    resultsEmpty.hidden = false;
    resultsCount.textContent = '';
    return;
  }
  resultsEmpty.hidden = true;
  resultsCount.textContent = `${sorted.length} flights · ${SORT_LABELS[sort].toLowerCase()} · demo data`;
  resultsTitle.textContent = `Results — ${airportCity(flights[0].origin)} to ${airportCity(flights[0].destination)} · ${formatDateLabel(flights[0].date)}`;
  for (const f of sorted) {
    const li = document.createElement('li');
    li.className = 'flight-row' + (f.id === winner ? ' winner' : '');
    li.id = 'flight-' + f.id;
    li.innerHTML =
      `<div><div class="airline">${f.airline}${f.id === winner ? '<span class="winner-tag">Best match</span>' : ''}</div>` +
      `<div class="flight-no">${f.flightNo} · Non-stop</div></div>` +
      `<div class="times">${f.depart} – ${f.arrive}<span>${airportCity(f.origin)} → ${airportCity(f.destination)}</span></div>` +
      `<div class="dur">${f.duration}</div>` +
      `<div class="price">${formatINR(f.price)}<span>per person · demo fare</span></div>`;
    resultsList.appendChild(li);
  }
  return sorted[0];
}

/* ---------------- intent parsing ---------------- */

function cityNameToCode(value) {
  const v = String(value || '').trim().toLowerCase();
  const byCode = AIRPORTS.find((a) => a.code.toLowerCase() === v);
  if (byCode) return byCode.code;
  const byCity = AIRPORTS.find((a) => a.city.toLowerCase() === v);
  if (byCity) return byCity.code;
  if (v === 'bangalore') return 'BLR';
  if (v === 'bombay') return 'BOM';
  if (v === 'madras') return 'MAA';
  if (v === 'calcutta') return 'CCU';
  if (v === 'cochin') return 'COK';
  if (v === 'new delhi') return 'DEL';
  return null;
}

async function parseWithGemini(text) {
  const today = formatISO(new Date());
  const cities = AIRPORTS.map((a) => `${a.city} (${a.code})`).join(', ');
  const prompt =
    `You parse a voice command for a flight search. Today is ${today}. ` +
    `Airports: ${cities}. ` +
    `Return ONLY a JSON object with keys: origin (airport code), destination (airport code), ` +
    `date (yyyy-mm-dd; a weekday name means its next occurrence after today), ` +
    `sort ("cheapest", "fastest" or "earliest"), passengers (integer 1-9). ` +
    `Use defaults only when the command omits a field: origin Delhi (DEL), destination Bengaluru (BLR), ` +
    `date the next Friday, sort cheapest, passengers 1. ` +
    `Command: "${text}"`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(settings.geminiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 256 },
        }),
      },
    );
    if (!res.ok) throw new Error('Gemini returned HTTP ' + res.status);
    const data = await res.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const obj = JSON.parse(rawJson);
    if (obj.origin) obj.origin = cityNameToCode(obj.origin) || obj.origin;
    if (obj.destination) obj.destination = cityNameToCode(obj.destination) || obj.destination;
    const intent = validateAiIntent(obj, {
      defaults: { origin: settings.homeCity, destination: settings.defaultDestination, passengers: settings.defaultPassengers },
    });
    if (!intent) throw new Error('Gemini returned an unusable intent');
    intent.raw = text;
    return intent;
  } finally {
    clearTimeout(timer);
  }
}

function showIntent(intent) {
  currentIntent = intent;
  intentEmpty.hidden = true;
  unsupportedArea.hidden = true;
  intentArea.hidden = false;
  parseBadge.textContent = intent.parseSource === 'gemini' ? 'Parsed by Gemini' : 'Parsed locally';
  parseBadge.classList.toggle('local', intent.parseSource !== 'gemini');
  intentOrigin.value = intent.origin;
  intentDestination.value = intent.destination;
  intentDate.value = intent.date;
  intentPassengers.value = intent.passengers;
  intentSort.value = intent.sort;
  intentDateLabel.value = intent.dateLabel;
  const filled = intent.filledFromDefaults || [];
  destDefaultTag.hidden = !filled.includes('destination');
  const notes = [];
  if (filled.includes('destination')) notes.push('Destination came from your default — the command did not name one.');
  if (filled.includes('origin')) notes.push('Origin came from your home city default.');
  if (filled.includes('date')) notes.push('No date was named, so the next Friday was used.');
  if (filled.includes('passengers')) notes.push('Passenger count defaulted to ' + intent.passengers + '.');
  intentNote.textContent = notes.length
    ? notes.join(' ')
    : 'Every field came from what you said. Edit anything, then press Run it.';
}

function showUnsupported(reason) {
  currentIntent = null;
  intentEmpty.hidden = true;
  intentArea.hidden = true;
  unsupportedArea.hidden = false;
  unsupportedArea.textContent = reason === 'empty'
    ? 'Say or type a command first.'
    : 'Pilot only searches flights in this build — for example, “book me the cheapest flight Friday”. Try one of the examples above.';
}

async function understandCommand(text, opts = {}) {
  const raw = String(text || '').trim();
  if (!raw) { showUnsupported('empty'); return; }
  understandBtn.disabled = true;
  understandBtn.textContent = 'Understanding…';
  try {
    let intent;
    let geminiFailed = false;
    if (settings.geminiKey) {
      try {
        intent = await parseWithGemini(raw);
      } catch (e) {
        geminiFailed = true;
        intent = parseCommand(raw, {
          defaults: { origin: settings.homeCity, destination: settings.defaultDestination, passengers: settings.defaultPassengers },
        });
      }
    } else {
      intent = parseCommand(raw, {
        defaults: { origin: settings.homeCity, destination: settings.defaultDestination, passengers: settings.defaultPassengers },
      });
    }
    if (!intent || intent.action !== 'flight_search') { showUnsupported(intent?.reason); return; }
    showIntent(intent);
    if (geminiFailed) {
      intentNote.textContent += ' (Gemini did not answer, so this was parsed locally.)';
    }
    if (opts.autoRun) await runAgent();
  } finally {
    understandBtn.disabled = false;
    understandBtn.textContent = 'Understand';
  }
}

commandForm.addEventListener('submit', (e) => {
  e.preventDefault();
  understandCommand(commandInput.value);
});

clearIntentBtn.addEventListener('click', () => {
  currentIntent = null;
  intentArea.hidden = true;
  unsupportedArea.hidden = true;
  intentEmpty.hidden = false;
  commandInput.value = '';
  transcriptEl.textContent = '';
  commandInput.focus();
});

intentDate.addEventListener('change', () => {
  if (currentIntent && intentDate.value) {
    currentIntent.date = intentDate.value;
    currentIntent.dateLabel = formatDateLabel(intentDate.value);
    intentDateLabel.value = currentIntent.dateLabel;
  }
});

/* ---------------- agent runner ---------------- */

function readIntentFromCard() {
  if (!currentIntent) return null;
  return {
    ...currentIntent,
    origin: intentOrigin.value,
    destination: intentDestination.value,
    date: intentDate.value || currentIntent.date,
    dateLabel: intentDate.value ? formatDateLabel(intentDate.value) : currentIntent.dateLabel,
    passengers: Math.min(9, Math.max(1, Number(intentPassengers.value) || 1)),
    sort: intentSort.value,
  };
}

function flashControl(el) {
  el.classList.add('agent-active');
  el.focus({ preventScroll: true });
  setTimeout(() => el.classList.remove('agent-active'), 900);
}

async function runAgent() {
  const intent = readIntentFromCard();
  if (!intent || running) return;
  if (intent.origin === intent.destination) {
    feedAdd('That route starts and ends in the same city. Pick a different destination and run it again.');
    return;
  }
  running = true;
  runBtn.disabled = true;
  understandBtn.disabled = true;
  stopCard.hidden = true;
  feedReset();
  try {
    feedAdd('Opening the flight search.');
    await sleep(650);

    flightOrigin.value = intent.origin;
    flashControl(flightOrigin);
    feedAdd(`Setting origin to ${airportLabel(intent.origin)}.`);
    await sleep(700);

    flightDestination.value = intent.destination;
    flashControl(flightDestination);
    feedAdd(`Setting destination to ${airportLabel(intent.destination)}.`);
    await sleep(700);

    flightDate.value = intent.date;
    flashControl(flightDate);
    feedAdd(`Setting the date to ${intent.dateLabel}.`);
    await sleep(700);

    flightSort.value = intent.sort;
    flashControl(flightSort);
    feedAdd(`Sorting by ${intent.sort} first, for ${intent.passengers} passenger${intent.passengers > 1 ? 's' : ''}.`);
    await sleep(700);

    feedAdd('Searching flights…');
    await sleep(800);
    const flights = generateFlights(intent.origin, intent.destination, intent.date);
    const winner = renderResults(flights, intent.sort);
    await sleep(500);

    const row = document.getElementById('flight-' + winner.id);
    if (row) {
      row.classList.add('agent-active');
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTimeout(() => row.classList.remove('agent-active'), 1200);
    }
    const sortWord = intent.sort === 'cheapest' ? 'Cheapest' : intent.sort === 'fastest' ? 'Fastest' : 'Earliest';
    feedAdd(`${sortWord} flight: ${winner.airline} ${winner.flightNo}, ${winner.depart} to ${winner.arrive}, ${winner.duration}, ${formatINR(winner.price)}.`);
    await sleep(600);

    const sortNoun = intent.sort === 'cheapest' ? 'cheapest' : intent.sort === 'fastest' ? 'fastest' : 'earliest';
    stopText.textContent = `Booking needs your account, passenger details and payment, so Pilot does not go further. The search is done: the ${sortNoun} flight is highlighted above.`;
    stopCard.hidden = false;
    feedAdd('Stopped before login and payment — the search is done.');
    saveRun(intent, winner);
  } finally {
    running = false;
    runBtn.disabled = false;
    understandBtn.disabled = false;
  }
}

runBtn.addEventListener('click', runAgent);

/* Manual search on the demo page itself (no agent, no narration). */
flightForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (flightOrigin.value === flightDestination.value) {
    resultsEmpty.hidden = false;
    resultsEmpty.textContent = 'Origin and destination are the same city — pick a different destination.';
    resultsList.innerHTML = '';
    resultsCount.textContent = '';
    return;
  }
  const flights = generateFlights(flightOrigin.value, flightDestination.value, flightDate.value);
  renderResults(flights, flightSort.value);
  stopCard.hidden = true;
});

/* ---------------- history ---------------- */

function loadRuns() {
  try { return JSON.parse(localStorage.getItem(RUNS_KEY) || '[]'); } catch { return []; }
}

function saveRun(intent, winner) {
  const runs = loadRuns();
  runs.unshift({
    id: Date.now(),
    at: new Date().toISOString(),
    command: intent.raw,
    route: `${airportCity(intent.origin)} → ${airportCity(intent.destination)}`,
    dateLabel: intent.dateLabel,
    winner: `${winner.airline} ${winner.flightNo}`,
    price: winner.price,
    sort: intent.sort,
  });
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  const runs = loadRuns();
  historyList.innerHTML = '';
  historyEmpty.hidden = runs.length > 0;
  for (const r of runs) {
    const li = document.createElement('li');
    const cmd = document.createElement('span');
    cmd.className = 'cmd';
    cmd.textContent = `“${r.command}”`;
    cmd.title = `${r.route} · ${r.dateLabel}`;
    const result = document.createElement('span');
    result.className = 'result';
    result.textContent = `${r.winner} · ${formatINR(r.price)}`;
    const replay = document.createElement('button');
    replay.className = 'btn';
    replay.type = 'button';
    replay.textContent = 'Replay';
    replay.addEventListener('click', () => {
      commandInput.value = r.command;
      understandCommand(r.command, { autoRun: true });
    });
    li.append(cmd, result, replay);
    historyList.appendChild(li);
  }
}

$('clearHistoryBtn').addEventListener('click', () => {
  localStorage.removeItem(RUNS_KEY);
  renderHistory();
});

renderHistory();

/* Deep link: index.html?cmd=book%20me%20the%20cheapest%20flight%20Friday
   fills the command and runs it — useful for demos and for screenshots. */
const deepLinkCmd = new URLSearchParams(location.search).get('cmd');
if (deepLinkCmd) {
  commandInput.value = deepLinkCmd;
  understandCommand(deepLinkCmd, { autoRun: true });
}

/* ---------------- voice input ---------------- */

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (!SpeechRecognition) {
  micBtn.disabled = true;
  micStatus.innerHTML = '<strong>Voice input is not available in this browser</strong>Use Chrome, Edge or Safari — or type your command below.';
} else {
  recognition = new SpeechRecognition();
  recognition.lang = settings.micLang;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.addEventListener('result', (e) => {
    let interim = '';
    let finalText = '';
    for (const res of e.results) {
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    transcriptEl.innerHTML = '';
    if (finalText) {
      transcriptEl.textContent = finalText;
      commandInput.value = finalText.trim();
    } else {
      transcriptEl.textContent = interim;
      const span = document.createElement('span');
      span.className = 'interim';
      span.textContent = ' (listening…)';
      transcriptEl.appendChild(span);
    }
  });

  recognition.addEventListener('end', () => {
    listening = false;
    micBtn.classList.remove('listening');
    micBtn.setAttribute('aria-label', 'Start listening');
    const text = commandInput.value.trim();
    micStatus.innerHTML = text
      ? '<strong>Heard you.</strong>Check the intent below, then press Run it.'
      : '<strong>Tap the mic and speak</strong>or type below — typing always works.';
    if (text) understandCommand(text);
  });

  recognition.addEventListener('error', (e) => {
    listening = false;
    micBtn.classList.remove('listening');
    const msg = e.error === 'not-allowed'
      ? 'Microphone access was blocked. Allow the mic in the browser, or type your command below.'
      : e.error === 'network'
        ? 'Speech recognition needs a network connection in Chrome. Type your command below instead.'
        : 'Voice input hit a problem (' + e.error + '). Type your command below instead.';
    micStatus.innerHTML = '<strong>Mic did not work</strong>' + msg;
  });

  micBtn.addEventListener('click', () => {
    if (listening) { recognition.stop(); return; }
    try {
      recognition.lang = settings.micLang;
      recognition.start();
      listening = true;
      micBtn.classList.add('listening');
      micBtn.setAttribute('aria-label', 'Stop listening');
      transcriptEl.textContent = '';
      micStatus.innerHTML = '<strong>Listening…</strong>Speak now, for example “book me the cheapest flight Friday”.';
    } catch {
      micStatus.innerHTML = '<strong>Mic did not start.</strong>Try again, or type your command below.';
    }
  });
}

/* ---------------- settings dialog ---------------- */

const dialog = $('settingsDialog');
$('settingsBtn').addEventListener('click', () => {
  $('setHomeCity').value = settings.homeCity;
  $('setDefaultDest').value = settings.defaultDestination;
  $('setPassengers').value = settings.defaultPassengers;
  $('setMicLang').value = settings.micLang;
  $('setGeminiKey').value = settings.geminiKey;
  $('setNarration').checked = settings.narration;
  $('keyStatus').textContent = settings.geminiKey
    ? 'A key is saved on this device. Use “Test key” to check it still works.'
    : 'Without a key, Pilot parses commands locally — that always works for flight commands.';
  $('keyStatus').className = 'key-status';
  dialog.showModal();
});
$('settingsCloseBtn').addEventListener('click', () => dialog.close());
$('settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  settings = {
    homeCity: $('setHomeCity').value,
    defaultDestination: $('setDefaultDest').value,
    defaultPassengers: Math.min(9, Math.max(1, Number($('setPassengers').value) || 1)),
    geminiKey: $('setGeminiKey').value.trim(),
    narration: $('setNarration').checked,
    micLang: $('setMicLang').value,
  };
  saveSettings();
  airportOptions(intentOrigin, settings.homeCity);
  airportOptions(intentDestination, settings.defaultDestination);
  airportOptions(flightOrigin, settings.homeCity);
  airportOptions(flightDestination, settings.defaultDestination);
  dialog.close();
});

$('testKeyBtn').addEventListener('click', async () => {
  const key = $('setGeminiKey').value.trim();
  const status = $('keyStatus');
  if (!key) {
    status.textContent = 'Paste a key first — get a free one from Google AI Studio (aistudio.google.com).';
    status.className = 'key-status err';
    return;
  }
  status.textContent = 'Testing key…';
  status.className = 'key-status';
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with exactly this word: ok' }] }],
          generationConfig: { maxOutputTokens: 16 },
        }),
      },
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (/ok/i.test(text)) {
      status.textContent = 'Key works. Gemini will parse commands from now on.';
      status.className = 'key-status ok';
    } else {
      throw new Error('unexpected reply');
    }
  } catch {
    status.textContent = 'That key did not work. Check it and try again — local parsing still works meanwhile.';
    status.className = 'key-status err';
  }
});
