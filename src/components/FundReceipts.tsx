// Screen 5 — Fund Receipts: donor money received. Two entry modes:
//   • "Record Receipt"            → receiptType 'company'      (a donor's contribution)
//   • "Receipt From Other Source" → receiptType 'other_source' (income EARNED on that
//                                    company's funds — Interest, SIP, FD…)
// A company is required for BOTH — money always arrives on behalf of some company.
// An other_source receipt is NOT a contribution: it never counts toward a project's
// "Received", though it does count toward that company's overall total.
//
// Booking a company receipt against a project switches the form to a per-company
// grid; each filled row becomes its own ordinary FundReceipt (bulk, all-or-nothing).
//
// Payment Mode and Carry Forward are LEGACY columns — never collected here, never
// sent, and no report reads them.
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { Plus } from 'phosphor-react-native/src/icons/Plus';
import { theme } from '../theme';
import Attachments, { StagedFile, uploadStaged } from './Attachments';
import {
  Button, CodeBadge, Company, Confirm, DataTable, DatePicker, ExportButtons, Field, FinancialYear,
  FundReceipt, Header, InfoModal, Input, MasterDataItem, Modal,
  Project, RowActions, Select, TCell, fmtNice, inr, projectLabel, todayISO, useAuth,
} from '../../App';

type ReceiptType = FundReceipt['receiptType'];

type Props = {
  receipts: FundReceipt[];
  companies: Company[];
  years: FinancialYear[];
  projects: Project[];
  masterData: MasterDataItem[];
  add: (r: Omit<FundReceipt, 'id'>) => Promise<string | null>;
  update: (id: string, r: Omit<FundReceipt, 'id'>) => void;
  remove: (id: string) => void;
  bulkAdd: (rows: Omit<FundReceipt, 'id'>[]) => Promise<string[] | null>;
};

const blank = {
  receiptType: 'company' as ReceiptType,
  companyId: '', source: '', projectId: '', yearId: '',
  date: '', amount: '', reference: '', description: '',
};

// Grid cell keyed by companyId — a per-company account number + amount.
type GridCell = { reference: string; amount: string };

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
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [info, setInfo] = useState<FundReceipt | null>(null);

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? '—';
  const yearName = (id: string) => years.find(y => y.id === id)?.name ?? '—';
  const project = (id: string) => projects.find(p => p.id === id);
  const projectName = (id: string) => (id ? (project(id)?.name ?? '—') : '—');
  const projectCode = (id: string) => (id ? (project(id)?.projectCode ?? '') : '');
  // A row's headline: the donor company, or the source for an other-source receipt.
  const receiptTitle = (r: FundReceipt) => (r.receiptType === 'other_source' ? (r.source || 'Other Source') : companyName(r.companyId));

  const today = todayISO();

  // The Financial Year dropdown only offers ACTIVE years — the server rejects a
  // new receipt booked against an inactive one. When EDITING a record whose year
  // has since gone inactive, that year stays selectable so old data isn't corrupted.
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
        companyName(r.companyId), r.source, r.reference, r.description,
        projectCode(r.projectId), projectName(r.projectId),
      ].some(t => (t || '').toLowerCase().includes(s))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts, companyFilter, yearFilter, q, companies, projects]);

  const total = useMemo(() => filtered.reduce((sum, r) => sum + r.amount, 0), [filtered]);

  // ── Form open helpers ───────────────────────────────────────────────────────
  const openAdd = (receiptType: ReceiptType) => {
    setEditing(null);
    setGrid({});
    setStaged([]);
    setForm({ ...blank, receiptType, yearId: activeYears[0]?.id ?? '' });
    setShowForm(true);
  };
  const openEdit = (r: FundReceipt) => {
    // Editing is always single-record, even for a receipt that was created via
    // the per-company grid — we reuse the single form with the record's type.
    setEditing(r);
    setGrid({});
    setStaged([]);
    setForm({
      receiptType: r.receiptType, companyId: r.companyId, source: r.source,
      projectId: r.projectId, yearId: r.yearId, date: r.date,
      amount: String(r.amount), reference: r.reference, description: r.description,
    });
    setShowForm(true);
  };

  // Grid mode: a NEW company receipt with a project selected → one row per
  // company funding that project, each banking from its own account. Editing
  // always stays single-record.
  const gridMode = !editing && form.receiptType === 'company' && !!form.projectId;
  const gridProject = project(form.projectId);
  const gridCompanies = gridProject
    ? gridProject.companyIds.map(id => companies.find(c => c.id === id)).filter((c): c is Company => !!c)
    : [];
  const gridCell = (id: string): GridCell => grid[id] ?? { reference: '', amount: '' };
  const setGridCell = (id: string, k: keyof GridCell, v: string) =>
    setGrid(g => ({ ...g, [id]: { ...gridCell(id), [k]: v } }));
  const gridTotal = gridCompanies.reduce((sum, c) => sum + (Number(gridCell(c.id).amount) || 0), 0);

  // Changing the project resets the grid so amounts never carry across projects.
  const onProjectChange = (v: string) => { set('projectId', v); setGrid({}); };

  const save = async () => {
    if (!form.date) { Alert.alert('Missing details', 'Receipt Date is required.'); return; }
    if (form.date > today) { Alert.alert('Invalid date', 'Receipt Date cannot be in the future.'); return; }
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
            amount: amt, description: form.description.trim(),
          });
        }
      }
      if (rows.length === 0) {
        Alert.alert('Nothing to record', 'Enter an amount for at least one company.');
        return;
      }
      setSaving(true);
      const ids = await bulkAdd(rows);
      setSaving(false);
      if (!ids || !ids.length) return;        // batch rejected — keep the form open
      setShowForm(false);
      // Each staged proof is attached to EVERY receipt the entry created.
      for (const id of ids) {
        if (staged.length) await uploadStaged('receipts', id, staged);
      }
      setStaged([]);
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
      amount: Number(form.amount) || 0, description: form.description.trim(),
    };
    if (editing) {
      // Proof on an existing receipt uploads as soon as it's picked.
      update(editing.id, payload);
      setShowForm(false);
      return;
    }
    setSaving(true);
    const newId = await add(payload);
    setSaving(false);
    if (!newId) return;                       // create failed — keep the form open
    setShowForm(false);
    if (staged.length) await uploadStaged('receipts', newId, staged);
    setStaged([]);
  };

  const companyOpts = [{ label: 'All Companies', value: 'all' }, ...companies.map(c => ({ label: c.name, value: c.id }))];
  const yearOpts = [{ label: 'All Years', value: 'all' }, ...years.map(y => ({ label: y.name, value: y.id }))];
  // A company is REQUIRED for both receipt types — there is no "no company" option.
  const formCompanyOpts = companies.map(c => ({ label: c.name, value: c.id }));
  // A project is picked as "RURA2025 — Rural Uplift", the way it's named everywhere.
  const projectOpts = [
    { label: '— No project —', value: '' },
    ...projects.map(p => ({ label: projectLabel(p), value: p.id })),
  ];

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
          <Input value={q} onChangeText={setQ} placeholder="Search Project ID, company, source, account…" style={styles.searchInput} />
        </View>

        <ExportButtons type="fund-receipts" />

        {/* List columns (§5.5): Date · Donor/Source · Year · Project ID · Project ·
            Account Number · Amount. Tap a row for the full record. */}
        <DataTable
          rows={filtered}
          keyFor={r => r.id}
          empty="No fund receipts match your filters."
          onRowPress={r => setInfo(r)}
          resetKey={`${companyFilter}|${yearFilter}|${q}`}
          columns={[
            { label: 'DATE', width: 88, render: r => <TCell text={fmtNice(r.date) || '—'} strong /> },
            { label: 'DONOR / SOURCE', width: 130, render: r => <TCell text={receiptTitle(r)} /> },
            { label: 'YEAR', width: 88, render: r => <TCell text={yearName(r.yearId)} /> },
            { label: 'PROJECT ID', width: 100, render: r => (r.projectId ? <CodeBadge code={projectCode(r.projectId)} /> : <TCell text="—" />) },
            { label: 'PROJECT', width: 130, render: r => <TCell text={r.projectId ? projectName(r.projectId) : '—'} /> },
            { label: 'ACCOUNT NUMBER', width: 130, render: r => <TCell text={r.reference || '—'} /> },
            { label: 'AMOUNT', width: 105, right: true, render: r => <TCell text={inr(r.amount)} right color={theme.success} strong /> },
            ...(canEdit ? [{
              label: '', width: 90, right: true,
              render: (r: FundReceipt) => <RowActions onEdit={() => openEdit(r)} onDelete={() => setDelId(r.id)} />,
            }] : []),
          ]}
        />
      </ScrollView>

      {canEdit && (
        <Modal visible={showForm} title={formTitle} onClose={() => setShowForm(false)}>
          {/* Shared header fields — entered once, even for the grid. */}
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}><Field label="Financial Year *"><Select value={form.yearId} options={formYearOpts(form.yearId)} onChange={v => set('yearId', v)} placeholder="Select year" /></Field></View>
            <View style={{ flex: 1 }}>
              <Field label="Receipt Date *">
                {/* Never in the future — the server rejects it regardless. */}
                <DatePicker value={form.date} onChange={v => set('date', v)} placeholder="Receipt date" maxDate={today} />
              </Field>
            </View>
          </View>
          <Field label="Project"><Select value={form.projectId} options={projectOpts} onChange={onProjectChange} placeholder="— No project —" /></Field>
          {!form.projectId && (
            <Text style={styles.projectHint}>
              A receipt has to name a project for that project's carry forward to be computable.
            </Text>
          )}

          {form.receiptType === 'other_source' && (
            <Field label="Source *">
              {hasSourceList
                ? <Select value={form.source} options={sourceValues.map(v => ({ label: v, value: v }))} onChange={v => set('source', v)} placeholder="Select source" />
                : <Input value={form.source} onChangeText={t => set('source', t)} placeholder="e.g. Interest, FD, SIP" />}
            </Field>
          )}

          {gridMode ? (
            // Per-company grid: one row per funding company, each with its OWN
            // account number (companies do not share one). Blank/zero rows skip.
            // The batch is all-or-nothing: if any row fails, nothing is written.
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

          <Field label="Description"><Input value={form.description} onChangeText={t => set('description', t)} placeholder="Anything worth recording about this receipt" multiline /></Field>

          {/* Proof documents — any type, any number, 15 MB each. On a grid entry
              each staged file is attached to EVERY receipt the entry creates. */}
          <Field label="Attach Proof">
            <Attachments
              parent="receipts"
              recordId={editing?.id ?? null}
              staged={staged}
              onStagedChange={setStaged}
              canEdit={canEdit}
            />
          </Field>

          <Button
            label={saving ? 'Saving…' : editing ? 'Save Changes' : 'Record'}
            onPress={save}
            disabled={saving}
          />
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
          { label: 'Project', value: info.projectId ? projectLabel(project(info.projectId)) : '—' },
          { label: 'Financial Year', value: yearName(info.yearId) },
          { label: 'Account Number', value: info.reference || '—' },
          { label: 'Amount', value: inr(info.amount) },
        ] : undefined}
        description={info?.description}
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

  formRow: { flexDirection: 'row', gap: 10 },
  projectHint: { fontSize: 11.5, color: theme.faint, fontWeight: '500', lineHeight: 16, marginTop: -8, marginBottom: 14 },

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
