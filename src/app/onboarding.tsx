/**
 * Onboarding.
 *
 * Five steps, and the order matters. Priorities come first because they're the
 * only question a student can answer instantly, which earns the right to ask
 * the slower ones. Courses are shown already filled in from Canvas rather than
 * typed - the app should demonstrate it has read your accounts before it asks
 * you for anything.
 */

import React, { useState } from 'react';
import { router } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip, Row, T, useTheme } from '@/components/kit';
import { Brand } from '@/components/logo';
import {
  DEFAULT_NOTIFY,
  FIELD_SUGGESTIONS,
  PRIORITY_OPTIONS,
  type NotificationPrefs,
  type PriorityKey,
} from '@/core/profile';
import { NotificationEditor } from '@/components/notify-editor';
import { CoursePicker } from '@/components/course-picker';
import { useApp } from '@/state/app-store';

const STEPS = ['Priorities', 'Fields', 'People', 'Courses', 'Alerts'] as const;

/** Tap cycles a bucket through off / interested / very interested. */
const LEVELS: { label: string; value: number }[] = [
  { label: 'Skip', value: 0.05 },
  { label: 'Sometimes', value: 0.5 },
  { label: 'Priority', value: 0.95 },
];

export default function Onboarding() {
  const c = useTheme();
  const { completeOnboarding, runSync, availableCourses, modes } = useApp();

  const [step, setStep] = useState(0);
  const [priorities, setPriorities] = useState<Record<PriorityKey, number>>({
    urop: 0.5,
    club_event: 0.5,
    talk: 0.5,
    career: 0.5,
    social: 0.5,
    application_deadline: 0.5,
  });
  const [fields, setFields] = useState<string[]>([]);
  const [fieldDraft, setFieldDraft] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [personDraft, setPersonDraft] = useState('');
  const [orgs, setOrgs] = useState<string[]>([]);
  const [orgDraft, setOrgDraft] = useState('');
  const [courses, setCourses] = useState<string[]>(availableCourses);
  const [freeFood, setFreeFood] = useState(false);
  const [notify, setNotify] = useState<NotificationPrefs>(DEFAULT_NOTIFY);

  const patchNotify = (patch: Partial<NotificationPrefs>) =>
    setNotify((prev) => ({ ...prev, ...patch }));

  const cycle = (key: PriorityKey) => {
    setPriorities((prev) => {
      const idx = LEVELS.findIndex((l) => Math.abs(l.value - prev[key]) < 0.01);
      const next = LEVELS[(idx + 1) % LEVELS.length] ?? LEVELS[1];
      return { ...prev, [key]: next.value };
    });
  };

  const levelOf = (v: number) =>
    LEVELS.find((l) => Math.abs(l.value - v) < 0.01)?.label ?? 'Sometimes';

  const addTo = (
    draft: string,
    setDraft: (s: string) => void,
    list: string[],
    setList: (l: string[]) => void,
  ) => {
    const v = draft.trim();
    if (!v) return;
    if (!list.some((x) => x.toLowerCase() === v.toLowerCase())) setList([...list, v]);
    setDraft('');
  };

  const finish = async () => {
    await completeOnboarding({
      priorities,
      fields,
      people,
      orgs,
      courses,
      freeFood,
      notify,
    });
    router.replace('/');
    // Kick the first sync off behind the agenda screen rather than blocking on it.
    runSync();
  };

  const input = {
    backgroundColor: c.cardAlt,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: c.text,
    fontSize: 16,
    flex: 1,
  } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* progress */}
        <Row gap={6} style={{ paddingHorizontal: 20, paddingTop: 12 }} wrap={false}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: i <= step ? c.accent : c.border,
              }}
            />
          ))}
        </Row>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View style={{ gap: 4 }}>
              <Brand
                size={52}
                tagline="What you owe, and the few things this week worth going to."
                style={{ marginBottom: 22 }}
              />
              <T size={28} weight="700">What are you here for?</T>
              <T size={15} tone="dim" style={{ marginBottom: 18 }}>
                MIT posts hundreds of things a week. Tap to set how much each
                one matters. Coursework and exams are never filtered out, so you
                don&apos;t need to rank those.
              </T>

              <View style={{ gap: 10 }}>
                {PRIORITY_OPTIONS.map((opt) => {
                  const level = levelOf(priorities[opt.key]);
                  const on = priorities[opt.key] > 0.1;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => cycle(opt.key)}
                      style={({ pressed }) => ({
                        backgroundColor: on ? c.accentSoft : c.cardAlt,
                        borderColor: on ? c.accent : c.border,
                        borderWidth: 1,
                        borderRadius: 14,
                        padding: 14,
                        opacity: pressed ? 0.8 : 1,
                      })}>
                      <Row gap={10} wrap={false}>
                        <T size={22}>{opt.emoji}</T>
                        <View style={{ flex: 1 }}>
                          <T size={16} weight="600">{opt.label}</T>
                          <T size={13} tone="dim">{opt.blurb}</T>
                        </View>
                        <Chip
                          label={level}
                          tone={level === 'Priority' ? 'accent' : 'default'}
                        />
                      </Row>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {step === 1 && (
            <View style={{ gap: 4 }}>
              <T size={28} weight="700">What are you into?</T>
              <T size={15} tone="dim" style={{ marginBottom: 18 }}>
                Used for semantic matching, not keyword search — pick
                &quot;machine learning&quot; and you&apos;ll still get a talk on
                foundation models for robotics.
              </T>

              <Row gap={8} wrap={false} style={{ marginBottom: 14 }}>
                <TextInput
                  value={fieldDraft}
                  onChangeText={setFieldDraft}
                  placeholder="Add your own..."
                  placeholderTextColor={c.textFaint}
                  style={input}
                  onSubmitEditing={() =>
                    addTo(fieldDraft, setFieldDraft, fields, setFields)
                  }
                  returnKeyType="done"
                />
                <Chip
                  label="Add"
                  tone="accent"
                  onPress={() => addTo(fieldDraft, setFieldDraft, fields, setFields)}
                />
              </Row>

              <Row gap={8}>
                {[...new Set([...fields, ...FIELD_SUGGESTIONS])].map((f) => (
                  <Chip
                    key={f}
                    label={f}
                    selected={fields.includes(f)}
                    onPress={() =>
                      setFields((prev) =>
                        prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
                      )
                    }
                  />
                ))}
              </Row>
            </View>
          )}

          {step === 2 && (
            <View style={{ gap: 4 }}>
              <T size={28} weight="700">Anyone to follow?</T>
              <T size={15} tone="dim" style={{ marginBottom: 18 }}>
                Professors whose talks you&apos;d go to, or labs and clubs you
                want to hear from. Anything they&apos;re involved in gets pushed
                to the top. Optional.
              </T>

              <T size={13} weight="700" tone="faint" style={{ marginBottom: 6 }}>
                PROFESSORS & SPEAKERS
              </T>
              <Row gap={8} wrap={false} style={{ marginBottom: 10 }}>
                <TextInput
                  value={personDraft}
                  onChangeText={setPersonDraft}
                  placeholder="e.g. Regina Barzilay"
                  placeholderTextColor={c.textFaint}
                  style={input}
                  onSubmitEditing={() =>
                    addTo(personDraft, setPersonDraft, people, setPeople)
                  }
                  returnKeyType="done"
                />
                <Chip
                  label="Add"
                  tone="accent"
                  onPress={() => addTo(personDraft, setPersonDraft, people, setPeople)}
                />
              </Row>
              <Row gap={8} style={{ marginBottom: 20 }}>
                {people.map((p) => (
                  <Chip
                    key={p}
                    label={`${p}  ×`}
                    selected
                    onPress={() => setPeople((prev) => prev.filter((x) => x !== p))}
                  />
                ))}
              </Row>

              <T size={13} weight="700" tone="faint" style={{ marginBottom: 6 }}>
                LABS, CLUBS & GROUPS
              </T>
              <Row gap={8} wrap={false} style={{ marginBottom: 10 }}>
                <TextInput
                  value={orgDraft}
                  onChangeText={setOrgDraft}
                  placeholder="e.g. CSAIL, Rocket Team"
                  placeholderTextColor={c.textFaint}
                  style={input}
                  onSubmitEditing={() => addTo(orgDraft, setOrgDraft, orgs, setOrgs)}
                  returnKeyType="done"
                />
                <Chip
                  label="Add"
                  tone="accent"
                  onPress={() => addTo(orgDraft, setOrgDraft, orgs, setOrgs)}
                />
              </Row>
              <Row gap={8}>
                {orgs.map((o) => (
                  <Chip
                    key={o}
                    label={`${o}  ×`}
                    selected
                    onPress={() => setOrgs((prev) => prev.filter((x) => x !== o))}
                  />
                ))}
              </Row>
            </View>
          )}

          {step === 3 && (
            <View style={{ gap: 4 }}>
              <T size={28} weight="700">Your classes</T>
              <T size={15} tone="dim" style={{ marginBottom: 18 }}>
                Untick anything you dropped or are only listening to — its
                psets and exams stay out of your way. You can change this any
                time in Settings.
              </T>

              <View style={{ marginBottom: 24 }}>
                <CoursePicker
                  available={availableCourses}
                  selected={courses}
                  onChange={setCourses}
                />
                {modes.canvas === 'demo' ? (
                  <T size={12} tone="warn" style={{ marginTop: 10 }}>
                    These are sample classes, not yours. Connect Canvas in
                    Settings and they&apos;ll be replaced by your real
                    enrollment.
                  </T>
                ) : null}
              </View>

              <Pressable
                onPress={() => setFreeFood((v) => !v)}
                style={{
                  backgroundColor: freeFood ? c.goodSoft : c.cardAlt,
                  borderColor: freeFood ? c.good : c.border,
                  borderWidth: 1,
                  borderRadius: 14,
                  padding: 14,
                }}>
                <Row gap={10} wrap={false}>
                  <T size={22}>🍕</T>
                  <View style={{ flex: 1 }}>
                    <T size={16} weight="600">Boost events with free food</T>
                    <T size={13} tone="dim">Be honest.</T>
                  </View>
                  <Chip label={freeFood ? 'On' : 'Off'} tone={freeFood ? 'good' : 'default'} />
                </Row>
              </Pressable>
            </View>
          )}

          {step === 4 && (
            <View style={{ gap: 4 }}>
              <T size={28} weight="700">When should I interrupt you?</T>
              <T size={15} tone="dim" style={{ marginBottom: 20 }}>
                Tap to change any of these. Exams and due dates always notify;
                events only do if they clear your bar.
              </T>

              <NotificationEditor prefs={notify} onChange={patchNotify} />

              <T size={12} tone="faint" style={{ marginTop: 20 }}>
                All of this stays editable in Settings.
              </T>
            </View>
          )}
        </ScrollView>

        <Row gap={10} wrap={false} style={{ padding: 20, paddingTop: 8 }}>
          {step > 0 ? (
            <Button
              label="Back"
              variant="secondary"
              onPress={() => setStep((s) => s - 1)}
              style={{ flex: 1 }}
            />
          ) : null}
          <Button
            label={step === STEPS.length - 1 ? 'Start syncing' : 'Continue'}
            onPress={() => (step === STEPS.length - 1 ? finish() : setStep((s) => s + 1))}
            style={{ flex: 2 }}
          />
        </Row>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
