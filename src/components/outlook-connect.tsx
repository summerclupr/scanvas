/**
 * Outlook connection, via a pasted Microsoft Graph access token.
 *
 * The honest trade-off, stated in the UI too: without registering an Azure AD
 * app there is no long-lived token. Graph Explorer hands you a real one for
 * your own account in about a minute, but it expires after roughly an hour.
 * That makes this flow great for a demo and unusable as a daily driver - the
 * daily-driver fix is an app registration with proper OAuth, which is a
 * server-side setup task, not something this app can do for you.
 */

import React, { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';

import { Button, Chip, Divider, Row, T, useTheme } from './kit';
import {
  checkIcs,
  checkOutlook,
  type IcsCheck,
  type OutlookCheck,
} from '../state/credentials';
import { useApp } from '../state/app-store';

const GRAPH_EXPLORER = 'https://developer.microsoft.com/en-us/graph/graph-explorer';

export function OutlookConnect() {
  const c = useTheme();
  const { credentials, setCredentials, modes, runSync, syncing, forgetAccount } =
    useApp();

  const [token, setToken] = useState('');
  const [icsUrl, setIcsUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OutlookCheck | null>(null);
  const [icsResult, setIcsResult] = useState<IcsCheck | null>(null);

  const connected = modes.outlook === 'live';
  const viaIcs = Boolean(credentials.outlook?.icsUrl && !credentials.outlook?.accessToken);

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
    const check = await checkOutlook(token);
    setResult(check);
    if (check.ok) {
      await setCredentials({
        ...credentials,
        outlook: { accessToken: token.trim() },
      });
      setToken('');
      runSync();
    }
    setBusy(false);
  };

  const connectIcs = async () => {
    setBusy(true);
    setIcsResult(null);
    const check = await checkIcs(icsUrl);
    setIcsResult(check);
    if (check.ok) {
      await setCredentials({
        ...credentials,
        outlook: { icsUrl: icsUrl.trim() },
      });
      setIcsUrl('');
      runSync();
    }
    setBusy(false);
  };

  const disconnect = async () => {
    await forgetAccount('outlook');
    setResult(null);
    setIcsResult(null);
    runSync();
  };

  if (connected) {
    return (
      <View style={{ gap: 10 }}>
        <Row gap={8}>
          <T size={16} weight="600">Outlook</T>
          <Chip label={viaIcs ? 'live · calendar only' : 'live'} tone="good" />
        </Row>
        <T size={12} tone="faint">
          {viaIcs
            ? 'Your published calendar feed. Classes and meetings sync; ' +
              'mailing-list events are not available this way. The link is ' +
              'long-lived — no token to refresh.'
            : 'Calendar and mailing-list events come from your Microsoft ' +
              'account. Graph Explorer tokens expire after about an hour — ' +
              'when syncs start failing with 401, paste a fresh one.'}
        </T>
        <Row gap={8}>
          <Button
            label="Disconnect & erase"
            variant="danger"
            onPress={disconnect}
            disabled={syncing}
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
        <T size={16} weight="600">Outlook</T>
        <Chip label="sample data" tone="warn" />
      </Row>
      <T size={13} tone="dim">
        Reads your calendar plus event announcements from mailing lists. Until
        connected, these are invented examples.
      </T>

      <T size={13} weight="600" tone="dim" style={{ marginTop: 6 }}>
        Option A - calendar link (works even when consent needs admin approval)
      </T>
      <TextInput
        value={icsUrl}
        onChangeText={setIcsUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://outlook.office365.com/owa/calendar/.../calendar.ics"
        placeholderTextColor={c.textFaint}
        style={input}
        onSubmitEditing={connectIcs}
      />
      <View style={{ backgroundColor: c.cardAlt, borderRadius: 10, padding: 12, gap: 4 }}>
        <T size={12} weight="600" tone="dim">How to get the link (about a minute)</T>
        <T size={12} tone="faint">1. outlook.office365.com → gear icon → Calendar → Shared calendars</T>
        <T size={12} tone="faint">2. Under &quot;Publish a calendar&quot;: pick Calendar + &quot;Can view all details&quot; → Publish</T>
        <T size={12} tone="faint">3. Copy the ICS link (the one ending .ics, not HTML)</T>
        <T size={12} tone="faint" style={{ marginTop: 4 }}>
          Calendar only — no mailing-list events, since a calendar link
          can&apos;t read mail. Treat the URL like a password: anyone with it
          can read your calendar.
        </T>
      </View>
      <Button
        label={busy ? 'Checking...' : 'Connect calendar link'}
        onPress={connectIcs}
        disabled={busy}
      />
      {icsResult && !icsResult.ok ? (
        <T size={13} tone="danger">{icsResult.error}</T>
      ) : null}
      {icsResult?.ok ? (
        <T size={13} tone="good" weight="600">
          Found &quot;{icsResult.calendarName ?? 'calendar'}&quot; with {icsResult.eventCount} entries
        </T>
      ) : null}

      <Divider />

      <T size={13} weight="600" tone="dim" style={{ marginTop: 6 }}>
        Option B - Microsoft Graph access token (calendar + mail)
      </T>
      <TextInput
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="paste a Graph token (eyJ...)"
        placeholderTextColor={c.textFaint}
        style={input}
        onSubmitEditing={connect}
      />

      <View style={{ backgroundColor: c.cardAlt, borderRadius: 10, padding: 12, gap: 4 }}>
        <T size={12} weight="600" tone="dim">How to get one (about 2 minutes)</T>
        <T size={12} tone="faint">1. Open Graph Explorer, sign in (person icon, top left) with your MIT email</T>
        <T size={12} tone="faint">
          2. In the request bar, run GET  /me/messages?$top=1  — it fails at
          first: open the &quot;Modify permissions&quot; tab, Consent to Mail.Read,
          run again
        </T>
        <T size={12} tone="faint">
          3. Same with  /me/events?$top=1  — Consent to Calendars.Read, run
          until you see JSON
        </T>
        <T size={12} tone="faint">
          4. Only after BOTH succeed: &quot;Access token&quot; tab → copy. Copying
          earlier gives a token missing those permissions.
        </T>
        <T size={12} tone="warn" style={{ marginTop: 4 }}>
          Expires after ~1 hour. Fine for a demo; a permanent connection needs
          an Azure app registration (see README).
        </T>
        <Row gap={8} style={{ marginTop: 6 }}>
          <Chip
            label="Open Graph Explorer"
            tone="accent"
            onPress={() => Linking.openURL(GRAPH_EXPLORER)}
          />
        </Row>
      </View>

      <Button
        label={busy ? 'Checking...' : 'Connect Outlook'}
        onPress={connect}
        disabled={busy}
      />

      {result && !result.ok ? <T size={13} tone="danger">{result.error}</T> : null}

      {result?.ok ? (
        <View style={{ gap: 6 }}>
          <T size={13} tone="good" weight="600">
            Connected as {result.name} ({result.email})
          </T>
          <Divider />
          <Row gap={6}>
            <Chip
              label={result.canReadCalendar ? 'calendar ✓' : 'calendar ✗'}
              tone={result.canReadCalendar ? 'good' : 'danger'}
            />
            <Chip
              label={result.canReadMail ? 'mail ✓' : 'mail ✗'}
              tone={result.canReadMail ? 'good' : 'danger'}
            />
          </Row>
          {!result.canReadMail || !result.canReadCalendar ? (
            <T size={12} tone="warn">
              Missing permission — in Graph Explorer, run the corresponding
              sample query once and consent, then paste a fresh token.
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
