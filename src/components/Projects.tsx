// Screen 4 — CSR Projects: company/year filters + search, cards, add/edit/delete.
// Form fields mirror the web app's Add Project dialog.
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { MapPin } from 'phosphor-react-native/src/icons/MapPin';
import { CalendarBlank } from 'phosphor-react-native/src/icons/CalendarBlank';
import { categoryColors, theme } from '../theme';
import {
  AddPill, Button, Card, Company, Confirm, DatePicker, EmptyState, Field,
  FinancialYear, Header, InfoButton, InfoModal, Input, Modal, Pill, Project, Select,
  PROJECT_STATUS_OPTS, projectStatusLabel, projectStatusTone, fmtNice, inr, useAuth,
} from '../../App';

type Props = {
  projects: Project[];
  companies: Company[];
  years: FinancialYear[];
  add: (p: Omit<Project, 'id'>) => void;
  update: (id: string, p: Omit<Project, 'id'>) => void;
  remove: (id: string) => void;
};

const blank = {
  name: '', companyId: '', yearId: '', category: '',
  location: '', budget: '', status: 'active' as Project['status'],
  ongoing: false, startDate: '', endDate: '', description: '', notes: '',
};

export default function Projects({ projects, companies, years, add, update, remove }: Props) {
  const { canEdit } = useAuth();
  const [companyFilter, setCompanyFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Project | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [delId, setDelId] = useState<string | null>(null);
  const [info, setInfo] = useState<Project | null>(null);

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const companyName = (id: string) => companies.find(c => c.id === id)?.name ?? '—';
  const yearName = (id: string) => years.find(y => y.id === id)?.name ?? '—';

  // Form's Financial Year dropdown only offers ACTIVE years. When editing a
  // record tied to an inactive year, that year is still shown (marked) so the
  // existing value is preserved rather than silently dropped.
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
    return projects.filter(p =>
      (companyFilter === 'all' || p.companyId === companyFilter) &&
      (yearFilter === 'all' || p.yearId === yearFilter) &&
      (!s || p.name.toLowerCase().includes(s) || p.category.toLowerCase().includes(s) || p.location.toLowerCase().includes(s)));
  }, [projects, companyFilter, yearFilter, q]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...blank, companyId: companies[0]?.id ?? '', yearId: activeYears[0]?.id ?? years[0]?.id ?? '' });
    setShowForm(true);
  };
  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({
      name: p.name, companyId: p.companyId, yearId: p.yearId, category: p.category,
      location: p.location, budget: String(p.budget), status: p.status,
      ongoing: p.ongoing, startDate: p.startDate, endDate: p.endDate,
      description: p.description, notes: p.notes,
    });
    setShowForm(true);
  };
  const save = () => {
    // Required (*) fields: Project Name, Company, Financial Year, Start Date.
    if (!form.name.trim() || !form.companyId || !form.yearId) {
      Alert.alert('Missing details', 'Project Name, Company and Financial Year are required.');
      return;
    }
    if (!form.startDate) {
      Alert.alert('Start date required', 'Please choose the project start date.');
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
      name: form.name.trim(), companyId: form.companyId, yearId: form.yearId,
      category: form.category.trim(), location: form.location.trim(),
      budget: Number(form.budget) || 0, status: form.status, ongoing: form.ongoing,
      // An ongoing project has no fixed end date.
      startDate: form.startDate, endDate: form.ongoing ? '' : form.endDate,
      description: form.description.trim(), notes: form.notes.trim(),
    };
    if (editing) update(editing.id, payload); else add(payload);
    setShowForm(false);
  };

  const companyOpts = [{ label: 'All Companies', value: 'all' }, ...companies.map(c => ({ label: c.name, value: c.id }))];
  const yearOpts = [{ label: 'All Years', value: 'all' }, ...years.map(y => ({ label: y.name, value: y.id }))];

  return (
    <View style={{ flex: 1 }}>
      <Header title="CSR Projects" subtitle={`${projects.length} projects`} action={<AddPill onPress={openAdd} />} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.filters}>
          <View style={{ flex: 1 }}><Select value={companyFilter} options={companyOpts} onChange={setCompanyFilter} /></View>
          <View style={{ flex: 1 }}><Select value={yearFilter} options={yearOpts} onChange={setYearFilter} /></View>
        </View>
        <View style={styles.search}>
          <MagnifyingGlass size={18} color={theme.faint} />
          <Input value={q} onChangeText={setQ} placeholder="Search name, category, location…" style={styles.searchInput} />
        </View>

        {filtered.length === 0 && <EmptyState text="No projects match your filters." />}

        {filtered.map(p => {
          const cat = categoryColors[p.category] ?? { fg: theme.muted, bg: '#eef0f7' };
          const endLabel = p.ongoing ? 'Ongoing' : (fmtNice(p.endDate) || '—');
          const period = p.startDate || p.endDate || p.ongoing ? `${fmtNice(p.startDate) || '—'} → ${endLabel}` : '';
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
                <Meta label="Company" value={companyName(p.companyId)} />
                <Meta label="Year" value={yearName(p.yearId)} />
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
                      // Active/ongoing projects can't be deleted — complete them first.
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
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}><Field label="Company *"><Select value={form.companyId} options={companies.map(c => ({ label: c.name, value: c.id }))} onChange={v => set('companyId', v)} placeholder="Select company" /></Field></View>
          <View style={{ flex: 1 }}><Field label="Financial Year *"><Select value={form.yearId} options={formYearOpts(form.yearId)} onChange={v => set('yearId', v)} placeholder="Select year" /></Field></View>
        </View>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}><Field label="Status"><Select value={form.status} options={PROJECT_STATUS_OPTS} onChange={v => set('status', v as Project['status'])} /></Field></View>
          <View style={{ flex: 1 }}><Field label="Approved Budget (₹)"><Input value={form.budget} onChangeText={t => set('budget', t)} placeholder="0" keyboardType="numeric" /></Field></View>
        </View>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}><Field label="Category"><Input value={form.category} onChangeText={t => set('category', t)} placeholder="e.g. Education, Healthcare" /></Field></View>
          <View style={{ flex: 1 }}><Field label="Location"><Input value={form.location} onChangeText={t => set('location', t)} placeholder="City, State" /></Field></View>
        </View>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}><Field label="Start Date *"><DatePicker value={form.startDate} onChange={v => set('startDate', v)} placeholder="Start date" /></Field></View>
          <View style={{ flex: 1 }}>
            <Field label="End Date">
              {form.ongoing
                ? <View style={styles.ongoingBox}><Text style={styles.ongoingBoxText}>Ongoing — no end date</Text></View>
                : <DatePicker value={form.endDate} onChange={v => set('endDate', v)} placeholder="End date" />}
            </Field>
          </View>
        </View>
        {/* Ongoing = the project is still running with no fixed end date. */}
        <Pressable style={styles.ongoingRow} onPress={() => set('ongoing', !form.ongoing)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ongoingLabel}>Ongoing project</Text>
            <Text style={styles.ongoingHint}>Turn on if the project is still running with no fixed end date.</Text>
          </View>
          <Switch
            value={form.ongoing}
            onValueChange={v => set('ongoing', v)}
            trackColor={{ true: theme.primary, false: '#d5d8e5' }}
            thumbColor="#fff"
          />
        </Pressable>
        <Field label="Description"><Input value={form.description} onChangeText={t => set('description', t)} placeholder="Project description…" multiline /></Field>
        <Field label="Notes"><Input value={form.notes} onChangeText={t => set('notes', t)} placeholder="Any additional notes" multiline /></Field>
        <Button label={editing ? 'Save Changes' : 'Add Project'} onPress={save} />
      </Modal>

      <Confirm
        visible={!!delId}
        title="Delete project?"
        message="This project will be permanently removed."
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
          { label: 'Company', value: companyName(info.companyId) },
          { label: 'Financial Year', value: yearName(info.yearId) },
          {
            label: 'Period',
            value: `${fmtNice(info.startDate) || '—'} → ${info.ongoing ? 'Ongoing' : (fmtNice(info.endDate) || '—')}`,
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
  ongoingBox: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: '#f1f2f9', justifyContent: 'center', paddingHorizontal: 13 },
  ongoingBoxText: { fontSize: 13, color: theme.muted, fontWeight: '600' },
  ongoingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f7f8fd', borderRadius: 12, padding: 12, marginBottom: 12 },
  ongoingLabel: { fontSize: 14, fontWeight: '700', color: theme.text },
  ongoingHint: { fontSize: 11.5, color: theme.muted, marginTop: 2, lineHeight: 15 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 13.5, fontWeight: '700' },
});
