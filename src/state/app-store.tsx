/**
 * App state: the profile, the events, and the sync lifecycle.
 *
 * One context rather than a state library - the state here is genuinely small
 * (a profile, a list of events, a sync status) and the interesting complexity
 * is all in the pipeline, not in the store.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  LIVE_CONNECTORS,
  buildRegistry,
  defaultWindow,
  sourceModes,
  sync,
  type SyncProgress,
  type SyncResult,
} from '../connectors';
import type { ConnectorCredentials } from '../connectors/types';
import * as creds from './credentials';
import { clearAllFiles } from './files';
import { enrolledCourseCodes } from '../connectors/canvas';
import type { InterestProfile } from '../core/profile';
import { DEFAULT_PROFILE } from '../core/profile';
import type { ScoredEvent, SourceId, UnifiedEvent } from '../core/types';
import { health, type OllamaConfig } from '../llm/ollama';
import { writeRationale } from '../llm/extract';
import { EmbeddingCache, embeddingText } from '../ranking/embed';
import {
  feedFor,
  partitionByCourse,
  scoreAll,
  sortChronological,
} from '../ranking/score';
import { cancelAll, hasPermission, requestPermissions, syncSchedule } from '../notify/schedule';
import { SIMPLIFY_TTL_MS, fetchSimplify } from '../careers/simplify';
import { curatedPostings } from '../careers/curated';
import { rankPostings, type RankedPosting } from '../careers/rank';
import { buildPlan, PLAN_PRESETS, type PlanItem } from '../plan/priority';
import {
  relaxCapacity,
  scheduleWork,
  sessionId,
  tightenCapacity,
  type ScheduleResult,
} from '../plan/schedule';
import type { ChatAction } from '../chat/actions';
import { calendarEvents } from '../plan/calendar';
import { expandAllCustom, type CustomEvent } from '../plan/custom-events';
import {
  ambiguousKinds,
  fetchHydrantCatalogue,
  sectionOptions,
  type HydrantClass,
  type HydrantTerm,
  type MeetingKind,
} from '../connectors/hydrant';
import { DIRECTORY_TTL_MS, fetchDirectory, type Directory } from '../search/localist';
import type { ClubLookup, ClubRecord } from '../connectors/clubs';
import { suggestFor, type Suggestion } from '../plan/suggest';
import { hoursUntil } from '../core/datetime';
import type { CareerPosting } from '../careers/types';
import { seriesKey } from '../careers/professors';

/** Days from saving a rolling posting to its self-set "submit" target. */
export const APPLICATION_TARGET_DAYS = 10;
import { router } from 'expo-router';
import * as store from './storage';

export interface OllamaStatus {
  checked: boolean;
  reachable: boolean;
  missing: string[];
  error?: string;
}

interface AppState {
  ready: boolean;
  profile: InterestProfile;
  events: UnifiedEvent[];
  /** Everything tracked, scored. Untracked classes are already removed. */
  scored: ScoredEvent[];
  agenda: ScoredEvent[];
  feed: ScoredEvent[];
  /** Course codes seen across Canvas and synced events, tracked or not. */
  availableCourses: string[];
  /** How many items are hidden because their class isn't tracked. */
  hiddenByCourse: number;
  /** Saved course list matches nothing that synced, so filtering is bypassed. */
  courseFilterStale: boolean;

  /** Today-first prioritized task list. */
  plan: PlanItem[];
  /** Day-by-day work allocation across the next two weeks. */
  schedule: ScheduleResult;
  /** What the plan preset offers on each day, keyed by day - events to go to, applications to start. */
  suggestions: Map<string, Suggestion[]>;
  completedSessions: Set<string>;
  /** Tick or untick a work session; `hours` is what it was planned for. */
  toggleSession: (id: string, hours?: number) => Promise<void>;
  /**
   * Apply one assistant action. Returns the action that actually took
   * effect (it can differ - "remove X from my interests" for a phrase that
   * isn't an interest becomes a mute), or null if nothing could be done.
   */
  runAction: (action: ChatAction) => Promise<ChatAction | null>;
  /** A search the assistant asked the For you tab to run; the tab consumes it. */
  pendingSearch: string | null;
  setPendingSearch: (q: string | null) => void;
  /** Coursework, class meetings, saved opportunities, and your own events. */
  calendarItems: ScoredEvent[];
  /** MIT class catalogue, for picking lecture/recitation sections and for search. */
  catalogue: Map<string, HydrantClass>;
  /** The term that catalogue describes, e.g. Fall 2026. */
  catalogueTerm: HydrantTerm | null;
  catalogueLoading: boolean;
  loadCatalogue: (force?: boolean) => Promise<void>;
  /** Groups, departments and labs that post to the Institute calendar. */
  directory: Directory;
  directoryLoading: boolean;
  loadDirectory: (force?: boolean) => Promise<void>;
  /** Courses that need a section pick before their meetings can show. */
  needsSectionPick: { course: string; kinds: MeetingKind[] }[];
  sectionOptionsFor: (course: string) =>
    { kind: MeetingKind; index: number; label: string }[];
  setSection: (course: string, kind: MeetingKind, index: number) => Promise<void>;

  /** Recurring events you added yourself. */
  customEvents: CustomEvent[];
  saveCustomEvent: (ev: CustomEvent) => Promise<void>;
  deleteCustomEvent: (id: string) => Promise<void>;
  showClasses: boolean;
  setShowClasses: (v: boolean) => void;
  /** Also show well-matched events you haven't starred. */
  showUnsaved: boolean;
  setShowUnsaved: (v: boolean) => void;

  /** Career postings, ranked against follows + interests. */
  careers: RankedPosting[];
  careersFetchedAt: string | null;
  careersLoading: boolean;
  savedPostings: CareerPosting[];
  refreshCareers: (force?: boolean) => Promise<void>;
  togglePostingSaved: (posting: CareerPosting) => Promise<void>;
  ollamaConfig: OllamaConfig;
  ollamaStatus: OllamaStatus;
  syncing: boolean;
  progress: SyncProgress | null;
  lastSync: string | null;
  lastResult: SyncResult | null;
  /** Message from the last failed sync, or null. */
  syncError: string | null;
  /** Stored connector credentials. */
  credentials: ConnectorCredentials;
  /** Per-source: is this real data, or a recorded sample? */
  modes: Record<SourceId, 'live' | 'demo'>;
  /** True when ANY enabled source is still replaying sample data. */
  usingDemoData: boolean;
  setCredentials: (next: ConnectorCredentials) => Promise<void>;
  notifications: { scheduled: number; granted: boolean };

  updateProfile: (patch: Partial<InterestProfile>) => Promise<void>;
  completeOnboarding: (patch: Partial<InterestProfile>) => Promise<void>;
  setOllamaConfig: (cfg: OllamaConfig) => Promise<void>;
  checkOllama: () => Promise<OllamaStatus>;
  runSync: () => Promise<void>;
  /** Re-plan the OS schedule from current prefs, without re-running a sync. */
  reschedule: (opts?: { prompt?: boolean }) => Promise<void>;
  /** Drop an account's credential AND everything synced from it. */
  forgetAccount: (id: SourceId) => Promise<void>;
  saveEvent: (id: string) => Promise<void>;
  /** Hide an event; by default also its host and recurring series. */
  dismissEvent: (id: string, opts?: { learn?: boolean }) => Promise<void>;
  /** Reverse a learned dismissal. */
  unhide: (what: { host?: string; series?: string; eventId?: string }) => Promise<void>;
  reset: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<InterestProfile>(DEFAULT_PROFILE);
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [ollamaConfig, setCfg] = useState<OllamaConfig>({
    host: 'http://localhost:11434',
    chatModel: 'qwen3.5:9b',
    embedModel: 'nomic-embed-text',
    timeoutMs: 90_000,
  });
  const [ollamaStatus, setStatus] = useState<OllamaStatus>({
    checked: false,
    reachable: false,
    missing: [],
  });
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [notifications, setNotifications] = useState({ scheduled: 0, granted: false });
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [syncError, setSyncError] = useState<string | null>(null);
  const [credentials, setCreds] = useState<ConnectorCredentials>({});
  const [postings, setPostings] = useState<CareerPosting[]>([]);
  const [careersFetchedAt, setCareersFetchedAt] = useState<string | null>(null);
  const [careersLoading, setCareersLoading] = useState(false);
  const [savedPostings, setSavedPostings] = useState<CareerPosting[]>([]);
  const [customEvents, setCustomEvents] = useState<CustomEvent[]>([]);
  const [catalogue, setCatalogue] = useState<Map<string, HydrantClass>>(new Map());
  const [catalogueTerm, setCatalogueTerm] = useState<HydrantTerm | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [directory, setDirectory] = useState<Directory>({ groups: [], departments: [], fetchedAt: null });
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [showClasses, setShowClasses] = useState(true);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [pendingSearch, setPendingSearch] = useState<string | null>(null);
  /** Engage ids and websites of followed clubs, looked up once and kept. */
  const clubLookupRef = useRef<ClubLookup>({});
  /**
   * Mirror of `credentials`, for the same reason as `profileRef`: connecting
   * Canvas calls setCredentials and then immediately runSync, and a runSync
   * closed over the pre-connect state builds a FIXTURE registry - so the very
   * first sync after connecting silently returned sample data again.
   */
  const credentialsRef = useRef<ConnectorCredentials>({});

  // The cache is a ref, not state: mutating it must never trigger a render,
  // and it's rebuilt from storage once on boot.
  const cacheRef = useRef(new EmbeddingCache());
  // Guards against a second sync starting while one is in flight (pull to
  // refresh is very easy to double-fire).
  const syncingRef = useRef(false);
  /**
   * Bumped by "Erase everything". A sync that started before the wipe checks
   * it before every write, so its tail (rationales, reminders) cannot land
   * in storage the user just emptied.
   */
  const generationRef = useRef(0);

  /**
   * Always-current profile, mirrored into a ref.
   *
   * This exists because the obvious version is wrong. Writing
   *
   *   let next; setProfile(prev => { next = {...prev, ...patch}; return next });
   *   await store.saveProfile(next);
   *
   * looks like it reads the latest state, but React does not promise to run
   * the updater synchronously - so `saveProfile` frequently received the
   * initializer value instead. Settings edits appeared to work (state updated,
   * the UI re-rendered) and then vanished on reload, and in the worst case it
   * persisted DEFAULT_PROFILE over a real one, resetting `completedOnboarding`
   * and throwing the user back into onboarding.
   *
   * The ref is updated eagerly inside the setter, so rapid successive patches
   * - tapping across a row of lead-time chips - compose instead of clobbering.
   */
  const profileRef = useRef(profile);
  /** Latest events, for callbacks that must not re-create on every sync. */
  const eventsRef = useRef<UnifiedEvent[]>([]);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // --- boot ---------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const [p, evs, vectors, cfg, last, rats, cr] = await Promise.all([
        store.loadProfile(),
        store.loadEvents(),
        store.loadEmbeddings(),
        store.loadOllama(),
        store.loadLastSync(),
        store.loadRationales(),
        creds.loadCredentials(),
      ]);
      credentialsRef.current = cr;
      setCreds(cr);
      setCustomEvents(await store.loadCustomEvents());
      const hyd = await store.loadHydrant();
      if (Object.keys(hyd.classes).length) {
        setCatalogue(new Map(Object.entries(hyd.classes)));
        setCatalogueTerm(hyd.term ?? null);
      }
      setDirectory(await store.loadDirectory());
      clubLookupRef.current = await store.loadClubLookup();
      const careers = await store.loadCareers();
      setPostings(careers.postings);
      setCareersFetchedAt(careers.fetchedAt);
      setSavedPostings(careers.saved);
      setRationales(rats);
      cacheRef.current = new EmbeddingCache(vectors);
      profileRef.current = p;
      setProfile(p);
      setEvents(evs);
      setCfg(cfg);
      setLastSync(last);
      setReady(true);
    })();
  }, []);

  // --- derived: scoring ---------------------------------------------------
  // --- careers -------------------------------------------------------------

  const careersBusyRef = useRef(false);

  /**
   * Refresh the live postings when the cache is past its TTL. The source is a
   * ~13MB community file; hitting it on every tab open would be rude to both
   * the network and the maintainers, so the fetch is time-gated and the tab
   * renders from cache immediately.
   */
  const refreshCareers = useCallback(
    async (force = false) => {
      if (careersBusyRef.current) return;
      const age = careersFetchedAt
        ? Date.now() - new Date(careersFetchedAt).getTime()
        : Infinity;
      if (!force && age < SIMPLIFY_TTL_MS && postings.length > 0) return;

      careersBusyRef.current = true;
      setCareersLoading(true);
      try {
        const live = await fetchSimplify();
        const fetchedAt = new Date().toISOString();
        setPostings(live);
        setCareersFetchedAt(fetchedAt);
        await store.saveCareers({ postings: live, fetchedAt, saved: savedPostings });
      } catch {
        // Cache (or curated-only) remains; the tab shows the fetch age.
      } finally {
        careersBusyRef.current = false;
        setCareersLoading(false);
      }
    },
    [careersFetchedAt, postings.length, savedPostings],
  );

  const togglePostingSaved = useCallback(
    async (posting: CareerPosting) => {
      setSavedPostings((prev) => {
        const has = prev.some((p) => p.id === posting.id);
        const next = has
          ? prev.filter((p) => p.id !== posting.id)
          : [...prev, { ...posting, savedAt: new Date().toISOString() }];
        store.saveCareers({
          postings,
          fetchedAt: careersFetchedAt,
          saved: next,
        });
        return next;
      });
    },
    [careersFetchedAt, postings],
  );

  const careers = useMemo(
    () => rankPostings([...curatedPostings(), ...postings], profile),
    [postings, profile],
  );

  /**
   * Saved postings with real deadlines become obligation-lane deadline events,
   * merged at scoring time rather than persisted with synced events - a sync
   * overwrites the events store, and a saved application must survive that.
   */
  /**
   * A rolling posting has no deadline, and "no deadline" is how applications
   * never get written. Saving one sets a target of ten days out (11:59pm),
   * labelled as yours rather than the company's, so the plan can put "start
   * the application" on today and "submit" on the target day. Unsaving
   * removes it, because everything here is derived from `savedPostings`.
   */
  const careerEvents = useMemo<UnifiedEvent[]>(() => {
    const now = new Date();
    const nowIso = now.toISOString();
    const target = (savedAt: string | undefined) => {
      const base = savedAt ? new Date(savedAt) : now;
      const d = new Date(base);
      d.setDate(d.getDate() + APPLICATION_TARGET_DAYS);
      d.setHours(23, 59, 0, 0);
      return d;
    };
    return savedPostings
      .map((p) => {
        const selfSet = !p.deadline;
        const due = selfSet ? target(p.savedAt) : new Date(p.deadline!);
        return { p, selfSet, due };
      })
      .filter(({ due }) => due.getTime() > now.getTime() - 14 * 86400_000)
      .map(({ p, selfSet, due }) => ({
        id: `career:${p.id}`,
        source: 'manual' as const,
        sourceId: p.id,
        sourceUrl: p.applyUrl ?? p.url,
        kind: 'application_deadline' as const,
        // Obligation on purpose: you chose this deadline; it should hit Due
        // and the notification plan without clearing an interest floor.
        lane: 'obligation' as const,
        title: `${p.company} — ${p.title}`,
        description:
          [
            selfSet ? 'Rolling application - this date is your own target, not a deadline.' : undefined,
            ...p.requirements,
          ]
            .filter(Boolean)
            .join('\n') || undefined,
        start: due.toISOString(),
        allDay: false,
        location: undefined,
        organizer: p.company,
        people: [],
        topics: p.topics,
        tags: selfSet ? ['application', 'self-set target'] : ['application'],
        course: undefined,
        confidence: 1,
        firstSeenAt: nowIso,
        updatedAt: nowIso,
      }));
  }, [savedPostings]);


  // Untracking a class silences it everywhere downstream - agenda, feed, and
  // notifications all read `scored`, so the filter belongs here rather than
  // in each screen.
  /**
   * Course filtering, with a staleness guard.
   *
   * Connecting a real Canvas account while an old course list is saved used
   * to hide the entire semester: the stored codes came from sample data and
   * matched nothing real, so every assignment was "untracked". An empty Due
   * tab is the worst possible failure for this app, so when the tracked list
   * overlaps none of the synced courses we treat it as stale, filter nothing,
   * and ask the user to re-pick.
   */
  const { tracked, untracked, courseFilterStale } = useMemo(() => {
    const seen = new Set(
      events.map((e) => e.course?.code).filter(Boolean) as string[],
    );
    const stale =
      profile.courses.length > 0 &&
      seen.size > 0 &&
      !profile.courses.some((c) => seen.has(c));

    if (stale) {
      return { tracked: events, untracked: [], courseFilterStale: true };
    }
    return { ...partitionByCourse(events, profile), courseFilterStale: false };
  }, [events, profile]);

  const scored = useMemo(
    () =>
      scoreAll([...tracked, ...careerEvents], {
        profile,
        cache: cacheRef.current,
        obligations: [],
      }).map((ev) =>
        // scoreAll builds fresh objects, so rationales have to be re-attached
        // here rather than mutated onto the result of a sync.
        rationales[ev.id] ? { ...ev, rationale: rationales[ev.id] } : ev,
      ),
    // cacheRef is intentionally excluded - warm() mutates it in place and the
    // sync that does so also calls setEvents, which re-runs this.
    [tracked, careerEvents, profile, rationales],
  );

  /**
   * Course codes worth offering in the picker: whatever Canvas listed, plus
   * anything that turned up on a synced event. Derived from events rather
   * than a fixture so it reflects what actually synced.
   */
  const availableCourses = useMemo(() => {
    const codes = new Set<string>();
    // Only seed from the sample roster while Canvas is in demo mode. Offering
    // a real user a list of invented course numbers is exactly the confusion
    // this app is supposed to prevent.
    if (!LIVE_CONNECTORS.canvas?.isConfigured(credentials)) {
      for (const code of enrolledCourseCodes()) codes.add(code);
    }
    for (const ev of events) if (ev.course) codes.add(ev.course.code);
    for (const code of profile.courses) codes.add(code);
    return [...codes].sort();
  }, [credentials, events, profile.courses]);

  const modes = useMemo(() => sourceModes(credentials), [credentials]);
  const usingDemoData = useMemo(
    () => profile.enabledSources.some((id) => modes[id] === 'demo'),
    [modes, profile.enabledSources],
  );

  const plan = useMemo(
    () => buildPlan(scored, profile.planWeights),
    [scored, profile.planWeights],
  );

  const completedSessions = useMemo(
    () => new Set(profile.completedSessions ?? []),
    [profile.completedSessions],
  );

  /**
   * Custom events expanded over the planning horizon. Without this, an event
   * added by hand appeared on the Calendar but never on the Plan - the two
   * tabs disagreed about the same day.
   */
  const customForPlan = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - 1);
    const to = new Date();
    to.setDate(to.getDate() + 15);
    return expandAllCustom(customEvents, from, to);
  }, [customEvents]);

  const schedule = useMemo(
    () =>
      scheduleWork(
        [...scored, ...customForPlan],
        profile.planWeights,
        profile.capacity ?? { hoursPerDay: 4, maxItemsPerDay: 4 },
        completedSessions,
        new Date(),
        14,
        new Set(profile.feedback.saved),
        profile.completedHours ?? {},
      ),
    [
      scored,
      customForPlan,
      profile.planWeights,
      profile.capacity,
      completedSessions,
      profile.feedback.saved,
      profile.completedHours,
    ],
  );

  /**
   * What the preset adds to each day. Saved events are already commitments
   * and hidden ones are gone, so neither is offered again; saved postings are
   * already planned work.
   */
  const suggestions = useMemo(() => {
    const hidden = new Set(profile.feedback.dismissed);
    const savedEv = new Set(profile.feedback.saved);
    const candidates = scored.filter(
      (e) => e.lane === 'opportunity' && !hidden.has(e.id) && !savedEv.has(e.id) && hoursUntil(e.start) > 0,
    );
    const savedIds = new Set(savedPostings.map((p) => p.id));
    return suggestFor(
      schedule.days,
      profile.planPreset,
      candidates,
      careers.filter((p) => !savedIds.has(p.id)),
    );
  }, [schedule.days, profile.planPreset, profile.feedback, scored, careers, savedPostings]);

  /**
   * Saved opportunities by id. Saved internships already arrive as
   * application_deadline events, so they pass the calendar filter by kind.
   */
  const calendarItems = useMemo(() => {
    // Expand recurring series across a generous window so paging months
    // forward doesn't hit an empty grid.
    const from = new Date();
    from.setMonth(from.getMonth() - 2);
    const to = new Date();
    to.setMonth(to.getMonth() + 10);
    const mine = expandAllCustom(customEvents, from, to);
    return calendarEvents([...scored, ...mine], new Set(profile.feedback.saved), {
      showClasses,
      showUnsaved,
    });
  }, [scored, customEvents, profile.feedback.saved, showClasses, showUnsaved]);

  // Due is chronological; the Plan tab owns priority ordering.
  const agenda = useMemo(() => sortChronological(scored), [scored]);
  // 0.12, not 0.25. A category set to "Sometimes" contributes at most
  // 0.5 * 0.30 = 0.15, so a 0.25 floor made "Sometimes" mean *never* for any
  // event with no field/person/keyword match - social events in particular
  // were unreachable at every setting except "Priority". The floor now sits
  // below what "Sometimes" alone produces and above what "Skip" does.
  const feed = useMemo(() => feedFor(scored, 0.12), [scored]);

  // --- actions ------------------------------------------------------------

  const persistProfile = useCallback(async (next: InterestProfile) => {
    profileRef.current = next;
    setProfile(next);
    await store.saveProfile(next);
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<InterestProfile>) => {
      await persistProfile({ ...profileRef.current, ...patch });
    },
    [persistProfile],
  );

  const setCredentials = useCallback(async (next: ConnectorCredentials) => {
    credentialsRef.current = next;
    setCreds(next);
    await creds.saveCredentials(next);
  }, []);

  const setOllamaConfig = useCallback(async (cfg: OllamaConfig) => {
    setCfg(cfg);
    await store.saveOllama(cfg);
  }, []);

  const checkOllama = useCallback(async () => {
    const h = await health(ollamaConfig);
    const next: OllamaStatus = {
      checked: true,
      reachable: h.reachable,
      missing: h.missing,
      error: h.error,
    };
    setStatus(next);
    return next;
  }, [ollamaConfig]);

  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setProgress({ phase: 'fetching', message: 'Starting...' });

    setSyncError(null);
    const generation = generationRef.current;
    const stale = () => generationRef.current !== generation;
    try {
      const status = await checkOllama();

      // Read through the ref so a sync kicked off right after connecting an
      // account uses the credentials that were just saved.
      const activeCreds = credentialsRef.current;
      const result = await sync({
        window: defaultWindow(),
        creds: activeCreds,
        registry: buildRegistry(activeCreds),
        schedule: {
          courses: profile.courses,
          sections: profile.sectionChoice ?? {},
        },
        // Every club followed for events gets its own Engage feed and its
        // website read. Lookups are remembered so the directory is hit once.
        clubs: {
          names: profile.orgs,
          lookup: clubLookupRef.current,
          remember: (records: ClubRecord[]) => {
            const next = { ...clubLookupRef.current };
            for (const r of records) next[r.name.toLowerCase().trim()] = r;
            clubLookupRef.current = next;
            store.saveClubLookup(next);
          },
        },
        sources: profile.enabledSources,
        // Without a reachable model we still sync Canvas and Outlook calendar.
        // A partial agenda beats an error screen.
        ollama: status.reachable && status.missing.length === 0 ? ollamaConfig : undefined,
        onProgress: setProgress,
        onPartial: (partial) => setEvents(partial),
      });

      // Embed interests and events so the next scoring pass has real vectors.
      if (status.reachable) {
        try {
          await cacheRef.current.warm(ollamaConfig, profile.fields, 'query');
          await cacheRef.current.warm(
            ollamaConfig,
            result.events.map(embeddingText),
            'document',
          );
          if (!stale()) await store.saveEmbeddings(cacheRef.current.toJSON());
        } catch {
          // Scoring degrades to priorities + keywords, which still works.
        }
      }

      if (stale()) return;
      setEvents(result.events);
      setLastResult(result);
      await store.saveEvents(result.events);

      const now = new Date().toISOString();
      setLastSync(now);
      await store.saveLastSync(now);

      // Score with the now-warm cache before planning notifications, so the
      // score floor is applied to real numbers rather than zeros.
      const fresh = scoreAll(partitionByCourse(result.events, profile).tracked, {
        profile,
        cache: cacheRef.current,
        obligations: [],
      });

      // A short rationale for the handful of events we'll actually surface.
      if (status.reachable && status.missing.length === 0) {
        const top = feedFor(fresh, 0.4).slice(0, 6);
        const written = await Promise.all(
          top.map(async (ev) => {
            const reason = await writeRationale(ollamaConfig, ev, {
              fields: profile.fields,
              people: profile.people,
              orgs: profile.orgs,
            });
            return [ev.id, reason] as const;
          }),
        );
        const next: Record<string, string> = {};
        for (const [id, reason] of written) if (reason) next[id] = reason;
        // Drop rationales for events that no longer exist, so storage doesn't
        // grow forever across a semester of syncs.
        if (stale()) return;
        setRationales(next);
        await store.saveRationales(next);
        for (const ev of fresh) if (next[ev.id]) ev.rationale = next[ev.id];
      }

      if (stale()) return;
      const granted = await requestPermissions();
      if (granted && profile.notify.enabled) {
        const prev = await store.loadScheduled();
        const { records, added } = await syncSchedule(fresh, profile.notify, prev);
        await store.saveScheduled(records);
        setNotifications({ scheduled: records.length, granted });
        if (added === 0 && records.length === 0) {
          // Nothing to schedule is a legitimate outcome, not a failure.
        }
      } else {
        setNotifications({ scheduled: 0, granted });
      }
    } catch (err) {
      // Without this, any throw mid-sync became an unhandled rejection: the
      // structured events from onPartial stayed on screen, so it looked like
      // a successful sync that just happened to persist nothing.
      if (__DEV__) console.error('[sync] failed:', err);
      setSyncError((err as Error)?.message ?? String(err));
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      setProgress(null);
    }
  }, [checkOllama, ollamaConfig, profile]);

  const reschedule = useCallback(
    async (opts: { prompt?: boolean } = {}) => {
      // Editing lead times must take effect now. A full sync would also do it,
      // but it costs ~25s of local inference to recompute events that did not
      // change - the schedule is a pure function of events plus prefs.
      const granted = opts.prompt ? await requestPermissions() : await hasPermission();
      const prev = await store.loadScheduled();

      // With permission withheld or notifications off, planNotifications
      // returns nothing, so this cancels everything already queued.
      const { records } = await syncSchedule(
        granted ? scored : [],
        profile.notify,
        prev,
      );
      await store.saveScheduled(records);
      setNotifications({ scheduled: records.length, granted });
    },
    [profile.notify, scored],
  );

  // Keep the OS schedule in step with the preferences. Debounced because
  // tapping through a row of lead-time chips fires this on every tap.
  const notifyKey = JSON.stringify(profile.notify);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      reschedule().catch(() => {
        // Scheduling is best-effort; the in-app lists are the source of truth.
      });
    }, 700);
    return () => clearTimeout(t);
    // `reschedule` is intentionally omitted: it changes identity whenever
    // `scored` does, which would reschedule on every re-render during a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, notifyKey]);

  const completeOnboarding = useCallback(
    async (patch: Partial<InterestProfile>) => {
      await persistProfile({
        ...profileRef.current,
        ...patch,
        completedOnboarding: true,
      });
    },
    [persistProfile],
  );

  const saveEvent = useCallback(
    async (id: string) => {
      const current = profileRef.current;
      const saved = current.feedback.saved.includes(id)
        ? current.feedback.saved.filter((x) => x !== id)
        : [...current.feedback.saved, id];
      await persistProfile({
        ...current,
        feedback: {
          ...current.feedback,
          saved,
          dismissed: current.feedback.dismissed.filter((x) => x !== id),
        },
      });
    },
    [persistProfile],
  );

  /**
   * "Not for me" learns. Dismissing one meeting of a weekly fellowship used
   * to hide that Tuesday and leave the other six on the list, which read as
   * the app ignoring the tap. Now the host and the recurring series are
   * hidden too; the tab offers to hide the whole theme as a further step
   * rather than assuming it.
   */
  const dismissEvent = useCallback(
    async (id: string, opts: { learn?: boolean } = { learn: true }) => {
      const current = profileRef.current;
      const ev = eventsRef.current.find((e) => e.id === id);
      const hosts = new Set(current.feedback.dismissedHosts ?? []);
      const series = new Set(current.feedback.dismissedSeries ?? []);
      if (opts.learn !== false && ev) {
        if (ev.organizer) hosts.add(ev.organizer);
        const key = seriesKey(ev.title);
        if (key.length >= 6) series.add(key);
      }
      await persistProfile({
        ...current,
        feedback: {
          saved: current.feedback.saved.filter((x) => x !== id),
          dismissed: [...new Set([...current.feedback.dismissed, id])],
          dismissedHosts: [...hosts].slice(-200),
          dismissedSeries: [...series].slice(-300),
        },
      });
    },
    [persistProfile],
  );

  /** Undo for the learned part of a dismissal. */
  const unhide = useCallback(
    async (what: { host?: string; series?: string; eventId?: string }) => {
      const current = profileRef.current;
      await persistProfile({
        ...current,
        feedback: {
          ...current.feedback,
          dismissed: what.eventId
            ? current.feedback.dismissed.filter((x) => x !== what.eventId)
            : current.feedback.dismissed,
          dismissedHosts: (current.feedback.dismissedHosts ?? []).filter((h) => h !== what.host),
          dismissedSeries: (current.feedback.dismissedSeries ?? []).filter((k) => k !== what.series),
        },
      });
    },
    [persistProfile],
  );

  /**
   * Disconnecting an account has to remove its data, not just its token.
   *
   * Dropping only the credential left the previous account's assignments,
   * grades, and queued reminders sitting on the device - and the UI would
   * then label that real data "sample", because the source had flipped back
   * to demo mode. On a shared or demoed phone that is somebody else's
   * coursework left on screen.
   */
  const forgetAccount = useCallback(
    async (id: SourceId) => {
      const next = { ...credentialsRef.current };
      delete next[id as keyof ConnectorCredentials];
      credentialsRef.current = next;
      setCreds(next);
      await creds.saveCredentials(next);

      // Everything derived from that account goes too.
      setEvents([]);
      setRationales({});
      setLastResult(null);
      cacheRef.current = new EmbeddingCache();
      await Promise.all([
        store.saveEvents([]),
        store.saveRationales({}),
        store.saveEmbeddings({}),
      ]);

      // Cancel the reminders it produced rather than letting them fire.
      try {
        const prev = await store.loadScheduled();
        await syncSchedule([], profileRef.current.notify, prev);
        await store.saveScheduled([]);
        setNotifications((n) => ({ ...n, scheduled: 0 }));
      } catch {
        // Best effort; the next reschedule reconciles.
      }

      // The course list belongs to Canvas; wiping it when someone disconnects
      // Outlook would throw away a perfectly good enrollment. Feedback is
      // per-event and the events are gone regardless of source.
      await persistProfile({
        ...profileRef.current,
        ...(id === 'canvas' ? { courses: [] } : {}),
        feedback: { saved: [], dismissed: [], dismissedHosts: [], dismissedSeries: [] },
      });
    },
    [persistProfile],
  );

  /**
   * The catalogue is ~2.7MB and changes once a term, so it's cached for a
   * week rather than refetched per sync.
   */
  const catalogueBusy = useRef(false);
  const loadCatalogue = useCallback(
    async (force = false) => {
      if (catalogueBusy.current) return;
      // A cache without a term predates instructors and descriptions being
      // kept, so it's refetched once rather than searched half-blind.
      if (!force && catalogue.size > 0 && catalogueTerm) return;
      catalogueBusy.current = true;
      setCatalogueLoading(true);
      try {
        const { classes, term } = await fetchHydrantCatalogue();
        setCatalogue(classes);
        setCatalogueTerm(term);
        await store.saveHydrant({
          classes: Object.fromEntries(classes),
          fetchedAt: new Date().toISOString(),
          term,
        });
      } catch {
        // No catalogue means no class schedule; everything else still works.
      } finally {
        catalogueBusy.current = false;
        setCatalogueLoading(false);
      }
    },
    [catalogue.size, catalogueTerm],
  );

  /**
   * Groups and departments change rarely; a week-old list is fine and saves
   * two requests per search. Fetched on first search, not on boot.
   */
  const directoryBusy = useRef(false);
  const loadDirectory = useCallback(
    async (force = false) => {
      if (directoryBusy.current) return;
      const age = directory.fetchedAt
        ? Date.now() - new Date(directory.fetchedAt).getTime()
        : Infinity;
      if (!force && age < DIRECTORY_TTL_MS && directory.groups.length > 0) return;
      directoryBusy.current = true;
      setDirectoryLoading(true);
      try {
        const next = await fetchDirectory();
        setDirectory(next);
        await store.saveDirectory(next);
      } catch {
        // Search degrades to what's cached; the UI says the lookup failed.
      } finally {
        directoryBusy.current = false;
        setDirectoryLoading(false);
      }
    },
    [directory.fetchedAt, directory.groups.length],
  );

  const needsSectionPick = useMemo(() => {
    if (catalogue.size === 0) return [];
    return profile.courses
      .map((course) => ({ course, kinds: ambiguousKinds(catalogue, course) }))
      .filter((c) => c.kinds.some((k) => profile.sectionChoice?.[`${c.course}:${k}`] === undefined))
      .map((c) => ({
        course: c.course,
        kinds: c.kinds.filter(
          (k) => profile.sectionChoice?.[`${c.course}:${k}`] === undefined,
        ),
      }));
  }, [catalogue, profile.courses, profile.sectionChoice]);

  const sectionOptionsFor = useCallback(
    (course: string) => sectionOptions(catalogue, course),
    [catalogue],
  );

  const setSection = useCallback(
    async (course: string, kind: MeetingKind, index: number) => {
      const key = `${course}:${kind}`;
      const current = profileRef.current.sectionChoice ?? {};
      const next = { ...current };
      // Tapping the chosen one again clears it.
      if (next[key] === index) delete next[key];
      else next[key] = index;
      await persistProfile({ ...profileRef.current, sectionChoice: next });
    },
    [persistProfile],
  );

  const toggleSession = useCallback(
    async (id: string, hours?: number) => {
      const cur = profileRef.current.completedSessions ?? [];
      const hoursMap = { ...(profileRef.current.completedHours ?? {}) };
      let next: string[];
      if (cur.includes(id)) {
        next = cur.filter((x) => x !== id);
        delete hoursMap[id];
      } else {
        next = [...cur, id];
        // Recorded now, because tomorrow's recompute no longer produces this
        // session and so can't tell how long it was.
        if (typeof hours === 'number') hoursMap[id] = hours;
      }
      // Keep this bounded; sessions older than the horizon can't be shown.
      const kept = next.slice(-400);
      const keptSet = new Set(kept);
      for (const k of Object.keys(hoursMap)) if (!keptSet.has(k)) delete hoursMap[k];
      await persistProfile({
        ...profileRef.current,
        completedSessions: kept,
        completedHours: hoursMap,
      });
    },
    [persistProfile],
  );

  /**
   * Execute one assistant action against real state.
   *
   * Everything here is something the user could do by hand in the UI - the
   * assistant is a shortcut, never a capability the interface lacks.
   */
  const runAction = useCallback(
    async (action: ChatAction): Promise<ChatAction | null> => {
      const p = profileRef.current;
      const cap = p.capacity ?? { hoursPerDay: 4, maxItemsPerDay: 4 };
      const lower = (x: string) => x.toLowerCase().trim();
      const addUnique = (list: string[], v: string) =>
        list.some((x) => lower(x) === lower(v)) ? list : [...list, v.trim()];
      const without = (list: string[], v: string) => list.filter((x) => lower(x) !== lower(v));
      const mute = async (word: string): Promise<ChatAction> => {
        await persistProfile({
          ...profileRef.current,
          keywords: {
            ...profileRef.current.keywords,
            exclude: addUnique(profileRef.current.keywords.exclude, lower(word)),
          },
        });
        return { kind: 'mute_keyword', value: lower(word) };
      };
      const ok = (a: ChatAction = action) => a;
      switch (action.kind) {
        case 'navigate': {
          // Explicit map rather than a template string: expo-router's typed
          // routes can't verify an interpolated path, and a typo here would
          // navigate nowhere silently.
          const routes: Record<string, '/' | '/plan' | '/calendar' | '/feed' | '/careers' | '/grades' | '/settings'> = {
            due: '/',
            plan: '/plan',
            calendar: '/calendar',
            feed: '/feed',
            careers: '/careers',
            work: '/grades',
            settings: '/settings',
          };
          const target = routes[action.value ?? ''];
          if (!target) return null;
          router.push(target);
          return ok();
        }
        case 'add_interest':
          await persistProfile({ ...p, fields: addUnique(p.fields, action.value!) });
          return ok();
        case 'remove_interest': {
          // "Remove prayer nights from my interests" names a THEME, not one
          // of the interest fields. Silently succeeding at nothing is how the
          // recommendations kept coming; muting the phrase is what was meant.
          if (p.fields.some((f) => lower(f) === lower(action.value!))) {
            await persistProfile({ ...p, fields: without(p.fields, action.value!) });
            return ok();
          }
          return mute(action.value!);
        }
        case 'mute_keyword':
          return mute(action.value!);
        case 'unmute_keyword':
          await persistProfile({
            ...p,
            keywords: { ...p.keywords, exclude: without(p.keywords.exclude, action.value!) },
          });
          return ok();
        case 'set_priority': {
          const level = { skip: 0.05, sometimes: 0.5, priority: 0.95 }[action.level!];
          await persistProfile({
            ...p,
            priorities: { ...p.priorities, [action.value!]: level },
          });
          return ok();
        }
        case 'track_course':
          if (p.courses.includes(action.value!)) return ok();
          await persistProfile({ ...p, courses: [...p.courses, action.value!].sort() });
          return ok();
        case 'untrack_course':
          await persistProfile({
            ...p,
            courses: p.courses.filter((c) => c !== action.value),
          });
          return ok();
        case 'follow_org':
          await persistProfile({ ...p, careerFollows: addUnique(p.careerFollows, action.value!) });
          return ok();
        case 'unfollow_org':
          await persistProfile({ ...p, careerFollows: without(p.careerFollows, action.value!) });
          return ok();
        case 'follow_club':
          // `orgs` is what the event scorer reads ("Hosted by X" bonus).
          await persistProfile({ ...p, orgs: addUnique(p.orgs, action.value!) });
          return ok();
        case 'unfollow_club':
          await persistProfile({ ...p, orgs: without(p.orgs, action.value!) });
          return ok();
        case 'dismiss_event': {
          const needle = lower(action.value!);
          const hit = scored.find(
            (e) => e.lane === 'opportunity' && lower(e.title).includes(needle),
          );
          if (!hit) return null;
          await dismissEvent(hit.id);
          return { kind: 'dismiss_event', value: hit.title };
        }
        case 'save_event': {
          const needle = lower(action.value!);
          const hit = scored.find(
            (e) => e.lane === 'opportunity' && lower(e.title).includes(needle),
          );
          if (!hit) return null;
          await saveEvent(hit.id);
          return { kind: 'save_event', value: hit.title };
        }
        case 'search':
          setPendingSearch(action.value!.trim());
          router.push('/feed');
          return ok();
        case 'set_plan_preset': {
          const preset = PLAN_PRESETS.find((x) => x.key === action.value);
          if (!preset) return null;
          await persistProfile({
            ...p,
            planPreset: preset.key,
            planWeights: preset.weights,
          });
          return ok();
        }
        case 'spread_out_day':
          await persistProfile({ ...p, capacity: relaxCapacity(cap) });
          return ok();
        case 'pack_day':
          await persistProfile({ ...p, capacity: tightenCapacity(cap) });
          return ok();
        case 'set_daily_hours':
          await persistProfile({
            ...p,
            capacity: { ...cap, hoursPerDay: action.hours! },
          });
          return ok();
        case 'set_notifications': {
          const n = { ...p.notify };
          if (action.mode === 'off') n.enabled = false;
          else if (action.mode === 'on') n.enabled = true;
          else if (action.mode === 'quieter') {
            n.enabled = true;
            n.opportunityScoreFloor = Math.min(0.9, n.opportunityScoreFloor + 0.15);
            n.assignmentLeadHours = n.assignmentLeadHours.slice(-2);
          } else if (action.mode === 'louder') {
            n.enabled = true;
            n.opportunityScoreFloor = Math.max(0.2, n.opportunityScoreFloor - 0.15);
          }
          await persistProfile({ ...p, notify: n });
          return ok();
        }
        case 'sync':
          runSync();
          return ok();
        default:
          return null;
      }
    },
    [persistProfile, runSync, scored, dismissEvent, saveEvent],
  );

  const saveCustomEvent = useCallback(async (ev: CustomEvent) => {
    setCustomEvents((prev) => {
      const next = prev.some((e) => e.id === ev.id)
        ? prev.map((e) => (e.id === ev.id ? ev : e))
        : [...prev, ev];
      store.saveCustomEvents(next);
      return next;
    });
  }, []);

  const deleteCustomEvent = useCallback(async (id: string) => {
    setCustomEvents((prev) => {
      const next = prev.filter((e) => e.id !== id);
      store.saveCustomEvents(next);
      return next;
    });
  }, []);

  /**
   * Erase everything: storage, credentials, uploaded documents, queued
   * reminders, and every piece of in-memory state - so the screens empty
   * immediately rather than after the next reload.
   */
  const reset = useCallback(async () => {
    generationRef.current += 1;
    await store.resetAll();
    await creds.clearCredentials();
    await clearAllFiles();
    try {
      await cancelAll();
    } catch {
      // No scheduler on this platform; nothing was queued.
    }
    credentialsRef.current = {};
    clubLookupRef.current = {};
    setCreds({});
    cacheRef.current = new EmbeddingCache();
    profileRef.current = DEFAULT_PROFILE;
    setProfile(DEFAULT_PROFILE);
    setCustomEvents([]);
    setEvents([]);
    setRationales({});
    setLastSync(null);
    setLastResult(null);
    setPostings([]);
    setSavedPostings([]);
    setCareersFetchedAt(null);
    setCatalogue(new Map());
    setCatalogueTerm(null);
    setDirectory({ groups: [], departments: [], fetchedAt: null });
    setNotifications({ scheduled: 0, granted: false });
    setPendingSearch(null);
  }, []);

  const value: AppState = {
    ready,
    profile,
    events,
    scored,
    agenda,
    feed,
    availableCourses,
    hiddenByCourse: untracked.length,
    courseFilterStale,
    plan,
    schedule,
    suggestions,
    completedSessions,
    toggleSession,
    runAction,
    calendarItems,
    catalogue,
    catalogueTerm,
    catalogueLoading,
    loadCatalogue,
    directory,
    directoryLoading,
    loadDirectory,
    needsSectionPick,
    sectionOptionsFor,
    setSection,
    customEvents,
    saveCustomEvent,
    deleteCustomEvent,
    showClasses,
    setShowClasses,
    showUnsaved,
    setShowUnsaved,
    pendingSearch,
    setPendingSearch,
    careers,
    careersFetchedAt,
    careersLoading,
    savedPostings,
    refreshCareers,
    togglePostingSaved,
    ollamaConfig,
    ollamaStatus,
    syncing,
    progress,
    lastSync,
    lastResult,
    syncError,
    credentials,
    modes,
    usingDemoData,
    setCredentials,
    notifications,
    updateProfile,
    completeOnboarding,
    setOllamaConfig,
    checkOllama,
    runSync,
    reschedule,
    forgetAccount,
    saveEvent,
    dismissEvent,
    unhide,
    reset,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
