/**
 * The Calendar tab: month and week views over deadlines.
 *
 * Shows ALL coursework due dates, but only the events and internships you
 * saved. An unfiltered calendar of 4,000 internships and every campus event
 * is wallpaper - the saved ones are what you've committed to caring about.
 *
 * Zoom is month <-> week, with arrows stepping by the visible period, so the
 * same controls move you across months or across weeks depending on where
 * you are.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Card, Chip, Divider, Empty, Row, T, useTheme } from '@/components/kit';
import { Brand } from '@/components/logo';
import { KIND_LABELS, type ScoredEvent } from '@/core/types';
import {
  WEEKDAY_LABELS,
  addMonths,
  addWeeks,
  bucketByDay,
  dayKey,
  dayTones,
  monthGrid,
  monthLabel,
  startOfDay,
  toneOf,
  weekGrid,
  weekLabel,
  type CalendarDay,
  type DayTone,
  type Zoom,
} from '@/plan/calendar';
import { AddEventForm } from '@/components/add-event-form';
import { describeCustom, type CustomEvent } from '@/plan/custom-events';
import { AssistantButton } from '@/components/assistant';
import { useApp } from '@/state/app-store';

function useToneColors() {
  const c = useTheme();
  return {
    exam: c.danger,
    due: c.warn,
    application: c.accent,
    class: c.textFaint,
    event: c.good,
  } as Record<DayTone, string>;
}

function Dots({ items }: { items: ScoredEvent[] }) {
  const colors = useToneColors();
  const tones = dayTones(items);
  if (tones.length === 0) return null;
  return (
    <Row gap={2} wrap={false} style={{ marginTop: 2, justifyContent: 'center' }}>
      {tones.slice(0, 4).map((t) => (
        <View
          key={t}
          style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors[t] }}
        />
      ))}
    </Row>
  );
}

function MonthCell({
  day,
  selected,
  onPress,
  size,
}: {
  day: CalendarDay;
  selected: boolean;
  onPress: () => void;
  size: number;
}) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width: size, alignItems: 'center' }}>
      <View
        style={{
          width: size - 4,
          height: size - 4,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected
            ? c.accent
            : day.isToday
              ? c.accentSoft
              : 'transparent',
        }}>
        <T
          size={13}
          weight={day.isToday || selected ? '700' : '400'}
          style={{
            color: selected
              ? '#FFFFFF'
              : day.inCurrentPeriod
                ? day.isToday
                  ? c.accent
                  : c.text
                : c.textFaint,
          }}>
          {day.date.getDate()}
        </T>
        <Dots items={day.items} />
      </View>
    </Pressable>
  );
}

function EventRow({ ev }: { ev: ScoredEvent }) {
  const c = useTheme();
  const colors = useToneColors();
  const time = ev.allDay
    ? 'all day'
    : new Date(ev.start).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });

  return (
    <Row gap={8} wrap={false} style={{ paddingVertical: 7 }}>
      <View
        style={{
          width: 3,
          alignSelf: 'stretch',
          borderRadius: 2,
          backgroundColor: colors[toneOf(ev)],
        }}
      />
      <View style={{ flex: 1 }}>
        <T size={14} weight="500" numberOfLines={2}>{ev.title}</T>
        <T size={12} tone="faint">
          {time}
          {ev.course ? ` · ${ev.course.code}` : ''}
          {ev.gradeImpact ? ` · ${ev.gradeImpact.toFixed(1)}% of grade` : ''}
          {!ev.course && !ev.gradeImpact ? ` · ${KIND_LABELS[ev.kind]}` : ''}
        </T>
      </View>
    </Row>
  );
}

export default function CalendarScreen() {
  const c = useTheme();
  const toneColors = useToneColors();
  const { width } = useWindowDimensions();
  const {
    calendarItems,
    customEvents,
    saveCustomEvent,
    deleteCustomEvent,
    showClasses,
    setShowClasses,
    showUnsaved,
    setShowUnsaved,
    needsSectionPick,
  } = useApp();
  const [editing, setEditing] = useState<CustomEvent | null>(null);
  const [adding, setAdding] = useState(false);

  const [zoom, setZoom] = useState<Zoom>('month');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<string | null>(() => dayKey(new Date()));

  const byDay = useMemo(() => bucketByDay(calendarItems), [calendarItems]);
  const days = useMemo(
    () => (zoom === 'month' ? monthGrid(anchor, byDay) : weekGrid(anchor, byDay)),
    [zoom, anchor, byDay],
  );

  const step = (n: number) =>
    setAnchor((a) => (zoom === 'month' ? addMonths(a, n) : addWeeks(a, n)));

  const jumpToday = () => {
    const today = startOfDay(new Date());
    setAnchor(today);
    setSelected(dayKey(today));
  };

  // Seven columns must fit INSIDE the card, so subtract both the 16px page
  // padding each side and the card's own 14px padding each side. Getting
  // this wrong by a few pixels wraps the 7th day onto its own row.
  const PAGE_PADDING = 32;
  const CARD_PADDING = 28;
  const cellSize = Math.floor((width - PAGE_PADDING - CARD_PADDING) / 7);

  const selectedDay = days.find((d) => d.key === selected);
  const weekItems = useMemo(
    () => (zoom === 'week' ? days.flatMap((d) => d.items) : []),
    [zoom, days],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Brand size={32} style={{ marginBottom: 12 }} />
        <Row wrap={false}>
          <View style={{ flex: 1 }}>
            <T size={30} weight="700">Calendar</T>
            <T size={13} tone="dim">
              {showUnsaved
                ? 'Coursework, classes, your events, and suggestions'
                : 'Coursework, classes, and what you saved or added'}
            </T>
          </View>
        </Row>

        {/* --- zoom + navigation --- */}
        <Row gap={8} style={{ marginTop: 14, marginBottom: 8 }} wrap={false}>
          <Chip label="Month" selected={zoom === 'month'} onPress={() => setZoom('month')} />
          <Chip label="Week" selected={zoom === 'week'} onPress={() => setZoom('week')} />
          <View style={{ flex: 1 }} />
          <Chip label="Today" onPress={jumpToday} />
        </Row>
        <Row gap={8} style={{ marginBottom: 10 }}>
          <Chip
            label={showClasses ? 'Classes shown' : 'Classes hidden'}
            selected={showClasses}
            onPress={() => setShowClasses(!showClasses)}
          />
          <Chip
            label={showUnsaved ? 'Suggestions on' : 'Saved only'}
            selected={showUnsaved}
            onPress={() => setShowUnsaved(!showUnsaved)}
          />
          <Chip
            label="+ Add event"
            tone="accent"
            onPress={() => {
              setEditing(null);
              setAdding(true);
            }}
          />
        </Row>

        {needsSectionPick.length > 0 ? (
          <Pressable onPress={() => router.push('/settings')}>
            <View
              style={{
                backgroundColor: c.warnSoft,
                borderColor: c.warn,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}>
              <T size={13} weight="700" tone="warn">
                {needsSectionPick.length} class
                {needsSectionPick.length === 1 ? '' : 'es'} need a section
              </T>
              <T size={12} tone="warn">
                {needsSectionPick.map((n) => n.course).join(', ')} run multiple
                sections, so their meetings are hidden until you pick yours.
              </T>
              <T size={12} weight="600" tone="warn" style={{ marginTop: 2 }}>
                Pick sections in Settings →
              </T>
            </View>
          </Pressable>
        ) : null}

        {adding || editing ? (
          <Card style={{ marginBottom: 12 }}>
            <AddEventForm
              initial={editing ?? undefined}
              defaultDate={selected ?? undefined}
              onSave={(ev) => {
                saveCustomEvent(ev);
                setAdding(false);
                setEditing(null);
              }}
              onCancel={() => {
                setAdding(false);
                setEditing(null);
              }}
            />
          </Card>
        ) : null}

        <Card>
          <Row wrap={false} style={{ marginBottom: 10 }}>
            <Pressable onPress={() => step(-1)} hitSlop={12}>
              <T size={20} tone="accent" weight="700">‹</T>
            </Pressable>
            <T size={16} weight="700" style={{ flex: 1, textAlign: 'center' }}>
              {zoom === 'month' ? monthLabel(anchor) : weekLabel(anchor)}
            </T>
            <Pressable onPress={() => step(1)} hitSlop={12}>
              <T size={20} tone="accent" weight="700">›</T>
            </Pressable>
          </Row>

          <Row gap={0} wrap={false} style={{ marginBottom: 4 }}>
            {WEEKDAY_LABELS.map((d, i) => (
              <T
                key={i}
                size={11}
                weight="700"
                tone="faint"
                style={{ width: cellSize, textAlign: 'center' }}>
                {d}
              </T>
            ))}
          </Row>

          <Row gap={0} style={{ flexWrap: 'wrap' }}>
            {days.map((day) => (
              <MonthCell
                key={day.key}
                day={day}
                size={cellSize}
                selected={selected === day.key}
                onPress={() => setSelected(day.key)}
              />
            ))}
          </Row>

          <Divider />
          <Row gap={10} style={{ marginTop: 8 }}>
            {(
              [
                ['exam', 'exam'],
                ['due', 'due'],
                ['application', 'application'],
                ['event', 'event'],
                ['class', 'class'],
              ] as [DayTone, string][]
            ).map(([tone, label]) => (
              <Row key={tone} gap={4} wrap={false}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: toneColors[tone],
                  }}
                />
                <T size={11} tone="faint">{label}</T>
              </Row>
            ))}
          </Row>
        </Card>

        {/* --- detail: selected day (month) or whole week --- */}
        {zoom === 'month' ? (
          <>
            <Row style={{ paddingTop: 18, paddingBottom: 6 }}>
              <T size={13} weight="700" tone="faint" style={{ letterSpacing: 0.8 }}>
                {selectedDay
                  ? selectedDay.date
                      .toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })
                      .toUpperCase()
                  : 'PICK A DAY'}
              </T>
            </Row>
            {selectedDay && selectedDay.items.length > 0 ? (
              <Card>
                {selectedDay.items.map((ev, i) => (
                  <View key={ev.id}>
                    {i > 0 ? <Divider /> : null}
                    <EventRow ev={ev} />
                  </View>
                ))}
              </Card>
            ) : (
              <Card>
                <T size={13} tone="faint">Nothing on this day.</T>
              </Card>
            )}
          </>
        ) : (
          <>
            <Row style={{ paddingTop: 18, paddingBottom: 6 }}>
              <T size={13} weight="700" tone="faint" style={{ letterSpacing: 0.8 }}>
                THIS WEEK · {weekItems.length} ITEM{weekItems.length === 1 ? '' : 'S'}
              </T>
            </Row>
            {days
              .filter((d) => d.items.length > 0)
              .map((d) => (
                <Card key={d.key} style={{ marginBottom: 8 }}>
                  <T size={13} weight="700" tone={d.isToday ? 'accent' : 'dim'}>
                    {d.date.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {d.isToday ? ' · today' : ''}
                  </T>
                  <Divider />
                  {d.items.map((ev) => (
                    <EventRow key={ev.id} ev={ev} />
                  ))}
                </Card>
              ))}
            {weekItems.length === 0 ? (
              <Empty title="Nothing this week" detail="Use ‹ › to look around." />
            ) : null}
          </>
        )}

        {customEvents.length > 0 ? (
          <>
            <Row style={{ paddingTop: 18, paddingBottom: 6 }}>
              <T size={13} weight="700" tone="faint" style={{ letterSpacing: 0.8 }}>
                YOUR REPEATING EVENTS
              </T>
            </Row>
            <Card>
              {customEvents.map((ev, i) => (
                <View key={ev.id}>
                  {i > 0 ? <Divider /> : null}
                  <Row wrap={false} gap={8} style={{ paddingVertical: 8 }}>
                    <View style={{ flex: 1 }}>
                      <T size={14} weight="600">{ev.title}</T>
                      <T size={12} tone="faint">
                        {describeCustom(ev)}
                        {ev.location ? ` · ${ev.location}` : ''}
                      </T>
                    </View>
                    <Chip label="Edit" onPress={() => { setAdding(false); setEditing(ev); }} />
                    <Chip label="✕" tone="danger" onPress={() => deleteCustomEvent(ev.id)} />
                  </Row>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {calendarItems.length === 0 ? (
          <T size={12} tone="faint" style={{ textAlign: 'center', marginTop: 16 }}>
            Sync Canvas for due dates, and star events or internships to see
            them here.
          </T>
        ) : null}
      </ScrollView>
      <AssistantButton />
    </SafeAreaView>
  );
}
