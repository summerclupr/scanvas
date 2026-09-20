<p align="center"><img src="assets/images/scanvas-mark.png" width="96" alt="Scanvas"></p>

# Scanvas

As an MIT student, do you ever get tired of jumping between countless apps and websites just to figure out what you need to do each week? Have you ever missed a deadline simply because your emails got drowned in dorm-spam or because you forgot to check Canvas?

Introducing **Scanvas**, a local planner that keeps you on top of your workload while bringing together the opportunities, events, and information you care about. Your classes. Your assignments. Your opportunities. Your week. All in one place.

Scanvas runs entirely on your device using a local model. No account is required, and your data does not need to be sent to an external server.

---

## The idea

The app is organized into several tabs, starting with **Due**, which shows your upcoming tasks, **Plan** which suggests what to work on right now based on your priorities, and **Calendar**, which provides a visual overview of deadlines and upcoming events.

Scanvas focuses on two main areas: **obligations**, such as psets, exams, and project deadlines, and **opportunities**, including club events, UROP postings, talks, and recruiting opportunities, filtered based on your interests and coursework.

> **Try it before you connect anything.** Scanvas ships with sample coursework
> so every screen works the moment you open it, and each screen says so until a
> real account is connected. **Connect Canvas** (Settings → Accounts, about two
> minutes with a personal access token) to see your own psets, exams and grades.
> MIT's campus feeds are live from the first sync and need no account at all.

## What it does

- **Reads what you already have.** Canvas (assignments, quizzes, grade
  weights), Outlook (calendar, and mailing lists when connected with a Graph
  token), and MIT's public feeds: the Institute events calendar, Engage's club
  events, and Hydrant for your class times. Prose that no API structures — a
  colloquium buried in a `[csail-announce]` email, "tournament *Monday 7pm in
  26-100*" on a club's site — goes through a local LLM that turns it into real
  calendar entries, each with a date it verified.
- **Asks what you care about**, then ranks semantically: "machine learning"
  surfaces a talk on *foundation models for robot manipulation* despite
  sharing no keyword.
- **Plan** schedules work to **finish the day before it's due**, so a pset due
  tomorrow at 11:59pm shows up today. Each day lists what's due, what's on your
  schedule, and what to work on. Tick a session and its hours leave the
  estimate; leave it and it rolls to tomorrow. Ordering is
  `urgency × stakes × your priorities`, where stakes is your **real share of
  the final grade** from Canvas group weights — a 100-point lab in a
  60%-weighted group is 12% of your grade, not "100 points", so a small quiz
  can correctly outrank a big pset. An exam inside 24 hours pins to the top
  regardless. It estimates effort and tells you when a day is over budget.
- **Presets add work, not just reorder it** (`src/plan/suggest.ts`).
  *Get me out of my room* suggests up to three matching club, social and talk
  events a day; *Internships first* adds two application prompts a day across
  the week, each one tap from becoming planned work; *Balanced* offers one
  strong event match a day; *Grades first* keeps the plan to your work.
  Suggestions never count against your hour budget.
- **Saved applications become planned work.** Save an internship or research
  program and it starts today ("Work on application: Citadel — Quant Intern"),
  ends with "Submit" on the closing day, and appears in Due and on the
  calendar. A rolling posting with no deadline gets a target ten days out,
  labelled as yours. One closing months away still gets work placed this week.
  Unsave it and all of that disappears.
- **Notifications with every lead time editable** — exams, assignments and
  events each get their own set, plus quiet hours, a morning digest, and how
  good an event must be to interrupt you. Settings shows a live count of what
  would fire, and edits reschedule without a re-sync. Reminders are delivered
  by the phone app, and the queue stays within iOS's pending budget with
  deadlines placed first.
- **Calendar** with month and week zoom. Carries coursework, your class
  schedule (toggleable, since a heavy load crowds out deadlines), your own
  events, and the campus events and internships you saved — an unfiltered
  calendar of 4,000 internships is wallpaper. Well-matched events you haven't
  saved are one toggle away.
- **Your own repeating events** — club meetings, practices — stored as a rule
  (weekly / biweekly / daily, any weekdays, optional end date), so editing the
  series edits every occurrence. Reminders off by default.
- **For you** has two halves. *Events*: talks, research, club, social and
  career events from MIT's public calendars, one filter chip per kind with
  live counts, plus curated research programs (UROP funding, MSRP, REU) under
  Research. *Professors*: 74 MIT faculty matched to your interests, classes
  and follows, as a ranked list or **grouped by lab** — areas, courses taught,
  and **what they're teaching this term**, live from MIT's subject listing.
  Contact details are real: every homepage and department page is checked to
  resolve (`npm run verify:profs`), an email appears where the professor
  publishes it on their own page (22 of 74 do), and LinkedIn/Scholar open
  searches for the exact name.
- **Search across MIT** from the same box. The query is read for intent first
  (`src/search/intent.ts`) — a **name** ("max tegmark", "m. tegmark"), a
  **department** ("professors in the philosophy department"), a **topic**
  ("research in automatic speech recognition"), or anything else — and fans
  out to the sources that can answer it:
  - **People** — the checked faculty set, every instructor in this term's
    subject listing, and **OpenAlex** filtered to authors publishing from MIT.
    By name it returns the person with their research topics; by topic it maps
    the phrase onto OpenAlex's taxonomy ("Speech Recognition and Synthesis")
    and lists the most-published MIT authors under it, each linked to their
    publication record, ORCID, and MIT's directory.
  - **Departments** — everyone teaching that prefix this term, the
    department's site, and an MIT search for its full faculty list.
  - **Courses** — 2,273 classes with number, title, instructor and catalogue
    description; add one to your class list from the card.
  - **Clubs** — clubs hosting a synced event, then Engage's directory of all
    514 recognised groups, searched live, with a Follow button. Plus the ~320
    groups and ~240 labs and departments that post to calendar.mit.edu.
  - **Events** — what's synced, then a live search of the Institute calendar
    three months out.

  Filler is ignored ("mit poker club" needs only "poker"), every remaining
  word must match, and a name outside every source gets direct MIT directory,
  MIT search, Scholar and LinkedIn lookups.
- **The feed is strict about "for you."** Three tiers: *For you* (a field,
  person, club, keyword or class you named matched, or a category you ranked
  Priority), *In case you're curious* (category only; at most three,
  labelled), and *filtered out*, one tap away. Events aimed at faculty, staff,
  alumni or graduate students rank lower for an undergraduate, and the score
  breakdown says so. **"Not for me" learns**: it hides the host and the
  recurring series, offers to hide the whole theme with one more tap, and is
  undoable from Settings.
- **Clubs you follow become a source** (`src/connectors/clubs.ts`). Following
  one makes every sync read its Engage feed and its website: the site is cut
  into blocks that mention a date, then read by the local model like any
  email, so a dated notice becomes an event.
- **Careers**: ~4,400 live internships from the community-maintained
  [SimplifyJobs feed](https://github.com/SimplifyJobs/Summer2026-Internships)
  (no account, cached 12h) plus curated research programs with deadlines and
  requirements. Follow companies and they float up; save one and it becomes
  planned work. Requirements come straight from the source. A documents card
  keeps your resume and transcript on-device.
- **Work** tracks what you handed in and what it scored — points-weighted
  averages, late and missing flags, and a hard rule that ungraded work is
  never counted as a zero. **PE attendance** lives here and only here: Canvas
  files a graded "assignment" per session, which is a grade but not homework,
  so it stays out of Due, Plan, the calendar and reminders
  (`src/core/attendance.ts`).
- **An assistant** on your Ollama that answers from a factual snapshot and
  acts through a closed set of typed actions: **mute a theme** ("remove prayer
  nights from my interests" mutes prayer, worship, bible, christian and
  fellowship at once, since one word never covers a theme), **follow a club**,
  **hide an event**, **run a search**, and the planning and interest actions.
  Its snapshot carries the synced events matching your words, so "any poker
  club events?" is answered from data.
- **Shows its work.** Every recommendation expands into its exact score
  breakdown.

## Running it

You need Node.js 20 or newer and Git. Ollama is optional: without it, Canvas,
Outlook calendars and every MIT feed still sync; with it, mailing-list emails
and club websites are read for events too, and the assistant comes alive.

**1. Start the app.**

```bash
npm install
npm start          # then scan the QR with Expo Go
npm run web        # or run it in a browser
```

**2. In a browser, also run the bundled proxy** in a second terminal. Canvas,
Outlook calendar links, Engage and club websites don't send CORS headers, and
this forwards them with the right ones. The phone app talks to them directly.

```bash
npm run proxy      # localhost:8788, found automatically by the web build
```

**3. Start the local model.** The phone reaches your laptop over the network,
so bind to all interfaces:

```bash
ollama pull qwen3.5:9b
ollama pull nomic-embed-text
OLLAMA_HOST=0.0.0.0 ollama serve
```

On a phone, set the Ollama host in Settings to your laptop's LAN address
(`http://192.168.x.x:11434`) and hit **Test connection**. In a browser the
default `localhost` already works.

### Seeing the pipeline without the app

The whole thing runs headless, which is how it was built and tuned:

```bash
npm run pipeline        # full sync + ranking + notification plan, printed
npm run debug:extract   # per-message extraction, with the reason for each drop
npm run calibrate       # measure embedding separation on your model
npm run test:plan       # planner: plan-ahead, rollover, presets, applications
npm run test:campus     # campus feeds, search intent, clubs, assistant actions
npm run test:hydrant    # class schedule decoding against the live catalogue
npm run test:notify     # notification settings save and re-plan (browser)
npm run test:features   # Work tab, class filtering, persistence (browser)
npm run test:assistant  # the assistant against your local model
npm run verify:profs    # every faculty and department link resolves
npm run shots           # drive the web build and screenshot every screen
npm run brand           # render every icon PNG from the SVG mark
```

`npm run pipeline` is the fastest way to see whether a change helped.

## How it works

```
connectors ──► partition ──┬──► structured  ─────────────────┐
(canvas, outlook,          │    (has a real date already)     │
 mit campus, clubs)        │                                  ├──► dedupe ──► score ──► notify
                           └──► unstructured ──► local LLM ───┘
                                (email prose,     extraction
                                 club websites)
```

**Structured items skip inference entirely.** A Canvas assignment already has
`due_at`, so it renders immediately; only prose pays for the model, and the
agenda is on screen before inference starts.

**The model never does date math.** It emits a *structured reference* —
`{kind: weekday, weekday: thursday, which: this, time: "16:00"}` — and
[`src/core/datetime.ts`](src/core/datetime.ts) resolves it against the real
clock. Pure, deterministic, testable.

**Only dated items become entries.** Everything else the model looked at is
set aside and counted by reason (`not_event`, `no_date`, `in_past`,
`low_confidence`, `model_error`), visible in Settings after every sync.

### Ranking

Obligations score 1.0 flat and sort by urgency, which rises faster for heavier
work — an exam a week out outranks a pset due in three days.

Opportunities combine your priority weight for the category (0.30), semantic
match against your fields (0.30), a professor or club you follow (0.20),
keywords (0.12), and relevance to a class you're taking (0.08). Then
adjustments: a muted word or hidden host zeroes it, an event aimed at another
audience loses up to 0.30, and colliding with an exam or landing right before
a deadline costs up to 0.35. A great talk that overlaps your midterm is pushed
down, not surfaced.

## Tuned against real data

Every threshold below was measured against a real model and a real browser.

**Extraction runs with reasoning off.** On `qwen3:4b`, a message takes about
1.3s with `think: false` versus 45–75s with it on, and the dates come out
right. Short structured extraction gains nothing from a scratchpad.

**Every `when` field is required, with an explicit `"none"` sentinel.**
Grammar-constrained decoding guarantees only what the schema marks required;
making the day name mandatory took extraction on the fixture set from 1 in 10
to 9 in 10.

**`nomic-embed-text` runs with task prefixes.** With `search_query:` on
interests and `search_document:` on events, related pairs land at 0.63–0.82
and unrelated at 0.53–0.57; the 0.60 threshold sits in that gap. `npm run
calibrate` re-measures it for any model you switch to.

**Large caches live in IndexedDB on web.** Embeddings (~9MB for 600 vectors),
the live internship list, the class catalogue and the groups directory are
kept there, with no size ceiling to hit; the profile, events and sync
bookkeeping stay in localStorage. Native builds use the device store for all
of it.

**Profile writes go through an eagerly-updated ref**, so tapping across a row
of settings composes every change and each one lands in storage. `npm run
test:notify` asserts against what was stored, not what was rendered.

## How the planner decides

`priority = urgency × stakes × lanePreference`, multiplied so a zero anywhere
genuinely sinks an item.

**Stakes** for coursework is the real thing: Canvas publishes assignment-group
weights ("Problem Sets 25%, Exams 75%"), so an assignment's share of the final
grade is `(points / group total) × group_weight`. When a course doesn't publish
weights the planner falls back to kind and the row says *"weight not published
by the course"*.

**Lane preference** is raised to the 1.5 power, so the gap between presets is
several-fold rather than a compressed linear scale — enough for the setting to
express a real choice without overriding urgency.

**Effort** is a coarse estimate derived from kind and grade weight, and is
labelled as an estimate everywhere it appears.

**Work finishes the day before the deadline.** The due day itself is used
only when the thing is due today, or as overflow when nothing fits earlier.
Each day card lists what is *due* that day, so "work on it today" and "it's
due tomorrow" are both visible. Ticking a session records its planned hours
and subtracts them on the next recompute; an unticked session rolls forward.
Ticked sessions stay on their day, struck through, so a tick can be undone.

**Applications are floored at 0.4 urgency while open**, because rolling
postings fill as they go and starting now is the right call whatever the
closing date. They fill forward from today rather than backward from the
deadline, and one closing beyond the two-week horizon still gets its first
week of work placed, with the closing date on the row. The Grades-first
preset's application weight of 0.3 keeps a 6%-of-grade pset due in three
days above a far-off internship.

Overdue *coursework* stays in the plan, since late submission is usually
possible; past events leave it. Class meetings appear on the **Calendar** and
nowhere else — a lecture is your schedule, not something you owe.

## Swapping the local model

The extraction model is a config value: change it in Settings → Local model →
*Extraction model*, or pass `--model=` to any script:

```bash
npm run debug:extract -- --model=qwen3.5:9b   # per-message output + timings
npm run pipeline -- --model=gemma4:12b        # whole sync end to end
```

Measured on the fixture set (M-series Mac, Sept 2026):

| model | per message | kept | dates |
|---|---|---|---|
| `qwen3.5:9b` (default) | ~4.2s | 5/5 | all correct |
| `qwen3:4b` | ~2.2s | 5/5 | all correct |
| `gemma3:12b-it-qat` | 6.4–11.5s | 5/5 | identical |

Every model that fits scores 5/5, so this is a speed choice: `qwen3:4b` is the
fastest and a good pick on a slower machine. Two setup notes: the client sends
`think: false` so reasoning models stay fast, and `qwen3.5:9b` and
`gemma4:12b` want Ollama 0.34 or newer (`qwen3.5:9b` runs on 0.34.2).

## How career fit works

Four signals decide what surfaces, and the UI labels each one:

- **Year.** The feed carries a `degrees` array on ~88% of postings, so
  PhD-only and MBA-only roles are marked for an undergraduate, and postings
  whose *earliest* term falls after your graduation are excluded. A posting
  offering both Summer 2026 and 2027 stays eligible for a 2026 grad.
- **Classes.** MIT course numbers are systematic (6.x = EECS, 18.x = math,
  8.x = physics), so Canvas enrollment maps deterministically to subjects;
  common letter prefixes (CS, ECE, MATH) are covered for other schools.
- **Resume.** Skills are widened into the domains postings actually name
  (`pytorch` → machine learning), since the feed carries titles and categories.
  Extraction runs on your own Ollama and the resume text never leaves the
  device.
- **School.** Gates school-restricted curated programs (MIT UROP) and adds a
  "near your campus" boost.

Ineligible postings are **dimmed and labelled, never deleted**, and "Eligible
only" is a filter you choose.

## A note on grades

The Work tab reports percentages, never letter grades: MIT cutoffs vary by
class and are routinely curved. Only `workflow_state: graded` counts toward an
average — Canvas returns `score: null` for work nobody has marked yet, and
that is shown as pending, not as a zero. A genuinely missing assignment, which
Canvas reports as score 0 with `missing: true`, is shown as the zero it is.

## Layout

```
src/
  core/         domain model, the two-lane split, date resolution, attendance rule
  connectors/   canvas, outlook, mit (campus feeds), clubs (followed clubs), hydrant
  fixtures/     recorded payloads in the real API shapes
  llm/          ollama client, extraction schema and prompts
  ranking/      embeddings, interest and audience scoring
  plan/         priority, day scheduling, preset suggestions, calendar grid
  search/       query intent, OpenAlex, Engage directory, calendar.mit.edu directories
  careers/      SimplifyJobs feed, curated programs, eligibility, faculty set
  chat/         the assistant's actions and prompt
  notify/       notification planning (pure) and Expo scheduling
  state/        local persistence (IndexedDB on web) + app store
  components/   UI kit, cards, search results, brand
  app/          onboarding, Due / Plan / Calendar / For you / Careers / Work / Settings
assets/brand/   the Scanvas mark as SVG; `npm run brand` renders the PNGs
public/         favicons served by the web build
scripts/        headless pipeline, tests, calibration, screenshots, proxy
```

## Connecting your accounts

Every connector ships two implementations behind one interface — a `*Fixture`
replaying recorded payloads, and a `*Live` written against the real API.
`buildRegistry()` picks per source at runtime based on whether credentials
exist: connect Canvas and Canvas goes live while everything else keeps
replaying samples, with no rebuild.

**Canvas** — Settings → Accounts. Paste your Canvas address and a personal
access token (Canvas → Account → Settings → New Access Token). The app
verifies it and shows your own name and course list before trusting it, then
adopts your real enrollment as the tracked course list. The token is stored in
the device keychain via `expo-secure-store`. In a browser, Canvas goes through
the bundled proxy (`npm run proxy`), which binds to 127.0.0.1 only, forwards
to Canvas, Outlook published-calendar hosts and `*.mit.edu`, and never logs
the Authorization header. The connect screen tells you if it isn't running.

**Outlook** — two routes, because school tenants differ:

*Route A: published calendar link.* Outlook web → gear → Calendar → Shared
calendars → Publish a calendar ("Can view all details") → copy the **ICS**
link and paste it in Settings → Accounts. Long-lived, no token, no approval,
and it works where consent is admin-controlled, as at MIT. Classes and
meetings sync from it. The app parses the feed itself (`src/core/ics.ts`),
expanding WEEKLY/DAILY recurrences and honouring EXDATE cancellations. Treat
the URL as a secret — anyone holding it can read the calendar.

*Route B: Microsoft Graph access token*, which adds mailing lists. Get one from
[Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer):
sign in with your school account, run `GET /me/messages?$top=1` and
`GET /me/events?$top=1`, use the **Modify permissions** tab to consent to
`Mail.Read` / `Calendars.Read`, re-run until both return JSON, then copy the
token from the **Access token** tab. Graph sends CORS headers, so this works in
the browser with no proxy. Graph Explorer tokens last about an hour; a
permanent connection is an Azure AD app registration with those two delegated
scopes, and only where the token comes from changes.

**MIT campus listings** need no account and are live from the first sync
(`src/connectors/mit.ts`). Three feeds, each loading independently:

- **MIT Events Calendar** — calendar.mit.edu's public JSON API
  (`/api/2/events`) sends CORS headers, so it works in the browser directly.
  About 400 events a month across every department, each with a plain-text
  description, typed categories (Conferences/Seminars/Lectures, Career
  Development, Thesis defense, Meetings/Gatherings, …), an audience tag and a
  theme tag, so classification is deterministic and the interest matcher has
  real text.
- **MIT Engage iCal** — the club platform's campus feed at
  `engage.mit.edu/ical/mit/ical_mit.ics`, about 160 club events with the
  hosting club named on each.
- **MIT Engage RSS** — the same platform's richer cut: club name and type,
  topics, a full description, and whether food is provided. Dedupe merges what
  each feed knew about the same event.

Each feed reports its status in Settings → What synced, and the source can be
muted there like any other.

**Clubs you follow** add their own feeds (`src/connectors/clubs.ts`). Each
club is looked up once in Engage's directory for its id and website; every
sync then reads its per-club iCal (`/ical/mit/ical_club_<id>.ics`) and scans
its website for dated notices, which go to the local model like an email.

**Search sources.** The calendar's **groups** and **departments** directories
(`/api/2/groups`, `/api/2/departments`) back the clubs and labs results, and
`/api/2/events/search` backs the live event search. The **subject listing**
comes from Hydrant's `latest.json`, which carries the instructor (`inCharge`,
printed as "M. Kaashoek") and description for every class this term; the app
keeps instructors and a 220-character description in its cached catalogue,
and matches instructors on surname plus first initial, with a `listedAs`
override where the printed initial differs from the name people use.
**Engage's club directory** (`engage.mit.edu/club_signup?search=`) lists all
514 recognised groups with category, website, mission and officers.
**OpenAlex** (`api.openalex.org`) is public, CORS-enabled and needs no key; MIT
is institution `I63966007`.

A note for adding a connector: `canvas-transport` detects the browser via
`typeof document` rather than React Native's `Platform`, which keeps every
connector loadable from Node so the headless scripts keep working.

### Data rules

- Any screen showing sample coursework carries a banner saying so, where the
  numbers are.
- A source is reported as "live" only when it is genuinely configured; public
  feeds with no account are live by definition and report their status per
  feed.
- Onboarding never prefills the sample course roster once Canvas is connected,
  and labels it as samples when it isn't.
- Connecting Canvas adopts your real enrollment, and a saved course list that
  matches nothing that synced is treated as stale, so filtering steps aside
  rather than hiding a semester.
- Contact details are never fabricated: pages are verified to resolve, emails
  appear only where published by their owner, and search links are labelled as
  searches.
