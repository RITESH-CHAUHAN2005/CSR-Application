// Screen 2 — Donor Companies: search, cards, add/edit/delete, and a full
// "View Details" page (contact, fund overview, year-wise summary, projects,
// fund receipts) mirroring the web app's company detail page.
import React, { useMemo, useState } from 'react';
import { Modal as RNModal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { Buildings } from 'phosphor-react-native/src/icons/Buildings';
import { ArrowLeft } from 'phosphor-react-native/src/icons/ArrowLeft';
import { User } from 'phosphor-react-native/src/icons/User';
import { EnvelopeSimple } from 'phosphor-react-native/src/icons/EnvelopeSimple';
import { Phone } from 'phosphor-react-native/src/icons/Phone';
import { MapPin } from 'phosphor-react-native/src/icons/MapPin';
import { Eye } from 'phosphor-react-native/src/icons/Eye';
import { iconChipColors, theme } from '../theme';
import {
  AddPill, Button, Card, Company, Confirm, EmptyState, Expenditure, Field,
  FinancialYear, FundReceipt, Header, Input, Modal, Pill, Project, useAuth,
  projectStatusLabel, projectStatusTone,
  companyReceived, companyCarryForward, companyExpenditure, companyBalance, fmtNice, inr,
} from '../../App';

type Props = {
  companies: Company[];
  projects: Project[];
  years: FinancialYear[];
  receipts: FundReceipt[];
  expenditures: Expenditure[];
  add: (c: Omit<Company, 'id'>) => void;
  update: (id: string, c: Omit<Company, 'id'>) => void;
  remove: (id: string) => void;
};

const blank = { name: '', cin: '', contact: '', phone: '', email: '', address: '', notes: '' };

export default function Companies({ companies, projects, years, receipts, expenditures, add, update, remove }: Props) {
  const { canEdit } = useAuth();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Company | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [delId, setDelId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Company | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return companies;
    return companies.filter(c =>
      c.name.toLowerCase().includes(s) || c.contact.toLowerCase().includes(s) || c.email.toLowerCase().includes(s));
  }, [companies, q]);

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setEditing(null); setForm(blank); setShowForm(true); };
  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({ name: c.name, cin: c.cin, contact: c.contact, phone: c.phone, email: c.email, address: c.address, notes: c.notes });
    setShowForm(true);
  };
  const save = () => {
    if (!form.name.trim()) return;
    const payload: Omit<Company, 'id'> = {
      name: form.name.trim(), cin: form.cin.trim(), contact: form.contact.trim(),
      phone: form.phone.trim(), email: form.email.trim(),
      address: form.address.trim(), notes: form.notes.trim(),
    };
    if (editing) update(editing.id, payload); else add(payload);
    setShowForm(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <Header title="Donor Companies" subtitle={`${companies.length} companies`} action={<AddPill onPress={openAdd} />} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.search}>
          <MagnifyingGlass size={18} color={theme.faint} />
          <Input value={q} onChangeText={setQ} placeholder="Search name, contact, email…" style={styles.searchInput} />
        </View>

        {filtered.length === 0 && <EmptyState text="No companies found." />}

        {filtered.map((c, i) => {
          const chip = iconChipColors[i % iconChipColors.length];
          const projCount = projects.filter(p => p.companyId === c.id).length;
          const bal = companyBalance(c.id, receipts, expenditures);
          return (
            <Card key={c.id} style={styles.card}>
              <View style={styles.topRow}>
                <View style={[styles.avatar, { backgroundColor: chip.bg }]}>
                  <Buildings size={22} color={chip.fg} weight="fill" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                  {!!c.cin && <Text style={styles.cin}>{c.cin}</Text>}
                  <Text style={styles.projCount}>{projCount} {projCount === 1 ? 'project' : 'projects'}</Text>
                </View>
                {canEdit && (
                  <>
                    <Pressable style={styles.iconBtn} onPress={() => openEdit(c)} hitSlop={6}>
                      <PencilSimple size={16} color={theme.primary} />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => setDelId(c.id)} hitSlop={6}>
                      <Trash size={16} color={theme.danger} />
                    </Pressable>
                  </>
                )}
              </View>

              <View style={styles.contactBlock}>
                {!!c.contact && <ContactLine icon={<User size={14} color={theme.faint} />} text={c.contact} />}
                {!!c.email && <ContactLine icon={<EnvelopeSimple size={14} color={theme.faint} />} text={c.email} />}
                {!!c.phone && <ContactLine icon={<Phone size={14} color={theme.faint} />} text={c.phone} />}
              </View>

              <View style={styles.divider} />
              <View style={styles.statGrid}>
                <Mini label="Received" value={inr(companyReceived(c.id, receipts))} color={theme.text} />
                <Mini label="Carry Fwd" value={inr(companyCarryForward(c.id, receipts))} color={theme.muted} />
                <Mini label="Expenditure" value={inr(companyExpenditure(c.id, expenditures))} color={theme.danger} />
                <Mini label="Balance" value={inr(bal)} color={bal >= 0 ? theme.success : theme.danger} />
              </View>

              <Pressable
                onPress={() => setViewing(c)}
                style={({ pressed }) => [styles.viewBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}>
                <Eye size={16} color="#fff" weight="bold" />
                <Text style={styles.viewBtnText}>View Details</Text>
              </Pressable>
            </Card>
          );
        })}
      </ScrollView>

      <Modal visible={showForm} title={editing ? 'Edit Donor Company' : 'Add Donor Company'} onClose={() => setShowForm(false)}>
        <Field label="Company Name *"><Input value={form.name} onChangeText={t => set('name', t)} placeholder="Full legal name of company" /></Field>
        <Field label="Registration / CIN Number"><Input value={form.cin} onChangeText={t => set('cin', t)} placeholder="e.g. U72200MH2004PLC153990" autoCapitalize="characters" /></Field>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}><Field label="Contact Person"><Input value={form.contact} onChangeText={t => set('contact', t)} placeholder="Name" /></Field></View>
          <View style={{ flex: 1 }}><Field label="Phone"><Input value={form.phone} onChangeText={t => set('phone', t)} placeholder="+91-" keyboardType="phone-pad" /></Field></View>
        </View>
        <Field label="Email"><Input value={form.email} onChangeText={t => set('email', t)} placeholder="csr@company.com" keyboardType="email-address" autoCapitalize="none" /></Field>
        <Field label="Address"><Input value={form.address} onChangeText={t => set('address', t)} placeholder="Registered address" multiline /></Field>
        <Field label="Notes"><Input value={form.notes} onChangeText={t => set('notes', t)} placeholder="Any additional notes" multiline /></Field>
        <Button label={editing ? 'Save Changes' : 'Add Company'} onPress={save} />
      </Modal>

      {viewing && (
        <CompanyDetail
          company={viewing}
          years={years}
          projects={projects}
          receipts={receipts}
          expenditures={expenditures}
          onClose={() => setViewing(null)}
          onEdit={() => { const v = viewing; setViewing(null); openEdit(v); }}
        />
      )}

      <Confirm
        visible={!!delId}
        title="Delete company?"
        message="This will also remove its projects, receipts and expenditures. This can't be undone."
        onCancel={() => setDelId(null)}
        onConfirm={() => { if (delId) remove(delId); setDelId(null); }}
      />
    </View>
  );
}

// ── Full-screen company detail page ──────────────────────────────────────────
function CompanyDetail({
  company: c, years, projects, receipts, expenditures, onClose, onEdit,
}: {
  company: Company; years: FinancialYear[]; projects: Project[];
  receipts: FundReceipt[]; expenditures: Expenditure[];
  onClose: () => void; onEdit: () => void;
}) {
  const { canEdit } = useAuth();
  const projList = projects.filter(p => p.companyId === c.id);
  const cReceipts = receipts.filter(r => r.companyId === c.id);
  const activeProj = projList.filter(p => p.status === 'active').length;
  const yearName = (id: string) => years.find(y => y.id === id)?.name ?? '—';

  // Year-wise fund summary rows for this company.
  const yearRows = years.map(y => {
    const rec = cReceipts.filter(r => r.yearId === y.id);
    const exp = expenditures.filter(e => e.companyId === c.id && e.yearId === y.id);
    const received = rec.reduce((s, r) => s + r.amount, 0);
    const cfIn = rec.reduce((s, r) => s + r.carryForward, 0);
    const expenditure = exp.reduce((s, e) => s + e.amount, 0);
    const balance = received + cfIn - expenditure;
    return { name: y.name, received, cfIn, expenditure, balance, cfOut: balance };
  });

  return (
    <RNModal visible transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailWrap}>
        <View style={styles.detailHeader}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.backBtn}>
            <ArrowLeft size={20} color="#fff" weight="bold" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailTitle} numberOfLines={1}>{c.name}</Text>
            {!!c.cin && <Text style={styles.detailCin}># {c.cin}</Text>}
          </View>
          {canEdit && (
            <Pressable onPress={onEdit} hitSlop={8} style={styles.editBtn}>
              <PencilSimple size={15} color={theme.primary} weight="bold" />
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
          {/* Contact Information */}
          <Card>
            <Text style={styles.sectionTitle}>Contact Information</Text>
            {!!c.contact && <DetailLine icon={<User size={16} color={theme.muted} />} text={c.contact} />}
            {!!c.email && <DetailLine icon={<EnvelopeSimple size={16} color={theme.muted} />} text={c.email} />}
            {!!c.phone && <DetailLine icon={<Phone size={16} color={theme.muted} />} text={c.phone} />}
            {!!c.address && <DetailLine icon={<MapPin size={16} color={theme.muted} />} text={c.address} />}
            {!!c.notes && (
              <View style={styles.notesBlock}>
                <Text style={styles.notesLabel}>NOTES</Text>
                <Text style={styles.notesText}>{c.notes}</Text>
              </View>
            )}
          </Card>

          {/* Fund Overview */}
          <Card style={{ marginTop: 14 }}>
            <Text style={styles.sectionTitle}>Fund Overview</Text>
            <View style={styles.ovGrid}>
              <Overview label="Total Received" value={inr(companyReceived(c.id, receipts))} color={theme.success} />
              <Overview label="Carry Forward" value={inr(companyCarryForward(c.id, receipts))} color={theme.text} />
              <Overview label="Total Projects" value={String(projList.length)} color={theme.primary} />
              <Overview label="Active Projects" value={String(activeProj)} color={theme.amber} />
            </View>
          </Card>

          {/* Year-wise Fund Summary */}
          <Card style={{ marginTop: 14, paddingHorizontal: 0 }}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 16 }]}>Year-wise Fund Summary</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
              <View>
                <View style={[styles.tRow, styles.tHeadRow]}>
                  <Text style={[styles.th, styles.cYear]}>Financial Year</Text>
                  <Text style={[styles.th, styles.cNum]}>Received</Text>
                  <Text style={[styles.th, styles.cNum]}>Carry Fwd In</Text>
                  <Text style={[styles.th, styles.cNum]}>Expenditure</Text>
                  <Text style={[styles.th, styles.cNum]}>Balance</Text>
                  <Text style={[styles.th, styles.cNum]}>Carry Fwd Out</Text>
                </View>
                {yearRows.map(r => (
                  <View key={r.name} style={styles.tRow}>
                    <Text style={[styles.td, styles.cYear, { fontWeight: '700', color: theme.text }]} numberOfLines={1}>{r.name}</Text>
                    <Text style={[styles.td, styles.cNum]}>{inr(r.received)}</Text>
                    <Text style={[styles.td, styles.cNum]}>{inr(r.cfIn)}</Text>
                    <Text style={[styles.td, styles.cNum, { color: theme.danger }]}>{inr(r.expenditure)}</Text>
                    <Text style={[styles.td, styles.cNum, { color: r.balance >= 0 ? theme.success : theme.danger, fontWeight: '700' }]}>{inr(r.balance)}</Text>
                    <Text style={[styles.td, styles.cNum]}>{inr(r.cfOut)}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </Card>

          {/* Projects */}
          <Card style={{ marginTop: 14 }}>
            <Text style={styles.sectionTitle}>Projects · {projList.length}</Text>
            {projList.length === 0
              ? <Text style={styles.dEmpty}>No projects for this company yet.</Text>
              : projList.map(p => (
                  <View key={p.id} style={styles.projRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.projName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.projMeta} numberOfLines={1}>{yearName(p.yearId)} · {p.category} · {p.location}</Text>
                    </View>
                    <Text style={styles.projBudget}>{inr(p.budget)}</Text>
                    <Pill text={projectStatusLabel(p.status)} tone={projectStatusTone(p.status)} />
                  </View>
                ))}
          </Card>

          {/* Fund Receipts */}
          <Card style={{ marginTop: 14, paddingHorizontal: 0 }}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 16 }]}>Fund Receipts · {cReceipts.length}</Text>
            {cReceipts.length === 0 ? (
              <Text style={[styles.dEmpty, { paddingHorizontal: 16 }]}>No fund receipts recorded.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                <View>
                  <View style={[styles.tRow, styles.tHeadRow]}>
                    <Text style={[styles.th, styles.cDate]}>Date</Text>
                    <Text style={[styles.th, styles.cYear2]}>Year</Text>
                    <Text style={[styles.th, styles.cRef]}>Reference</Text>
                    <Text style={[styles.th, styles.cMode]}>Mode</Text>
                    <Text style={[styles.th, styles.cNum]}>Carry Fwd</Text>
                    <Text style={[styles.th, styles.cNum]}>Amount</Text>
                  </View>
                  {cReceipts.map(r => (
                    <View key={r.id} style={styles.tRow}>
                      <Text style={[styles.td, styles.cDate, { color: theme.text }]}>{fmtNice(r.date) || '—'}</Text>
                      <Text style={[styles.td, styles.cYear2]}>{yearName(r.yearId)}</Text>
                      <Text style={[styles.td, styles.cRef]} numberOfLines={1}>{r.reference || '—'}</Text>
                      <Text style={[styles.td, styles.cMode]}>{r.mode}</Text>
                      <Text style={[styles.td, styles.cNum]}>{inr(r.carryForward)}</Text>
                      <Text style={[styles.td, styles.cNum, { color: theme.success, fontWeight: '800' }]}>{inr(r.amount)}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </Card>

          <View style={{ height: 18 }} />
          {canEdit && <Button label="Edit Company" onPress={onEdit} />}
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </RNModal>
  );
}

const ContactLine = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <View style={styles.contactLine}>{icon}<Text style={styles.contactText} numberOfLines={1}>{text}</Text></View>
);
const DetailLine = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <View style={styles.detailLine}>{icon}<Text style={styles.detailLineText}>{text}</Text></View>
);
const Mini = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <View style={styles.mini}>
    <Text style={styles.miniLabel}>{label.toUpperCase()}</Text>
    <Text style={[styles.miniValue, { color }]} numberOfLines={1}>{value}</Text>
  </View>
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

  card: {},
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15.5, fontWeight: '700', color: theme.text },
  cin: { fontSize: 10.5, color: theme.faint, fontWeight: '600', letterSpacing: 0.4, marginTop: 2 },
  projCount: { fontSize: 11, color: theme.primary, fontWeight: '700', marginTop: 3 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#f3f4fb', alignItems: 'center', justifyContent: 'center' },

  contactBlock: { marginTop: 14, gap: 7 },
  contactLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactText: { flex: 1, fontSize: 12.5, color: theme.muted, fontWeight: '500' },

  formRow: { flexDirection: 'row', gap: 10 },

  divider: { height: 1, backgroundColor: theme.border, marginVertical: 14 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  mini: { width: '50%', paddingVertical: 6 },
  miniLabel: { fontSize: 10, color: theme.faint, fontWeight: '700', letterSpacing: 0.5 },
  miniValue: { fontSize: 15, fontWeight: '800', marginTop: 2 },

  viewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 12, marginTop: 14,
  },
  viewBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

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
  detailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  detailLineText: { flex: 1, fontSize: 13.5, color: theme.muted, fontWeight: '500', lineHeight: 19 },
  notes: { fontSize: 12.5, color: theme.faint, fontStyle: 'italic', marginTop: 4, lineHeight: 18 },
  notesBlock: { marginTop: 10, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 },
  notesLabel: { fontSize: 10.5, color: theme.faint, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  notesText: { fontSize: 13.5, color: theme.muted, fontWeight: '500', lineHeight: 20 },

  ovGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ov: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#f7f8fd', borderRadius: 12, padding: 12 },
  ovLabel: { fontSize: 11.5, color: theme.muted, fontWeight: '600' },
  ovValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },

  dEmpty: { fontSize: 13, color: theme.muted, fontStyle: 'italic' },
  projRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f7f8fd', borderRadius: 12, padding: 12, marginBottom: 8,
  },
  projName: { fontSize: 13.5, fontWeight: '700', color: theme.text },
  projMeta: { fontSize: 11, color: theme.muted, marginTop: 2 },
  projBudget: { fontSize: 13, fontWeight: '800', color: theme.text },

  // tables
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: theme.border },
  tHeadRow: { borderBottomWidth: 1.5 },
  th: { fontSize: 10.5, color: theme.faint, fontWeight: '700', letterSpacing: 0.3 },
  td: { fontSize: 12, color: theme.muted, fontWeight: '600' },
  cYear: { width: 120 },
  cNum: { width: 104, textAlign: 'right' },
  cDate: { width: 92 },
  cYear2: { width: 92 },
  cRef: { width: 120 },
  cMode: { width: 70 },
});
