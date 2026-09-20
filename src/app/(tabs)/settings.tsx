/**
 * Settings: the model connection, the sources, and the interest profile.
 *
 * The Ollama host field is the one piece of setup a demo actually needs -
 * a phone can't reach "localhost", so it has to point at the laptop's LAN
 * address. The connection test is right next to it for that reason.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip, Divider, Row, SectionHeader, T, useTheme } from '@/components/kit';
import { NotificationEditor } from '@/components/notify-editor';
import { Brand } from '@/components/logo';
import { CoursePicker } from '@/components/course-picker';
import { CanvasConnect } from '@/components/canvas-connect';
import { ScheduleCard } from '@/components/schedule-card';
import { OutlookConnect } from '@/components/outlook-connect';
import { planDigest, planNotifications } from '@/notify/rules';
import type { NotificationPrefs } from '@/core/profile';
import { PRIORITY_OPTIONS, type PriorityKey } from '@/core/profile';
import { SOURCE_LABELS, type SourceId } from '@/core/types';
import { useApp } from '@/state/app-store';

export default function SettingsScreen() {
  const c = useTheme();
  const {
    profile,
    updateProfile,
    ollamaConfig,
    setOllamaConfig,
    ollamaStatus,
    checkOllama,
    runSync,
    syncing,
    progress,
    syncError,
    lastResult,
    notifications,
    reschedule,
    scored,
    availableCourses,
    hiddenByCourse,
    modes,
    unhide,
    reset,
  } = useApp();

  const [host, setHost] = useState(ollamaConfig.host);
  const [chatModel, setChatModel] = useState(ollamaConfig.chatModel);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setHost(ollamaConfig.host);
    setChatModel(ollamaConfig.chatModel);
  }, [ollamaConfig.host, ollamaConfig.chatModel]);

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

  const testConnection = async () => {
    setTesting(true);
    await setOllamaConfig({ ...ollamaConfig, host: host.trim(), chatModel: chatModel.trim() });
    const status = await checkOllama();
    setTesting(false);
    Alert.alert(
      status.reachable ? 'Connected' : 'Not reachable',
      status.reachable
        ? status.missing.length
          ? `Server is up, but missing: ${status.missing.join(', ')}\n\nRun: ollama pull ${status.missing.join(' && ollama pull ')}`
          : 'Server is up and both models are available.'
        : `${status.error ?? 'No response'}\n\nMake sure Ollama is running and reachable:\nOLLAMA_HOST=0.0.0.0 ollama serve`,
    );
  };

  const toggleSource = (id: SourceId) => {
    const enabled = profile.enabledSources.includes(id)
      ? profile.enabledSources.filter((s) => s !== id)
      : [...profile.enabledSources, id];
    updateProfile({ enabledSources: enabled });
  };

  const cyclePriority = (key: PriorityKey) => {
    const levels = [0.05, 0.5, 0.95];
    const current = profile.priorities[key];
    const idx = levels.findIndex((l) => Math.abs(l - current) < 0.01);
    updateProfile({
      priorities: { ...profile.priorities, [key]: levels[(idx + 1) % levels.length] },
    });
  };

  const labelFor = (v: number) => (v > 0.7 ? 'Priority' : v > 0.2 ? 'Sometimes' : 'Skip');

  const patchNotify = (patch: Partial<NotificationPrefs>) =>
    updateProfile({ notify: { ...profile.notify, ...patch } });

  /**
   * What the current settings would schedule. Recomputed locally rather than
   * read back from the OS so the numbers move the instant a chip is tapped,
   * ahead of the debounced reschedule.
   */
  const preview = useMemo(() => {
    const plan = planNotifications(scored, profile.notify);
    const digest = planDigest(scored, profile.notify);
    const count = (cat: string) => plan.filter((p) => p.category === cat).length;
    return {
      total: plan.length + (digest ? 1 : 0),
      exam: count('exam'),
      assignment: count('assignment'),
      opportunity: count('opportunity'),
      digest: Boolean(digest),
      next: plan[0] ?? digest ?? null,
    };
  }, [scored, profile.notify]);

  const confirmReset = () => {
    Alert.alert(
      'Erase everything?',
      'Deletes your profile, all synced events, and every scheduled reminder from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Erase', style: 'destructive', onPress: () => reset() },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled">
        <Brand size={32} style={{ marginBottom: 12 }} />
        <T size={30} weight="700">Settings</T>

        {/* --- accounts: the thing that decides real vs sample --- */}
        <SectionHeader
          title="Accounts"
          detail="Nothing here is your data until you connect it."
        />
        <Card>
          <CanvasConnect />
        </Card>
        <Card style={{ marginTop: 12 }}>
          <OutlookConnect />
        </Card>
        {/*
          Campus listings come from feeds MIT publishes openly (the Institute
          events calendar and Engage's club feed). There is no ELx account to
          connect - UROP postings sit behind Touchstone with no feed - so this
          is stated as a fact rather than offered as a toggle. Muting lives
          under "What synced" with the other sources.
        */}
        <Card style={{ marginTop: 12 }}>
          <Row wrap={false}>
            <View style={{ flex: 1 }}>
              <T size={16} weight="600">MIT campus listings</T>
              <T size={12} tone="faint">
                Talks, seminars, research events and club events from MIT&apos;s
                public events calendar and Engage. No account exists for these,
                so nothing to connect.
              </T>
            </View>
            <Chip label="public" tone="good" />
          </Row>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <Row wrap={false}>
            <View style={{ flex: 1 }}>
              <T size={16} weight="600">Clubs you follow</T>
              <T size={12} tone="faint">
                {profile.orgs.length
                  ? `${profile.orgs.join(', ')} - each club's own Engage feed and website are read on every sync.`
                  : 'Follow a club from For you (search it, tap Follow) and its own Engage feed and website get read on every sync.'}
              </T>
            </View>
            <Chip label={profile.orgs.length ? `${profile.orgs.length} followed` : 'none'} tone={profile.orgs.length ? 'good' : 'default'} />
          </Row>
        </Card>

        {/* --- local model --- */}
        <SectionHeader
          title="Local model"
          detail="The only network call this app makes."
        />
        <Card>
          <T size={13} weight="600" tone="dim">Ollama host</T>
          <TextInput
            value={host}
            onChangeText={setHost}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://192.168.1.42:11434"
            placeholderTextColor={c.textFaint}
            style={[input, { marginTop: 6 }]}
          />
          <T size={12} tone="faint" style={{ marginTop: 6 }}>
            On a real phone this must be your laptop&apos;s LAN address, not
            localhost. Start the server with OLLAMA_HOST=0.0.0.0 ollama serve
          </T>

          <T size={13} weight="600" tone="dim" style={{ marginTop: 14 }}>
            Extraction model
          </T>
          <TextInput
            value={chatModel}
            onChangeText={setChatModel}
            autoCapitalize="none"
            autoCorrect={false}
            style={[input, { marginTop: 6 }]}
          />
          <T size={12} tone="faint" style={{ marginTop: 6 }}>
            qwen3.5:9b runs about 4s per message; qwen3:4b is about 2s and
            scores the same on our fixtures, so drop to it if syncs feel slow.
          </T>

          <Row gap={8} style={{ marginTop: 14 }}>
            <Button
              label={testing ? 'Testing...' : 'Test connection'}
              variant="secondary"
              onPress={testConnection}
              disabled={testing}
              style={{ flex: 1 }}
            />
          </Row>

          {ollamaStatus.checked ? (
            <T
              size={13}
              tone={ollamaStatus.reachable ? 'good' : 'danger'}
              style={{ marginTop: 10 }}>
              {ollamaStatus.reachable
                ? ollamaStatus.missing.length
                  ? `Up, missing ${ollamaStatus.missing.join(', ')}`
                  : 'Connected'
                : `Unreachable: ${ollamaStatus.error ?? 'no response'}`}
            </T>
          ) : null}
        </Card>

        {/* --- sources --- */}
        <SectionHeader
          title="What synced"
          detail="Counts from the last run, per source."
        />
        <Card>
          <Row gap={8}>
            {(['canvas', 'outlook', 'mit', 'clubs'] as SourceId[]).map((id) => (
              <Chip
                key={id}
                label={SOURCE_LABELS[id]}
                selected={profile.enabledSources.includes(id)}
                onPress={() => toggleSource(id)}
              />
            ))}
          </Row>
          {lastResult ? (
            <View style={{ marginTop: 12, gap: 3 }}>
              <Divider />
              <View style={{ height: 8 }} />
              {lastResult.sources.map((s) => (
                <View key={s.id}>
                  <Row wrap={false}>
                    <T size={12} tone="faint" style={{ flex: 1 }}>
                      {SOURCE_LABELS[s.id]}
                      {modes[s.id] === 'demo' ? ' (sample)' : ''}
                    </T>
                    <T size={12} tone={s.error ? 'danger' : 'faint'}>
                      {s.error ?? `${s.fetched} items`}
                    </T>
                  </Row>
                  {s.warning ? (
                    <T size={11} tone="warn" style={{ paddingLeft: 12 }}>
                      {s.warning}
                    </T>
                  ) : null}
                </View>
              ))}
              <Row wrap={false} style={{ marginTop: 6 }}>
                <T size={12} tone="faint" style={{ flex: 1 }}>Model read</T>
                <T size={12} tone="faint">
                  {lastResult.inferred.kept}/{lastResult.inferred.attempted} kept
                </T>
              </Row>
              {Object.entries(lastResult.inferred.drops).map(([reason, n]) => (
                <Row key={reason} wrap={false}>
                  <T size={11} tone="faint" style={{ flex: 1, paddingLeft: 12 }}>
                    {reason.replace(/_/g, ' ')}
                  </T>
                  <T size={11} tone="faint">{n}</T>
                </Row>
              ))}
              <Row wrap={false} style={{ marginTop: 6 }}>
                <T size={12} tone="faint" style={{ flex: 1 }}>Sync time</T>
                <T size={12} tone="faint">{(lastResult.durationMs / 1000).toFixed(1)}s</T>
              </Row>
            </View>
          ) : null}
          {/*
            A sync runs ~25s with inference on. With no progress and no
            disabled state the button looked dead for the whole of it, so the
            natural response was to press it again - which hit the in-flight
            guard and did nothing, making it look deader still.
          */}
          <Button
            label={
              syncing
                ? (progress?.message ?? 'Syncing...')
                : 'Sync now'
            }
            onPress={runSync}
            disabled={syncing}
            style={{ marginTop: 14 }}
          />
          {syncError ? (
            <T size={12} tone="danger" style={{ marginTop: 8 }}>
              {syncError}
            </T>
          ) : null}
        </Card>

        {/* --- priorities --- */}
        <SectionHeader title="What you care about" />
        <Card>
          {PRIORITY_OPTIONS.map((opt, i) => (
            <View key={opt.key}>
              {i > 0 ? <View style={{ height: 10 }} /> : null}
              <Row gap={10} wrap={false}>
                <T size={18}>{opt.emoji}</T>
                <T size={15} style={{ flex: 1 }}>{opt.label}</T>
                <Chip
                  label={labelFor(profile.priorities[opt.key])}
                  tone={profile.priorities[opt.key] > 0.7 ? 'accent' : 'default'}
                  onPress={() => cyclePriority(opt.key)}
                />
              </Row>
            </View>
          ))}
        </Card>

        <SectionHeader
          title="Your classes"
          detail="Untick a class to silence its psets and exams."
        />
        <Card>
          <CoursePicker
            available={availableCourses}
            selected={profile.courses}
            onChange={(courses) => updateProfile({ courses })}
          />
          <T size={12} tone="faint" style={{ marginTop: 12 }}>
            {hiddenByCourse > 0
              ? `${hiddenByCourse} item${hiddenByCourse === 1 ? '' : 's'} hidden from unticked classes. Nothing is deleted - tick it again to bring it back.`
              : 'Canvas keeps you enrolled in classes you dropped or only listen to. Untick those.'}
          </T>
        </Card>

        <SectionHeader
          title="Class schedule"
          detail="Lecture and recitation times, from hydrant.mit.edu."
        />
        <Card>
          <ScheduleCard />
        </Card>

        <SectionHeader title="Interests" detail="Matched semantically, not by keyword." />
        <Card>
          <Row gap={8}>
            {profile.fields.length ? (
              profile.fields.map((f) => <Chip key={f} label={f} tone="accent" />)
            ) : (
              <T size={14} tone="faint">None set</T>
            )}
          </Row>
          {profile.people.length || profile.orgs.length ? (
            <>
              <View style={{ height: 12 }} />
              <T size={13} weight="600" tone="dim">Following</T>
              <Row gap={8} style={{ marginTop: 6 }}>
                {[...profile.people, ...profile.orgs].map((p) => (
                  <Chip key={p} label={p} />
                ))}
              </Row>
            </>
          ) : null}
          {(profile.feedback.dismissedHosts?.length ||
            profile.feedback.dismissedSeries?.length ||
            profile.keywords.exclude.length) ? (
            <>
              <View style={{ height: 12 }} />
              <T size={13} weight="600" tone="dim">Hidden for good</T>
              <T size={12} tone="faint" style={{ marginTop: 2 }}>
                Learned from &quot;Not for me&quot; and mutes. Tap one to bring it back.
              </T>
              <Row gap={8} style={{ marginTop: 6 }}>
                {(profile.feedback.dismissedHosts ?? []).map((h) => (
                  <Chip key={`h:${h}`} label={`✕ ${h}`} onPress={() => unhide({ host: h })} />
                ))}
                {(profile.feedback.dismissedSeries ?? []).map((k) => (
                  <Chip key={`s:${k}`} label={`✕ ${k}`} onPress={() => unhide({ series: k })} />
                ))}
                {profile.keywords.exclude.map((k) => (
                  <Chip
                    key={`k:${k}`}
                    label={`✕ muted “${k}”`}
                    tone="warn"
                    onPress={() =>
                      updateProfile({
                        keywords: { ...profile.keywords, exclude: profile.keywords.exclude.filter((x) => x !== k) },
                      })
                    }
                  />
                ))}
              </Row>
            </>
          ) : null}
          <Button
            label="Redo onboarding"
            variant="secondary"
            onPress={() => updateProfile({ completedOnboarding: false })}
            style={{ marginTop: 14 }}
          />
        </Card>

        {/* --- notifications --- */}
        <SectionHeader
          title="Notifications"
          detail="Changes apply immediately - no re-sync needed."
        />
        <Card>
          <Row wrap={false}>
            <View style={{ flex: 1 }}>
              <T size={15} weight="600">Reminders</T>
              <T size={13} tone="dim">
                {profile.notify.enabled ? 'On' : 'Off - nothing is scheduled'}
              </T>
            </View>
            <Chip
              label={profile.notify.enabled ? 'On' : 'Off'}
              tone={profile.notify.enabled ? 'good' : 'default'}
              selected={profile.notify.enabled}
              onPress={() => patchNotify({ enabled: !profile.notify.enabled })}
            />
          </Row>

          <View style={{ height: 14 }} />
          <Divider />
          <View style={{ height: 14 }} />

          <NotificationEditor prefs={profile.notify} onChange={patchNotify} />

          <View style={{ height: 16 }} />
          <Divider />
          <View style={{ height: 14 }} />

          {/* What these settings would actually produce, right now. */}
          <Row wrap={false}>
            <T size={15} style={{ flex: 1 }}>Would fire</T>
            <T size={14} tone="dim">
              {preview.total} reminder{preview.total === 1 ? '' : 's'}
            </T>
          </Row>
          <View style={{ height: 6 }} />
          <Row gap={6}>
            <Chip label={`${preview.exam} exam`} tone="danger" />
            <Chip label={`${preview.assignment} due`} tone="warn" />
            <Chip label={`${preview.opportunity} events`} tone="accent" />
            {preview.digest ? <Chip label="digest" tone="good" /> : null}
          </Row>

          {preview.next ? (
            <T size={12} tone="faint" style={{ marginTop: 10 }}>
              Next: {preview.next.title} at{' '}
              {preview.next.fireAt.toLocaleString('en-US', {
                weekday: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </T>
          ) : (
            <T size={12} tone="faint" style={{ marginTop: 10 }}>
              Nothing upcoming matches these settings.
            </T>
          )}

          <View style={{ height: 14 }} />
          <Divider />
          <View style={{ height: 14 }} />

          <Row wrap={false}>
            <T size={15} style={{ flex: 1 }}>System permission</T>
            <T size={14} tone={notifications.granted ? 'good' : 'warn'}>
              {notifications.granted ? 'Granted' : 'Not granted'}
            </T>
          </Row>
          <View style={{ height: 8 }} />
          <Row wrap={false}>
            <T size={15} style={{ flex: 1 }}>Queued with the OS</T>
            <T size={14} tone="dim">{notifications.scheduled}</T>
          </Row>

          {!notifications.granted ? (
            <Button
              label="Enable notifications"
              variant="secondary"
              onPress={() => reschedule({ prompt: true })}
              style={{ marginTop: 14 }}
            />
          ) : null}

          <T size={12} tone="faint" style={{ marginTop: 10 }}>
            {Platform.OS === 'web'
              ? 'In a browser nothing is actually queued: the web build has no way to schedule OS notifications, so the counts above describe what the phone app would fire. Open the app in Expo Go on a real device for reminders.'
              : 'Simulators never deliver local notifications. Test on a real device.'}
          </T>
        </Card>

        {/* --- privacy --- */}
        <SectionHeader title="Your data" />
        <Card>
          <T size={14} tone="dim">
            Your profile, your events, and your embeddings are stored only on
            this device. Nothing is uploaded, and there is no account. The only
            outbound request goes to the Ollama host above.
          </T>
          <Button
            label="Erase everything"
            variant="danger"
            onPress={confirmReset}
            style={{ marginTop: 14 }}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
