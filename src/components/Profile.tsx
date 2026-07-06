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
import { CaretLeft } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRight } from 'phosphor-react-native/src/icons/CaretRight';
import { theme } from '../theme';
import {
  ActivityLog, Card, Header, Pill, Role,
  ROLE_LABEL, ROLE_TONE, fmtDateTime, useAuth,
} from '../../App';

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

  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
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

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const safe = Math.min(page, pages);
  const from = total === 0 ? 0 : (safe - 1) * PAGE + 1;
  const to = Math.min(safe * PAGE, total);
  const slice = filtered.slice((safe - 1) * PAGE, safe * PAGE);

  if (!user) return null;

  return (
    <View style={{ flex: 1 }}>
      <Header title="My Profile" subtitle="Your account & activity history" />
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
              <TextInput value={query} onChangeText={t => { setQuery(t); setPage(1); }}
                placeholder="Search my activity…" placeholderTextColor={theme.faint}
                style={styles.searchInput} autoCapitalize="none" autoCorrect={false} />
            </View>
          </View>

          <View style={{ marginTop: 6 }}>
            {slice.length === 0
              ? <Text style={styles.empty}>No activity yet — your actions will appear here.</Text>
              : slice.map(l => (
                  <View key={l.id} style={styles.logRow}>
                    <View style={styles.logDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logAction}>{l.action}</Text>
                      <Text style={styles.logWhen}>{fmtDateTime(l.at)}</Text>
                    </View>
                    <Pressable hitSlop={8} onPress={() => shareLog(l)}>
                      <ShareNetwork size={17} color={theme.primary} />
                    </Pressable>
                  </View>
                ))}
          </View>

          {total > PAGE ? (
            <View style={styles.pager}>
              <Text style={styles.pagerText}>Showing {from}–{to} of {total}</Text>
              <View style={styles.pagerBtns}>
                <Pressable disabled={safe <= 1} hitSlop={6} onPress={() => setPage(safe - 1)}
                  style={[styles.pagerBtn, safe <= 1 && styles.pagerOff]}>
                  <CaretLeft size={15} color={safe <= 1 ? theme.faint : theme.text} weight="bold" />
                </Pressable>
                <View style={styles.pagerNum}><Text style={styles.pagerNumText}>{safe}</Text></View>
                <Pressable disabled={safe >= pages} hitSlop={6} onPress={() => setPage(safe + 1)}
                  style={[styles.pagerBtn, safe >= pages && styles.pagerOff]}>
                  <CaretRight size={15} color={safe >= pages ? theme.faint : theme.text} weight="bold" />
                </Pressable>
              </View>
            </View>
          ) : null}
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

  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  logDot: { width: 9, height: 9, borderRadius: 999, backgroundColor: theme.primary },
  logAction: { fontSize: 13.5, color: theme.text, fontWeight: '700' },
  logWhen: { fontSize: 12, color: theme.muted, marginTop: 3, fontWeight: '600' },
  empty: { fontSize: 13, color: theme.faint, fontStyle: 'italic', paddingVertical: 22, paddingHorizontal: 16 },

  pager: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12,
  },
  pagerText: { fontSize: 12, color: theme.muted, fontWeight: '600' },
  pagerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pagerBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  pagerOff: { backgroundColor: '#f7f8fd' },
  pagerNum: { minWidth: 30, height: 30, borderRadius: 9, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  pagerNumText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
