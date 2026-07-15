// Screen 6 — Expenditures (the "F.Expense" record): money spent on projects.
//
// An expenditure is deliberately MINIMAL: project, company, financial year,
// amount, date, approved by, description. That's it. There is no Category, no
// Notes, no Nature of Expense, no Capital Asset block, no Direct/Partner flag —
// and no carry-forward INPUT: carry forward is derived, never typed (§2).
//
// The Project drives everything: it narrows the Company dropdown to that project's
// funders, and it opens the read-only POSITION TABLE — what each company has paid
// in, what has already been spent of it, and what is therefore still available.
// That table is the whole point of the screen: it tells the user how much of a
// company's money is left before they book a new spend.
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { Warning } from 'phosphor-react-native/src/icons/Warning';
import { theme } from '../theme';
import Attachments, { StagedFile, uploadStaged } from './Attachments';
import {
  AddPill, Button, CodeBadge, Company, Confirm, DataTable, DatePicker, ExportButtons,
  Expenditure, Field, FinancialYear, FundReceipt, Header, InfoModal, Input, Modal, Project,
  RowActions, Select, TCell, fmtNice, inr, projectLabel, sumBy, todayISO, useAuth,
} from '../../App';

type Props = {
  expenditures: Expenditure[];
  projects: Project[];
  companies: Company[];
  years: FinancialYear[];
  receipts: FundReceipt[];
  add: (e: Omit<Expenditure, 'id'>) => Promise<string | null>;
  update: (id: string, e: Omit<Expenditure, 'id'>) => void;
  remove: (id: string) => void;
};

const blank = {
  projectId: '', companyId: '', yearId: '',
  amount: '', date: '', approvedBy: '', description: '', reference: '',
};

export default function Expenditures({
  expenditures, projects, companies, years, receipts, add, update, remove,
}: Props) {
  const { canEdit } = useAuth();
  const [companyFilter, setCompanyFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Expenditure | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [info, setInfo] = useState<Expenditure | null>(null);

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const project = (id: string) => projects.find(p => p.id === id);
  const projectName = (id: string) => project(id)?.name ?? '—';
  const projectCode = (id: string) => project(id)?.projectCode ?? '';
  const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? '—';
  const yearName = (id: string) => years.find(y => y.id === id)?.name ?? '—';

  const today = todayISO();

  // The Financial Year is chosen INDEPENDENTLY of the project and is limited to
  // ACTIVE years — the server rejects a new expenditure on an inactive one. When
  // editing a record whose year has since gone inactive, that year stays selectable
  // so old data isn't corrupted.
  const activeYears = years.filter(y => y.active);
  const formYearOpts = (currentId: string) => {
    const opts = activeYears.map(y => ({ label: y.name, value: y.id }));
    if (currentId && !activeYears.some(y => y.id === currentId)) {
      const y = years.find(yy => yy.id === currentId);
      if (y) opts.push({ label: `${y.name} (inactive)`, value: y.id });
    }
    return opts;
  };

  const selectedProject = project(form.projectId) ?? null;
  const isOngoing = selectedProject?.derivedStatus === 'ongoing';
  // Picking a project narrows the Company dropdown to that project's funders.
  const formCompanyOpts = selectedProject
    ? companies
        .filter(c => selectedProject.companyIds.includes(c.id))
        .map(c => ({ label: c.name, value: c.id }))
    : [];

  // ── The position table (§5.6) ───────────────────────────────────────────────
  // One row per company funding the selected project:
  //   Received      — what that company actually paid INTO this project.
  //                   Only `company` receipts count; an other_source receipt is
  //                   income earned on the funds, never a contribution.
  //   Already Spent — what has been booked against this project+company. When
  //                   EDITING, this record's own amount is EXCLUDED so it isn't
  //                   double-counted against itself.
  //   Remaining     — Received − Already Spent.
  const positions = useMemo(() => {
    if (!selectedProject) return [];
    return selectedProject.companyIds.map(cid => {
      const received = sumBy(
        receipts.filter(r =>
          r.projectId === selectedProject.id && r.companyId === cid && r.receiptType === 'company'),
        r => r.amount,
      );
      const alreadySpent = sumBy(
        expenditures.filter(e =>
          e.projectId === selectedProject.id && e.companyId === cid &&
          (!editing || e.id !== editing.id)),
        e => e.amount,
      );
      return { id: cid, name: companyName(cid), received, alreadySpent, remaining: received - alreadySpent };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, receipts, expenditures, editing, companies]);

  const thisAmount = Number(form.amount) || 0;
  const picked = positions.find(p => p.id === form.companyId);
  // What is left of THIS company's money after this entry is booked.
  const remainingAfter = picked ? picked.remaining - thisAmount : 0;
  // A spend that over-runs what that company has left is flagged — not blocked
  // (the money may legitimately have come from elsewhere), but never silent.
  const overspend = !!picked && thisAmount > 0 && remainingAfter < 0;
  // Carry Forward is a READ-ONLY figure, not an input. For an Ongoing project it
  // shows what remains unspent after this entry: max(0, received − spent).
  const carryForwardAfter = Math.max(0, remainingAfter);

  // Picking a project clears the company (it may not fund the new project); if the
  // project has exactly one company, auto-select it.
  const pickProject = (projectId: string) => {
    const p = project(projectId);
    const only = p && p.companyIds.length === 1 ? p.companyIds[0] : '';
    setForm(f => ({ ...f, projectId, companyId: only }));
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return expenditures.filter(e =>
      (companyFilter === 'all' || e.companyId === companyFilter) &&
      (yearFilter === 'all' || e.yearId === yearFilter) &&
      (!s || [
        e.approvedBy, e.description, e.reference,
        projectCode(e.projectId), projectName(e.projectId), companyName(e.companyId),
      ].some(t => (t || '').toLowerCase().includes(s))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenditures, companyFilter, yearFilter, q, projects, companies]);

  const total = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);

  const openAdd = () => {
    setEditing(null);
    const p = projects[0];
    const only = p && p.companyIds.length === 1 ? p.companyIds[0] : '';
    setForm({ ...blank, projectId: p?.id ?? '', companyId: only, yearId: activeYears[0]?.id ?? '' });
    setStaged([]);
    setShowForm(true);
  };
  const openEdit = (e: Expenditure) => {
    setEditing(e);
    setStaged([]);
    setForm({
      projectId: e.projectId, companyId: e.companyId, yearId: e.yearId,
      amount: String(e.amount), date: e.date, approvedBy: e.approvedBy,
      description: e.description, reference: e.reference,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.projectId) { Alert.alert('Missing details', 'Project is required.'); return; }
    if (!form.companyId) { Alert.alert('Missing details', 'Company is required.'); return; }
    if (!form.yearId) { Alert.alert('Missing details', 'Financial Year is required.'); return; }
    if (!form.date) { Alert.alert('Missing details', 'Date of Spend is required.'); return; }
    // Money cannot be spent tomorrow — the server 422s a future date regardless.
    if (form.date > today) { Alert.alert('Invalid date', 'The Date of Spend cannot be in the future.'); return; }
    if (!(Number(form.amount) > 0)) { Alert.alert('Missing details', 'Enter a valid Amount Spent.'); return; }

    const payload: Omit<Expenditure, 'id'> = {
      date: form.date.trim(),
      projectId: form.projectId,
      companyId: form.companyId,
      yearId: form.yearId,
      approvedBy: form.approvedBy.trim(),
      amount: Number(form.amount) || 0,
      description: form.description.trim(),
      reference: form.reference.trim(),
    };
    if (editing) {
      // Documents on an existing expenditure upload as soon as they're picked.
      update(editing.id, payload);
      setShowForm(false);
      return;
    }
    // New expenditure: create it, then upload whatever was staged on the form.
    setSaving(true);
    const newId = await add(payload);
    setSaving(false);
    if (!newId) return;                       // create failed — keep the form open
    setShowForm(false);
    if (staged.length) await uploadStaged('expenditures', newId, staged);
    setStaged([]);
  };

  const companyOpts = [{ label: 'All Companies', value: 'all' }, ...companies.map(c => ({ label: c.name, value: c.id }))];
  const yearOpts = [{ label: 'All Years', value: 'all' }, ...years.map(y => ({ label: y.name, value: y.id }))];
  // A project is picked as "RURA2025 — Rural Uplift", the way it's named everywhere.
  const projectOpts = projects.map(p => ({ label: projectLabel(p), value: p.id }));

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Expenditures"
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
          <Input value={q} onChangeText={setQ} placeholder="Search Project ID, project, company…" style={styles.searchInput} />
        </View>

        <ExportButtons type="expenditures" />

        {/* List columns (§5.6): Project ID · Date of Spend · Project · Company ·
            Year · Approved By · Amount Spent. */}
        <DataTable
          rows={filtered}
          keyFor={e => e.id}
          empty="No expenditures match your filters."
          onRowPress={e => setInfo(e)}
          resetKey={`${companyFilter}|${yearFilter}|${q}`}
          columns={[
            { label: 'PROJECT ID', width: 100, render: e => <CodeBadge code={projectCode(e.projectId)} /> },
            { label: 'DATE OF SPEND', width: 100, render: e => <TCell text={fmtNice(e.date) || '—'} strong /> },
            { label: 'PROJECT', width: 140, render: e => <TCell text={projectName(e.projectId)} /> },
            { label: 'COMPANY', width: 120, render: e => <TCell text={companyName(e.companyId)} /> },
            { label: 'YEAR', width: 88, render: e => <TCell text={yearName(e.yearId)} /> },
            { label: 'APPROVED BY', width: 120, render: e => <TCell text={e.approvedBy || '—'} /> },
            { label: 'AMOUNT SPENT', width: 110, right: true, render: e => <TCell text={inr(e.amount)} right color={theme.danger} strong /> },
            ...(canEdit ? [{
              label: '', width: 90, right: true,
              render: (e: Expenditure) => <RowActions onEdit={() => openEdit(e)} onDelete={() => setDelId(e.id)} />,
            }] : []),
          ]}
        />
      </ScrollView>

      {canEdit && (
        <Modal
          visible={showForm}
          title={editing ? 'Edit Expenditure' : 'Record Expenditure'}
          onClose={() => setShowForm(false)}
        >
          <Field label="Project *">
            <Select
              value={form.projectId}
              options={projectOpts}
              onChange={pickProject}
              placeholder="Select project"
            />
          </Field>

          {/* The position table — how much of each company's money is still
              available before booking a new spend. */}
          <Field label="Position on this project">
            {!selectedProject ? (
              <View style={styles.posEmpty}><Text style={styles.posEmptyText}>Select a project first.</Text></View>
            ) : positions.length === 0 ? (
              <View style={styles.posEmpty}><Text style={styles.posEmptyText}>This project has no companies assigned.</Text></View>
            ) : (
              <View style={styles.pos}>
                <View style={styles.posHeadRow}>
                  <Text style={[styles.posHead, styles.posNameCol]}>COMPANY</Text>
                  <Text style={[styles.posHead, styles.posNumCol]}>RECEIVED</Text>
                  <Text style={[styles.posHead, styles.posNumCol]}>SPENT</Text>
                  <Text style={[styles.posHead, styles.posNumCol]}>REMAINING</Text>
                </View>
                {positions.map(p => {
                  const on = p.id === form.companyId;
                  return (
                    <View key={p.id} style={[styles.posRow, on && styles.posRowOn]}>
                      <Text style={[styles.posName, styles.posNameCol, on && { color: theme.primary }]} numberOfLines={2}>{p.name}</Text>
                      <Text style={[styles.posNum, styles.posNumCol, { color: theme.success }]} numberOfLines={1} adjustsFontSizeToFit>{inr(p.received)}</Text>
                      <Text style={[styles.posNum, styles.posNumCol, { color: theme.danger }]} numberOfLines={1} adjustsFontSizeToFit>{inr(p.alreadySpent)}</Text>
                      <Text style={[styles.posNum, styles.posNumCol, { color: p.remaining >= 0 ? theme.text : theme.danger, fontWeight: '800' }]} numberOfLines={1} adjustsFontSizeToFit>{inr(p.remaining)}</Text>
                    </View>
                  );
                })}
                {editing && (
                  <Text style={styles.posNote}>
                    "Spent" excludes this record, so editing it doesn't count its own amount twice.
                  </Text>
                )}
              </View>
            )}
          </Field>

          <Field label="Company *">
            <Select
              value={form.companyId}
              options={formCompanyOpts}
              onChange={v => set('companyId', v)}
              placeholder={form.projectId ? 'Select company' : 'Select a project first'}
            />
          </Field>

          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Field label="Financial Year *">
                <Select value={form.yearId} options={formYearOpts(form.yearId)} onChange={v => set('yearId', v)} placeholder="Select year" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Date of Spend *">
                {/* Money cannot be spent tomorrow — the picker is capped at today. */}
                <DatePicker value={form.date} onChange={v => set('date', v)} placeholder="Date" maxDate={today} />
              </Field>
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Field label="Amount Spent (₹) *">
                <Input value={form.amount} onChangeText={t => set('amount', t)} placeholder="0" keyboardType="numeric" />
              </Field>
            </View>
            {/* Carry Forward is a READ-ONLY figure, never an input. Only an Ongoing
                project carries one forward. */}
            {isOngoing && (
              <View style={{ flex: 1 }}>
                <Field label="Carry Forward">
                  <View style={styles.readonlyBox}>
                    <Text style={styles.readonlyText} numberOfLines={1} adjustsFontSizeToFit>
                      {picked ? inr(carryForwardAfter) : 'Pick a company'}
                    </Text>
                  </View>
                </Field>
              </View>
            )}
          </View>

          {overspend && (
            <View style={styles.warn}>
              <Warning size={15} color={theme.danger} weight="fill" />
              <Text style={styles.warnText}>
                This spend is {inr(Math.abs(remainingAfter))} more than {picked?.name} has left on this
                project ({inr(picked?.remaining ?? 0)} remaining). It will still save — check it's right.
              </Text>
            </View>
          )}

          <Field label="Approved By">
            <Input value={form.approvedBy} onChangeText={t => set('approvedBy', t)} placeholder="Name or designation" />
          </Field>
          <Field label="Reference Number">
            <Input value={form.reference} onChangeText={t => set('reference', t)} placeholder="Voucher / bill reference" />
          </Field>
          <Field label="Description">
            <Input value={form.description} onChangeText={t => set('description', t)} placeholder="What was this expenditure for?" multiline />
          </Field>

          {/* Any file type, any number, 15 MB each. On a new record they upload
              after it's created. */}
          <Field label="Attach Documents">
            <Attachments
              parent="expenditures"
              recordId={editing?.id ?? null}
              staged={staged}
              onStagedChange={setStaged}
              canEdit={canEdit}
            />
          </Field>

          <Button
            label={saving ? 'Saving…' : editing ? 'Save Changes' : 'Record Expenditure'}
            onPress={save}
            disabled={saving}
          />
        </Modal>
      )}

      {canEdit && (
        <Confirm
          visible={!!delId}
          title="Delete expenditure?"
          message="This will permanently remove the expenditure and its attached documents."
          onCancel={() => setDelId(null)}
          onConfirm={() => { if (delId) remove(delId); setDelId(null); }}
        />
      )}

      {/* Read-only details popup — available to every role (viewers included). */}
      <InfoModal
        visible={!!info}
        title={info ? projectName(info.projectId) : 'Expenditure'}
        onClose={() => setInfo(null)}
        rows={info ? [
          { label: 'Project', value: info ? projectLabel(project(info.projectId)) : '—' },
          { label: 'Date of Spend', value: fmtNice(info.date) || '—' },
          { label: 'Company', value: companyName(info.companyId) },
          { label: 'Financial Year', value: yearName(info.yearId) },
          { label: 'Amount Spent', value: inr(info.amount) },
          { label: 'Approved By', value: info.approvedBy || '—' },
          { label: 'Reference', value: info.reference || '—' },
        ] : undefined}
        description={info?.description}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28, gap: 12 },
  filters: { flexDirection: 'row', gap: 10 },
  search: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 14, paddingLeft: 14, borderWidth: 1, borderColor: theme.border,
  },
  searchInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', minHeight: 48 },

  formRow: { flexDirection: 'row', gap: 10 },

  // A field the app computes and shows but never lets the user type (Carry Forward).
  readonlyBox: {
    minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: theme.border,
    backgroundColor: '#f1f2f9', justifyContent: 'center', paddingHorizontal: 13,
  },
  readonlyText: { fontSize: 14, color: theme.accent, fontWeight: '800' },

  // ── Position table: what each company has left on the selected project ──
  pos: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, overflow: 'hidden' },
  posHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: theme.primarySoft },
  posHead: { fontSize: 9, color: theme.muted, fontWeight: '800', letterSpacing: 0.4 },
  posRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: theme.border },
  posRowOn: { backgroundColor: '#f7f8fd' },
  posNameCol: { flex: 1.5 },
  posNumCol: { flex: 1, textAlign: 'right' },
  posName: { fontSize: 12, color: theme.text, fontWeight: '600' },
  posNum: { fontSize: 11.5, fontWeight: '700' },
  posNote: { fontSize: 10.5, color: theme.faint, fontWeight: '500', lineHeight: 15, padding: 9, borderTopWidth: 1, borderTopColor: theme.border },
  posEmpty: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    backgroundColor: '#f7f8fd', padding: 14,
  },
  posEmptyText: { fontSize: 12.5, color: theme.faint, fontStyle: 'italic' },

  warn: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: theme.dangerSoft, borderRadius: 12, borderWidth: 1, borderColor: theme.danger,
    padding: 11, marginTop: -4, marginBottom: 14,
  },
  warnText: { flex: 1, fontSize: 12, color: theme.danger, fontWeight: '600', lineHeight: 17 },
});
