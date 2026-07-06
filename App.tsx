// ─────────────────────────────────────────────────────────────────────────
//  CSR — APP ROOT
//  Owns: theme tokens, mock data, in-memory store, shared UI primitives,
//  bottom tab navigation. Screens import primitives from here.
// ─────────────────────────────────────────────────────────────────────────
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Alert,
  Animated,
  AppState,
  Image,
  Modal as RNModal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { House } from 'phosphor-react-native/src/icons/House';
import { Buildings } from 'phosphor-react-native/src/icons/Buildings';
import { CalendarBlank } from 'phosphor-react-native/src/icons/CalendarBlank';
import { Briefcase } from 'phosphor-react-native/src/icons/Briefcase';
import { Receipt } from 'phosphor-react-native/src/icons/Receipt';
import { HandCoins } from 'phosphor-react-native/src/icons/HandCoins';
import { ChartBar } from 'phosphor-react-native/src/icons/ChartBar';
import { Plus } from 'phosphor-react-native/src/icons/Plus';
import { X } from 'phosphor-react-native/src/icons/X';
import { CaretDown } from 'phosphor-react-native/src/icons/CaretDown';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { CaretLeft } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRight } from 'phosphor-react-native/src/icons/CaretRight';
import { Check } from 'phosphor-react-native/src/icons/Check';
import { List } from 'phosphor-react-native/src/icons/List';
import { SignOut } from 'phosphor-react-native/src/icons/SignOut';
import { ShieldCheck } from 'phosphor-react-native/src/icons/ShieldCheck';
import { UserCircle } from 'phosphor-react-native/src/icons/UserCircle';
import { Info } from 'phosphor-react-native/src/icons/Info';

import Dashboard from './src/components/Dashboard';
import Companies from './src/components/Companies';
import FinancialYears from './src/components/FinancialYears';
import Projects from './src/components/Projects';
import FundReceipts from './src/components/FundReceipts';
import Expenditures from './src/components/Expenditures';
import Reports from './src/components/Reports';
import AdminPanel from './src/components/AdminPanel';
import Profile from './src/components/Profile';
import Login from './src/components/Login';
import { api, loadToken, setUnauthorizedHandler, warmUp } from './src/api';

// ── Types ──
export type Company = {
  id: string; name: string; cin: string;
  contact: string; email: string; phone: string;
  address: string; notes: string;
};
export type FinancialYear = {
  id: string; name: string; start: string; end: string; active: boolean;
};
export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'cancelled';
export type Project = {
  id: string; name: string; companyId: string; yearId: string;
  category: string; location: string; budget: number;
  status: ProjectStatus; description: string;
  // `ongoing` marks a running project with no fixed end date (end date stays blank).
  ongoing: boolean;
  startDate: string; endDate: string; notes: string;
};
export type FundReceipt = {
  id: string; date: string; companyId: string; yearId: string;
  reference: string; mode: PaymentMode; carryForward: number; amount: number;
  notes: string;
};
export type Expenditure = {
  id: string; date: string; projectId: string; companyId: string; yearId: string;
  category: string; approvedBy: string; amount: number;
  description: string; reference: string; notes: string;
};

// ── Auth / RBAC types ──
// Three roles drive what a signed-in user can do across the whole app:
//   admin  → full access + can create/remove user accounts (Admin Panel)
//   editor → can add / edit / delete records, but no user management
//   viewer → read-only (Add buttons hidden, write actions are no-ops)
export type Role = 'admin' | 'editor' | 'viewer';
export type AppUser = {
  id: string; name: string; email: string; password: string;
  role: Role; company: string;
};
// One row per thing that happens in the app — sign-ins and every create /
// update / delete are appended here and shown live in the Admin Panel.
export type ActivityLog = {
  id: string; at: string; userEmail: string; role: Role | ''; action: string;
};

// ── Seed data 
export const SEED_YEARS: FinancialYear[] = [
  { id: 'y1', name: 'FY 2023-24', start: '2023-04-01', end: '2024-03-31', active: false },
  { id: 'y2', name: 'FY 2024-25', start: '2024-04-01', end: '2025-03-31', active: true },
  { id: 'y3', name: 'FY 2025-26', start: '2025-04-01', end: '2026-03-31', active: false },
];
export const SEED_COMPANIES: Company[] = [
  { id: 'c1', name: 'Tata Consultancy Services', cin: 'L22210MH1995PLC084781', contact: 'Anita Rao',   email: 'csr@tcs.com',      phone: '+919820011223', address: 'TCS House, Raveline Street, Fort, Mumbai - 400001',           notes: 'Primary CSR partner since 2018.' },
  { id: 'c2', name: 'Infosys Foundation',         cin: 'U85110KA1996NPL019759', contact: 'Vikram Shah',  email: 'give@infosys.org', phone: '+918040022114', address: 'Electronics City, Hosur Road, Bengaluru - 560100',           notes: '' },
  { id: 'c3', name: 'Wipro Cares',                cin: 'L32102KA1945PLC020800', contact: 'Meera Nair',   email: 'cares@wipro.com',  phone: '+918026667788', address: 'Doddakannelli, Sarjapur Road, Bengaluru - 560035',           notes: '' },
  { id: 'c4', name: 'Reliance Foundation',        cin: 'U01100MH2010NPL206976', contact: 'Sanjay Gupta', email: 'rf@ril.com',       phone: '+912233445566', address: 'Maker Chambers IV, Nariman Point, Mumbai - 400021',           notes: '' },
];
export const SEED_PROJECTS: Project[] = [
  { id: 'p1', name: 'Rural School Digital Labs',   companyId: 'c1', yearId: 'y2', category: 'Education',         location: 'Nagpur, MH',      budget: 1200000, status: 'active',    ongoing: false, description: 'Setting up computer labs in 15 government schools.',   startDate: '2024-04-15', endDate: '2025-03-31', notes: '' },
  { id: 'p2', name: 'Clean Water Wells',           companyId: 'c1', yearId: 'y2', category: 'Infrastructure',    location: 'Jaipur, RJ',      budget: 850000,  status: 'completed', ongoing: false, description: 'Borewells and water purification for 8 villages.',     startDate: '2024-05-01', endDate: '2024-11-30', notes: '' },
  { id: 'p3', name: 'Women Skilling Program',      companyId: 'c2', yearId: 'y2', category: 'Skill Development', location: 'Pune, MH',        budget: 700000,  status: 'active',    ongoing: false, description: 'Tailoring and computer skills for 300 women.',         startDate: '2024-06-10', endDate: '2025-03-31', notes: '' },
  { id: 'p4', name: 'Urban Tree Plantation',       companyId: 'c3', yearId: 'y1', category: 'Environment',       location: 'Bengaluru, KA',   budget: 450000,  status: 'completed', ongoing: false, description: 'Planting 10,000 native saplings across the city.',     startDate: '2023-06-05', endDate: '2024-02-28', notes: '' },
  { id: 'p5', name: 'Mobile Health Clinics',       companyId: 'c4', yearId: 'y2', category: 'Healthcare',        location: 'Lucknow, UP',     budget: 1500000, status: 'active',    ongoing: false, description: 'Two mobile clinics covering 25 remote villages.',      startDate: '2024-07-01', endDate: '2025-06-30', notes: '' },
  { id: 'p6', name: 'Anganwadi Nutrition Drive',   companyId: 'c2', yearId: 'y1', category: 'Healthcare',        location: 'Bhopal, MP',      budget: 600000,  status: 'completed', ongoing: false, description: 'Mid-day nutrition supplements for 1,200 children.',    startDate: '2023-08-01', endDate: '2024-03-31', notes: '' },
];
export const SEED_RECEIPTS: FundReceipt[] = [
  { id: 'r1', date: '2024-05-12', companyId: 'c1', yearId: 'y2', reference: 'NEFT/0001',  mode: 'NEFT',   carryForward: 0,      amount: 2500000, notes: '' },
  { id: 'r2', date: '2024-06-03', companyId: 'c2', yearId: 'y2', reference: 'RTGS/8842',  mode: 'RTGS',   carryForward: 150000, amount: 1800000, notes: '' },
  { id: 'r3', date: '2024-07-21', companyId: 'c4', yearId: 'y2', reference: 'CHQ/100245', mode: 'Cheque', carryForward: 0,      amount: 4200000, notes: '' },
  { id: 'r4', date: '2023-08-09', companyId: 'c3', yearId: 'y1', reference: 'NEFT/0773',  mode: 'NEFT',   carryForward: 0,      amount: 2600000, notes: '' },
];
export const SEED_EXPENDITURES: Expenditure[] = [
  { id: 'e1', date: '2024-06-18', projectId: 'p1', companyId: 'c1', yearId: 'y2', category: 'Equipment',      approvedBy: 'Trustee Board',      amount: 480000, description: 'Purchase of 30 desktop computers.',        reference: 'VCH/2024/0145', notes: '' },
  { id: 'e2', date: '2024-07-02', projectId: 'p3', companyId: 'c2', yearId: 'y2', category: 'Training',       approvedBy: 'Executive Director', amount: 220000, description: 'Tailoring trainer fees for Q1.',           reference: 'VCH/2024/0162', notes: '' },
  { id: 'e3', date: '2024-08-15', projectId: 'p5', companyId: 'c4', yearId: 'y2', category: 'Infrastructure', approvedBy: 'Trustee Board',      amount: 760000, description: 'Clinic vehicle fit-out and equipment.',     reference: 'VCH/2024/0188', notes: '' },
  { id: 'e4', date: '2023-09-10', projectId: 'p4', companyId: 'c3', yearId: 'y1', category: 'Deepanshu',    approvedBy: 'Executive Director', amount: 130000, description: 'Saplings and planting labour.',             reference: 'VCH/2023/0421', notes: '' },
];

// Role display name + the dropdown options shown in "Add User Account".
export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
export const ROLE_TONE: Record<Role, 'primary' | 'amber' | 'neutral'> = { admin: 'primary', editor: 'amber', viewer: 'neutral' };
export const ROLE_OPTIONS: { label: string; value: Role }[] = [
  { value: 'admin',  label: 'Admin — full access + user management' },
  { value: 'editor', label: 'Editor — add / edit / delete records' },
  { value: 'viewer', label: 'Viewer — read-only access' },
];

// Seed accounts. The administrator matches the demo login on the sign-in screen.
// New editor/viewer accounts created from the Admin Panel are added here in
// memory and can sign in immediately (until the app cold-starts / DB lands).
export const SEED_USERS: AppUser[] = [
  { id: 'u1', name: 'CSR Administrator', email: 'admin@csr.com', password: 'Admin@123', role: 'admin', company: '' },
];

// ── Theme ───────────────────────────────────────────────────────────────────
// Design tokens live in ./src/theme to avoid a require cycle with the screens
// (screens read `theme` at StyleSheet time, before App finishes initialising).
// Imported for local use here and re-exported so existing
// `import { theme } from '../../App'` callers keep working.
import {
  theme, categoryColors, iconChipColors, CATEGORIES,
  PAYMENT_MODES, EXPENSE_CATEGORIES, APPROVERS,
} from './src/theme';
import type { PaymentMode } from './src/theme';
export {
  theme, categoryColors, iconChipColors, CATEGORIES,
  PAYMENT_MODES, EXPENSE_CATEGORIES, APPROVERS,
};
export type { PaymentMode };

// Money flows from two ledgers — Fund Receipts (money in) and Expenditures
// (money out). Every figure on the dashboard and the company detail page is
// derived from these so the numbers always stay consistent the moment a
// receipt/expenditure is added, edited or removed.
const sumBy = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((s, x) => s + f(x), 0);

export const companyReceived = (id: string, receipts: FundReceipt[]) =>
  sumBy(receipts, r => (r.companyId === id ? r.amount : 0));
export const companyCarryForward = (id: string, receipts: FundReceipt[]) =>
  sumBy(receipts, r => (r.companyId === id ? r.carryForward : 0));
export const companyExpenditure = (id: string, expenditures: Expenditure[]) =>
  sumBy(expenditures, e => (e.companyId === id ? e.amount : 0));
// Balance = money in (received + carry-forward) − money out (expenditure).
export const companyBalance = (id: string, receipts: FundReceipt[], expenditures: Expenditure[]) =>
  companyReceived(id, receipts) + companyCarryForward(id, receipts) - companyExpenditure(id, expenditures);

export const totalReceived = (receipts: FundReceipt[]) => sumBy(receipts, r => r.amount);
export const totalExpenditure = (expenditures: Expenditure[]) => sumBy(expenditures, e => e.amount);
export const totalCarryForward = (receipts: FundReceipt[]) => sumBy(receipts, r => r.carryForward);

// Compact rupee formatting for charts/axes — e.g. ₹8.5L, ₹1.2Cr, ₹40k.
export const inrShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return '₹' + (n / 1e7).toFixed(a >= 1e8 ? 0 : 1) + 'Cr';
  if (a >= 1e5) return '₹' + (n / 1e5).toFixed(a >= 1e6 ? 0 : 1) + 'L';
  if (a >= 1e3) return '₹' + Math.round(n / 1e3) + 'k';
  return '₹' + Math.round(n);
};

export const inr = (n: number) => {
  try {
    return '₹' + Math.round(n).toLocaleString('en-IN');
  } catch {
    // manual Indian grouping fallback
    const s = String(Math.round(n));
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    return '₹' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3);
  }
};

// ── Shared primitives ────────────────────────────────────────────────────────
type Tone = 'primary' | 'success' | 'amber' | 'danger' | 'neutral' | 'accent' | 'violet';
const toneMap: Record<Tone, { fg: string; bg: string }> = {
  primary: { fg: theme.primary, bg: theme.primarySoft },
  success: { fg: theme.success, bg: theme.successSoft },
  amber:   { fg: theme.amber,   bg: theme.amberSoft },
  danger:  { fg: theme.danger,  bg: theme.dangerSoft },
  accent:  { fg: theme.accent,  bg: theme.accentSoft },
  violet:  { fg: theme.violet,  bg: theme.violetSoft },
  neutral: { fg: theme.muted,   bg: '#eef0f7' },
};

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatCard({
  icon, label, value, tint, sub, animate, onPress,
}: {
  icon: React.ReactNode; label: string; value: string; tint: Tone; sub?: string;
  animate?: { to: number; format: (n: number) => string };
  onPress?: () => void;
}) {
  const t = toneMap[tint];
  const body = (
    <>
      <View style={[styles.chip, { backgroundColor: t.bg }]}>{icon}</View>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      {animate
        ? <AnimatedNumber value={animate.to} format={animate.format} style={styles.statValue} />
        : <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>}
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
      <View style={[styles.statStripe, { backgroundColor: t.fg }]} />
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, styles.statCard, pressed && { opacity: 0.85 }]}>
        {body}
      </Pressable>
    );
  }
  return <Card style={styles.statCard}>{body}</Card>;
}

export function Pill({ text, tone = 'neutral' }: { text: string; tone?: Tone }) {
  const t = toneMap[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

// ── Project status helpers (shared by every screen that shows a project) ───────
// The backend stores the status as active | completed | on_hold | cancelled.
export const PROJECT_STATUS_OPTS: { label: string; value: ProjectStatus }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
];
export const projectStatusLabel = (s: ProjectStatus): string =>
  s === 'on_hold' ? 'On Hold' : s === 'cancelled' ? 'Cancelled' : s === 'completed' ? 'Completed' : 'Active';
export const projectStatusTone = (s: ProjectStatus): Tone =>
  s === 'active' ? 'success' : s === 'completed' ? 'primary' : s === 'on_hold' ? 'amber' : 'danger';

// Lets any screen's <Header> open the side drawer without prop-drilling.
export const MenuContext = createContext<() => void>(() => {});

// ── Auth context ─────────────────────────────────────────────────────────────
// Holds the signed-in user, the full user list, the activity log, and the
// actions that mutate them. Provided at the app root (AuthGate) and consumed by
// the Login screen, the Admin Panel, the drawer, and the CRUD wrappers in Root.
export type AuthValue = {
  user: AppUser | null;
  role: Role;
  canEdit: boolean;        // editor/admin → true, viewer → false
  canManageUsers: boolean; // admin only
  users: AppUser[];
  logs: ActivityLog[];
  login: (email: string, password: string) => Promise<string | null>; // error message, or null on success
  logout: () => void;
  createUser: (u: Omit<AppUser, 'id'>) => Promise<string | null>; // error message, or null on success
  removeUser: (id: string) => void;
  clearLogs: () => void;
  refreshLogs: () => void;
  logActivity: (action: string) => void;
};
export const AuthContext = createContext<AuthValue>({
  user: null, role: 'viewer', canEdit: true, canManageUsers: false,
  users: [], logs: [],
  login: async () => null, logout: () => {}, createUser: async () => null, removeUser: () => {},
  clearLogs: () => {}, refreshLogs: () => {}, logActivity: () => {},
});
export const useAuth = () => useContext(AuthContext);

export function Header({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const openMenu = useContext(MenuContext);
  return (
    <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
      <View style={styles.headerGlow} />
      <View style={styles.headerRow}>
        <Pressable onPress={openMenu} hitSlop={10} style={styles.hamburger}>
          <List size={22} color="#fff" weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
    </View>
  );
}

export function AddPill({ onPress }: { onPress: () => void }) {
  // Viewers are read-only — hide the Add affordance entirely for them.
  const { canEdit } = useAuth();
  if (!canEdit) return null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.addPill, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}>
      <Plus size={15} color={theme.primary} weight="bold" />
      <Text style={styles.addPillText}>Add</Text>
    </Pressable>
  );
}

export function Button({
  label, onPress, tone = 'primary',
}: { label: string; onPress: () => void; tone?: 'primary' | 'secondary' | 'danger' }) {
  const isPrimary = tone === 'primary';
  const isDanger = tone === 'danger';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        isPrimary && { backgroundColor: pressed ? theme.primaryDk : theme.primary },
        isDanger && { backgroundColor: pressed ? '#c42e54' : theme.danger },
        tone === 'secondary' && styles.btnSecondary,
        pressed && { transform: [{ scale: 0.98 }] },
      ]}>
      <Text style={[styles.btnText, tone === 'secondary' && { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={theme.faint}
      {...props}
      style={[styles.input, props.multiline && { height: 88, textAlignVertical: 'top' }, props.style]}
    />
  );
}

// Searchable dropdown (Select2-style): a filter box appears when the list is
// long, so picking a company / project from a big list is quick.
export function Select({
  value, options, onChange, placeholder,
}: { value: string; options: { label: string; value: string }[]; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = options.find(o => o.value === value);
  const close = () => { setOpen(false); setQuery(''); };
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  const showSearch = options.length > 6;
  return (
    <>
      <Pressable style={styles.input} onPress={() => { setQuery(''); setOpen(true); }}>
        <Text style={{ flex: 1, color: current ? theme.text : theme.faint, fontSize: 14 }} numberOfLines={1}>
          {current ? current.label : placeholder || 'Select…'}
        </Text>
        <CaretDown size={16} color={theme.muted} />
      </Pressable>
      <RNModal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.selectSheet} onPress={() => {}}>
            {showSearch && (
              <View style={styles.selectSearch}>
                <MagnifyingGlass size={16} color={theme.faint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search…"
                  placeholderTextColor={theme.faint}
                  autoFocus
                  style={styles.selectSearchInput}
                />
              </View>
            )}
            <ScrollView keyboardShouldPersistTaps="handled">
              {shown.length === 0 && <Text style={styles.selectEmpty}>No matches</Text>}
              {shown.map(o => {
                const sel = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    style={[styles.selectRow, sel && { backgroundColor: theme.primarySoft }]}
                    onPress={() => { onChange(o.value); close(); }}>
                    <Text style={{ flex: 1, color: sel ? theme.primary : theme.text, fontWeight: sel ? '700' : '500', fontSize: 14 }} numberOfLines={1}>
                      {o.label}
                    </Text>
                    {sel && <Check size={16} color={theme.primary} weight="bold" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </RNModal>
    </>
  );
}

// ── Animated count-up number ─────────────────────────────────────────────────
// Counts from 0 up to `value` whenever the value changes — gives the dashboard
// its "numbers ticking up" feel the moment the app opens.
export function AnimatedNumber({
  value, format, style, duration = 1100,
}: { value: number; format: (n: number) => string; style?: StyleProp<TextStyle>; duration?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(v));
    anim.setValue(0);
    Animated.timing(anim, { toValue: value, duration, useNativeDriver: false }).start();
    return () => anim.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <Text style={style} numberOfLines={1} adjustsFontSizeToFit>{format(display)}</Text>;
}

// ── Date picker (flatpickr-style calendar) ───────────────────────────────────
// A themed calendar popup replacing the old plain "YYYY-MM-DD" text inputs.
// Stores/returns ISO `YYYY-MM-DD`; shows a friendly "5 Aug 2023" in the field.
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad2 = (n: number) => (n < 10 ? '0' + n : String(n));
export const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseISO = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((s || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
};
export const fmtNice = (s: string) => {
  const d = parseISO(s);
  return d ? `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` : (s || '');
};

// Human date+time for activity logs — e.g. "30 Jun 2026, 10:34 am".
export const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  let h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12; if (h === 0) h = 12;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${h}:${pad2(d.getMinutes())} ${ampm}`;
};

type CalMode = 'days' | 'months' | 'years';
export function DatePicker({
  value, onChange, placeholder,
}: { value: string; onChange: (iso: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CalMode>('days');
  const selected = parseISO(value);
  const [view, setView] = useState(() => selected ?? new Date());

  const openCal = () => { setView(parseISO(value) ?? new Date()); setMode('days'); setOpen(true); };

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const sameDay = (a: Date | null, d: number) =>
    !!a && a.getFullYear() === year && a.getMonth() === month && a.getDate() === d;

  // Header arrows step by month (days view), year (months view) or 12 years (years view).
  const step = (dir: number) => {
    if (mode === 'days') setView(new Date(year, month + dir, 1));
    else if (mode === 'months') setView(new Date(year + dir, month, 1));
    else setView(new Date(year + dir * 12, month, 1));
  };
  // Tapping the title drills out: days → months → years (quick jump, no
  // clicking month-by-month).
  const titlePress = () => setMode(mode === 'days' ? 'months' : mode === 'months' ? 'years' : 'days');
  const title = mode === 'days' ? `${MONTHS_LONG[month]} ${year}` : mode === 'months' ? String(year) : `${year - 6} – ${year + 5}`;
  const yearStart = year - 6; // 12-year grid

  return (
    <>
      <Pressable style={styles.input} onPress={openCal}>
        <Text style={{ flex: 1, color: selected ? theme.text : theme.faint, fontSize: 14 }}>
          {selected ? fmtNice(value) : (placeholder || 'Select date')}
        </Text>
        <CalendarBlank size={17} color={theme.primary} weight="bold" />
      </Pressable>
      <RNModal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.calSheet} onPress={() => {}}>
            <View style={styles.calHead}>
              <Pressable onPress={() => step(-1)} hitSlop={10} style={styles.calNav}>
                <CaretLeft size={18} color="#fff" weight="bold" />
              </Pressable>
              <Pressable onPress={titlePress} hitSlop={8} style={styles.calTitleBtn}>
                <Text style={styles.calTitle}>{title}</Text>
                <CaretDown size={13} color="rgba(255,255,255,0.85)" weight="bold" />
              </Pressable>
              <Pressable onPress={() => step(1)} hitSlop={10} style={styles.calNav}>
                <CaretRight size={18} color="#fff" weight="bold" />
              </Pressable>
            </View>
            <View style={styles.calBody}>
              {mode === 'days' && (
                <>
                  <View style={styles.calWeekRow}>
                    {WEEKDAYS.map(w => <Text key={w} style={styles.calWeekday}>{w}</Text>)}
                  </View>
                  <View style={styles.calGrid}>
                    {cells.map((d, i) => {
                      if (d === null) return <View key={i} style={styles.calCell} />;
                      const isSel = sameDay(selected, d);
                      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
                      return (
                        <Pressable key={i} style={styles.calCell}
                          onPress={() => { onChange(toISO(new Date(year, month, d))); setOpen(false); }}>
                          <View style={[styles.calDay, isSel && styles.calDaySel, !isSel && isToday && styles.calDayToday]}>
                            <Text style={[styles.calDayText, isSel && { color: '#fff', fontWeight: '800' }, !isSel && isToday && { color: theme.primary, fontWeight: '800' }]}>{d}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {mode === 'months' && (
                <View style={styles.calMonthGrid}>
                  {MONTHS_SHORT.map((m, mi) => {
                    const isSel = !!selected && selected.getFullYear() === year && selected.getMonth() === mi;
                    const isCur = today.getFullYear() === year && today.getMonth() === mi;
                    return (
                      <Pressable key={m} style={styles.calMonthCell}
                        onPress={() => { setView(new Date(year, mi, 1)); setMode('days'); }}>
                        <View style={[styles.calChip, isSel && styles.calDaySel, !isSel && isCur && styles.calDayToday]}>
                          <Text style={[styles.calChipText, isSel && { color: '#fff', fontWeight: '800' }, !isSel && isCur && { color: theme.primary, fontWeight: '800' }]}>{m}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {mode === 'years' && (
                <View style={styles.calMonthGrid}>
                  {Array.from({ length: 12 }, (_, k) => yearStart + k).map(y => {
                    const isSel = !!selected && selected.getFullYear() === y;
                    const isCur = today.getFullYear() === y;
                    return (
                      <Pressable key={y} style={styles.calMonthCell}
                        onPress={() => { setView(new Date(y, month, 1)); setMode('months'); }}>
                        <View style={[styles.calChip, isSel && styles.calDaySel, !isSel && isCur && styles.calDayToday]}>
                          <Text style={[styles.calChipText, isSel && { color: '#fff', fontWeight: '800' }, !isSel && isCur && { color: theme.primary, fontWeight: '800' }]}>{y}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={styles.calFooter}>
                <Pressable onPress={() => { onChange(''); setOpen(false); }} hitSlop={8}>
                  <Text style={styles.calClear}>Clear</Text>
                </Pressable>
                <Pressable onPress={() => { onChange(toISO(new Date())); setOpen(false); }} hitSlop={8}>
                  <Text style={styles.calToday}>Today</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </RNModal>
    </>
  );
}

export function Modal({
  visible, title, onClose, children,
}: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.modalClose}>
              <X size={18} color={theme.muted} weight="bold" />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </RNModal>
  );
}

// Small round "i" button placed on a card; opens the InfoModal with the record's
// notes / description (and any extra rows the caller passes, e.g. the year).
export function InfoButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.infoBtn}>
      <Info size={16} color={theme.primary} weight="bold" />
    </Pressable>
  );
}

// Reusable read-only popup that shows whatever the editor/admin wrote for a
// record — optional key/value rows first, then Description, then Notes. Used by
// the Projects, Fund Receipts and Expenditures screens.
export function InfoModal({
  visible, title, onClose, rows, description, notes,
}: {
  visible: boolean; title: string; onClose: () => void;
  rows?: { label: string; value: string }[];
  description?: string; notes?: string;
}) {
  const hasDesc = !!description && !!description.trim();
  const hasNotes = !!notes && !!notes.trim();
  const empty = !hasDesc && !hasNotes && !(rows && rows.length);
  return (
    <Modal visible={visible} title={title} onClose={onClose}>
      {rows?.map(r => (
        <View key={r.label} style={styles.infoBlock}>
          <Text style={styles.infoLabel}>{r.label.toUpperCase()}</Text>
          <Text style={styles.infoValue}>{r.value || '—'}</Text>
        </View>
      ))}
      {hasDesc && (
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>DESCRIPTION</Text>
          <Text style={styles.infoBody}>{description}</Text>
        </View>
      )}
      {hasNotes && (
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>NOTES</Text>
          <Text style={styles.infoBody}>{notes}</Text>
        </View>
      )}
      {empty && <Text style={styles.infoEmpty}>No description or notes were added for this record.</Text>}
    </Modal>
  );
}

export function Confirm({
  visible, title, message, onCancel, onConfirm,
}: { visible: boolean; title: string; message: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.confirmSheet}>
          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmMsg}>{message}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <View style={{ flex: 1 }}><Button label="Cancel" tone="secondary" onPress={onCancel} /></View>
            <View style={{ flex: 1 }}><Button label="Delete" tone="danger" onPress={onConfirm} /></View>
          </View>
        </View>
      </View>
    </RNModal>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// ── App root: store + tab navigation ─────────────────────────────────────────
type TabKey = 'dash' | 'companies' | 'years' | 'projects' | 'receipts' | 'expenditures' | 'reports' | 'admin' | 'profile';
let _id = 1000;
const nextId = () => 'x' + (++_id);

// `adminOnly` tabs are hidden from editors & viewers (they never see the Admin
// Panel). Every other tab — including "My Profile" — is visible to all roles.
const TABS: { key: TabKey; label: string; Icon: any; adminOnly?: boolean }[] = [
  { key: 'dash',         label: 'Dashboard',     Icon: House },
  { key: 'companies',    label: 'Companies',     Icon: Buildings },
  { key: 'years',        label: 'Years',         Icon: CalendarBlank },
  { key: 'projects',     label: 'Projects',      Icon: Briefcase },
  { key: 'receipts',     label: 'Fund Receipts', Icon: Receipt },
  { key: 'expenditures', label: 'Expenditures',  Icon: HandCoins },
  { key: 'reports',      label: 'Reports',       Icon: ChartBar },
  { key: 'admin',        label: 'Admin Panel',   Icon: ShieldCheck, adminOnly: true },
  { key: 'profile',      label: 'My Profile',    Icon: UserCircle },
];

function Root() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('dash');
  const [menuOpen, setMenuOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [receipts, setReceipts] = useState<FundReceipt[]>([]);
  const [expenditures, setExpenditures] = useState<Expenditure[]>([]);

  // Pull every list fresh from the backend. The app and the website share one
  // backend + database, so re-fetching keeps the app in sync with whatever the
  // website (or another user) changed. Called on open, whenever you switch pages,
  // and when the app returns to the foreground — so no page ever shows stale data.
  const reloadAll = useCallback(() => {
    // Fetch each list INDEPENDENTLY (not Promise.all) so one slow/failed request
    // — e.g. during a Render cold-start — can't block the others and leave whole
    // pages showing stale data. Each resolves and updates on its own.
    api.list('companies').then(setCompanies).catch(() => {});
    api.list('years').then(setYears).catch(() => {});
    api.list('projects').then(setProjects).catch(() => {});
    api.list('receipts').then(setReceipts).catch(() => {});
    api.list('expenditures').then(setExpenditures).catch(() => {});
  }, []);

  useEffect(() => {
    reloadAll();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') reloadAll(); });
    return () => sub.remove();
  }, [reloadAll]);

  // Write actions are gated by role (viewers are read-only) and every mutation
  // is appended to the activity log. These wrappers capture fresh state each
  // render so deletes can resolve a friendly name for the log message.
  const { user, canEdit, canManageUsers, logout, logActivity: note } = useAuth();
  // Run a write only if allowed, and surface any backend failure to the user
  // (so an edit/delete never fails silently — you always see why it didn't save).
  const guard = (fn: () => void | Promise<void>) => {
    if (!canEdit) return;
    const r = fn();
    if (r && typeof (r as any).catch === 'function') {
      (r as Promise<void>).catch((e: any) =>
        Alert.alert('Action failed', e?.message || 'Could not reach the server. Please try again.'));
    }
  };
  // Tabs visible to the signed-in user:
  //   • Admin Panel  → admins only
  //   • My Profile   → editors & viewers only (admins see their info + all logs
  //                    in the Admin Panel, so it's redundant for them)
  const visibleTabs = TABS.filter(t => {
    if (t.adminOnly) return canManageUsers;
    if (t.key === 'profile') return !canManageUsers;
    return true;
  });

  const companyApi = {
    add: (c: Omit<Company, 'id'>) => guard(async () => {
      const row: Company = await api.create('companies', c);
      setCompanies(p => [row, ...p]);
      note(`Added company "${c.name}"`);
    }),
    update: (id: string, c: Omit<Company, 'id'>) => guard(async () => {
      const row: Company = await api.update('companies', id, c);
      setCompanies(p => p.map(x => x.id === id ? row : x));
      note(`Updated company "${c.name}"`);
    }),
    remove: (id: string) => guard(async () => {
      const nm = companies.find(x => x.id === id)?.name ?? 'company';
      await api.remove('companies', id);
      setCompanies(p => p.filter(x => x.id !== id));
      setProjects(p => p.filter(x => x.companyId !== id));
      setReceipts(p => p.filter(x => x.companyId !== id));
      setExpenditures(p => p.filter(x => x.companyId !== id));
      note(`Deleted company "${nm}"`);
    }),
  };

  const yearApi = {
    add: (y: Omit<FinancialYear, 'id'>) => guard(async () => {
      const row: FinancialYear = await api.create('years', y);
      setYears(p => [...p, row]);
      note(`Added financial year "${y.name}"`);
    }),
    update: (id: string, y: Omit<FinancialYear, 'id'>) => guard(async () => {
      const row: FinancialYear = await api.update('years', id, y);
      setYears(p => p.map(x => x.id === id ? row : x));
      note(`Updated financial year "${y.name}"`);
    }),
    // Each year toggles independently — any number can be active at once.
    setActive: (id: string, active: boolean) => guard(async () => {
      const y = years.find(x => x.id === id);
      if (!y) return;
      await api.update('years', id, { name: y.name, start: y.start, end: y.end, active });
      setYears(p => p.map(x => x.id === id ? { ...x, active } : x));
      note(`${active ? 'Activated' : 'Deactivated'} financial year "${y.name}"`);
    }),
    remove: (id: string) => guard(async () => {
      const nm = years.find(x => x.id === id)?.name ?? 'year';
      await api.remove('years', id);
      setYears(p => p.filter(x => x.id !== id));
      note(`Deleted financial year "${nm}"`);
    }),
  };

  const projectApi = {
    add: (pr: Omit<Project, 'id'>) => guard(async () => {
      const row: Project = await api.create('projects', pr);
      setProjects(p => [row, ...p]);
      note(`Added project "${pr.name}"`);
    }),
    update: (id: string, pr: Omit<Project, 'id'>) => guard(async () => {
      const row: Project = await api.update('projects', id, pr);
      setProjects(p => p.map(x => x.id === id ? row : x));
      note(`Updated project "${pr.name}"`);
    }),
    remove: (id: string) => guard(async () => {
      const proj = projects.find(x => x.id === id);
      // An active/ongoing project can't be deleted — it must be marked completed
      // first. (Admins & editors alike are held to this rule.)
      if (proj && proj.status === 'active') {
        Alert.alert(
          'Project is still active',
          `"${proj.name}" is an ongoing project. Mark it as Completed before deleting it.`,
        );
        return;
      }
      const nm = proj?.name ?? 'project';
      await api.remove('projects', id);
      setProjects(p => p.filter(x => x.id !== id));
      setExpenditures(p => p.filter(x => x.projectId !== id));
      note(`Deleted project "${nm}"`);
    }),
  };

  const receiptApi = {
    add: (r: Omit<FundReceipt, 'id'>) => guard(async () => {
      const row: FundReceipt = await api.create('receipts', r);
      setReceipts(p => [row, ...p]);
      note(`Recorded fund receipt of ${inr(r.amount)}`);
    }),
    update: (id: string, r: Omit<FundReceipt, 'id'>) => guard(async () => {
      const row: FundReceipt = await api.update('receipts', id, r);
      setReceipts(p => p.map(x => x.id === id ? row : x));
      note(`Updated fund receipt of ${inr(r.amount)}`);
    }),
    remove: (id: string) => guard(async () => {
      const amt = receipts.find(x => x.id === id)?.amount ?? 0;
      await api.remove('receipts', id);
      setReceipts(p => p.filter(x => x.id !== id));
      note(`Deleted fund receipt of ${inr(amt)}`);
    }),
  };

  const expenditureApi = {
    add: (e: Omit<Expenditure, 'id'>) => guard(async () => {
      const row: Expenditure = await api.create('expenditures', e);
      setExpenditures(p => [row, ...p]);
      note(`Added expenditure of ${inr(e.amount)}`);
    }),
    update: (id: string, e: Omit<Expenditure, 'id'>) => guard(async () => {
      const row: Expenditure = await api.update('expenditures', id, e);
      setExpenditures(p => p.map(x => x.id === id ? row : x));
      note(`Updated expenditure of ${inr(e.amount)}`);
    }),
    remove: (id: string) => guard(async () => {
      const amt = expenditures.find(x => x.id === id)?.amount ?? 0;
      await api.remove('expenditures', id);
      setExpenditures(p => p.filter(x => x.id !== id));
      note(`Deleted expenditure of ${inr(amt)}`);
    }),
  };

  const active = TABS.find(t => t.key === tab);
  const go = (k: TabKey) => { setTab(k); setMenuOpen(false); reloadAll(); };

  return (
    <MenuContext.Provider value={() => setMenuOpen(true)}>
      <View style={styles.appWrap}>
        <View style={{ flex: 1 }}>
          {tab === 'dash' && <Dashboard companies={companies} years={years} projects={projects} receipts={receipts} expenditures={expenditures} />}
          {tab === 'companies' && <Companies companies={companies} projects={projects} years={years} receipts={receipts} expenditures={expenditures} {...companyApi} />}
          {tab === 'years' && <FinancialYears years={years} {...yearApi} />}
          {tab === 'projects' && <Projects projects={projects} companies={companies} years={years} {...projectApi} />}
          {tab === 'receipts' && <FundReceipts receipts={receipts} companies={companies} years={years} {...receiptApi} />}
          {tab === 'expenditures' && <Expenditures expenditures={expenditures} projects={projects} companies={companies} years={years} {...expenditureApi} />}
          {tab === 'reports' && <Reports companies={companies} years={years} projects={projects} receipts={receipts} expenditures={expenditures} />}
          {tab === 'admin' && canManageUsers && <AdminPanel />}
          {tab === 'profile' && <Profile />}
        </View>

        {/* Side hamburger drawer — holds the page navigation */}
        <RNModal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setMenuOpen(false)}>
            <Pressable
              style={[styles.drawer, { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 18 }]}
              onPress={() => {}}>
              <View style={styles.drawerBrand}>
                <Image source={require('./src/assets/logo.png')} style={styles.drawerLogo} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.drawerTitle}>CSR Manager</Text>
                  <Text style={styles.drawerSubtitle}>{active ? active.label : ''}</Text>
                </View>
                <Pressable onPress={() => setMenuOpen(false)} hitSlop={10} style={styles.drawerClose}>
                  <X size={16} color={theme.muted} weight="bold" />
                </Pressable>
              </View>

              <View style={styles.drawerDivider} />

              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {visibleTabs.map(({ key, label, Icon }) => {
                  const on = tab === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => go(key)}
                      style={({ pressed }) => [styles.drawerItem, on && styles.drawerItemActive, pressed && { opacity: 0.7 }]}>
                      <View style={[styles.drawerItemIcon, on && { backgroundColor: theme.primary }]}>
                        <Icon size={18} color={on ? '#fff' : theme.muted} weight={on ? 'fill' : 'regular'} />
                      </View>
                      <Text style={[styles.drawerItemLabel, { color: on ? theme.primary : theme.text }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Footer — just Sign out (the account row was removed on request) */}
              <View style={styles.drawerDivider} />
              <Pressable
                onPress={() => { setMenuOpen(false); logout(); }}
                style={({ pressed }) => [styles.drawerSignOut, pressed && { opacity: 0.7 }]}>
                <SignOut size={20} color={theme.danger} weight="bold" />
                <Text style={styles.drawerSignOutText}>Sign out</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </RNModal>
      </View>
    </MenuContext.Provider>
  );
}

// Gate the whole app behind the login screen and own the auth store: the user
// list, the signed-in user, and the activity log. State is in-memory only, so
// it resets on a cold start (the login page shows each launch) — once the
// PostgreSQL + Node API lands these handlers call the backend instead.
// Key under which the signed-in user is persisted on the device, so a hot
// reload (during development) or an app restart keeps you logged in — you only
// sign in once.
const AUTH_KEY = 'csr_user';

function AuthGate() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [user, setUser] = useState<AppUser | null>(null);
  // `hydrated` gates the first render until we've read any saved session from
  // storage — avoids a flash of the Login screen before auto-login kicks in.
  const [hydrated, setHydrated] = useState(false);

  // Pull the user list + activity log from the backend. Both are role-aware on
  // the server: /users and /logs are admin-only, so editors/viewers read their
  // own activity from /logs/mine instead (403 otherwise). Pass the acting user
  // explicitly so this works right after login before state has settled.
  const refreshUsers = (who: AppUser | null = user) => {
    if (who?.role === 'admin') api.getUsers().then(setUsers).catch(() => {});
    else setUsers(who ? [who] : []);
  };
  const refreshLogs = (who: AppUser | null = user) => {
    const p = who?.role === 'admin' ? api.getLogs() : api.getMyLogs();
    p.then(setLogs).catch(() => {});
  };

  // Restore a previously saved session on app start / after a reload, and load
  // the persisted JWT into the API client BEFORE the first data request fires.
  // Also register the 401 handler so an expired token returns us to login.
  useEffect(() => {
    warmUp(); // wake the backend immediately so login isn't stuck on a cold start
    setUnauthorizedHandler(() => {
      setUser(null); setUsers([]); setLogs([]);
      AsyncStorage.removeItem(AUTH_KEY).catch(() => {});
    });
    Promise.all([AsyncStorage.getItem(AUTH_KEY), loadToken()])
      .then(([saved]) => {
        if (saved) {
          try { const u: AppUser = JSON.parse(saved); setUser(u); refreshUsers(u); refreshLogs(u); } catch {}
        }
      })
      .finally(() => setHydrated(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user,
    role: user?.role ?? 'viewer',
    canEdit: user ? user.role !== 'viewer' : false,
    canManageUsers: user?.role === 'admin',
    users,
    logs,
    login: async (email, password) => {
      try {
        const { user: found } = await api.login(email, password); // stores the JWT
        setUser(found);
        AsyncStorage.setItem(AUTH_KEY, JSON.stringify(found)).catch(() => {});
        refreshUsers(found);
        refreshLogs(found); // the backend already recorded "Signed In"
        return null;
      } catch (e: any) {
        return e?.message || 'Could not reach the server. Check your connection.';
      }
    },
    logout: () => {
      api.logout().catch(() => {}); // clears the JWT + records "Signed Out" server-side
      setUser(null); setUsers([]); setLogs([]);
      AsyncStorage.removeItem(AUTH_KEY).catch(() => {});
    },
    createUser: async (u) => {
      try {
        const row: AppUser = await api.createUser(u);
        setUsers(p => [...p, row]);
        refreshLogs();
        return null;
      } catch (e: any) {
        return e?.message || 'Could not create the account. Please try again.';
      }
    },
    removeUser: (id) => {
      api.removeUser(id)
        .then(() => { setUsers(p => p.filter(u => u.id !== id)); refreshLogs(); })
        .catch(() => {});
    },
    clearLogs: () => { api.clearLogs().then(() => setLogs([])).catch(() => {}); },
    refreshLogs: () => refreshLogs(),
    // Writes are auto-logged server-side; give the log a beat to persist, then refetch.
    logActivity: () => { setTimeout(() => refreshLogs(), 700); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [user, users, logs]);

  return (
    <AuthContext.Provider value={value}>
      {!hydrated ? null : user ? <Root /> : <Login authenticate={value.login} />}
    </AuthContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthGate />
    </SafeAreaProvider>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const shadow = {
  shadowColor: '#1e1b4b',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  appWrap: { flex: 1, backgroundColor: theme.bg },

  header: {
    backgroundColor: theme.primary,
    paddingHorizontal: 16,
    paddingBottom: 22,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute', top: -50, right: -30, width: 160, height: 160,
    borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.10)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: 0.2 },
  headerSub: { color: 'rgba(255,255,255,0.72)', fontSize: 13, marginTop: 3, fontWeight: '500' },
  hamburger: {
    width: 38, height: 38, borderRadius: 11, marginRight: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)',
  },

  addPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999,
  },
  addPillText: { color: theme.primary, fontWeight: '800', fontSize: 13 },

  card: { backgroundColor: theme.surface, borderRadius: 18, padding: 16, ...shadow },

  statCard: { flex: 1, overflow: 'hidden' },
  chip: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statLabel: { fontSize: 10.5, color: theme.faint, fontWeight: '700', letterSpacing: 0.6 },
  statValue: { fontSize: 19, color: theme.text, fontWeight: '800', marginTop: 3 },
  statSub: { fontSize: 11.5, color: theme.muted, marginTop: 2 },
  statStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },

  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 11.5, fontWeight: '700' },

  infoBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' },
  infoBlock: { marginBottom: 14 },
  infoLabel: { fontSize: 10.5, color: theme.faint, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  infoValue: { fontSize: 14, color: theme.text, fontWeight: '600' },
  infoBody: { fontSize: 13.5, color: theme.muted, fontWeight: '500', lineHeight: 20 },
  infoEmpty: { fontSize: 13.5, color: theme.faint, fontStyle: 'italic', lineHeight: 20 },

  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', backgroundColor: theme.primary },
  btnSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.border },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, color: theme.muted, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f7f8fd', borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14, color: theme.text, minHeight: 46,
  },

  // ── Date picker (flatpickr-style calendar) ──
  calSheet: { width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 22, overflow: 'hidden', ...shadow },
  calHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.primary, paddingHorizontal: 14, paddingVertical: 14,
  },
  calNav: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  calTitleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)' },
  calTitle: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  calBody: { padding: 12 },
  calMonthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calMonthCell: { width: `${100 / 3}%`, paddingVertical: 7, paddingHorizontal: 5 },
  calChip: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f5fc' },
  calChipText: { fontSize: 14, color: theme.text, fontWeight: '600' },
  calWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: theme.faint, letterSpacing: 0.4 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calDay: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  calDaySel: { backgroundColor: theme.primary },
  calDayToday: { borderWidth: 1.5, borderColor: theme.primary },
  calDayText: { fontSize: 14, color: theme.text, fontWeight: '600' },
  calFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: theme.border },
  calClear: { color: theme.danger, fontWeight: '700', fontSize: 13.5 },
  calToday: { color: theme.primary, fontWeight: '800', fontSize: 13.5 },

  backdrop: { flex: 1, backgroundColor: 'rgba(15,17,43,0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  modalSheet: { width: '100%', backgroundColor: '#fff', borderRadius: 22, overflow: 'hidden', ...shadow },
  modalHead: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: theme.text },
  modalClose: { width: 30, height: 30, borderRadius: 999, backgroundColor: '#f1f2f9', alignItems: 'center', justifyContent: 'center' },

  selectSheet: { width: '100%', maxHeight: 400, backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', ...shadow },
  selectSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  selectSearchInput: { flex: 1, fontSize: 14, color: theme.text, padding: 0 },
  selectEmpty: { padding: 18, textAlign: 'center', color: theme.faint, fontSize: 13.5 },
  selectRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.border,
  },

  confirmSheet: { width: '100%', backgroundColor: '#fff', borderRadius: 22, padding: 22, ...shadow },
  confirmTitle: { fontSize: 17, fontWeight: '800', color: theme.text },
  confirmMsg: { fontSize: 14, color: theme.muted, marginTop: 8, lineHeight: 20 },

  empty: { paddingVertical: 50, alignItems: 'center' },
  emptyText: { color: theme.faint, fontSize: 14, fontWeight: '500' },

  // ── Side drawer (hamburger menu) ──
  drawerBackdrop: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(15,17,43,0.45)' },
  drawer: {
    width: '78%', maxWidth: 320, backgroundColor: '#fff',
    paddingHorizontal: 16,
    borderTopRightRadius: 24, borderBottomRightRadius: 24, ...shadow,
  },
  drawerBrand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  drawerLogo: { width: 48, height: 48, borderRadius: 13 },
  drawerTitle: { fontSize: 18, fontWeight: '800', color: theme.text },
  drawerSubtitle: { fontSize: 12.5, color: theme.muted, marginTop: 2, fontWeight: '500' },
  drawerClose: { width: 30, height: 30, borderRadius: 999, backgroundColor: '#f1f2f9', alignItems: 'center', justifyContent: 'center' },
  drawerDivider: { height: 1, backgroundColor: theme.border, marginVertical: 11 },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 9, paddingHorizontal: 11, borderRadius: 12, marginBottom: 3,
  },
  drawerItemActive: { backgroundColor: theme.primarySoft },
  drawerItemIcon: {
    width: 33, height: 33, borderRadius: 10, backgroundColor: '#f1f2f9',
    alignItems: 'center', justifyContent: 'center',
  },
  drawerItemLabel: { fontSize: 14.5, fontWeight: '700' },

  // Drawer footer — signed-in account + sign out
  drawerUser: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6, paddingVertical: 4 },
  drawerAvatar: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: theme.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  drawerAvatarText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
  drawerUserName: { fontSize: 14.5, fontWeight: '800', color: theme.text },
  drawerUserRole: { fontSize: 12, color: theme.muted, marginTop: 1, fontWeight: '600' },
  drawerSignOut: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 10, paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 14, backgroundColor: theme.dangerSoft,
  },
  drawerSignOutText: { fontSize: 15, fontWeight: '800', color: theme.danger },
});
