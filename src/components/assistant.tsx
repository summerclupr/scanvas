/**
 * The assistant sheet.
 *
 * A floating button rather than an eighth tab - it's a control surface for
 * the app you're already looking at, not a destination.
 *
 * Two deliberate choices:
 *   - Every action it takes is echoed in plain language under the reply, so
 *     a wrong one is visible immediately rather than discovered later.
 *   - Suggestion chips are real sentences, because the hardest part of a
 *     chat surface is knowing what it can do.
 */

import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { Chip, Row, T, useTheme } from './kit';
import { askAgent, type AppSnapshot, type ChatTurn } from '../chat/agent';
import { describeAction, type ChatAction } from '../chat/actions';
import { hoursUntil, relativeLabel } from '../core/datetime';
import { wordStart } from '../connectors/hydrant';
import { requiredTokens } from '../search/intent';
import { useApp } from '../state/app-store';

const SUGGESTIONS = [
  'You stacked too much on me today',
  "What's due this week?",
  'Any poker club events coming up?',
  'Stop recommending religious events',
  'I care more about internships than homework',
  'Make notifications quieter',
];

export function AssistantButton() {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          position: 'absolute',
          right: 16,
          bottom: 24,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
        })}>
        <T size={22}>💬</T>
      </Pressable>
      <AssistantSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AssistantSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const c = useTheme();
  const app = useApp();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  /**
   * Synced events that mention words from the user's message, so a question
   * about a club or topic is answered from data. Filler ("show me upcoming
   * events for the mit ... club") is stripped first.
   */
  const matchingEventsFor = (text: string) => {
    const words = requiredTokens(text);
    if (words.length === 0) return [];
    return app.scored
      .filter((e) => e.lane === 'opportunity' && hoursUntil(e.start) > -1)
      .filter((e) => {
        const hay = `${e.title} ${e.organizer ?? ''} ${e.description ?? ''} ${e.topics.join(' ')}`;
        return words.some((w) => wordStart(w).test(hay));
      })
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 6)
      .map((e) => ({
        title: e.title,
        host: e.organizer,
        when: new Date(e.start).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
        where: e.location,
      }));
  };

  const buildSnapshot = (userText: string): AppSnapshot => {
    const today = app.schedule.days[0];
    const upcoming = app.plan
      .filter((p) => p.lane !== 'event')
      .slice(0, 8)
      .map((p) => ({
        title: p.event.title,
        course: p.event.course?.code,
        due: relativeLabel(p.event.start),
        weight:
          typeof p.event.gradeImpact === 'number'
            ? `${p.event.gradeImpact.toFixed(1)}% of grade`
            : undefined,
      }));
    return {
      courses: app.profile.courses,
      interests: app.profile.fields,
      follows: app.profile.careerFollows,
      clubs: app.profile.orgs,
      muted: app.profile.keywords.exclude,
      matchingEvents: matchingEventsFor(userText),
      planPreset: app.profile.planPreset,
      dailyHours: app.profile.capacity?.hoursPerDay ?? 4,
      maxItemsPerDay: app.profile.capacity?.maxItemsPerDay ?? 4,
      todaySessions:
        today?.sessions.map((s) => ({
          title: s.event.title,
          hours: s.hours,
          due: relativeLabel(s.event.start),
        })) ?? [],
      todayCommitments: today?.commitments.map((e) => e.title) ?? [],
      upcoming,
      notificationsScheduled: app.notifications.scheduled,
      demoSources: app.profile.enabledSources.filter((s) => app.modes[s] === 'demo'),
    };
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setDraft('');
    setError(null);
    const withUser: ChatTurn[] = [...turns, { role: 'user', text: message }];
    setTurns(withUser);
    setBusy(true);
    try {
      const out = await askAgent(app.ollamaConfig, turns, buildSnapshot(message), message);
      // Apply actions before showing the reply, so the echo is truthful -
      // and echo what actually happened, which can differ from what was asked.
      const applied: ChatAction[] = [];
      for (const a of out.actions) {
        const done = await app.runAction(a);
        if (done) applied.push(done);
      }
      setTurns([...withUser, { role: 'assistant', text: out.reply, actions: applied }]);
    } catch (err) {
      setError(
        /Cannot reach|timed out/i.test((err as Error).message)
          ? 'Your local model is offline — start Ollama and try again.'
          : (err as Error).message,
      );
      setTurns(withUser);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{
            backgroundColor: c.bg,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            maxHeight: '88%',
            paddingBottom: 16,
          }}>
          <Row wrap={false} style={{ padding: 16, paddingBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <T size={18} weight="700">Assistant</T>
              <T size={12} tone="faint">
                Runs on your Ollama · can change settings for you
              </T>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <T size={18} tone="faint">✕</T>
            </Pressable>
          </Row>

          <ScrollView
            ref={scrollRef}
            style={{ paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingBottom: 12 }}>
            {turns.length === 0 ? (
              <View style={{ gap: 10, paddingVertical: 8 }}>
                <T size={13} tone="dim">
                  Ask about your week, or tell me to change something.
                </T>
                <Row gap={8}>
                  {SUGGESTIONS.map((s) => (
                    <Chip key={s} label={s} onPress={() => send(s)} />
                  ))}
                </Row>
              </View>
            ) : null}

            {turns.map((t, i) => (
              <View
                key={i}
                style={{
                  alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  marginVertical: 5,
                }}>
                <View
                  style={{
                    backgroundColor: t.role === 'user' ? c.accent : c.card,
                    borderColor: c.border,
                    borderWidth: t.role === 'user' ? 0 : 1,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                  }}>
                  <T
                    size={14}
                    style={t.role === 'user' ? { color: '#FFFFFF' } : undefined}>
                    {t.text}
                  </T>
                </View>
                {t.actions?.length ? (
                  <View style={{ gap: 3, marginTop: 5 }}>
                    {t.actions.map((a, j) => {
                      const label = describeAction(a);
                      return label ? (
                        <T key={j} size={12} tone="good">✓ {label}</T>
                      ) : null;
                    })}
                  </View>
                ) : null}
              </View>
            ))}

            {busy ? (
              <Row gap={8} wrap={false} style={{ paddingVertical: 8 }}>
                <ActivityIndicator size="small" color={c.accent} />
                <T size={13} tone="faint">Thinking locally...</T>
              </Row>
            ) : null}
            {error ? <T size={13} tone="danger">{error}</T> : null}
          </ScrollView>

          <Row gap={8} wrap={false} style={{ paddingHorizontal: 16, paddingTop: 6 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask, or tell me what to change..."
              placeholderTextColor={c.textFaint}
              onSubmitEditing={() => send(draft)}
              returnKeyType="send"
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
            <Chip label="Send" tone="accent" onPress={() => send(draft)} />
          </Row>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
