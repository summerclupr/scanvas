/**
 * The event card, in both lanes.
 *
 * An obligation card leads with time pressure and the course. An opportunity
 * card leads with why it was surfaced - the score breakdown is expandable, and
 * that's deliberate: a filter that can't explain itself is one students stop
 * trusting the first time it hides something they wanted.
 */

import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { KIND_LABELS, SOURCE_LABELS, type ScoredEvent } from '../core/types';
import { hoursUntil, relativeLabel } from '../core/datetime';
import { Card, Chip, Meter, Row, T, useTheme } from './kit';

function timeRange(ev: ScoredEvent): string {
  const start = new Date(ev.start);
  if (ev.allDay) {
    return start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return ev.end ? `${day}, ${fmt(start)}-${fmt(new Date(ev.end))}` : `${day}, ${fmt(start)}`;
}

export function ObligationCard({ event }: { event: ScoredEvent }) {
  const c = useTheme();
  const isExam = event.kind === 'exam' || event.kind === 'quiz';
  const h = hoursUntil(event.start);
  const critical = h < 24;
  const tone = isExam ? 'danger' : critical ? 'warn' : 'accent';
  const accent = { danger: c.danger, warn: c.warn, accent: c.accent }[tone];

  return (
    <Card style={{ borderLeftWidth: 3, borderLeftColor: accent, marginBottom: 10 }}>
      <Row gap={8} style={{ marginBottom: 6 }}>
        <Chip label={KIND_LABELS[event.kind]} tone={isExam ? 'danger' : 'warn'} />
        {event.course ? <Chip label={event.course.code} /> : null}
        <View style={{ flex: 1 }} />
        <T size={13} weight="700" tone={critical ? 'danger' : 'dim'}>
          {relativeLabel(event.start)}
        </T>
      </Row>

      <T size={16} weight="600">{event.title}</T>

      <Row gap={6} style={{ marginTop: 4 }}>
        <T size={13} tone="faint">{timeRange(event)}</T>
        {event.location ? <T size={13} tone="faint">· {event.location}</T> : null}
      </Row>

      <View style={{ marginTop: 10 }}>
        <Meter value={event.urgency} tone={tone === 'accent' ? 'accent' : tone} />
      </View>

      {event.sourceUrl ? (
        <Pressable
          onPress={() => Linking.openURL(event.sourceUrl!)}
          style={{ marginTop: 10 }}>
          <T size={13} tone="accent" weight="600">
            {/* "Open in Added by you" reads like a bug; manual items are
                saved applications, so name the action instead. */}
            {event.source === 'manual'
              ? 'Open application →'
              : `Open in ${SOURCE_LABELS[event.source]} →`}
          </T>
        </Pressable>
      ) : null}
    </Card>
  );
}

export function OpportunityCard({
  event,
  saved,
  onSave,
  onDismiss,
}: {
  event: ScoredEvent;
  saved?: boolean;
  onSave?: () => void;
  onDismiss?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const c = useTheme();

  return (
    <Card style={{ marginBottom: 10 }}>
      <Row gap={8} style={{ marginBottom: 6 }}>
        <Chip label={KIND_LABELS[event.kind]} tone="accent" />
        {event.tags.includes('free food') ? <Chip label="free food" tone="good" /> : null}
        <View style={{ flex: 1 }} />
        <T size={13} tone="dim" weight="600">{relativeLabel(event.start)}</T>
      </Row>

      <T size={16} weight="600">{event.title}</T>

      <Row gap={6} style={{ marginTop: 4 }}>
        <T size={13} tone="faint">{timeRange(event)}</T>
        {event.location ? <T size={13} tone="faint">· {event.location}</T> : null}
      </Row>

      {event.organizer ? (
        <T size={13} tone="dim" style={{ marginTop: 4 }}>{event.organizer}</T>
      ) : null}

      {event.rationale ? (
        <View
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            backgroundColor: c.accentSoft,
          }}>
          <T size={13} tone="accent">{event.rationale}</T>
        </View>
      ) : null}

      {event.conflictsWith?.length ? (
        <View
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 10,
            backgroundColor: c.warnSoft,
          }}>
          <T size={13} tone="warn">
            Clashes with {event.conflictsWith[0]}
          </T>
        </View>
      ) : null}

      <View style={{ marginTop: 12, gap: 6 }}>
        <Row gap={8} wrap={false}>
          <View style={{ flex: 1 }}>
            <Meter value={event.score} />
          </View>
          <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8}>
            <T size={12} tone="faint" weight="600">
              {Math.round(event.score * 100)}% match {open ? '▲' : '▼'}
            </T>
          </Pressable>
        </Row>

        {open ? (
          <View style={{ gap: 4, marginTop: 6 }}>
            {event.reasons.map((r, i) => (
              <Row key={i} gap={8} wrap={false}>
                <T
                  size={12}
                  weight="700"
                  tone={r.delta >= 0 ? 'good' : 'danger'}
                  style={{ width: 44 }}>
                  {r.delta >= 0 ? '+' : ''}
                  {Math.round(r.delta * 100)}
                </T>
                <T size={12} tone="dim" style={{ flex: 1 }}>{r.label}</T>
              </Row>
            ))}
            <T size={11} tone="faint" style={{ marginTop: 4 }}>
              From {SOURCE_LABELS[event.source]}
              {event.confidence < 1 ? ` · ${Math.round(event.confidence * 100)}% extraction confidence` : ''}
            </T>
          </View>
        ) : null}
      </View>

      {(onSave || onDismiss) && (
        <Row gap={8} style={{ marginTop: 12 }}>
          {onSave ? (
            <Chip label={saved ? '★ Saved' : '☆ Save'} onPress={onSave} selected={saved} />
          ) : null}
          {onDismiss ? <Chip label="Not for me" onPress={onDismiss} /> : null}
          <View style={{ flex: 1 }} />
          {event.sourceUrl ? (
            <Pressable onPress={() => Linking.openURL(event.sourceUrl!)}>
              <T size={13} tone="accent" weight="600">Open →</T>
            </Pressable>
          ) : null}
        </Row>
      )}
    </Card>
  );
}
