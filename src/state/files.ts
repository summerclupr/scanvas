/**
 * Local document store: resume, transcript, anything else worth having at
 * hand when an application asks for it.
 *
 * On the phone, files are COPIED into the app's private documents directory -
 * the original can move or be deleted and the stored copy survives, and
 * nothing is uploaded anywhere. On web there is no filesystem, so files are
 * held as base64 in AsyncStorage with a hard size cap; that's a dev/demo
 * convenience, and the UI says so.
 *
 * A transcript is sensitive. It stays on the device like everything else in
 * this app, and "Remove" genuinely deletes the copy.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface StoredFile {
  /** Slot id: 'resume', 'transcript', or a timestamp for extras. */
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  addedAt: string;
  /** Native: absolute file URI of our private copy. Web: AsyncStorage key. */
  location: string;
}

const INDEX_KEY = 'agenda:files:v1';
const WEB_BLOB_PREFIX = 'agenda:fileblob:';
/** Web storage is ~5MB total; keep any single file well under it. */
const WEB_MAX_BYTES = 2_500_000;

const IS_WEB = Platform.OS === 'web';

function filesDir(): Directory {
  const dir = new Directory(Paths.document, 'files');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export async function listFiles(): Promise<StoredFile[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as StoredFile[]) : [];
  } catch {
    return [];
  }
}

async function saveIndex(files: StoredFile[]): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(files));
}

export interface AddResult {
  ok: boolean;
  file?: StoredFile;
  /** 'cancelled' is not an error; the UI stays quiet about it. */
  error?: string;
  cancelled?: boolean;
}

/**
 * Pick a document and store it under the given slot id, replacing whatever
 * held that slot before.
 */
export async function addFile(id: string): Promise<AddResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]) return { ok: false, cancelled: true };
  const asset = picked.assets[0];

  const entry: StoredFile = {
    id,
    name: asset.name ?? id,
    size: asset.size ?? 0,
    mimeType: asset.mimeType,
    addedAt: new Date().toISOString(),
    location: '',
  };

  try {
    if (IS_WEB) {
      if ((asset.size ?? 0) > WEB_MAX_BYTES) {
        return {
          ok: false,
          error: `Too large for browser storage (${Math.round((asset.size ?? 0) / 1e6)}MB > 2.5MB).`,
        };
      }
      // On web the picker returns a fetchable blob URI.
      const blob = await (await fetch(asset.uri)).blob();
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('read failed'));
        r.readAsDataURL(blob);
      });
      entry.location = `${WEB_BLOB_PREFIX}${id}`;
      await AsyncStorage.setItem(entry.location, b64);
    } else {
      const dest = new File(filesDir(), `${id}-${entry.name}`);
      if (dest.exists) dest.delete();
      new File(asset.uri).copy(dest);
      entry.location = dest.uri;
    }

    const files = (await listFiles()).filter((f) => f.id !== id);
    // Native: remove the old copy the index just dropped.
    files.push(entry);
    await saveIndex(files);
    return { ok: true, file: entry };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Open / share the stored copy - the OS share sheet on device. */
export async function openFile(file: StoredFile): Promise<string | null> {
  try {
    if (IS_WEB) {
      const b64 = await AsyncStorage.getItem(file.location);
      if (!b64) return 'File data missing from browser storage.';
      // data: URLs are blocked as top-level navigations; use a Blob URL.
      const res = await fetch(b64);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      return null;
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.location, { mimeType: file.mimeType });
      return null;
    }
    return 'Sharing is not available on this device.';
  } catch (err) {
    return (err as Error).message;
  }
}

export async function removeFile(id: string): Promise<void> {
  const files = await listFiles();
  const target = files.find((f) => f.id === id);
  if (target) {
    try {
      if (IS_WEB) await AsyncStorage.removeItem(target.location);
      else {
        const f = new File(target.location);
        if (f.exists) f.delete();
      }
    } catch {
      // The index entry still goes; a stray blob is better than a stuck UI.
    }
  }
  await saveIndex(files.filter((f) => f.id !== id));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
