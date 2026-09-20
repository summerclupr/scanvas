/**
 * The "For you" tab - the opportunity lane.
 *
 * Three things live here:
 *
 *   SEARCH      one box that asks everything the app knows about MIT: the
 *               checked faculty set, every instructor and subject in this
 *               term's listing (Hydrant), the clubs and labs that post to the
 *               Institute calendar, synced events, and a live calendar search.
 *   EVENTS      talks, seminars, research events, club and social events,
 *               career workshops - from MIT's public calendars, ranked
 *               against your interests, one chip per kind.
 *   PROFESSORS  faculty whose work matches those interests: what they work
 *               on, what they're teaching this term (live from the subject
 *               listing), what they've taught, and verified contact links.
 *               Because at MIT the realistic route to a UROP is an email to
 *               a PI - postings sit behind login on ELx with no feed.
 *
 * This is the half of the app that's allowed to hide things, so it shows its
 * work: a match percentage on every card, an expandable breakdown, and an
 * explicit count of what was filtered out.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OpportunityCard } from '@/components/event-card';
import { PostingCard } from '@/components/posting-card';
import { ProfessorCard, rankProfessors, type RankedProfessor } from '@/components/professor-card';
import { SearchResults, type SearchResultSet } from '@/components/search-results';
import { Chip, Empty, Row, SectionHeader, T, useTheme } from '@/components/kit';
import { Brand } from '@/components/logo';
import { hoursUntil } from '@/core/datetime';
import { KIND_LABELS, type EventKind, type ScoredEvent } from '@/core/types';
import { priorityWeightFor } from '@/core/profile';
import { hasInterestSignal } from '@/ranking/score';
import { PROFESSORS, seriesKey, worksIn } from '@/careers/professors';
import { DEPARTMENTS } from '@/search/intent';
import { subjectsFromCourses } from '@/careers/eligibility';
import {
  classesFor,
  instructorIndex,
  personAsInstructor,
  searchClassGroups,
  searchInstructors,
} from '@/connectors/hydrant';
import { clubsFromEvents, matchDepartment, parseIntent, searchDirectory, searchEvents, searchProfessors } from '@/search';
import { searchCalendar, type CalendarHit } from '@/search/localist';
import { searchMitAuthors, searchMitResearchers, type Researcher, type Topic } from '@/search/openalex';
import { searchEngageClubs, type EngageClub } from '@/search/engage';
import { DemoBanner } from '@/components/demo-banner';
import { AssistantButton } from '@/components/assistant';
import { useApp } from '@/state/app-store';

type Section = 'events' | 'people';
type Filter = 'all' | EventKind | 'week' | 'saved';

/** One chip per kind the connectors produce, in the order they read best. */
const KIND_FILTERS: { kind: EventKind; label: string }[] = [
  { kind: 'urop', label: 'Research' },
  { kind: 'talk', label: 'Talks' },
  { kind: 'club_event', label: 'Club events' },
  { kind: 'social', label: 'Social' },
  { kind: 'career', label: 'Career' },
  { kind: 'application_deadline', label: 'Deadlines' },
  { kind: 'other', label: 'Other' },
];

/** Below this score an event is filed under "filtered out" rather than shown. */
const FLOOR = 0.12;
/** How many "in case you're curious" events to show above the filtered-out fold. */
const IN_CASE_LIMIT = 3;
/** MIT calendar themes worth offering to hide wholesale after a "Not for me". */
const THEMES = new Set([
  'religious/spiritual',
  'arts/music/film',
  'health/wellness',
  'diversity/inclusion',
  'climate & sustainability',
  'energy',
  'entrepreneurship',
  'mit museum',
]);
const themeLabel = (t: string) => t.replace(/\b\w/g, (c) => c.toUpperCase());

export default function FeedScreen() {
  const c = useTheme();
  const {
    scored,
    syncing,
    runSync,
    lastSync,
    lastResult,
    profile,
    updateProfile,
    saveEvent,
    dismissEvent,
    unhide,
    careers,
    savedPostings,
    togglePostingSaved,
    catalogue,
    catalogueTerm,
    catalogueLoading,
    loadCatalogue,
    directory,
    directoryLoading,
    loadDirectory,
    pendingSearch,
    setPendingSearch,
  } = useApp();
  const [section, setSection] = useState<Section>('events');
  const [filter, setFilter] = useState<Filter>('all');
  const [showHidden, setShowHidden] = useState(false);
  const [fieldFilter, setFieldFilter] = useState<string | null>(null);
  const [profView, setProfView] = useState<'ranked' | 'lab'>('ranked');
  const [showAllProfs, setShowAllProfs] = useState(false);

  // --- search -----------------------------------------------------------------

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [liveEvents, setLiveEvents] = useState<CalendarHit[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [researchers, setResearchers] = useState<Researcher[]>([]);
  const [researchTopic, setResearchTopic] = useState<Topic | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [engageClubs, setEngageClubs] = useState<EngageClub[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // The assistant can hand this tab a search ("show me poker club events").
  useEffect(() => {
    if (pendingSearch) {
      setQuery(pendingSearch);
      setSection('events');
      setPendingSearch(null);
    }
  }, [pendingSearch, setPendingSearch]);

  const searching = debounced.length >= 2;
  const intent = useMemo(() => parseIntent(debounced), [debounced]);

  // What to ask the network depends on what the query is asking for. The
  // directories are fetched on first use and cached; everything else runs
  // per query. Each failure is named rather than swallowed.
  useEffect(() => {
    if (!searching) {
      setLiveEvents([]);
      setResearchers([]);
      setResearchTopic(null);
      setEngageClubs([]);
      setFailed([]);
      return;
    }
    let cancelled = false;
    const fail = (src: string) => {
      if (!cancelled) setFailed((f) => [...new Set([...f, src])]);
    };
    loadCatalogue();
    loadDirectory();

    setLiveLoading(true);
    searchCalendar(intent.required.join(' ') || debounced)
      .then((hits) => !cancelled && setLiveEvents(hits))
      .catch(() => fail('calendar.mit.edu'))
      .finally(() => !cancelled && setLiveLoading(false));

    // People: a name goes to OpenAlex's author index filtered to MIT; a
    // topic goes to its topic taxonomy and then to MIT authors under it.
    // A one- or two-word query could be either, so a name search that finds
    // nobody falls through to the topic search.
    if (intent.kind === 'name' || intent.kind === 'topic') {
      setPeopleLoading(true);
      setResearchTopic(null);
      // A three-word topic could still be a three-word name, so it gets the
      // author lookup too before falling through to the topic taxonomy.
      const tryName =
        intent.kind === 'name' || (intent.subject.split(' ').length <= 3 && !/\d/.test(intent.subject));
      const byName = tryName ? searchMitAuthors(intent.subject) : Promise.resolve([] as Researcher[]);
      byName
        .then(async (authors) => {
          if (authors.length) return { authors, topic: null as Topic | null, inTopic: [] as Researcher[] };
          const { topic, researchers: inTopic } = await searchMitResearchers(intent.subject);
          return { authors, topic, inTopic };
        })
        .then(({ authors, topic, inTopic }) => {
          if (cancelled) return;
          if (authors.length) {
            setResearchers(authors);
            setResearchTopic(null);
          } else {
            setResearchers(inTopic);
            setResearchTopic(topic);
          }
        })
        .catch(() => fail('openalex.org'))
        .finally(() => !cancelled && setPeopleLoading(false));
    } else {
      setResearchers([]);
      setResearchTopic(null);
    }

    // Clubs: Engage's full directory, for anything that isn't clearly a
    // person, a department or a research topic.
    if (intent.kind === 'general' || intent.kind === 'name') {
      setClubsLoading(true);
      searchEngageClubs(intent.required.join(' ') || debounced)
        .then((clubs) => !cancelled && setEngageClubs(clubs))
        .catch(() => fail('engage.mit.edu'))
        .finally(() => !cancelled && setClubsLoading(false));
    } else {
      setEngageClubs([]);
    }

    return () => {
      cancelled = true;
    };
    // loadCatalogue/loadDirectory change identity as their caches fill; the
    // query is the only thing that should trigger a new search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, searching]);

  useEffect(() => {
    if (section === 'people') loadCatalogue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // --- events -----------------------------------------------------------------

  const opportunities = useMemo(() => {
    const hosts = new Set(profile.feedback.dismissedHosts ?? []);
    const series = new Set(profile.feedback.dismissedSeries ?? []);
    return scored
      .filter((e) => e.lane === 'opportunity')
      .filter((e) => hoursUntil(e.start) > -1)
      .filter((e) => !profile.feedback.dismissed.includes(e.id))
      // "Not for me" on one meeting hides the host and the series for good.
      .filter((e) => !(e.organizer && hosts.has(e.organizer)) && !series.has(seriesKey(e.title)))
      .sort((a, b) => b.score - a.score || a.start.localeCompare(b.start));
  }, [scored, profile.feedback]);

  /**
   * Three tiers. FOR YOU: something you said matched - a field, a person or
   * club you follow, a keyword, a class - or a category you ranked Priority.
   * IN CASE: nothing matched beyond a category you'd rank "Sometimes"; a few
   * of these are shown, labelled, so the tab isn't a wall of them. HIDDEN:
   * the rest, one tap away.
   */
  const { forYou, inCase, hidden, saved } = useMemo(() => {
    const byKind =
      filter === 'all' || filter === 'week' || filter === 'saved'
        ? opportunities
        : opportunities.filter((e) => e.kind === filter);
    const aboveFloor = byKind.filter((e) => e.score >= FLOOR);
    const matched = aboveFloor.filter(
      (e) => hasInterestSignal(e) || priorityWeightFor(profile, e.kind) >= 0.9,
    );
    const rest = aboveFloor.filter((e) => !matched.includes(e));
    return {
      forYou: matched,
      inCase: rest.slice(0, IN_CASE_LIMIT),
      hidden: [...rest.slice(IN_CASE_LIMIT), ...byKind.filter((e) => e.score < FLOOR)],
      saved: opportunities.filter((e) => profile.feedback.saved.includes(e.id)),
    };
  }, [opportunities, filter, profile]);

  const visible = useMemo(() => {
    if (filter === 'saved') return saved;
    if (filter === 'week') return forYou.filter((e) => hoursUntil(e.start) <= 24 * 7);
    return forYou;
  }, [filter, saved, forYou]);

  // "Not for me" feedback: what was just hidden, so the tab can say what it
  // learned and offer the next step (the whole theme) rather than assume it.
  const [lastHidden, setLastHidden] = useState<{ event: ScoredEvent; theme?: string } | null>(null);
  const handleDismiss = (e: ScoredEvent) => {
    const theme = e.topics.find((t) => THEMES.has(t));
    setLastHidden({ event: e, theme: theme && !profile.keywords.exclude.includes(theme) ? theme : undefined });
    dismissEvent(e.id);
  };
  const muteTheme = (theme: string) =>
    updateProfile({ keywords: { ...profile.keywords, exclude: [...new Set([...profile.keywords.exclude, theme])] } });

  const counts = useMemo(() => {
    const out = new Map<EventKind, number>();
    for (const e of opportunities) {
      if (e.score < FLOOR) continue;
      if (!hasInterestSignal(e) && priorityWeightFor(profile, e.kind) < 0.9) continue;
      out.set(e.kind, (out.get(e.kind) ?? 0) + 1);
    }
    return out;
  }, [opportunities, profile]);

  /** Curated research programs and funding cycles, for the Research chip. */
  const researchPrograms = useMemo(
    () => careers.filter((p) => p.kind === 'research').slice(0, 6),
    [careers],
  );
  const savedPostingIds = useMemo(
    () => new Set(savedPostings.map((p) => p.id)),
    [savedPostings],
  );

  // How the campus feeds fared on the last sync. A silent empty list would
  // look like a quiet campus; it is almost always a fetch problem.
  const campus = lastResult?.sources.find((s) => s.id === 'mit');
  const campusMuted = !profile.enabledSources.includes('mit');

  // --- professors -------------------------------------------------------------

  const professors = useMemo(
    () =>
      rankProfessors(PROFESSORS, {
        fields: profile.fields,
        follows: [...profile.careerFollows, ...profile.orgs, ...profile.people],
        courses: profile.courses,
        courseSubjects: subjectsFromCourses(profile.courses),
      }),
    [profile.fields, profile.careerFollows, profile.orgs, profile.people, profile.courses],
  );

  // Who teaches what this term, from the subject listing. Built once per
  // catalogue and looked up per card.
  const instructors = useMemo(() => instructorIndex(catalogue), [catalogue]);
  const teachingFor = (prof: RankedProfessor) => classesFor(instructors, prof);

  /**
   * A field chip that names a department ("mathematics", "physics") means the
   * department's own faculty first; people elsewhere who list the field as an
   * area come after, under their own heading. Before this, "mathematics"
   * ranked Course 6 theory faculty above the Mathematics department.
   */
  const fieldDept = useMemo(() => {
    if (!fieldFilter || fieldFilter === 'saved') return null;
    return DEPARTMENTS.find((d) => d.aliases.test(fieldFilter)) ?? null;
  }, [fieldFilter]);

  const { inDept, alsoWorkOn, visibleProfs } = useMemo(() => {
    if (fieldFilter === 'saved') {
      const saved = professors.filter((p) => profile.savedProfessors.includes(p.id));
      return { inDept: [], alsoWorkOn: [], visibleProfs: saved };
    }
    if (!fieldFilter) return { inDept: [], alsoWorkOn: [], visibleProfs: professors };
    if (fieldDept) {
      const inD = professors.filter((p) => fieldDept.aliases.test(p.department));
      const others = professors.filter((p) => !inD.includes(p) && worksIn(p, fieldFilter));
      return { inDept: inD, alsoWorkOn: others, visibleProfs: [...inD, ...others] };
    }
    const hits = professors.filter((p) => worksIn(p, fieldFilter));
    return { inDept: [], alsoWorkOn: [], visibleProfs: hits };
  }, [professors, fieldFilter, fieldDept, profile.savedProfessors]);

  /** Grouped by lab (or department when no lab is listed), best-matching labs first. */
  const byLab = useMemo(() => {
    const groups = new Map<string, RankedProfessor[]>();
    for (const p of visibleProfs) {
      const key = p.lab ?? p.department;
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()].sort(
      (a, b) =>
        Math.max(...b[1].map((p) => p.score)) - Math.max(...a[1].map((p) => p.score)) ||
        a[0].localeCompare(b[0]),
    );
  }, [visibleProfs]);

  const toggleProf = (id: string) => {
    const next = profile.savedProfessors.includes(id)
      ? profile.savedProfessors.filter((x) => x !== id)
      : [...profile.savedProfessors, id];
    updateProfile({ savedProfessors: next });
  };

  const matchedCount = professors.filter((p) => p.score > 0).length;

  // --- search results ---------------------------------------------------------

  const empty: SearchResultSet = {
    professors: [], instructors: [], researchers: [], researchTopic: null, department: null,
    courses: [], engageClubs: [], seenClubs: [], groups: [], departments: [], events: [], liveEvents: [],
  };

  const results = useMemo<SearchResultSet>(() => {
    if (!searching) return empty;
    const subject = intent.required.join(' ') || debounced;

    // Curated faculty: by name/lab/blurb, or by field for a topic, or by
    // department for a department query.
    let profHits = searchProfessors(PROFESSORS, subject);
    if (intent.kind === 'topic') {
      profHits = PROFESSORS.filter((p) => intent.required.some((w) => w.length > 3 && worksIn(p, w)));
    } else if (intent.kind === 'department' && intent.department) {
      const want = intent.department.name;
      profHits = PROFESSORS.filter((p) => matchDepartment(p.department)?.name === want);
    }
    const ranked = profHits
      .map((p) => professors.find((r) => r.id === p.id))
      .filter((p): p is RankedProfessor => Boolean(p));

    // Instructors from the subject listing, minus anyone with a curated card.
    const covered = new Set(
      ranked.map((p) => personAsInstructor(p)).filter(Boolean).map((i) => `${i!.initials[0]}|${i!.last}`),
    );
    const instructorHits =
      intent.kind === 'name' || intent.kind === 'general'
        ? searchInstructors(catalogue, subject).filter((i) => !covered.has(`${i.initials[0]}|${i.last}`))
        : [];

    // Department: everyone teaching a class with its prefix this term.
    let department: SearchResultSet['department'] = null;
    if (intent.kind === 'department' && intent.department) {
      const prefixes = intent.department.prefixes.map((x) => x.toUpperCase());
      const inDept = instructors
        .map((i) => ({
          ...i,
          classes: i.classes.filter((c) => prefixes.includes(c.number.split('.')[0].toUpperCase())),
        }))
        .filter((i) => i.classes.length > 0 && !covered.has(`${i.initials[0]}|${i.last}`))
        .sort((a, b) => a.last.localeCompare(b.last));
      // The directory spells names loosely (" Aeronautics and Astronautics",
      // "Department of X", "&" vs "and"), so compare a normalised form.
      const norm = (x: string) =>
        x.toLowerCase().replace(/&/g, 'and').replace(/^department of\s+/, '').replace(/\s+/g, ' ').trim();
      const dirName = intent.department.directoryName ? norm(intent.department.directoryName) : null;
      const fromDirectory = dirName
        ? directory.departments.find((d) => norm(d.name) === dirName || norm(d.name).includes(dirName))?.url
        : undefined;
      department = {
        ...intent.department,
        website: fromDirectory ?? intent.department.website,
        instructors: inDept,
      };
    }

    // Skip OpenAlex people already shown as a curated card.
    const curatedNames = new Set(ranked.map((p) => p.name.toLowerCase()));
    const openAlex = researchers.filter((r) => !curatedNames.has(r.name.toLowerCase()));

    return {
      professors: ranked,
      instructors: instructorHits,
      researchers: openAlex,
      researchTopic,
      department,
      courses: intent.kind === 'topic' || intent.kind === 'department' ? [] : searchClassGroups(catalogue, subject),
      engageClubs,
      seenClubs: intent.kind === 'general' || intent.kind === 'name' ? clubsFromEvents(opportunities, subject) : [],
      groups: intent.kind === 'topic' ? [] : searchDirectory(directory.groups, subject),
      departments: intent.kind === 'topic' ? [] : searchDirectory(directory.departments, subject),
      events: searchEvents(opportunities, subject),
      liveEvents,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, debounced, intent, professors, instructors, catalogue, directory, opportunities, liveEvents, researchers, researchTopic, engageClubs]);

  const searchFailures = useMemo(() => {
    const out = [...failed];
    if (searching && !catalogueLoading && catalogue.size === 0) out.push('MIT subject listing (hydrant.mit.edu)');
    if (searching && !directoryLoading && directory.groups.length === 0 && directory.departments.length === 0) {
      out.push('MIT groups & departments');
    }
    return out;
  }, [failed, searching, catalogueLoading, catalogue.size, directoryLoading, directory]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={syncing} onRefresh={runSync} tintColor={c.accent} />
        }>
        <Brand size={32} style={{ marginBottom: 12 }} />
        <T size={30} weight="700">For you</T>
        <T size={14} tone="dim">
          Talks, research and club events from MIT&apos;s public calendars, and
          faculty who work on what you care about. Ranked on this device.
        </T>

        <Row gap={8} wrap={false} style={{ marginTop: 12 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search professors, courses, clubs, labs, events…"
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              flex: 1,
              backgroundColor: c.cardAlt,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 11,
              color: c.text,
              fontSize: 15,
            }}
          />
          {query ? <Chip label="Clear" onPress={() => setQuery('')} /> : null}
        </Row>
        {!searching ? (
          <T size={11} tone="faint" style={{ marginTop: 6 }}>
            Looks across the checked faculty set, MIT&apos;s subject listing, the
            clubs and labs on calendar.mit.edu, and campus events.
          </T>
        ) : null}

        {searching ? (
          <SearchResults
            query={debounced}
            results={results}
            loading={{
              catalogue: catalogueLoading,
              directory: directoryLoading,
              calendar: liveLoading,
              people: peopleLoading,
              clubs: clubsLoading,
            }}
            failed={searchFailures}
            term={catalogueTerm?.label}
            teachingFor={teachingFor}
          />
        ) : (
          <>
            <Row gap={8} style={{ marginTop: 14 }}>
              <Chip
                label="Events"
                selected={section === 'events'}
                onPress={() => setSection('events')}
              />
              <Chip
                label={`Professors${
                  profile.savedProfessors.length ? ` (${profile.savedProfessors.length}★)` : ''
                }`}
                selected={section === 'people'}
                onPress={() => setSection('people')}
              />
            </Row>

            {section === 'events' ? (
              <>
                <View style={{ marginTop: 12, gap: 10 }}>
                  <DemoBanner what="these events" sources={['outlook', 'mit', 'clubs']} />
                  {campusMuted ? (
                    <Notice tone="warn" title="MIT campus listings are muted">
                      Turn them back on under Settings → What synced to see talks,
                      seminars and club events here.
                    </Notice>
                  ) : campus?.error ? (
                    <Notice tone="danger" title="Couldn't load MIT campus listings">
                      {campus.error}
                    </Notice>
                  ) : campus?.warning ? (
                    <Notice tone="warn" title="One campus feed didn't load">
                      {campus.warning}
                    </Notice>
                  ) : !lastSync ? (
                    <Notice tone="accent" title="Nothing synced yet">
                      Pull down to fetch this month&apos;s talks, seminars, research
                      events and club events from MIT&apos;s public calendars.
                    </Notice>
                  ) : null}
                </View>

                <Row gap={8} style={{ marginTop: 14, marginBottom: 4 }}>
                  <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
                  {KIND_FILTERS.filter((k) => (counts.get(k.kind) ?? 0) > 0 || k.kind === 'urop').map((k) => (
                    <Chip
                      key={k.kind}
                      label={`${k.label}${counts.get(k.kind) ? ` (${counts.get(k.kind)})` : ''}`}
                      selected={filter === k.kind}
                      onPress={() => setFilter(k.kind)}
                    />
                  ))}
                  <Chip
                    label="This week"
                    selected={filter === 'week'}
                    onPress={() => setFilter('week')}
                  />
                  <Chip
                    label={`Saved${saved.length ? ` (${saved.length})` : ''}`}
                    selected={filter === 'saved'}
                    onPress={() => setFilter('saved')}
                  />
                </Row>

                {filter === 'urop' ? (
                  <View
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: c.accentSoft,
                      gap: 6,
                    }}>
                    <T size={13} tone="accent">
                      UROP postings live behind MIT login on ELx and can&apos;t be
                      pulled in here. Most UROPs at MIT start with an email to a
                      PI anyway - the Professors tab lists people whose work
                      matches your interests, with verified contact links.
                    </T>
                    <Chip
                      label="Find a PI →"
                      tone="accent"
                      onPress={() => {
                        setSection('people');
                        setFieldFilter(null);
                      }}
                    />
                  </View>
                ) : null}

                {lastHidden ? (
                  <View
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: c.cardAlt,
                      borderColor: c.border,
                      borderWidth: 1,
                      gap: 8,
                    }}>
                    <T size={13} weight="600">
                      Hidden “{lastHidden.event.title}”
                      {lastHidden.event.organizer ? ` and everything by ${lastHidden.event.organizer}` : ''}
                      .
                    </T>
                    <T size={12} tone="dim">
                      Future meetings of that series won&apos;t come back either.
                    </T>
                    <Row gap={8}>
                      {lastHidden.theme ? (
                        <Chip
                          label={`Also hide all ${themeLabel(lastHidden.theme)} events`}
                          tone="warn"
                          onPress={() => {
                            muteTheme(lastHidden.theme!);
                            setLastHidden(null);
                          }}
                        />
                      ) : null}
                      <Chip
                        label="Undo"
                        onPress={() => {
                          unhide({
                            eventId: lastHidden.event.id,
                            host: lastHidden.event.organizer,
                            series: seriesKey(lastHidden.event.title),
                          });
                          setLastHidden(null);
                        }}
                      />
                      <Chip label="OK" onPress={() => setLastHidden(null)} />
                    </Row>
                  </View>
                ) : null}

                {visible.length === 0 && inCase.length === 0 ? (
                  <Empty
                    title={filter === 'saved' ? 'Nothing saved yet' : `No ${filter === 'all' || filter === 'week' ? 'events' : KIND_LABELS[filter].toLowerCase() + 's'} matched`}
                    detail={
                      filter === 'saved'
                        ? 'Star an event and it shows up here.'
                        : hidden.length
                          ? 'Everything in this category scored below your interest bar - see below.'
                          : 'Widen your interests in Settings, or pull to re-sync.'
                    }
                  />
                ) : (
                  <View style={{ marginTop: 10 }}>
                    {visible.length === 0 && filter !== 'saved' ? (
                      <T size={13} tone="faint" style={{ paddingHorizontal: 4, paddingBottom: 8 }}>
                        Nothing here matches your interests, people or classes directly.
                      </T>
                    ) : null}
                    {visible.map((e) => (
                      <OpportunityCard
                        key={e.id}
                        event={e}
                        saved={profile.feedback.saved.includes(e.id)}
                        onSave={() => saveEvent(e.id)}
                        onDismiss={() => handleDismiss(e)}
                      />
                    ))}
                  </View>
                )}

                {inCase.length > 0 && filter !== 'saved' && filter !== 'week' ? (
                  <View>
                    <SectionHeader
                      title="In case you're curious"
                      detail="Nothing you said matched these - only a category you rank. A few, not the lot. Not for me hides the host for good."
                    />
                    <View style={{ opacity: 0.8 }}>
                      {inCase.map((e) => (
                        <OpportunityCard
                          key={e.id}
                          event={e}
                          saved={profile.feedback.saved.includes(e.id)}
                          onSave={() => saveEvent(e.id)}
                          onDismiss={() => handleDismiss(e)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {filter === 'urop' && researchPrograms.length > 0 ? (
                  <View>
                    <SectionHeader
                      title="Research programs & funding"
                      detail="Curated starter set with deadlines. Save one and it lands on your Due list."
                    />
                    {researchPrograms.map((p) => (
                      <PostingCard
                        key={p.id}
                        posting={p}
                        saved={savedPostingIds.has(p.id)}
                        onSave={() => togglePostingSaved(p)}
                      />
                    ))}
                  </View>
                ) : null}

                {hidden.length > 0 && filter !== 'saved' && filter !== 'week' ? (
                  <View>
                    <SectionHeader
                      title={`${hidden.length} filtered out`}
                      detail="Below your interest threshold. Nothing is deleted."
                    />
                    <Chip
                      label={showHidden ? 'Hide these again' : 'Show me anyway'}
                      onPress={() => setShowHidden((v) => !v)}
                    />
                    {showHidden ? (
                      <View style={{ marginTop: 12, opacity: 0.65 }}>
                        {hidden.map((e) => (
                          <OpportunityCard
                            key={e.id}
                            event={e}
                            saved={profile.feedback.saved.includes(e.id)}
                            onSave={() => saveEvent(e.id)}
                            onDismiss={() => handleDismiss(e)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <SectionHeader
                  title="Faculty for your interests"
                  detail={
                    profile.fields.length
                      ? `${matchedCount} of ${PROFESSORS.length} match your interests, classes, or follows.`
                      : 'Add interests in Settings and the best matches float to the top.'
                  }
                />

                <Row gap={8} style={{ marginBottom: 8 }}>
                  <Chip
                    label="Best matches"
                    selected={profView === 'ranked'}
                    onPress={() => setProfView('ranked')}
                  />
                  <Chip
                    label="By lab"
                    selected={profView === 'lab'}
                    onPress={() => setProfView('lab')}
                  />
                  <View style={{ flex: 1 }} />
                  {catalogueLoading && catalogue.size === 0 ? (
                    <T size={11} tone="faint">loading subject listing…</T>
                  ) : catalogueTerm ? (
                    <T size={11} tone="faint">teaching: {catalogueTerm.label}</T>
                  ) : null}
                </Row>

                <Row gap={8} style={{ marginBottom: 10 }}>
                  <Chip
                    label="All fields"
                    selected={fieldFilter === null}
                    onPress={() => setFieldFilter(null)}
                  />
                  {profile.fields.map((f) => (
                    <Chip
                      key={f}
                      label={f}
                      selected={fieldFilter === f}
                      onPress={() => setFieldFilter(fieldFilter === f ? null : f)}
                    />
                  ))}
                  <Chip
                    label={`Saved${
                      profile.savedProfessors.length ? ` (${profile.savedProfessors.length})` : ''
                    }`}
                    selected={fieldFilter === 'saved'}
                    onPress={() => setFieldFilter(fieldFilter === 'saved' ? null : 'saved')}
                  />
                </Row>

                {visibleProfs.length === 0 ? (
                  <Empty
                    title={fieldFilter === 'saved' ? 'No starred professors yet' : 'Nobody listed for that yet'}
                    detail={
                      fieldFilter === 'saved'
                        ? 'Star a professor and they show up here.'
                        : 'The set is curated and grows - try a broader field, or search above.'
                    }
                  />
                ) : profView === 'lab' ? (
                  byLab.slice(0, showAllProfs ? undefined : 6).map(([lab, profs]) => (
                    <View key={lab}>
                      <SectionHeader
                        title={lab}
                        detail={`${profs.length} ${profs.length === 1 ? 'person' : 'people'}${
                          profs.some((p) => p.score > 0) ? ' · matches your interests' : ''
                        }`}
                      />
                      {profs.map((prof) => (
                        <ProfessorCard
                          key={prof.id}
                          prof={prof}
                          saved={profile.savedProfessors.includes(prof.id)}
                          onSave={() => toggleProf(prof.id)}
                          teachingNow={teachingFor(prof)}
                          term={catalogueTerm?.label}
                        />
                      ))}
                    </View>
                  ))
                ) : fieldDept ? (
                  <>
                    <SectionHeader
                      title={`In ${fieldDept.info.name}`}
                      detail={`${inDept.length} in our checked set. Search “${fieldFilter} professors” for everyone teaching there this term.`}
                    />
                    {inDept.map((prof) => (
                      <ProfessorCard
                        key={prof.id}
                        prof={prof}
                        saved={profile.savedProfessors.includes(prof.id)}
                        onSave={() => toggleProf(prof.id)}
                        teachingNow={teachingFor(prof)}
                        term={catalogueTerm?.label}
                      />
                    ))}
                    {alsoWorkOn.length ? (
                      <>
                        <SectionHeader
                          title={`Also work on ${fieldFilter}`}
                          detail="In other departments, listing it as a research area."
                        />
                        {alsoWorkOn.slice(0, showAllProfs ? undefined : 4).map((prof) => (
                          <ProfessorCard
                            key={prof.id}
                            prof={prof}
                            saved={profile.savedProfessors.includes(prof.id)}
                            onSave={() => toggleProf(prof.id)}
                            teachingNow={teachingFor(prof)}
                            term={catalogueTerm?.label}
                          />
                        ))}
                      </>
                    ) : null}
                  </>
                ) : (
                  visibleProfs
                    .slice(0, showAllProfs ? undefined : 8)
                    .map((prof) => (
                      <ProfessorCard
                        key={prof.id}
                        prof={prof}
                        saved={profile.savedProfessors.includes(prof.id)}
                        onSave={() => toggleProf(prof.id)}
                        teachingNow={teachingFor(prof)}
                        term={catalogueTerm?.label}
                      />
                    ))
                )}
                {!showAllProfs &&
                (profView === 'lab'
                  ? byLab.length > 6
                  : fieldDept
                    ? alsoWorkOn.length > 4
                    : visibleProfs.length > 8) ? (
                  <Chip
                    label={
                      profView === 'lab'
                        ? `Show ${byLab.length - 6} more labs`
                        : fieldDept
                          ? `Show ${alsoWorkOn.length - 4} more`
                          : `Show ${visibleProfs.length - 8} more`
                    }
                    onPress={() => setShowAllProfs(true)}
                  />
                ) : null}

                <T size={11} tone="faint" style={{ marginTop: 14, textAlign: 'center' }}>
                  Public directory information. Homepages are checked to resolve;
                  an email appears only when the professor publishes it on their
                  own page; LinkedIn and Scholar open searches, never guessed
                  profiles. &quot;Teaching&quot; comes live from MIT&apos;s subject
                  listing. Whether a lab is taking students changes weekly - email
                  and ask.
                </T>
              </>
            )}
          </>
        )}
      </ScrollView>
      <AssistantButton />
    </SafeAreaView>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: 'accent' | 'warn' | 'danger';
  title: string;
  children: React.ReactNode;
}) {
  const c = useTheme();
  const colors = {
    accent: { bg: c.accentSoft, border: c.accent },
    warn: { bg: c.warnSoft, border: c.warn },
    danger: { bg: c.dangerSoft, border: c.danger },
  }[tone];
  return (
    <View
      style={{
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        gap: 3,
      }}>
      <T size={13} weight="700" tone={tone}>{title}</T>
      <T size={12} tone={tone}>{children}</T>
    </View>
  );
}
