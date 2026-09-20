/**
 * A professor, matched to your interests.
 *
 * Every link goes to something real: a verified official page, or an explicit
 * SEARCH on LinkedIn/Scholar. No guessed profile URLs and no constructed
 * email addresses - an email shows only when that professor publishes it in
 * plain text on their own page, and the card says where to look when they
 * don't.
 */

import React from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Card, Chip, Row, T, useTheme } from './kit';
import {
  linkedinSearch,
  mitDirectory,
  scholarSearch,
  worksIn,
  type Professor,
} from '../careers/professors';
import { classUrl, collapseCrossListed, type HydrantClass } from '../connectors/hydrant';

export interface RankedProfessor extends Professor {
  score: number;
  reasons: string[];
}

export function ProfessorCard({
  prof,
  saved,
  onSave,
  teachingNow,
  term,
}: {
  prof: RankedProfessor;
  saved: boolean;
  onSave: () => void;
  /** Classes the MIT subject listing names them for this term. */
  teachingNow?: HydrantClass[];
  /** "Fall 2026" - which term `teachingNow` describes. */
  term?: string;
}) {
  const c = useTheme();
  const nowNumbers = new Set((teachingNow ?? []).map((k) => k.number));
  const hasTaught = (prof.teaches ?? []).filter((n) => !nowNumbers.has(n));

  return (
    <Card style={{ marginBottom: 10 }}>
      <Row wrap={false}>
        <View style={{ flex: 1 }}>
          <T size={17} weight="700">{prof.name}</T>
          <T size={13} tone="dim">{prof.department}</T>
          {prof.lab ? <T size={12} tone="faint">{prof.lab}</T> : null}
        </View>
        <Chip label={saved ? '★' : '☆'} selected={saved} onPress={onSave} />
      </Row>

      <T size={14} tone="dim" style={{ marginTop: 8 }}>{prof.blurb}</T>

      <Row gap={6} style={{ marginTop: 10 }}>
        {prof.areas.slice(0, 4).map((a) => (
          <Chip key={a} label={a} tone="accent" />
        ))}
      </Row>

      {teachingNow?.length ? (
        <View style={{ marginTop: 8, gap: 2 }}>
          <T size={12} weight="600" tone="good">
            Teaching {term ?? 'this term'}
          </T>
          {collapseCrossListed(teachingNow).slice(0, 4).map(({ primary, aliases }) => (
            <Pressable key={primary.number} onPress={() => Linking.openURL(classUrl(primary.number))}>
              <T size={12} tone="dim">
                {primary.number}
                {aliases.length ? ` (also ${aliases.join(', ')})` : ''} · {primary.name}
              </T>
            </Pressable>
          ))}
          <T size={11} tone="faint">from the MIT subject listing</T>
        </View>
      ) : null}
      {hasTaught.length ? (
        <T size={12} tone="faint" style={{ marginTop: teachingNow?.length ? 4 : 8 }}>
          {teachingNow?.length ? 'Has also taught' : 'Has taught'} {hasTaught.join(', ')}
        </T>
      ) : null}

      {prof.reasons.length > 0 ? (
        <T size={12} tone="accent" style={{ marginTop: 8 }}>
          {prof.reasons.join(' · ')}
        </T>
      ) : null}

      {/* --- contact --- */}
      <View
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: c.border,
          gap: 8,
        }}>
        {prof.email ? (
          <Row gap={8} wrap={false}>
            <T size={13} tone="dim" style={{ flex: 1 }}>{prof.email}</T>
            <Chip
              label="Email"
              tone="accent"
              onPress={() =>
                Linking.openURL(
                  `mailto:${prof.email}?subject=${encodeURIComponent('UROP inquiry')}`,
                )
              }
            />
          </Row>
        ) : (
          <T size={12} tone="faint">
            No public email listed — it&apos;s on their page or in the MIT
            directory. We don&apos;t guess addresses.
          </T>
        )}

        <Row gap={8}>
          <Chip
            label="Website"
            tone="accent"
            onPress={() => Linking.openURL(prof.homepage)}
          />
          {prof.deptPage ? (
            <Chip
              label="Department page"
              onPress={() => Linking.openURL(prof.deptPage!)}
            />
          ) : null}
          <Chip
            label="MIT directory"
            onPress={() => Linking.openURL(mitDirectory(prof.name))}
          />
          <Chip
            label="LinkedIn ↗"
            onPress={() => Linking.openURL(linkedinSearch(prof.name))}
          />
          <Chip
            label="Papers ↗"
            onPress={() => Linking.openURL(scholarSearch(prof.name))}
          />
        </Row>
        <T size={11} tone="faint">
          ↗ opens a search — profile URLs aren&apos;t guessed.
        </T>
      </View>
    </Card>
  );
}

/** Rank faculty against interests, followed orgs, and coursework. */
export function rankProfessors(
  professors: Professor[],
  opts: {
    fields: string[];
    follows: string[];
    courses: string[];
    courseSubjects: string[];
  },
): RankedProfessor[] {
  const norm = (s: string) => s.toLowerCase().trim();
  const fields = opts.fields.map(norm);
  const subjects = opts.courseSubjects.map(norm);

  return professors
    .map((p) => {
      const reasons: string[] = [];
      let score = 0;
      const areas = p.areas.map(norm);

      const fieldHits = fields.filter((f) => worksIn(p, f));
      if (fieldHits.length) {
        score += Math.min(0.5, fieldHits.length * 0.25);
        reasons.push(`Works on ${fieldHits.slice(0, 2).join(', ')}`);
      }

      const followHit = opts.follows.find(
        (f) =>
          norm(p.lab ?? '').includes(norm(f)) ||
          norm(p.department).includes(norm(f)) ||
          norm(f).includes(norm(p.name)),
      );
      if (followHit) {
        score += 0.3;
        reasons.push(`You follow ${followHit}`);
      }

      const teaches = (p.teaches ?? []).filter((t) => opts.courses.includes(t));
      if (teaches.length) {
        score += 0.25;
        reasons.push(`Teaches ${teaches.join(', ')} — you're enrolled`);
      }

      const subjectHits = subjects.filter((s) =>
        areas.some((a) => a.includes(s) || s.includes(a)),
      );
      if (subjectHits.length && !fieldHits.length) {
        score += 0.15;
        reasons.push(`Matches your coursework`);
      }

      return { ...p, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
