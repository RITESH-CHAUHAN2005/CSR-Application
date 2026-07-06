// Screen 5 — Fund Receipts: donor money received. Company/year filters + search,
// cards, add/edit/delete. Form fields mirror the web app's Record Fund Receipt
// dialog, adapted to a mobile card layout.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { Receipt } from 'phosphor-react-native/src/icons/Receipt';
import { theme, PAYMENT_MODES } from '../theme';
import type { PaymentMode } from '../theme';
import {
  AddPill, Button, Card, Company, Confirm, DatePicker, EmptyState, Field, FinancialYear,
  FundReceipt, Header, InfoButton, InfoModal, Input, Modal, Pill, Select, fmtNice, inr, useAuth,
} from '../../App';

type Props = {
  receipts: FundReceipt[];
  companies: Company[];
  years: FinancialYear[];
  add: (r: Omit<FundReceipt, 'id'>) => void;
  update: (id: string, r: Omit<FundReceipt, 'id'>) => void;
  remove: (id: string) => void;
};

const blank = {
  companyId: '', yearId: '', amount: '', carryForward: '',
  date: '', mode: 'NEFT' as PaymentMode, reference: '', notes: '',
};

export default function FundReceipts({ receipts, companies, years, add, update, remove }: Props) {
  const { canEdit } = useAuth();
  const [companyFilter, setCompanyFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<FundReceipt | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [delId, setDelId] = useState<string | null>(null);
  const [info, setInfo] = useState<FundReceipt | null>(null);

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? '—';
  const yearName = (id: string) => years.find(y => y.id === id)?.name ?? '—';

  // Record form's Financial Year dropdown only offers ACTIVE years (current
  // value kept when editing a record on a now-inactive year).
  const activeYears = years.filter(y => y.active);
  const formYearOpts = (currentId: string) => {
    const opts = activeYears.map(y => ({ label: y.name, value: y.id }));
    if (currentId && !activeYears.some(y => y.id === currentId)) {
      const y = years.find(yy => yy.id === currentId);
      if (y) opts.push({ label: `${y.name} (inactive)`, value: y.id });
    }
    return opts;
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return receipts.filter(r =>
      (companyFilter === 'all' || r.companyId === companyFilter) &&
      (yearFilter === 'all' || r.yearId === yearFilter) &&
      (!s || [r.reference, r.mode, companies.find(c => c.id === r.companyId)?.name ?? ''].some(t => t.toLowerCase().includes(s))));
  }, [receipts, companyFilter, yearFilter, q, companies]);

  const total = useMemo(() => filtered.reduce((sum, r) => sum + r.amount, 0), [filtered]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...blank, companyId: companies[0]?.id ?? '', yearId: activeYears[0]?.id ?? years[0]?.id ?? '' });
    setShowForm(true);
  };
  const openEdit = (r: FundReceipt) => {
    setEditing(r);
    setForm({
      companyId: r.companyId, yearId: r.yearId, amount: String(r.amount),
      carryForward: String(r.carryForward), date: r.date, mode: r.mode,
      reference: r.reference, notes: r.notes,
    });
    setShowForm(true);
  };
  const save = () => {
    // Every *-marked field must be filled: Company, Financial Year, Amount, Date.
    if (!form.companyId || !form.yearId || !form.date || !(Number(form.amount) > 0)) return;
    const payload: Omit<FundReceipt, 'id'> = {
      date: form.date.trim(), companyId: form.companyId, yearId: form.yearId,
      reference: form.reference.trim(), mode: form.mode,
      carryForward: Number(form.carryForward) || 0, amount: Number(form.amount) || 0,
      notes: form.notes.trim(),
    };
    if (editing) update(editing.id, payload); else add(payload);
    setShowForm(false);
  };

  const companyOpts = [{ label: 'All Companies', value: 'all' }, ...companies.map(c => ({ label: c.name, value: c.id }))];
  const yearOpts = [{ label: 'All Years', value: 'all' }, ...years.map(y => ({ label: y.name, value: y.id }))];

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Fund Receipts"
        subtitle={`${filtered.length} records · Total ${inr(total)}`}
        action={<AddPill onPress={openAdd} />}
      />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.filters}>
          <View style={{ flex: 1 }}><Select value={companyFilter} options={companyOpts} onChange={setCompanyFilter} /></View>
          <View style={{ flex: 1 }}><Select value={yearFilter} options={yearOpts} onChange={setYearFilter} /></View>
        </View>
        <View style={styles.search}>
          <MagnifyingGlass size={18} color={theme.faint} />
          <Input value={q} onChangeText={setQ} placeholder="Search receipts…" style={styles.searchInput} />
        </View>

        {filtered.length === 0 && <EmptyState text="No fund receipts match your filters." />}

        {filtered.map(r => (
          <Card key={r.id} style={styles.card}>
            <View style={styles.topRow}>
              <View style={styles.chip}>
                <Receipt size={22} color={theme.success} weight="fill" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{companyName(r.companyId)}</Text>
                <Text style={styles.date}>{fmtNice(r.date) || '—'}</Text>
              </View>
              <Text style={styles.amount}>{inr(r.amount)}</Text>
              <InfoButton onPress={() => setInfo(r)} />
            </View>

            <View style={styles.metaRow}>
              <Meta label="Reference" value={r.reference || '—'} />
              <Pill text={r.mode} tone="primary" />
            </View>

            <View style={styles.metaRow}>
              <Meta label="Year" value={yearName(r.yearId)} />
              <Meta label="Carry Forward" value={inr(r.carryForward)} right />
            </View>

            {!!r.notes && <Text style={styles.notes}>Note: {r.notes}</Text>}

            {canEdit && (
              <View style={styles.actions}>
                <Pressable style={styles.action} onPress={() => openEdit(r)} hitSlop={6}>
                  <PencilSimple size={16} color={theme.primary} />
                  <Text style={[styles.actionText, { color: theme.primary }]}>Edit</Text>
                </Pressable>
                <Pressable style={styles.action} onPress={() => setDelId(r.id)} hitSlop={6}>
                  <Trash size={16} color={theme.danger} />
                  <Text style={[styles.actionText, { color: theme.danger }]}>Delete</Text>
                </Pressable>
              </View>
            )}
          </Card>
        ))}
      </ScrollView>

      {canEdit && (
        <Modal visible={showForm} title={editing ? 'Edit Fund Receipt' : 'Record Fund Receipt'} onClose={() => setShowForm(false)}>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}><Field label="Company *"><Select value={form.companyId} options={companies.map(c => ({ label: c.name, value: c.id }))} onChange={v => set('companyId', v)} placeholder="Select company" /></Field></View>
            <View style={{ flex: 1 }}><Field label="Financial Year *"><Select value={form.yearId} options={formYearOpts(form.yearId)} onChange={v => set('yearId', v)} placeholder="Select year" /></Field></View>
          </View>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}><Field label="Amount (₹) *"><Input value={form.amount} onChangeText={t => set('amount', t)} placeholder="0" keyboardType="numeric" /></Field></View>
            <View style={{ flex: 1 }}><Field label="Carry Forward (₹)"><Input value={form.carryForward} onChangeText={t => set('carryForward', t)} placeholder="0" keyboardType="numeric" /></Field></View>
          </View>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}><Field label="Receipt Date *"><DatePicker value={form.date} onChange={v => set('date', v)} placeholder="Receipt date" /></Field></View>
            <View style={{ flex: 1 }}><Field label="Payment Mode"><Select value={form.mode} options={PAYMENT_MODES.map(m => ({ label: m, value: m }))} onChange={v => set('mode', v as PaymentMode)} /></Field></View>
          </View>
          <Field label="Reference Number"><Input value={form.reference} onChangeText={t => set('reference', t)} placeholder="Transaction / cheque reference" /></Field>
          <Field label="Notes"><Input value={form.notes} onChangeText={t => set('notes', t)} placeholder="Additional notes…" multiline /></Field>
          <Button label={editing ? 'Save Changes' : 'Record'} onPress={save} />
        </Modal>
      )}

      {canEdit && (
        <Confirm
          visible={!!delId}
          title="Delete receipt?"
          message="This will permanently remove the fund receipt."
          onCancel={() => setDelId(null)}
          onConfirm={() => { if (delId) remove(delId); setDelId(null); }}
        />
      )}

      {/* Read-only details popup — available to every role (viewers included). */}
      <InfoModal
        visible={!!info}
        title={info ? companyName(info.companyId) : 'Fund Receipt'}
        onClose={() => setInfo(null)}
        rows={info ? [
          { label: 'Date', value: fmtNice(info.date) || '—' },
          { label: 'Financial Year', value: yearName(info.yearId) },
          { label: 'Amount', value: inr(info.amount) },
          { label: 'Carry Forward', value: inr(info.carryForward) },
          { label: 'Payment Mode', value: info.mode },
          { label: 'Reference', value: info.reference || '—' },
        ] : undefined}
        notes={info?.notes}
      />
    </View>
  );
}

const Meta = ({ label, value, right }: { label: string; value: string; right?: boolean }) => (
  <View style={[styles.meta, right && { alignItems: 'flex-end' }]}>
    <Text style={styles.metaLabel}>{label.toUpperCase()}</Text>
    <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28, gap: 12 },
  filters: { flexDirection: 'row', gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingLeft: 14, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', minHeight: 48 },

  card: {},
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: { width: 46, height: 46, borderRadius: 13, backgroundColor: theme.successSoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: theme.text },
  date: { fontSize: 12, color: theme.faint, marginTop: 3, fontWeight: '500' },
  amount: { fontSize: 16, fontWeight: '800', color: theme.success },

  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 },
  meta: { flex: 1 },
  metaLabel: { fontSize: 9.5, color: theme.faint, fontWeight: '700', letterSpacing: 0.5 },
  metaValue: { fontSize: 13, color: theme.text, fontWeight: '600', marginTop: 3 },
  notes: { fontSize: 12, color: theme.faint, fontStyle: 'italic', marginTop: 10, lineHeight: 17 },

  formRow: { flexDirection: 'row', gap: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 14 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 13.5, fontWeight: '700' },
});
