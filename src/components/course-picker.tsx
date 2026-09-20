/**
 * Course picker.
 *
 * Toggling is non-destructive: an untracked class stays visible as an unfilled
 * chip so it can be turned back on. The first version removed it from the
 * array outright, which made deselecting a one-way door - tap 18.06 by
 * mistake during onboarding and it was gone with no way back short of
 * starting over.
 *
 * The available set is the union of what Canvas reported, what's turned up in
 * synced events, and anything typed by hand, so a class that only appears in
 * one source still shows up.
 */

import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Chip, Row, T, useTheme } from './kit';

/** 6.1010, 18.06, 21M.301, HST.121 — MIT's course numbering, loosely. */
const COURSE_CODE_RE = /^(\d{1,2}[A-Z]?|HST|STS|CMS|ESD|WGS)\.[0-9]{2,4}[A-Z]?$/i;

export function isValidCourseCode(code: string): boolean {
  return COURSE_CODE_RE.test(code.trim());
}

export function CoursePicker({
  available,
  selected,
  onChange,
  showInput = true,
}: {
  /** Everything we know about, tracked or not. */
  available: string[];
  /** The subset the student is actually taking. */
  selected: string[];
  onChange: (next: string[]) => void;
  showInput?: boolean;
}) {
  const c = useTheme();
  const [draft, setDraft] = useState('');

  const all = useMemo(
    () => [...new Set([...available, ...selected])].sort(),
    [available, selected],
  );

  const toggle = (code: string) =>
    onChange(
      selected.includes(code)
        ? selected.filter((x) => x !== code)
        : [...selected, code].sort(),
    );

  const add = () => {
    const code = draft.trim().replace(/\s+/g, '');
    if (!code) return;
    if (selected.some((x) => x.toLowerCase() === code.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...selected, code].sort());
    setDraft('');
  };

  const draftLooksWrong = draft.trim().length > 0 && !isValidCourseCode(draft);

  return (
    <View style={{ gap: 10 }}>
      {all.length > 0 ? (
        <Row gap={8}>
          {all.map((code) => (
            <Chip
              key={code}
              label={code}
              selected={selected.includes(code)}
              onPress={() => toggle(code)}
            />
          ))}
        </Row>
      ) : (
        <T size={14} tone="faint">
          No classes yet. Sync Canvas, or add one below.
        </T>
      )}

      {selected.length === 0 && all.length > 0 ? (
        <T size={13} tone="warn">
          Nothing selected — every class&apos;s work will show, since we
          can&apos;t tell which are yours.
        </T>
      ) : null}

      {showInput ? (
        <>
          <Row gap={8} wrap={false}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a class, e.g. 6.3900"
              placeholderTextColor={c.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={add}
              returnKeyType="done"
              style={{
                backgroundColor: c.cardAlt,
                borderColor: draftLooksWrong ? c.warn : c.border,
                borderWidth: 1,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: c.text,
                fontSize: 15,
                flex: 1,
              }}
            />
            <Chip label="Add" tone="accent" onPress={add} />
          </Row>
          {draftLooksWrong ? (
            <T size={12} tone="warn">
              That doesn&apos;t look like a course number. Added anyway if you
              tap Add.
            </T>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
