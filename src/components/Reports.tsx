// Screen 7 — Financial Reports. Mirrors the web app's /reports page with five
// summary views, switched by a horizontally-scrollable tab bar:
//   • Transaction Ledger    → every receipt & expenditure with a running balance
//   • Year-wise Summary     → fund flow per financial year (bar chart + table)
//   • Company-wise Summary  → fund position per company   (bar chart + table)
//   • Project-wise Summary  → budget vs spend per project (bar + status pie + table)
//   • Carry Forward         → per-company carry-forward share of ongoing projects
//
// Built with the requested RN libraries, but tuned to feel native:
//   • react-native-gifted-charts   → grouped bar charts
//   • react-native-paper DataTable → the report tables (horizontally scrollable
//                                     so the wide multi-column tables fit a phone)
//   • the app's own <Select>       → the Company / Year filters, so the dropdown
//                                     opens as a sheet exactly like every other page
// Colours come from the existing app theme.
import React, { useCallback, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { DataTable, MD3LightTheme, Provider as PaperProvider } from 'react-native-paper';
import { generatePDF } from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import { Export } from 'phosphor-react-native/src/icons/Export';
import { theme } from '../theme';
import {
  Card, Company, DatePicker, EmptyState, Expenditure, FinancialYear, FundReceipt, Project, ProjectStatus,
  Header, Pill, Select, projectStatusLabel, projectStatusTone, inr, inrShort, fmtNice, fmtDateTime,
} from '../../App';

type Props = {
  companies: Company[];
  years: FinancialYear[];
  projects: Project[];
  receipts: FundReceipt[];
  expenditures: Expenditure[];
};

type TabKey = 'ledger' | 'year' | 'company' | 'project' | 'carry';
const SCREEN_W = Dimensions.get('window').width;

// Paper's DataTable reads colours from its theme context — align them with ours.
const paperTheme = {
  ...MD3LightTheme,
  colors: { ...MD3LightTheme.colors, primary: theme.primary, onSurface: theme.text, onSurfaceVariant: theme.muted },
};

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const shortYear = (name: string) => name.replace(/^FY\s*/i, '').trim(); // "FY 2024-25" → "2024-25"
const niceMax = (v: number) => {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / p) * p;
};

// Series colours (kept on the app's palette).
const C_RECEIVED = theme.primary; // indigo
const C_CARRY = theme.accent;     // teal
const C_SPENT = theme.danger;     // red
const C_BALANCE = theme.success;  // green

// Rotating slice palette for the donut — stays inside the app's theme.
const PIE_COLORS = [theme.primary, theme.accent, theme.violet, theme.amber, theme.success, theme.danger];

export default function Reports({ companies, years, projects, receipts, expenditures }: Props) {
  const [tab, setTab] = useState<TabKey>('ledger');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  // Optional date-range filter (themed flatpickr-style picker, ISO YYYY-MM-DD).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const inYear = useCallback((yid: string) => yearFilter === 'all' || yid === yearFilter, [yearFilter]);
  const inCo = useCallback((cid: string) => companyFilter === 'all' || cid === companyFilter, [companyFilter]);
  // A project may fund from several companies now — it passes the company filter
  // when ANY of its companyIds match the selection.
  const projInCo = useCallback((p: Project) => companyFilter === 'all' || p.companyIds.includes(companyFilter), [companyFilter]);
  // ISO date strings sort lexicographically, so plain string compare is enough.
  const inDate = useCallback((d: string) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate), [fromDate, toDate]);
  const companyName = useCallback((id: string) => companies.find(c => c.id === id)?.name || '—', [companies]);
  const yearName = useCallback((id: string) => years.find(y => y.id === id)?.name || '—', [years]);
  const projectName = useCallback((id: string) => projects.find(p => p.id === id)?.name || '—', [projects]);
  // "Rolls Into" — the next financial year whose start falls after a project's end
  // date; falls back to a generic label when no later FY exists / no end date.
  const rollsInto = useCallback((endDate: string) => {
    if (!endDate) return 'Next FY';
    const next = years
      .filter(y => y.start && y.start > endDate)
      .sort((a, b) => (a.start < b.start ? -1 : 1))[0];
    return next ? next.name : 'Next FY';
  }, [years]);

  const companyOpts = [{ label: 'All Companies', value: 'all' }, ...companies.map(c => ({ label: c.name, value: c.id }))];
  const yearOpts = [{ label: 'All Years', value: 'all' }, ...years.map(y => ({ label: y.name, value: y.id }))];

  // ── Transaction Ledger rows ──
  // Merge receipts (+amount) and expenditures (−amount) that pass the filters,
  // sort by date ascending, then accumulate a running Total Balance.
  type LedgerRow = {
    id: string; type: 'Receipt' | 'Expenditure'; date: string;
    companyId: string; projectId: string; yearId: string;
    base: number; carry: number; balance: number;
  };
  const ledgerRows = useMemo<LedgerRow[]>(() => {
    const rx = receipts
      .filter(r => inCo(r.companyId) && inYear(r.yearId) && inDate(r.date))
      .map(r => ({
        id: 'r' + r.id, type: 'Receipt' as const, date: r.date, companyId: r.companyId,
        projectId: r.projectId, yearId: r.yearId, base: r.amount, carry: r.carryForward, signed: r.amount,
      }));
    const ex = expenditures
      .filter(e => inCo(e.companyId) && inYear(e.yearId) && inDate(e.date))
      .map(e => ({
        id: 'e' + e.id, type: 'Expenditure' as const, date: e.date, companyId: e.companyId,
        projectId: e.projectId, yearId: e.yearId, base: e.amount, carry: e.carryForwardAmount, signed: -e.amount,
      }));
    const all = [...rx, ...ex].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let running = 0;
    return all.map(x => {
      running += x.signed;
      return { id: x.id, type: x.type, date: x.date, companyId: x.companyId, projectId: x.projectId, yearId: x.yearId, base: x.base, carry: x.carry, balance: running };
    });
  }, [receipts, expenditures, inCo, inYear, inDate]);

  const ledgerIn = useMemo(() => sum(ledgerRows.filter(x => x.type === 'Receipt').map(x => x.base)), [ledgerRows]);
  const ledgerOut = useMemo(() => sum(ledgerRows.filter(x => x.type === 'Expenditure').map(x => x.base)), [ledgerRows]);
  const ledgerFinal = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].balance : 0;

  // ── Year-wise rows ──
  const yearRows = useMemo(() => {
    const list = yearFilter === 'all' ? years : years.filter(y => y.id === yearFilter);
    return list.map(y => {
      const received = sum(receipts.filter(r => r.yearId === y.id && inCo(r.companyId) && inDate(r.date)).map(r => r.amount));
      const carryIn = sum(receipts.filter(r => r.yearId === y.id && inCo(r.companyId) && inDate(r.date)).map(r => r.carryForward));
      const available = received + carryIn;
      const spent = sum(expenditures.filter(e => e.yearId === y.id && inCo(e.companyId) && inDate(e.date)).map(e => e.amount));
      const balance = available - spent;
      return { id: y.id, name: y.name, received, carryIn, available, spent, balance, carryOut: balance };
    });
  }, [years, receipts, expenditures, yearFilter, inCo, inDate]);

  const yearTotals = useMemo(() => ({
    received: sum(yearRows.map(r => r.received)),
    carryIn: sum(yearRows.map(r => r.carryIn)),
    available: sum(yearRows.map(r => r.available)),
    spent: sum(yearRows.map(r => r.spent)),
    balance: sum(yearRows.map(r => r.balance)),
    carryOut: sum(yearRows.map(r => r.carryOut)),
  }), [yearRows]);

  // ── Company-wise rows ──
  const companyRows = useMemo(() => {
    const list = companyFilter === 'all' ? companies : companies.filter(c => c.id === companyFilter);
    return list.map(c => {
      const received = sum(receipts.filter(r => r.companyId === c.id && inYear(r.yearId) && inDate(r.date)).map(r => r.amount));
      const carry = sum(receipts.filter(r => r.companyId === c.id && inYear(r.yearId) && inDate(r.date)).map(r => r.carryForward));
      const spent = sum(expenditures.filter(e => e.companyId === c.id && inYear(e.yearId) && inDate(e.date)).map(e => e.amount));
      const balance = received + carry - spent;
      // A project counts for this company when it lists the company among its funders.
      const projCount = projects.filter(p => p.companyIds.includes(c.id)).length;
      return { id: c.id, name: c.name, received, carry, spent, balance, projCount };
    });
  }, [companies, projects, receipts, expenditures, companyFilter, inYear, inDate]);

  const companyTotals = useMemo(() => ({
    received: sum(companyRows.map(r => r.received)),
    carry: sum(companyRows.map(r => r.carry)),
    spent: sum(companyRows.map(r => r.spent)),
    balance: sum(companyRows.map(r => r.balance)),
    projCount: sum(companyRows.map(r => r.projCount)),
  }), [companyRows]);

  // ── Project-wise rows ──
  // Projects no longer carry a financial year; "Received" is what the project's
  // companies actually paid to it (company receipts only, never other_source).
  const projectRows = useMemo(() => {
    return projects
      .filter(p => projInCo(p))
      .map(p => {
        const received = sum(receipts.filter(r => r.projectId === p.id && r.receiptType === 'company' && inCo(r.companyId) && inYear(r.yearId) && inDate(r.date)).map(r => r.amount));
        const spent = sum(expenditures.filter(e => e.projectId === p.id && inYear(e.yearId) && inCo(e.companyId) && inDate(e.date)).map(e => e.amount));
        const util = p.budget > 0 ? (spent / p.budget) * 100 : 0;
        const company = p.companyIds.map(companyName).join(', ') || '—';
        const period = `${fmtNice(p.startDate)} → ${p.endDate ? fmtNice(p.endDate) : (p.derivedStatus === 'ongoing' ? 'Ongoing' : '—')}`;
        return { id: p.id, name: p.name, company, period, status: p.status, budget: p.budget, received, spent, util };
      });
  }, [projects, receipts, expenditures, projInCo, inCo, inYear, inDate, companyName]);

  const projectTotals = useMemo(() => ({
    budget: sum(projectRows.map(r => r.budget)),
    received: sum(projectRows.map(r => r.received)),
    spent: sum(projectRows.map(r => r.spent)),
  }), [projectRows]);

  // ── Carry Forward rows ──
  // One row per (ongoing project, contributing company). The project's total
  // carry-forward is split across its companies in proportion to what each
  // actually paid into that project (company receipts only).
  const carryRows = useMemo(() => {
    const rows: { key: string; project: string; company: string; contribPct: number; share: number; rollsInto: string }[] = [];
    projects
      .filter(p => p.derivedStatus === 'ongoing' && projInCo(p))
      .forEach(p => {
        const totalCF = sum(expenditures.filter(e => e.projectId === p.id && inYear(e.yearId) && inDate(e.date)).map(e => e.carryForwardAmount));
        if (totalCF <= 0) return;
        const paid = p.companyIds.map(cid => ({
          cid,
          amount: sum(receipts.filter(r => r.projectId === p.id && r.companyId === cid && r.receiptType === 'company' && inYear(r.yearId) && inDate(r.date)).map(r => r.amount)),
        }));
        const totalPaid = sum(paid.map(x => x.amount));
        const label = rollsInto(p.endDate);
        paid.forEach(x => {
          if (companyFilter !== 'all' && x.cid !== companyFilter) return; // narrow to the filtered company
          const pct = totalPaid > 0 ? (x.amount / totalPaid) * 100 : 0;
          const share = totalPaid > 0 ? totalCF * (x.amount / totalPaid) : 0;
          rows.push({ key: p.id + '_' + x.cid, project: p.name, company: companyName(x.cid), contribPct: pct, share, rollsInto: label });
        });
      });
    return rows;
  }, [projects, expenditures, receipts, projInCo, companyFilter, inYear, inDate, companyName, rollsInto]);

  const carryTotals = useMemo(() => ({ share: sum(carryRows.map(r => r.share)) }), [carryRows]);

  // ── Grouped bar chart data ──
  const buildGrouped = (groups: { label: string; bars: { value: number; color: string }[] }[]) => {
    const out: any[] = [];
    groups.forEach(g => {
      // Centre the group label under its middle bar, whatever the bar count
      // (index 1 of 3 for year/company charts, index 0 of 2 for the project chart).
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

  // Ledger: a simple two-bar "money in vs money out" summary.
  const ledgerChart = useMemo(() => [
    { value: Math.max(0, ledgerIn), frontColor: C_RECEIVED, label: 'Money In', labelWidth: 80, labelTextStyle: styles.barLabel, spacing: 40 },
    { value: Math.max(0, ledgerOut), frontColor: C_SPENT, label: 'Money Out', labelWidth: 80, labelTextStyle: styles.barLabel },
  ], [ledgerIn, ledgerOut]);
  const ledgerMax = niceMax(Math.max(1, ledgerIn, ledgerOut));
  const ledgerYLabels = Array.from({ length: 5 }, (_, i) => inrShort((ledgerMax * i) / 4));

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

  // Budget-vs-Spent bar — top 10 projects by budget, so the chart stays readable.
  const projectChartRows = useMemo(() => [...projectRows].sort((a, b) => b.budget - a.budget).slice(0, 10), [projectRows]);
  const projectChart = useMemo(() => buildGrouped(projectChartRows.map(r => ({
    label: r.name,
    bars: [
      { value: r.budget, color: C_RECEIVED },
      { value: r.spent, color: C_SPENT },
    ],
  }))), [projectChartRows]);
  // Each group is 3 bars (14 wide + 3/3/22 spacing) ≈ 70px — scroll horizontally once
  // there are more projects/years/companies than fit on screen, instead of squeezing every bar.
  const projectChartWidth = Math.max(SCREEN_W - 96, projectChartRows.length * 70 + 14);
  const yearChartWidth = Math.max(SCREEN_W - 96, yearRows.length * 70 + 14);
  const companyChartWidth = Math.max(SCREEN_W - 96, companyRows.length * 70 + 14);

  const activeChart = tab === 'year' ? yearChart : companyChart;
  const chartMax = niceMax(Math.max(1, ...activeChart.map(d => d.value)));
  const yLabels = Array.from({ length: 5 }, (_, i) => inrShort((chartMax * i) / 4));

  const projectChartMax = niceMax(Math.max(1, ...projectChart.map(d => d.value)));
  const projectYLabels = Array.from({ length: 5 }, (_, i) => inrShort((projectChartMax * i) / 4));

  // ── Donut: share of total funds received, by company ──
  const companyPie = useMemo(() => companyRows
    .filter(r => r.received > 0)
    .map((r, i) => ({ value: r.received, color: PIE_COLORS[i % PIE_COLORS.length], name: r.name })),
    [companyRows]);
  const pieTotal = sum(companyPie.map(s => s.value));

  // ── Donut: share of expenditure, by financial year ──
  const yearPie = useMemo(() => yearRows
    .filter(r => r.spent > 0)
    .map((r, i) => ({ value: r.spent, color: PIE_COLORS[i % PIE_COLORS.length], name: r.name })),
    [yearRows]);
  const yearPieTotal = sum(yearPie.map(s => s.value));

  // ── Donut: projects grouped by status ──
  const statusPie = useMemo(() => {
    const order: ProjectStatus[] = ['active', 'completed', 'on_hold', 'cancelled'];
    const counts = new Map<ProjectStatus, number>();
    projectRows.forEach(r => counts.set(r.status, (counts.get(r.status) || 0) + 1));
    return order
      .filter(s => (counts.get(s) || 0) > 0)
      .map((s, i) => ({ value: counts.get(s) as number, color: PIE_COLORS[i % PIE_COLORS.length], name: projectStatusLabel(s) }));
  }, [projectRows]);
  const statusPieTotal = sum(statusPie.map(s => s.value));

  const escapeHtml = (v: string | number) =>
    String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

  // Builds a styled HTML table matching exactly what the active tab shows on
  // screen (same rows, same totals, same filters) — this is what gets rendered
  // into the PDF, so the exported file always matches the app's live numbers.
  const buildReportHtml = (): string => {
    let title = '';
    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    let totals: (string | number)[] = [];
    let numericFrom = 1; // column index from which cells are right-aligned numbers
    // Flagged column indices per row/total — mirrors the on-screen Cell `color`
    // logic (balance < 0 red, utilization > 90% red), computed from the raw
    // numeric values (not the formatted strings) so it can't be fooled by "₹-".
    let rowFlags: number[][] = [];
    let totalFlags: number[] = [];

    if (tab === 'ledger') {
      title = 'Transaction Ledger';
      headers = ['Type', 'Date', 'Company', 'Project', 'FY', 'Base Amount', 'Carry Forward', 'Total Balance'];
      rows = ledgerRows.map(x => [x.type, fmtNice(x.date), companyName(x.companyId), projectName(x.projectId), shortYear(yearName(x.yearId)), inr(x.base), inr(x.carry), inr(x.balance)]);
      totals = ['Total', '', '', '', '', '', '', inr(ledgerFinal)];
      numericFrom = 5;
      // Expenditure base amounts (5) shown in red; a negative running balance (7) in red.
      rowFlags = ledgerRows.map(x => [...(x.type === 'Expenditure' ? [5] : []), ...(x.balance < 0 ? [7] : [])]);
      totalFlags = ledgerFinal < 0 ? [7] : [];
    } else if (tab === 'year') {
      title = 'Fund Flow by Financial Year';
      headers = ['Financial Year', 'Received', 'Carry Fwd In', 'Total Available', 'Expenditure', 'Balance', 'Carry Fwd Out'];
      rows = yearRows.map(r => [r.name, inr(r.received), inr(r.carryIn), inr(r.available), inr(r.spent), inr(r.balance), inr(r.carryOut)]);
      totals = ['Total', inr(yearTotals.received), inr(yearTotals.carryIn), inr(yearTotals.available), inr(yearTotals.spent), inr(yearTotals.balance), inr(yearTotals.carryOut)];
      rowFlags = yearRows.map(r => (r.balance < 0 ? [5] : []));
      totalFlags = yearTotals.balance < 0 ? [5] : [];
    } else if (tab === 'company') {
      title = 'Fund Position by Company';
      headers = ['Company', 'Received', 'Carry Forward', 'Expenditure', 'Balance', 'Projects'];
      rows = companyRows.map(r => [r.name, inr(r.received), inr(r.carry), inr(r.spent), inr(r.balance), r.projCount]);
      totals = ['Total', inr(companyTotals.received), inr(companyTotals.carry), inr(companyTotals.spent), inr(companyTotals.balance), companyTotals.projCount];
      rowFlags = companyRows.map(r => (r.balance < 0 ? [4] : []));
      totalFlags = companyTotals.balance < 0 ? [4] : [];
    } else if (tab === 'project') {
      title = 'Project-wise Budget & Utilization';
      headers = ['Project', 'Company', 'Period', 'Budget', 'Received', 'Spent', 'Utilization', 'Status'];
      rows = projectRows.map(r => [r.name, r.company, r.period, inr(r.budget), inr(r.received), inr(r.spent), `${r.util.toFixed(1)}%`, projectStatusLabel(r.status)]);
      totals = ['Total', '', '', inr(projectTotals.budget), inr(projectTotals.received), inr(projectTotals.spent), '', ''];
      numericFrom = 3;
      // Utilization column (6) red above 90%.
      rowFlags = projectRows.map(r => (r.util > 90 ? [6] : []));
      totalFlags = [];
    } else {
      title = 'Carry Forward Distribution (Ongoing Projects)';
      headers = ['Project', 'Company', 'Contribution %', 'Carry Forward Share', 'Rolls Into'];
      rows = carryRows.map(r => [r.project, r.company, `${r.contribPct.toFixed(1)}%`, inr(r.share), r.rollsInto]);
      totals = ['Total', '', '', inr(carryTotals.share), ''];
      numericFrom = 2;
      rowFlags = [];
      totalFlags = [];
    }

    const filtersLine =
      `Company: ${companyFilter === 'all' ? 'All Companies' : companyName(companyFilter)}` +
      `  •  Year: ${yearFilter === 'all' ? 'All Years' : yearName(yearFilter)}` +
      (fromDate || toDate ? `  •  ${fromDate || 'Start'} to ${toDate || 'Today'}` : '');
    const generated = fmtDateTime(new Date().toISOString());

    const cellHtml = (v: string | number, i: number, flagged: number[]) =>
      `<td class="${i >= numericFrom ? 'num' : ''}${flagged.includes(i) ? ' danger' : ''}">${escapeHtml(v)}</td>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
      * { box-sizing: border-box; }
      body { font-family: Helvetica, Arial, sans-serif; padding: 28px; color: ${theme.text}; }
      h1 { font-size: 20px; color: ${theme.primary}; margin: 0 0 4px; }
      .sub { font-size: 13px; color: ${theme.muted}; margin: 0 0 4px; font-weight: 600; }
      .meta { font-size: 10.5px; color: ${theme.faint}; margin-bottom: 18px; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; }
      th { background: ${theme.primarySoft}; color: ${theme.primary}; font-size: 10.5px; text-align: left; padding: 8px 10px; border: 1px solid ${theme.border}; }
      td { font-size: 11px; padding: 7px 10px; border: 1px solid ${theme.border}; }
      tr:nth-child(even) td { background: #fbfbff; }
      .num { text-align: right; }
      .danger { color: ${theme.danger}; font-weight: 700; }
      .total td { font-weight: 700; background: ${theme.bg}; }
    </style></head><body>
      <h1>CSR Financial Report</h1>
      <div class="sub">${escapeHtml(title)}</div>
      <div class="meta">${escapeHtml(filtersLine)} &nbsp;•&nbsp; Generated: ${escapeHtml(generated)}</div>
      <table>
        <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((r, ri) => `<tr>${r.map((c, i) => cellHtml(c, i, rowFlags[ri] || [])).join('')}</tr>`).join('')}
          <tr class="total">${totals.map((c, i) => cellHtml(c, i, totalFlags)).join('')}</tr>
        </tbody>
      </table>
    </body></html>`;
  };

  // Export the current report tab as a proper PDF (styled table, not plain text) —
  // generated on-device, then handed to the OS share sheet (WhatsApp / Gmail / Drive).
  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const html = buildReportHtml();
      const fileName = `CSR_${tab}_report_${Date.now()}`;
      const pdf = await generatePDF({ html, fileName, base64: false, bgColor: '#ffffff' });
      await Share.open({
        title: 'CSR Financial Report',
        url: 'file://' + pdf.filePath,
        type: 'application/pdf',
        filename: fileName,
        failOnCancel: false,
      });
    } catch {
      // PDF generation failed, or the user dismissed the share sheet — nothing to do.
    } finally {
      setExporting(false);
    }
  };

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'ledger', label: 'Transaction Ledger' },
    { key: 'year', label: 'Year-wise' },
    { key: 'company', label: 'Company-wise' },
    { key: 'project', label: 'Project-wise' },
    { key: 'carry', label: 'Carry Forward' },
  ];

  return (
    <PaperProvider theme={paperTheme}>
      <View style={{ flex: 1 }}>
        <Header
          title="Financial Reports"
          subtitle="Fund analytics & exports"
          action={
            <Pressable onPress={onExport} disabled={exporting}
              style={({ pressed }) => [styles.exportBtn, (pressed || exporting) && { opacity: 0.7 }]}>
              <Export size={15} color={theme.primary} weight="bold" />
              <Text style={styles.exportText}>{exporting ? 'Exporting…' : 'Export'}</Text>
            </Pressable>
          }
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Filters — use the app's Select so the dropdown opens as a sheet like other pages */}
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

          {/* Segmented tabs — five of them, so the bar scrolls horizontally */}
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
                    <BarChart data={ledgerChart} barWidth={56} initialSpacing={30} roundedTop maxValue={ledgerMax} noOfSections={4} yAxisLabelTexts={ledgerYLabels} yAxisLabelWidth={46} yAxisTextStyle={styles.axisText} yAxisColor={theme.border} xAxisColor={theme.border} rulesColor={theme.border} height={180} isAnimated />
                  )}
              </Card>

              <Card style={styles.tableCard}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <DataTable>
                    <DataTable.Header style={styles.dtHeader}>
                      <Title w={100} text="Type" />
                      <Title w={100} text="Date" />
                      <Title w={140} text="Company" />
                      <Title w={150} text="Project" />
                      <Title w={90} text="FY" />
                      <Title w={120} text="Base Amount" numeric />
                      <Title w={120} text="Carry Forward" numeric />
                      <Title w={130} text="Total Balance" numeric />
                    </DataTable.Header>
                    {ledgerRows.map(x => (
                      <DataTable.Row key={x.id} style={styles.dtRow}>
                        <Cell w={100} text={x.type} bold color={x.type === 'Receipt' ? theme.success : theme.danger} />
                        <Cell w={100} text={fmtNice(x.date)} />
                        <Cell w={140} text={companyName(x.companyId)} />
                        <Cell w={150} text={projectName(x.projectId)} />
                        <Cell w={90} text={shortYear(yearName(x.yearId))} />
                        <Cell w={120} text={inr(x.base)} numeric color={x.type === 'Receipt' ? theme.success : theme.danger} />
                        <Cell w={120} text={inr(x.carry)} numeric />
                        <Cell w={130} text={inr(x.balance)} numeric bold color={x.balance < 0 ? theme.danger : theme.success} />
                      </DataTable.Row>
                    ))}
                    <DataTable.Row style={styles.totalRow}>
                      <Cell w={100} text="Total" bold />
                      <Cell w={100} text="" />
                      <Cell w={140} text="" />
                      <Cell w={150} text="" />
                      <Cell w={90} text="" />
                      <Cell w={120} text="" numeric />
                      <Cell w={120} text="" numeric />
                      <Cell w={130} text={inr(ledgerFinal)} numeric bold color={ledgerFinal < 0 ? theme.danger : theme.success} />
                    </DataTable.Row>
                  </DataTable>
                </ScrollView>
                {ledgerRows.length === 0 && <EmptyState text="No transactions match the selected filters." />}
              </Card>
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

              {/* Donut — share of expenditure by financial year */}
              <Card style={styles.chartCard}>
                <Text style={styles.chartTitle}>Expenditure Share by Year</Text>
                {yearPie.length === 0 ? (
                  <Text style={styles.noData}>No expenditure for this selection.</Text>
                ) : (
                  <View style={styles.pieWrap}>
                    <PieChart
                      donut
                      data={yearPie.map(s => ({ value: s.value, color: s.color }))}
                      radius={78}
                      innerRadius={50}
                      innerCircleColor={theme.surface}
                      centerLabelComponent={() => (
                        <View style={{ alignItems: 'center' }}>
                          <Text style={styles.pieCenterCap}>SPENT</Text>
                          <Text style={styles.pieCenterVal}>{inrShort(yearPieTotal)}</Text>
                        </View>
                      )}
                    />
                    <View style={styles.pieLegend}>
                      {yearPie.map(s => (
                        <View key={s.name} style={styles.pieLegendRow}>
                          <View style={[styles.dot, { backgroundColor: s.color }]} />
                          <Text style={styles.pieLegendName} numberOfLines={1}>{s.name}</Text>
                          <Text style={styles.pieLegendPct}>{yearPieTotal ? Math.round((s.value / yearPieTotal) * 100) : 0}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </Card>

              <Card style={styles.tableCard}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <DataTable>
                    <DataTable.Header style={styles.dtHeader}>
                      <Title w={120} text="Financial Year" />
                      <Title w={120} text="Funds Received" numeric />
                      <Title w={120} text="Carry Fwd In" numeric />
                      <Title w={120} text="Total Available" numeric />
                      <Title w={120} text="Expenditure" numeric />
                      <Title w={110} text="Balance" numeric />
                      <Title w={120} text="Carry Fwd Out" numeric />
                    </DataTable.Header>
                    {yearRows.map(r => (
                      <DataTable.Row key={r.id} style={styles.dtRow}>
                        <Cell w={120} text={r.name} bold />
                        <Cell w={120} text={inr(r.received)} numeric />
                        <Cell w={120} text={inr(r.carryIn)} numeric />
                        <Cell w={120} text={inr(r.available)} numeric />
                        <Cell w={120} text={inr(r.spent)} numeric color={theme.danger} />
                        <Cell w={110} text={inr(r.balance)} numeric color={r.balance < 0 ? theme.danger : theme.success} />
                        <Cell w={120} text={inr(r.carryOut)} numeric />
                      </DataTable.Row>
                    ))}
                    <DataTable.Row style={styles.totalRow}>
                      <Cell w={120} text="Total" bold />
                      <Cell w={120} text={inr(yearTotals.received)} numeric bold />
                      <Cell w={120} text={inr(yearTotals.carryIn)} numeric bold />
                      <Cell w={120} text={inr(yearTotals.available)} numeric bold />
                      <Cell w={120} text={inr(yearTotals.spent)} numeric bold color={theme.danger} />
                      <Cell w={110} text={inr(yearTotals.balance)} numeric bold color={yearTotals.balance < 0 ? theme.danger : theme.success} />
                      <Cell w={120} text={inr(yearTotals.carryOut)} numeric bold />
                    </DataTable.Row>
                  </DataTable>
                </ScrollView>
                {yearRows.length === 0 && <EmptyState text="No fund activity matches the selected filters." />}
              </Card>
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

              {/* Donut — share of total funds received by company */}
              <Card style={styles.chartCard}>
                <Text style={styles.chartTitle}>Fund Distribution by Company</Text>
                {companyPie.length === 0 ? (
                  <Text style={styles.noData}>No fund receipts for this selection.</Text>
                ) : (
                  <View style={styles.pieWrap}>
                    <PieChart
                      donut
                      data={companyPie.map(s => ({ value: s.value, color: s.color }))}
                      radius={78}
                      innerRadius={50}
                      innerCircleColor={theme.surface}
                      centerLabelComponent={() => (
                        <View style={{ alignItems: 'center' }}>
                          <Text style={styles.pieCenterCap}>TOTAL</Text>
                          <Text style={styles.pieCenterVal}>{inrShort(pieTotal)}</Text>
                        </View>
                      )}
                    />
                    <View style={styles.pieLegend}>
                      {companyPie.map(s => (
                        <View key={s.name} style={styles.pieLegendRow}>
                          <View style={[styles.dot, { backgroundColor: s.color }]} />
                          <Text style={styles.pieLegendName} numberOfLines={1}>{s.name}</Text>
                          <Text style={styles.pieLegendPct}>{pieTotal ? Math.round((s.value / pieTotal) * 100) : 0}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </Card>

              <Card style={styles.tableCard}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <DataTable>
                    <DataTable.Header style={styles.dtHeader}>
                      <Title w={160} text="Company" />
                      <Title w={120} text="Funds Received" numeric />
                      <Title w={120} text="Carry Forward" numeric />
                      <Title w={130} text="Total Expenditure" numeric />
                      <Title w={120} text="Balance" numeric />
                      <Title w={80} text="Projects" numeric />
                    </DataTable.Header>
                    {companyRows.map(r => (
                      <DataTable.Row key={r.id} style={styles.dtRow}>
                        <Cell w={160} text={r.name} bold />
                        <Cell w={120} text={inr(r.received)} numeric />
                        <Cell w={120} text={inr(r.carry)} numeric />
                        <Cell w={130} text={inr(r.spent)} numeric color={theme.danger} />
                        <Cell w={120} text={inr(r.balance)} numeric color={r.balance < 0 ? theme.danger : theme.success} />
                        <Cell w={80} text={String(r.projCount)} numeric />
                      </DataTable.Row>
                    ))}
                    <DataTable.Row style={styles.totalRow}>
                      <Cell w={160} text="Total" bold />
                      <Cell w={120} text={inr(companyTotals.received)} numeric bold />
                      <Cell w={120} text={inr(companyTotals.carry)} numeric bold />
                      <Cell w={130} text={inr(companyTotals.spent)} numeric bold color={theme.danger} />
                      <Cell w={120} text={inr(companyTotals.balance)} numeric bold color={companyTotals.balance < 0 ? theme.danger : theme.success} />
                      <Cell w={80} text={String(companyTotals.projCount)} numeric bold />
                    </DataTable.Row>
                  </DataTable>
                </ScrollView>
                {companyRows.length === 0 && <EmptyState text="No fund activity matches the selected filters." />}
              </Card>
            </>
          )}

          {/* ── PROJECT-WISE ── */}
          {tab === 'project' && (
            <>
              <Card style={styles.chartCard}>
                <Text style={styles.chartTitle}>Budget vs Expenditure by Project</Text>
                <Text style={styles.chartSub}>Top 10 by budget</Text>
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

              {/* Donut — projects grouped by status */}
              <Card style={styles.chartCard}>
                <Text style={styles.chartTitle}>Projects by Status</Text>
                {statusPie.length === 0 ? (
                  <Text style={styles.noData}>No projects for this selection.</Text>
                ) : (
                  <View style={styles.pieWrap}>
                    <PieChart
                      donut
                      data={statusPie.map(s => ({ value: s.value, color: s.color }))}
                      radius={78}
                      innerRadius={50}
                      innerCircleColor={theme.surface}
                      centerLabelComponent={() => (
                        <View style={{ alignItems: 'center' }}>
                          <Text style={styles.pieCenterCap}>PROJECTS</Text>
                          <Text style={styles.pieCenterVal}>{statusPieTotal}</Text>
                        </View>
                      )}
                    />
                    <View style={styles.pieLegend}>
                      {statusPie.map(s => (
                        <View key={s.name} style={styles.pieLegendRow}>
                          <View style={[styles.dot, { backgroundColor: s.color }]} />
                          <Text style={styles.pieLegendName} numberOfLines={1}>{s.name}</Text>
                          <Text style={styles.pieLegendPct}>{statusPieTotal ? Math.round((s.value / statusPieTotal) * 100) : 0}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </Card>

              <Card style={styles.tableCard}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <DataTable>
                  <DataTable.Header style={styles.dtHeader}>
                    <Title w={170} text="Project" />
                    <Title w={160} text="Company" />
                    <Title w={190} text="Period" />
                    <Title w={130} text="Budget" numeric />
                    <Title w={120} text="Received" numeric />
                    <Title w={120} text="Spent" numeric />
                    <Title w={100} text="Utilization" numeric />
                    <Title w={120} text="Status" />
                  </DataTable.Header>
                  {projectRows.map(r => (
                    <DataTable.Row key={r.id} style={styles.dtRow}>
                      <Cell w={170} text={r.name} bold />
                      <Cell w={160} text={r.company} />
                      <Cell w={190} text={r.period} />
                      <Cell w={130} text={inr(r.budget)} numeric />
                      <Cell w={120} text={inr(r.received)} numeric />
                      <Cell w={120} text={inr(r.spent)} numeric color={theme.danger} />
                      <Cell w={100} text={`${r.util.toFixed(1)}%`} numeric color={r.util > 90 ? theme.danger : theme.success} bold />
                      <DataTable.Cell style={{ width: 120 }}>
                        <Pill text={projectStatusLabel(r.status)} tone={projectStatusTone(r.status)} />
                      </DataTable.Cell>
                    </DataTable.Row>
                  ))}
                  <DataTable.Row style={styles.totalRow}>
                    <Cell w={170} text="Total" bold />
                    <Cell w={160} text="" />
                    <Cell w={190} text="" />
                    <Cell w={130} text={inr(projectTotals.budget)} numeric bold />
                    <Cell w={120} text={inr(projectTotals.received)} numeric bold />
                    <Cell w={120} text={inr(projectTotals.spent)} numeric bold color={theme.danger} />
                    <Cell w={100} text="" numeric />
                    <Cell w={120} text="" />
                  </DataTable.Row>
                </DataTable>
              </ScrollView>
              {projectRows.length === 0 && <EmptyState text="No projects match the selected filters." />}
              </Card>
            </>
          )}

          {/* ── CARRY FORWARD ── */}
          {tab === 'carry' && (
            <Card style={styles.tableCard}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <DataTable>
                  <DataTable.Header style={styles.dtHeader}>
                    <Title w={180} text="Project" />
                    <Title w={160} text="Company" />
                    <Title w={130} text="Contribution %" numeric />
                    <Title w={150} text="Carry Fwd Share" numeric />
                    <Title w={130} text="Rolls Into" />
                  </DataTable.Header>
                  {carryRows.map(r => (
                    <DataTable.Row key={r.key} style={styles.dtRow}>
                      <Cell w={180} text={r.project} bold />
                      <Cell w={160} text={r.company} />
                      <Cell w={130} text={`${r.contribPct.toFixed(1)}%`} numeric />
                      <Cell w={150} text={inr(r.share)} numeric color={theme.accent} bold />
                      <Cell w={130} text={r.rollsInto} />
                    </DataTable.Row>
                  ))}
                  <DataTable.Row style={styles.totalRow}>
                    <Cell w={180} text="Total" bold />
                    <Cell w={160} text="" />
                    <Cell w={130} text="" numeric />
                    <Cell w={150} text={inr(carryTotals.share)} numeric bold color={theme.accent} />
                    <Cell w={130} text="" />
                  </DataTable.Row>
                </DataTable>
              </ScrollView>
              {carryRows.length === 0 && <EmptyState text="No ongoing projects with carry-forward match the selected filters." />}
            </Card>
          )}
        </ScrollView>
      </View>
    </PaperProvider>
  );
}

// ── Small table cell helpers (keep the JSX above readable) ──
const Title = ({ w, text, numeric }: { w: number; text: string; numeric?: boolean }) => (
  <DataTable.Title numeric={numeric} style={{ width: w }} textStyle={styles.dtHeadText}>{text}</DataTable.Title>
);
const Cell = ({ w, text, numeric, bold, color }: { w: number; text: string; numeric?: boolean; bold?: boolean; color?: string }) => (
  <DataTable.Cell numeric={numeric} style={{ width: w }} textStyle={[styles.dtCell, bold && styles.dtCellBold, !!color && { color }]}>{text}</DataTable.Cell>
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

  filterCard: { paddingVertical: 14 },
  filterRow: { flexDirection: 'row', gap: 12 },
  filterLabel: { fontSize: 9.5, color: theme.faint, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },

  // Five tabs — the bar scrolls horizontally so labels stay full-width & tappable.
  segment: { flexDirection: 'row', backgroundColor: '#ecedf6', borderRadius: 12, padding: 4, gap: 4 },
  segBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff', shadowColor: '#1e1b4b', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText: { fontSize: 12.5, fontWeight: '700', color: theme.muted },
  segTextOn: { color: theme.primary },

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

  tableCard: { padding: 0, paddingVertical: 4, overflow: 'hidden' },
  dtHeader: { borderBottomColor: theme.border, backgroundColor: '#f7f8fd' },
  dtHeadText: { fontSize: 11, color: theme.muted, fontWeight: '800' },
  dtRow: { borderBottomColor: theme.border, minHeight: 50 },
  dtCell: { fontSize: 12.5, color: theme.text, fontWeight: '600' },
  dtCellBold: { fontWeight: '800' },
  totalRow: { backgroundColor: '#f4f5fc', borderBottomWidth: 0, minHeight: 52 },
});
