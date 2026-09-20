/**
 * Application documents: resume, transcript, plus anything extra.
 *
 * Lives at the top of the Careers tab because that's the moment you need
 * them - an application page is open and it wants a PDF. Files are copied
 * into the app's private storage on device; nothing is uploaded.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import {
  addFile,
  formatSize,
  listFiles,
  openFile,
  removeFile,
  type StoredFile,
} from '../state/files';
import { Chip, Divider, Row, T, useTheme } from './kit';
import { confirm } from './dialog';

const SLOTS: { id: string; label: string; hint: string }[] = [
  { id: 'resume', label: 'Resume', hint: 'The PDF you attach everywhere' },
  { id: 'transcript', label: 'Transcript', hint: 'Grades report from the registrar' },
];

export function FilesCard() {
  const c = useTheme();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => setFiles(await listFiles()), []);
  useEffect(() => {
    reload();
  }, [reload]);

  const pick = async (id: string) => {
    setBusy(id);
    setError(null);
    const res = await addFile(id);
    if (!res.ok && !res.cancelled) setError(res.error ?? 'Could not store the file');
    await reload();
    setBusy(null);
  };

  const open = async (f: StoredFile) => {
    const err = await openFile(f);
    if (err) setError(err);
  };

  const confirmRemove = async (f: StoredFile) => {
    const ok = await confirm(`Remove ${f.name}?`, 'Deletes the stored copy.', {
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    await removeFile(f.id);
    await reload();
  };

  const byId = (id: string) => files.find((f) => f.id === id);
  const extras = files.filter((f) => !SLOTS.some((s) => s.id === f.id));

  const slotRow = (id: string, label: string, hint: string) => {
    const f = byId(id);
    return (
      <Row key={id} wrap={false} style={{ paddingVertical: 6 }}>
        <View style={{ flex: 1 }}>
          <T size={15} weight="600">{label}</T>
          <T size={12} tone="faint" numberOfLines={1}>
            {f ? `${f.name} · ${formatSize(f.size)}` : hint}
          </T>
        </View>
        {f ? (
          <Row gap={6} wrap={false}>
            <Chip label="Open" tone="accent" onPress={() => open(f)} />
            <Chip label={busy === id ? '...' : 'Replace'} onPress={() => pick(id)} />
            <Chip label="✕" tone="danger" onPress={() => confirmRemove(f)} />
          </Row>
        ) : (
          <Chip
            label={busy === id ? '...' : 'Add'}
            tone="accent"
            onPress={() => pick(id)}
          />
        )}
      </Row>
    );
  };

  return (
    <View>
      <Row wrap={false} style={{ marginBottom: 4 }}>
        <T size={16} weight="700" style={{ flex: 1 }}>Your documents</T>
        <Chip
          label="+ Other file"
          onPress={() => pick(`extra-${Date.now()}`)}
        />
      </Row>
      <T size={12} tone="faint" style={{ marginBottom: 6 }}>
        Stored only on this device — ready when an application asks.
        {Platform.OS === 'web' ? ' (Browser build: 2.5MB per file.)' : ''}
      </T>

      {SLOTS.map((s) => slotRow(s.id, s.label, s.hint))}

      {extras.length > 0 ? (
        <>
          <Divider />
          {extras.map((f) => (
            <Row key={f.id} wrap={false} style={{ paddingVertical: 6 }}>
              <View style={{ flex: 1 }}>
                <T size={14} numberOfLines={1}>{f.name}</T>
                <T size={12} tone="faint">{formatSize(f.size)}</T>
              </View>
              <Row gap={6} wrap={false}>
                <Chip label="Open" tone="accent" onPress={() => open(f)} />
                <Chip label="✕" tone="danger" onPress={() => confirmRemove(f)} />
              </Row>
            </Row>
          ))}
        </>
      ) : null}

      {error ? <T size={12} tone="danger" style={{ marginTop: 6 }}>{error}</T> : null}
    </View>
  );
}
