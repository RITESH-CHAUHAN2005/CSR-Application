// Screen — Master Data (§5.7): three tabs (Category / Status / Source) picked
// via a segmented control, each showing that type's values WITH THEIR DESCRIPTION,
// plus add / edit / delete. These lists populate the Category dropdown (Projects)
// and the Source dropdown (Other-Source receipts).
//
// The Category list holds the 12 statutory Schedule VII activity heads: a short
// 2–3 word `value` to pick from, with the full clause as its `description`. The app
// never hard-codes that list — it reads it from GET /master-data, so an admin
// editing it here is reflected everywhere.
//
// Deleting a value does NOT rewrite records that already use it.
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Tag } from 'phosphor-react-native/src/icons/Tag';
import { CheckCircle } from 'phosphor-react-native/src/icons/CheckCircle';
import { Drop } from 'phosphor-react-native/src/icons/Drop';
import { theme } from '../theme';
import {
  AddPill, Button, Confirm, DataTable, ExportButtons, Field, Header, Input, MasterDataItem,
  Modal, RowActions, TCell, useAuth,
} from '../../App';

type MasterType = MasterDataItem['type'];

type Props = {
  items: MasterDataItem[];
  add: (m: Omit<MasterDataItem, 'id'>) => void;
  update: (id: string, m: Omit<MasterDataItem, 'id'>) => void;
  remove: (id: string) => void;
};

const TABS: { key: MasterType; label: string; noun: string; hint: string }[] = [
  { key: 'category', label: 'Category', noun: 'category', hint: 'The 12 Schedule VII activity heads. The description carries the statutory clause.' },
  { key: 'status', label: 'Status', noun: 'status', hint: 'Status values used across the app.' },
  { key: 'source', label: 'Source', noun: 'source', hint: 'Income earned on a company’s funds — Interest, SIP, FD…' },
];

const TAB_ICON: Record<MasterType, React.ComponentType<{ size?: number; color?: string; weight?: any }>> = {
  category: Tag,
  status: CheckCircle,
  source: Drop,
};

const blank = { value: '', description: '' };

export default function MasterData({ items, add, update, remove }: Props) {
  const { canEdit } = useAuth();
  const [activeTab, setActiveTab] = useState<MasterType>('category');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MasterDataItem | null>(null);
  const [form, setForm] = useState(blank);
  const [delId, setDelId] = useState<string | null>(null);

  const set = <K extends keyof typeof blank>(k: K, v: string) => setForm(f => ({ ...f, [k]: v }));

  const tab = TABS.find(t => t.key === activeTab)!;
  const rows = items.filter(i => i.type === activeTab);
  const Icon = TAB_ICON[activeTab];

  const openAdd = () => { setEditing(null); setForm(blank); setShowForm(true); };
  const openEdit = (m: MasterDataItem) => {
    setEditing(m);
    setForm({ value: m.value, description: m.description });
    setShowForm(true);
  };

  const save = () => {
    const v = form.value.trim();
    if (!v) {
      Alert.alert('Missing value', 'Please enter a value.');
      return;
    }
    const payload = { value: v, description: form.description.trim() };
    if (editing) update(editing.id, { type: editing.type, ...payload });
    else add({ type: activeTab, ...payload });
    setShowForm(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <Header title="Master Data" subtitle="Dropdown value lists" action={<AddPill onPress={openAdd} />} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Segmented tabs */}
        <View style={styles.segment}>
          {TABS.map(t => {
            const on = activeTab === t.key;
            return (
              <Pressable key={t.key} onPress={() => setActiveTab(t.key)} style={[styles.segBtn, on && styles.segBtnOn]}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.tabHint}>{tab.hint}</Text>

        {/* Server-generated PDF / Excel of all master-data values — shown for
            all roles (§5.11). The export covers every type, so one set at the
            screen level (not per-tab) is correct. */}
        <ExportButtons type="master-data" />

        {/* Each value with the description underneath it — for a Category that
            description IS the Schedule VII clause, so it needs room to breathe. */}
        <DataTable
          rows={rows}
          keyFor={m => m.id}
          empty={`No ${tab.noun} values yet.`}
          resetKey={activeTab}
          pageSize={6}
          columns={[
            {
              label: 'VALUE', width: canEdit ? 250 : 320, grow: true,
              render: m => (
                <View style={{ gap: 4 }}>
                  <View style={styles.valueCell}>
                    <Icon size={16} color={theme.primary} weight="fill" />
                    <TCell text={m.value} strong />
                  </View>
                  {!!m.description && (
                    <Text style={styles.desc} numberOfLines={4}>{m.description}</Text>
                  )}
                </View>
              ),
            },
            ...(canEdit ? [{
              label: '', width: 90, right: true,
              render: (m: MasterDataItem) => <RowActions onEdit={() => openEdit(m)} onDelete={() => setDelId(m.id)} />,
            }] : []),
          ]}
        />
      </ScrollView>

      <Modal
        visible={showForm}
        title={`${editing ? 'Edit' : 'Add'} ${tab.label} Value`}
        onClose={() => setShowForm(false)}
      >
        <Field label="Value *">
          <Input value={form.value} onChangeText={t => set('value', t)} placeholder={`Enter ${tab.noun} value`} autoFocus />
        </Field>
        <Field label="Description">
          <Input
            value={form.description}
            onChangeText={t => set('description', t)}
            placeholder={activeTab === 'category'
              ? 'The Schedule VII clause this head covers…'
              : 'What this value covers…'}
            multiline
          />
        </Field>
        <Button label={editing ? 'Save Changes' : 'Add Value'} onPress={save} />
      </Modal>

      <Confirm
        visible={!!delId}
        title="Delete this value?"
        message="Removing it from the list won't rewrite records that already use this value."
        onCancel={() => setDelId(null)}
        onConfirm={() => { if (delId) remove(delId); setDelId(null); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28, gap: 12 },

  segment: { flexDirection: 'row', backgroundColor: '#ecedf6', borderRadius: 12, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff', shadowColor: '#1e1b4b', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText: { fontSize: 12.5, fontWeight: '700', color: theme.muted },
  segTextOn: { color: theme.primary },
  tabHint: { fontSize: 12, color: theme.faint, fontWeight: '500', lineHeight: 17, marginTop: -2 },

  valueCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  desc: { fontSize: 11.5, color: theme.muted, fontWeight: '500', lineHeight: 16 },
});
