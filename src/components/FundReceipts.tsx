// Screen 5 — Fund Receipts: donor money received. Two entry modes — a normal
// "Record Receipt" (receiptType 'company') and "Receipt From Other Source"
// (income earned on a company's funds). Company/year filters + search, cards,
// add/edit/delete. When a company receipt is booked against a project, the form
// switches to a per-company grid and each filled row becomes its own receipt
// (bulk, all-or-nothing). Mirrors the web app's Fund Receipts screen.
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { Receipt } from 'phosphor-react-native/src/icons/Receipt';
import { Plus } from 'phosphor-react-native/src/icons/Plus';
import { theme } from '../theme';
import type { PaymentMode } from '../theme';
import {
  Button, Card, Company, Confirm, DatePicker, EmptyState, Field, FinancialYear,
  FundReceipt, Header, InfoButton, InfoModal, Input, MasterDataItem, Modal, Pill,
  Project, Select, fmtNice, inr, useAuth,
} from '../../App';

type ReceiptType = FundReceipt['receiptType'];

type Props = {
  receipts: FundReceipt[];
  companies: Company[];
  years: FinancialYear[];
  projects: Project[];
  masterData: MasterDataItem[];
  add: (r: Omit<FundReceipt, 'id'>) => void;
  update: (id: string, r: Omit<FundReceipt, 'id'>) => void;
  remove: (id: string) => void;
  bulkAdd: (rows: Omit<FundReceipt, 'id'>[]) => void;
};

// Legacy fields are never collected on the form — new records default them.
const NEFT: PaymentMode = 'NEFT';

const blank = {
  receiptType: 'company' as ReceiptType,
  companyId: '', source: '', projectId: '', yearId: '',
  date: '', amount: '', reference: '', notes: '',
};

// Grid cell keyed by companyId — a per-company account number + amount.
type GridCell = { reference: string; amount: string };

// Local ISO (yyyy-mm-dd) for "not in the future" checks — compared as a string.
const pad = (n: number) => String(n).padStart(2, '0');
const localISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function FundReceipts({
  receipts, companies, years, projects, masterData, add, update, remove, bulkAdd,
}: Props) {
  const { canEdit } = useAuth();
  const [companyFilter, setCompanyFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<FundReceipt | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [grid, setGrid] = useState<Record<string, GridCell>>({});
  const [delId, setDelId] = useState<string | null>(null);
  const [info, setInfo] = useState<FundReceipt | null>(null);

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? '—';
  const yearName = (id: string) => years.find(y => y.id === id)?.name ?? '—';
  const projectName = (id: string) => (id ? (projects.find(p => p.id === id)?.name ?? '—') : '—');
  // A card's headline: the donor company, or the source for an other-source receipt.
  const receiptTitle = (r: FundReceipt) => (r.receiptType === 'other_source' ? (r.source || 'Other Source') : companyName(r.companyId));

  const todayISO = localISO(new Date());

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

  // Source options come from Master Data; if none are configured we fall back to
  // a plain text input so data entry is never blocked.
  const sourceValues = masterData.filter(m => m.type === 'source').map(m => m.value);
  const hasSourceList = sourceValues.length > 0;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return receipts.filter(r =>
      (companyFilter === 'all' || r.companyId === companyFilter) &&
      (yearFilter === 'all' || r.yearId === yearFilter) &&
      (!s || [
        companies.find(c => c.id === r.companyId)?.name ?? '',
        r.source, r.reference, projects.find(p => p.id === r.projectId)?.name ?? '',
      ].some(t => t.toLowerCase().includes(s))));
  }, [receipts, companyFilter, yearFilter, q, companies, projects]);

  const total = useMemo(() => filtered.reduce((sum, r) => sum + r.amount, 0), [filtered]);

  // ── Form open helpers ───────────────────────────────────────────────────────
  const openAdd = (receiptType: ReceiptType) => {
    setEditing(null);
    setGrid({});
    setForm({ ...blank, receiptType, yearId: activeYears[0]?.id ?? years[0]?.id ?? '' });
    setShowForm(true);
  };
  const openEdit = (r: FundReceipt) => {
    // Editing is always single-record, even for a receipt that was created via
    // the per-company grid — we reuse the single form with the record's type.
    setEditing(r);
    setGrid({});
    setForm({
      receiptType: r.receiptType, companyId: r.companyId, source: r.source,
      projectId: r.projectId, yearId: r.yearId, date: r.date,
      amount: String(r.amount), reference: r.reference, notes: r.notes,
    });
    setShowForm(true);
  };

  // Grid mode: a NEW company receipt with a project selected → one row per
  // company funding that project. Editing always stays single-record.
  const gridMode = !editing && form.receiptType === 'company' && !!form.projectId;
  const gridProject = projects.find(p => p.id === form.projectId);
  const gridCompanies = gridProject
    ? gridProject.companyIds.map(id => companies.find(c => c.id === id)).filter((c): c is Company => !!c)
    : [];
  const gridCell = (id: string): GridCell => grid[id] ?? { reference: '', amount: '' };
  const setGridCell = (id: string, k: keyof GridCell, v: string) =>
    setGrid(g => ({ ...g, [id]: { ...gridCell(id), [k]: v } }));
  const gridTotal = gridCompanies.reduce((sum, c) => sum + (Number(gridCell(c.id).amount) || 0), 0);

  // Changing the project resets the grid so amounts never carry across projects.
  const onProjectChange = (v: string) => { set('projectId', v); setGrid({}); };

  const save = () => {
    if (!form.date) { Alert.alert('Missing details', 'Receipt Date is required.'); return; }
    if (form.date > todayISO) { Alert.alert('Invalid date', 'Receipt Date cannot be in the future.'); return; }
    if (!form.yearId) { Alert.alert('Missing details', 'Financial Year is required.'); return; }

    if (gridMode) {
      // Every row with a positive amount becomes its own receipt; blanks skipped.
      const rows: Omit<FundReceipt, 'id'>[] = [];
      for (const c of gridCompanies) {
        const cell = gridCell(c.id);
        const amt = Number(cell.amount) || 0;
        if (amt > 0) {
          rows.push({
            date: form.date.trim(), receiptType: 'company', companyId: c.id, source: '',
            projectId: form.projectId, yearId: form.yearId, reference: cell.reference.trim(),
            amount: amt, notes: form.notes.trim(), mode: NEFT, carryForward: 0,
          });
        }
      }
      if (rows.length === 0) {
        Alert.alert('Nothing to record', 'Enter an amount for at least one company.');
        return;
      }
      bulkAdd(rows);
      setShowForm(false);
      return;
    }

    // Single-record entry (other_source, or company with no project).
    if (!form.companyId || !(Number(form.amount) > 0)) {
      Alert.alert('Missing details', 'Company, Financial Year, Receipt Date and a valid Amount are required.');
      return;
    }
    if (form.receiptType === 'other_source' && !form.source.trim()) {
      Alert.alert('Missing details', 'Source is required for an other-source receipt.');
      return;
    }
    const payload: Omit<FundReceipt, 'id'> = {
      date: form.date.trim(), receiptType: form.receiptType, companyId: form.companyId,
      source: form.receiptType === 'other_source' ? form.source.trim() : '',
      projectId: form.projectId, yearId: form.yearId, reference: form.reference.trim(),
      amount: Number(form.amount) || 0, notes: form.notes.trim(),
      // Legacy fields: preserve when editing, default for new records.
      mode: editing ? editing.mode : NEFT,
      carryForward: editing ? editing.carryForward : 0,
    };
    if (editing) update(editing.id, payload); else add(payload);
    setShowForm(false);
  };

  const companyOpts = [{ label: 'All Companies', value: 'all' }, ...companies.map(c => ({ label: c.name, value: c.id }))];
  const yearOpts = [{ label: 'All Years', value: 'all' }, ...years.map(y => ({ label: y.name, value: y.id }))];
  const formCompanyOpts = companies.map(c => ({ label: c.name, value: c.id }));
  const projectOpts = [{ label: '— No project —', value: '' }, ...projects.map(p => ({ label: p.name, value: p.id }))];

  const formTitle = editing
    ? 'Edit Fund Receipt'
    : form.receiptType === 'other_source' ? 'Receipt From Other Source' : 'Record Receipt';
  const companyLabel = form.receiptType === 'other_source' ? 'Company *' : 'Donor Company *';

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Fund Receipts"
        subtitle={`${filtered.length} records · Total ${inr(total)}`}
      />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {canEdit && (
          <View style={styles.entryRow}>
            <EntryPill label="Record Receipt" onPress={() => openAdd('company')} />
            <EntryPill label="Other Source" onPress={() => openAdd('other_source')} />
          </View>
        )}

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
                <Text style={styles.name} numberOfLines={1}>{receiptTitle(r)}</Text>
                <Text style={styles.date}>{fmtNice(r.date) || '—'}</Text>
              </View>
              <Text style={styles.amount}>{inr(r.amount)}</Text>
              <InfoButton onPress={() => setInfo(r)} />
            </View>

            <View style={styles.metaRow}>
              <Meta label="Account Number" value={r.reference || '—'} />
              <Pill text={r.receiptType === 'other_source' ? 'Other Source' : 'Company'} tone={r.receiptType === 'other_source' ? 'violet' : 'primary'} />
            </View>

            <View style={styles.metaRow}>
              <Meta label="Project" value={projectName(r.projectId)} />
              <Meta label="Year" value={yearName(r.yearId)} right />
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
        <Modal visible={showForm} title={formTitle} onClose={() => setShowForm(false)}>
          {/* Shared header fields — entered once, even for the grid. */}
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}><Field label="Financial Year *"><Select value={form.yearId} options={formYearOpts(form.yearId)} onChange={v => set('yearId', v)} placeholder="Select year" /></Field></View>
            <View style={{ flex: 1 }}><Field label="Receipt Date *"><DatePicker value={form.date} onChange={v => set('date', v)} placeholder="Receipt date" /></Field></View>
          </View>
          <Field label="Project"><Select value={form.projectId} options={projectOpts} onChange={onProjectChange} placeholder="— No project —" /></Field>

          {form.receiptType === 'other_source' && (
            <Field label="Source *">
              {hasSourceList
                ? <Select value={form.source} options={sourceValues.map(v => ({ label: v, value: v }))} onChange={v => set('source', v)} placeholder="Select source" />
                : <Input value={form.source} onChangeText={t => set('source', t)} placeholder="e.g. Interest, FD, SIP" />}
            </Field>
          )}

          {gridMode ? (
            // Per-company grid: one row per funding company. Blank/zero rows skip.
            <View style={styles.grid}>
              <View style={styles.gridHeadRow}>
                <Text style={[styles.gridHeadCell, styles.gridCompanyCol]}>COMPANY</Text>
                <Text style={[styles.gridHeadCell, styles.gridAcctCol]}>ACCOUNT NO.</Text>
                <Text style={[styles.gridHeadCell, styles.gridAmtCol, { textAlign: 'right' }]}>AMOUNT</Text>
              </View>
              {gridCompanies.length === 0 && (
                <Text style={styles.gridEmpty}>This project has no companies assigned.</Text>
              )}
              {gridCompanies.map(c => {
                const cell = gridCell(c.id);
                return (
                  <View key={c.id} style={styles.gridRow}>
                    <Text style={[styles.gridCompanyCol, styles.gridCompanyName]} numberOfLines={2}>{c.name}</Text>
                    <View style={styles.gridAcctCol}>
                      <Input value={cell.reference} onChangeText={t => setGridCell(c.id, 'reference', t)} placeholder="Acct no." style={styles.gridInput} />
                    </View>
                    <View style={styles.gridAmtCol}>
                      <Input value={cell.amount} onChangeText={t => setGridCell(c.id, 'amount', t)} placeholder="0" keyboardType="numeric" style={[styles.gridInput, { textAlign: 'right' }]} />
                    </View>
                  </View>
                );
              })}
              <View style={styles.gridTotalRow}>
                <Text style={styles.gridTotalLabel}>Total</Text>
                <Text style={styles.gridTotalValue}>{inr(gridTotal)}</Text>
              </View>
            </View>
          ) : (
            // Single-record entry: one company + one amount + one account number.
            <>
              <Field label={companyLabel}><Select value={form.companyId} options={formCompanyOpts} onChange={v => set('companyId', v)} placeholder="Select company" /></Field>
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}><Field label="Amount (₹) *"><Input value={form.amount} onChangeText={t => set('amount', t)} placeholder="0" keyboardType="numeric" /></Field></View>
                <View style={{ flex: 1 }}><Field label="Account Number"><Input value={form.reference} onChangeText={t => set('reference', t)} placeholder="Account number" /></Field></View>
              </View>
            </>
          )}

          <Field label="Notes"><Input value={form.notes} onChangeText={t => set('notes', t)} placeholder="Additional notes…" multiline /></Field>
          <Button label={editing ? 'Save Changes' : 'Record'} onPress={save} />
        </Modal>
      )}

      {canEdit && (
        <Confirm
          visible={!!delId}
          title="Delete receipt?"
          message="This will permanently remove the fund receipt and its proof documents."
          onCancel={() => setDelId(null)}
          onConfirm={() => { if (delId) remove(delId); setDelId(null); }}
        />
      )}

      {/* Read-only details popup — available to every role (viewers included). */}
      <InfoModal
        visible={!!info}
        title={info ? receiptTitle(info) : 'Fund Receipt'}
        onClose={() => setInfo(null)}
        rows={info ? [
          { label: 'Date', value: fmtNice(info.date) || '—' },
          { label: 'Type', value: info.receiptType === 'other_source' ? 'Other Source' : 'Company' },
          { label: 'Company', value: companyName(info.companyId) },
          ...(info.receiptType === 'other_source' ? [{ label: 'Source', value: info.source || '—' }] : []),
          { label: 'Project', value: projectName(info.projectId) },
          { label: 'Financial Year', value: yearName(info.yearId) },
          { label: 'Account Number', value: info.reference || '—' },
          { label: 'Amount', value: inr(info.amount) },
        ] : undefined}
        notes={info?.notes}
      />
    </View>
  );
}

// Header-style pill used for the two entry buttons (Record Receipt / Other Source).
const EntryPill = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.entryPill, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}>
    <Plus size={15} color={theme.primary} weight="bold" />
    <Text style={styles.entryPillText}>{label}</Text>
  </Pressable>
);

const Meta = ({ label, value, right }: { label: string; value: string; right?: boolean }) => (
  <View style={[styles.meta, right && { alignItems: 'flex-end' }]}>
    <Text style={styles.metaLabel}>{label.toUpperCase()}</Text>
    <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28, gap: 12 },
  entryRow: { flexDirection: 'row', gap: 10 },
  entryPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.primarySoft, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  entryPillText: { color: theme.primary, fontWeight: '800', fontSize: 13 },

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

  // Per-company grid (multi-company receipt entry).
  grid: { marginTop: 4, marginBottom: 14, borderWidth: 1, borderColor: theme.border, borderRadius: 12, overflow: 'hidden' },
  gridHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: theme.primarySoft },
  gridHeadCell: { fontSize: 9.5, color: theme.muted, fontWeight: '800', letterSpacing: 0.5 },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border },
  gridCompanyCol: { flex: 1.2 },
  gridAcctCol: { flex: 1.3 },
  gridAmtCol: { flex: 1 },
  gridCompanyName: { fontSize: 12.5, color: theme.text, fontWeight: '600' },
  gridInput: { minHeight: 40, paddingVertical: 8, fontSize: 13 },
  gridEmpty: { fontSize: 12, color: theme.faint, fontStyle: 'italic', padding: 12 },
  gridTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.successSoft },
  gridTotalLabel: { fontSize: 12, fontWeight: '800', color: theme.text, letterSpacing: 0.3 },
  gridTotalValue: { fontSize: 15, fontWeight: '800', color: theme.success },
});
