/**
 * Add or edit a repeating personal event.
 *
 * Kept to chips and two short text fields rather than a date/time picker
 * dependency: "every Thursday at 7pm" is three taps this way, and it works
 * identically on web and native.
 */

import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Chip, Divider, Row, T, useTheme } from './kit';
import {
  REPEAT_LABELS,
  WEEKDAY_NAMES,
  newCustomEvent,
  type CustomEvent,
  type Repeat,
} from '../plan/custom-events';
import { dayKey } from '../plan/calendar';
import type { EventKind } from '../core/types';

/**
 * "Lecture" and "Recitation" matter beyond labelling: class kinds show on the
 * Calendar as your schedule but stay out of Due and Plan, because a seminar
 * meeting isn't something you owe. That's the same treatment Hydrant-sourced
 * meetings get, so a hand-entered PE section behaves like a real one.
 */
const KINDS: { value: EventKind; label: string }[] = [
  { value: 'lecture', label: 'Lecture' },
  { value: 'recitation', label: 'Recitation' },
  { value: 'club_event', label: 'Club' },
  { value: 'social', label: 'Social' },
  { value: 'talk', label: 'Talk' },
  { value: 'office_hours', label: 'Office hours' },
  { value: 'other', label: 'Other' },
];

const TIMES = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '17:00', '19:00', '20:00'];

export function AddEventForm({
  initial,
  defaultDate,
  onSave,
  onCancel,
}: {
  initial?: CustomEvent;
  defaultDate?: string;
  onSave: (ev: CustomEvent) => void;
  onCancel: () => void;
}) {
  const c = useTheme();
  const [draft, setDraft] = useState<CustomEvent>(
    () => initial ?? newCustomEvent({ startDate: defaultDate ?? dayKey(new Date()) }),
  );
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<CustomEvent>) => setDraft((d) => ({ ...d, ...patch }));

  const input = {
    backgroundColor: c.cardAlt,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: c.text,
    fontSize: 15,
  } as const;

  const submit = () => {
    if (!draft.title.trim()) {
      setError('Give it a name.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) {
      setError('Start date must be YYYY-MM-DD.');
      return;
    }
    const repeats = draft.repeat === 'weekly' || draft.repeat === 'biweekly';
    if (repeats && draft.weekdays.length === 0) {
      setError('Pick at least one day of the week.');
      return;
    }
    onSave({ ...draft, title: draft.title.trim() });
  };

  const toggleDay = (d: number) =>
    set({
      weekdays: draft.weekdays.includes(d)
        ? draft.weekdays.filter((x) => x !== d)
        : [...draft.weekdays, d].sort(),
    });

  const repeats = draft.repeat === 'weekly' || draft.repeat === 'biweekly';

  return (
    <View style={{ gap: 12 }}>
      <T size={16} weight="700">{initial ? 'Edit event' : 'Add an event'}</T>

      <TextInput
        value={draft.title}
        onChangeText={(t) => set({ title: t })}
        placeholder="e.g. Rocket Team meeting"
        placeholderTextColor={c.textFaint}
        style={input}
      />

      <Row gap={6}>
        {KINDS.map((k) => (
          <Chip
            key={k.value}
            label={k.label}
            selected={draft.kind === k.value}
            onPress={() => set({ kind: k.value })}
          />
        ))}
      </Row>

      <TextInput
        value={draft.location ?? ''}
        onChangeText={(t) => set({ location: t })}
        placeholder="Where? (optional)"
        placeholderTextColor={c.textFaint}
        style={input}
      />

      <Divider />

      <T size={13} weight="600" tone="dim">Repeats</T>
      <Row gap={6}>
        {(Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => (
          <Chip
            key={r}
            label={REPEAT_LABELS[r]}
            selected={draft.repeat === r}
            onPress={() => set({ repeat: r })}
          />
        ))}
      </Row>

      {repeats ? (
        <>
          <T size={13} weight="600" tone="dim">On</T>
          <Row gap={6}>
            {WEEKDAY_NAMES.map((name, i) => (
              <Chip
                key={name}
                label={name}
                selected={draft.weekdays.includes(i)}
                onPress={() => toggleDay(i)}
              />
            ))}
          </Row>
        </>
      ) : null}

      <T size={13} weight="600" tone="dim">
        {draft.repeat === 'none' ? 'Date' : 'Starting'}
      </T>
      <TextInput
        value={draft.startDate}
        onChangeText={(t) => set({ startDate: t })}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={c.textFaint}
        autoCapitalize="none"
        style={input}
      />

      <T size={13} weight="600" tone="dim">Time</T>
      <Row gap={6}>
        <Chip
          label="All day"
          selected={!draft.time}
          onPress={() => set({ time: undefined, endTime: undefined })}
        />
        {TIMES.map((t) => (
          <Chip
            key={t}
            label={t}
            selected={draft.time === t}
            onPress={() => set({ time: t })}
          />
        ))}
      </Row>
      {draft.time ? (
        <Row gap={8} wrap={false}>
          <TextInput
            value={draft.time}
            onChangeText={(t) => set({ time: t })}
            placeholder="19:00"
            placeholderTextColor={c.textFaint}
            style={[input, { flex: 1 }]}
          />
          <T size={13} tone="faint">to</T>
          <TextInput
            value={draft.endTime ?? ''}
            onChangeText={(t) => set({ endTime: t || undefined })}
            placeholder="20:30"
            placeholderTextColor={c.textFaint}
            style={[input, { flex: 1 }]}
          />
        </Row>
      ) : null}

      {draft.repeat !== 'none' ? (
        <>
          <T size={13} weight="600" tone="dim">Until (optional)</T>
          <TextInput
            value={draft.until ?? ''}
            onChangeText={(t) => set({ until: t || undefined })}
            placeholder="YYYY-MM-DD — blank means forever"
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            style={input}
          />
        </>
      ) : null}

      <Row gap={8}>
        <Chip
          label={draft.remind ? '🔔 Reminders on' : '🔕 No reminders'}
          selected={draft.remind}
          onPress={() => set({ remind: !draft.remind })}
        />
      </Row>
      <T size={11} tone="faint">
        Off by default — a standing weekly meeting shouldn&apos;t push a
        notification every week alongside your real deadlines.
      </T>

      {error ? <T size={13} tone="danger">{error}</T> : null}

      <Row gap={8}>
        <Button label="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
        <Button label={initial ? 'Save' : 'Add'} onPress={submit} style={{ flex: 2 }} />
      </Row>
    </View>
  );
}
