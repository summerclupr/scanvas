/**
 * The "Due" tab - the obligation lane, chronologically.
 *
 * Restored alongside Plan because the two answer different questions and
 * students want both: Plan says "what should I work on right now", Due says
 * "what do I owe and when". Same data, and the grouping by urgency band is
 * how deadlines actually feel - "this week" is a unit of dread.
 *
 * Nothing here is interest-filtered. The only things hidden are classes you
 * unticked in Settings, and that's reported at the bottom rather than silent.
 */

import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ObligationCard } from '@/components/event-card';
import { DemoBanner } from '@/components/demo-banner';
import { Empty, Row, SectionHeader, T, useTheme } from '@/components/kit';
import { Brand } from '@/components/logo';
import { hoursUntil } from '@/core/datetime';
import type { ScoredEvent } from '@/core/types';
import { isAttendanceWork } from '@/core/attendance';
import { AssistantButton } from '@/components/assistant';
import { useApp } from '@/state/app-store';

/** Class meetings belong on the Calendar, not in a list of things you owe. */
const ROUTINE = new Set(['lecture', 'recitation', 'office_hours']);

/** Submission states that mean you no longer owe this. */
const DONE = new Set(['submitted', 'graded', 'pending_review', 'excused']);
// 'missing' is deliberately NOT here: Canvas marks swept, never-submitted work
// as missing, and hiding it made overdue psets silently disappear from Due -
// the user saw 'Pset 4' with no trace of the overdue 2 and 3. Missing work is
// overdue work you can still often submit late; only GRADES treat it as a 0.

function SyncBanner() {
  const c = useTheme();
  const { syncing, progress, ollamaStatus, lastSync } = useApp();

  if (syncing) {
    const pct =
      progress?.extractTotal && progress.extracted !== undefined
        ? progress.extracted / progress.extractTotal
        : null;
    return (
      <View style={{ backgroundColor: c.accentSoft, padding: 12, borderRadius: 12, gap: 8 }}>
        <T size={13} tone="accent" weight="600">{progress?.message ?? 'Syncing...'}</T>
        {pct !== null ? (
          <View style={{ height: 3, backgroundColor: c.border, borderRadius: 2 }}>
            <View
              style={{
                width: `${Math.round(pct * 100)}%`,
                height: '100%',
                backgroundColor: c.accent,
                borderRadius: 2,
              }}
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (ollamaStatus.checked && !ollamaStatus.reachable) {
    return (
      <View style={{ backgroundColor: c.warnSoft, padding: 12, borderRadius: 12 }}>
        <T size={13} tone="warn" weight="600">Local model offline</T>
        <T size={12} tone="warn">
          Canvas and calendar still sync. Mailing-list events need Ollama running.
        </T>
      </View>
    );
  }

  if (!lastSync) return null;
  return (
    <T size={12} tone="faint">
      Last synced{' '}
      {new Date(lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      {' '}· everything stayed on this device
    </T>
  );
}

export default function DueScreen() {
  const c = useTheme();
  const { agenda, syncing, runSync, notifications, hiddenByCourse, courseFilterStale } =
    useApp();

  const { overdue, today, week, later } = useMemo(() => {
    const obligations = agenda.filter(
      (e) =>
        e.lane === 'obligation' &&
        !ROUTINE.has(e.kind) &&
        !DONE.has(e.submission?.state ?? '') &&
        // PE attendance points show up in Work, not as things you owe.
        !isAttendanceWork(e),
    );
    const bucket = (lo: number, hi: number) =>
      obligations.filter((e) => {
        const h = hoursUntil(e.start);
        return h >= lo && h < hi;
      });
    return {
      overdue: obligations.filter((e) => hoursUntil(e.start) < 0),
      today: bucket(0, 24),
      week: bucket(24, 24 * 7),
      later: obligations.filter((e) => hoursUntil(e.start) >= 24 * 7),
    };
  }, [agenda]);

  const total = overdue.length + today.length + week.length + later.length;

  const section = (title: string, items: ScoredEvent[], detail?: string) =>
    items.length > 0 ? (
      <View key={title}>
        <SectionHeader title={title} detail={detail} />
        {items.map((e) => (
          <ObligationCard key={e.id} event={e} />
        ))}
      </View>
    ) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={syncing} onRefresh={runSync} tintColor={c.accent} />
        }>
        <Brand size={32} style={{ marginBottom: 12 }} />
        <Row wrap={false} style={{ marginBottom: 4 }}>
          <View style={{ flex: 1 }}>
            <T size={30} weight="700">Due</T>
            <T size={14} tone="dim">
              {total === 0
                ? 'Nothing outstanding'
                : `${total} thing${total === 1 ? '' : 's'} you owe`}
              {notifications.scheduled > 0
                ? ` · ${notifications.scheduled} reminders set`
                : ''}
            </T>
          </View>
        </Row>

        <View style={{ marginTop: 12, gap: 10 }}>
          <DemoBanner what="your deadlines" sources={['canvas']} />
          <SyncBanner />
        </View>

        {total === 0 ? (
          <Empty
            title="You're clear"
            detail="No psets or exams in the next three weeks. Pull down to re-sync."
          />
        ) : (
          <>
            {section('Overdue', overdue)}
            {section('Next 24 hours', today)}
            {section('This week', week)}
            {section('Later', later, 'Exams warn a week out')}
          </>
        )}

        {courseFilterStale ? (
          <View
            style={{
              marginTop: 18,
              padding: 12,
              borderRadius: 12,
              backgroundColor: c.warnSoft,
              borderColor: c.warn,
              borderWidth: 1,
            }}>
            <T size={13} weight="700" tone="warn">Class list is out of date</T>
            <T size={12} tone="warn">
              None of your ticked classes match what just synced, so nothing is
              being filtered. Pick your classes again in Settings.
            </T>
          </View>
        ) : null}

        {hiddenByCourse > 0 ? (
          <T size={12} tone="faint" style={{ marginTop: 20, textAlign: 'center' }}>
            {hiddenByCourse} item{hiddenByCourse === 1 ? '' : 's'} hidden from
            classes you unticked in Settings
          </T>
        ) : null}
      </ScrollView>
      <AssistantButton />
    </SafeAreaView>
  );
}
