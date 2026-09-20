/**
 * Editor for notification timing.
 *
 * Lead times are a multi-select over a fixed menu rather than free numeric
 * entry: "how long before" is a choice among a handful of sensible answers,
 * and a chip row makes the current setup readable at a glance in a way three
 * text fields never would.
 */

import React from 'react';
import { View } from 'react-native';

import type { NotificationPrefs } from '../core/profile';
import { Chip, Row, T } from './kit';

/** Menu of offered lead times, in hours, longest first. */
export const LEAD_OPTIONS = [336, 168, 72, 48, 24, 12, 6, 3, 2, 1] as const;

export function formatLead(hours: number): string {
  if (hours >= 168) {
    const w = hours / 168;
    return w === 1 ? '1 week' : `${w} weeks`;
  }
  if (hours >= 24) {
    const d = hours / 24;
    return d === 1 ? '1 day' : `${d} days`;
  }
  return `${hours}h`;
}

/** "1 week, 3 days, 1 day and 2h before" */
export function describeLeads(hours: number[]): string {
  if (hours.length === 0) return 'No reminders';
  const parts = [...hours].sort((a, b) => b - a).map(formatLead);
  if (parts.length === 1) return `${parts[0]} before`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]} before`;
}

export function LeadPicker({
  title,
  detail,
  value,
  onChange,
  options = LEAD_OPTIONS,
}: {
  title: string;
  detail?: string;
  value: number[];
  onChange: (next: number[]) => void;
  options?: readonly number[];
}) {
  const toggle = (h: number) => {
    const next = value.includes(h) ? value.filter((x) => x !== h) : [...value, h];
    // Always store descending so downstream copy ("in 2 days") reads in order.
    onChange(next.sort((a, b) => b - a));
  };

  return (
    <View style={{ gap: 8 }}>
      <View>
        <T size={15} weight="600">{title}</T>
        <T size={13} tone={value.length ? 'dim' : 'warn'}>
          {detail ?? describeLeads(value)}
        </T>
      </View>
      <Row gap={6}>
        {options.map((h) => (
          <Chip
            key={h}
            label={formatLead(h)}
            selected={value.includes(h)}
            onPress={() => toggle(h)}
          />
        ))}
      </Row>
    </View>
  );
}

const FLOORS: { value: number; label: string; blurb: string }[] = [
  { value: 0.3, label: 'Loose', blurb: 'Most things that match at all' },
  { value: 0.45, label: 'Balanced', blurb: 'Clear matches only' },
  { value: 0.6, label: 'Strict', blurb: 'Strong matches only' },
  { value: 0.8, label: 'Rare', blurb: 'Almost nothing gets through' },
];

export function ScoreFloorPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const current = FLOORS.reduce((best, f) =>
    Math.abs(f.value - value) < Math.abs(best.value - value) ? f : best,
  );
  return (
    <View style={{ gap: 8 }}>
      <View>
        <T size={15} weight="600">How good an event has to be</T>
        <T size={13} tone="dim">
          {current.blurb} — above {Math.round(value * 100)}% match
        </T>
      </View>
      <Row gap={6}>
        {FLOORS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            selected={Math.abs(f.value - value) < 0.01}
            onPress={() => onChange(f.value)}
          />
        ))}
      </Row>
    </View>
  );
}

export function QuietHoursPicker({
  value,
  onChange,
}: {
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const [start, end] = value;
  return (
    <View style={{ gap: 8 }}>
      <View>
        <T size={15} weight="600">Quiet hours</T>
        <T size={13} tone="dim">
          Nothing fires between {start}:00 and {end}:00. Anything due in that
          window moves to {end}:00.
        </T>
      </View>
      <Row gap={6}>
        {[21, 22, 23, 0, 1, 2].map((h) => (
          <Chip
            key={`s${h}`}
            label={`${h}:00`}
            selected={start === h}
            onPress={() => onChange([h, end])}
          />
        ))}
      </Row>
      <T size={12} tone="faint">until</T>
      <Row gap={6}>
        {[6, 7, 8, 9, 10, 11].map((h) => (
          <Chip
            key={`e${h}`}
            label={`${h}:00`}
            selected={end === h}
            onPress={() => onChange([start, h])}
          />
        ))}
      </Row>
    </View>
  );
}

export function DigestPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View>
        <T size={15} weight="600">Morning digest</T>
        <T size={13} tone="dim">
          {value === null
            ? 'Off — individual reminders only'
            : `One summary of the day at ${value}:00`}
        </T>
      </View>
      <Row gap={6}>
        <Chip label="Off" selected={value === null} onPress={() => onChange(null)} />
        {[7, 8, 9, 10].map((h) => (
          <Chip
            key={h}
            label={`${h}:00`}
            selected={value === h}
            onPress={() => onChange(h)}
          />
        ))}
      </Row>
    </View>
  );
}

/** Everything above, as one block. Shared by onboarding and Settings. */
export function NotificationEditor({
  prefs,
  onChange,
}: {
  prefs: NotificationPrefs;
  onChange: (patch: Partial<NotificationPrefs>) => void;
}) {
  return (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 8 }}>
        <View>
          <T size={15} weight="600">Alert style</T>
          <T size={13} tone="dim">
            {prefs.sound
              ? 'Banner with sound and vibration'
              : 'Silent banner - shows up, makes no noise'}
          </T>
        </View>
        <Row gap={6}>
          <Chip
            label="Banner + sound"
            selected={prefs.sound}
            onPress={() => onChange({ sound: true })}
          />
          <Chip
            label="Silent"
            selected={!prefs.sound}
            onPress={() => onChange({ sound: false })}
          />
        </Row>
      </View>

      <LeadPicker
        title="Exams and quizzes"
        value={prefs.examLeadHours}
        onChange={(examLeadHours) => onChange({ examLeadHours })}
      />
      <LeadPicker
        title="Assignments and deadlines"
        value={prefs.assignmentLeadHours}
        onChange={(assignmentLeadHours) => onChange({ assignmentLeadHours })}
      />
      <LeadPicker
        title="Events you'd want"
        value={prefs.opportunityLeadHours}
        onChange={(opportunityLeadHours) => onChange({ opportunityLeadHours })}
      />
      <ScoreFloorPicker
        value={prefs.opportunityScoreFloor}
        onChange={(opportunityScoreFloor) => onChange({ opportunityScoreFloor })}
      />
      <QuietHoursPicker
        value={prefs.quietHours}
        onChange={(quietHours) => onChange({ quietHours })}
      />
      <DigestPicker
        value={prefs.dailyDigestHour}
        onChange={(dailyDigestHour) => onChange({ dailyDigestHour })}
      />
    </View>
  );
}
