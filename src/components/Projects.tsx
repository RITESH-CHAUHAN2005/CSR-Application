// Screen 4 — CSR Projects: company filter + search, table, add/edit/delete.
//
// Three things the SERVER owns and the app must never send (§7 of FEATURES.md):
//   • projectCode  — the "Project ID" (4 letters of the name + its FY's start year,
//                    e.g. RURA2025). Shown everywhere a project appears; read-only.
//   • financialYearId — the FY the START DATE falls into.
//   • endDate      — Ongoing → end of the FY 3 years later; otherwise the end of
//                    the start FY itself.
// All three are previewed read-only on the form so the user sees what will happen.
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { Check } from 'phosphor-react-native/src/icons/Check';
import { theme } from '../theme';
import Attachments, { StagedFile, uploadStaged } from './Attachments';
import {
  AddPill, Button, CodeBadge, Company, Confirm, DataTable, DatePicker,
  ExportButtons, Field,
  FinancialYear, Header, InfoModal, Input, MasterDataItem, Modal, Pill, Project,
  RowActions, Select, TCell,
  PROJECT_STATUS_OPTS, projectStatusLabel, projectStatusTone,
  DERIVED_STATUS_OPTS, derivedStatusLabel, fmtNice, inr, todayISO, useAuth,
} from '../../App';

type Props = {
  projects: Project[];
  companies: Company[];
  years: FinancialYear[];          // used only to NAME the server-derived financial year
  masterData: MasterDataItem[];
  add: (p: Omit<Project, 'id'>) => Promise<string | null>;
  update: (id: string, p: Omit<Project, 'id'>) => void;
  remove: (id: string) => void;
};

const blank = {
  name: '', projectCode: '', companyIds: [] as string[], category: '',
  location: '', budget: '', interventionPartner: '',
  status: 'active' as Project['status'],
  derivedStatus: 'other' as Project['derivedStatus'],
  startDate: '', endDate: '', yearId: '', description: '',
};

export default function Projects({ projects, companies, years, masterData, add, update, remove }: Props) {
  const { canEdit } = useAuth();
  const [companyFilter, setCompanyFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Project | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [info, setInfo] = useState<Project | null>(null);

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? '—';
  // A project is funded by one or more companies — render them as a joined name list.
  const companyNames = (ids: string[]) => (ids.length ? ids.map(companyName).join(', ') : '—');

  // The financial year a project belongs to is set by the SERVER — it is the FY
  // the start date falls into. The app never sends it; it only names the id it
  // gets back, and previews the same rule on the form so the user sees the year
  // update live as they change the start date.
  const yearName = (id: string) => years.find(y => y.id === id)?.name ?? '';
  const yearForDate = (d: string) => (d ? years.find(y => y.start && y.end && d >= y.start && d <= y.end) : undefined);
  const projectYearLabel = (p: Project) => yearName(p.yearId) || yearForDate(p.startDate)?.name || '—';

  // Category options come from Master Data — never hard-coded, so an admin editing
  // Master Data is reflected here. Each value carries its Schedule VII clause as a
  // description, shown under the dropdown once a category is picked.
  const categories = masterData.filter(m => m.type === 'category');
  const categoryValues = categories.map(m => m.value);
  const categoryOpts = (current: string) => {
    const opts = categoryValues.map(v => ({ label: v, value: v }));
    // Preserve an editing record's out-of-list value so an edit can't silently drop it.
    if (current && !categoryValues.includes(current)) opts.push({ label: current, value: current });
    return opts;
  };
  const categoryClause = (v: string) => categories.find(m => m.value === v)?.description ?? '';

  // Company filter matches any project that includes the selected company.
  // Search spans the Project ID, name, category, location, intervention partner,
  // description and the funding companies' names.
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return projects.filter(p =>
      (companyFilter === 'all' || p.companyIds.includes(companyFilter)) &&
      (!s || [
        p.projectCode, p.name, p.category, p.location, p.interventionPartner, p.description,
        ...p.companyIds.map(id => companies.find(c => c.id === id)?.name ?? ''),
      ].some(t => (t || '').toLowerCase().includes(s))));
  }, [projects, companyFilter, q, companies]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...blank });
    setStaged([]);
    setShowForm(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({
      name: p.name, projectCode: p.projectCode, companyIds: [...p.companyIds], category: p.category,
      location: p.location, budget: String(p.budget), interventionPartner: p.interventionPartner,
      status: p.status, derivedStatus: p.derivedStatus, startDate: p.startDate, endDate: p.endDate,
      yearId: p.yearId, description: p.description,
    });
    setStaged([]);
    setShowForm(true);
  };

  // Toggle a company id in/out of the multi-select list.
  const toggleCompany = (id: string) =>
    set('companyIds', form.companyIds.includes(id) ? form.companyIds.filter(x => x !== id) : [...form.companyIds, id]);

  const save = async () => {
    // Required (*) fields: Project Name, at least one Company, Start Date.
    if (!form.name.trim() || form.companyIds.length === 0) {
      Alert.alert('Missing details', 'Project Name and at least one Company are required.');
      return;
    }
    if (!form.startDate) {
      Alert.alert('Start date required', 'Please choose the project start date.');
      return;
    }
    // Start date can never be in the future — compare ISO strings (the picker is
    // capped at today too; this catches a value carried in from an old record).
    if (form.startDate > todayISO()) {
      Alert.alert('Invalid start date', 'The start date cannot be in the future.');
      return;
    }
    if (form.budget.trim() && !(Number(form.budget) >= 0)) {
      Alert.alert('Invalid budget', 'Approved Budget must be a valid number.');
      return;
    }
    // An On Hold / Cancelled project must carry a Description explaining why. The
    // server enforces this; checking here just gives a friendlier message. (The old
    // rule accepted "description OR notes" — notes no longer exists.)
    if ((form.status === 'on_hold' || form.status === 'cancelled') && !form.description.trim()) {
      Alert.alert(
        'Add a reason',
        `A ${projectStatusLabel(form.status)} project must have a Description explaining why.`,
      );
      return;
    }
    const payload: Omit<Project, 'id'> = {
      name: form.name.trim(), companyIds: form.companyIds,
      category: form.category.trim(), location: form.location.trim(),
      budget: Number(form.budget) || 0,
      interventionPartner: form.interventionPartner.trim(),
      status: form.status, derivedStatus: form.derivedStatus,
      // projectCode, endDate and yearId are server-derived and read-only — the api
      // layer omits all three on the wire; they're carried here only so the shape
      // stays complete.
      projectCode: form.projectCode,
      startDate: form.startDate, endDate: form.endDate, yearId: form.yearId,
      description: form.description.trim(),
    };
    if (editing) {
      // Documents on an existing project upload as soon as they're picked.
      update(editing.id, payload);
      setShowForm(false);
      return;
    }
    // New project: create it first, then upload whatever was staged on the form.
    setSaving(true);
    const newId = await add(payload);
    setSaving(false);
    if (!newId) return;                       // create failed — keep the form open
    setShowForm(false);
    if (staged.length) await uploadStaged('projects', newId, staged);
    setStaged([]);
  };

  const companyOpts = [{ label: 'All Companies', value: 'all' }, ...companies.map(c => ({ label: c.name, value: c.id }))];
  const hasCategoryList = categoryValues.length > 0;

  // Read-only FY shown on the form: the year the chosen start date falls into
  // (what the server will store), falling back to the saved year when editing.
  const fyPreview = !form.startDate
    ? 'Set automatically from the start date'
    : (yearForDate(form.startDate)?.name
       || yearName(form.yearId)
       || 'No financial year covers this start date');

  const clause = categoryClause(form.category);

  return (
    <View style={{ flex: 1 }}>
      <Header title="CSR Projects" subtitle={`${projects.length} projects`} action={<AddPill onPress={openAdd} />} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.filters}>
          <View style={{ flex: 1 }}><Select value={companyFilter} options={companyOpts} onChange={setCompanyFilter} /></View>
        </View>
        <View style={styles.search}>
          <MagnifyingGlass size={18} color={theme.faint} />
          <Input value={q} onChangeText={setQ} placeholder="Search Project ID, name, category, partner…" style={styles.searchInput} />
        </View>

        {/* Server-generated PDF / Excel of the projects list — available to every role. */}
        <ExportButtons type="projects" />

        {/* The Project ID rides as a badge next to the name. Companies, category,
            location, partner and the dates are all in the details popup a row-tap away. */}
        <DataTable
          rows={filtered}
          keyFor={p => p.id}
          empty="No projects match your filters."
          onRowPress={p => setInfo(p)}
          resetKey={`${companyFilter}|${q}`}
          columns={[
            {
              label: 'PROJECT', width: 165, grow: true,
              render: p => (
                <View style={{ gap: 3 }}>
                  <TCell text={p.name} strong />
                  <CodeBadge code={p.projectCode} />
                </View>
              ),
            },
            // 110 so a "Completed" / "Cancelled" pill isn't clipped.
            { label: 'STATUS', width: 110, render: p => <Pill text={projectStatusLabel(p.status)} tone={projectStatusTone(p.status)} /> },
            { label: 'BUDGET', width: 100, right: true, render: p => <TCell text={inr(p.budget)} right color={theme.primary} strong /> },
            // FY is assigned by the server from the start date — read-only everywhere.
            { label: 'FY', width: 90, render: p => <TCell text={projectYearLabel(p)} /> },
            ...(canEdit ? [{
              label: '', width: 90, right: true,
              render: (p: Project) => (
                <RowActions
                  onEdit={() => openEdit(p)}
                  onDelete={() => {
                    // An active project can't be deleted — the server returns a 409,
                    // for everyone including admins. Complete it first.
                    if (p.status === 'active') {
                      Alert.alert('Project is still active', `"${p.name}" is active. Mark it as Completed before deleting it.`);
                    } else {
                      setDelId(p.id);
                    }
                  }}
                />
              ),
            }] : []),
          ]}
        />
      </ScrollView>

      {canEdit && (
        <>
      <Modal visible={showForm} title={editing ? 'Edit Project' : 'Add Project'} onClose={() => setShowForm(false)}>
        <Field label="Project Name *"><Input value={form.name} onChangeText={t => set('name', t)} placeholder="Project name" /></Field>

        {/* Project ID — issued by the server, never typed. */}
        <Field label="Project ID">
          <View style={styles.readonlyBox}>
            <Text style={styles.readonlyText}>
              {form.projectCode || 'Issued automatically when you save'}
            </Text>
          </View>
        </Field>

        {/* Companies — multi-select checkbox list, at least one required. There is
            no per-company amount: how much each paid comes only from its receipts. */}
        <Field label="Companies *">
          <View style={styles.companyList}>
            {companies.length === 0 && <Text style={styles.companyEmpty}>No companies yet — add one first.</Text>}
            {companies.map(c => {
              const sel = form.companyIds.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => toggleCompany(c.id)}
                  style={[styles.companyRow, sel && styles.companyRowSel]}>
                  <View style={[styles.checkbox, sel && styles.checkboxSel]}>
                    {sel && <Check size={13} color="#fff" weight="bold" />}
                  </View>
                  <Text style={[styles.companyText, sel && styles.companyTextSel]} numberOfLines={1}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}><Field label="Status"><Select value={form.status} options={PROJECT_STATUS_OPTS} onChange={v => set('status', v as Project['status'])} /></Field></View>
          <View style={{ flex: 1 }}><Field label="Derived Status"><Select value={form.derivedStatus} options={DERIVED_STATUS_OPTS} onChange={v => set('derivedStatus', v as Project['derivedStatus'])} /></Field></View>
        </View>

        <Field label="Approved Budget (₹)"><Input value={form.budget} onChangeText={t => set('budget', t)} placeholder="0" keyboardType="numeric" /></Field>

        {/* Category — the 12 Schedule VII heads, read from Master Data. The clause
            behind the short label shows underneath once one is picked. */}
        <Field label="Category">
          {hasCategoryList
            ? <Select value={form.category} options={categoryOpts(form.category)} onChange={v => set('category', v)} placeholder="Select category" />
            : <Input value={form.category} onChangeText={t => set('category', t)} placeholder="e.g. Education & Livelihood" />}
        </Field>
        {!!clause && (
          <View style={styles.clauseBox}>
            <Text style={styles.clauseText}>{clause}</Text>
          </View>
        )}

        <Field label="Intervention Partner">
          <Input
            value={form.interventionPartner}
            onChangeText={t => set('interventionPartner', t)}
            placeholder="Implementing agency / NGO, if not run directly"
          />
        </Field>
        <Field label="Location"><Input value={form.location} onChangeText={t => set('location', t)} placeholder="City, State" /></Field>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Field label="Start Date *">
              {/* Never in the future — the picker is capped at today. */}
              <DatePicker value={form.startDate} onChange={v => set('startDate', v)} placeholder="Start date" maxDate={todayISO()} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            {/* End Date is server-derived from the start date — read-only, never sent. */}
            <Field label="End Date">
              <View style={styles.readonlyBox}>
                <Text style={styles.readonlyText}>
                  {editing && form.endDate ? fmtNice(form.endDate) : 'Set automatically from the start date'}
                </Text>
              </View>
            </Field>
          </View>
        </View>

        {/* Financial Year is never typed by the user — the server assigns the FY the
            start date falls into. Previewed here so it updates live with the date. */}
        <Field label="Financial Year">
          <View style={styles.readonlyBox}>
            <Text style={styles.readonlyText}>{fyPreview}</Text>
          </View>
        </Field>

        <Field label={form.status === 'on_hold' || form.status === 'cancelled' ? 'Description *' : 'Description'}>
          <Input
            value={form.description}
            onChangeText={t => set('description', t)}
            placeholder={form.status === 'on_hold' || form.status === 'cancelled'
              ? `Why is this project ${projectStatusLabel(form.status).toLowerCase()}?`
              : 'Project description…'}
            multiline
          />
        </Field>

        {/* Any file type, any number of them, 15 MB each. On a new project they
            upload after it's created. */}
        <Field label="Attach Documents">
          <Attachments
            parent="projects"
            recordId={editing?.id ?? null}
            staged={staged}
            onStagedChange={setStaged}
            canEdit={canEdit}
          />
        </Field>

        <Button
          label={saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Project'}
          onPress={save}
          disabled={saving}
        />
      </Modal>

      <Confirm
        visible={!!delId}
        title="Delete project?"
        message="This will permanently remove the project and its attached documents. This can't be undone."
        onCancel={() => setDelId(null)}
        onConfirm={() => { if (delId) remove(delId); setDelId(null); }}
      />
        </>
      )}

      {/* Read-only details popup — available to every role (viewers included). */}
      <InfoModal
        visible={!!info}
        title={info?.name ?? 'Project'}
        onClose={() => setInfo(null)}
        rows={info ? [
          { label: 'Project ID', value: info.projectCode || '—' },
          { label: 'Status', value: projectStatusLabel(info.status) },
          { label: 'Companies', value: companyNames(info.companyIds) },
          { label: 'Derived Status', value: derivedStatusLabel(info.derivedStatus) },
          { label: 'Category', value: info.category || '—' },
          ...(categoryClause(info.category) ? [{ label: 'Schedule VII clause', value: categoryClause(info.category) }] : []),
          { label: 'Intervention Partner', value: info.interventionPartner || '—' },
          { label: 'Location', value: info.location || '—' },
          { label: 'Approved Budget', value: inr(info.budget) },
          {
            label: 'Period',
            value: `${fmtNice(info.startDate) || '—'} → ${info.endDate ? fmtNice(info.endDate) : '—'}`,
          },
          { label: 'Financial Year', value: projectYearLabel(info) },
        ] : undefined}
        description={info?.description}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28, gap: 12 },
  filters: { flexDirection: 'row', gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingLeft: 14, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', minHeight: 48 },

  formRow: { flexDirection: 'row', gap: 10 },

  // Multi-select company checkbox list.
  companyList: { gap: 8 },
  companyEmpty: { fontSize: 13, color: theme.muted, paddingVertical: 6 },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: '#fff', paddingHorizontal: 13, paddingVertical: 12 },
  companyRowSel: { backgroundColor: theme.primarySoft, borderColor: theme.primary },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#c7cbe0', alignItems: 'center', justifyContent: 'center' },
  checkboxSel: { backgroundColor: theme.primary, borderColor: theme.primary },
  companyText: { flex: 1, fontSize: 13.5, color: theme.text, fontWeight: '600' },
  companyTextSel: { color: theme.primary, fontWeight: '700' },

  // A field the SERVER fills in — shown, never typed.
  readonlyBox: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: '#f1f2f9', justifyContent: 'center', paddingHorizontal: 13 },
  readonlyText: { fontSize: 13, color: theme.muted, fontWeight: '600' },

  // The Schedule VII clause behind the chosen Category value.
  clauseBox: {
    backgroundColor: theme.primarySoft, borderRadius: 12, borderWidth: 1, borderColor: theme.border,
    padding: 11, marginTop: -6, marginBottom: 14,
  },
  clauseText: { fontSize: 11.5, color: theme.muted, fontWeight: '500', lineHeight: 17 },
});
