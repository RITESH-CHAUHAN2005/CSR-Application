// Screen — Admin Panel: user management + live activity logs. Admin-only
// (the drawer item is gated to `canManageUsers`). Mirrors the web app:
//   • four count cards (Total Users / Admins / Editors / Viewers)
//   • Add User Account form (name, email, password, role) with validation
//   • All Users table — searchable + paginated, admin can remove accounts
//   • Activity Logs — searchable, filter by action + user, clear all, share row
// Every figure is derived from the shared auth store (useAuth), so the moment a
// user is created or an action is logged anywhere in the app, this screen updates.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { UsersThree } from 'phosphor-react-native/src/icons/UsersThree';
import { ShieldCheck } from 'phosphor-react-native/src/icons/ShieldCheck';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Eye } from 'phosphor-react-native/src/icons/Eye';
import { EyeSlash } from 'phosphor-react-native/src/icons/EyeSlash';
import { UserPlus } from 'phosphor-react-native/src/icons/UserPlus';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { ShareNetwork } from 'phosphor-react-native/src/icons/ShareNetwork';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { CaretLeft } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRight } from 'phosphor-react-native/src/icons/CaretRight';
import { ClockCounterClockwise } from 'phosphor-react-native/src/icons/ClockCounterClockwise';
import { theme } from '../theme';
import {
  ActivityLog, AppUser, Card, Confirm, Header, Modal, Pill, Role, Select, StatCard,
  ROLE_LABEL, ROLE_OPTIONS, ROLE_TONE, fmtDateTime, useAuth,
} from '../../App';

const PAGE = 6; // rows per page for both tables — keeps each card compact

// Map a detailed action string to a coarse category for the "All Actions" filter.
const actionCategory = (a: string): string => {
  const s = a.toLowerCase();
  if (s.startsWith('signed in')) return 'Signed In';
  if (s.startsWith('signed out')) return 'Signed Out';
  if (s.startsWith('added') || s.startsWith('created') || s.startsWith('recorded')) return 'Created';
  if (s.startsWith('updated') || s.startsWith('activated') || s.startsWith('deactivated')) return 'Updated';
  if (s.startsWith('deleted') || s.startsWith('removed')) return 'Deleted';
  return 'Other';
};

const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
// At least 8 chars, with at least one letter and one number.
const passwordValid = (p: string) => /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(p);

export default function AdminPanel() {
  const { user, users, logs, createUser, removeUser, clearLogs, refreshLogs } = useAuth();
  // Logs are recorded server-side — pull the latest whenever this screen opens.
  React.useEffect(() => { refreshLogs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add User form state ──
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [showPwd, setShowPwd] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [formOk, setFormOk] = useState('');

  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setFormOk('');
    if (busy) return;
    if (!name.trim()) return setFormErr('Please enter the full name.');
    if (!emailValid(email)) return setFormErr('Please enter a valid email address.');
    if (users.some(u => u.email.toLowerCase() === email.trim().toLowerCase()))
      return setFormErr('An account with this email already exists.');
    if (!passwordValid(password)) return setFormErr('Password must be at least 8 characters and include a letter and a number.');
    // Wait for the server to actually create the account, then report the true
    // result — so we never show "created" for an account that didn't get made.
    setFormErr(''); setBusy(true);
    const err = await createUser({ name: name.trim(), email: email.trim(), password, role, company: '' });
    setBusy(false);
    if (err) { setFormErr(err); return; }
    setName(''); setEmail(''); setPassword(''); setRole('editor'); setShowPwd(false);
    setFormOk('Account created — the user can sign in now.');
  };

  // ── Counts ──
  const counts = useMemo(() => ({
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    editors: users.filter(u => u.role === 'editor').length,
    viewers: users.filter(u => u.role === 'viewer').length,
  }), [users]);

  // ── Users breakdown popup (opened by tapping any of the 4 count cards).
  // 'all' (Total Users card) shows every role section; a specific role (Admins /
  // Editors / Viewers card) shows only that one group.
  const [breakdownFilter, setBreakdownFilter] = useState<Role | 'all' | null>(null);
  const ALL_GROUPS: { key: Role; label: string }[] = [
    { key: 'admin', label: 'Admins' },
    { key: 'editor', label: 'Editors' },
    { key: 'viewer', label: 'Viewers' },
  ];
  const breakdownGroups = breakdownFilter === 'all' || breakdownFilter === null
    ? ALL_GROUPS
    : ALL_GROUPS.filter(g => g.key === breakdownFilter);
  const breakdownTitle = breakdownFilter && breakdownFilter !== 'all'
    ? ALL_GROUPS.find(g => g.key === breakdownFilter)?.label || 'Users'
    : 'All Users by Role';

  // ── All Users: search + pagination ──
  const [uQuery, setUQuery] = useState('');
  const [uPage, setUPage] = useState(1);
  const [confirmDel, setConfirmDel] = useState<AppUser | null>(null);
  const usersFiltered = useMemo(() => {
    const q = uQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || ROLE_LABEL[u.role].toLowerCase().includes(q));
  }, [users, uQuery]);

  // ── Activity Logs: search + two filters + pagination ──
  const [lQuery, setLQuery] = useState('');
  const [actionF, setActionF] = useState('all');
  const [userF, setUserF] = useState('all');
  const [lPage, setLPage] = useState(1);

  const actionOptions = useMemo(() => {
    const set = Array.from(new Set(logs.map(l => actionCategory(l.action))));
    return [{ label: 'All Actions', value: 'all' }, ...set.map(a => ({ label: a, value: a }))];
  }, [logs]);
  const userOptions = useMemo(() => {
    const set = Array.from(new Set(logs.map(l => l.userEmail)));
    return [{ label: 'All Users', value: 'all' }, ...set.map(e => ({ label: e, value: e }))];
  }, [logs]);

  const logsFiltered = useMemo(() => {
    const q = lQuery.trim().toLowerCase();
    return logs.filter(l => {
      if (actionF !== 'all' && actionCategory(l.action) !== actionF) return false;
      if (userF !== 'all' && l.userEmail !== userF) return false;
      if (q && !(l.action.toLowerCase().includes(q) || l.userEmail.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [logs, lQuery, actionF, userF]);

  const shareLog = async (l: ActivityLog) => {
    const msg =
      `CSR Activity Log\n\n` +
      `When: ${fmtDateTime(l.at)}\n` +
      `User: ${l.userEmail}\n` +
      `Role: ${l.role ? ROLE_LABEL[l.role] : '—'}\n` +
      `Activity: ${l.action}`;
    try { await Share.share({ title: 'CSR Activity Log', message: msg }); } catch {}
  };

  const roleHint = ROLE_OPTIONS.find(o => o.value === role)?.label.split('—')[1]?.trim();

  return (
    <View style={{ flex: 1 }}>
      <Header title="Admin Panel" subtitle="User management & live activity logs" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Count cards */}
        <View style={styles.grid}>
          <StatCard icon={<UsersThree size={20} color={theme.primary} weight="fill" />} label="Total Users" tint="primary"
            value={String(counts.total)} animate={{ to: counts.total, format: n => String(Math.round(n)) }}
            onPress={() => setBreakdownFilter('all')} />
          <StatCard icon={<ShieldCheck size={20} color={theme.violet} weight="fill" />} label="Admins" tint="violet"
            value={String(counts.admins)} animate={{ to: counts.admins, format: n => String(Math.round(n)) }}
            onPress={() => setBreakdownFilter('admin')} />
        </View>
        <View style={styles.grid}>
          <StatCard icon={<PencilSimple size={20} color={theme.amber} weight="fill" />} label="Editors" tint="amber"
            value={String(counts.editors)} animate={{ to: counts.editors, format: n => String(Math.round(n)) }}
            onPress={() => setBreakdownFilter('editor')} />
          <StatCard icon={<Eye size={20} color={theme.accent} weight="fill" />} label="Viewers" tint="accent"
            value={String(counts.viewers)} animate={{ to: counts.viewers, format: n => String(Math.round(n)) }}
            onPress={() => setBreakdownFilter('viewer')} />
        </View>

        {/* Add User Account */}
        <Card style={{ marginTop: 4 }}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadIcon}><UserPlus size={18} color={theme.primary} weight="bold" /></View>
            <Text style={styles.cardTitle}>Add User Account</Text>
          </View>

          <Text style={styles.fLabel}>FULL NAME</Text>
          <TextInput value={name} onChangeText={t => { setName(t); setFormErr(''); }}
            placeholder="Jane Doe" placeholderTextColor={theme.faint} style={styles.input} />

          <Text style={styles.fLabel}>EMAIL</Text>
          <TextInput value={email} onChangeText={t => { setEmail(t); setFormErr(''); }}
            placeholder="jane@company.com" placeholderTextColor={theme.faint}
            autoCapitalize="none" keyboardType="email-address" autoCorrect={false} style={styles.input} />

          <Text style={styles.fLabel}>PASSWORD</Text>
          <View style={styles.pwdRow}>
            <TextInput value={password} onChangeText={t => { setPassword(t); setFormErr(''); }}
              placeholder="Min 8 chars, 1 letter + 1 number" placeholderTextColor={theme.faint}
              secureTextEntry={!showPwd} autoCapitalize="none" autoCorrect={false}
              style={styles.pwdInput} />
            <Pressable onPress={() => setShowPwd(s => !s)} hitSlop={8}>
              {showPwd ? <EyeSlash size={18} color={theme.muted} /> : <Eye size={18} color={theme.muted} />}
            </Pressable>
          </View>

          <Text style={styles.fLabel}>ROLE</Text>
          <Select value={role} options={ROLE_OPTIONS} onChange={v => setRole(v as Role)} />
          {roleHint ? <Text style={styles.roleHint}>{roleHint}</Text> : null}

          {formErr ? <Text style={styles.err}>{formErr}</Text> : null}
          {formOk ? <Text style={styles.ok}>{formOk}</Text> : null}

          <Pressable onPress={submit} disabled={busy}
            style={({ pressed }) => [styles.createBtn, (pressed || busy) && { backgroundColor: theme.primaryDk }, busy && { opacity: 0.8 }]}>
            <UserPlus size={17} color="#fff" weight="bold" />
            <Text style={styles.createBtnText}>{busy ? 'Creating…' : 'Create User'}</Text>
          </Pressable>
        </Card>

        {/* All Users */}
        <Card style={{ marginTop: 14, paddingHorizontal: 0 }}>
          <Text style={[styles.cardTitle, { paddingHorizontal: 16 }]}>All Users</Text>
          <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
            <SearchBox value={uQuery} onChange={t => { setUQuery(t); setUPage(1); }} placeholder="Search users…" />
          </View>
          <Table
            cols={[{ label: 'NAME', w: 150 }, { label: 'EMAIL', w: 180 }, { label: 'ROLE', w: 90 }, { label: '', w: 56, right: true }]}
            rows={usersFiltered}
            page={uPage}
            onPage={setUPage}
            empty="No users found."
            render={(u: AppUser) => (
              <>
                <Text style={[styles.td, { width: 150, fontWeight: '700', color: theme.text }]} numberOfLines={1}>{u.name}</Text>
                <Text style={[styles.td, { width: 180 }]} numberOfLines={1}>{u.email}</Text>
                <View style={{ width: 90 }}><Pill text={ROLE_LABEL[u.role]} tone={ROLE_TONE[u.role]} /></View>
                <View style={{ width: 56, alignItems: 'flex-end' }}>
                  {u.id === user?.id
                    ? <Text style={styles.youTag}>You</Text>
                    : <Pressable hitSlop={8} onPress={() => setConfirmDel(u)}><Trash size={17} color={theme.danger} /></Pressable>}
                </View>
              </>
            )}
            keyFor={(u: AppUser) => u.id}
          />
        </Card>

        {/* Activity Logs */}
        <Card style={{ marginTop: 14, paddingHorizontal: 0, marginBottom: 4 }}>
          <View style={[styles.cardHead, { paddingHorizontal: 16, justifyContent: 'space-between' }]}>
            <View style={styles.cardHead}>
              <View style={styles.cardHeadIcon}><ClockCounterClockwise size={18} color={theme.primary} weight="bold" /></View>
              <Text style={styles.cardTitle}>Activity Logs</Text>
            </View>
            <Pressable onPress={clearLogs} hitSlop={8}
              style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}>
              <Trash size={14} color={theme.danger} weight="bold" />
              <Text style={styles.clearBtnText}>Clear Logs</Text>
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 16, marginTop: 10, gap: 10 }}>
            <SearchBox value={lQuery} onChange={t => { setLQuery(t); setLPage(1); }} placeholder="Search activity…" />
            <View style={styles.filterRow}>
              <View style={{ flex: 1 }}>
                <Select value={actionF} options={actionOptions} onChange={v => { setActionF(v); setLPage(1); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Select value={userF} options={userOptions} onChange={v => { setUserF(v); setLPage(1); }} />
              </View>
            </View>
          </View>

          <Table
            cols={[{ label: 'WHEN', w: 150 }, { label: 'USER', w: 170 }, { label: 'ROLE', w: 80 }, { label: 'ACTIVITY', w: 220 }, { label: '', w: 44, right: true }]}
            rows={logsFiltered}
            page={lPage}
            onPage={setLPage}
            empty="No activity yet."
            render={(l: ActivityLog) => (
              <>
                <Text style={[styles.td, { width: 150 }]} numberOfLines={1}>{fmtDateTime(l.at)}</Text>
                <Text style={[styles.td, { width: 170, color: theme.text, fontWeight: '600' }]} numberOfLines={1}>{l.userEmail}</Text>
                <Text style={[styles.td, { width: 80 }]} numberOfLines={1}>{l.role ? ROLE_LABEL[l.role] : '—'}</Text>
                <Text style={[styles.td, { width: 220, color: theme.text }]} numberOfLines={1}>{l.action}</Text>
                <View style={{ width: 44, alignItems: 'flex-end' }}>
                  <Pressable hitSlop={8} onPress={() => shareLog(l)}><ShareNetwork size={17} color={theme.primary} /></Pressable>
                </View>
              </>
            )}
            keyFor={(l: ActivityLog) => l.id}
          />
        </Card>
      </ScrollView>

      <Confirm
        visible={!!confirmDel}
        title="Remove user"
        message={confirmDel ? `Remove "${confirmDel.name}" (${confirmDel.email})? They will no longer be able to sign in.` : ''}
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => { if (confirmDel) removeUser(confirmDel.id); setConfirmDel(null); }}
      />

      <Modal visible={!!breakdownFilter} title={breakdownTitle} onClose={() => setBreakdownFilter(null)}>
        {breakdownGroups.map(g => {
          const list = users.filter(u => u.role === g.key);
          return (
            <View key={g.key} style={styles.bdGroup}>
              <View style={styles.bdGroupHead}>
                <Text style={styles.bdGroupTitle}>{g.label}</Text>
                <Pill text={String(list.length)} tone={ROLE_TONE[g.key]} />
              </View>
              {list.length === 0
                ? <Text style={styles.bdEmpty}>No {g.label.toLowerCase()} yet.</Text>
                : list.map(u => (
                    <View key={u.id} style={styles.bdUserRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bdUserName} numberOfLines={1}>{u.name}</Text>
                        <Text style={styles.bdUserEmail} numberOfLines={1}>{u.email}</Text>
                      </View>
                      {u.id === user?.id && <Text style={styles.youTag}>You</Text>}
                    </View>
                  ))}
            </View>
          );
        })}
      </Modal>
    </View>
  );
}

// ── Small reusable search box ──
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (t: string) => void; placeholder: string }) {
  return (
    <View style={styles.search}>
      <MagnifyingGlass size={16} color={theme.faint} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={theme.faint} style={styles.searchInput} autoCapitalize="none" autoCorrect={false} />
    </View>
  );
}

// ── Generic horizontally-scrolling, paginated table ──
type Col = { label: string; w: number; right?: boolean };
function Table<T>({ cols, rows, page, onPage, render, keyFor, empty }: {
  cols: Col[]; rows: T[]; page: number; onPage: (p: number) => void;
  render: (row: T) => React.ReactNode; keyFor: (row: T) => string; empty: string;
}) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const safe = Math.min(page, pages);
  const from = total === 0 ? 0 : (safe - 1) * PAGE + 1;
  const to = Math.min(safe * PAGE, total);
  const slice = rows.slice((safe - 1) * PAGE, safe * PAGE);

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, marginTop: 8 }}>
        <View>
          <View style={[styles.tRow, styles.tHeadRow]}>
            {cols.map((c, i) => (
              <Text key={i} style={[styles.th, { width: c.w }, c.right && { textAlign: 'right' }]} numberOfLines={1}>{c.label}</Text>
            ))}
          </View>
          {slice.length === 0
            ? <Text style={styles.tEmpty}>{empty}</Text>
            : slice.map(row => (
                <View key={keyFor(row)} style={styles.tRow}>{render(row)}</View>
              ))}
        </View>
      </ScrollView>

      <View style={styles.pager}>
        <Text style={styles.pagerText}>Showing {from}–{to} of {total}</Text>
        <View style={styles.pagerBtns}>
          <Pressable disabled={safe <= 1} hitSlop={6} onPress={() => onPage(safe - 1)}
            style={[styles.pagerBtn, safe <= 1 && styles.pagerOff]}>
            <CaretLeft size={15} color={safe <= 1 ? theme.faint : theme.text} weight="bold" />
          </Pressable>
          <View style={styles.pagerNum}><Text style={styles.pagerNumText}>{safe}</Text></View>
          <Pressable disabled={safe >= pages} hitSlop={6} onPress={() => onPage(safe + 1)}
            style={[styles.pagerBtn, safe >= pages && styles.pagerOff]}>
            <CaretRight size={15} color={safe >= pages ? theme.faint : theme.text} weight="bold" />
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28, gap: 12 },
  grid: { flexDirection: 'row', gap: 12 },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardHeadIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: theme.text },

  fLabel: { fontSize: 11, color: theme.muted, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#f7f8fd', borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, color: theme.text, minHeight: 46,
  },
  pwdRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f7f8fd', borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, paddingHorizontal: 13, minHeight: 46,
  },
  pwdInput: { flex: 1, fontSize: 14, color: theme.text, paddingVertical: 12 },
  roleHint: { fontSize: 12, color: theme.muted, marginTop: 6, fontStyle: 'italic' },

  err: { color: theme.danger, fontSize: 13, fontWeight: '600', marginTop: 12 },
  ok: { color: theme.success, fontSize: 13, fontWeight: '700', marginTop: 12 },

  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 13, marginTop: 16,
  },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f7f8fd', borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, paddingHorizontal: 13, minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.text, paddingVertical: 10 },
  filterRow: { flexDirection: 'row', gap: 10 },

  // Table
  tRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: theme.border },
  tHeadRow: { borderBottomWidth: 1.5 },
  th: { fontSize: 11, color: theme.faint, fontWeight: '700', letterSpacing: 0.3 },
  td: { fontSize: 12.5, color: theme.muted, fontWeight: '600' },
  tEmpty: { fontSize: 13, color: theme.faint, fontStyle: 'italic', paddingVertical: 22 },
  youTag: { fontSize: 11.5, color: theme.faint, fontWeight: '700' },

  pager: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, marginTop: 2,
  },
  pagerText: { fontSize: 12, color: theme.muted, fontWeight: '600' },
  pagerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pagerBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  pagerOff: { backgroundColor: '#f7f8fd' },
  pagerNum: { minWidth: 30, height: 30, borderRadius: 9, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  pagerNumText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: theme.danger, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6,
  },
  clearBtnText: { color: theme.danger, fontWeight: '700', fontSize: 12 },

  // Total Users breakdown popup
  bdGroup: { marginBottom: 18 },
  bdGroupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  bdGroupTitle: { fontSize: 14.5, fontWeight: '800', color: theme.text },
  bdEmpty: { fontSize: 12.5, color: theme.faint, fontStyle: 'italic', paddingVertical: 6 },
  bdUserRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  bdUserName: { fontSize: 13.5, fontWeight: '700', color: theme.text },
  bdUserEmail: { fontSize: 12, color: theme.muted, marginTop: 1 },
});
