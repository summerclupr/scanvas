/**
 * The Plan tab: what to actually do, in order, day by day.
 *
 * Sits beside Due rather than replacing it: Due says what you owe and when,
 * Plan says what to work on and which day. Each day card carries three
 * things - what's DUE that day, what's ON YOUR SCHEDULE (classes, saved
 * events), and the work sessions planned for it. Work is scheduled to finish
 * the day before its deadline, so a pset due tomorrow night shows up today.
 */

import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Chip, Divider, Empty, Row, SectionHeader, T, useTheme } from '@/components/kit';
import { Brand } from '@/components/logo';
import { DemoBanner } from '@/components/demo-banner';
import { AssistantButton } from '@/components/assistant';
import type { ScoredEvent } from '@/core/types';
import { PLAN_PRESETS } from '@/plan/priority';
import type { WorkSession, DayPlan } from '@/plan/schedule';
import type { Suggestion } from '@/plan/suggest';
import { relativeLabel } from '@/core/datetime';
import { Linking } from 'react-native';
import { useApp } from '@/state/app-store';

/** What each preset adds to the day cards, in the user's terms. */
const PRESET_ADDS: Record<string, string> = {
  coursework: 'Suggests nothing beyond your work.',
  balanced: 'Suggests one strong event match a day, and an application when a company you follow has one open.',
  internships: 'Adds application prompts across the week - postings you follow or that fit - plus a strong event match.',
  social: 'Suggests up to three club, social and talk events a day that match you. Tap Go to put one on your schedule.',
};

/** Applications read as tasks, not as an event title: "Work on" until the target day, then "Submit". */
function sessionTitle(session: WorkSession): string {
  const ev = session.event;
  if (ev.kind !== 'application_deadline') return ev.title;
  return session.isDueDay ? `Submit application: ${ev.title}` : `Work on application: ${ev.title}`;
}

function dueTitle(ev: ScoredEvent): string {
  if (ev.kind !== 'application_deadline') return ev.title;
  return `${ev.tags.includes('self-set target') ? 'Target: submit' : 'Submit'} ${ev.title}`;
}

function clock(ev: ScoredEvent): string {
  return ev.allDay
    ? 'all day'
    : new Date(ev.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * The deadline as a day and time ("due Sun 11:59 PM"), never a relative
 * word: "due tomorrow" is true on today's card and wrong on tomorrow's.
 */
function dueLabel(ev: ScoredEvent): string {
  const d = new Date(ev.start);
  const daysOut = (d.getTime() - Date.now()) / 86400_000;
  const day = d.toLocaleDateString('en-US', daysOut < 6 ? { weekday: 'short' } : { month: 'short', day: 'numeric' });
  return ev.allDay ? `due ${day}` : `due ${day} ${clock(ev)}`;
}

/**
 * The chip on a session says how the day relates to the deadline: "due" on
 * the due day itself, "due next day" the day before, otherwise "work
 * session" with the deadline spelled out underneath. Deliberately no
 * "today"/"tomorrow" wording - those read relative to now, and the same chip
 * sits on cards for other days.
 */
function dueChip(session: WorkSession): { label: string; tone: 'danger' | 'warn' | 'accent' } {
  if (session.isDueDay) return { label: 'due', tone: 'danger' };
  if (session.daysBeforeDue === 1) return { label: 'due next day', tone: 'warn' };
  return { label: 'work session', tone: 'accent' };
}

function SessionRow({
  session,
  onToggle,
}: {
  session: WorkSession;
  onToggle: () => void;
}) {
  const c = useTheme();
  const ev = session.event;
  const done = session.done;
  const chip = dueChip(session);

  return (
    <Row gap={10} wrap={false} style={{ paddingVertical: 9, opacity: done ? 0.45 : 1 }}>
      <Pressable onPress={onToggle} hitSlop={8}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: done ? c.good : c.border,
            backgroundColor: done ? c.good : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {done ? <T size={12} style={{ color: '#FFFFFF' }}>✓</T> : null}
        </View>
      </Pressable>

      <View style={{ flex: 1 }}>
        <Row gap={6}>
          {ev.course ? <Chip label={ev.course.code} /> : null}
          <Chip label={chip.label} tone={chip.tone} />
          <View style={{ flex: 1 }} />
          <T size={12} tone="faint">~{session.hours.toFixed(1)}h</T>
        </Row>
        <T
          size={15}
          weight="600"
          style={done ? { textDecorationLine: 'line-through' } : undefined}>
          {sessionTitle(session)}
        </T>
        <T size={12} tone="faint">
          {session.why.join(' · ')}
          {!session.isDueDay ? ` · ${dueLabel(ev)}` : ''}
          {ev.tags.includes('self-set target') ? ' · your own target' : ''}
        </T>
      </View>
    </Row>
  );
}

function SuggestionRow({ s }: { s: Suggestion }) {
  const c = useTheme();
  const { profile, saveEvent, dismissEvent, savedPostings, togglePostingSaved } = useApp();
  if (s.kind === 'event') {
    const e = s.event;
    return (
      <View style={{ paddingVertical: 6, gap: 4 }}>
        <Row gap={8} wrap={false}>
          <T size={12} tone="dim" style={{ minWidth: 62 }}>{clock(e)}</T>
          <View style={{ flex: 1 }}>
            <T size={13} weight="600" numberOfLines={2}>{e.title}</T>
            <T size={11} tone="faint" numberOfLines={1}>
              {[e.organizer, e.location, s.why].filter(Boolean).join(' · ')}
            </T>
          </View>
        </Row>
        <Row gap={6} style={{ paddingLeft: 70 }}>
          <Chip label="☆ Go" tone="accent" onPress={() => saveEvent(e.id)} />
          <Chip label="Not for me" onPress={() => dismissEvent(e.id)} />
          {e.sourceUrl ? <Chip label="Open →" onPress={() => Linking.openURL(e.sourceUrl!)} /> : null}
        </Row>
      </View>
    );
  }
  const p = s.posting;
  const saved = savedPostings.some((x) => x.id === p.id);
  return (
    <View style={{ paddingVertical: 6, gap: 4 }}>
      <Row gap={8} wrap={false}>
        <T size={12} tone="dim" style={{ minWidth: 62 }}>apply</T>
        <View style={{ flex: 1 }}>
          <T size={13} weight="600" numberOfLines={2}>
            {p.company} — {p.title}
          </T>
          <T size={11} tone="faint" numberOfLines={1}>
            {[p.deadline ? `closes ${relativeLabel(p.deadline)}` : 'rolling', s.why].join(' · ')}
          </T>
        </View>
      </Row>
      <Row gap={6} style={{ paddingLeft: 70 }}>
        <Chip
          label={saved ? '★ Planned' : '☆ Plan this application'}
          tone="accent"
          selected={saved}
          onPress={() => togglePostingSaved(p)}
        />
        <Chip label="Open →" onPress={() => Linking.openURL(p.applyUrl ?? p.url)} />
      </Row>
      {profile.planPreset === 'internships' && !saved ? null : null}
      <View style={{ height: 0, borderBottomWidth: 0, borderColor: c.border }} />
    </View>
  );
}

function DayCard({
  day,
  index,
  onToggle,
  suggestions,
}: {
  day: DayPlan;
  index: number;
  onToggle: (id: string, hours: number) => void;
  suggestions: Suggestion[];
}) {
  const c = useTheme();
  const label =
    index === 0
      ? 'Today'
      : index === 1
        ? 'Tomorrow'
        : day.date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          });
  const doneCount = day.sessions.filter((s) => s.done).length;

  if (
    day.sessions.length === 0 &&
    day.commitments.length === 0 &&
    day.due.length === 0 &&
    suggestions.length === 0
  ) {
    return null;
  }

  return (
    <Card style={{ marginBottom: 10 }}>
      <Row wrap={false}>
        <View style={{ flex: 1 }}>
          <T size={16} weight="700" tone={index === 0 ? 'accent' : 'default'}>
            {label}
          </T>
          <T size={12} tone={day.over ? 'warn' : 'faint'}>
            {day.plannedHours.toFixed(1)}h planned of {day.capacityHours.toFixed(1)}h
            {doneCount ? ` · ${doneCount} done` : ''}
            {day.over ? ' · over budget' : ''}
          </T>
        </View>
      </Row>

      {day.due.length > 0 ? (
        <View style={{ marginTop: 8, gap: 4 }}>
          <T size={11} weight="700" tone="danger" style={{ letterSpacing: 0.6 }}>
            DUE
          </T>
          {day.due.map((e) => (
            <Row key={e.id} gap={8} wrap={false}>
              <T size={12} tone="dim" style={{ minWidth: 62 }}>{clock(e)}</T>
              {e.course ? <Chip label={e.course.code} /> : null}
              <T size={13} style={{ flex: 1 }} numberOfLines={1}>
                {dueTitle(e)}
              </T>
            </Row>
          ))}
        </View>
      ) : null}

      {day.commitments.length > 0 ? (
        <View style={{ marginTop: 8, gap: 4 }}>
          <T size={11} weight="700" tone="faint" style={{ letterSpacing: 0.6 }}>
            ON YOUR SCHEDULE
          </T>
          {day.commitments.map((e) => (
            <Row key={e.id} gap={8} wrap={false}>
              <T size={12} tone="dim" style={{ minWidth: 62 }}>{clock(e)}</T>
              <T size={13} style={{ flex: 1 }} numberOfLines={1}>
                {e.title}
              </T>
              {e.location ? (
                <T size={12} tone="faint">{e.location}</T>
              ) : null}
            </Row>
          ))}
        </View>
      ) : null}

      {day.sessions.length > 0 ? (
        <>
          <View style={{ marginTop: 8 }}>
            <Divider />
          </View>
          <T size={11} weight="700" tone="faint" style={{ letterSpacing: 0.6, marginTop: 8 }}>
            WORK ON
          </T>
        </>
      ) : null}
      {day.sessions.map((s) => (
        <SessionRow key={s.id} session={s} onToggle={() => onToggle(s.id, s.hours)} />
      ))}

      {suggestions.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Divider />
          <T size={11} weight="700" tone="good" style={{ letterSpacing: 0.6, marginTop: 8 }}>
            SUGGESTED{' '}
            <T size={11} tone="faint">· from your plan style, not counted against the day</T>
          </T>
          {suggestions.map((s) => (
            <SuggestionRow key={s.kind === 'event' ? s.event.id : s.posting.id} s={s} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export default function PlanScreen() {
  const c = useTheme();
  const { schedule, suggestions, toggleSession, profile, updateProfile, syncing, runSync } = useApp();
  const [showDays, setShowDays] = useState(7);

  const applyPreset = (key: string) => {
    const preset = PLAN_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    updateProfile({ planPreset: key, planWeights: preset.weights });
  };

  const cap = profile.capacity ?? { hoursPerDay: 4, maxItemsPerDay: 4 };
  const today = schedule.days[0];
  const openToday = today?.sessions.filter((s) => !s.done).length ?? 0;
  const totalPlanned = schedule.days
    .slice(0, showDays)
    .reduce((n, d) => n + d.sessions.filter((s) => !s.done).reduce((m, s) => m + s.hours, 0), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshControl={
          <RefreshControl refreshing={syncing} onRefresh={runSync} tintColor={c.accent} />
        }>
        <Brand size={32} style={{ marginBottom: 12 }} />
        <T size={30} weight="700">Plan</T>
        <T size={14} tone="dim">
          {openToday
            ? `${openToday} to do today · ${totalPlanned.toFixed(1)}h left over ${showDays} days`
            : totalPlanned > 0
              ? `Nothing more today · ${totalPlanned.toFixed(1)}h planned over ${showDays} days`
              : 'Nothing scheduled'}
        </T>

        <View style={{ marginTop: 12 }}>
          <DemoBanner what="this plan" sources={['canvas']} />
        </View>

        <SectionHeader title="What matters to you" detail="Reorders everything below." />
        <Card>
          <Row gap={8}>
            {PLAN_PRESETS.map((p) => (
              <Chip
                key={p.key}
                label={p.label}
                selected={profile.planPreset === p.key}
                onPress={() => applyPreset(p.key)}
              />
            ))}
          </Row>
          <T size={12} tone="faint" style={{ marginTop: 8 }}>
            {PLAN_PRESETS.find((p) => p.key === profile.planPreset)?.blurb ??
              'Custom weighting'}
            . {PRESET_ADDS[profile.planPreset] ?? ''} An exam inside 24 hours always pins to the
            top regardless.
          </T>

          <Divider />
          <T size={13} weight="600" tone="dim" style={{ marginTop: 10 }}>
            How much work fits in a day
          </T>
          <Row gap={6} style={{ marginTop: 6 }}>
            {[2, 3, 4, 5, 6, 8].map((h) => (
              <Chip
                key={h}
                label={`${h}h`}
                selected={cap.hoursPerDay === h}
                onPress={() => updateProfile({ capacity: { ...cap, hoursPerDay: h } })}
              />
            ))}
          </Row>
          <Row gap={6} style={{ marginTop: 6 }}>
            {[2, 3, 4, 5, 6].map((n) => (
              <Chip
                key={n}
                label={`${n} items`}
                selected={cap.maxItemsPerDay === n}
                onPress={() => updateProfile({ capacity: { ...cap, maxItemsPerDay: n } })}
              />
            ))}
          </Row>
          <T size={11} tone="faint" style={{ marginTop: 8 }}>
            Work is planned to finish the day before it&apos;s due, so something
            due tomorrow night shows up today. Big assignments are split into
            sessions. Tick a session when it&apos;s done; anything you don&apos;t
            tick rolls forward to the next day.
          </T>
        </Card>

        {schedule.unplaced.length > 0 ? (
          <View
            style={{
              backgroundColor: c.warnSoft,
              borderColor: c.warn,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              marginTop: 16,
            }}>
            <T size={13} weight="700" tone="warn">
              {schedule.unplaced.length} thing
              {schedule.unplaced.length === 1 ? "" : "s"} won&apos;t fit
            </T>
            {schedule.unplaced.slice(0, 3).map((u, i) => (
              <T key={i} size={12} tone="warn">
                {u.event.title} — {u.hours.toFixed(1)}h more needed, {u.reason}
              </T>
            ))}
            <T size={12} tone="warn" style={{ marginTop: 4 }}>
              Raise your daily budget above, or accept that something slips.
            </T>
          </View>
        ) : null}

        <SectionHeader title="Your days" />
        {schedule.days.slice(0, showDays).map((d, i) => (
          <DayCard
            key={d.day}
            day={d}
            index={i}
            onToggle={toggleSession}
            suggestions={suggestions.get(d.day) ?? []}
          />
        ))}

        {showDays < schedule.days.length ? (
          <Chip label="Show two weeks" onPress={() => setShowDays(14)} />
        ) : null}

        {schedule.days
          .slice(0, showDays)
          .every((d) => d.sessions.length === 0 && d.due.length === 0) ? (
          <Empty
            title="Nothing to plan"
            detail="Connect Canvas or pull to re-sync."
          />
        ) : null}
      </ScrollView>
      <AssistantButton />
    </SafeAreaView>
  );
}
