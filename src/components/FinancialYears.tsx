// Screen 3 — Financial Years: cards with an active/inactive toggle, add/edit
// (with themed date pickers), delete. Each year toggles independently — any
// number of years can be active at the same time.
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check } from 'phosphor-react-native/src/icons/Check';
import { theme } from '../theme';
import {
  AddPill, Button, Confirm, DataTable, DatePicker, Field, FinancialYear,
  Header, Input, Modal, Pill, RowActions, TCell, fmtNice, useAuth,
} from '../../App';

type Props = {
  years: FinancialYear[];
  // add/update resolve to false when the write was blocked or failed (e.g.
  // network error), so save() can keep the form open with what the user
  // typed instead of discarding it.
  add: (y: Omit<FinancialYear, 'id'>) => void | Promise<boolean>;
  update: (id: string, y: Omit<FinancialYear, 'id'>) => void | Promise<boolean>;
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
  const save = async () => {
    if (!form.name.trim()) {
      Alert.alert('Missing details', 'Financial Year name is required.');
      return;
    }
    const payload = { name: form.name.trim(), start: form.start.trim(), end: form.end.trim(), active: form.active };
    // Wait for the write to actually succeed before closing the modal - on
    // failure (network error, server rejection) keep it open with the
    // entered values so the user can retry without retyping everything.
    const ok = await (editing ? update(editing.id, payload) : add(payload));
    if (ok !== false) setShowForm(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <Header title="Financial Years" subtitle={`${years.length} periods`} action={<AddPill onPress={openAdd} />} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Each year is a row; any number of them can be active at once. */}
        <DataTable
          rows={years}
          keyFor={y => y.id}
          empty="No financial years yet."
          columns={[
            { label: 'FINANCIAL YEAR', width: 110, render: y => <TCell text={y.name} strong /> },
            { label: 'START', width: 92, render: y => <TCell text={fmtNice(y.start) || '—'} /> },
            { label: 'END', width: 92, render: y => <TCell text={fmtNice(y.end) || '—'} /> },
            {
              label: 'STATUS', width: 90,
              render: y => (y.active ? <Pill text="Active" tone="success" /> : <TCell text="Inactive" />),
            },
            ...(canEdit ? [
              {
                label: 'ACTIVE', width: 66,
                render: (y: FinancialYear) => (
                  <Pressable onPress={() => setActive(y.id, !y.active)} hitSlop={6}
                    style={[styles.switch, y.active ? styles.switchOn : styles.switchOff]}>
                    <View style={[styles.knob, y.active ? styles.knobOn : styles.knobOff]} />
                  </Pressable>
                ),
              },
              {
                label: '', width: 90, right: true,
                render: (y: FinancialYear) => <RowActions onEdit={() => openEdit(y)} onDelete={() => setDelId(y.id)} />,
              },
            ] : []),
          ]}
        />
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

  // The active/inactive toggle, shown inside the table's Active column.
  switch: { width: 46, height: 26, borderRadius: 999, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: theme.success },
  switchOff: { backgroundColor: '#d4d7e8' },
  knob: { width: 20, height: 20, borderRadius: 999, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  knobOff: { alignSelf: 'flex-start' },

  formRow: { flexDirection: 'row', gap: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18, marginTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 14, color: theme.text, fontWeight: '500' },
});
