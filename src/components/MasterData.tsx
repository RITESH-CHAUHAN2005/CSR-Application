// Screen — Master Data (§5.7): three tabs (Category / Status / Source) picked
// via a segmented control, each showing a simple list of that type's values
// with add / edit / delete. These lists populate the Category dropdowns
// (Projects, Expenditures) and the Source dropdown (Other-Source receipts).
// Deleting a value here does NOT rewrite records that already use it.
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Tag } from 'phosphor-react-native/src/icons/Tag';
import { CheckCircle } from 'phosphor-react-native/src/icons/CheckCircle';
import { Drop } from 'phosphor-react-native/src/icons/Drop';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { theme } from '../theme';
import {
  AddPill, Button, Card, Confirm, EmptyState, Field, Header, Input, MasterDataItem,
  Modal, useAuth,
} from '../../App';

type MasterType = MasterDataItem['type'];

type Props = {
  items: MasterDataItem[];
  add: (m: Omit<MasterDataItem, 'id'>) => void;
  update: (id: string, m: Omit<MasterDataItem, 'id'>) => void;
  remove: (id: string) => void;
};

const TABS: { key: MasterType; label: string; noun: string }[] = [
  { key: 'category', label: 'Category', noun: 'category' },
  { key: 'status', label: 'Status', noun: 'status' },
  { key: 'source', label: 'Source', noun: 'source' },
];

const TAB_ICON: Record<MasterType, React.ComponentType<{ size?: number; color?: string; weight?: any }>> = {
  category: Tag,
  status: CheckCircle,
  source: Drop,
};

export default function MasterData({ items, add, update, remove }: Props) {
  const { canEdit } = useAuth();
  const [activeTab, setActiveTab] = useState<MasterType>('category');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MasterDataItem | null>(null);
  const [value, setValue] = useState('');
  const [delId, setDelId] = useState<string | null>(null);

  const tab = TABS.find(t => t.key === activeTab)!;
  const rows = items.filter(i => i.type === activeTab);
  const Icon = TAB_ICON[activeTab];

  const openAdd = () => { setEditing(null); setValue(''); setShowForm(true); };
  const openEdit = (m: MasterDataItem) => { setEditing(m); setValue(m.value); setShowForm(true); };

  const save = () => {
    const v = value.trim();
    if (!v) {
      Alert.alert('Missing value', 'Please enter a value.');
      return;
    }
    if (editing) update(editing.id, { type: editing.type, value: v });
    else add({ type: activeTab, value: v });
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

        {rows.length === 0 && <EmptyState text={`No ${tab.noun} values yet.`} />}

        {rows.map(m => (
          <Card key={m.id} style={styles.card}>
            <View style={styles.chip}>
              <Icon size={20} color={theme.primary} weight="fill" />
            </View>
            <Text style={styles.value} numberOfLines={2}>{m.value}</Text>
            {canEdit && (
              <>
                <Pressable style={styles.iconBtn} onPress={() => openEdit(m)} hitSlop={6}>
                  <PencilSimple size={16} color={theme.primary} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => setDelId(m.id)} hitSlop={6}>
                  <Trash size={16} color={theme.danger} />
                </Pressable>
              </>
            )}
          </Card>
        ))}
      </ScrollView>

      <Modal
        visible={showForm}
        title={`${editing ? 'Edit' : 'Add'} ${tab.label} Value`}
        onClose={() => setShowForm(false)}
      >
        <Field label="Value *">
          <Input value={value} onChangeText={setValue} placeholder={`Enter ${tab.noun} value`} autoFocus />
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

  card: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  chip: { width: 42, height: 42, borderRadius: 12, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' },
  value: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.text },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#f3f4fb', alignItems: 'center', justifyContent: 'center' },
});
