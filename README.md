<p align="center"><img src="assets/images/scanvas-mark.png" width="96" alt="Scanvas"></p>

# Scanvas

As an MIT student, don’t you get tired of jumping between countless apps and websites just to figure out what you need to do each week? Have you ever missed a deadline simply because your emails got drowned in dormspam or because you forgot to check Canvas?

Introducing **Scanvas**, a local planner that keeps you on top of your workload while bringing together the opportunities, events, and information you care about. Your classes. Your assignments. Your opportunities. Your week. All in one place.

The best part? Everything runs on your device using a local model. There is no need to create an account or link to an external server.

> **Out of the box this app shows sample coursework, not yours.** Canvas and
> Outlook start as recorded fixtures so the web app is runnable with zero setup,
> and every screen says so in a banner until you connect a real account.
> **Connect Canvas** (Settings → Accounts, ~2 minutes with a personal access
> token) to see your actual psets, exams and grades. MIT campus listings
> (talks, seminars, club events) are live from the start - they come from
> public feeds and need no account.

---

## The idea

The app has several tabs, starting with **Due** — shows your tasks that are due in chronological order, followed by **Plan**
(suggests what to work on right now based on your priorities) and **Calendar** beside it that captures all of the deadlines and upcoming events in a more visual manner.

**Obligations** — psets, exams, project deadlines. These are *never*
interest-filtered. You don't get to be uninterested in your 6.1210 midterm.
They're ordered by urgency, and they always notify.

**Opportunities** — club events, UROP postings, talks, recruiting. MIT posts
hundreds a week. These are filtered hard against what you said you cared
about, and only a handful ever reach you.

One list means a filter that's either too loose to help or too tight to trust.
Two lanes means each half can be tuned for what it's actually for.

## What it does

- Pulls from **Canvas** (assignments, quizzes, calendar, grade weights),
  **Outlook** (calendar + mailing lists), and **MIT's public campus feeds**:
  the Institute events calendar (calendar.mit.edu, every department's talks,
  seminars, thesis defenses, career workshops and UROP mixers, with
  descriptions and categories) plus Engage's club-event iCal.
- Reads the unstructured half — "hull layup *this saturday 10am–4pm*" in a
  Slack channel, a colloquium buried in a `[csail-announce]` email — with a
  local LLM, and turns it into real calendar entries.
- Asks you at setup what you prioritize (UROPs? club events? talks?), which
  fields, which professors and labs.
- Ranks opportunities semantically, so "machine learning" surfaces a talk on
  *foundation models for robot manipulation* even though they share no keyword.
- Schedules local notifications, with **every lead time editable** — exams,
  assignments, and events each get their own set, plus quiet hours, a morning
  digest, and how good an event has to be before it's allowed to interrupt you.
  Settings shows a live count of what the current setup would fire, and changes
  reschedule immediately without re-running a sync.
- A **Plan tab** that plans ahead: work is scheduled to **finish the day
  before it's due**, so a pset due tomorrow at 11:59pm shows up today, and
  each day card lists what's actually **due** that day alongside the work
  planned for it. Tick a session when it's done and its hours come off the
  estimate; leave it unticked and it rolls forward to the next day. Within a
  day, items are ordered by `urgency x stakes x your priorities`.
  **Saved applications are planned too**: save an internship or a research
  program and its work starts today ("Work on application: Citadel — Quant
  Intern") and ends with "Submit" on the closing day, which also lands on
  the calendar and in Due; a rolling posting with no deadline gets a
  self-set target ten days out, labelled as yours. Unsave it and all of that
  disappears. Applications are floored at 0.4 urgency while open (rolling
  postings fill as they go), and one closing months out still gets its work
  placed this week with the closing date on the row - before that, "Internships
  first" changed nothing because a posting ten days out scored 0.05 urgency. **The presets add things, not just reorder them**
  (`src/plan/suggest.ts`): *Get me out of my room* suggests up to three
  matching club, social and talk events per day; *Internships first* adds
  application prompts across the week from postings you follow or that fit,
  each one tap from becoming planned work; *Balanced* offers one strong
  event match a day; *Grades first* adds nothing. Suggestions never count
  against the day's hour budget.
  Stakes for coursework is the **real share of your final grade**, computed
  from Canvas assignment-group weights — so a 100-point lab in a 60%-weighted
  group is 12% of your grade, not "100 points", and a small quiz can
  correctly outrank a big pset. Pick a preset (**Grades first / Balanced /
  Internships first / Get me out of my room**) and the order genuinely
  changes; an exam inside 24 hours pins to the top regardless, because that
  isn't a tradeoff anyone is really making. It also estimates effort and
  warns when a day physically doesn't fit.
- A **Calendar tab** with month and week zoom and arrow navigation across
  periods. It carries all coursework due dates, **your class schedule**
  (lectures, recitations, office hours — toggleable, since a heavy load can
  crowd out deadlines), anything you added yourself, and **only the campus
  events and internships you saved** — an unfiltered calendar of 4,400
  internships is wallpaper. Colour-coded dots per day, tap a day for detail.
- **Add your own repeating events** — club meetings, practices, standing
  commitments. Stored as a repeating rule (weekly / biweekly / daily, any set
  of weekdays, optional end date) rather than a pile of rows, so editing the
  series edits every occurrence. Reminders are **off by default**: a standing
  weekly meeting shouldn't push a notification alongside your real deadlines.
- A **For you tab** with a search bar and two halves. **Events**: talks,
  research events, club events, social events, career workshops and
  deadlines from MIT's public calendars, ranked against your interests, one
  filter chip per kind with live counts, plus the curated research programs
  (UROP funding, MSRP, REU) under Research. **Professors**: 74 MIT faculty
  matched to your interests, classes and follows, viewable as a ranked list
  or **grouped by lab** — department, lab, what they work on, **what they're
  teaching this term** (live from MIT's subject listing via Hydrant, matched
  on surname plus initial), what they've taught, and contact links.
  Contact details are never fabricated: every homepage and department page
  is verified to resolve (`npm run verify:profs`), an email appears **only**
  when the professor publishes it in plain text on their own page (22 of 74
  do), and LinkedIn/Scholar are explicit *searches* rather than guessed
  profile URLs.
- **Search** across MIT from that same box. The query is read for intent
  first (`src/search/intent.ts`) - a **name** ("max tegmark", "tegmark",
  "m. tegmark"), a **department** ("professors in the philosophy
  department", "eecs faculty"), a **research topic** ("professors doing
  research in automatic speech recognition") or anything else - and each
  kind fans out to the sources that can answer it:
  - **People**: the checked faculty set; every instructor in this term's
    subject listing (Hydrant); and **OpenAlex**, the public index of
    scholarly publications, filtered to authors whose latest papers are
    from MIT. By name it returns the person with their research topics; by
    topic it maps the phrase onto OpenAlex's taxonomy ("Speech Recognition
    and Synthesis") and lists the most-published MIT authors under it. Cards
    say plainly that OpenAlex includes students and postdocs and carries no
    email, and link to the OpenAlex/ORCID record plus MIT's own lookups.
  - **Departments**: everyone teaching a class with that department's
    course prefix this term, the department's website (from the calendar's
    directory), and an MIT search for its faculty list.
  - **Courses**: 2,300 classes with number, title, instructor and catalogue
    description, from hydrant.mit.edu; add one to your class list from the
    card.
  - **Clubs**: groups hosting a synced event (Engage names the club on every
    event), then **Engage's own directory of all ~514 recognised groups**,
    searched live - name, ASA category, website, mission, officers - with a
    Follow button that ranks their events first. Plus the ~200 groups and
    ~100 labs that post to calendar.mit.edu.
  - **Events**: what's synced, then a live full-text search of the Institute
    calendar three months out.
  Filler is ignored ("mit poker club" needs only "poker" to match), every
  remaining word has to match ("max tegmark" is one person, not everything
  containing "maximum"), and a name nobody matches gets a card saying so
  with MIT directory, MIT site search, Scholar and LinkedIn lookups rather
  than a guessed page. Sources that can't be reached are named rather than
  silently omitted (`src/search/`).
- **The feed is strict about "for you."** Events are shown in three tiers:
  *For you* (something you said matched - a field, a person or club you
  follow, a keyword, a class - or a category you ranked Priority), *In case
  you're curious* (only a category you'd rank "Sometimes" matched; at most
  three, labelled), and *filtered out* (one tap away). Events the MIT
  calendar tags for faculty, staff or alumni only, or whose text says they're
  for graduate students when you're an undergraduate, are penalised
  ("Aimed at …" appears in the score breakdown). **"Not for me" learns**:
  it hides the host and the recurring series, offers to hide the whole theme
  (the calendar's tag, e.g. Religious/Spiritual) with one more tap, and can
  be undone; everything hidden this way is listed in Settings → Interests
  with a chip to bring it back.
- **Clubs you follow become a source.** Follow a club from a search result
  and every sync reads that club's own Engage feed and its website
  (`src/connectors/clubs.ts`): the site is stripped to text, cut into blocks
  that mention a date or time, and handed to the local model exactly like a
  mailing-list email, so a dated notice becomes an event and everything else
  is dropped as not-an-event. The campus-wide Engage feed also gets its RSS
  merged in, which carries the club name, topics, a real description and
  whether food is provided. What this cannot read, said plainly: Instagram
  (login wall, no public API), dormspam you haven't connected (connect
  Outlook), or a club site that draws its events from a private database at
  load time - the MIT Poker Club's does, and its Engage feed stopped in
  2021, so its tournaments are only announced where we can't see them.
- A **Careers tab**: ~4,400 live internships from the community-maintained
  [SimplifyJobs feed](https://github.com/SimplifyJobs/Summer2026-Internships)
  (real data, no account, CORS-friendly, cached with a 12h TTL) plus a curated
  set of research programs (UROP funding, MSRP, REU, Lincoln Lab) with
  deadlines and requirement bullets. Follow companies or labs and they float
  to the top; save a posting with a deadline and it lands on your Due list and
  in the notification plan as an obligation. Requirements are only ever shown
  when the source carries them — nothing is generated. A documents card at the
  top stores your resume and transcript on-device (copied into app storage on
  phone; size-capped browser storage on web) for when an application asks.
- Tracks **what you've handed in and what it scored** on a Work tab —
  per-class points-weighted averages, late and missing flags, and a hard rule
  that work awaiting a grade is never counted as a zero. **PE attendance**
  points live here and only here: Canvas shows a graded "assignment" per PE
  session, which is a grade but not homework, so it never appears in Due,
  Plan, the calendar, or reminders (`src/core/attendance.ts`).
- An **assistant** (floating button, runs on your Ollama) that answers from
  a factual snapshot and changes settings through a closed set of typed
  actions. Beyond the planning and interest actions, it can **mute a theme**
  ("remove prayer nights from my interests" mutes prayer, worship, bible,
  christian, fellowship at once, since one word never covers a theme),
  **follow a club** so its events rank first, **hide an event**, and **run a
  search** on the For you tab. Its snapshot includes the synced events that
  match the words in your message, so "any poker club events?" is answered
  from data - and if nothing matched it says so and searches instead of
  guessing.
- Shows its work. Every recommendation expands into the exact score breakdown.

## Running it

**1. Start the local model.** The phone has to reach your laptop, so bind to
all interfaces rather than localhost:

```bash
ollama pull qwen3.5:9b
ollama pull nomic-embed-text
OLLAMA_HOST=0.0.0.0 ollama serve
```

**2. Start the app.**

```bash
npm install
npm start          # then scan the QR with Expo Go
npm run web        # or run it in a browser
```

**3. Point the app at your laptop.** In Settings, set the Ollama host to your
LAN address (`http://192.168.x.x:11434`) — `localhost` means the phone itself.
Hit **Test connection**.

### Seeing the pipeline without the app

The whole thing runs headless, which is how it was built and tuned:

```bash
npm run pipeline        # full sync + ranking + notification plan, printed
npm run debug:extract   # per-message extraction, with the reason for each drop
npm run calibrate       # measure embedding separation on your model
npm run shots           # drive the web build and screenshot every screen
npm run test:notify     # assert notification settings actually save and re-plan
npm run test:features   # assert the Work tab, class filtering, and persistence
npm run proxy           # CORS helper so the WEB build can reach Canvas
```

`npm run pipeline` is the fastest way to see whether a change helped.

## How it works

```
connectors ──► partition ──┬──► structured  ─────────────────┐
(canvas, outlook,          │    (has a real date already)     │
 mit campus)               │                                  ├──► dedupe ──► score ──► notify
                           └──► unstructured ──► local LLM ───┘
                                (prose, Slack)    extraction
```

**Structured items skip inference entirely.** A Canvas assignment already has
`due_at`; asking a model about it would be slower and worse. Only prose pays
for the model, and the agenda renders from the structured half before
inference even starts.

**The model never does date math.** Ask an LLM to turn "this Thursday at 4pm"
into a timestamp and it will confidently hand you a Thursday in the wrong
week. Instead it emits a *structured reference* — `{kind: weekday, weekday:
thursday, which: this, time: "16:00"}` — and [`src/core/datetime.ts`](src/core/datetime.ts)
resolves it against the real clock. Pure, deterministic, testable.

**No date means the item is dropped.** A calendar that invents a plausible
wrong time is worse than one that misses an event, because you stop trusting
it. Drops are counted by reason and shown in Settings.

### Ranking

Obligations score 1.0 flat and sort by urgency, where urgency rises faster for
heavier work — an exam a week out outranks a pset due in three days.

Opportunities combine: your priority weight for that category (0.30), semantic
match against your fields (0.30), a professor or lab you follow (0.20),
keywords (0.12), and relevance to a class you're taking (0.08). Then penalties:
a muted keyword zeroes it, and colliding with an exam or landing right before
a deadline knocks it down.

Conflict-awareness is the part that makes it feel like it's on your side — a
great talk that overlaps your midterm gets pushed down, not surfaced.

## Things that were measured, not guessed

Five bugs only showed up by running the thing — against a real model, and in a
real browser. They're worth knowing about if you extend this:

**Reasoning mode made it 35× slower and less accurate.** `qwen3:4b` with
thinking on took 45–75s per message and reasoned itself into inventing
absolute dates. With `think: false`: 1.3s, and correct. Short structured
extraction gains nothing from a scratchpad.

**Optional schema fields get skipped.** With `weekday` merely *optional* in the
JSON schema, the model emitted `{"kind":"weekday","which":"this"}` — no day
name — and **9 of 10 events were silently dropped**. Grammar-constrained
decoding only guarantees what you mark `required`, so every `when` field is
required with an explicit `"none"` sentinel. That single change took extraction
from 1/10 to 9/10.

**`nomic-embed-text` needs task prefixes.** Without `search_query:` /
`search_document:`, related and unrelated events both landed at 0.52–0.57 —
the interest signal was pure noise. With them, related events sit at 0.63–0.82
and unrelated at 0.53–0.57. The 0.60 threshold sits in that measured gap. Run
`npm run calibrate` if you change models; the gap moves.

**Silent drops hid all of the above.** The extractor originally returned bare
`null`. It now returns a reason (`not_event`, `no_date`, `in_past`,
`low_confidence`, `model_error`), which is surfaced in Settings. `not_event` in
bulk means it's working; `no_date` in bulk means the prompt regressed.

**localStorage is 5MB and the embedding cache is 9.** On web, AsyncStorage
is localStorage, capped at ~5MB per site. Six hundred 768-float vectors
serialize to ~9MB and the live internship list to ~1.9MB, so those writes
failed with "exceeded the quota" - which surfaced as a console error, a
13MB postings refetch on every reload, and an embedding cache that never
survived a refresh. The four large, regenerable caches (embeddings, careers,
class catalogue, groups directory) now live in IndexedDB in the browser
(`src/state/storage.ts`); the profile, events and sync bookkeeping stay in
localStorage, where the browser tests read them. Native builds are unchanged.

**`setState` updaters don't run when you think.** Saving a profile edit with

```ts
let next; setProfile(prev => { next = {...prev, ...patch}; return next });
await store.saveProfile(next);   // `next` is often still the initializer
```

meant Settings changes rendered correctly and then vanished on reload — and
occasionally persisted `DEFAULT_PROFILE` over a real one, resetting
`completedOnboarding` and bouncing the user back into onboarding. The profile
is now mirrored into a ref that's updated eagerly, so rapid successive patches
compose. Caught by `npm run test:notify`, which asserts against what actually
landed in storage rather than what the screen showed.

## How the planner decides

`priority = urgency x stakes x lanePreference`, multiplied so a zero anywhere
genuinely sinks an item.

**Stakes** for coursework is the real thing: Canvas publishes assignment-group
weights ("Problem Sets 25%, Exams 75%"), so an assignment's share of the final
grade is `(points / group total) * group_weight`. That number is what decides
what to work on — raw points are misleading across groups. When a course
doesn't publish weights the planner falls back to kind and the row says
*"weight not published by the course"* rather than inventing a figure.

**Lane preference** needed real leverage to matter. A linear multiplier was
too compressed: "Grades first" still lost a 6%-of-grade pset to an internship
deadline, because the application's intrinsic stakes (one-shot, 0.85)
outweighed a 1.6x preference gap. Weights are now raised to a power, widening
the spread to ~3.7x between extreme presets — enough for the setting to
express a real choice without letting it override urgency.

**Effort** is a coarse estimate derived from kind and grade weight — Canvas
has no effort field — and is labeled as an estimate everywhere it appears.

**Work is planned to finish the day before the deadline.** Canvas due times
are almost all 11:59pm, and the earlier rule ("anything due after 6pm can be
worked on its due day") meant a pset due tomorrow night never appeared today.
Now the due day is used only when the thing is due today, or as overflow when
nothing fits earlier. Each day card also lists what is *due* that day, so
"work on it today" and "it's due tomorrow" are both visible. Ticking a session
records its planned hours and subtracts them from the estimate on the next
recompute; an unticked session is simply not subtracted, so it rolls forward.
Ticked sessions stay on their day, struck through, so a tick can be undone.

Overdue *coursework* stays in the plan (late submission is usually possible).
Overdue *events* drop out: you cannot retroactively attend a club meeting, and
one sitting at the top of "Today" pushes real work off screen.

Class meetings are the one thing that appears on the **Calendar** but never in
**Due** or **Plan** — a lecture is your schedule, not something you owe.

## Swapping the local model

The extraction model is a config value, not a constant — change it in
Settings → Local model → *Extraction model*, or pass `--model=` to any script:

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

Every model that fits gets the fixture set right, so this is a speed choice,
not an accuracy one — `qwen3:4b` is the fastest thing that still scores 5/5
and remains a good pick on a slower machine. Benchmark before committing: the
app's failure mode with a weaker model is *missing* events (it drops anything
it can't date confidently), not wrong ones.

Two things to know:

- **Reasoning models must have `think` off.** On qwen3:4b, leaving it on took
  a single extraction from 1.3s to 45-75s *and* made it worse. The client
  sends `think: false` by default; if you point it at a reasoning model via
  some other server, replicate that.
- **Newer models need a newer Ollama.** `gemma4:12b` and `qwen3.5:9b` both
  refused to pull on Ollama 0.12.6 with *"requires a newer version of
  Ollama"*. Resolved by upgrading: `qwen3.5:9b` pulls and runs on 0.34.2,
  which is why it's now the default. If you're on an older Ollama, upgrade it
  or set the model back to `qwen3:4b` in Settings.
- **MLX builds don't run in Ollama.** `mlx-community/...-4bit` models are
  safetensors; Ollama loads GGUF. MLX needs `mlx-lm` or LM Studio, and
  LM Studio speaks the OpenAI-compatible API rather than `/api/chat`, so
  `src/llm/ollama.ts` would need a second adapter.

## What the career filters can and can't do

The four fit signals are not equally strong, and the UI says which is which
rather than implying uniform precision:

- **Year** — strong. The feed carries a real `degrees` array on ~88% of
  postings, so PhD-only (260 of them) and MBA-only roles are marked
  ineligible for an undergrad, and postings whose *earliest* term falls after
  your graduation are excluded. A posting offering both Summer 2026 and 2027
  stays eligible for a 2026 grad.
- **Classes** — decent. MIT course numbers are systematic (6.x = EECS,
  18.x = math, 8.x = physics), so Canvas enrollment maps deterministically to
  subjects; common letter prefixes (CS, ECE, MATH) are covered for other
  schools.
- **Resume** — decent, but only after expansion. Raw skills match almost
  nothing: measured against the live feed, `pytorch` appears in **0** of
  4,394 titles, because the feed carries titles and categories and no
  descriptions. Skills are therefore widened into the domains that do appear
  (`pytorch` → machine learning). Extraction runs on your own Ollama and the
  resume text never leaves the device.
- **School** — weak, and labeled as such in-app. The feed has **no**
  per-school eligibility field, because nearly every internship accepts any
  school. It only gates genuinely school-restricted curated programs (MIT
  UROP) and adds a small "near your campus" boost.

Ineligible postings are **dimmed and labeled, never deleted** — the
eligibility data is imperfect, and silently hiding a job someone could have
gotten is the worse error. "Eligible only" is a filter you choose.

## A note on grades

The Work tab reports percentages and never letter grades. MIT cutoffs vary by
class and are routinely curved, so turning 88% into "B+" would be a confident
guess about something the app cannot know.

The distinction that matters most is between *submitted* and *graded*. Canvas
returns `score: null` for work nobody has marked yet, and averaging that in as
a zero would tell a student they're failing a class they aren't. Only
`workflow_state: graded` counts. A genuinely missing assignment — which Canvas
reports as score 0 with `missing: true` — is a real zero and is shown as one.

## Layout

```
src/
  core/         domain model, the two-lane split, date resolution
  connectors/   canvas, outlook, mit (campus feeds), hydrant — fixture + live impls
  fixtures/     recorded payloads in the real API shapes
  llm/          ollama client, extraction schema and prompts
  ranking/      embeddings, interest scoring
  notify/       notification planning (pure) and Expo scheduling
  state/        local persistence + app store
  app/          onboarding wizard, Due / Plan / Calendar / For you / Careers / Work / Settings
scripts/        headless pipeline, extraction debugger, calibration, screenshots
```

## Real data vs sample data

Every connector ships two implementations behind one interface — a `*Fixture`
replaying recorded payloads, and a `*Live` written against the real API.
`buildRegistry()` picks per source, at runtime, based on whether credentials
exist. There's no code change and no rebuild: connect Canvas and Canvas goes
live while everything else keeps replaying samples.

**Canvas** — Settings → Accounts. Paste your Canvas address and a personal
access token (Canvas → Account → Settings → New Access Token). The app
verifies it and shows you your own name and course list before trusting it,
then adopts your real enrollment as the tracked course list. The token is
stored in the device keychain via `expo-secure-store`.

On the **phone** this just works. In a **browser** it cannot: Canvas sends no
CORS headers, so the browser refuses to read the response no matter how valid
the token is. For web demos, run the bundled helper in a second terminal:

```bash
npm run proxy      # localhost:8788, forwards to Canvas with CORS headers
```

The web build finds it automatically and the connect screen tells you if it
isn't running. The proxy binds to 127.0.0.1 only, forwards solely to
Canvas-shaped hostnames, and never logs the Authorization header.

**Outlook** — two routes, because school tenants differ:

*Route A: published calendar link (works when consent is admin-blocked, as at
MIT).* Outlook web → gear → Calendar → Shared calendars → Publish a calendar
("Can view all details") → copy the **ICS** link and paste it in Settings →
Accounts. Long-lived, no token, no approval. Calendar only — classes and
meetings sync, mailing-list events can't come through a calendar link. The
app parses the feed itself (`src/core/ics.ts`), expanding WEEKLY/DAILY
recurrences (class schedules) and honoring EXDATE cancellations; exotic RRULEs
fall back to the first instance rather than being expanded wrong. Treat the
URL as a secret — anyone holding it can read the calendar.

*Route B:* paste a Microsoft Graph access token.
Get one from [Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer):
sign in with your school account, run `GET /me/messages?$top=1` and
`GET /me/events?$top=1` from the request bar — each fails once, then the
**Modify permissions** tab lets you Consent to `Mail.Read` / `Calendars.Read`;
re-run until both return JSON. Only then copy the token from the **Access
token** tab (earlier copies lack the just-consented scopes). If Consent says
"Need admin approval", your tenant blocks Route B entirely — use Route A.
Graph sends CORS headers, so this works in the browser with no proxy. The
catch: Graph Explorer tokens **expire after ~1 hour** — great for demos, not
a daily driver. A permanent connection needs an Azure AD app registration
with those two delegated scopes and a proper OAuth flow; the connector code
doesn't change, only where the token comes from.

**Slack** — Settings → Accounts → paste a user OAuth token (`xoxp-…`).
Create a throwaway app at api.slack.com/apps (From scratch → pick your
workspace), add **User Token Scopes** `channels:read` + `channels:history`,
Install to Workspace, copy the User OAuth Token. Long-lived, ~3 minutes, one
workspace per token. The app then reads every public channel you're a member
of — channel discovery is automatic. Note Slack's CORS preflight rejects the
`Authorization` header, so all Slack calls pass the token as form data; that's
load-bearing, not a style choice.

**MIT campus listings** need no account and are live from the first sync.
There used to be an "MIT ELx" entry under Accounts with a live/sample toggle;
it was removed because there is no ELx account to connect — the Experiential
Learning Exchange (elx.mit.edu, where UROP postings now live) sits behind
Touchstone login and exposes no feed. What MIT publishes openly is read
instead (`src/connectors/mit.ts`), from two feeds that fail independently:

- **MIT Events Calendar** — calendar.mit.edu is a Localist site with a public
  JSON API (`/api/2/events`) that **sends CORS headers**, so it works in the
  browser with no proxy. ~400 events a month across every department, each
  with a plain-text description and typed categories (Conferences/Seminars/
  Lectures, Career Development, Thesis defense, Meetings/Gatherings, …), so
  classification is deterministic and the interest matcher has real text.
- **MIT Engage** — the club-events platform's official iCal at
  `https://engage.mit.edu/ical/mit/ical_mit.ics`. Titles, times, rooms; **no
  descriptions or categories**, so ranking works from the title alone.
  Browsers need `npm run proxy` for it; the phone fetches it directly.

If one feed fails the other still loads and the failure is reported as a
warning in Settings → What synced and on the For you tab; if both fail the
source errors rather than returning an empty list that looks like a quiet
campus. Mute the source under "What synced" like any other.

The same calendar's **groups** and **departments** directories
(`/api/2/groups`, `/api/2/departments`) back the search bar's clubs and labs
results, and its `/api/2/events/search` backs the live event search. The
**subject listing** comes from Hydrant's `latest.json`, which carries the
instructor (`inCharge`, printed as "M. Kaashoek") and description for every
class this term; the app keeps instructors and a 220-character description
in its cached catalogue. Instructor matching is surname plus first initial —
a surname alone is never enough (three Williamses teach this term) — with an
explicit `listedAs` override where the printed initial differs from the name
people use. **Engage's club directory** (`engage.mit.edu/club_signup?search=`) is the one
place the app reads HTML: it lists every recognised student group and has no
JSON API. The parser (`src/search/engage.ts`) is confined to search results,
labelled as such, and returns nothing if the markup changes - the card then
falls back to a link to that same page. **OpenAlex** (`api.openalex.org`) is
public, CORS-enabled and needs no key; MIT is institution `I63966007`. What is
still **not** searchable: the MIT people directory, whose old public lookup
now redirects to a login-gated search.

**Slack** was removed at the user's request. The connector, fixtures, and
credential slot are gone rather than left dormant.

One trap worth knowing if you add a connector: `canvas-transport` detects the
browser via `typeof document`, **not** React Native's `Platform`. Importing
`react-native` there made the module unloadable from Node, which silently
broke every headless script the moment a connector started importing it.

### Honesty rules

Two of these were added after sample data got mistaken for real data:

- Any screen showing sample coursework carries a banner saying so. A quiet
  note in Settings is not enough when the numbers look plausible.
- A source is only reported as "live" when it's genuinely configured. ELx
  originally reported `isConfigured: () => true` because public listings need
  no auth — so the UI claimed live data while the scrape silently returned
  nothing.
- Onboarding never prefills the sample course roster once Canvas is connected,
  and labels it as samples when it isn't.
- Connecting Canvas adopts your real enrollment, and if a saved course list
  matches nothing that synced it is treated as stale and filtering is skipped.
  Otherwise a leftover sample roster silently hid an entire real semester.

## Known limits

- The extraction model is ~4B and occasionally misreads an ambiguous time
  (one fixture's "7pm" came back as 9pm). A larger model fixes it at the cost
  of sync speed; the model is configurable in Settings.
- Recurring events aren't expanded — each announcement becomes one entry.
- Notifications are capped at 60 pending (iOS drops the rest), obligations
  first. The count that got cut is reported rather than hidden.
- Simulators never deliver local notifications. Test on a real device.
- **The web build never fires a notification.** Planning is pure
  (`src/notify/rules.ts`) and runs everywhere, which is why Settings can show
  "would fire N reminders" in a browser; but scheduling goes through
  `expo-notifications`, whose web module has no scheduler, so every
  `scheduleNotificationAsync` call throws and is swallowed per-notification.
  Settings says so on web. Real reminders need the phone app (Expo Go on a
  device). A browser fallback would mean the Web Notifications API plus timers
  while the tab is open, or a service worker for background delivery.
