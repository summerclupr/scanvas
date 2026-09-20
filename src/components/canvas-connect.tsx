/**
 * Canvas connection.
 *
 * Canvas is the one source a student can connect in about two minutes — a
 * personal access token, no OAuth app registration — and it's the source that
 * carries the things people actually care about: psets, exams, and grades.
 *
 * The check deliberately reports back the account name and the real course
 * list. Seeing your own name and your own classes is the only convincing
 * proof that what follows is your data and not a sample.
 */

import React, { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';

import { Button, Chip, Divider, Row, T, useTheme } from './kit';
import {
  SECURE_STORAGE_AVAILABLE,
  checkCanvas,
  normalizeCanvasUrl,
  type CanvasCheck,
} from '../state/credentials';
import { useApp } from '../state/app-store';

export function CanvasConnect() {
  const c = useTheme();
  const { credentials, setCredentials, modes, runSync, syncing, updateProfile, forgetAccount } =
    useApp();

  const [url, setUrl] = useState(credentials.canvas?.baseUrl ?? 'https://canvas.mit.edu');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CanvasCheck | null>(null);

  const connected = modes.canvas === 'live';

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

  const connect = async () => {
    setBusy(true);
    setResult(null);
    const check = await checkCanvas(url, token);
    setResult(check);
    if (check.ok) {
      await setCredentials({
        ...credentials,
        canvas: { baseUrl: normalizeCanvasUrl(url), token: token.trim() },
      });
      // Adopt the real enrollment. Any previously tracked codes came from
      // sample data and would filter the entire real semester away.
      await updateProfile({ courses: (check.courses ?? []).map((c) => c.code) });
      setToken(''); // don't leave it sitting in a text field
      runSync();
    }
    setBusy(false);
  };

  const disconnect = async () => {
    // Purges the token AND everything synced from it, then falls back to
    // sample data on the next sync.
    await forgetAccount('canvas');
    setResult(null);
    runSync();
  };

  if (connected) {
    return (
      <View style={{ gap: 10 }}>
        <Row wrap={false}>
          <View style={{ flex: 1 }}>
            <Row gap={8}>
              <T size={16} weight="600">Canvas</T>
              <Chip label="live" tone="good" />
            </Row>
            <T size={13} tone="dim">{credentials.canvas?.baseUrl}</T>
          </View>
        </Row>
        <T size={12} tone="faint">
          Your assignments, exams, and grades come from here. Disconnecting
          erases everything synced from this account and cancels its reminders.
          {SECURE_STORAGE_AVAILABLE
            ? ' The token is kept in the secure store.'
            : " The token is kept in this browser's local storage."}
        </T>
        <Row gap={8}>
          <Button
            label="Disconnect & erase"
            variant="danger"
            onPress={disconnect}
            style={{ flex: 1 }}
          />
          <Button
            label={syncing ? 'Syncing...' : 'Sync now'}
            onPress={runSync}
            disabled={syncing}
            style={{ flex: 1 }}
          />
        </Row>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Row gap={8}>
        <T size={16} weight="600">Canvas</T>
        <Chip label="sample data" tone="warn" />
      </Row>
      <T size={13} tone="dim">
        Until you connect this, every assignment and grade in the app is
        invented.
      </T>

      <T size={13} weight="600" tone="dim" style={{ marginTop: 6 }}>
        Canvas address
      </T>
      <TextInput
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://canvas.mit.edu"
        placeholderTextColor={c.textFaint}
        style={input}
      />

      <T size={13} weight="600" tone="dim" style={{ marginTop: 6 }}>
        Access token
      </T>
      <TextInput
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="paste your token"
        placeholderTextColor={c.textFaint}
        style={input}
        onSubmitEditing={connect}
      />

      <View
        style={{
          backgroundColor: c.cardAlt,
          borderRadius: 10,
          padding: 12,
          gap: 4,
          marginTop: 4,
        }}>
        <T size={12} weight="600" tone="dim">How to get one (about 2 minutes)</T>
        <T size={12} tone="faint">1. Canvas → Account → Settings</T>
        <T size={12} tone="faint">2. Scroll to Approved Integrations</T>
        <T size={12} tone="faint">3. + New Access Token, name it anything</T>
        <T size={12} tone="faint">4. Copy it — Canvas shows it only once</T>
        <Row gap={8} style={{ marginTop: 6 }}>
          <Chip
            label="Open Canvas settings"
            tone="accent"
            onPress={() =>
              Linking.openURL(`${normalizeCanvasUrl(url) || 'https://canvas.mit.edu'}/profile/settings`)
            }
          />
        </Row>
      </View>

      <Button
        label={busy ? 'Checking...' : 'Connect Canvas'}
        onPress={connect}
        disabled={busy}
      />

      {result && !result.ok ? (
        <T size={13} tone="danger">{result.error}</T>
      ) : null}

      {result?.ok ? (
        <View style={{ gap: 6 }}>
          <T size={13} tone="good" weight="600">
            Connected as {result.name}
          </T>
          <Divider />
          <T size={12} tone="dim">Canvas reports these classes:</T>
          <Row gap={6}>
            {(result.courses ?? []).map((course) => (
              <Chip key={course.code} label={course.code} tone="good" />
            ))}
          </Row>
        </View>
      ) : null}
    </View>
  );
}
