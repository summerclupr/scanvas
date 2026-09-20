/**
 * Pick your lecture and recitation sections.
 *
 * Hydrant knows every section of every class; it cannot know which one is
 * yours. 8.01 runs eight lecture sections at different hours, so guessing
 * would put someone else's 9am lecture on your calendar - the app emits
 * nothing for an ambiguous class until you choose.
 *
 * Classes with a single section of a kind never appear here: there's nothing
 * to decide, and they show on the Calendar already.
 */

import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Chip, Divider, Row, T, useTheme } from './kit';
import type { MeetingKind } from '../connectors/hydrant';
import { useApp } from '../state/app-store';

const KIND_LABEL: Record<MeetingKind, string> = {
  lecture: 'Lecture',
  recitation: 'Recitation',
  lab: 'Lab',
};

export function ScheduleCard() {
  const c = useTheme();
  const {
    profile,
    catalogue,
    catalogueLoading,
    loadCatalogue,
    sectionOptionsFor,
    setSection,
    runSync,
  } = useApp();

  useEffect(() => {
    loadCatalogue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (catalogueLoading && catalogue.size === 0) {
    return (
      <Row gap={8} wrap={false}>
        <ActivityIndicator size="small" color={c.accent} />
        <T size={13} tone="dim">Loading the MIT class catalogue...</T>
      </Row>
    );
  }

  if (catalogue.size === 0) {
    return (
      <View style={{ gap: 8 }}>
        <T size={13} tone="dim">
          Couldn&apos;t reach the class catalogue (hydrant.mit.edu).
        </T>
        <Chip label="Retry" tone="accent" onPress={() => loadCatalogue(true)} />
      </View>
    );
  }

  const chosen = profile.sectionChoice ?? {};
  // Only classes Hydrant actually knows about can be configured here.
  const rows = profile.courses
    .map((course) => ({ course, options: sectionOptionsFor(course) }))
    .filter((r) => r.options.length > 0);

  const unknown = profile.courses.filter(
    (course) => !catalogue.has(course) && sectionOptionsFor(course).length === 0,
  );

  return (
    <View style={{ gap: 14 }}>
      <T size={12} tone="faint">
        Times come from hydrant.mit.edu. Pick the section you&apos;re actually
        in — a class with several sections shows nothing until you do.
      </T>

      {rows.length === 0 ? (
        <T size={13} tone="dim">
          None of your classes have multiple sections — their meetings show on
          the Calendar already.
        </T>
      ) : null}

      {rows.map(({ course, options }, i) => {
        const kinds = [...new Set(options.map((o) => o.kind))];
        return (
          <View key={course} style={{ gap: 8 }}>
            {i > 0 ? <Divider /> : null}
            <T size={15} weight="700">{course}</T>
            {kinds.map((kind) => {
              const forKind = options.filter((o) => o.kind === kind);
              const pick = chosen[`${course}:${kind}`];
              return (
                <View key={kind} style={{ gap: 6 }}>
                  <T size={13} weight="600" tone={pick === undefined ? 'warn' : 'dim'}>
                    {KIND_LABEL[kind]}
                    {pick === undefined
                      ? ` — pick one of ${forKind.length}`
                      : ''}
                  </T>
                  <Row gap={6}>
                    {forKind.map((o) => (
                      <Chip
                        key={`${kind}-${o.index}`}
                        label={o.label}
                        selected={pick === o.index}
                        onPress={() => setSection(course, kind, o.index)}
                      />
                    ))}
                  </Row>
                </View>
              );
            })}
          </View>
        );
      })}

      {unknown.length > 0 ? (
        <>
          <Divider />
          <T size={13} weight="600" tone="dim">Not in the catalogue</T>
          <Row gap={6}>
            {unknown.map((u) => (
              <Chip key={u} label={u} tone="warn" />
            ))}
          </Row>
          <T size={12} tone="faint">
            Seminars and PE sections often aren&apos;t published. Add those on
            the Calendar with + Add event (kind: Lecture or Recitation) and
            they&apos;ll behave the same way.
          </T>
        </>
      ) : null}

      <Row gap={8}>
        <Chip label="Re-sync schedule" tone="accent" onPress={() => runSync()} />
        <Chip label="Refresh catalogue" onPress={() => loadCatalogue(true)} />
      </Row>
    </View>
  );
}
