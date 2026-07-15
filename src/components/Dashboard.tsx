// Screen 1 — Dashboard: summary stats, year-wise overview, fund distribution
// pie, and a company fund-positions table. Mirrors the web app's dashboard,
// adapted to a phone layout. Every figure is derived from the Fund Receipts
// (money in) and Expenditures (money out) ledgers so it always stays in sync.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { api } from '../api';
import { Wallet } from 'phosphor-react-native/src/icons/Wallet';
import { TrendUp } from 'phosphor-react-native/src/icons/TrendUp';
import { Receipt } from 'phosphor-react-native/src/icons/Receipt';
import { Briefcase } from 'phosphor-react-native/src/icons/Briefcase';
import { theme } from '../theme';
import {
  Card,
  CarryForwardRow,
  Company,
  DataTable,
  Expenditure,
  FinancialYear,
  FundReceipt,
  Header,
  Project,
  StatCard,
  TCell,
  companyReceived,
  companyCarryForward,
  companyExpenditure,
  companyBalance,
  totalReceived as sumReceived,
  totalExpenditure as sumExpenditure,
  inr,
  inrShort,
} from '../../App';

type Props = {
  companies: Company[];
  years: FinancialYear[];
  projects: Project[];
  receipts: FundReceipt[];
  expenditures: Expenditure[];
  // Server-derived: one row per (Ongoing project × company). Used only for the
  // Carry Forward column of the Company Fund Positions table when the backend
  // summary hasn't loaded yet.
  carryForward: CarryForwardRow[];
};

// Rotating slice palette for the pie + legend — stays inside the app's theme.
const PIE_COLORS = [
  theme.primary,
  theme.accent,
  theme.violet,
  theme.amber,
  theme.success,
  theme.danger,
];

// Bar-chart geometry. PLOT_H = drawing height, AXIS_PAD = space under baseline
// for the year labels, TOP_PAD = headroom kept above the tallest bar for its
// value label.
const PLOT_H = 150;
const AXIS_PAD = 24;
const TOP_PAD = 16;

// ── Pie geometry helpers ──
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
};
const arc = (cx: number, cy: number, r: number, start: number, end: number) => {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y} Z`;
};

// Columns for the sortable Company Fund Positions table (DataTables-style).
// The sortable fields of the Company Fund Positions table, shown as chips above it.
const POS_COLS = [
  { key: 'company', label: 'Company' },
  { key: 'received', label: 'Received' },
  { key: 'carry', label: 'Carry Fwd' },
  { key: 'expenditure', label: 'Expenditure' },
  { key: 'balance', label: 'Balance' },
  { key: 'projects', label: 'Projects' },
] as const;

export default function Dashboard({
  companies,
  years,
  projects,
  receipts,
  expenditures,
  carryForward,
}: Props) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({
    key: 'received',
    dir: 'desc',
  });

  // Pull the backend's OWN computed figures — the exact same numbers the website
  // shows (same /dashboard/summary endpoint). Refetched whenever the underlying
  // data changes so it stays live after adds/edits. Until it loads (or if the
  // request fails) we fall back to client-side sums so the screen is never empty.
  const [summary, setSummary] = useState<any>(null);
  useEffect(() => {
    api.dashboard().then(setSummary).catch(() => {});
  }, [receipts, expenditures, projects, years, companies]);

  const received = summary ? summary.totalReceived : sumReceived(receipts);
  const expenditure = summary ? summary.totalExpenditure : sumExpenditure(expenditures);
  const balance = summary ? summary.totalBalance : received - expenditure;

  const active = summary ? summary.activeProjects : projects.filter(p => p.status === 'active').length;
  const completed = summary
    ? summary.completedProjects
    : projects.filter(p => p.status === 'completed').length;
  const totalProj = summary ? summary.totalProjects : projects.length;

  // "this year" figures — from the backend when available (uses the current
  // fiscal year, exactly like the website); else the latest active year.
  let yReceived: number, yExpenditure: number, yBalance: number;
  if (summary) {
    yReceived = summary.receivedThisYear;
    yExpenditure = summary.expenditureThisYear;
    yBalance = summary.balanceThisYear;
  } else {
    const activeYear = years.filter(y => y.active).sort((a, b) => (a.start < b.start ? 1 : -1))[0];
    const yRec = activeYear ? receipts.filter(r => r.yearId === activeYear.id) : [];
    const yExp = activeYear ? expenditures.filter(e => e.yearId === activeYear.id) : [];
    yReceived = yRec.reduce((s, r) => s + r.amount, 0);
    yExpenditure = yExp.reduce((s, e) => s + e.amount, 0);
    yBalance = yReceived - yExpenditure;
  }

  // Year-wise grouped bars (Received vs Expenditure).
  const yearRows: { name: string; received: number; expenditure: number }[] = summary
    ? summary.yearWise.map((y: any) => ({ name: y.year, received: y.received, expenditure: y.expenditure }))
    : years.map(y => ({
        name: y.name,
        received: receipts.filter(r => r.yearId === y.id).reduce((s, r) => s + r.amount, 0),
        expenditure: expenditures.filter(e => e.yearId === y.id).reduce((s, e) => s + e.amount, 0),
      }));
  const maxBar = Math.max(1, ...yearRows.map(r => Math.max(r.received, r.expenditure)));

  // Fund distribution pie (by company received).
  const dist: { name: string; value: number; pct: number | null; color: string }[] = summary
    ? summary.companyDistribution
        .filter((d: any) => d.received > 0)
        .map((d: any, i: number) => ({ name: d.companyName, value: d.received, pct: d.percent, color: PIE_COLORS[i % PIE_COLORS.length] }))
    : companies
        .map((c, i) => ({ name: c.name, value: companyReceived(c.id, receipts), pct: null, color: PIE_COLORS[i % PIE_COLORS.length] }))
        .filter(d => d.value > 0);
  const distTotal = dist.reduce((s, d) => s + d.value, 0);
  let cursor = 0;
  const slices = dist.map(d => {
    const frac = distTotal ? d.value / distTotal : 0;
    const start = cursor * 360;
    cursor += frac;
    const end = cursor * 360;
    return { ...d, start, end, pct: d.pct != null ? d.pct : frac * 100 };
  });

  // Company Fund Positions rows + sorting (DataTables-style).
  const toggleSort = (key: string) =>
    setSort(s =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'company' ? 'asc' : 'desc' },
    );
  const posBase = summary
    ? summary.companyPositions.map((p: any) => ({
        id: p.companyId,
        company: p.companyName,
        received: p.totalReceived,
        carry: p.carryForward,
        expenditure: p.expenditure,
        balance: p.balance,
        projects: p.projects,
      }))
    : companies.map(c => ({
        id: c.id,
        company: c.name,
        received: companyReceived(c.id, receipts),
        // Carry forward is DERIVED — the sum of this company's carry-forward rows.
        // It is a slice of the balance below, never an addition to it.
        carry: companyCarryForward(c.id, carryForward),
        expenditure: companyExpenditure(c.id, expenditures),
        // Balance = Received − Expenditure.
        balance: companyBalance(c.id, receipts, expenditures),
        projects: projects.filter(p => p.companyIds.includes(c.id)).length,
      }));
  const posRows = [...posBase].sort((a, b) => {
    const av = sort.key === 'company' ? a.company.toLowerCase() : (a as any)[sort.key];
    const bv = sort.key === 'company' ? b.company.toLowerCase() : (b as any)[sort.key];
    if (av < bv) return sort.dir === 'asc' ? -1 : 1;
    if (av > bv) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <View style={{ flex: 1 }}>
      <Header title="Dashboard" subtitle="CSR funds at a glance" />
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Stat grid — values count up on open */}
        <View style={styles.grid}>
          <StatCard
            icon={<Wallet size={20} color={theme.success} weight="fill" />}
            label="Total Balance"
            tint="success"
            value={inr(balance)}
            animate={{ to: balance, format: inr }}
            sub={`${inr(yBalance)} this year`}
          />
          <StatCard
            icon={<TrendUp size={20} color={theme.primary} weight="fill" />}
            label="Total Received"
            tint="primary"
            value={inr(received)}
            animate={{ to: received, format: inr }}
            sub={`${inr(yReceived)} this year`}
          />
        </View>
        <View style={styles.grid}>
          <StatCard
            icon={<Receipt size={20} color={theme.danger} weight="fill" />}
            label="Total Expenditure"
            tint="danger"
            value={inr(expenditure)}
            animate={{ to: expenditure, format: inr }}
            sub={`${inr(yExpenditure)} this year`}
          />
          <StatCard
            icon={<Briefcase size={20} color={theme.amber} weight="fill" />}
            label="Active Projects"
            tint="amber"
            value={String(active)}
            animate={{ to: active, format: n => String(Math.round(n)) }}
            sub={`${completed} completed, ${totalProj} total`}
          />
        </View>

        {/* Year-wise Fund Overview */}
        <Card style={{ marginTop: 4 }}>
          <View style={styles.chartHead}>
            <Text style={styles.cardTitle}>Year-wise Fund Overview</Text>
            <View style={styles.legend}>
              <Dot color={theme.primary} />
              <Text style={styles.legendText}>Received</Text>
              <Dot color={theme.accent} />
              <Text style={styles.legendText}>Expenditure</Text>
            </View>
          </View>

          {yearRows.length === 0 ? (
            <Text style={styles.empty}>No financial years yet.</Text>
          ) : (
            <View style={styles.plot}>
              {/* horizontal gridlines + y-axis labels */}
              {[1, 0.75, 0.5, 0.25, 0].map(f => (
                <View
                  key={f}
                  style={[styles.gridRow, { bottom: AXIS_PAD + f * PLOT_H }]}
                >
                  <Text style={styles.gridLabel}>
                    {f === 0 ? '₹0' : inrShort(maxBar * f)}
                  </Text>
                  <View style={styles.gridLine} />
                </View>
              ))}
              {/* bars */}
              <View style={styles.barsRow}>
                {yearRows.map(r => (
                  <View key={r.name} style={styles.barGroup}>
                    <View style={styles.barPair}>
                      <Bar
                        value={r.received}
                        max={maxBar}
                        color={theme.primary}
                      />
                      <Bar
                        value={r.expenditure}
                        max={maxBar}
                        color={theme.accent}
                      />
                    </View>
                    <Text style={styles.barLabel} numberOfLines={1}>
                      {r.name.replace('FY ', '')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Card>

        {/* Fund Distribution by Company */}
        <Card style={{ marginTop: 14 }}>
          <Text style={styles.cardTitle}>Fund Distribution by Company</Text>
          {slices.length === 0 ? (
            <Text style={styles.empty}>No fund receipts recorded yet.</Text>
          ) : (
            <View style={styles.pieWrap}>
              <Svg width={150} height={150} viewBox="0 0 150 150">
                {slices.length === 1 ? (
                  <Circle cx={75} cy={75} r={74} fill={slices[0].color} />
                ) : (
                  slices.map(s => (
                    <Path
                      key={s.name}
                      d={arc(75, 75, 74, s.start, s.end)}
                      fill={s.color}
                    />
                  ))
                )}
              </Svg>
              <View style={styles.pieLegend}>
                {slices.map(s => (
                  <View key={s.name} style={styles.pieLegendRow}>
                    <Dot color={s.color} />
                    <Text style={styles.pieLegendName} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text style={styles.pieLegendPct}>{s.pct.toFixed(0)}%</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Card>

        {/* Company Fund Positions — the shared table, so it matches every other
            list in the app. Tap a column header to sort by it. */}
        <View style={styles.tableSection}>
          <Text style={styles.cardTitle}>Company Fund Positions</Text>
          <View style={styles.sortRow}>
            {POS_COLS.map(col => {
              const on = sort.key === col.key;
              return (
                <Pressable
                  key={col.key}
                  onPress={() => toggleSort(col.key)}
                  style={[styles.sortChip, on && styles.sortChipOn]}>
                  <Text style={[styles.sortChipText, on && styles.sortChipTextOn]}>
                    {col.label}{on ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <DataTable
            rows={posRows}
            keyFor={r => r.id}
            empty="No companies yet."
            pageSize={6}
            columns={[
              { label: 'COMPANY', width: 145, render: r => <TCell text={r.company} strong /> },
              { label: 'RECEIVED', width: 110, right: true, render: r => <TCell text={inr(r.received)} right color={theme.success} /> },
              { label: 'CARRY FWD', width: 110, right: true, render: r => <TCell text={inr(r.carry)} right /> },
              { label: 'EXPENDITURE', width: 115, right: true, render: r => <TCell text={inr(r.expenditure)} right color={theme.danger} /> },
              {
                label: 'BALANCE', width: 110, right: true,
                render: r => <TCell text={inr(r.balance)} right strong color={r.balance >= 0 ? theme.success : theme.danger} />,
              },
              { label: 'PROJECTS', width: 80, right: true, render: r => <TCell text={String(r.projects)} right /> },
            ]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const Dot = ({ color }: { color: string }) => (
  <View style={[styles.dot, { backgroundColor: color }]} />
);

const Bar = ({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) => {
  // Bars share the SAME scale as the gridlines (full PLOT_H). Headroom for the
  // value label comes from TOP_PAD added above the top gridline, not from
  // shrinking the bar — so a bar lines up exactly with its axis value.
  const h = max > 0 ? (value / max) * PLOT_H : 0;
  return (
    <View style={styles.barCol}>
      {value > 0 && <Text style={styles.barValue}>{inrShort(value)}</Text>}
      <View
        style={[
          styles.bar,
          { height: value > 0 ? Math.max(4, h) : 0, backgroundColor: color },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 28, gap: 12 },
  grid: { flexDirection: 'row', gap: 12 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 4,
  },
  empty: {
    fontSize: 13,
    color: theme.faint,
    fontStyle: 'italic',
    marginTop: 8,
  },

  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 11.5, color: theme.muted, marginRight: 6 },
  dot: { width: 9, height: 9, borderRadius: 999 },

  chartHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },

  plot: {
    height: PLOT_H + AXIS_PAD + TOP_PAD,
    marginTop: 16,
    position: 'relative',
  },
  gridRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridLabel: { width: 34, fontSize: 9, color: theme.faint, fontWeight: '600' },
  gridLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.border,
  },

  barsRow: {
    position: 'absolute',
    left: 38,
    right: 4,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: PLOT_H + AXIS_PAD + TOP_PAD,
  },
  barPair: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: 18, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barValue: {
    fontSize: 8.5,
    fontWeight: '700',
    color: theme.muted,
    marginBottom: 3,
  },
  barLabel: {
    fontSize: 11,
    color: theme.muted,
    marginTop: 6,
    fontWeight: '700',
    height: AXIS_PAD - 6,
    textAlign: 'center',
  },

  // Pie
  pieWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 6,
  },
  pieLegend: { flex: 1, gap: 8 },
  pieLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pieLegendName: {
    flex: 1,
    fontSize: 12.5,
    color: theme.text,
    fontWeight: '600',
  },
  pieLegendPct: { fontSize: 12.5, color: theme.muted, fontWeight: '700' },

  // Company Fund Positions block: a title, the sort chips, then the shared table.
  tableSection: { marginTop: 16, gap: 10 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sortChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: theme.border, backgroundColor: '#fff',
  },
  sortChipOn: { backgroundColor: theme.primarySoft, borderColor: theme.primary },
  sortChipText: { fontSize: 11, fontWeight: '700', color: theme.muted },
  sortChipTextOn: { color: theme.primary },
});
