/**
 * "Your fit": the four things that decide which postings are relevant.
 *
 * Each row states how much it actually does, because the four signals are
 * not equally strong and pretending otherwise would be the same mistake as
 * the sample-data episode. School in particular does very little, and says so.
 */

import React, { useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';

import { Chip, Divider, Row, T, useTheme } from './kit';
import { standing, subjectsFromCourses } from '../careers/eligibility';
import { extractResumeSkills } from '../careers/resume';
import { useApp } from '../state/app-store';

const LEVELS = ["Associate's", "Bachelor's", "Master's", 'PhD', 'MBA'] as const;

export function FitCard() {
  const c = useTheme();
  const { profile, updateProfile, ollamaConfig, ollamaStatus } = useApp();

  const [school, setSchool] = useState(profile.school);
  const [resumeText, setResumeText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const thisYear = new Date().getFullYear();
  const yearOptions = [0, 1, 2, 3, 4].map((n) => thisYear + n);
  const courseSubjects = subjectsFromCourses(profile.courses);

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

  const runExtract = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await extractResumeSkills(ollamaConfig, resumeText);
      await updateProfile({
        resumeSkills: [...new Set([...profile.resumeSkills, ...out.skills])],
        // Fields the resume implies are merged into interests, not replaced.
        fields: [...new Set([...profile.fields, ...out.fields])],
      });
      setResumeText('');
      setShowPaste(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeSkill = (s: string) =>
    updateProfile({ resumeSkills: profile.resumeSkills.filter((x) => x !== s) });

  return (
    <View style={{ gap: 16 }}>
      {/* --- year --- */}
      <View style={{ gap: 8 }}>
        <View>
          <T size={15} weight="600">Year</T>
          <T size={13} tone="dim">
            {profile.gradYear
              ? `${standing(profile.gradYear)} · graduating ${profile.gradYear}`
              : 'Hides PhD- and MBA-only roles, and anything starting after you graduate.'}
          </T>
        </View>
        <Row gap={6}>
          {yearOptions.map((y) => (
            <Chip
              key={y}
              label={String(y)}
              selected={profile.gradYear === y}
              onPress={() => updateProfile({ gradYear: profile.gradYear === y ? null : y })}
            />
          ))}
        </Row>
        <Row gap={6}>
          {LEVELS.map((l) => (
            <Chip
              key={l}
              label={l}
              selected={profile.degreeLevel === l}
              onPress={() => updateProfile({ degreeLevel: l })}
            />
          ))}
        </Row>
      </View>

      <Divider />

      {/* --- school --- */}
      <View style={{ gap: 8 }}>
        <View>
          <T size={15} weight="600">School</T>
          <T size={13} tone="dim">
            Unlocks school-restricted programs and nudges nearby roles up.
          </T>
        </View>
        <Row gap={8} wrap={false}>
          <TextInput
            value={school}
            onChangeText={setSchool}
            onBlur={() => updateProfile({ school: school.trim() })}
            onSubmitEditing={() => updateProfile({ school: school.trim() })}
            placeholder="e.g. MIT"
            placeholderTextColor={c.textFaint}
            style={[input, { flex: 1 }]}
            returnKeyType="done"
          />
          <Chip label="Save" tone="accent" onPress={() => updateProfile({ school: school.trim() })} />
        </Row>
        <T size={11} tone="faint">
          Honest limit: the live internship feed carries no school eligibility —
          nearly all of them accept any school — so this only affects curated
          programs like UROP plus a small location boost.
        </T>
      </View>

      <Divider />

      {/* --- classes --- */}
      <View style={{ gap: 8 }}>
        <View>
          <T size={15} weight="600">Classes</T>
          <T size={13} tone="dim">
            {profile.courses.length
              ? `${profile.courses.length} from Canvas → ${courseSubjects.length} subject${courseSubjects.length === 1 ? '' : 's'}`
              : 'Connect Canvas, or tick classes in Settings.'}
          </T>
        </View>
        {courseSubjects.length > 0 ? (
          <Row gap={6}>
            {courseSubjects.map((s) => (
              <Chip key={s} label={s} tone="accent" />
            ))}
          </Row>
        ) : null}
        {profile.courses.length > 0 && courseSubjects.length === 0 ? (
          <T size={11} tone="faint">
            Couldn&apos;t map {profile.courses.join(', ')} to subjects — course-number
            mapping covers MIT numbering and common letter prefixes.
          </T>
        ) : null}
      </View>

      <Divider />

      {/* --- resume --- */}
      <View style={{ gap: 8 }}>
        <View>
          <T size={15} weight="600">Resume skills</T>
          <T size={13} tone="dim">
            {profile.resumeSkills.length
              ? `${profile.resumeSkills.length} skills matched against postings`
              : 'Your local model reads your resume and pulls out what you can do.'}
          </T>
        </View>

        {profile.resumeSkills.length > 0 ? (
          <Row gap={6}>
            {profile.resumeSkills.map((s) => (
              <Chip key={s} label={`${s}  ×`} selected onPress={() => removeSkill(s)} />
            ))}
          </Row>
        ) : null}

        {showPaste ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={resumeText}
              onChangeText={setResumeText}
              placeholder="Open your resume, select all, paste here..."
              placeholderTextColor={c.textFaint}
              multiline
              numberOfLines={6}
              style={[input, { minHeight: 120, textAlignVertical: 'top' }]}
            />
            <T size={11} tone="faint">
              Goes only to your own Ollama at {ollamaConfig.host} — never uploaded.
              PDFs aren&apos;t parsed on-device; select-all and paste is the
              reliable path.
            </T>
            <Row gap={8}>
              <Chip
                label={busy ? 'Reading...' : 'Extract skills'}
                tone="accent"
                onPress={busy ? undefined : runExtract}
              />
              <Chip label="Cancel" onPress={() => setShowPaste(false)} />
              {busy ? <ActivityIndicator size="small" color={c.accent} /> : null}
            </Row>
          </View>
        ) : (
          <Row gap={8}>
            <Chip
              label={profile.resumeSkills.length ? 'Add from resume' : 'Paste resume'}
              tone="accent"
              onPress={() => setShowPaste(true)}
            />
            {profile.resumeSkills.length ? (
              <Chip label="Clear" onPress={() => updateProfile({ resumeSkills: [] })} />
            ) : null}
          </Row>
        )}

        {ollamaStatus.checked && !ollamaStatus.reachable ? (
          <T size={11} tone="warn">
            Local model offline — start Ollama to extract skills.
          </T>
        ) : null}
        {error ? <T size={12} tone="danger">{error}</T> : null}
      </View>
    </View>
  );
}
