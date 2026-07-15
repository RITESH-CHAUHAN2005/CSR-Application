// Screen — Admin Panel: user management + live activity logs. Admin-only
// (the drawer item is gated to `canManageUsers`). Mirrors the web app:
//   • four count cards (Total Users / Admins / Editors / Viewers)
//   • Add User Account form (name, email, password, role) with validation
//   • All Users table — searchable + paginated, admin can remove accounts
//   • Activity Logs — searchable, filter by action + user, clear all, share row
// Every figure is derived from the shared auth store (useAuth), so the moment a
// user is created or an action is logged anywhere in the app, this screen updates.
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { UsersThree } from 'phosphor-react-native/src/icons/UsersThree';
import { ShieldCheck } from 'phosphor-react-native/src/icons/ShieldCheck';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Eye } from 'phosphor-react-native/src/icons/Eye';
import { EyeSlash } from 'phosphor-react-native/src/icons/EyeSlash';
import { UserPlus } from 'phosphor-react-native/src/icons/UserPlus';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { ShareNetwork } from 'phosphor-react-native/src/icons/ShareNetwork';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { ClockCounterClockwise } from 'phosphor-react-native/src/icons/ClockCounterClockwise';
import { Key } from 'phosphor-react-native/src/icons/Key';
import { Lifebuoy } from 'phosphor-react-native/src/icons/Lifebuoy';
import { theme } from '../theme';
import {
  ActivityLog, AppUser, Button, Card, ChangePasswordForm, Confirm, DataTable, EmptyState, ExportButtons,
  Header, Modal, Pill, Role, Select, StatCard, TCell,
  ROLE_LABEL, ROLE_OPTIONS, ROLE_TONE, fmtDateTime, useAuth,
} from '../../App';
import { api } from '../api';

const PAGE = 6; // rows per page for both tables — keeps each card compact

// A pending help-desk ticket (shape mirrors api.getSupportRequests()).
type Ticket = {
  id: string; userId: string; name: string; email: string;
  type: 'password' | 'general'; subject: string; message: string;
  status: string; reply: string; resolvedByEmail: string; at: string;
};

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

  // ── Help Desk: pending SupportRequest queue ──
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketBusy, setTicketBusy] = useState<string | null>(null); // id of the ticket being acted on
  const [replyFor, setReplyFor] = useState<Ticket | null>(null);
  const [replyText, setReplyText] = useState('');

  const loadTickets = React.useCallback(async () => {
    try { setTickets(await api.getSupportRequests()); }
    catch (e: any) { Alert.alert('Help desk', e?.message || 'Could not load pending requests.'); }
  }, []);
  React.useEffect(() => { loadTickets(); }, [loadTickets]);

  const approveTicket = async (t: Ticket) => {
    if (ticketBusy) return;
    setTicketBusy(t.id);
    try {
      const { tempPassword } = await api.approveSupportRequest(t.id);
      Alert.alert('Password reset approved',
        `Temporary password: ${tempPassword}\n\nShare it with the user. They'll be forced to change it on next sign-in.`);
      setTickets(list => list.filter(x => x.id !== t.id));
    } catch (e: any) {
      Alert.alert('Approve failed', e?.message || 'Could not approve the request.');
    }
    setTicketBusy(null);
  };

  const rejectTicket = async (t: Ticket) => {
    if (ticketBusy) return;
    setTicketBusy(t.id);
    try {
      await api.rejectSupportRequest(t.id);
      setTickets(list => list.filter(x => x.id !== t.id));
    } catch (e: any) {
      Alert.alert('Reject failed', e?.message || 'Could not reject the request.');
    }
    setTicketBusy(null);
  };

  const submitReply = async () => {
    if (!replyFor) return;
    const t = replyFor;
    const reply = replyText.trim();
    if (!reply) return;
    setTicketBusy(t.id);
    try {
      await api.replySupportRequest(t.id, reply);
      setTickets(list => list.filter(x => x.id !== t.id));
      setReplyFor(null); setReplyText('');
    } catch (e: any) {
      Alert.alert('Reply failed', e?.message || 'Could not send the reply.');
    }
    setTicketBusy(null);
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

  // ── All Users: search (the table owns its own paging) ──
  const [uQuery, setUQuery] = useState('');
  const [confirmDel, setConfirmDel] = useState<AppUser | null>(null);
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);
  const usersFiltered = useMemo(() => {
    const q = uQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || ROLE_LABEL[u.role].toLowerCase().includes(q));
  }, [users, uQuery]);

  // ── Activity Logs: search + two filters (the table owns its own paging) ──
  const [lQuery, setLQuery] = useState('');
  const [actionF, setActionF] = useState('all');
  const [userF, setUserF] = useState('all');

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
          <TextInput value={name} onChangeText={t => { setName(t); setFormErr(''); setFormOk(''); }}
            placeholder="Jane Doe" placeholderTextColor={theme.faint} style={styles.input} />

          <Text style={styles.fLabel}>EMAIL</Text>
          <TextInput value={email} onChangeText={t => { setEmail(t); setFormErr(''); setFormOk(''); }}
            placeholder="jane@company.com" placeholderTextColor={theme.faint}
            autoCapitalize="none" keyboardType="email-address" autoCorrect={false} style={styles.input} />

          <Text style={styles.fLabel}>PASSWORD</Text>
          <View style={styles.pwdRow}>
            <TextInput value={password} onChangeText={t => { setPassword(t); setFormErr(''); setFormOk(''); }}
              placeholder="Min 8 chars, 1 letter + 1 number" placeholderTextColor={theme.faint}
              secureTextEntry={!showPwd} autoCapitalize="none" autoCorrect={false}
              style={styles.pwdInput} />
            <Pressable onPress={() => setShowPwd(s => !s)} hitSlop={8}>
              {showPwd ? <EyeSlash size={18} color={theme.muted} /> : <Eye size={18} color={theme.muted} />}
            </Pressable>
          </View>

          <Text style={styles.fLabel}>ROLE</Text>
          <Select value={role} options={ROLE_OPTIONS} onChange={v => { setRole(v as Role); setFormOk(''); }} />
          {roleHint ? <Text style={styles.roleHint}>{roleHint}</Text> : null}

          {formErr ? <Text style={styles.err}>{formErr}</Text> : null}
          {formOk ? <Text style={styles.ok}>{formOk}</Text> : null}

          <Pressable onPress={submit} disabled={busy}
            style={({ pressed }) => [styles.createBtn, (pressed || busy) && { backgroundColor: theme.primaryDk }, busy && { opacity: 0.8 }]}>
            <UserPlus size={17} color="#fff" weight="bold" />
            <Text style={styles.createBtnText}>{busy ? 'Creating…' : 'Create User'}</Text>
          </Pressable>
        </Card>

        {/* Change Password — admins have no "My Dashboard", so it lives here */}
        <Card style={{ marginTop: 14 }}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadIcon}><Key size={18} color={theme.primary} weight="bold" /></View>
            <Text style={styles.cardTitle}>Change Password</Text>
          </View>
          <View style={{ marginTop: 6 }}>
            <ChangePasswordForm />
          </View>
        </Card>

        {/* Help Desk Requests — the pending SupportRequest queue */}
        <Card style={{ marginTop: 14 }}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadIcon}><Lifebuoy size={18} color={theme.primary} weight="bold" /></View>
            <Text style={styles.cardTitle}>Help Desk Requests</Text>
            {tickets.length > 0 ? <Pill text={String(tickets.length)} tone="primary" /> : null}
          </View>

          <View style={{ marginTop: 12, gap: 12 }}>
            {tickets.length === 0 ? (
              <EmptyState text="No pending requests" />
            ) : (
              tickets.map(t => {
                const isPwd = t.type === 'password';
                const rowBusy = ticketBusy === t.id;
                return (
                  <View key={t.id} style={styles.ticket}>
                    <View style={styles.ticketHead}>
                      <Pill text={isPwd ? 'Password' : 'General'} tone={isPwd ? 'violet' : 'accent'} />
                      <Text style={styles.ticketTime}>{fmtDateTime(t.at)}</Text>
                    </View>
                    <Text style={styles.ticketName}>{t.name || '—'}</Text>
                    {t.email ? <Text style={styles.ticketEmail}>{t.email}</Text> : null}
                    {t.subject ? <Text style={styles.ticketSubject}>{t.subject}</Text> : null}
                    {t.message ? <Text style={styles.ticketMsg}>{t.message}</Text> : null}
                    <View style={styles.ticketActions}>
                      {isPwd ? (
                        <>
                          <View style={{ flex: 1 }}>
                            <Button label={rowBusy ? 'Working…' : 'Approve'} onPress={() => approveTicket(t)} disabled={!!ticketBusy} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Button label="Reject" tone="danger" onPress={() => rejectTicket(t)} disabled={!!ticketBusy} />
                          </View>
                        </>
                      ) : (
                        <View style={{ flex: 1 }}>
                          <Button label="Reply" onPress={() => { setReplyFor(t); setReplyText(''); }} disabled={!!ticketBusy} />
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </Card>

        {/* All Users */}
        <Card style={{ marginTop: 14, paddingHorizontal: 0 }}>
          <Text style={[styles.cardTitle, { paddingHorizontal: 16 }]}>All Users</Text>
          <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
            <ExportButtons type="users" />
          </View>
          <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
            <SearchBox value={uQuery} onChange={setUQuery} placeholder="Search users…" />
          </View>
          <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
            <DataTable
              rows={usersFiltered}
              keyFor={u => u.id}
              empty="No users found."
              pageSize={PAGE}
              resetKey={uQuery}
              columns={[
                { label: 'NAME', width: 140, render: u => <TCell text={u.name} strong /> },
                { label: 'EMAIL', width: 175, render: u => <TCell text={u.email} /> },
                { label: 'ROLE', width: 95, render: u => <Pill text={ROLE_LABEL[u.role]} tone={ROLE_TONE[u.role]} /> },
                {
                  // You cannot delete your own account (nor the last admin — the server refuses).
                  label: '', width: 68, right: true,
                  render: u => (u.id === user?.id
                    ? <Text style={styles.youTag}>You</Text>
                    : <Pressable hitSlop={8} onPress={() => setConfirmDel(u)} style={styles.rowBtn}>
                        <Trash size={16} color={theme.danger} />
                      </Pressable>),
                },
              ]}
            />
          </View>
        </Card>

        {/* Activity Logs */}
        <Card style={{ marginTop: 14, paddingHorizontal: 0, marginBottom: 4 }}>
          <View style={[styles.cardHead, { paddingHorizontal: 16, justifyContent: 'space-between' }]}>
            <View style={styles.cardHead}>
              <View style={styles.cardHeadIcon}><ClockCounterClockwise size={18} color={theme.primary} weight="bold" /></View>
              <Text style={styles.cardTitle}>Activity Logs</Text>
            </View>
            <Pressable onPress={() => setConfirmClearLogs(true)} hitSlop={8}
              style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}>
              <Trash size={14} color={theme.danger} weight="bold" />
              <Text style={styles.clearBtnText}>Clear Logs</Text>
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 16, marginTop: 10, gap: 10 }}>
            <ExportButtons type="activity-logs" />
            <SearchBox value={lQuery} onChange={setLQuery} placeholder="Search activity…" />
            <View style={styles.filterRow}>
              <View style={{ flex: 1 }}>
                <Select value={actionF} options={actionOptions} onChange={setActionF} />
              </View>
              <View style={{ flex: 1 }}>
                <Select value={userF} options={userOptions} onChange={setUserF} />
              </View>
            </View>
          </View>

          <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
            <DataTable
              rows={logsFiltered}
              keyFor={l => l.id}
              empty="No activity yet."
              pageSize={PAGE}
              resetKey={`${lQuery}|${actionF}|${userF}`}
              columns={[
                { label: 'WHEN', width: 145, render: l => <TCell text={fmtDateTime(l.at)} /> },
                { label: 'USER', width: 165, render: l => <TCell text={l.userEmail} strong /> },
                { label: 'ROLE', width: 85, render: l => <TCell text={l.role ? ROLE_LABEL[l.role] : '—'} /> },
                // Two lines: an activity line like 'Updated Project "…"' is long.
                { label: 'ACTIVITY', width: 210, render: l => <TCell text={l.action} strong lines={2} /> },
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

      <Confirm
        visible={!!confirmDel}
        title="Remove user"
        message={confirmDel ? `Remove "${confirmDel.name}" (${confirmDel.email})? They will no longer be able to sign in.` : ''}
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => { if (confirmDel) removeUser(confirmDel.id); setConfirmDel(null); }}
      />

      <Confirm
        visible={confirmClearLogs}
        title="Clear all activity logs"
        message="This will permanently delete the entire activity log. This can't be undone."
        onCancel={() => setConfirmClearLogs(false)}
        onConfirm={() => { clearLogs(); setConfirmClearLogs(false); }}
      />

      {/* Tapping a count card opens this breakdown; tapping outside it closes it. */}
      <Modal visible={!!breakdownFilter} title={breakdownTitle} onClose={() => setBreakdownFilter(null)}>
        {breakdownGroups.map(g => {
          const list = users.filter(u => u.role === g.key);
          return (
            <View key={g.key} style={styles.bdGroup}>
              <View style={styles.bdGroupHead}>
                <Text style={styles.bdGroupTitle}>{g.label}</Text>
                <Pill text={String(list.length)} tone={ROLE_TONE[g.key]} />
              </View>
              {list.length === 0 ? (
                <Text style={styles.bdEmpty}>No {g.label.toLowerCase()} yet.</Text>
              ) : (
                <>
                  <View style={[styles.tRow, styles.tHeadRow]}>
                    <Text style={[styles.th, { flex: 1 }]}>NAME</Text>
                    <Text style={[styles.th, { flex: 1.2 }]}>EMAIL</Text>
                    <Text style={[styles.th, { width: 40, textAlign: 'right' }]} />
                  </View>
                  {list.map(u => (
                    <View key={u.id} style={styles.tRow}>
                      <Text style={[styles.td, { flex: 1, color: theme.text, fontWeight: '700' }]} numberOfLines={1}>{u.name}</Text>
                      <Text style={[styles.td, { flex: 1.2 }]} numberOfLines={1}>{u.email}</Text>
                      <View style={{ width: 40, alignItems: 'flex-end' }}>
                        {u.id === user?.id && <Text style={styles.youTag}>You</Text>}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          );
        })}
      </Modal>

      {/* Reply to a general help-desk ticket (marks it resolved on submit). */}
      <Modal visible={!!replyFor} title="Reply to request" onClose={() => { setReplyFor(null); setReplyText(''); }}>
        {replyFor ? (
          <>
            {replyFor.subject ? <Text style={styles.replySubject}>{replyFor.subject}</Text> : null}
            {replyFor.message ? <Text style={styles.replyMsg}>{replyFor.message}</Text> : null}
            <Text style={styles.fLabel}>YOUR REPLY</Text>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Type a reply to the user…"
              placeholderTextColor={theme.faint}
              multiline
              style={[styles.input, styles.replyInput]}
            />
            <View style={styles.replyActions}>
              {ticketBusy === replyFor.id ? <ActivityIndicator size="small" color={theme.primary} /> : null}
              <View style={{ flex: 1 }}>
                <Button label="Send Reply" onPress={submitReply} disabled={!replyText.trim() || !!ticketBusy} />
              </View>
            </View>
          </>
        ) : null}
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
  youTag: { fontSize: 11.5, color: theme.faint, fontWeight: '700' },
  rowBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#f3f4fb', alignItems: 'center', justifyContent: 'center' },

  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: theme.danger, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6,
  },
  clearBtnText: { color: theme.danger, fontWeight: '700', fontSize: 12 },

  // Help Desk tickets
  ticket: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 13, backgroundColor: '#f7f8fd' },
  ticketHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  ticketTime: { fontSize: 11.5, color: theme.faint, fontWeight: '600' },
  ticketName: { fontSize: 14, fontWeight: '800', color: theme.text },
  ticketEmail: { fontSize: 12.5, color: theme.muted, fontWeight: '600', marginTop: 1 },
  ticketSubject: { fontSize: 13.5, fontWeight: '700', color: theme.text, marginTop: 8 },
  ticketMsg: { fontSize: 13, color: theme.muted, fontWeight: '500', marginTop: 4, lineHeight: 18 },
  ticketActions: { flexDirection: 'row', gap: 10, marginTop: 12 },

  // Reply modal
  replySubject: { fontSize: 14, fontWeight: '800', color: theme.text },
  replyMsg: { fontSize: 13, color: theme.muted, fontWeight: '500', marginTop: 4, lineHeight: 18 },
  replyInput: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
  replyActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },

  // Total Users breakdown popup
  bdGroup: { marginBottom: 18 },
  bdGroupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  bdGroupTitle: { fontSize: 14.5, fontWeight: '800', color: theme.text },
  bdEmpty: { fontSize: 12.5, color: theme.faint, fontStyle: 'italic', paddingVertical: 6 },
});
