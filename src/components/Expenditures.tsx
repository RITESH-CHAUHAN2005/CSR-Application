// Screen 6 — Expenditures: money spent on projects. Company/year filters + search,
// cards, add/edit/delete. Form fields mirror the web app's Record Expenditure
// dialog, adapted to a mobile card layout.
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { HandCoins } from 'phosphor-react-native/src/icons/HandCoins';
import { Buildings } from 'phosphor-react-native/src/icons/Buildings';
import { theme } from '../theme';
import {
  AddPill,
  Button,
  Card,
  Company,
  Confirm,
  DatePicker,
  EmptyState,
  Expenditure,
  Field,
  FinancialYear,
  Header,
  InfoButton,
  InfoModal,
  Input,
  MasterDataItem,
  Modal,
  Pill,
  Project,
  Select,
  fmtNice,
  inr,
  useAuth,
} from '../../App';

type Props = {
  expenditures: Expenditure[];
  projects: Project[];
  companies: Company[];
  years: FinancialYear[];
  masterData: MasterDataItem[];
  add: (e: Omit<Expenditure, 'id'>) => void;
  update: (id: string, e: Omit<Expenditure, 'id'>) => void;
  remove: (id: string) => void;
};

const blank = {
  projectId: '',
  companyId: '',
  yearId: '',
  amount: '',
  carryForwardAmount: '',
  date: '',
  category: '',
  approvedBy: '',
  description: '',
  reference: '',
  notes: '',
};

export default function Expenditures({
  expenditures,
  projects,
  companies,
  years,
  masterData,
  add,
  update,
  remove,
}: Props) {
  const { canEdit } = useAuth();
  const [companyFilter, setCompanyFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Expenditure | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [delId, setDelId] = useState<string | null>(null);
  const [info, setInfo] = useState<Expenditure | null>(null);

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const projectName = (id: string) =>
    projects.find(p => p.id === id)?.name ?? '—';
  const companyName = (id: string) =>
    companies.find(c => c.id === id)?.name ?? '—';
  const yearName = (id: string) => years.find(y => y.id === id)?.name ?? '—';

  // Record form's Financial Year dropdown only offers ACTIVE years (current
  // value kept when editing a record whose year has since gone inactive, so old
  // data isn't corrupted).
  const activeYears = years.filter(y => y.active);
  const formYearOpts = (currentId: string) => {
    const opts = activeYears.map(y => ({ label: y.name, value: y.id }));
    if (currentId && !activeYears.some(y => y.id === currentId)) {
      const y = years.find(yy => yy.id === currentId);
      if (y) opts.push({ label: `${y.name} (inactive)`, value: y.id });
    }
    return opts;
  };

  // Category dropdown draws from Master Data ('category' values). If the list is
  // empty we fall back to a plain text Input so data entry is never blocked.
  const categoryOpts = masterData
    .filter(m => m.type === 'category')
    .map(m => ({ label: m.value, value: m.value }));

  // The picked project drives the Company dropdown (only its funding companies)
  // and whether the Carry Forward field is shown (Ongoing projects only). There
  // is no financial year on a project anymore, so the FY stays user-chosen.
  const selectedProject = projects.find(p => p.id === form.projectId) ?? null;
  const formCompanyOpts = selectedProject
    ? companies
        .filter(c => selectedProject.companyIds.includes(c.id))
        .map(c => ({ label: c.name, value: c.id }))
    : [];
  const isOngoing = selectedProject?.derivedStatus === 'ongoing';
  const contributingNames = selectedProject
    ? selectedProject.companyIds.map(id => companyName(id))
    : [];

  // Picking a project limits the Company dropdown to that project's companies;
  // if the project has exactly one company, auto-select it. The previously
  // chosen company is cleared because it may not fund the new project.
  const pickProject = (projectId: string) => {
    const p = projects.find(x => x.id === projectId);
    const only = p && p.companyIds.length === 1 ? p.companyIds[0] : '';
    setForm(f => ({ ...f, projectId, companyId: only }));
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return expenditures.filter(
      e =>
        (companyFilter === 'all' || e.companyId === companyFilter) &&
        (yearFilter === 'all' || e.yearId === yearFilter) &&
        (!s ||
          [
            e.category,
            e.approvedBy,
            e.description,
            e.reference,
            projects.find(p => p.id === e.projectId)?.name ?? '',
            companies.find(c => c.id === e.companyId)?.name ?? '',
          ].some(t => t.toLowerCase().includes(s))),
    );
  }, [expenditures, companyFilter, yearFilter, q, projects, companies]);

  const total = useMemo(
    () => filtered.reduce((sum, e) => sum + e.amount, 0),
    [filtered],
  );

  const openAdd = () => {
    setEditing(null);
    const p = projects[0];
    const only = p && p.companyIds.length === 1 ? p.companyIds[0] : '';
    setForm({ ...blank, projectId: p?.id ?? '', companyId: only });
    setShowForm(true);
  };
  const openEdit = (e: Expenditure) => {
    setEditing(e);
    setForm({
      projectId: e.projectId,
      companyId: e.companyId,
      yearId: e.yearId,
      amount: String(e.amount),
      carryForwardAmount: e.carryForwardAmount ? String(e.carryForwardAmount) : '',
      date: e.date,
      category: e.category,
      approvedBy: e.approvedBy,
      description: e.description,
      reference: e.reference,
      notes: e.notes,
    });
    setShowForm(true);
  };
  const save = () => {
    // Every *-marked field must be filled: Project, Company, Financial Year, Amount, Date.
    if (
      !form.projectId ||
      !form.companyId ||
      !form.yearId ||
      !form.date ||
      !(Number(form.amount) > 0)
    )
      return;
    const payload: Omit<Expenditure, 'id'> = {
      date: form.date.trim(),
      projectId: form.projectId,
      companyId: form.companyId,
      yearId: form.yearId,
      category: form.category.trim(),
      approvedBy: form.approvedBy.trim(),
      amount: Number(form.amount) || 0,
      // Carry Forward is only meaningful (and only collected) for Ongoing
      // projects — forced to 0 otherwise, always sent.
      carryForwardAmount: isOngoing ? Number(form.carryForwardAmount) || 0 : 0,
      description: form.description.trim(),
      reference: form.reference.trim(),
      notes: form.notes.trim(),
    };
    if (editing) update(editing.id, payload);
    else add(payload);
    setShowForm(false);
  };

  const companyOpts = [
    { label: 'All Companies', value: 'all' },
    ...companies.map(c => ({ label: c.name, value: c.id })),
  ];
  const yearOpts = [
    { label: 'All Years', value: 'all' },
    ...years.map(y => ({ label: y.name, value: y.id })),
  ];

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Expenditures"
        subtitle={`${filtered.length} records · Total ${inr(total)}`}
        action={<AddPill onPress={openAdd} />}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.filters}>
          <View style={{ flex: 1 }}>
            <Select
              value={companyFilter}
              options={companyOpts}
              onChange={setCompanyFilter}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Select
              value={yearFilter}
              options={yearOpts}
              onChange={setYearFilter}
            />
          </View>
        </View>
        <View style={styles.search}>
          <MagnifyingGlass size={18} color={theme.faint} />
          <Input
            value={q}
            onChangeText={setQ}
            placeholder="Search expenditures…"
            style={styles.searchInput}
          />
        </View>

        {filtered.length === 0 && (
          <EmptyState text="No expenditures match your filters." />
        )}

        {filtered.map(e => (
          <Card key={e.id} style={styles.card}>
            <View style={styles.topRow}>
              <View style={styles.chip}>
                <HandCoins size={22} color={theme.danger} weight="fill" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {projectName(e.projectId)}
                </Text>
                <Text style={styles.date}>
                  {fmtNice(e.date) || '—'} · {companyName(e.companyId)}
                </Text>
              </View>
              <Text style={styles.amount}>{inr(e.amount)}</Text>
              <InfoButton onPress={() => setInfo(e)} />
            </View>

            <View style={styles.metaRow}>
              {!!e.category && <Pill text={e.category} tone="amber" />}
              <Meta label="Year" value={yearName(e.yearId)} right />
            </View>

            {!!e.approvedBy && (
              <View style={styles.metaRow}>
                <Meta label="Approved By" value={e.approvedBy} />
                {!!e.reference && (
                  <Meta label="Reference" value={e.reference} right />
                )}
              </View>
            )}
            {!e.approvedBy && !!e.reference && (
              <View style={styles.metaRow}>
                <Meta label="Reference" value={e.reference} />
              </View>
            )}

            {!!e.description && (
              <Text style={styles.desc}>{e.description}</Text>
            )}
            {!!e.notes && <Text style={styles.notes}>Note: {e.notes}</Text>}

            {canEdit && (
              <View style={styles.actions}>
                <Pressable
                  style={styles.action}
                  onPress={() => openEdit(e)}
                  hitSlop={6}
                >
                  <PencilSimple size={16} color={theme.primary} />
                  <Text style={[styles.actionText, { color: theme.primary }]}>
                    Edit
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={() => setDelId(e.id)}
                  hitSlop={6}
                >
                  <Trash size={16} color={theme.danger} />
                  <Text style={[styles.actionText, { color: theme.danger }]}>
                    Delete
                  </Text>
                </Pressable>
              </View>
            )}
          </Card>
        ))}
      </ScrollView>

      <Modal
        visible={showForm}
        title={editing ? 'Edit Expenditure' : 'Record Expenditure'}
        onClose={() => setShowForm(false)}
      >
        <Field label="Project *">
          <Select
            value={form.projectId}
            options={projects.map(p => ({ label: p.name, value: p.id }))}
            onChange={pickProject}
            placeholder="Select project"
          />
        </Field>
        <Field label="Company *">
          <Select
            value={form.companyId}
            options={formCompanyOpts}
            onChange={v => set('companyId', v)}
            placeholder={
              form.projectId ? 'Select company' : 'Select a project first'
            }
          />
        </Field>

        {/* Read-only panel: who has funded the selected project so far. */}
        <View style={styles.contribBox}>
          <View style={styles.contribHead}>
            <Buildings size={14} color={theme.primary} weight="bold" />
            <Text style={styles.contribTitle}>Contributing Companies</Text>
          </View>
          {contributingNames.length > 0 ? (
            <Text style={styles.contribNames}>
              {contributingNames.join(' · ')}
            </Text>
          ) : (
            <Text style={styles.contribEmpty}>Select a project first</Text>
          )}
        </View>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Field label="Financial Year *">
              <Select
                value={form.yearId}
                options={formYearOpts(form.yearId)}
                onChange={v => set('yearId', v)}
                placeholder="Select year"
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Date *">
              <DatePicker
                value={form.date}
                onChange={v => set('date', v)}
                placeholder="Date"
              />
            </Field>
          </View>
        </View>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Field label="Amount (₹) *">
              <Input
                value={form.amount}
                onChangeText={t => set('amount', t)}
                placeholder="0"
                keyboardType="numeric"
              />
            </Field>
          </View>
          {/* Carry Forward only applies to Ongoing projects (0 otherwise). */}
          {isOngoing && (
            <View style={{ flex: 1 }}>
              <Field label="Carry Forward Amount (₹)">
                <Input
                  value={form.carryForwardAmount}
                  onChangeText={t => set('carryForwardAmount', t)}
                  placeholder="0"
                  keyboardType="numeric"
                />
              </Field>
            </View>
          )}
        </View>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Field label="Category">
              {categoryOpts.length > 0 ? (
                <Select
                  value={form.category}
                  options={categoryOpts}
                  onChange={v => set('category', v)}
                  placeholder="Select category"
                />
              ) : (
                <Input
                  value={form.category}
                  onChangeText={t => set('category', t)}
                  placeholder="e.g. Training, Equipment"
                />
              )}
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Approved By">
              <Input
                value={form.approvedBy}
                onChangeText={t => set('approvedBy', t)}
                placeholder="Name or designation"
              />
            </Field>
          </View>
        </View>
        <Field label="Description">
          <Input
            value={form.description}
            onChangeText={t => set('description', t)}
            placeholder="What was this expenditure for?"
            multiline
          />
        </Field>
        <Field label="Reference Number">
          <Input
            value={form.reference}
            onChangeText={t => set('reference', t)}
            placeholder="Voucher / bill reference"
          />
        </Field>
        <Field label="Notes">
          <Input
            value={form.notes}
            onChangeText={t => set('notes', t)}
            placeholder="Additional notes…"
            multiline
          />
        </Field>
        {canEdit && (
          <Button
            label={editing ? 'Save Changes' : 'Record Expenditure'}
            onPress={save}
          />
        )}
      </Modal>

      <Confirm
        visible={!!delId}
        title="Delete expenditure?"
        message="This will permanently remove the expenditure."
        onCancel={() => setDelId(null)}
        onConfirm={() => {
          if (delId) remove(delId);
          setDelId(null);
        }}
      />

      {/* Read-only details popup — available to every role (viewers included).
          Includes the Financial Year so a multi-year project's spend is clear,
          and the Carry Forward only when it's actually set. */}
      <InfoModal
        visible={!!info}
        title={info ? projectName(info.projectId) : 'Expenditure'}
        onClose={() => setInfo(null)}
        rows={info ? [
          { label: 'Date', value: fmtNice(info.date) || '—' },
          { label: 'Financial Year', value: yearName(info.yearId) },
          { label: 'Company', value: companyName(info.companyId) },
          { label: 'Amount', value: inr(info.amount) },
          ...(info.carryForwardAmount > 0
            ? [{ label: 'Carry Forward', value: inr(info.carryForwardAmount) }]
            : []),
          { label: 'Category', value: info.category || '—' },
          { label: 'Approved By', value: info.approvedBy || '—' },
          { label: 'Reference', value: info.reference || '—' },
        ] : undefined}
        description={info?.description}
        notes={info?.notes}
      />
    </View>
  );
}

const Meta = ({
  label,
  value,
  right,
}: {
  label: string;
  value: string;
  right?: boolean;
}) => (
  <View style={[styles.meta, right && { alignItems: 'flex-end' }]}>
    <Text style={styles.metaLabel}>{label.toUpperCase()}</Text>
    <Text style={styles.metaValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28, gap: 12 },
  filters: { flexDirection: 'row', gap: 10 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingLeft: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: 48,
  },

  card: {},
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: theme.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '700', color: theme.text },
  date: { fontSize: 12, color: theme.faint, marginTop: 3, fontWeight: '500' },
  amount: { fontSize: 16, fontWeight: '800', color: theme.danger },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
  },
  meta: { flex: 1 },
  metaLabel: {
    fontSize: 9.5,
    color: theme.faint,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 13,
    color: theme.text,
    fontWeight: '600',
    marginTop: 3,
  },

  desc: { fontSize: 13, color: theme.muted, lineHeight: 19, marginTop: 12 },
  notes: {
    fontSize: 12,
    color: theme.faint,
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 17,
  },

  formRow: { flexDirection: 'row', gap: 10 },
  // Soft info box listing the selected project's funding companies.
  contribBox: {
    backgroundColor: theme.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    marginBottom: 14,
  },
  contribHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contribTitle: {
    fontSize: 10,
    color: theme.primary,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  contribNames: {
    fontSize: 13,
    color: theme.text,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 19,
  },
  contribEmpty: {
    fontSize: 13,
    color: theme.faint,
    fontStyle: 'italic',
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 18,
    marginTop: 14,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 13.5, fontWeight: '700' },
});
