/**
 * The Scanvas brand: mark plus wordmark.
 *
 * The mark is a PNG rendered from assets/brand/scanvas-mark.svg (see
 * `npm run brand`) rather than inline SVG, because react-native-svg isn't a
 * dependency and expo-image already is. The wordmark is text, so it inherits
 * the theme and scales with the user's font size.
 */

import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { T, useTheme } from './kit';

const mark = require('../../assets/images/scanvas-mark.png');

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={mark}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
      contentFit="contain"
      accessibilityLabel="Scanvas"
    />
  );
}

export function Wordmark({ size = 20 }: { size?: number }) {
  const c = useTheme();
  return (
    <T size={size} weight="800" style={{ letterSpacing: -0.4, lineHeight: size * 1.15 }}>
      <T size={size} weight="800" style={{ color: c.accent, letterSpacing: -0.4 }}>
        S
      </T>
      canvas
    </T>
  );
}

/** Mark + wordmark in a row. `tagline` adds the one-line pitch underneath. */
export function Brand({
  size = 28,
  tagline,
  style,
}: {
  size?: number;
  tagline?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.35 }}>
        <LogoMark size={size} />
        <Wordmark size={size * 0.75} />
      </View>
      {tagline ? (
        <T size={13} tone="dim" style={{ marginTop: 6 }}>
          {tagline}
        </T>
      ) : null}
    </View>
  );
}
