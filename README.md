# Pilot — Voice-controlled computer agent

Say **“book me the cheapest flight Friday”** and watch the browser open a
flight search, fill the form, sort by cheapest, and highlight the best result
— live, with narration.

Built by Sivasai Boggu, 2026. MIT licensed. Hackathon project #14.

## What it does

1. **Speak or type.** The mic uses the Web Speech API (free, in-browser:
   Chrome/Edge unprefixed since Chrome 139, Safari via `webkitSpeechRecognition`).
   The typed-command box always works and is the reliable path in a noisy room.
2. **Understand.** The command becomes a structured intent
   (origin, destination, date, cheapest/fastest/earliest, passengers).
   With your own free Gemini API key saved in Settings, `gemini-2.5-flash`
   parses it as JSON. Without a key, a local parser handles flight commands —
   no key, no network, no faking.
3. **Confirm.** The intent card shows the resolved date (weekday names always
   resolve to an explicit date, e.g. “Friday” → Fri 27 Nov 2026) and marks
   every field that came from a default. Nothing runs until you press **Run it**.
4. **Operate.** The agent fills the form field by field, submits, sorts, and
   highlights the best flight — each step narrated in the activity feed and
   highlighted in the browser window, with optional spoken narration.
5. **Stop honestly.** The run ends at the search results. Booking needs your
   account, passenger details and payment, so the agent never logs in and
   never touches payment — and says so on screen.

Also included: example commands (one tap), run history with replay
(localStorage only), Settings (home city, default destination, passengers,
Gemini key, narration, mic language), and a standalone demo flight page.

## Run it

No build step, no server, no key needed.

```bash
# Option 1 — open the file directly
open index.html

# Option 2 — serve it (needed for the microphone in some browsers)
python3 -m http.server 8123
# then open http://localhost:8123
```

The demo flight page also opens on its own: `demo-flights.html`.

## Try it

- “book me the cheapest flight Friday”
- “fastest flight from Mumbai to Delhi tomorrow for 2 people”
- “earliest flight to Hyderabad on 5 December”
- “cheapest flight Delhi to Goa next Monday”

## Add a Gemini key (optional)

1. Get a free key at Google AI Studio: https://aistudio.google.com/apikey
2. Open **Settings** in Pilot, paste the key, press **Test key**, then **Save settings**.
3. Commands are then parsed by `gemini-2.5-flash` (REST `generateContent`,
   `responseMimeType: application/json`). The key is stored in localStorage
   only and sent only to Google's Gemini API. If the call fails, Pilot falls
   back to the local parser and says so.

## Versions verified (23 Nov 2026)

| Piece | Version / status |
|---|---|
| Gemini model | `gemini-2.5-flash` (stable; free tier via AI Studio) |
| Web Speech API | `SpeechRecognition` unprefixed in Chrome 139+, `webkitSpeechRecognition` in Safari and older Chromium; desktop Firefox from v160 (Nov 2026) |
| Playwright (scripts/) | 1.65.1 (released 13 Nov 2026), Node 22/24/26 |

## Real-browser automation

`scripts/playwright-flight.mjs` drives the demo page in a real Chromium with
Playwright 1.65.1 — fill the form, submit, sort, check the cheapest flight
is highlighted:

```bash
cd scripts && npm install
npx playwright install chromium
node playwright-flight.mjs
```

It was not run in this build VM (no browser download there). The in-page
agent runner performs the same observable steps against the same demo page.
The script never logs in and never touches payment, by design.

## Honest limits

- **No real booking.** A real booking needs a logged-in account, passenger
  details, and payment, and real flight sites may block automation or show
  CAPTCHAs. The demo stops at search results and says so.
- **Demo fares, not live fares.** All flights on the demo page are seeded
  data, generated deterministically from the route + date so the demo is
  repeatable. The page is labelled “Demo data” everywhere.
- **Voice needs a supported browser.** Chrome/Edge work best; Safari works
  via the webkit prefix; Firefox desktop only from v160. In Chrome, speech
  is sent to Google's recognition service by default. The typed box always works.
- **Flight search only, one-way only, in v1.** No return dates, no hotels,
  no other tasks. See `PLAN.md` for the v2 roadmap.
- **No key is bundled.** Without your own Gemini key, parsing is local —
  it handles flight commands well and says plainly when a command is not a
  flight search instead of guessing.

## Project layout

```text
index.html               console: mic + typed input, intent card, feed, history
demo-flights.html        standalone demo flight-search page (seeded data)
css/styles.css           design system — forest #166534, Work Sans
js/intent.js             pure intent parser (local; unit-tested)
js/flights.js            seeded flight data + sorting (unit-tested)
js/app.js                UI, voice, Gemini call, agent runner, history
scripts/playwright-flight.mjs   real-Chromium driver (Playwright 1.65.1)
tests/run-tests.mjs      node:test suite
PLAN.md                  deepened SaaS-level plan + 2-minute demo script
```

## Design

Forest green `#166534` as the single accent on paper white, Work Sans
throughout. The signature idea is the operator console: a browser window
with a real chrome bar and a visible agent highlight on every control the
agent touches. References: Linear (console layout, activity trace), Raycast
(command-first input), Mobbin (real flight-booking screens). No gradients,
no glows, no cliché copy.

## Tests

```bash
npm test   # node tests/run-tests.mjs
```

26 tests, 0 failures: weekday/date resolution, command phrasing, city
aliases, sort/passenger parsing, unsupported commands, deterministic flight
generation, and cheapest/fastest/earliest sorting.

## Deploy

Static files — GitHub Pages works: enable Pages on the repo (main branch,
root) and the site is live. No server or environment variables needed.
