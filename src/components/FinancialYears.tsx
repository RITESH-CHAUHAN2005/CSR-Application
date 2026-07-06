// Screen 3 — Financial Years: cards with an active/inactive toggle, add/edit
// (with themed date pickers), delete. Each year toggles independently — any
// number of years can be active at the same time.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CalendarBlank } from 'phosphor-react-native/src/icons/CalendarBlank';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { Check } from 'phosphor-react-native/src/icons/Check';
import { theme } from '../theme';
import {
  AddPill, Button, Card, Confirm, DatePicker, EmptyState, Field, FinancialYear,
  Header, Input, Modal, Pill, fmtNice, useAuth,
} from '../../App';

type Props = {
  years: FinancialYear[];
  add: (y: Omit<FinancialYear, 'id'>) => void;
  update: (id: string, y: Omit<FinancialYear, 'id'>) => void;
  setActive: (id: string, active: boolean) => void;
  remove: (id: string) => void;
};

const blank = { name: '', start: '', end: '', active: false };

export default function FinancialYears({ years, add, update, setActive, remove }: Props) {
  const { canEdit } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FinancialYear | null>(null);
  const [form, setForm] = useState(blank);
  const [delId, setDelId] = useState<string | null>(null);

  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setEditing(null); setForm(blank); setShowForm(true); };
  const openEdit = (y: FinancialYear) => {
    setEditing(y);
    setForm({ name: y.name, start: y.start, end: y.end, active: y.active });
    setShowForm(true);
  };
  const save = () => {
    if (!form.name.trim()) return;
    const payload = { name: form.name.trim(), start: form.start.trim(), end: form.end.trim(), active: form.active };
    if (editing) update(editing.id, payload); else add(payload);
    setShowForm(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <Header title="Financial Years" subtitle={`${years.length} periods`} action={<AddPill onPress={openAdd} />} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {years.length === 0 && <EmptyState text="No financial years yet." />}

        {years.map(y => (
          <Card key={y.id} style={[styles.card, y.active && styles.activeCard]}>
            <View style={styles.cardTop}>
              <View style={[styles.chip, y.active && { backgroundColor: theme.successSoft }]}>
                <CalendarBlank size={22} color={y.active ? theme.success : theme.primary} weight="fill" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{y.name}</Text>
                  {y.active && <Pill text="Active" tone="success" />}
                </View>
                <Text style={styles.dates}>
                  {y.start || y.end ? `${fmtNice(y.start) || '—'} – ${fmtNice(y.end) || '—'}` : 'No dates set'}
                </Text>
              </View>
              {canEdit && (
                <>
                  <Pressable style={styles.iconBtn} onPress={() => openEdit(y)} hitSlop={6}>
                    <PencilSimple size={16} color={theme.primary} />
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={() => setDelId(y.id)} hitSlop={6}>
                    <Trash size={16} color={theme.danger} />
                  </Pressable>
                </>
              )}
            </View>

            {canEdit && (
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>{y.active ? 'Active period' : 'Inactive'}</Text>
                <Pressable onPress={() => setActive(y.id, !y.active)} hitSlop={6}
                  style={[styles.switch, y.active ? styles.switchOn : styles.switchOff]}>
                  <View style={[styles.knob, y.active ? styles.knobOn : styles.knobOff]} />
                </Pressable>
              </View>
            )}
          </Card>
        ))}
      </ScrollView>

      <Modal visible={showForm} title={editing ? 'Edit Financial Year' : 'Add Financial Year'} onClose={() => setShowForm(false)}>
        <Field label="Name *"><Input value={form.name} onChangeText={t => set('name', t)} placeholder="FY 2026-27" /></Field>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}><Field label="Start Date"><DatePicker value={form.start} onChange={v => set('start', v)} placeholder="Start date" /></Field></View>
          <View style={{ flex: 1 }}><Field label="End Date"><DatePicker value={form.end} onChange={v => set('end', v)} placeholder="End date" /></Field></View>
        </View>
        <Pressable style={styles.toggle} onPress={() => set('active', !form.active)}>
          <View style={[styles.checkbox, form.active && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
            {form.active && <Check size={14} color="#fff" weight="bold" />}
          </View>
          <Text style={styles.toggleText}>Mark as active period</Text>
        </Pressable>
        <Button label={editing ? 'Save Changes' : 'Add Financial Year'} onPress={save} />
      </Modal>

      <Confirm
        visible={!!delId}
        title="Delete this year?"
        message="The financial year will be removed."
        onCancel={() => setDelId(null)}
        onConfirm={() => { if (delId) remove(delId); setDelId(null); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28, gap: 12 },
  card: {},
  activeCard: { borderWidth: 1.5, borderColor: theme.success },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  chip: { width: 46, height: 46, borderRadius: 13, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15.5, fontWeight: '700', color: theme.text },
  dates: { fontSize: 12.5, color: theme.muted, marginTop: 3, fontWeight: '500' },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#f3f4fb', alignItems: 'center', justifyContent: 'center' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: theme.muted },
  switch: { width: 48, height: 28, borderRadius: 999, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: theme.success },
  switchOff: { backgroundColor: '#d4d7e8' },
  knob: { width: 22, height: 22, borderRadius: 999, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  knobOff: { alignSelf: 'flex-start' },

  formRow: { flexDirection: 'row', gap: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18, marginTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 14, color: theme.text, fontWeight: '500' },
});
