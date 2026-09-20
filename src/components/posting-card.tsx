/**
 * A career posting - internship, research program, or new-grad role.
 *
 * Shared between the Careers tab and the Research filter on For you, so the
 * data-honesty chips (curated / following / not eligible) read the same in
 * both places. Requirements render only when the source carries them.
 */

import React from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Card, Chip, Row, T } from './kit';
import { relativeLabel } from '../core/datetime';
import type { RankedPosting } from '../careers/rank';

export function PostingCard({
  posting,
  saved,
  onSave,
}: {
  posting: RankedPosting;
  saved: boolean;
  onSave: () => void;
}) {
  const deadlineSoon =
    posting.deadline &&
    new Date(posting.deadline).getTime() - Date.now() < 14 * 86400_000;

  return (
    <Card style={{ marginBottom: 10, opacity: posting.eligible ? 1 : 0.55 }}>
      <Row gap={8} style={{ marginBottom: 6 }}>
        <Chip
          label={
            posting.kind === 'research'
              ? 'Research'
              : posting.kind === 'newgrad'
                ? 'New grad'
                : 'Internship'
          }
          tone="accent"
        />
        {posting.source === 'curated' ? <Chip label="curated" tone="warn" /> : null}
        {posting.followed ? <Chip label="following" tone="good" /> : null}
        {posting.nearCampus ? <Chip label="near you" tone="good" /> : null}
        {!posting.eligible ? (
          <Chip label={posting.ineligibleReason ?? 'not eligible'} tone="danger" />
        ) : null}
        <View style={{ flex: 1 }} />
        <T size={13} weight="700" tone={deadlineSoon ? 'danger' : 'dim'}>
          {posting.deadline ? `closes ${relativeLabel(posting.deadline)}` : 'rolling'}
        </T>
      </Row>

      <T size={16} weight="600">{posting.company}</T>
      <T size={14} tone="dim">{posting.title}</T>

      <Row gap={6} style={{ marginTop: 4 }}>
        {posting.locations.length ? (
          <T size={12} tone="faint">{posting.locations.slice(0, 3).join(' · ')}</T>
        ) : null}
        {posting.terms.length ? (
          <T size={12} tone="faint">· {posting.terms.slice(0, 2).join(', ')}</T>
        ) : null}
        {posting.sponsorship ? (
          <T size={12} tone="warn">· {posting.sponsorship}</T>
        ) : null}
      </Row>

      {posting.citizenship ? (
        <T size={12} tone="warn" style={{ marginTop: 6 }}>{posting.citizenship}</T>
      ) : null}

      {posting.requirements.length > 0 ? (
        <View style={{ marginTop: 8, gap: 2 }}>
          {posting.requirements.slice(0, 4).map((r, i) => (
            <Row key={i} gap={6} wrap={false}>
              <T size={12} tone="faint">•</T>
              <T size={13} tone="dim" style={{ flex: 1 }}>{r}</T>
            </Row>
          ))}
          {posting.source === 'curated' && posting.deadline ? (
            <T size={11} tone="faint" style={{ marginTop: 2 }}>
              Deadline from a recent cycle — verify on the program page.
            </T>
          ) : null}
        </View>
      ) : (
        <T size={12} tone="faint" style={{ marginTop: 6 }}>
          Requirements are on the posting — this feed doesn&apos;t carry them.
        </T>
      )}

      {posting.reasons.length > 0 ? (
        <T size={12} tone="accent" style={{ marginTop: 8 }}>
          {posting.reasons.join(' · ')}
        </T>
      ) : null}

      <Row gap={8} style={{ marginTop: 12 }}>
        <Chip label={saved ? '★ Saved' : '☆ Save'} selected={saved} onPress={onSave} />
        {saved && posting.deadline ? (
          <T size={11} tone="faint">on your Due list</T>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => Linking.openURL(posting.url)}>
          <T size={13} tone="accent" weight="600">Website</T>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(posting.applyUrl ?? posting.url)}>
          <T size={13} tone="accent" weight="600">· Apply →</T>
        </Pressable>
      </Row>
    </Card>
  );
}
