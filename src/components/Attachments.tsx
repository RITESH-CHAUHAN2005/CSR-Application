// Document attachments — shared by Projects, Expenditures and Fund Receipts
// (labelled "Attach Proof" there). Bytes live in MongoDB, served by the same
// backend the website uses.
//
//   • ANY file type — photo, PDF, doc, CSV, anything.
//   • NO limit on how many documents a record carries. The picker is multi-select
//     and each file is one POST to the single-file endpoint.
//   • 15 MB per file, enforced server-side (413). This cap CANNOT be lifted: the
//     bytes live inside the MongoDB document and MongoDB rejects any document
//     over 16 MB. The check here just gives a friendlier message than a 413.
//
// Two modes:
//   • existing record (recordId set) → the server list is loaded and every pick
//     uploads straight away.
//   • new record (recordId null)     → picks are staged in memory; the caller
//     uploads them with uploadStaged() once the record has an id.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { pick, errorCodes, isErrorWithCode } from '@react-native-documents/picker';
import { shareDataUrl } from '../share';
import { Paperclip } from 'phosphor-react-native/src/icons/Paperclip';
import { DownloadSimple } from 'phosphor-react-native/src/icons/DownloadSimple';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { File as FileIcon } from 'phosphor-react-native/src/icons/File';
import { theme } from '../theme';
import { api } from '../api';

export type DocParent = 'projects' | 'expenditures' | 'receipts';
// A file chosen on a NEW record — held in memory until the record exists.
export type StagedFile = { uri: string; name: string; type: string; size: number };
type ServerDoc = { id: string; name: string; size: number; contentType: string };

// Hard server limit — see the note at the top of the file. Not configurable.
export const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per file

const prettySize = (b: number) =>
  b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB`
  : b >= 1024 ? `${Math.round(b / 1024)} KB`
  : `${b || 0} B`;

// Open the native picker (multi-select, any file type) and return whatever passed
// the per-file size check.
async function pickFiles(): Promise<StagedFile[]> {
  try {
    const picked = await pick({ allowMultiSelection: true });
    const files: StagedFile[] = picked.map(f => ({
      uri: f.uri,
      name: f.name || 'document',
      type: f.type || 'application/octet-stream',
      size: f.size || 0,
    }));
    const tooBig = files.filter(f => f.size > MAX_BYTES);
    if (tooBig.length) {
      Alert.alert(
        'File too large',
        `${tooBig.map(f => f.name).join(', ')} — each file must be 15 MB or smaller. ` +
        'This limit comes from the database and cannot be raised.',
      );
    }
    return files.filter(f => f.size <= MAX_BYTES);
  } catch (e) {
    // The user simply backing out of the picker is not an error.
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return [];
    Alert.alert('Could not open the file picker', (e as any)?.message || 'Please try again.');
    return [];
  }
}

// Upload files staged on a brand-new record. Partial failures are reported but
// never lose the record itself (it is already saved by the time this runs).
export async function uploadStaged(parent: DocParent, id: string, files: StagedFile[]) {
  const failed: string[] = [];
  for (const f of files) {
    try {
      await api.uploadDocument(parent, id, f);
    } catch {
      failed.push(f.name);
    }
  }
  if (failed.length) {
    Alert.alert(
      'Some files did not upload',
      `The record was saved, but these could not be attached: ${failed.join(', ')}. Open the record and attach them again.`,
    );
  }
}

type Props = {
  parent: DocParent;
  recordId: string | null;               // null → new record (stage locally)
  staged: StagedFile[];
  onStagedChange: (files: StagedFile[]) => void;
  canEdit: boolean;
};

export default function Attachments({ parent, recordId, staged, onStagedChange, canEdit }: Props) {
  const [docs, setDocs] = useState<ServerDoc[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!recordId) { setDocs([]); return; }
    try {
      setDocs(await api.listDocuments(parent, recordId));
    } catch {
      setDocs([]); // a listing failure shouldn't block the form
    }
  }, [parent, recordId]);

  useEffect(() => { load(); }, [load]);

  const count = docs.length + staged.length;

  const onPick = async () => {
    const files = await pickFiles();
    if (!files.length) return;

    if (!recordId) { onStagedChange([...staged, ...files]); return; }

    // Existing record — upload right away.
    setBusy(true);
    const failed: string[] = [];
    for (const f of files) {
      try { await api.uploadDocument(parent, recordId, f); } catch (e: any) { failed.push(`${f.name} (${e?.message || 'failed'})`); }
    }
    await load();
    setBusy(false);
    if (failed.length) Alert.alert('Upload failed', failed.join('\n'));
  };

  // Pull the bytes through axios (the native download can't set an auth header)
  // and hand the file to the share sheet. Any signed-in role can do this.
  const onDownload = async (d: ServerDoc) => {
    setBusy(true);
    try {
      const url = await api.documentDataUrl(parent, recordId!, d.id, d.contentType);
      await shareDataUrl(url, d.name, d.contentType || 'application/octet-stream');
    } catch (e: any) {
      if (!/cancel/i.test(String(e?.message || ''))) {
        Alert.alert('Could not open the document', e?.message || 'Please try again.');
      }
    }
    setBusy(false);
  };

  const onDeleteDoc = (d: ServerDoc) => {
    Alert.alert('Remove document?', `"${d.name}" will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try { await api.deleteDocument(parent, recordId!, d.id); await load(); }
          catch (e: any) { Alert.alert('Delete failed', e?.message || 'Please try again.'); }
          setBusy(false);
        },
      },
    ]);
  };

  const removeStaged = (i: number) => onStagedChange(staged.filter((_, idx) => idx !== i));

  return (
    <View style={styles.wrap}>
      {count === 0 && <Text style={styles.empty}>No documents attached.</Text>}

      {docs.map(d => (
        <View key={d.id} style={styles.row}>
          <FileIcon size={16} color={theme.primary} weight="fill" />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{d.name}</Text>
            <Text style={styles.size}>{prettySize(d.size)}</Text>
          </View>
          {/* Any signed-in role can download; only writers can delete. */}
          <Pressable onPress={() => onDownload(d)} hitSlop={8} style={styles.iconBtn}>
            <DownloadSimple size={17} color={theme.primary} weight="bold" />
          </Pressable>
          {canEdit && (
            <Pressable onPress={() => onDeleteDoc(d)} hitSlop={8} style={styles.iconBtn}>
              <Trash size={17} color={theme.danger} />
            </Pressable>
          )}
        </View>
      ))}

      {/* Staged (not yet uploaded) — only exist on a new record. */}
      {staged.map((f, i) => (
        <View key={`${f.uri}-${i}`} style={[styles.row, styles.stagedRow]}>
          <FileIcon size={16} color={theme.muted} weight="fill" />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{f.name}</Text>
            <Text style={styles.size}>{prettySize(f.size)} · uploads when you save</Text>
          </View>
          <Pressable onPress={() => removeStaged(i)} hitSlop={8} style={styles.iconBtn}>
            <Trash size={17} color={theme.danger} />
          </Pressable>
        </View>
      ))}

      {canEdit && (
        <Pressable onPress={onPick} disabled={busy} style={({ pressed }) => [styles.pick, pressed && { opacity: 0.85 }]}>
          {busy
            ? <ActivityIndicator size="small" color={theme.primary} />
            : <Paperclip size={15} color={theme.primary} weight="bold" />}
          <Text style={styles.pickText}>
            {busy ? 'Working…' : `Attach files${count ? ` (${count} attached)` : ''}`}
          </Text>
        </Pressable>
      )}
      <Text style={styles.hint}>Any file type · pick several at once · 15 MB per file.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  empty: { fontSize: 12.5, color: theme.faint, fontStyle: 'italic' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
  },
  stagedRow: { backgroundColor: '#f1f2f9', borderStyle: 'dashed' },
  name: { fontSize: 13, color: theme.text, fontWeight: '600' },
  size: { fontSize: 11, color: theme.faint, marginTop: 2, fontWeight: '500' },
  iconBtn: { padding: 4 },
  pick: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderColor: theme.primary, borderStyle: 'dashed', borderRadius: 12,
    backgroundColor: theme.primarySoft, paddingVertical: 12,
  },
  pickText: { color: theme.primary, fontWeight: '800', fontSize: 13 },
  hint: { fontSize: 11, color: theme.faint, fontWeight: '500' },
});
