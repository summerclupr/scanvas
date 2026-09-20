/**
 * Expo bindings for the notification plan.
 *
 * All the judgment lives in ./rules; this file only talks to the OS. It
 * reconciles rather than re-creates: cancelling and rescheduling everything on
 * each sync would be simpler, but it makes already-delivered reminders
 * reappear and burns the iOS 64-pending-notification budget.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type { ScoredEvent } from '../core/types';
import type { NotificationPrefs } from '../core/profile';
import { planDigest, planNotifications, type PlannedNotification } from './rules';

/** iOS silently drops pending notifications past this count. */
const IOS_PENDING_LIMIT = 60;

/**
 * Controls presentation while the app is FOREGROUND. Without this, iOS
 * delivers a foreground notification silently and invisibly - you'd only see
 * a pset reminder if you happened to have the app closed.
 *
 * Sound is read from the notification's own payload so the user's preference
 * is respected per-notification rather than baked in at startup.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const wantsSound = notification.request.content.data?.sound !== false;
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: wantsSound,
        shouldSetBadge: true,
      };
    },
  });
}

/**
 * Check permission WITHOUT prompting.
 *
 * Rescheduling happens whenever notification preferences change, including on
 * boot. Using `requestPermissions` there would throw the system prompt at
 * someone who just opened Settings, so reads and requests are kept separate.
 */
export async function hasPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function requestPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    // Simulators never deliver local notifications; don't pretend otherwise.
    return false;
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    await ensureAndroidChannels();
    return true;
  }

  // Ask for alert + sound + badge explicitly. The bare call requests a
  // narrower set on iOS, which is how you end up with silent notifications
  // and no banner even though permission was "granted".
  const asked = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: true,
    },
  });

  if (asked.granted) await ensureAndroidChannels();
  return asked.granted;
}

/**
 * Android routes sound and heads-up behaviour through channels, and a
 * channel's importance is fixed once created - so deadlines and optional
 * events get separate ones. HIGH is what produces a heads-up banner.
 */
async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('deadlines', {
    name: 'Deadlines and exams',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
    enableVibrate: true,
  });
  await Notifications.setNotificationChannelAsync('deadlines-silent', {
    name: 'Deadlines and exams (silent)',
    importance: Notifications.AndroidImportance.HIGH,
    sound: undefined,
    enableVibrate: false,
  });
  await Notifications.setNotificationChannelAsync('opportunities', {
    name: 'Events for you',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('opportunities-silent', {
    name: 'Events for you (silent)',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: undefined,
    enableVibrate: false,
  });
}

/**
 * Android can't change a channel's sound after creation, so silent and audible
 * variants are separate channels and we pick per notification.
 */
function androidChannel(category: string, sound: boolean): string {
  const base = category === 'opportunity' ? 'opportunities' : 'deadlines';
  return sound ? base : `${base}-silent`;
}

interface ScheduledRecord {
  /** Our planned id. */
  planId: string;
  /** The OS handle, needed to cancel. */
  osId: string;
}

/**
 * Reconcile the OS schedule against a freshly computed plan.
 *
 * Returns what changed, which the UI surfaces after a sync so the user can see
 * the app actually did something.
 */
export async function syncSchedule(
  events: ScoredEvent[],
  prefs: NotificationPrefs,
  previous: ScheduledRecord[] = [],
  now: Date = new Date(),
): Promise<{ records: ScheduledRecord[]; added: number; removed: number; skipped: number }> {
  const plan = planNotifications(events, prefs, now);
  const digest = planDigest(events, prefs, now);
  if (digest) plan.push(digest);
  plan.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());

  // Obligations first when we have to truncate - a missed exam reminder costs
  // more than a missed club event.
  const ordered = [
    ...plan.filter((p) => p.category !== 'opportunity'),
    ...plan.filter((p) => p.category === 'opportunity'),
  ];
  const keep = ordered.slice(0, IOS_PENDING_LIMIT);
  const skipped = ordered.length - keep.length;

  const wanted = new Map(keep.map((p) => [p.id, p]));
  const existing = new Map(previous.map((r) => [r.planId, r]));

  // Cancel anything no longer in the plan.
  let removed = 0;
  for (const [planId, rec] of existing) {
    if (wanted.has(planId)) continue;
    try {
      await Notifications.cancelScheduledNotificationAsync(rec.osId);
      removed++;
    } catch {
      // Already delivered or already cancelled; nothing to do.
    }
  }

  // Schedule what's new.
  const records: ScheduledRecord[] = [];
  let added = 0;
  for (const p of keep) {
    const prior = existing.get(p.id);
    if (prior) {
      records.push(prior);
      continue;
    }
    try {
      const osId = await Notifications.scheduleNotificationAsync({
        content: {
          title: p.title,
          body: p.body,
          // `sound` in data is what the foreground handler reads; the
          // top-level `sound` is what iOS uses when the app is backgrounded.
          data: { eventId: p.eventId, category: p.category, sound: prefs.sound },
          sound: prefs.sound ? 'default' : undefined,
          interruptionLevel: p.category === 'opportunity' ? 'active' : 'timeSensitive',
          ...(Platform.OS === 'android'
            ? {
                channelId: androidChannel(p.category, prefs.sound),
                vibrate: prefs.sound ? [0, 250, 250, 250] : undefined,
              }
            : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: p.fireAt,
        },
      });
      records.push({ planId: p.id, osId });
      added++;
    } catch {
      // A single scheduling failure shouldn't abort the rest.
    }
  }

  return { records, added, removed, skipped };
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Debug helper: what the OS actually has queued right now. */
export async function pending(): Promise<Notifications.NotificationRequest[]> {
  return Notifications.getAllScheduledNotificationsAsync();
}

export type { PlannedNotification, ScheduledRecord };
