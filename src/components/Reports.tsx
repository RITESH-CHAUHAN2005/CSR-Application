// Screen 7 — Financial Reports (§5.8). Five tabs, switched by a horizontally-
// scrollable bar:
//   • Transaction Ledger  → every receipt & expenditure with a running balance
//   • Year-wise           → fund flow per financial year (bar + pie + table)
//   • Company-wise        → fund position per company    (bar + pie + table)
//   • Project-wise        → budget vs spend per project  (bar + status pie + table)
//   • Carry Forward       → one row per (Ongoing project × company), server-derived
//
// Two filters — Company and Financial Year — drive the charts, the totals AND the
// tables on every tab. On top of that, EVERY tab has its own search box: it sits
// top-left above the table on its own line, matches any text column on the row
// (Project ID, project name, company name), filters the TABLE ONLY (so the charts
// and totals don't shift on every keystroke), and is cleared when the tab changes.
//
// Money rules this screen must not get wrong (§2):
//   • Balance = Received − Expenditure. Carry Forward is a SLICE of it, never added.
//   • Carry forward is DERIVED server-side — never stored, never recomputed here.
//   • Year-wise columns CHAIN (each year's closing balance opens the next year), so
//     they are running positions and must never be summed down the column.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { shareDataUrl } from '../share';
import { Export } from 'phosphor-react-native/src/icons/Export';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { theme } from '../theme';
import { api } from '../api';
import {
  Card, CarryForwardRow, CodeBadge, Company, DataTable, DatePicker, Expenditure,
  FinancialYear, FundReceipt, Project, ProjectStatus,
  Header, Input, Modal, Notice, Pill, Select, TCell,
  projectStatusLabel, projectStatusTone, inr, inrShort, fmtNice,
} from '../../App';

type Props = {
  companies: Company[];
  years: FinancialYear[];
  projects: Project[];
  receipts: FundReceipt[];
  expenditures: Expenditure[];
  carryForward: CarryForwardRow[];
};

type TabKey = 'ledger' | 'year' | 'company' | 'project' | 'carry';
const SCREEN_W = Dimensions.get('window').width;

// The shared <DataTable> pins an optional `totalRow` under the last data row. The
// total is just another row of the same shape, tagged with this sentinel id so each
// column's `render` knows to print the total (or nothing) instead of a record value.
const TOTAL_ID = '__total__';
const isTotal = (r: { id?: string; key?: string }) => (r.id ?? r.key) === TOTAL_ID;

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const shortYear = (name: string) => name.replace(/^FY\s*/i, '').trim(); // "FY 2024-25" → "2024-25"
const niceMax = (v: number) => {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / p) * p;
};
// Does any text column on a row contain the query?
const matches = (q: string, fields: (string | undefined)[]) =>
  !q || fields.some(f => (f || '').toLowerCase().includes(q));

// Series colours (kept on the app's palette).
const C_RECEIVED = theme.primary; // indigo
const C_CARRY = theme.accent;     // teal
const C_SPENT = theme.danger;     // red
const C_BALANCE = theme.success;  // green

// Rotating slice palette for the donuts — stays inside the app's theme.
const PIE_COLORS = [theme.primary, theme.accent, theme.violet, theme.amber, theme.success, theme.danger];

export default function Reports({ companies, years, projects, receipts, expenditures, carryForward }: Props) {
  const [tab, setTab] = useState<TabKey>('ledger');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  // Optional date-range filter (themed calendar picker, ISO YYYY-MM-DD).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // The per-tab table search. Cleared whenever the tab changes — each tab searches
  // different columns, so a carried-over query just looks broken.
  const [q, setQ] = useState('');
  useEffect(() => { setQ(''); }, [tab]);
  const query = q.trim().toLowerCase();

  const inYear = useCallback((yid: string) => yearFilter === 'all' || yid === yearFilter, [yearFilter]);
  const inCo = useCallback((cid: string) => companyFilter === 'all' || cid === companyFilter, [companyFilter]);
  // A project may be funded by several companies — it passes the company filter
  // when ANY of its companyIds match the selection.
  const projInCo = useCallback((p: Project) => companyFilter === 'all' || p.companyIds.includes(companyFilter), [companyFilter]);
  // ISO date strings sort lexicographically, so plain string compare is enough.
  const inDate = useCallback((d: string) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate), [fromDate, toDate]);
  const companyName = useCallback((id: string) => companies.find(c => c.id === id)?.name || '—', [companies]);
  const yearName = useCallback((id: string) => years.find(y => y.id === id)?.name || '—', [years]);
  const project = useCallback((id: string) => projects.find(p => p.id === id), [projects]);
  const projectName = useCallback((id: string) => project(id)?.name || '—', [project]);
  const projectCode = useCallback((id: string) => project(id)?.projectCode || '', [project]);

  const companyOpts = [{ label: 'All Companies', value: 'all' }, ...companies.map(c => ({ label: c.name, value: c.id }))];
  const yearOpts = [{ label: 'All Years', value: 'all' }, ...years.map(y => ({ label: y.name, value: y.id }))];

  // Financial years in date order — the year-wise chain walks them in this order.
  const orderedYears = useMemo(
    () => [...years].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)),
    [years],
  );

  // ── Transaction Ledger ──
  // Merge receipts (+amount) and expenditures (−amount) that pass the filters, sort
  // by date ascending, then accumulate a running Total Balance.
  type LedgerRow = {
    id: string; type: 'Receipt' | 'Expenditure'; date: string;
    companyId: string; projectId: string; yearId: string;
    amount: number; balance: number;
  };
  const ledgerRows = useMemo<LedgerRow[]>(() => {
    const rx = receipts
      .filter(r => inCo(r.companyId) && inYear(r.yearId) && inDate(r.date))
      .map(r => ({
        id: 'r' + r.id, type: 'Receipt' as const, date: r.date, companyId: r.companyId,
        projectId: r.projectId, yearId: r.yearId, amount: r.amount, signed: r.amount,
      }));
    const ex = expenditures
      .filter(e => inCo(e.companyId) && inYear(e.yearId) && inDate(e.date))
      .map(e => ({
        id: 'e' + e.id, type: 'Expenditure' as const, date: e.date, companyId: e.companyId,
        projectId: e.projectId, yearId: e.yearId, amount: e.amount, signed: -e.amount,
      }));
    const all = [...rx, ...ex].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let running = 0;
    return all.map(x => {
      running += x.signed;
      return {
        id: x.id, type: x.type, date: x.date, companyId: x.companyId,
        projectId: x.projectId, yearId: x.yearId, amount: x.amount, balance: running,
      };
    });
  }, [receipts, expenditures, inCo, inYear, inDate]);

  // Totals reflect the Company/Year/date filters, NOT the search box.
  const ledgerIn = useMemo(() => sum(ledgerRows.filter(x => x.type === 'Receipt').map(x => x.amount)), [ledgerRows]);
  const ledgerOut = useMemo(() => sum(ledgerRows.filter(x => x.type === 'Expenditure').map(x => x.amount)), [ledgerRows]);
  const ledgerFinal = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].balance : 0;
  // The search narrows the TABLE only — the running balance stays the one computed
  // over the unsearched set, so a filtered view still shows each row's true position.
  const ledgerShown = useMemo(
    () => ledgerRows.filter(x => matches(query, [
      x.type, fmtNice(x.date), projectCode(x.projectId), projectName(x.projectId),
      companyName(x.companyId), yearName(x.yearId),
    ])),
    [ledgerRows, query, projectCode, projectName, companyName, yearName],
  );

  // ── Year-wise ──
  // Each year's closing balance CHAINS into the next year's Carry Forward In:
  //   totalAvailable = carryForwardIn + fundsReceived
  //   carryForwardOut = balance = totalAvailable − expenditure
  // These are RUNNING POSITIONS, not flows — summing them down a column is
  // meaningless, which is why the Total row leaves them blank.
  //
  // The chain is always walked over EVERY year in date order (never just the
  // filtered one) — otherwise the selected year would open at zero instead of at
  // the position it actually inherited.
  const yearRowsAll = useMemo(() => {
    let carryIn = 0;
    return orderedYears.map(y => {
      const received = sum(receipts.filter(r => r.yearId === y.id && inCo(r.companyId) && inDate(r.date)).map(r => r.amount));
      const spent = sum(expenditures.filter(e => e.yearId === y.id && inCo(e.companyId) && inDate(e.date)).map(e => e.amount));
      const available = carryIn + received;
      const balance = available - spent;
      const row = { id: y.id, name: y.name, received, carryIn, available, spent, balance, carryOut: balance };
      carryIn = balance;
      return row;
    });
  }, [orderedYears, receipts, expenditures, inCo, inDate]);

  const yearRows = useMemo(
    () => (yearFilter === 'all' ? yearRowsAll : yearRowsAll.filter(r => r.id === yearFilter)),
    [yearRowsAll, yearFilter],
  );
  const yearShown = useMemo(() => yearRows.filter(r => matches(query, [r.name])), [yearRows, query]);
  // Only the FLOW columns can be totalled. The running positions cannot.
  const yearTotals = useMemo(() => ({
    received: sum(yearRows.map(r => r.received)),
    spent: sum(yearRows.map(r => r.spent)),
  }), [yearRows]);

  // ── Company-wise ──
  // Balance = Received − Expenditure.  Carry Forward is a slice of that balance and
  // comes from the server-derived rows — it is NOT added to the balance.
  const companyRows = useMemo(() => {
    const list = companyFilter === 'all' ? companies : companies.filter(c => c.id === companyFilter);
    return list.map(c => {
      const received = sum(receipts.filter(r => r.companyId === c.id && inYear(r.yearId) && inDate(r.date)).map(r => r.amount));
      const spent = sum(expenditures.filter(e => e.companyId === c.id && inYear(e.yearId) && inDate(e.date)).map(e => e.amount));
      const carry = sum(carryForward.filter(r => r.companyId === c.id).map(r => r.carryForward));
      const projCount = projects.filter(p => p.companyIds.includes(c.id)).length;
      return { id: c.id, name: c.name, received, spent, balance: received - spent, carry, projCount };
    });
  }, [companies, projects, receipts, expenditures, carryForward, companyFilter, inYear, inDate]);

  const companyShown = useMemo(() => companyRows.filter(r => matches(query, [r.name])), [companyRows, query]);
  const companyTotals = useMemo(() => ({
    received: sum(companyRows.map(r => r.received)),
    spent: sum(companyRows.map(r => r.spent)),
    balance: sum(companyRows.map(r => r.balance)),
    carry: sum(companyRows.map(r => r.carry)),
    projCount: sum(companyRows.map(r => r.projCount)),
  }), [companyRows]);

  // ── Project-wise ──
  // "Received" is what the project's companies actually PAID INTO it — company
  // receipts only. An other_source receipt is income earned on the funds, never a
  // contribution, so it never counts here. Utilization is Spent ÷ BUDGET.
  const projectRows = useMemo(() => projects
    .filter(p => projInCo(p))
    .map(p => {
      const received = sum(receipts.filter(r => r.projectId === p.id && r.receiptType === 'company' && inCo(r.companyId) && inYear(r.yearId) && inDate(r.date)).map(r => r.amount));
      const spent = sum(expenditures.filter(e => e.projectId === p.id && inYear(e.yearId) && inCo(e.companyId) && inDate(e.date)).map(e => e.amount));
      const util = p.budget > 0 ? (spent / p.budget) * 100 : 0;
      const company = p.companyIds.map(companyName).join(', ') || '—';
      const period = `${fmtNice(p.startDate) || '—'} → ${p.endDate ? fmtNice(p.endDate) : '—'}`;
      return {
        id: p.id, code: p.projectCode, name: p.name, company,
        partner: p.interventionPartner, period, status: p.status,
        budget: p.budget, received, spent, util,
      };
    }), [projects, receipts, expenditures, projInCo, inCo, inYear, inDate, companyName]);

  const projectShown = useMemo(
    () => projectRows.filter(r => matches(query, [r.code, r.name, r.company, r.partner, r.period])),
    [projectRows, query],
  );
  const projectTotals = useMemo(() => ({
    budget: sum(projectRows.map(r => r.budget)),
    received: sum(projectRows.map(r => r.received)),
    spent: sum(projectRows.map(r => r.spent)),
  }), [projectRows]);

  // ── Carry Forward ──
  // Straight from GET /reports/carry-forward — one row per (Ongoing project ×
  // company), max(0, received − spent). Never recomputed here.
  const carryRows = useMemo(
    () => carryForward.filter(r => inCo(r.companyId)),
    [carryForward, inCo],
  );
  const carryShown = useMemo(
    () => carryRows.filter(r => matches(query, [r.projectCode, r.projectName, r.companyName])),
    [carryRows, query],
  );
  const carryTotals = useMemo(() => ({
    received: sum(carryRows.map(r => r.received)),
    spent: sum(carryRows.map(r => r.spent)),
    carryForward: sum(carryRows.map(r => r.carryForward)),
  }), [carryRows]);

  // "Rolls Into" — the next financial year whose start falls after the project's end.
  const rollsInto = useCallback((projectId: string) => {
    const end = project(projectId)?.endDate;
    if (!end) return 'Next FY';
    const next = orderedYears.find(y => y.start && y.start > end);
    return next ? next.name : 'Next FY';
  }, [project, orderedYears]);

  // An Ongoing project with NO receipt linked to it can have no carry forward —
  // nothing is broken, there is simply nothing to compute. Say so explicitly, or
  // users will assume the figure is wrong.
  const ongoingWithoutReceipts = useMemo(() => projects
    .filter(p => p.derivedStatus === 'ongoing' && projInCo(p))
    .filter(p => !receipts.some(r => r.projectId === p.id && r.receiptType === 'company'))
    .map(p => p.projectCode || p.name),
    [projects, receipts, projInCo]);

  // ── Charts ── (driven by the dropdowns only — never by the search box)
  const buildGrouped = (groups: { label: string; bars: { value: number; color: string }[] }[]) => {
    const out: any[] = [];
    groups.forEach(g => {
      // Centre the group label under its middle bar, whatever the bar count.
      const mid = Math.floor((g.bars.length - 1) / 2);
      g.bars.forEach((b, i) => {
        const last = i === g.bars.length - 1;
        out.push({
          value: Math.max(0, b.value),
          frontColor: b.color,
          spacing: last ? 22 : 3,
          label: i === mid ? shortYear(g.label) : undefined,
          labelWidth: i === mid ? 64 : undefined,
          labelTextStyle: i === mid ? styles.barLabel : undefined,
        });
      });
    });
    return out;
  };

  const ledgerChart = useMemo(() => [
    { value: Math.max(0, ledgerIn), frontColor: C_RECEIVED, label: 'Money In', labelWidth: 80, labelTextStyle: styles.barLabel, spacing: 40 },
    { value: Math.max(0, ledgerOut), frontColor: C_SPENT, label: 'Money Out', labelWidth: 80, labelTextStyle: styles.barLabel },
  ], [ledgerIn, ledgerOut]);
  const ledgerMax = niceMax(Math.max(1, ledgerIn, ledgerOut));
  const ledgerYLabels = Array.from({ length: 5 }, (_, i) => inrShort((ledgerMax * i) / 4));

  // Carry Forward tab — three simple bars: Received, Spent, Carry Forward.
  const carryChart = useMemo(() => [
    { value: Math.max(0, carryTotals.received), frontColor: C_RECEIVED, label: 'Received', labelWidth: 90, labelTextStyle: styles.barLabel, spacing: 40 },
    { value: Math.max(0, carryTotals.spent), frontColor: C_SPENT, label: 'Spent', labelWidth: 90, labelTextStyle: styles.barLabel, spacing: 40 },
    { value: Math.max(0, carryTotals.carryForward), frontColor: C_CARRY, label: 'Carry Forward', labelWidth: 90, labelTextStyle: styles.barLabel },
  ], [carryTotals]);
  const carryMax = niceMax(Math.max(1, carryTotals.received, carryTotals.spent, carryTotals.carryForward));
  const carryYLabels = Array.from({ length: 5 }, (_, i) => inrShort((carryMax * i) / 4));

  // Donut — each project's share of the total carry forward.
  const carryPie = useMemo(() => {
    const byProject = new Map<string, { value: number; name: string }>();
    carryRows.forEach(r => {
      if (r.carryForward <= 0) return;
      const prev = byProject.get(r.projectId);
      byProject.set(r.projectId, {
        value: (prev?.value || 0) + r.carryForward,
        name: r.projectCode || r.projectName,
      });
    });
    return Array.from(byProject.values()).map((s, i) => ({
      value: s.value, color: PIE_COLORS[i % PIE_COLORS.length], name: s.name,
    }));
  }, [carryRows]);
  const carryPieTotal = sum(carryPie.map(s => s.value));

  const yearChart = useMemo(() => buildGrouped(yearRows.map(r => ({
    label: r.name,
    bars: [
      { value: r.received, color: C_RECEIVED },
      { value: r.carryIn, color: C_CARRY },
      { value: r.spent, color: C_SPENT },
    ],
  }))), [yearRows]);

  const companyChart = useMemo(() => buildGrouped(companyRows.map(r => ({
    label: r.name,
    bars: [
      { value: r.received, color: C_RECEIVED },
      { value: r.spent, color: C_SPENT },
      { value: Math.max(0, r.balance), color: C_BALANCE },
    ],
  }))), [companyRows]);

  // Budget-vs-Spent bar — top 10 projects by budget, labelled by Project ID.
  const projectChartRows = useMemo(() => [...projectRows].sort((a, b) => b.budget - a.budget).slice(0, 10), [projectRows]);
  const projectChart = useMemo(() => buildGrouped(projectChartRows.map(r => ({
    label: r.code || r.name,
    bars: [
      { value: r.budget, color: C_RECEIVED },
      { value: r.spent, color: C_SPENT },
    ],
  }))), [projectChartRows]);

  // Each group ≈ 70px — scroll horizontally once there are more bars than fit,
  // instead of squeezing every one of them.
  const projectChartWidth = Math.max(SCREEN_W - 96, projectChartRows.length * 70 + 14);
  const yearChartWidth = Math.max(SCREEN_W - 96, yearRows.length * 70 + 14);
  const companyChartWidth = Math.max(SCREEN_W - 96, companyRows.length * 70 + 14);

  const activeChart = tab === 'year' ? yearChart : companyChart;
  const chartMax = niceMax(Math.max(1, ...activeChart.map(d => d.value)));
  const yLabels = Array.from({ length: 5 }, (_, i) => inrShort((chartMax * i) / 4));

  const projectChartMax = niceMax(Math.max(1, ...projectChart.map(d => d.value)));
  const projectYLabels = Array.from({ length: 5 }, (_, i) => inrShort((projectChartMax * i) / 4));

  // Donut — share of total funds received, by company.
  const companyPie = useMemo(() => companyRows
    .filter(r => r.received > 0)
    .map((r, i) => ({ value: r.received, color: PIE_COLORS[i % PIE_COLORS.length], name: r.name })),
    [companyRows]);
  const pieTotal = sum(companyPie.map(s => s.value));

  // Donut — share of expenditure, by financial year.
  const yearPie = useMemo(() => yearRows
    .filter(r => r.spent > 0)
    .map((r, i) => ({ value: r.spent, color: PIE_COLORS[i % PIE_COLORS.length], name: r.name })),
    [yearRows]);
  const yearPieTotal = sum(yearPie.map(s => s.value));

  // Donut — projects grouped by status.
  const statusPie = useMemo(() => {
    const order: ProjectStatus[] = ['active', 'completed', 'on_hold', 'cancelled'];
    const counts = new Map<ProjectStatus, number>();
    projectRows.forEach(r => counts.set(r.status, (counts.get(r.status) || 0) + 1));
    return order
      .filter(s => (counts.get(s) || 0) > 0)
      .map((s, i) => ({ value: counts.get(s) as number, color: PIE_COLORS[i % PIE_COLORS.length], name: projectStatusLabel(s) }));
  }, [projectRows]);
  const statusPieTotal = sum(statusPie.map(s => s.value));

  // ── Export ──
  // The FILE IS BUILT BY THE SERVER (GET /reports/export/{pdf|excel}?type=…), so an
  // exported report always matches what the website produces for the same tab. The
  // bytes come back through axios (which sends the auth header) and go straight to
  // the OS share sheet — WhatsApp, Gmail, Drive, Files…
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const onExport = async (kind: 'pdf' | 'excel') => {
    if (exporting) return;
    setExporting(true);
    try {
      const type = tab === 'carry' ? 'carryForward' : tab;
      const { dataUrl, mime, filename } = await api.reportExportFile(kind, type);
      setExportOpen(false);
      await shareDataUrl(dataUrl, filename, mime);
    } catch (e: any) {
      // A dismissed share sheet is not an error.
      if (!/cancel/i.test(String(e?.message || ''))) {
        Alert.alert('Export failed', e?.message || 'Could not generate the report. Please try again.');
      }
    } finally {
      setExporting(false);
    }
  };

  // Every table pages back to 1 whenever the tab, a filter or the search changes.
  const resetKey = `${tab}|${companyFilter}|${yearFilter}|${fromDate}|${toDate}|${q}`;

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'ledger', label: 'Transaction Ledger' },
    { key: 'year', label: 'Year-wise' },
    { key: 'company', label: 'Company-wise' },
    { key: 'project', label: 'Project-wise' },
    { key: 'carry', label: 'Carry Forward' },
  ];

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Financial Reports"
        subtitle="Fund analytics & exports"
        action={
          <Pressable onPress={() => setExportOpen(true)} disabled={exporting}
            style={({ pressed }) => [styles.exportBtn, (pressed || exporting) && { opacity: 0.7 }]}>
            <Export size={15} color={theme.primary} weight="bold" />
            <Text style={styles.exportText}>{exporting ? 'Exporting…' : 'Export'}</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Filters — Company and Financial Year drive the charts, the totals and the
            tables on every tab. */}
        <Card style={styles.filterCard}>
          <View style={styles.filterRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.filterLabel}>COMPANY</Text>
              <Select value={companyFilter} options={companyOpts} onChange={setCompanyFilter} placeholder="All Companies" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.filterLabel}>FINANCIAL YEAR</Text>
              <Select value={yearFilter} options={yearOpts} onChange={setYearFilter} placeholder="All Years" />
            </View>
          </View>
          <View style={[styles.filterRow, { marginTop: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.filterLabel}>FROM DATE</Text>
              <DatePicker value={fromDate} onChange={setFromDate} placeholder="Any" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.filterLabel}>TO DATE</Text>
              <DatePicker value={toDate} onChange={setToDate} placeholder="Any" />
            </View>
          </View>
          {(fromDate || toDate) ? (
            <Pressable onPress={() => { setFromDate(''); setToDate(''); }} hitSlop={6} style={styles.clearDates}>
              <Text style={styles.clearDatesText}>Clear dates</Text>
            </Pressable>
          ) : null}
        </Card>

        {/* Five tabs, so the bar scrolls horizontally */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segment}>
          {TABS.map(t => {
            const on = tab === t.key;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.segBtn, on && styles.segBtnOn]}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── TRANSACTION LEDGER ── */}
        {tab === 'ledger' && (
          <>
            <Card style={styles.chartCard}>
              <Text style={styles.chartTitle}>Money In vs Money Out</Text>
              <View style={styles.legendRow}>
                <Legend color={C_RECEIVED} text="Money In" />
                <Legend color={C_SPENT} text="Money Out" />
              </View>
              {ledgerRows.length === 0
                ? <Text style={styles.noData}>No transactions for this selection.</Text>
                : (
                  // `roundedTop` rounds by half the bar width — on these wide bars that
                  // domed the top into a circle. Use a small square-ish corner instead.
                  <BarChart data={ledgerChart} barWidth={46} initialSpacing={34} barBorderTopLeftRadius={4} barBorderTopRightRadius={4} maxValue={ledgerMax} noOfSections={4} yAxisLabelTexts={ledgerYLabels} yAxisLabelWidth={46} yAxisTextStyle={styles.axisText} yAxisColor={theme.border} xAxisColor={theme.border} rulesColor={theme.border} height={180} isAnimated />
                )}
            </Card>

            <TableHead
              q={q} onQ={setQ}
              totals={`Money In: ${inr(ledgerIn)} · Money Out: ${inr(ledgerOut)} · Closing Balance: ${inr(ledgerFinal)}`}
            />
            <DataTable
              rows={ledgerShown}
              keyFor={x => x.id}
              empty="No transactions match the selected filters."
              resetKey={resetKey}
              columns={[
                {
                  label: 'TYPE', width: 92,
                  render: x => <TCell text={x.type} strong color={x.type === 'Receipt' ? theme.success : theme.danger} />,
                },
                { label: 'DATE', width: 92, render: x => <TCell text={fmtNice(x.date)} /> },
                { label: 'PROJECT ID', width: 100, render: x => (x.projectId ? <CodeBadge code={projectCode(x.projectId)} /> : <TCell text="—" />) },
                { label: 'PROJECT', width: 130, render: x => <TCell text={x.projectId ? projectName(x.projectId) : '—'} /> },
                { label: 'COMPANY', width: 120, render: x => <TCell text={companyName(x.companyId)} /> },
                { label: 'FY', width: 80, render: x => <TCell text={shortYear(yearName(x.yearId))} /> },
                {
                  label: 'AMOUNT', width: 110, right: true,
                  render: x => <TCell text={inr(x.amount)} right color={x.type === 'Receipt' ? theme.success : theme.danger} />,
                },
                {
                  label: 'BALANCE', width: 115, right: true,
                  render: x => <TCell text={inr(x.balance)} right strong color={x.balance < 0 ? theme.danger : theme.success} />,
                },
              ]}
            />
          </>
        )}

        {/* ── YEAR-WISE ── */}
        {tab === 'year' && (
          <>
            <Card style={styles.chartCard}>
              <Text style={styles.chartTitle}>Fund Flow by Financial Year</Text>
              <View style={styles.legendRow}>
                <Legend color={C_RECEIVED} text="Received" />
                <Legend color={C_CARRY} text="Carry In" />
                <Legend color={C_SPENT} text="Expenditure" />
              </View>
              {yearChart.length === 0
                ? <Text style={styles.noData}>No data for this selection.</Text>
                : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <BarChart data={yearChart} barWidth={14} initialSpacing={14} roundedTop maxValue={chartMax} noOfSections={4} yAxisLabelTexts={yLabels} yAxisLabelWidth={46} yAxisTextStyle={styles.axisText} yAxisColor={theme.border} xAxisColor={theme.border} rulesColor={theme.border} height={180} width={yearChartWidth} isAnimated />
                  </ScrollView>
                )}
            </Card>

            <Card style={styles.chartCard}>
              <Text style={styles.chartTitle}>Expenditure Share by Year</Text>
              {yearPie.length === 0 ? (
                <Text style={styles.noData}>No expenditure for this selection.</Text>
              ) : (
                <Donut slices={yearPie} total={yearPieTotal} cap="SPENT" centre={inrShort(yearPieTotal)} />
              )}
            </Card>

            <TableHead
              q={q} onQ={setQ}
              totals={`Total Received: ${inr(yearTotals.received)} · Expenditure: ${inr(yearTotals.spent)}`}
            />
            <DataTable
              rows={yearShown}
              keyFor={r => r.id}
              empty="No fund activity matches the selected filters."
              resetKey={resetKey}
              // Only the FLOW columns are totalled. Carry In / Available / Balance /
              // Carry Out are running positions — summing them would be meaningless.
              totalRow={{
                id: TOTAL_ID, name: 'Total',
                received: yearTotals.received, spent: yearTotals.spent,
                carryIn: 0, available: 0, balance: 0, carryOut: 0,
              }}
              columns={[
                { label: 'FINANCIAL YEAR', width: 110, render: r => <TCell text={r.name} strong /> },
                { label: 'FUNDS RECEIVED', width: 110, right: true, render: r => <TCell text={inr(r.received)} right strong={isTotal(r)} /> },
                { label: 'CARRY FWD IN', width: 110, right: true, render: r => <TCell text={isTotal(r) ? '—' : inr(r.carryIn)} right /> },
                { label: 'TOTAL AVAILABLE', width: 115, right: true, render: r => <TCell text={isTotal(r) ? '—' : inr(r.available)} right /> },
                { label: 'EXPENDITURE', width: 110, right: true, render: r => <TCell text={inr(r.spent)} right color={theme.danger} strong={isTotal(r)} /> },
                {
                  label: 'BALANCE', width: 110, right: true,
                  render: r => (isTotal(r)
                    ? <TCell text="—" right />
                    : <TCell text={inr(r.balance)} right color={r.balance < 0 ? theme.danger : theme.success} />),
                },
                { label: 'CARRY FWD OUT', width: 110, right: true, render: r => <TCell text={isTotal(r) ? '—' : inr(r.carryOut)} right /> },
              ]}
            />
          </>
        )}

        {/* ── COMPANY-WISE ── */}
        {tab === 'company' && (
          <>
            <Card style={styles.chartCard}>
              <Text style={styles.chartTitle}>Fund Position by Company</Text>
              <View style={styles.legendRow}>
                <Legend color={C_RECEIVED} text="Received" />
                <Legend color={C_SPENT} text="Expenditure" />
                <Legend color={C_BALANCE} text="Balance" />
              </View>
              {companyChart.length === 0
                ? <Text style={styles.noData}>No data for this selection.</Text>
                : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <BarChart data={companyChart} barWidth={14} initialSpacing={14} roundedTop maxValue={chartMax} noOfSections={4} yAxisLabelTexts={yLabels} yAxisLabelWidth={46} yAxisTextStyle={styles.axisText} yAxisColor={theme.border} xAxisColor={theme.border} rulesColor={theme.border} height={180} width={companyChartWidth} isAnimated />
                  </ScrollView>
                )}
            </Card>

            <Card style={styles.chartCard}>
              <Text style={styles.chartTitle}>Fund Distribution by Company</Text>
              {companyPie.length === 0 ? (
                <Text style={styles.noData}>No fund receipts for this selection.</Text>
              ) : (
                <Donut slices={companyPie} total={pieTotal} cap="TOTAL" centre={inrShort(pieTotal)} />
              )}
            </Card>

            <TableHead
              q={q} onQ={setQ}
              totals={`Total Received: ${inr(companyTotals.received)} · Expenditure: ${inr(companyTotals.spent)} · Balance: ${inr(companyTotals.balance)} · Carry Forward: ${inr(companyTotals.carry)}`}
              note="Balance is Received − Expenditure. Carry Forward is the unspent part of what was received against Ongoing projects — a slice of that balance, not an addition to it."
            />
            <DataTable
              rows={companyShown}
              keyFor={r => r.id}
              empty="No fund activity matches the selected filters."
              resetKey={resetKey}
              totalRow={{ id: TOTAL_ID, name: 'Total', ...companyTotals }}
              columns={[
                { label: 'COMPANY', width: 140, render: r => <TCell text={r.name} strong /> },
                { label: 'TOTAL RECEIVED', width: 115, right: true, render: r => <TCell text={inr(r.received)} right color={theme.success} strong={isTotal(r)} /> },
                { label: 'EXPENDITURE', width: 115, right: true, render: r => <TCell text={inr(r.spent)} right color={theme.danger} strong={isTotal(r)} /> },
                {
                  label: 'BALANCE', width: 110, right: true,
                  render: r => <TCell text={inr(r.balance)} right strong color={r.balance < 0 ? theme.danger : theme.success} />,
                },
                { label: 'CARRY FORWARD', width: 115, right: true, render: r => <TCell text={inr(r.carry)} right color={theme.accent} strong={isTotal(r)} /> },
                { label: 'PROJECTS', width: 90, right: true, render: r => <TCell text={String(r.projCount)} right strong={isTotal(r)} /> },
              ]}
            />
          </>
        )}

        {/* ── PROJECT-WISE ── */}
        {tab === 'project' && (
          <>
            <Card style={styles.chartCard}>
              <Text style={styles.chartTitle}>Budget vs Expenditure by Project</Text>
              <Text style={styles.chartSub}>Top 10 by budget, labelled by Project ID</Text>
              <View style={styles.legendRow}>
                <Legend color={C_RECEIVED} text="Budget" />
                <Legend color={C_SPENT} text="Expenditure" />
              </View>
              {projectChart.length === 0
                ? <Text style={styles.noData}>No data for this selection.</Text>
                : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <BarChart data={projectChart} barWidth={14} initialSpacing={14} roundedTop maxValue={projectChartMax} noOfSections={4} yAxisLabelTexts={projectYLabels} yAxisLabelWidth={46} yAxisTextStyle={styles.axisText} yAxisColor={theme.border} xAxisColor={theme.border} rulesColor={theme.border} height={180} width={projectChartWidth} isAnimated />
                  </ScrollView>
                )}
            </Card>

            <Card style={styles.chartCard}>
              <Text style={styles.chartTitle}>Projects by Status</Text>
              {statusPie.length === 0 ? (
                <Text style={styles.noData}>No projects for this selection.</Text>
              ) : (
                <Donut slices={statusPie} total={statusPieTotal} cap="PROJECTS" centre={String(statusPieTotal)} />
              )}
            </Card>

            <TableHead
              q={q} onQ={setQ}
              totals={`Budget: ${inr(projectTotals.budget)} · Received: ${inr(projectTotals.received)} · Spent: ${inr(projectTotals.spent)}`}
            />
            <DataTable
              rows={projectShown}
              keyFor={r => r.id}
              empty="No projects match the selected filters."
              resetKey={resetKey}
              totalRow={{
                id: TOTAL_ID, code: '', name: 'Total', company: '', partner: '', period: '',
                status: 'active' as ProjectStatus,
                budget: projectTotals.budget, received: projectTotals.received, spent: projectTotals.spent, util: 0,
              }}
              columns={[
                { label: 'PROJECT ID', width: 100, render: r => (isTotal(r) ? <TCell text="" /> : <CodeBadge code={r.code} />) },
                { label: 'PROJECT', width: 140, render: r => <TCell text={r.name} strong /> },
                { label: 'COMPANY', width: 120, render: r => <TCell text={isTotal(r) ? '' : r.company} /> },
                { label: 'INTERVENTION PARTNER', width: 140, render: r => <TCell text={isTotal(r) ? '' : (r.partner || '—')} /> },
                // The period is a date RANGE — give it two lines rather than a very wide column.
                { label: 'PERIOD', width: 120, render: r => <TCell text={isTotal(r) ? '' : r.period} lines={2} /> },
                { label: 'BUDGET', width: 105, right: true, render: r => <TCell text={inr(r.budget)} right strong={isTotal(r)} /> },
                { label: 'RECEIVED', width: 105, right: true, render: r => <TCell text={inr(r.received)} right color={theme.success} strong={isTotal(r)} /> },
                { label: 'SPENT', width: 105, right: true, render: r => <TCell text={inr(r.spent)} right color={theme.danger} strong={isTotal(r)} /> },
                {
                  label: 'UTILIZATION %', width: 105, right: true,
                  render: r => (isTotal(r)
                    ? <TCell text="" right />
                    : <TCell text={`${r.util.toFixed(1)}%`} right strong color={r.util > 90 ? theme.danger : theme.success} />),
                },
                {
                  label: 'STATUS', width: 110,
                  render: r => (isTotal(r) ? <TCell text="" /> : <Pill text={projectStatusLabel(r.status)} tone={projectStatusTone(r.status)} />),
                },
              ]}
            />
          </>
        )}

        {/* ── CARRY FORWARD ── */}
        {tab === 'carry' && (
          <>
            <Card style={styles.chartCard}>
              <Text style={styles.chartTitle}>Received vs Spent vs Carry Forward</Text>
              <View style={styles.legendRow}>
                <Legend color={C_RECEIVED} text="Received" />
                <Legend color={C_SPENT} text="Spent" />
                <Legend color={C_CARRY} text="Carry Forward" />
              </View>
              {carryRows.length === 0
                ? <Text style={styles.noData}>No carry forward for this selection.</Text>
                : (
                  <BarChart data={carryChart} barWidth={46} initialSpacing={34} barBorderTopLeftRadius={4} barBorderTopRightRadius={4} maxValue={carryMax} noOfSections={4} yAxisLabelTexts={carryYLabels} yAxisLabelWidth={46} yAxisTextStyle={styles.axisText} yAxisColor={theme.border} xAxisColor={theme.border} rulesColor={theme.border} height={180} isAnimated />
                )}
            </Card>

            <Card style={styles.chartCard}>
              <Text style={styles.chartTitle}>Carry Forward by Project</Text>
              {carryPie.length === 0 ? (
                <Text style={styles.noData}>No carry forward for this selection.</Text>
              ) : (
                <Donut slices={carryPie} total={carryPieTotal} cap="CARRY FWD" centre={inrShort(carryPieTotal)} />
              )}
            </Card>

            {ongoingWithoutReceipts.length > 0 && (
              <Notice
                text={
                  `No carry forward can be computed for ${ongoingWithoutReceipts.length} Ongoing ` +
                  `project${ongoingWithoutReceipts.length === 1 ? '' : 's'} ` +
                  `(${ongoingWithoutReceipts.slice(0, 4).join(', ')}${ongoingWithoutReceipts.length > 4 ? '…' : ''}) — ` +
                  'no fund receipt is linked to them. Link a receipt to the project and the figure will appear.'
                }
              />
            )}

            <TableHead
              q={q} onQ={setQ}
              totals={`Received: ${inr(carryTotals.received)} · Spent: ${inr(carryTotals.spent)} · Carry Forward: ${inr(carryTotals.carryForward)}`}
            />
            <DataTable
              rows={carryShown}
              keyFor={r => `${r.projectId}_${r.companyId}`}
              empty="No Ongoing project with a linked receipt matches the selected filters."
              resetKey={resetKey}
              columns={[
                { label: 'PROJECT ID', width: 100, render: r => <CodeBadge code={r.projectCode} /> },
                { label: 'PROJECT', width: 150, render: r => <TCell text={r.projectName} strong /> },
                { label: 'COMPANY', width: 130, render: r => <TCell text={r.companyName} /> },
                { label: 'RECEIVED', width: 110, right: true, render: r => <TCell text={inr(r.received)} right color={theme.success} /> },
                {
                  label: 'SPENT', width: 110, right: true,
                  // A project that has out-spent its linked receipts carries nothing
                  // forward — the shortfall shows here as spent > received.
                  render: r => <TCell text={inr(r.spent)} right color={theme.danger} strong={r.spent > r.received} />,
                },
                { label: 'CARRY FORWARD', width: 120, right: true, render: r => <TCell text={inr(r.carryForward)} right strong color={theme.accent} /> },
                { label: 'ROLLS INTO', width: 110, render: r => <TCell text={rollsInto(r.projectId)} /> },
              ]}
            />
          </>
        )}
      </ScrollView>

      {/* Export — the server builds the file, so it matches the website exactly. */}
      <Modal visible={exportOpen} title="Export this report" onClose={() => setExportOpen(false)}>
        <Text style={styles.exportNote}>
          The file is generated by the server from the same figures you see here, then handed
          to your share sheet.
        </Text>
        <Pressable onPress={() => onExport('pdf')} disabled={exporting} style={({ pressed }) => [styles.exportOpt, pressed && { opacity: 0.85 }]}>
          <Text style={styles.exportOptTitle}>PDF</Text>
          <Text style={styles.exportOptSub}>A formatted, printable report</Text>
        </Pressable>
        <Pressable onPress={() => onExport('excel')} disabled={exporting} style={({ pressed }) => [styles.exportOpt, pressed && { opacity: 0.85 }]}>
          <Text style={styles.exportOptTitle}>Excel</Text>
          <Text style={styles.exportOptSub}>A spreadsheet you can keep working in</Text>
        </Pressable>
        {exporting && <Text style={styles.exportBusy}>Generating…</Text>}
      </Modal>
    </View>
  );
}

// What sits ABOVE every table: the search box on its own line, top-left; then the
// totals and the explanatory note at full width, where they have the room to stay
// readable. (Squeezing them in beside a right-hand search box wraps them into a mess.)
//
// Defined at module scope, NOT inside Reports — a component created during render is
// a brand-new type on every render, so React would tear down and rebuild the subtree
// each keystroke and the search field would lose focus and dismiss the keyboard.
const TableHead = ({
  q, onQ, totals, note,
}: { q: string; onQ: (s: string) => void; totals: string; note?: string }) => (
  <View style={styles.tableHead}>
    <View style={styles.searchBox}>
      <MagnifyingGlass size={16} color={theme.faint} />
      <Input value={q} onChangeText={onQ} placeholder="Search…" style={styles.searchInput} />
    </View>
    <Text style={styles.totalsLine}>{totals}</Text>
    {!!note && <Text style={styles.noteLine}>{note}</Text>}
  </View>
);

// A donut + its legend — the same shape on three tabs.
const Donut = ({
  slices, total, cap, centre,
}: {
  slices: { value: number; color: string; name: string }[];
  total: number; cap: string; centre: string;
}) => (
  <View style={styles.pieWrap}>
    <PieChart
      donut
      data={slices.map(s => ({ value: s.value, color: s.color }))}
      radius={78}
      innerRadius={50}
      innerCircleColor={theme.surface}
      centerLabelComponent={() => (
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.pieCenterCap}>{cap}</Text>
          <Text style={styles.pieCenterVal}>{centre}</Text>
        </View>
      )}
    />
    <View style={styles.pieLegend}>
      {slices.map(s => (
        <View key={s.name} style={styles.pieLegendRow}>
          <View style={[styles.dot, { backgroundColor: s.color }]} />
          <Text style={styles.pieLegendName} numberOfLines={1}>{s.name}</Text>
          <Text style={styles.pieLegendPct}>{total ? Math.round((s.value / total) * 100) : 0}%</Text>
        </View>
      ))}
    </View>
  </View>
);

const Legend = ({ color, text }: { color: string; text: string }) => (
  <View style={styles.legendItem}>
    <View style={[styles.dot, { backgroundColor: color }]} />
    <Text style={styles.legendText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 28, gap: 12 },

  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999 },
  exportText: { color: theme.primary, fontWeight: '800', fontSize: 13 },
  exportNote: { fontSize: 12.5, color: theme.muted, fontWeight: '500', lineHeight: 18, marginBottom: 14 },
  exportOpt: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 14,
    backgroundColor: '#f7f8fd', padding: 14, marginBottom: 10,
  },
  exportOptTitle: { fontSize: 15, fontWeight: '800', color: theme.primary },
  exportOptSub: { fontSize: 12, color: theme.muted, fontWeight: '500', marginTop: 2 },
  exportBusy: { fontSize: 12.5, color: theme.muted, fontWeight: '600', textAlign: 'center', paddingTop: 4 },

  filterCard: { paddingVertical: 14 },
  filterRow: { flexDirection: 'row', gap: 12 },
  filterLabel: { fontSize: 9.5, color: theme.faint, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },

  // Five tabs — the bar scrolls horizontally so labels stay full-width & tappable.
  segment: { flexDirection: 'row', backgroundColor: '#ecedf6', borderRadius: 12, padding: 4, gap: 4 },
  segBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff', shadowColor: '#1e1b4b', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText: { fontSize: 12.5, fontWeight: '700', color: theme.muted },
  segTextOn: { color: theme.primary },

  // Above every table: the search box on its OWN LINE, top-left; then the totals
  // and the explanatory note at full width, where they stay readable.
  tableHead: { gap: 8, marginBottom: 2 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    minWidth: 200, maxWidth: 320,
    backgroundColor: '#fff', borderRadius: 12, paddingLeft: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  searchInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', minHeight: 42, paddingVertical: 8 },
  totalsLine: { fontSize: 12.5, color: theme.text, fontWeight: '700', lineHeight: 18 },
  noteLine: { fontSize: 11.5, color: theme.faint, fontWeight: '500', lineHeight: 16 },

  chartCard: { gap: 6 },
  chartTitle: { fontSize: 15, fontWeight: '800', color: theme.text, marginBottom: 8 },
  chartSub: { fontSize: 11.5, color: theme.faint, fontWeight: '600', marginTop: -6, marginBottom: 4 },
  axisText: { fontSize: 9.5, color: theme.faint },
  barLabel: { fontSize: 10, color: theme.muted, fontWeight: '700' },
  noData: { fontSize: 13, color: theme.faint, paddingVertical: 18, textAlign: 'center' },

  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 10, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 12, color: theme.muted, fontWeight: '600' },
  dot: { width: 11, height: 11, borderRadius: 3 },

  clearDates: { alignSelf: 'flex-end', marginTop: 10 },
  clearDatesText: { fontSize: 12.5, color: theme.danger, fontWeight: '700' },

  // Donut
  pieWrap: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  pieCenterCap: { fontSize: 9, color: theme.faint, fontWeight: '700', letterSpacing: 0.5 },
  pieCenterVal: { fontSize: 15, color: theme.text, fontWeight: '800', marginTop: 1 },
  pieLegend: { flex: 1, gap: 8 },
  pieLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pieLegendName: { flex: 1, fontSize: 12.5, color: theme.text, fontWeight: '600' },
  pieLegendPct: { fontSize: 12.5, color: theme.muted, fontWeight: '700' },
});
