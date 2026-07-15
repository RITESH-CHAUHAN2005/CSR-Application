// Screen 2 — Donor Companies: search, table, add/edit/delete, and a full
// "View Details" page (contact, fund overview, year-wise summary, projects,
// fund receipts) mirroring the web app's company detail page.
//
// Two money rules this screen exists to get right (§2 of FEATURES.md):
//   Current Balance = Received − Expenditure.
//   Carry Forward is a SLICE OF that balance, never added to it. It is derived
//   server-side (one row per Ongoing project × company) and passed in.
import React, { useMemo, useState } from 'react';
import { Alert, Modal as RNModal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { ArrowLeft } from 'phosphor-react-native/src/icons/ArrowLeft';
import { User } from 'phosphor-react-native/src/icons/User';
import { EnvelopeSimple } from 'phosphor-react-native/src/icons/EnvelopeSimple';
import { Phone } from 'phosphor-react-native/src/icons/Phone';
import { MapPin } from 'phosphor-react-native/src/icons/MapPin';
import { Eye } from 'phosphor-react-native/src/icons/Eye';
import { theme } from '../theme';
import {
  AddPill, Button, Card, CarryForwardRow, CodeBadge, Company, Confirm, DataTable,
  ExportButtons, Expenditure, Field, FinancialYear, FundReceipt, Header, Input, Modal, Pill,
  Project, TCell, useAuth, projectStatusLabel, projectStatusTone,
  companyReceived, companyCarryForward, companyExpenditure, companyBalance, fmtNice, inr,
} from '../../App';

type Props = {
  companies: Company[];
  projects: Project[];
  years: FinancialYear[];
  receipts: FundReceipt[];
  expenditures: Expenditure[];
  carryForward: CarryForwardRow[];
  add: (c: Omit<Company, 'id'>) => void;
  update: (id: string, c: Omit<Company, 'id'>) => void;
  remove: (id: string) => void;
};

const blank = { name: '', cin: '', pan: '', contact: '', phone: '', email: '', address: '', description: '' };

// Email is optional, but if filled in it must be a real address — the backend
// rejects a malformed one with a generic "Validation failed", so catch it here
// first and tell the user exactly what to fix.
const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
// PAN is optional too, but a non-empty one must be exactly 5 letters, 4 digits,
// 1 letter (e.g. AAACT2727Q). The server 422s anything else.
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const panValid = (p: string) => PAN_RE.test(p.trim().toUpperCase());

export default function Companies({
  companies, projects, years, receipts, expenditures, carryForward, add, update, remove,
}: Props) {
  const { canEdit } = useAuth();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Company | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [delId, setDelId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Company | null>(null);

  // Live search over name, CIN, PAN, contact person and email.
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return companies;
    return companies.filter(c =>
      [c.name, c.cin, c.pan, c.contact, c.email].some(t => (t || '').toLowerCase().includes(s)));
  }, [companies, q]);

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setEditing(null); setForm(blank); setShowForm(true); };
  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({
      name: c.name, cin: c.cin, pan: c.pan, contact: c.contact,
      phone: c.phone, email: c.email, address: c.address, description: c.description,
    });
    setShowForm(true);
  };
  const save = () => {
    if (!form.name.trim()) {
      Alert.alert('Missing name', 'Company Name is required.');
      return;
    }
    if (form.email.trim() && !emailValid(form.email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address, or leave the Email field blank.');
      return;
    }
    if (form.pan.trim() && !panValid(form.pan)) {
      Alert.alert(
        'Invalid PAN',
        'A PAN is 5 letters, 4 digits, then 1 letter — e.g. AAACT2727Q. Correct it, or leave the field blank.',
      );
      return;
    }
    const payload: Omit<Company, 'id'> = {
      name: form.name.trim(), cin: form.cin.trim().toUpperCase(),
      pan: form.pan.trim().toUpperCase(), contact: form.contact.trim(),
      phone: form.phone.trim(), email: form.email.trim(),
      address: form.address.trim(), description: form.description.trim(),
    };
    if (editing) update(editing.id, payload); else add(payload);
    setShowForm(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <Header title="Donor Companies" subtitle={`${companies.length} ${companies.length === 1 ? 'company' : 'companies'}`} action={<AddPill onPress={openAdd} />} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.search}>
          <MagnifyingGlass size={18} color={theme.faint} />
          <Input value={q} onChangeText={setQ} placeholder="Search name, CIN, PAN, contact, email…" style={styles.searchInput} />
        </View>

        <ExportButtons type="companies" />

        {/* Only the columns worth scanning at a glance — CIN, email, phone, carry
            forward and expenditure all live on the detail page, one tap away. */}
        <DataTable
          rows={filtered}
          keyFor={c => c.id}
          empty="No companies found."
          onRowPress={c => setViewing(c)}
          resetKey={q}
          columns={[
            { label: 'COMPANY', width: 150, render: c => <TCell text={c.name} strong /> },
            { label: 'PAN', width: 110, render: c => <TCell text={c.pan || '—'} /> },
            {
              label: 'PROJECTS', width: 74, right: true,
              render: c => <TCell text={String(projects.filter(p => p.companyIds.includes(c.id)).length)} right />,
            },
            {
              label: 'RECEIVED', width: 100, right: true,
              render: c => <TCell text={inr(companyReceived(c.id, receipts))} right color={theme.success} strong />,
            },
            {
              // Balance = Received − Expenditure. Carry forward is NOT added in.
              label: 'BALANCE', width: 100, right: true,
              render: c => {
                const bal = companyBalance(c.id, receipts, expenditures);
                return <TCell text={inr(bal)} right strong color={bal >= 0 ? theme.success : theme.danger} />;
              },
            },
            {
              // 3 × 30px buttons + 2 × 6px gaps + the cell's 18px padding = 120.
              label: '', width: canEdit ? 124 : 52, right: true,
              render: c => (
                <View style={styles.rowActions}>
                  <Pressable onPress={() => setViewing(c)} hitSlop={8} style={styles.rowActionBtn}>
                    <Eye size={15} color={theme.primary} weight="bold" />
                  </Pressable>
                  {canEdit && (
                    <>
                      <Pressable onPress={() => openEdit(c)} hitSlop={8} style={styles.rowActionBtn}>
                        <PencilSimple size={15} color={theme.primary} />
                      </Pressable>
                      <Pressable onPress={() => setDelId(c.id)} hitSlop={8} style={styles.rowActionBtn}>
                        <Trash size={15} color={theme.danger} />
                      </Pressable>
                    </>
                  )}
                </View>
              ),
            },
          ]}
        />
      </ScrollView>

      <Modal visible={showForm} title={editing ? 'Edit Donor Company' : 'Add Donor Company'} onClose={() => setShowForm(false)}>
        <Field label="Company Name *"><Input value={form.name} onChangeText={t => set('name', t)} placeholder="Full legal name of company" /></Field>
        <Field label="Registration / CIN Number"><Input value={form.cin} onChangeText={t => set('cin', t)} placeholder="e.g. U72200MH2004PLC153990" autoCapitalize="characters" /></Field>
        <Field label="PAN">
          <Input
            value={form.pan}
            onChangeText={t => set('pan', t.toUpperCase())}
            placeholder="e.g. AAACT2727Q"
            autoCapitalize="characters"
            maxLength={10}
          />
        </Field>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}><Field label="Contact Person"><Input value={form.contact} onChangeText={t => set('contact', t)} placeholder="Name" /></Field></View>
          <View style={{ flex: 1 }}><Field label="Phone"><Input value={form.phone} onChangeText={t => set('phone', t)} placeholder="+91-" keyboardType="phone-pad" /></Field></View>
        </View>
        <Field label="Email"><Input value={form.email} onChangeText={t => set('email', t)} placeholder="csr@company.com" keyboardType="email-address" autoCapitalize="none" /></Field>
        <Field label="Address"><Input value={form.address} onChangeText={t => set('address', t)} placeholder="Registered address" multiline /></Field>
        <Field label="Description"><Input value={form.description} onChangeText={t => set('description', t)} placeholder="Anything worth recording about this company" multiline /></Field>
        <Button label={editing ? 'Save Changes' : 'Add Company'} onPress={save} />
      </Modal>

      {viewing && (
        <CompanyDetail
          company={viewing}
          years={years}
          projects={projects}
          receipts={receipts}
          expenditures={expenditures}
          carryForward={carryForward}
          onClose={() => setViewing(null)}
          onEdit={() => { const v = viewing; setViewing(null); openEdit(v); }}
        />
      )}

      {/* Deleting a company does NOT cascade — the server removes only the company
          document. Its projects, receipts and expenditures survive as orphans. */}
      <Confirm
        visible={!!delId}
        title="Delete company?"
        message="This removes only the company. Its projects, receipts and expenditures are kept (they'll no longer be linked to a company). This can't be undone."
        onCancel={() => setDelId(null)}
        onConfirm={() => { if (delId) remove(delId); setDelId(null); }}
      />
    </View>
  );
}

// ── Full-screen company detail page ──────────────────────────────────────────
function CompanyDetail({
  company: c, years, projects, receipts, expenditures, carryForward, onClose, onEdit,
}: {
  company: Company; years: FinancialYear[]; projects: Project[];
  receipts: FundReceipt[]; expenditures: Expenditure[]; carryForward: CarryForwardRow[];
  onClose: () => void; onEdit: () => void;
}) {
  const { canEdit } = useAuth();
  const projList = projects.filter(p => p.companyIds.includes(c.id));
  const cReceipts = receipts.filter(r => r.companyId === c.id);
  const activeProj = projList.filter(p => p.status === 'active').length;
  const yearName = (id: string) => years.find(y => y.id === id)?.name ?? '—';
  const projectName = (id: string) => projects.find(p => p.id === id)?.name ?? '—';
  const projectCode = (id: string) => projects.find(p => p.id === id)?.projectCode ?? '';

  const received = companyReceived(c.id, receipts);
  const spent = companyExpenditure(c.id, expenditures);
  // Current Balance = Received − Expenditure. Carry Forward is a slice of it.
  const balance = companyBalance(c.id, receipts, expenditures);
  const carry = companyCarryForward(c.id, carryForward);

  // Year-wise fund summary. Each year's closing balance CHAINS into the next
  // year's Carry Forward In — so these are running positions, not flows, and
  // summing a column down would be meaningless. Years are walked in date order.
  const yearRows = useMemo(() => {
    const ordered = [...years].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    let carryIn = 0;
    return ordered.map(y => {
      const rec = sum(cReceipts.filter(r => r.yearId === y.id).map(r => r.amount));
      const exp = sum(expenditures.filter(e => e.companyId === c.id && e.yearId === y.id).map(e => e.amount));
      const available = carryIn + rec;
      const bal = available - exp;
      const row = { id: y.id, name: y.name, received: rec, cfIn: carryIn, available, expenditure: exp, balance: bal, cfOut: bal };
      carryIn = bal; // this year's closing position opens the next year
      return row;
    });
  }, [years, cReceipts, expenditures, c.id]);

  return (
    <RNModal visible transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailWrap}>
        <View style={styles.detailHeader}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.backBtn}>
            <ArrowLeft size={20} color="#fff" weight="bold" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle} numberOfLines={1}>{c.name}</Text>
            {(!!c.cin || !!c.pan) && (
              <Text style={styles.detailCin} numberOfLines={1}>
                {[c.cin && `CIN ${c.cin}`, c.pan && `PAN ${c.pan}`].filter(Boolean).join('  ·  ')}
              </Text>
            )}
          </View>
          {canEdit && (
            <Pressable onPress={onEdit} hitSlop={8} style={styles.editBtn}>
              <PencilSimple size={15} color={theme.primary} weight="bold" />
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
          {/* Comprehensive per-company report (§5.11). */}
          <ExportButtons type="company-detail" companyId={c.id} style={styles.detailExport} />

          {/* Contact Information */}
          <Card>
            <Text style={styles.sectionTitle}>Contact Information</Text>
            {!!c.contact && <DetailLine icon={<User size={16} color={theme.muted} />} text={c.contact} />}
            {!!c.email && <DetailLine icon={<EnvelopeSimple size={16} color={theme.muted} />} text={c.email} />}
            {!!c.phone && <DetailLine icon={<Phone size={16} color={theme.muted} />} text={c.phone} />}
            {!!c.address && <DetailLine icon={<MapPin size={16} color={theme.muted} />} text={c.address} />}
            {!!c.description && (
              <View style={styles.notesBlock}>
                <Text style={styles.notesLabel}>DESCRIPTION</Text>
                <Text style={styles.notesText}>{c.description}</Text>
              </View>
            )}
          </Card>

          {/* Fund Overview (§5.2) */}
          <Card style={{ marginTop: 14 }}>
            <Text style={styles.sectionTitle}>Fund Overview</Text>
            <View style={styles.ovGrid}>
              <Overview label="Total Received" value={inr(received)} color={theme.success} />
              <Overview label="Carry Forward" value={inr(carry)} color={theme.accent} />
              <Overview label="Total Expenditure" value={inr(spent)} color={theme.danger} />
              <Overview
                label="Current Balance"
                value={inr(balance)}
                color={balance >= 0 ? theme.success : theme.danger}
              />
              <Overview label="Total Projects" value={String(projList.length)} color={theme.primary} />
              <Overview label="Active Projects" value={String(activeProj)} color={theme.amber} />
            </View>
            <Text style={styles.ovNote}>
              Balance is Received − Expenditure. Carry Forward is the unspent part of what was
              received against this company's Ongoing projects — a slice of that balance, not an
              addition to it.
            </Text>
          </Card>

          {/* Year-wise Fund Summary — running positions, chained year to year. */}
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>Year-wise Fund Summary</Text>
            <Text style={styles.sectionNote}>
              Each year's closing balance becomes the next year's Carry Forward In — these are
              running positions, so don't add a column up.
            </Text>
            <DataTable
              rows={yearRows}
              keyFor={r => r.id}
              empty="No financial years yet."
              pageSize={6}
              columns={[
                { label: 'FINANCIAL YEAR', width: 120, render: r => <TCell text={r.name} strong /> },
                { label: 'FUNDS RECEIVED', width: 115, right: true, render: r => <TCell text={inr(r.received)} right color={theme.success} /> },
                { label: 'CARRY FWD IN', width: 115, right: true, render: r => <TCell text={inr(r.cfIn)} right /> },
                { label: 'TOTAL AVAILABLE', width: 125, right: true, render: r => <TCell text={inr(r.available)} right /> },
                { label: 'EXPENDITURE', width: 115, right: true, render: r => <TCell text={inr(r.expenditure)} right color={theme.danger} /> },
                {
                  label: 'BALANCE', width: 110, right: true,
                  render: r => <TCell text={inr(r.balance)} right strong color={r.balance >= 0 ? theme.success : theme.danger} />,
                },
                { label: 'CARRY FWD OUT', width: 120, right: true, render: r => <TCell text={inr(r.cfOut)} right /> },
              ]}
            />
          </View>

          {/* Projects funded by this company — with the Project ID. */}
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>Projects · {projList.length}</Text>
            <DataTable
              rows={projList}
              keyFor={p => p.id}
              empty="No projects for this company yet."
              pageSize={6}
              columns={[
                { label: 'PROJECT ID', width: 100, render: p => <CodeBadge code={p.projectCode} /> },
                { label: 'PROJECT', width: 150, render: p => <TCell text={p.name} strong /> },
                { label: 'STATUS', width: 110, render: p => <Pill text={projectStatusLabel(p.status)} tone={projectStatusTone(p.status)} /> },
                { label: 'CATEGORY', width: 115, render: p => <TCell text={p.category || '—'} /> },
                { label: 'LOCATION', width: 120, render: p => <TCell text={p.location || '—'} /> },
                { label: 'BUDGET', width: 110, right: true, render: p => <TCell text={inr(p.budget)} right strong /> },
              ]}
            />
          </View>

          {/* Fund Receipts. Payment Mode and Carry Forward are legacy fields and
              are no longer shown — no report reads them. */}
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>Fund Receipts · {cReceipts.length}</Text>
            <DataTable
              rows={cReceipts}
              keyFor={r => r.id}
              empty="No fund receipts recorded."
              pageSize={6}
              columns={[
                { label: 'DATE', width: 95, render: r => <TCell text={fmtNice(r.date) || '—'} strong /> },
                { label: 'YEAR', width: 100, render: r => <TCell text={yearName(r.yearId)} /> },
                { label: 'PROJECT ID', width: 100, render: r => (r.projectId ? <CodeBadge code={projectCode(r.projectId)} /> : <TCell text="—" />) },
                { label: 'PROJECT', width: 130, render: r => <TCell text={r.projectId ? projectName(r.projectId) : '—'} /> },
                { label: 'ACCOUNT NUMBER', width: 140, render: r => <TCell text={r.reference || '—'} /> },
                { label: 'AMOUNT', width: 110, right: true, render: r => <TCell text={inr(r.amount)} right strong color={theme.success} /> },
              ]}
            />
          </View>

          <View style={{ height: 18 }} />
          {canEdit && <Button label="Edit Company" onPress={onEdit} />}
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </RNModal>
  );
}

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

const DetailLine = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <View style={styles.detailLine}>{icon}<Text style={styles.detailLineText}>{text}</Text></View>
);
const Overview = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <View style={styles.ov}>
    <Text style={styles.ovLabel}>{label}</Text>
    <Text style={[styles.ovValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28, gap: 12 },
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingLeft: 14, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', minHeight: 48 },

  formRow: { flexDirection: 'row', gap: 10 },

  // Per-row buttons in the companies table (view / edit / delete).
  rowActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  rowActionBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#f3f4fb', alignItems: 'center', justifyContent: 'center' },

  // ── Detail page ──
  detailWrap: { flex: 1, backgroundColor: theme.bg },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.primary, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 18,
    borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
  },
  backBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  detailTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  detailCin: { color: 'rgba(255,255,255,0.75)', fontSize: 11.5, fontWeight: '600', marginTop: 2, letterSpacing: 0.3 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999 },
  editBtnText: { color: theme.primary, fontWeight: '800', fontSize: 13 },
  detailBody: { padding: 16, paddingBottom: 28 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 12 },
  sectionNote: { fontSize: 11.5, color: theme.faint, fontWeight: '500', lineHeight: 16, marginTop: -6 },
  detailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  detailLineText: { flex: 1, fontSize: 13.5, color: theme.muted, fontWeight: '500', lineHeight: 19 },
  notesBlock: { marginTop: 10, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 },
  notesLabel: { fontSize: 10.5, color: theme.faint, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  notesText: { fontSize: 13.5, color: theme.muted, fontWeight: '500', lineHeight: 20 },

  ovGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ov: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#f7f8fd', borderRadius: 12, padding: 12 },
  ovLabel: { fontSize: 11.5, color: theme.muted, fontWeight: '600' },
  ovValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  ovNote: { fontSize: 11.5, color: theme.faint, fontWeight: '500', lineHeight: 16, marginTop: 12 },

  // A titled block on the detail page whose body is a shared DataTable.
  detailSection: { marginTop: 16, gap: 10 },

  // Export buttons row at the top of the detail page.
  detailExport: { marginBottom: 14 },
});
