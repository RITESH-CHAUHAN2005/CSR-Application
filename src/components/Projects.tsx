// Screen 4 — CSR Projects: company filter + search, cards, add/edit/delete.
// Form fields mirror the web app's Add Project dialog (multi-company, no financial year).
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { MapPin } from 'phosphor-react-native/src/icons/MapPin';
import { CalendarBlank } from 'phosphor-react-native/src/icons/CalendarBlank';
import { Check } from 'phosphor-react-native/src/icons/Check';
import { categoryColors, theme } from '../theme';
import {
  AddPill, Button, Card, Company, Confirm, DatePicker, EmptyState, Field,
  FinancialYear, Header, InfoButton, InfoModal, Input, MasterDataItem, Modal, Pill, Project, Select,
  PROJECT_STATUS_OPTS, projectStatusLabel, projectStatusTone,
  DERIVED_STATUS_OPTS, derivedStatusLabel, fmtNice, inr, toISO, useAuth,
} from '../../App';

type Props = {
  projects: Project[];
  companies: Company[];
  years: FinancialYear[];          // still passed by App.tsx, but a project has no financial year
  masterData: MasterDataItem[];
  add: (p: Omit<Project, 'id'>) => void;
  update: (id: string, p: Omit<Project, 'id'>) => void;
  remove: (id: string) => void;
};

const blank = {
  name: '', companyIds: [] as string[], category: '',
  location: '', budget: '', status: 'active' as Project['status'],
  derivedStatus: 'other' as Project['derivedStatus'],
  startDate: '', endDate: '', description: '', notes: '',
};

export default function Projects({ projects, companies, masterData, add, update, remove }: Props) {
  const { canEdit } = useAuth();
  const [companyFilter, setCompanyFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Project | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [delId, setDelId] = useState<string | null>(null);
  const [info, setInfo] = useState<Project | null>(null);

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? '—';
  // A project is funded by one or more companies — render them as a joined name list.
  const companyNames = (ids: string[]) => (ids.length ? ids.map(companyName).join(', ') : '—');

  // Category options come from Master Data; fall back to a free-text Input when empty
  // so data entry is never blocked. Preserve an editing record's out-of-list value.
  const categoryValues = masterData.filter(m => m.type === 'category').map(m => m.value);
  const categoryOpts = (current: string) => {
    const opts = categoryValues.map(v => ({ label: v, value: v }));
    if (current && !categoryValues.includes(current)) opts.push({ label: current, value: current });
    return opts;
  };

  // Companies filter matches any project that includes the selected company.
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return projects.filter(p =>
      (companyFilter === 'all' || p.companyIds.includes(companyFilter)) &&
      (!s || p.name.toLowerCase().includes(s) || p.category.toLowerCase().includes(s) || p.location.toLowerCase().includes(s)));
  }, [projects, companyFilter, q]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...blank });
    setShowForm(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({
      name: p.name, companyIds: [...p.companyIds], category: p.category,
      location: p.location, budget: String(p.budget), status: p.status,
      derivedStatus: p.derivedStatus, startDate: p.startDate, endDate: p.endDate,
      description: p.description, notes: p.notes,
    });
    setShowForm(true);
  };

  // Toggle a company id in/out of the multi-select list.
  const toggleCompany = (id: string) =>
    set('companyIds', form.companyIds.includes(id) ? form.companyIds.filter(x => x !== id) : [...form.companyIds, id]);

  const save = () => {
    // Required (*) fields: Project Name, at least one Company, Start Date.
    if (!form.name.trim() || form.companyIds.length === 0) {
      Alert.alert('Missing details', 'Project Name and at least one Company are required.');
      return;
    }
    if (!form.startDate) {
      Alert.alert('Start date required', 'Please choose the project start date.');
      return;
    }
    // Start date can never be in the future — compare ISO strings.
    if (form.startDate > toISO(new Date())) {
      Alert.alert('Invalid start date', 'The start date cannot be in the future.');
      return;
    }
    if (form.budget.trim() && !(Number(form.budget) >= 0)) {
      Alert.alert('Invalid budget', 'Approved Budget must be a valid number.');
      return;
    }
    // On Hold / Cancelled projects must carry a reason (description or notes) so
    // reviewers understand why the project was paused or stopped. Same rule the
    // backend enforces — checked here too for a friendlier message.
    if ((form.status === 'on_hold' || form.status === 'cancelled') &&
        !form.description.trim() && !form.notes.trim()) {
      Alert.alert(
        'Add a reason',
        `A ${projectStatusLabel(form.status)} project must have a Description or Notes explaining why.`,
      );
      return;
    }
    const payload: Omit<Project, 'id'> = {
      name: form.name.trim(), companyIds: form.companyIds,
      category: form.category.trim(), location: form.location.trim(),
      budget: Number(form.budget) || 0, status: form.status, derivedStatus: form.derivedStatus,
      // endDate is server-derived and read-only — the api layer omits it on the wire.
      startDate: form.startDate, endDate: form.endDate,
      description: form.description.trim(), notes: form.notes.trim(),
    };
    if (editing) update(editing.id, payload); else add(payload);
    setShowForm(false);
  };

  const companyOpts = [{ label: 'All Companies', value: 'all' }, ...companies.map(c => ({ label: c.name, value: c.id }))];
  const hasCategoryList = categoryValues.length > 0;

  return (
    <View style={{ flex: 1 }}>
      <Header title="CSR Projects" subtitle={`${projects.length} projects`} action={<AddPill onPress={openAdd} />} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Projects have no financial year — the only list filter is Company (full-width). */}
        <View style={styles.filters}>
          <View style={{ flex: 1 }}><Select value={companyFilter} options={companyOpts} onChange={setCompanyFilter} /></View>
        </View>
        <View style={styles.search}>
          <MagnifyingGlass size={18} color={theme.faint} />
          <Input value={q} onChangeText={setQ} placeholder="Search name, category, location…" style={styles.searchInput} />
        </View>

        {filtered.length === 0 && <EmptyState text="No projects match your filters." />}

        {filtered.map(p => {
          const cat = categoryColors[p.category] ?? { fg: theme.muted, bg: '#eef0f7' };
          const endLabel = p.endDate ? fmtNice(p.endDate) : (p.derivedStatus === 'ongoing' ? 'Ongoing' : '—');
          const period = p.startDate ? `${fmtNice(p.startDate)} → ${endLabel}` : '';
          return (
            <Card key={p.id} style={styles.card}>
              <View style={[styles.accent, { backgroundColor: cat.fg }]} />
              <View style={styles.titleRow}>
                <Text style={styles.title}>{p.name}</Text>
                <InfoButton onPress={() => setInfo(p)} />
                <Pill text={projectStatusLabel(p.status)} tone={projectStatusTone(p.status)} />
              </View>

              <View style={styles.catRow}>
                {!!p.category && (
                  <View style={[styles.catChip, { backgroundColor: cat.bg }]}>
                    <Text style={[styles.catText, { color: cat.fg }]}>{p.category}</Text>
                  </View>
                )}
                {!!p.location && (
                  <View style={styles.loc}>
                    <MapPin size={13} color={theme.faint} weight="fill" />
                    <Text style={styles.locText} numberOfLines={1}>{p.location}</Text>
                  </View>
                )}
              </View>

              <View style={styles.metaRow}>
                <Meta label="Companies" value={companyNames(p.companyIds)} />
                <Meta label="Type" value={derivedStatusLabel(p.derivedStatus)} />
                <Meta label="Budget" value={inr(p.budget)} strong />
              </View>

              {!!period && (
                <View style={styles.dateRow}>
                  <CalendarBlank size={13} color={theme.faint} weight="fill" />
                  <Text style={styles.dateText}>{period}</Text>
                </View>
              )}

              {!!p.description && <Text style={styles.desc}>{p.description}</Text>}
              {!!p.notes && <Text style={styles.notes}>Note: {p.notes}</Text>}

              {canEdit && (
                <View style={styles.actions}>
                  <Pressable style={styles.action} onPress={() => openEdit(p)} hitSlop={6}>
                    <PencilSimple size={16} color={theme.primary} />
                    <Text style={[styles.actionText, { color: theme.primary }]}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.action, p.status === 'active' && { opacity: 0.45 }]}
                    hitSlop={6}
                    onPress={() => {
                      // Active projects can't be deleted — complete them first.
                      if (p.status === 'active') {
                        Alert.alert('Project is still active', `"${p.name}" is ongoing. Mark it as Completed before deleting it.`);
                      } else {
                        setDelId(p.id);
                      }
                    }}>
                    <Trash size={16} color={theme.danger} />
                    <Text style={[styles.actionText, { color: theme.danger }]}>Delete</Text>
                  </Pressable>
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>

      {canEdit && (
        <>
      <Modal visible={showForm} title={editing ? 'Edit Project' : 'Add Project'} onClose={() => setShowForm(false)}>
        <Field label="Project Name *"><Input value={form.name} onChangeText={t => set('name', t)} placeholder="Project name" /></Field>

        {/* Companies — multi-select checkbox list, at least one required. No per-company amount. */}
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
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}><Field label="Approved Budget (₹)"><Input value={form.budget} onChangeText={t => set('budget', t)} placeholder="0" keyboardType="numeric" /></Field></View>
          <View style={{ flex: 1 }}>
            <Field label="Category">
              {hasCategoryList
                ? <Select value={form.category} options={categoryOpts(form.category)} onChange={v => set('category', v)} placeholder="Select category" />
                : <Input value={form.category} onChangeText={t => set('category', t)} placeholder="e.g. Education, Healthcare" />}
            </Field>
          </View>
        </View>
        <Field label="Location"><Input value={form.location} onChangeText={t => set('location', t)} placeholder="City, State" /></Field>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}><Field label="Start Date *"><DatePicker value={form.startDate} onChange={v => set('startDate', v)} placeholder="Start date" /></Field></View>
          <View style={{ flex: 1 }}>
            {/* End Date is server-derived from the start date — read-only, never sent. */}
            <Field label="End Date">
              <View style={styles.ongoingBox}>
                <Text style={styles.ongoingBoxText}>
                  {editing && form.endDate ? fmtNice(form.endDate) : 'Set automatically from the start date'}
                </Text>
              </View>
            </Field>
          </View>
        </View>
        <Field label="Description"><Input value={form.description} onChangeText={t => set('description', t)} placeholder="Project description…" multiline /></Field>
        <Field label="Notes"><Input value={form.notes} onChangeText={t => set('notes', t)} placeholder="Any additional notes" multiline /></Field>
        <Button label={editing ? 'Save Changes' : 'Add Project'} onPress={save} />
      </Modal>

      <Confirm
        visible={!!delId}
        title="Delete project?"
        message="This will also remove its expenditure records and attached documents. This can't be undone."
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
          { label: 'Status', value: projectStatusLabel(info.status) },
          { label: 'Companies', value: companyNames(info.companyIds) },
          { label: 'Derived Status', value: derivedStatusLabel(info.derivedStatus) },
          {
            label: 'Period',
            value: `${fmtNice(info.startDate) || '—'} → ${info.endDate ? fmtNice(info.endDate) : (info.derivedStatus === 'ongoing' ? 'Ongoing' : '—')}`,
          },
        ] : undefined}
        description={info?.description}
        notes={info?.notes}
      />
    </View>
  );
}

const Meta = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <View style={styles.meta}>
    <Text style={styles.metaLabel}>{label.toUpperCase()}</Text>
    <Text style={[styles.metaValue, strong && { color: theme.primary, fontWeight: '800' }]} numberOfLines={1}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28, gap: 12 },
  filters: { flexDirection: 'row', gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingLeft: 14, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', minHeight: 48 },

  card: { overflow: 'hidden', paddingLeft: 20 },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontSize: 15.5, fontWeight: '700', color: theme.text },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  catChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  catText: { fontSize: 11.5, fontWeight: '700' },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  locText: { fontSize: 12, color: theme.muted, fontWeight: '500' },

  metaRow: { flexDirection: 'row', marginTop: 14, gap: 8 },
  meta: { flex: 1 },
  metaLabel: { fontSize: 9.5, color: theme.faint, fontWeight: '700', letterSpacing: 0.5 },
  metaValue: { fontSize: 13, color: theme.text, fontWeight: '600', marginTop: 3 },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  dateText: { fontSize: 12, color: theme.muted, fontWeight: '600' },

  desc: { fontSize: 13, color: theme.muted, lineHeight: 19, marginTop: 12 },
  notes: { fontSize: 12, color: theme.faint, fontStyle: 'italic', marginTop: 6, lineHeight: 17 },

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

  ongoingBox: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: '#f1f2f9', justifyContent: 'center', paddingHorizontal: 13 },
  ongoingBoxText: { fontSize: 13, color: theme.muted, fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 13.5, fontWeight: '700' },
});
