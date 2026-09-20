/**
 * "This is not your data" banner.
 *
 * This exists because of a real failure: the app ran entirely on recorded
 * sample payloads while presenting them as "7 things you owe" and a grade
 * average. Everything was internally consistent and completely fabricated,
 * and there was nothing on screen saying so - only a quiet line in Settings.
 *
 * Any screen showing sample coursework has to say so where the numbers are,
 * not three taps away.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { T, useTheme } from './kit';
import { SOURCE_LABELS, type SourceId } from '../core/types';
import { useApp } from '../state/app-store';

const labelOf = (id: SourceId) => SOURCE_LABELS[id];

/**
 * `sources` is which sources actually feed the screen. Coursework comes only
 * from Canvas, so once Canvas is connected the Due and Work tabs are showing
 * real data and must not claim otherwise - the banner was previously global
 * and told users their real deadlines were invented.
 */
export function DemoBanner({
  what = 'this',
  sources,
}: {
  what?: string;
  sources?: SourceId[];
}) {
  const c = useTheme();
  const { modes, profile } = useApp();

  const relevant = (sources ?? profile.enabledSources).filter((id) =>
    profile.enabledSources.includes(id),
  );
  const demoSources = relevant.filter((id) => modes[id] === 'demo');
  const liveSources = relevant.filter((id) => modes[id] === 'live');

  if (demoSources.length === 0) return null;

  return (
    <Pressable onPress={() => router.push('/settings')}>
      <View
        style={{
          backgroundColor: c.warnSoft,
          borderColor: c.warn,
          borderWidth: 1,
          borderRadius: 12,
          padding: 12,
          gap: 3,
        }}>
        <T size={13} weight="700" tone="warn">
          Sample data — not your account
        </T>
        <T size={12} tone="warn">
          {liveSources.length > 0
            ? `Some of ${what} is real (${liveSources.map(labelOf).join(', ')}), but ${demoSources.map(labelOf).join(' and ')} still show invented examples.`
            : `All of ${what} is invented for the demo. Connect an account in Settings to see the real thing.`}
        </T>
        <T size={12} weight="600" tone="warn" style={{ marginTop: 2 }}>
          Connect an account →
        </T>
      </View>
    </Pressable>
  );
}
