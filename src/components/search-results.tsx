/**
 * Results for the For you search bar, grouped by what was found.
 *
 * Each group says where its data came from, because the sources differ in
 * kind: the curated faculty set is hand-checked; instructors and courses are
 * MIT's own subject listing for this term; clubs and labs are whoever posts
 * to the Institute calendar; events are what's synced plus a live calendar
 * search. Nothing here is generated - every card links to the real page.
 */

import React from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';

import { Card, Chip, Row, SectionHeader, T, useTheme } from './kit';
import { OpportunityCard } from './event-card';
import { ProfessorCard, type RankedProfessor } from './professor-card';
import {
  catalogUrl,
  classUrl,
  collapseCrossListed,
  type HydrantClass,
  type InstructorListing,
} from '../connectors/hydrant';
import { linkedinSearch, mitDirectory, scholarSearch } from '../careers/professors';
import { departmentsFor, looksLikeName, personLookups, type DepartmentInfo, type SeenClub } from '../search';
import type { CalendarHit, DirectoryEntry } from '../search/localist';
import type { Researcher, Topic } from '../search/openalex';
import type { EngageClub } from '../search/engage';
import type { ScoredEvent } from '../core/types';
import { relativeLabel } from '../core/datetime';
import { useApp } from '../state/app-store';

export interface SearchResultSet {
  professors: RankedProfessor[];
  instructors: InstructorListing[];
  /** MIT-affiliated authors from OpenAlex, by name or by topic. */
  researchers: Researcher[];
  /** The OpenAlex topic the researchers were found under, when searched by topic. */
  researchTopic: Topic | null;
  /** A department the query named, with who teaches in it this term. */
  department: (DepartmentInfo & { website?: string; instructors: InstructorListing[] }) | null;
  courses: { primary: HydrantClass; aliases: string[] }[];
  /** Clubs from Engage's full directory (live search). */
  engageClubs: EngageClub[];
  /** Clubs hosting a synced event. */
  seenClubs: SeenClub[];
  groups: DirectoryEntry[];
  departments: DirectoryEntry[];
  events: ScoredEvent[];
  liveEvents: CalendarHit[];
}

function useFollowClub() {
  const { profile, updateProfile } = useApp();
  const following = (name: string) => profile.orgs.some((o) => o.toLowerCase() === name.toLowerCase());
  const toggle = (name: string) =>
    updateProfile({
      orgs: following(name)
        ? profile.orgs.filter((o) => o.toLowerCase() !== name.toLowerCase())
        : [...profile.orgs, name],
    });
  return { following, toggle };
}

function ResearcherCard({ r }: { r: Researcher }) {
  const c = useTheme();
  const since = r.mitYears.length ? Math.min(...r.mitYears) : null;
  return (
    <Card style={{ marginBottom: 10 }}>
      <T size={17} weight="700">{r.name}</T>
      <T size={13} tone="dim">
        MIT-affiliated{since ? ` since ${since}` : ''} · {r.works.toLocaleString()} papers
        {r.hIndex ? ` · h-index ${r.hIndex}` : ''}
      </T>
      {r.topics.length ? (
        <View style={{ marginTop: 8 }}>
          <T size={12} weight="600" tone="good">Research areas</T>
          <Row gap={6} style={{ marginTop: 4 }}>
            {r.topics.slice(0, 5).map((t) => <Chip key={t} label={t} tone="accent" />)}
          </Row>
        </View>
      ) : null}
      <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border, gap: 8 }}>
        <T size={12} tone="faint">
          From OpenAlex&apos;s index of MIT publications - it lists anyone who publishes, students
          and postdocs included, and carries no email. The directory has the address.
        </T>
        <Row gap={8}>
          <Chip label="MIT directory" tone="accent" onPress={() => Linking.openURL(mitDirectory(r.name))} />
          <Chip label="Publications ↗" onPress={() => Linking.openURL(r.openalexUrl)} />
          {r.orcid ? <Chip label="ORCID ↗" onPress={() => Linking.openURL(r.orcid!)} /> : null}
          <Chip label="Scholar ↗" onPress={() => Linking.openURL(scholarSearch(r.name))} />
          <Chip label="LinkedIn ↗" onPress={() => Linking.openURL(linkedinSearch(r.name))} />
        </Row>
      </View>
    </Card>
  );
}

function DepartmentCard({
  dept,
  term,
}: {
  dept: DepartmentInfo & { website?: string; instructors: InstructorListing[] };
  term?: string;
}) {
  const c = useTheme();
  const [showAll, setShowAll] = React.useState(false);
  const shown = showAll ? dept.instructors : dept.instructors.slice(0, 8);
  return (
    <Card style={{ marginBottom: 10 }}>
      <T size={17} weight="700">{dept.name}</T>
      <T size={13} tone="dim">
        {dept.instructors.length} people listed as instructors{term ? ` in ${term}` : ' this term'}
        {' '}(course prefix {dept.prefixes.join(', ')})
      </T>
      <View style={{ marginTop: 8, gap: 4 }}>
        {shown.map((i) => (
          <Row key={i.display} gap={8} wrap={false}>
            <T size={13} weight="600" style={{ minWidth: 120 }}>{i.display}</T>
            <T size={12} tone="dim" style={{ flex: 1 }} numberOfLines={1}>
              {collapseCrossListed(i.classes)
                .slice(0, 3)
                .map((g) => `${g.primary.number} ${g.primary.name}`)
                .join(' · ')}
            </T>
          </Row>
        ))}
        {dept.instructors.length > 8 && !showAll ? (
          <Chip label={`Show ${dept.instructors.length - 8} more`} onPress={() => setShowAll(true)} />
        ) : null}
      </View>
      <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border, gap: 8 }}>
        <T size={12} tone="faint">
          Instructors come from MIT&apos;s subject listing, so research-only faculty and anyone not
          teaching this term are missing. The department&apos;s own site has the full list.
        </T>
        <Row gap={8}>
          {dept.website ? (
            <Chip label="Department website" tone="accent" onPress={() => Linking.openURL(dept.website!)} />
          ) : null}
          <Chip
            label="Faculty list (MIT search) ↗"
            onPress={() =>
              Linking.openURL(`https://web.mit.edu/search/?q=${encodeURIComponent(`${dept.name.replace(/\s*\(.*\)$/, '')} faculty`)}`)
            }
          />
        </Row>
      </View>
    </Card>
  );
}

function EngageClubCard({ club }: { club: EngageClub }) {
  const { following, toggle } = useFollowClub();
  return (
    <Card style={{ marginBottom: 10 }}>
      <Row gap={8} style={{ marginBottom: 4 }}>
        <Chip label={club.category?.replace(/^ASA Student Organization\s*-\s*/i, '') || 'Student group'} tone="accent" />
      </Row>
      <T size={16} weight="600">{club.name}</T>
      {club.mission ? (
        <T size={13} tone="dim" style={{ marginTop: 4 }} numberOfLines={4}>{club.mission}</T>
      ) : null}
      {club.officers.length ? (
        <T size={12} tone="faint" style={{ marginTop: 6 }}>Officers: {club.officers.slice(0, 4).join(', ')}</T>
      ) : null}
      <Row gap={8} style={{ marginTop: 10 }}>
        <Chip
          label={following(club.name) ? '★ Following' : '☆ Follow'}
          selected={following(club.name)}
          onPress={() => toggle(club.name)}
        />
        <View style={{ flex: 1 }} />
        {club.website ? (
          <Pressable onPress={() => Linking.openURL(club.website!)}>
            <T size={13} tone="accent" weight="600">Website</T>
          </Pressable>
        ) : null}
        <Pressable onPress={() => Linking.openURL(club.engageUrl)}>
          <T size={13} tone="accent" weight="600">· Engage →</T>
        </Pressable>
      </Row>
    </Card>
  );
}

function SeenClubCard({ club }: { club: SeenClub }) {
  const { following, toggle } = useFollowClub();
  return (
    <Card style={{ marginBottom: 10 }}>
      <Row gap={8} style={{ marginBottom: 4 }}>
        <Chip label="Hosting events" tone="good" />
      </Row>
      <T size={16} weight="600">{club.name}</T>
      <View style={{ marginTop: 6, gap: 2 }}>
        {club.events.slice(0, 3).map((e) => (
          <Row key={e.id} gap={8} wrap={false}>
            <T size={12} tone="dim" style={{ minWidth: 70 }}>{relativeLabel(e.start)}</T>
            <T size={13} style={{ flex: 1 }} numberOfLines={1}>{e.title}</T>
          </Row>
        ))}
      </View>
      <Row gap={8} style={{ marginTop: 10 }}>
        <Chip
          label={following(club.name) ? '★ Following' : '☆ Follow'}
          selected={following(club.name)}
          onPress={() => toggle(club.name)}
        />
        <T size={11} tone="faint">Following ranks their events first.</T>
      </Row>
    </Card>
  );
}

function when(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (allDay) return day;
  return `${day}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function InstructorCard({ ins, term }: { ins: InstructorListing; term?: string }) {
  const c = useTheme();
  const depts = departmentsFor(ins.classes.map((k) => k.number));
  const searchName = `${ins.display.split(' ').slice(-1)[0]}`;
  return (
    <Card style={{ marginBottom: 10 }}>
      <T size={17} weight="700">{ins.display}</T>
      {depts.length ? <T size={13} tone="dim">{depts.slice(0, 2).join(' · ')}</T> : null}
      <View style={{ marginTop: 8, gap: 2 }}>
        <T size={12} weight="600" tone="good">Teaching {term ?? 'this term'}</T>
        {collapseCrossListed(ins.classes).slice(0, 5).map(({ primary, aliases }) => (
          <Pressable key={primary.number} onPress={() => Linking.openURL(classUrl(primary.number))}>
            <T size={12} tone="dim">
              {primary.number}
              {aliases.length ? ` (also ${aliases.join(', ')})` : ''} · {primary.name}
            </T>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border, gap: 8 }}>
        <T size={12} tone="faint">
          Found in the MIT subject listing, not our checked set - so no verified homepage or
          email here. The directory has the address.
        </T>
        <Row gap={8}>
          <Chip label="MIT directory" tone="accent" onPress={() => Linking.openURL(mitDirectory(searchName))} />
          <Chip label="LinkedIn ↗" onPress={() => Linking.openURL(linkedinSearch(ins.display))} />
          <Chip label="Papers ↗" onPress={() => Linking.openURL(scholarSearch(ins.display))} />
        </Row>
      </View>
    </Card>
  );
}

function CourseCard({ cls, aliases = [] }: { cls: HydrantClass; aliases?: string[] }) {
  const { profile, updateProfile } = useApp();
  const tracked = profile.courses.includes(cls.number);
  const toggle = () =>
    updateProfile({
      courses: tracked
        ? profile.courses.filter((x) => x !== cls.number)
        : [...profile.courses, cls.number].sort(),
    });
  const terms = (cls.terms ?? []).map((t) => ({ FA: 'Fall', SP: 'Spring', IAP: 'IAP', SU: 'Summer' })[t] ?? t);
  return (
    <Card style={{ marginBottom: 10 }}>
      <Row gap={8} style={{ marginBottom: 4 }}>
        <Chip label={cls.number} tone="accent" />
        {aliases.length ? (
          <T size={12} tone="faint">
            also {aliases.length > 3 ? `${aliases.slice(0, 2).join(', ')} +${aliases.length - 2} more` : aliases.join(', ')}
          </T>
        ) : null}
        {cls.level ? <Chip label={cls.level === 'G' ? 'Graduate' : 'Undergraduate'} /> : null}
        {terms.length ? <T size={12} tone="faint">{terms.join(', ')}</T> : null}
      </Row>
      <T size={16} weight="600">{cls.name}</T>
      {cls.inCharge ? <T size={13} tone="dim">{cls.inCharge}</T> : null}
      {cls.description ? (
        <T size={13} tone="dim" style={{ marginTop: 6 }}>{cls.description}</T>
      ) : null}
      <Row gap={8} style={{ marginTop: 10 }}>
        <Chip label={tracked ? '✓ In my classes' : '+ Add to my classes'} selected={tracked} onPress={toggle} />
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => Linking.openURL(classUrl(cls.number))}>
          <T size={13} tone="accent" weight="600">Hydrant</T>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(catalogUrl(cls.number))}>
          <T size={13} tone="accent" weight="600">· Catalog →</T>
        </Pressable>
      </Row>
    </Card>
  );
}

function DirectoryCard({ entry }: { entry: DirectoryEntry }) {
  const { profile, updateProfile } = useApp();
  const following = profile.orgs.some((o) => o.toLowerCase() === entry.name.toLowerCase());
  const toggle = () =>
    updateProfile({
      orgs: following
        ? profile.orgs.filter((o) => o.toLowerCase() !== entry.name.toLowerCase())
        : [...profile.orgs, entry.name],
    });
  return (
    <Card style={{ marginBottom: 10 }}>
      <Row gap={8} style={{ marginBottom: 4 }}>
        <Chip
          label={entry.kind === 'group' ? (entry.type ?? 'Group') : 'Department / lab'}
          tone="accent"
        />
      </Row>
      <T size={16} weight="600">{entry.name}</T>
      {entry.description ? (
        <T size={13} tone="dim" style={{ marginTop: 4 }} numberOfLines={4}>
          {entry.description}
        </T>
      ) : null}
      <Row gap={8} style={{ marginTop: 10 }}>
        <Chip
          label={following ? '★ Following' : '☆ Follow'}
          selected={following}
          onPress={toggle}
        />
        <View style={{ flex: 1 }} />
        {entry.url ? (
          <Pressable onPress={() => Linking.openURL(entry.url!)}>
            <T size={13} tone="accent" weight="600">Website</T>
          </Pressable>
        ) : null}
        <Pressable onPress={() => Linking.openURL(entry.calendarUrl)}>
          <T size={13} tone="accent" weight="600">· Their events →</T>
        </Pressable>
      </Row>
    </Card>
  );
}

function LiveEventCard({ hit }: { hit: CalendarHit }) {
  return (
    <Card style={{ marginBottom: 10 }}>
      <Row gap={8} style={{ marginBottom: 6 }}>
        {hit.types.slice(0, 2).map((t) => <Chip key={t} label={t} tone="accent" />)}
        <View style={{ flex: 1 }} />
        <T size={13} tone="dim" weight="600">{relativeLabel(hit.start)}</T>
      </Row>
      <T size={16} weight="600">{hit.title}</T>
      <Row gap={6} style={{ marginTop: 4 }}>
        <T size={13} tone="faint">{when(hit.start, hit.allDay)}</T>
        {hit.location ? <T size={13} tone="faint">· {hit.location}</T> : null}
      </Row>
      {hit.organizer ? <T size={13} tone="dim" style={{ marginTop: 4 }}>{hit.organizer}</T> : null}
      {hit.description ? (
        <T size={13} tone="dim" style={{ marginTop: 6 }} numberOfLines={3}>{hit.description}</T>
      ) : null}
      <Row gap={8} style={{ marginTop: 10 }}>
        <T size={11} tone="faint" style={{ flex: 1 }}>
          Live from calendar.mit.edu - not synced yet, so it can&apos;t be starred here.
        </T>
        <Pressable onPress={() => Linking.openURL(hit.url)}>
          <T size={13} tone="accent" weight="600">Open →</T>
        </Pressable>
      </Row>
    </Card>
  );
}

export function SearchResults({
  query,
  results,
  loading,
  failed,
  term,
  teachingFor,
}: {
  query: string;
  results: SearchResultSet;
  loading: { catalogue: boolean; directory: boolean; calendar: boolean; people: boolean; clubs: boolean };
  /** Sources that were asked and couldn't answer. */
  failed: string[];
  term?: string;
  teachingFor: (prof: RankedProfessor) => HydrantClass[];
}) {
  const c = useTheme();
  const { profile, updateProfile, saveEvent, dismissEvent } = useApp();
  const total =
    results.professors.length +
    results.instructors.length +
    results.researchers.length +
    (results.department ? 1 : 0) +
    results.courses.length +
    results.engageClubs.length +
    results.seenClubs.length +
    results.groups.length +
    results.departments.length +
    results.events.length +
    results.liveEvents.length;
  const anyLoading = loading.catalogue || loading.directory || loading.calendar || loading.people || loading.clubs;

  const toggleProf = (id: string) =>
    updateProfile({
      savedProfessors: profile.savedProfessors.includes(id)
        ? profile.savedProfessors.filter((x) => x !== id)
        : [...profile.savedProfessors, id],
    });

  return (
    <View style={{ marginTop: 6 }}>
      <Row gap={8} wrap={false} style={{ paddingHorizontal: 4, paddingVertical: 8 }}>
        <T size={13} tone="faint" style={{ flex: 1 }}>
          {total} result{total === 1 ? '' : 's'} for “{query}”
          {anyLoading ? ' · searching MIT…' : ''}
        </T>
        {anyLoading ? <ActivityIndicator size="small" color={c.accent} /> : null}
      </Row>
      {failed.length ? (
        <T size={12} tone="warn" style={{ paddingHorizontal: 4, marginBottom: 6 }}>
          Couldn&apos;t reach: {failed.join(', ')}. Showing what&apos;s cached.
        </T>
      ) : null}

      {results.professors.length || results.instructors.length ? (
        <View>
          <SectionHeader
            title="Professors"
            detail={
              results.instructors.length
                ? 'Checked set first, then anyone listed as an instructor this term.'
                : 'From the checked faculty set - verified pages, no guessed emails.'
            }
          />
          {results.professors.map((p) => (
            <ProfessorCard
              key={p.id}
              prof={p}
              saved={profile.savedProfessors.includes(p.id)}
              onSave={() => toggleProf(p.id)}
              teachingNow={teachingFor(p)}
              term={term}
            />
          ))}
          {results.instructors.map((i) => (
            <InstructorCard key={i.display} ins={i} term={term} />
          ))}
        </View>
      ) : null}

      {results.department ? (
        <View>
          <SectionHeader title="Department" detail="Who teaches in it this term, and where the full faculty list lives." />
          <DepartmentCard dept={results.department} term={term} />
        </View>
      ) : null}

      {results.researchers.length ? (
        <View>
          <SectionHeader
            title={results.researchTopic ? `MIT researchers in ${results.researchTopic.name}` : 'MIT researchers'}
            detail={
              results.researchTopic
                ? 'Most published first, from OpenAlex. Includes students and postdocs, not only faculty.'
                : 'From OpenAlex, filtered to people whose latest papers are from MIT.'
            }
          />
          {results.researchers.map((r) => <ResearcherCard key={r.id} r={r} />)}
        </View>
      ) : null}

      {looksLikeName(query) &&
      results.professors.length === 0 &&
      results.instructors.length === 0 &&
      results.researchers.length === 0 &&
      !loading.people ? (
        <View>
          <SectionHeader title="Professors" />
          <Card style={{ marginBottom: 10 }}>
            <T size={15} weight="600">Nobody called “{query}” in our data</T>
            <T size={13} tone="dim" style={{ marginTop: 6 }}>
              Not in the checked faculty set, and the MIT subject listing doesn&apos;t name them as
              an instructor{term ? ` for ${term}` : ' this term'}. The MIT directory and these
              searches will have them if they&apos;re at MIT - we don&apos;t guess pages or emails.
            </T>
            <Row gap={8} style={{ marginTop: 10 }}>
              {personLookups(query).map((l) => (
                <Chip
                  key={l.label}
                  label={l.label}
                  tone={l.label === 'MIT directory' ? 'accent' : 'default'}
                  onPress={() => Linking.openURL(l.url)}
                />
              ))}
            </Row>
          </Card>
        </View>
      ) : null}

      {results.courses.length ? (
        <View>
          <SectionHeader
            title="Courses"
            detail={`MIT subject listing${term ? `, ${term}` : ''} - number, instructor, catalogue description.`}
          />
          {results.courses.map((g) => (
            <CourseCard key={g.primary.number} cls={g.primary} aliases={g.aliases} />
          ))}
        </View>
      ) : null}

      {results.seenClubs.length || results.engageClubs.length ? (
        <View>
          <SectionHeader
            title="Clubs"
            detail="Clubs with a synced event first, then Engage's directory of every recognised group."
          />
          {results.seenClubs.map((k) => <SeenClubCard key={k.name} club={k} />)}
          {results.engageClubs
            .filter((k) => !results.seenClubs.some((s) => s.name.toLowerCase() === k.name.toLowerCase()))
            .map((k) => <EngageClubCard key={k.id} club={k} />)}
        </View>
      ) : null}

      {results.groups.length ? (
        <View>
          <SectionHeader
            title="Clubs & groups"
            detail="Student groups that post to the Institute calendar, with their own websites."
          />
          {results.groups.map((g) => <DirectoryCard key={g.id} entry={g} />)}
        </View>
      ) : null}

      {results.departments.length ? (
        <View>
          <SectionHeader
            title="Labs & departments"
            detail="Departments, labs and centers, from the Institute calendar's directory."
          />
          {results.departments.map((d) => <DirectoryCard key={d.id} entry={d} />)}
        </View>
      ) : null}

      {results.events.length || results.liveEvents.length ? (
        <View>
          <SectionHeader
            title="Events"
            detail="Synced events first; then a live search of calendar.mit.edu up to three months out."
          />
          {results.events.map((e) => (
            <OpportunityCard
              key={e.id}
              event={e}
              saved={profile.feedback.saved.includes(e.id)}
              onSave={() => saveEvent(e.id)}
              onDismiss={() => dismissEvent(e.id)}
            />
          ))}
          {results.liveEvents
            .filter((h) => !results.events.some((e) => e.title.toLowerCase() === h.title.toLowerCase()))
            .map((h) => <LiveEventCard key={h.id} hit={h} />)}
        </View>
      ) : null}

      {total === 0 && !anyLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center', gap: 6 }}>
          <T size={16} weight="600" tone="dim">Nothing found</T>
          <T size={14} tone="faint" style={{ textAlign: 'center', paddingHorizontal: 24 }}>
            Try a surname, a course number like 18.C06, a club name, or a topic.
          </T>
          <Row gap={8} style={{ marginTop: 10, justifyContent: 'center' }}>
            <Chip
              label="Search Engage clubs ↗"
              onPress={() => Linking.openURL(`https://engage.mit.edu/club_signup?search=${encodeURIComponent(query)}`)}
            />
            <Chip
              label="Search MIT ↗"
              onPress={() => Linking.openURL(`https://web.mit.edu/search/?q=${encodeURIComponent(query)}`)}
            />
          </Row>
        </View>
      ) : null}
    </View>
  );
}
