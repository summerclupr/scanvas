/**
 * Shared UI primitives.
 *
 * The visual language follows the two-lane model: obligations are red/amber
 * and dense, opportunities are blue and airy. A student glancing at this
 * should be able to tell "work I owe" from "things I could do" without
 * reading a word.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

export interface Palette {
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  warn: string;
  warnSoft: string;
  good: string;
  goodSoft: string;
}

export const palette: Record<'light' | 'dark', Palette> = {
  light: {
    bg: '#FBFBFD',
    card: '#FFFFFF',
    cardAlt: '#F4F5F8',
    border: '#E3E5EB',
    text: '#14161A',
    textDim: '#646B78',
    textFaint: '#9AA1AE',
    accent: '#2F6BFF',
    accentSoft: '#E8EFFF',
    danger: '#D93025',
    dangerSoft: '#FDECEA',
    warn: '#B26A00',
    warnSoft: '#FFF3DC',
    good: '#1E7F4F',
    goodSoft: '#E3F5EC',
  },
  dark: {
    bg: '#0B0C0F',
    card: '#15171C',
    cardAlt: '#1D2026',
    border: '#282C34',
    text: '#F2F4F8',
    textDim: '#A2AAB8',
    textFaint: '#6D7686',
    accent: '#6E9BFF',
    accentSoft: '#17233F',
    danger: '#FF6B5E',
    dangerSoft: '#3A1A18',
    warn: '#E8A33D',
    warnSoft: '#3A2C12',
    good: '#4ECB8B',
    goodSoft: '#12301F',
  },
};

export function useTheme(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? palette.dark : palette.light;
}

// --- text ------------------------------------------------------------------

type TextTone = 'default' | 'dim' | 'faint' | 'accent' | 'danger' | 'warn' | 'good';

export function T({
  children,
  size = 15,
  weight = '400',
  tone = 'default',
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  size?: number;
  weight?: TextStyle['fontWeight'];
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const c = useTheme();
  const color = {
    default: c.text,
    dim: c.textDim,
    faint: c.textFaint,
    accent: c.accent,
    danger: c.danger,
    warn: c.warn,
    good: c.good,
  }[tone];
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color, fontSize: size, fontWeight: weight, lineHeight: size * 1.35 }, style]}>
      {children}
    </Text>
  );
}

// --- layout ----------------------------------------------------------------

export function Card({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const body = (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: 14,
          padding: 14,
        },
        style,
      ]}>
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

export function SectionHeader({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <View style={{ paddingHorizontal: 4, paddingTop: 22, paddingBottom: 8, gap: 2 }}>
      <T size={13} weight="700" tone="faint" style={{ letterSpacing: 0.8 }}>
        {title.toUpperCase()}
      </T>
      {detail ? <T size={13} tone="faint">{detail}</T> : null}
    </View>
  );
}

// --- chips -----------------------------------------------------------------

export function Chip({
  label,
  selected,
  onPress,
  tone = 'default',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'danger' | 'warn' | 'good' | 'accent';
}) {
  const c = useTheme();
  const toneColor = {
    default: { fg: c.textDim, bg: c.cardAlt },
    danger: { fg: c.danger, bg: c.dangerSoft },
    warn: { fg: c.warn, bg: c.warnSoft },
    good: { fg: c.good, bg: c.goodSoft },
    accent: { fg: c.accent, bg: c.accentSoft },
  }[tone];

  const bg = selected ? c.accent : toneColor.bg;
  const fg = selected ? '#FFFFFF' : toneColor.fg;

  const inner = (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderWidth: selected ? 0 : StyleSheet.hairlineWidth,
        borderColor: c.border,
      }}>
      <Text style={{ color: fg, fontSize: 13, fontWeight: selected ? '600' : '500' }}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {inner}
    </Pressable>
  );
}

export function Row({
  children,
  gap = 8,
  wrap = true,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', gap, alignItems: 'center' },
        style,
      ]}>
      {children}
    </View>
  );
}

// --- buttons ---------------------------------------------------------------

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const styles = {
    primary: { bg: c.accent, fg: '#FFFFFF', border: 'transparent' },
    secondary: { bg: c.cardAlt, fg: c.text, border: c.border },
    ghost: { bg: 'transparent', fg: c.accent, border: 'transparent' },
    danger: { bg: c.dangerSoft, fg: c.danger, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          backgroundColor: styles.bg,
          borderColor: styles.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: 12,
          paddingVertical: 14,
          paddingHorizontal: 18,
          alignItems: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}>
      <Text style={{ color: styles.fg, fontWeight: '600', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

/** Horizontal score/urgency meter. */
export function Meter({
  value,
  tone = 'accent',
}: {
  value: number;
  tone?: 'accent' | 'danger' | 'warn';
}) {
  const c = useTheme();
  const fill = { accent: c.accent, danger: c.danger, warn: c.warn }[tone];
  return (
    <View
      style={{
        height: 4,
        borderRadius: 2,
        backgroundColor: c.cardAlt,
        overflow: 'hidden',
      }}>
      <View
        style={{
          width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`,
          height: '100%',
          backgroundColor: fill,
        }}
      />
    </View>
  );
}

export function Divider() {
  const c = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ paddingVertical: 48, paddingHorizontal: 24, alignItems: 'center', gap: 6 }}>
      <T size={16} weight="600" tone="dim">{title}</T>
      {detail ? (
        <T size={14} tone="faint" style={{ textAlign: 'center' }}>{detail}</T>
      ) : null}
    </View>
  );
}
