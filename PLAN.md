# Pilot — Voice-controlled computer agent

**One sentence:** Say what you want done on the computer — "book me the cheapest
flight Friday" — and Pilot works the browser in front of you, narrating each
step, and stops honestly where a real booking would need your account and
payment.

**Status:** Hackathon build (24–48h scope), demoable end to end with no API key.
Live AI intent parsing works when the user pastes their own free Gemini API
key in Settings.

## 1. The problem

Booking a flight is a dozen small clicks: open a site, type two cities, pick
a date, set passengers, submit, sort, compare. Voice assistants today answer
with words; they do not do the clicks. The gap is an agent that takes a spoken
command, turns it into a plan, operates the interface, and shows its work —
without pretending it can finish steps that need a human (login, payment).

## 2. Who it is for

- Travellers who book the same kind of trip often (same home city, same
  Friday flight) and want the search done by voice.
- Demo and hackathon audiences who want to see an agent operate a real
  interface, not a chat bubble.
- Builders who want a small, honest reference implementation of
  voice → intent → browser action, with the guardrails visible.

## 3. What it does (feature set, v1)

### Core loop
1. **Speak or type.** Microphone uses the Web Speech API (free, in-browser,
   Chrome/Edge unprefixed since Chrome 139, Safari via `webkitSpeechRecognition`).
   A typed-command box is always present and always works — it is the primary
   input when the mic is unavailable, denied, or in a noisy room.
2. **Understand.** The command is parsed into a structured intent:
   `{ action, origin, destination, date, sort, passengers, tripType }`.
   Two parsers, in this order:
   - **Gemini** (`gemini-2.5-flash`, free tier, REST `generateContent`,
     strict JSON) when a key is saved in Settings.
   - **Local parser** (no key, no network): city names, weekday names,
     "tomorrow", explicit dates, "cheapest / fastest / earliest", passenger
     counts in digits or words. This is the always-on fallback and the
     default in this build.
   The parsed intent is always shown for confirmation before anything runs,
   with every field that came from a default clearly marked "from your
   default".
3. **Confirm.** An intent card shows origin → destination, the resolved date
   (weekday names always resolve to an explicit date, e.g. "Friday" →
   Fri 27 Nov 2026), sort order, passengers. The user can edit any field or
   re-type the command.
4. **Operate.** The agent drives the flight search step by step, with a
   visible narration feed ("Filling in Delhi → Bengaluru…", "Sorting by
   cheapest…"). Each step highlights the control it is touching, so the
   audience can follow along.
5. **Stop honestly.** The run ends at the search results with the best option
   highlighted. A stop card says plainly: booking and payment need your
   account, passenger details, and payment — the agent never logs in and
   never touches payment.

### Flight search (demo surface)
- A clearly labelled **demo flight-search page** with seeded flight data
  (Indian domestic routes, 8 flights per search, deterministic prices and
  times for a given route + date). Labelled "Demo data" on screen — never
  presented as live fares.
- Sort by cheapest, fastest, or earliest. The winning flight is highlighted
  with price, times, airline, and duration.
- Seeded routes cover 12 Indian airports (Delhi, Bengaluru, Mumbai,
  Hyderabad, Chennai, Kolkata, Pune, Jaipur, Kochi, Ahmedabad, Goa,
  Lucknow); any pair of them produces a deterministic result set.
- A standalone copy of the demo page (`demo-flights.html`) opens on its own
  and is the target of the included Playwright script.

### Supporting features
- **Example commands** (one tap): "book me the cheapest flight Friday",
  "fastest flight from Mumbai to Delhi tomorrow for 2 people",
  "earliest flight to Hyderabad on 5 December", "cheapest flight Delhi to
  Goa next Monday".
- **Run history** (localStorage): every run with its command, resolved
  intent, winning flight and price; replay any past command with one tap;
  clear history.
- **Settings** (localStorage only, nothing leaves the machine except the
  Gemini call itself): home city, default destination, default passengers,
  Gemini API key (password field, "test key" button), voice narration
  on/off, mic language.
- **Narration:** each agent step is written to the activity feed and, when
  enabled, spoken with `speechSynthesis`.
- **Unsupported commands** are answered honestly: this build only does
  flight search. The UI says so and lists what it can do, instead of
  pretending.
- **Real-browser automation path:** `scripts/playwright-flight.mjs`
  (Playwright 1.65.1, pinned) drives the demo page in a real Chromium:
  fills the form, submits, sorts, checks the cheapest result is
  highlighted. Documented in the README; not run in this VM.

## 4. Data model

No server, no database. All state is in the browser.

```text
Settings (localStorage key: pilot.settings.v1)
  homeCity: string            // airport code, default "DEL"
  defaultDestination: string  // airport code, default "BLR"
  defaultPassengers: number   // default 1
  geminiKey: string           // user's own free key, localStorage only
  narration: boolean          // speak each step, default true
  micLang: string             // default "en-IN"

Intent
  action: "flight_search"
  origin: string              // airport code
  destination: string         // airport code
  date: string                // ISO yyyy-mm-dd, always explicit
  dateLabel: string           // "Fri 27 Nov 2026"
  sort: "cheapest" | "fastest" | "earliest"
  passengers: number
  tripType: "oneway"          // v1: one-way only; return is a v2 item
  filledFromDefaults: string[] // e.g. ["destination", "passengers"]
  parseSource: "gemini" | "local"
  raw: string                 // the original command

Flight (seeded, generated per route + date)
  id, airline, flightNo, depart (HH:MM), arrive (HH:MM),
  durationMin, stops (0 in v1), price (INR), route, date

Run (localStorage key: pilot.runs.v1, max 20)
  id, at (ISO timestamp), command, intent, winner { flightNo, price },
  status: "done" | "stopped" | "failed", note
```

## 5. User flow end to end

1. Open `index.html` (or the GitHub Pages site). The console shows the mic
   button, the typed-command box, example chips, and the browser window
   showing the demo flight page in its idle state.
2. Say or type "book me the cheapest flight Friday".
3. Transcript appears under the mic button (or the typed text is used as-is).
4. The intent card appears: Delhi → Bengaluru, Fri 27 Nov 2026, cheapest,
   1 passenger. "Destination" is marked "from your default" because the
   command did not name one.
5. Press **Run it** (or it runs after confirmation — v1 always waits for the
   tap, so a mis-heard command never drives the browser).
6. The agent narrates and acts, one step at a time, in the browser window:
   origin filled → destination filled → date filled → passengers set →
   search submitted → results sorted by cheapest → cheapest flight
   highlighted (e.g. IndiGo 6E-214, 06:10–08:55, ₹4,299).
7. The stop card appears: "Stopped here. Booking needs your account,
   passenger details and payment. The search is done — the cheapest flight
   is highlighted above."
8. The run is saved to history. The user can replay it, change the command,
   or open Settings to add a Gemini key for AI parsing.

Error paths:
- Mic not supported / denied → notice explains it, typed box stays front
  and centre; nothing breaks.
- Gemini key missing → local parser runs, badge says "Parsed locally".
- Gemini key wrong / request fails → error shown, local parser result used,
  badge says "Gemini failed — parsed locally".
- Command is not a flight search → "I can only search flights in this
  build" + the example chips.
- No flights for a route → seeded generator covers every pair of the 12
  airports, so this cannot happen; if it did, the UI would say so.

## 6. Architecture

Static single-page app — no build step, no server, runs from `file://` or
GitHub Pages. This is deliberate: the demo must work in a hackathon hall
with no backend.

```text
index.html            console: mic + typed input, intent card, activity
                      feed, history, settings; embeds the browser window
demo-flights.html     standalone demo flight-search page
css/styles.css        design system (forest #166534, Work Sans)
js/intent.js          pure intent parser (ESM, unit-tested in Node)
js/flights.js         seeded flight data + sorting (ESM, unit-tested)
js/app.js             UI, voice, Gemini call, agent runner, history
scripts/playwright-flight.mjs   real Chromium automation (Playwright 1.65.1)
tests/run-tests.mjs   node:test suite for intent + flights
```

Why static instead of the plan's Next.js + FastAPI + Playwright backend:
a Playwright backend needs a server and a browser download, which cannot be
assumed in the demo room and cannot run from GitHub Pages. The in-page
runner performs the same observable steps (fill, submit, sort, highlight)
against the labelled demo page, and the Playwright script is included for
the real-browser path. The README states this trade-off plainly.

## 7. Design identity

- **Colour:** forest green `#166534` as the single accent (under 10% of any
  screen), warm paper-white background `#faf9f6`, ink `#1c1917`, muted
  `#57534e`, hairline borders `#e7e5e4`. No gradients, no glows.
- **Type:** Work Sans (Google Fonts, system fallback) — one family, weights
  400/500/600/700; tabular figures for prices and times.
- **Signature idea:** the "operator console" — a browser window with a real
  chrome bar (traffic dots, URL pill reading `demo-flights — seeded data`)
  and a visible agent cursor: every control the agent touches gets a green
  outline and a step number badge. The audience watches the machine work.
- **References (from the playbook):** Linear (dense console layout, command
  bar, activity trace), Raycast (command-first input, keyboard-led flow),
  Mobbin (real flight-booking screens — form above results, sort control,
  one highlighted best option).
- **Motion:** 150–250ms, transform/opacity only — mic pulse while listening,
  step highlight, results appearing. Nothing decorative.

## 8. Honest limits (shown in the app and README)

1. **No real booking.** The agent stops at search results. A real booking
   needs a logged-in account, passenger details, and payment; real flight
   sites may block automation or show CAPTCHAs.
2. **Demo fares, not live fares.** All flights on the demo page are seeded
   data, labelled as such. Prices are deterministic for a route + date so
   the demo is repeatable.
3. **Voice needs a supported browser.** Speech recognition works in Chrome
   and Edge (unprefixed since Chrome 139), Safari via the webkit prefix,
   and desktop Firefox only from version 160 (Nov 2026). Audio is sent to
   the vendor's recognition service by default in Chrome. The typed box
   always works.
4. **Gemini parsing needs the user's own key.** No key is bundled. Without
   one, the local parser handles flight commands; it does not handle
   free-form requests outside flight search.
5. **One-way flights only in v1.** No return dates, no multi-city, no
   hotels, no other tasks. The roadmap lists them as v2.

## 9. 2-minute demo script

| Time | What happens | What the presenter says |
|------|--------------|-------------------------|
| 0:00–0:15 | Say "book me the cheapest flight Friday" into the mic. Transcript and intent card appear: Delhi → Bengaluru, Fri 27 Nov 2026, cheapest, 1 passenger. | "I am not going to click anything. I am going to ask for a flight." |
| 0:15–0:25 | Tap **Run it**. | "It shows me what it understood first. Origin and destination both came from my defaults, because I named neither." |
| 0:25–1:20 | The agent fills the form field by field, submits, sorts by price. Each step is narrated and highlighted in the browser window. | "Watch the form. It types, it submits, it sorts. Every step is on screen." |
| 1:20–1:45 | Cheapest flight highlighted: airline, times, price. | "There it is — the cheapest option, highlighted. That is the whole search." |
| 1:45–2:00 | Stop card appears. | "And it stops here. Booking needs my account and my payment, so it does not pretend. The search is done." |

Backup plan (say it on stage if used): if the mic fails in the hall, type
the same command — the typed box runs the identical path. If anything else
fails, the seeded demo page is deterministic, so re-running the same command
gives the same result.

## 10. Testing and verification

- `node tests/run-tests.mjs` — intent parsing (phrasings, weekday/date
  resolution, passenger counts, defaults, sort keywords), flight
  generation (deterministic, 8 flights, all fields present), sorting
  (cheapest/fastest/earliest) and cheapest selection. Target: all passing,
  0 failures.
- Headless-Chrome screenshots at 1280px and 390px, zero horizontal
  overflow, read by the builder and fixed until clean.
- Manual pass: mic in Chrome, typed command, Gemini key test, replay from
  history, Settings save.

## 11. Roadmap (v2, not built)

Return flights; more actions (hotel search, "open my calendar"); live
flight-site driver behind the Playwright script with a real backend;
multi-step plans ("cheapest flight Friday and add it to my calendar");
voice-first confirmation ("yes, run it"); per-user learned defaults.

## 12. Launch checklist

- [x] PLAN.md, README.md, MIT LICENSE
- [x] App runs from `file://` with no key and no server
- [x] Typed command works end to end; voice works in Chrome
- [x] Intent card shows resolved date and defaults used
- [x] Agent run narrates, highlights, stops before payment
- [x] Demo page labelled as seeded data
- [x] Tests pass, 0 failures; screenshots at 1280px + 390px, no overflow
- [ ] GitHub repo `voice-computer-agent` created by Siva; push to main
- [ ] GitHub Pages enabled for a live demo link
