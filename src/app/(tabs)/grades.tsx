/**
 * The "Work" tab: what you've turned in, and what it scored.
 *
 * Deliberately never converts a percentage into a letter grade. MIT cutoffs
 * vary per class and are frequently curved, so "88% = B+" would be a
 * confident guess about something the app cannot know.
 */

import React, { useMemo } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Chip, Divider, Empty, Meter, Row, SectionHeader, T, useTheme } from '@/components/kit';
import { Brand } from '@/components/logo';
import { pct, summarize, toneFor, type CourseGrades } from '@/core/grades';
import { DemoBanner } from '@/components/demo-banner';
import { AssistantButton } from '@/components/assistant';
import { useApp } from '@/state/app-store';

function GradedRow({ item }: { item: CourseGrades['graded'][number] }) {
  const tone = toneFor(item.fraction);
  return (
    <View style={{ paddingVertical: 10 }}>
      <Row wrap={false} gap={10}>
        <View style={{ flex: 1 }}>
          <T size={15} weight="500" numberOfLines={2}>{item.title}</T>
          <Row gap={6} style={{ marginTop: 3 }}>
            {item.missing ? (
              <Chip label="never submitted" tone="danger" />
            ) : item.late ? (
              <Chip label="late" tone="warn" />
            ) : null}
            {item.gradedAt ? (
              <T size={12} tone="faint">
                graded {new Date(item.gradedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </T>
            ) : null}
          </Row>
        </View>
        <View style={{ alignItems: 'flex-end', minWidth: 78 }}>
          <T size={17} weight="700" tone={tone}>{pct(item.fraction)}</T>
          <T size={12} tone="faint">
            {item.score}/{item.pointsPossible}
          </T>
        </View>
      </Row>
      <View style={{ marginTop: 8 }}>
        <Meter value={item.fraction} tone={tone === 'good' ? 'accent' : tone} />
      </View>
      {item.sourceUrl ? (
        <Pressable onPress={() => Linking.openURL(item.sourceUrl!)} style={{ marginTop: 6 }}>
          <T size={12} tone="accent" weight="600">Open in Canvas →</T>
        </Pressable>
      ) : null}
    </View>
  );
}

function CourseCard({ course }: { course: CourseGrades }) {
  const tone = course.average === null ? 'dim' : toneFor(course.average);
  return (
    <Card style={{ marginBottom: 12 }}>
      <Row wrap={false}>
        <View style={{ flex: 1 }}>
          <T size={18} weight="700">{course.courseCode}</T>
          <T size={13} tone="dim">
            {course.graded.length} graded
            {course.pending.length ? ` · ${course.pending.length} awaiting` : ''}
            {course.missingCount ? ` · ${course.missingCount} missing` : ''}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T size={24} weight="700" tone={tone === 'dim' ? 'dim' : tone}>
            {course.average === null ? '—' : pct(course.average)}
          </T>
          <T size={12} tone="faint">
            {course.earned}/{course.possible} pts
          </T>
        </View>
      </Row>

      {course.pending.length > 0 ? (
        <View
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 10,
            gap: 4,
          }}>
          {course.pending.map((p) => (
            <Row key={p.id} wrap={false} gap={8}>
              <Chip label="submitted" tone="accent" />
              <T size={14} style={{ flex: 1 }} numberOfLines={1}>{p.title}</T>
              <T size={12} tone="faint">not graded</T>
            </Row>
          ))}
        </View>
      ) : null}

      {course.graded.length > 0 ? (
        <View style={{ marginTop: 6 }}>
          <Divider />
          {course.graded.map((g) => (
            <GradedRow key={g.id} item={g} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export default function GradesScreen() {
  const c = useTheme();
  const { scored, syncing, runSync } = useApp();

  const summary = useMemo(() => summarize(scored), [scored]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={syncing} onRefresh={runSync} tintColor={c.accent} />
        }>
        <Brand size={32} style={{ marginBottom: 12 }} />
        <Row wrap={false}>
          <View style={{ flex: 1 }}>
            <T size={30} weight="700">Work</T>
            <T size={14} tone="dim">
              {summary.totalGraded} graded
              {summary.totalPending ? ` · ${summary.totalPending} awaiting a grade` : ''}
            </T>
          </View>
          {summary.overall !== null ? (
            <View style={{ alignItems: 'flex-end' }}>
              <T size={28} weight="700" tone={toneFor(summary.overall)}>
                {pct(summary.overall)}
              </T>
              <T size={12} tone="faint">across all classes</T>
            </View>
          ) : null}
        </Row>

        <View style={{ marginTop: 12 }}>
          <DemoBanner what="these grades" sources={['canvas']} />
        </View>

        {summary.courses.length === 0 ? (
          <Empty
            title="Nothing graded yet"
            detail="Once Canvas returns a score, it shows up here. Pull down to sync."
          />
        ) : (
          <>
            <SectionHeader
              title="By class"
              detail="Points-weighted. Work awaiting a grade is never counted as a zero."
            />
            {summary.courses.map((course) => (
              <CourseCard key={course.courseCode} course={course} />
            ))}
            <T size={12} tone="faint" style={{ marginTop: 8, textAlign: 'center' }}>
              Percentages only — letter cutoffs vary per class and are often
              curved, so this app won&apos;t guess at them.
            </T>
          </>
        )}
      </ScrollView>
      <AssistantButton />
    </SafeAreaView>
  );
}
