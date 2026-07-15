// Screen — My Profile: shown to EVERY signed-in user (admin, editor, viewer).
// Editors & viewers don't get the Admin Panel, so this is where they see:
//   • their account information (name, email, role, company)
//   • their own activity logs — every add / edit / delete / sign-in they did.
// Admins see the same personal view here (the full cross-user log lives in the
// Admin Panel). All figures come from the shared auth store (useAuth), so the
// list updates the moment the user performs an action anywhere in the app.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { UserCircle } from 'phosphor-react-native/src/icons/UserCircle';
import { Envelope } from 'phosphor-react-native/src/icons/Envelope';
import { IdentificationBadge } from 'phosphor-react-native/src/icons/IdentificationBadge';
import { Buildings } from 'phosphor-react-native/src/icons/Buildings';
import { ClockCounterClockwise } from 'phosphor-react-native/src/icons/ClockCounterClockwise';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { ShareNetwork } from 'phosphor-react-native/src/icons/ShareNetwork';
import { LockKey } from 'phosphor-react-native/src/icons/LockKey';
import { Headset } from 'phosphor-react-native/src/icons/Headset';
import { Tray } from 'phosphor-react-native/src/icons/Tray';
import { ArrowClockwise } from 'phosphor-react-native/src/icons/ArrowClockwise';
import { theme } from '../theme';
import { api } from '../api';
import {
  ActivityLog, Button, Card, ChangePasswordForm, DataTable, EmptyState, Header, Input, Pill, Role, TCell,
  ROLE_LABEL, ROLE_TONE, fmtDateTime, useAuth,
} from '../../App';

// A help-desk ticket as returned by GET /support-requests/mine (see api.mapSupport).
type SupportRequest = {
  id: string;
  type: 'password' | 'general';
  subject: string;
  message: string;
  status: 'pending' | 'approved' | 'rejected' | 'resolved';
  reply: string;
  at: string;
};

const PAGE = 8; // activity rows per page

// A short human description of what each role can do — shown on the profile.
const ROLE_DESC: Record<Role, string> = {
  admin: 'Full access — manage data, users & activity logs.',
  editor: 'Can add, edit, rename & delete records.',
  viewer: 'Read-only access — can view but not change data.',
};

export default function Profile() {
  const { user, logs, refreshLogs } = useAuth();
  // Activity is recorded server-side — pull the latest whenever this screen opens.
  React.useEffect(() => { refreshLogs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initials for the avatar — "CSR Administrator" → "CA".
  const initials = useMemo(
    () => (user?.name || 'U').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || 'U',
    [user],
  );

  // Only THIS user's activity (matched by email), newest first.
  const mine = useMemo(() => {
    const email = (user?.email || '').toLowerCase();
    return logs.filter(l => (l.userEmail || '').toLowerCase() === email);
  }, [logs, user]);

  // ── Help-desk tickets (Raise a Request / My Requests) ──────────────────────
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(false);
  const loadRequests = React.useCallback(async () => {
    setLoadingReqs(true);
    try { setRequests(await api.getMySupportRequests()); }
    catch { /* leave the current list in place on error */ }
    finally { setLoadingReqs(false); }
  }, []);
  React.useEffect(() => { loadRequests(); }, [loadRequests]);

  // The "Raise a Request" form.
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const canSubmit = subject.trim().length > 0 && message.trim().length > 0 && !submitting;
  const submitRequest = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.createSupportRequest(subject.trim(), message.trim());
      setSubject(''); setMessage('');
      setSent(true);
      setTimeout(() => setSent(false), 4000);
      await loadRequests();
    } catch {
      /* keep the typed text so the user can retry */
    } finally {
      setSubmitting(false);
    }
  };

  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mine;
    return mine.filter(l => l.action.toLowerCase().includes(q));
  }, [mine, query]);

  const shareLog = async (l: ActivityLog) => {
    const msg =
      `CSR Activity\n\n` +
      `When: ${fmtDateTime(l.at)}\n` +
      `User: ${l.userEmail}\n` +
      `Activity: ${l.action}`;
    try { await Share.share({ title: 'CSR Activity', message: msg }); } catch {}
  };

  if (!user) return null;

  return (
    <View style={{ flex: 1 }}>
      <Header title="My Dashboard" subtitle="Your account, password & help-desk requests" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Identity card */}
        <Card style={{ marginTop: 4 }}>
          <View style={styles.idRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
              <View style={{ flexDirection: 'row', marginTop: 6 }}>
                <Pill text={ROLE_LABEL[user.role]} tone={ROLE_TONE[user.role]} />
              </View>
            </View>
          </View>
          <Text style={styles.roleDesc}>{ROLE_DESC[user.role]}</Text>
        </Card>

        {/* Account information */}
        <Card style={{ marginTop: 12 }}>
          <Text style={styles.cardTitle}>Account Information</Text>
          <InfoRow icon={<UserCircle size={18} color={theme.primary} weight="bold" />} label="Full Name" value={user.name} />
          <InfoRow icon={<Envelope size={18} color={theme.primary} weight="bold" />} label="Email" value={user.email} />
          <InfoRow icon={<IdentificationBadge size={18} color={theme.primary} weight="bold" />} label="Role" value={ROLE_LABEL[user.role]} />
          <InfoRow icon={<Buildings size={18} color={theme.primary} weight="bold" />} label="Company" value={user.company || '—'} last />
        </Card>

        {/* Change Password */}
        <Card style={{ marginTop: 12 }}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadIcon}><LockKey size={18} color={theme.primary} weight="bold" /></View>
            <Text style={styles.cardTitle}>Change Password</Text>
          </View>
          <View style={{ marginTop: 14 }}>
            <ChangePasswordForm />
          </View>
        </Card>

        {/* Raise a Request — files a general help-desk ticket */}
        <Card style={{ marginTop: 12 }}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadIcon}><Headset size={18} color={theme.primary} weight="bold" /></View>
            <Text style={styles.cardTitle}>Raise a Request</Text>
          </View>
          <Text style={styles.sectionHint}>Ask the admin a question or request a change. They'll reply here.</Text>
          <Input
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            style={{ marginTop: 12 }}
          />
          <Input
            value={message}
            onChangeText={setMessage}
            placeholder="Describe your request…"
            multiline
            style={{ marginTop: 10 }}
          />
          {sent && <Text style={styles.sentMsg}>Request sent — the admin has been notified.</Text>}
          <View style={{ marginTop: 12 }}>
            <Button label={submitting ? 'Sending…' : 'Submit Request'} onPress={submitRequest} disabled={!canSubmit} />
          </View>
        </Card>

        {/* My Requests — this user's tickets + admin replies */}
        <Card style={{ marginTop: 12 }}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadIcon}><Tray size={18} color={theme.primary} weight="bold" /></View>
            <Text style={styles.cardTitle}>My Requests</Text>
            <Pressable hitSlop={8} onPress={loadRequests} disabled={loadingReqs} style={[styles.refreshBtn, loadingReqs && { opacity: 0.5 }]}>
              <ArrowClockwise size={16} color={theme.primary} weight="bold" />
            </Pressable>
          </View>

          {requests.length === 0 ? (
            <View style={{ marginTop: 14 }}>
              <EmptyState text={loadingReqs ? 'Loading your requests…' : 'No requests yet — anything you raise will appear here.'} />
            </View>
          ) : (
            requests.map(r => {
              const title = r.subject || (r.type === 'password' ? 'Password reset request' : 'Request');
              const tone = r.status === 'approved' || r.status === 'resolved' ? 'success'
                : r.status === 'rejected' ? 'danger' : 'amber';
              const statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1);
              return (
                <View key={r.id} style={styles.reqItem}>
                  <View style={styles.reqTop}>
                    <Text style={styles.reqTitle} numberOfLines={2}>{title}</Text>
                    <Pill text={statusLabel} tone={tone} />
                  </View>
                  {!!r.at && <Text style={styles.reqDate}>{fmtDateTime(r.at)}</Text>}
                  {!!r.message && <Text style={styles.reqMsg}>{r.message}</Text>}
                  {!!r.reply && (
                    <View style={styles.replyBox}>
                      <Text style={styles.replyLabel}>Admin reply</Text>
                      <Text style={styles.replyText}>{r.reply}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </Card>

        {/* My activity logs */}
        <Card style={{ marginTop: 12, paddingHorizontal: 0, marginBottom: 4 }}>
          <View style={[styles.cardHead, { paddingHorizontal: 16 }]}>
            <View style={styles.cardHeadIcon}><ClockCounterClockwise size={18} color={theme.primary} weight="bold" /></View>
            <Text style={styles.cardTitle}>My Activity</Text>
            <View style={styles.countChip}><Text style={styles.countChipText}>{mine.length}</Text></View>
          </View>

          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <View style={styles.search}>
              <MagnifyingGlass size={16} color={theme.faint} />
              <TextInput value={query} onChangeText={setQuery}
                placeholder="Search my activity…" placeholderTextColor={theme.faint}
                style={styles.searchInput} autoCapitalize="none" autoCorrect={false} />
            </View>
          </View>

          {/* My activity, as a table — same grid as every other list in the app. */}
          <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
            <DataTable
              rows={filtered}
              keyFor={l => l.id}
              empty="No activity yet — your actions will appear here."
              pageSize={PAGE}
              resetKey={query}
              columns={[
                // Two lines: an activity line like 'Updated Project "…"' is long.
                { label: 'ACTIVITY', width: 200, render: l => <TCell text={l.action} strong lines={2} /> },
                { label: 'WHEN', width: 150, render: l => <TCell text={fmtDateTime(l.at)} /> },
                {
                  label: '', width: 60, right: true,
                  render: l => (
                    <Pressable hitSlop={8} onPress={() => shareLog(l)} style={styles.rowBtn}>
                      <ShareNetwork size={16} color={theme.primary} />
                    </Pressable>
                  ),
                },
              ]}
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.infoIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28 },

  idRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 60, height: 60, borderRadius: 18, backgroundColor: theme.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 22, letterSpacing: 0.5 },
  name: { fontSize: 19, fontWeight: '800', color: theme.text },
  roleDesc: { fontSize: 13, color: theme.muted, marginTop: 14, lineHeight: 18 },

  cardTitle: { fontSize: 16, fontWeight: '800', color: theme.text },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardHeadIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' },
  countChip: { marginLeft: 'auto', minWidth: 26, height: 22, borderRadius: 999, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countChipText: { color: theme.primary, fontWeight: '800', fontSize: 12 },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  infoIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11.5, color: theme.faint, fontWeight: '700', letterSpacing: 0.3 },
  infoValue: { fontSize: 14.5, color: theme.text, fontWeight: '700', marginTop: 2 },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f7f8fd', borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, paddingHorizontal: 13, minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.text, paddingVertical: 10 },

  // The share button in the activity table's last column.
  rowBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#f3f4fb', alignItems: 'center', justifyContent: 'center' },

  // Raise a Request / My Requests.
  sectionHint: { fontSize: 12.5, color: theme.muted, marginTop: 10, lineHeight: 18 },
  sentMsg: { fontSize: 12.5, color: theme.success, fontWeight: '700', marginTop: 12 },
  refreshBtn: { marginLeft: 'auto', width: 32, height: 32, borderRadius: 9, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' },

  reqItem: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.border },
  reqTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reqTitle: { flex: 1, fontSize: 14.5, fontWeight: '800', color: theme.text, lineHeight: 20 },
  reqDate: { fontSize: 11.5, color: theme.faint, fontWeight: '700', marginTop: 4 },
  reqMsg: { fontSize: 13, color: theme.muted, marginTop: 8, lineHeight: 19 },
  replyBox: {
    marginTop: 10, padding: 12, borderRadius: 12,
    backgroundColor: theme.primarySoft, borderWidth: 1, borderColor: theme.border,
  },
  replyLabel: { fontSize: 11, color: theme.primary, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  replyText: { fontSize: 13, color: theme.text, marginTop: 4, lineHeight: 19 },
});
