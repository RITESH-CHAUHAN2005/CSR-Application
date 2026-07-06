// Screen 7 — Financial Reports. Mirrors the web app's /reports page with three
// summary views, switched by a segmented control:
//   • Year-wise Summary     → fund flow per financial year (bar chart + table)
//   • Company-wise Summary  → fund position per company   (bar chart + table)
//   • Project-wise Summary  → budget vs spend per project (table only)
//
// Built with the requested RN libraries, but tuned to feel native:
//   • react-native-gifted-charts   → grouped bar charts
//   • react-native-paper DataTable → the report tables (horizontally scrollable
//                                     so the wide multi-column tables fit a phone)
//   • the app's own <Select>       → the Company / Year filters, so the dropdown
//                                     opens as a sheet exactly like every other page
// Colours come from the existing app theme.
import React, { useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { DataTable, MD3LightTheme, Provider as PaperProvider } from 'react-native-paper';
import { generatePDF } from 'react-native-html-to-pdf';
import Share from 'react-native-share';
import { Export } from 'phosphor-react-native/src/icons/Export';
import { theme } from '../theme';
import {
  Card, Company, DatePicker, EmptyState, Expenditure, FinancialYear, FundReceipt, Project,
  Header, Pill, Select, projectStatusLabel, projectStatusTone, inr, inrShort,
} from '../../App';

type Props = {
  companies: Company[];
  years: FinancialYear[];
  projects: Project[];
  receipts: FundReceipt[];
  expenditures: Expenditure[];
};

type TabKey = 'year' | 'company' | 'project';
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
  const [tab, setTab] = useState<TabKey>('year');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  // Optional date-range filter (themed flatpickr-style picker, ISO YYYY-MM-DD).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const inYear = (yid: string) => yearFilter === 'all' || yid === yearFilter;
  const inCo = (cid: string) => companyFilter === 'all' || cid === companyFilter;
  // ISO date strings sort lexicographically, so plain string compare is enough.
  const inDate = (d: string) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
  const companyName = (id: string) => companies.find(c => c.id === id)?.name || '—';
  const yearName = (id: string) => years.find(y => y.id === id)?.name || '—';

  const companyOpts = [{ label: 'All Companies', value: 'all' }, ...companies.map(c => ({ label: c.name, value: c.id }))];
  const yearOpts = [{ label: 'All Years', value: 'all' }, ...years.map(y => ({ label: y.name, value: y.id }))];

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
  }, [years, receipts, expenditures, yearFilter, companyFilter, fromDate, toDate]);

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
      const projCount = projects.filter(p => p.companyId === c.id && inYear(p.yearId)).length;
      return { id: c.id, name: c.name, received, carry, spent, balance, projCount };
    });
  }, [companies, projects, receipts, expenditures, yearFilter, companyFilter, fromDate, toDate]);

  const companyTotals = useMemo(() => ({
    received: sum(companyRows.map(r => r.received)),
    carry: sum(companyRows.map(r => r.carry)),
    spent: sum(companyRows.map(r => r.spent)),
    balance: sum(companyRows.map(r => r.balance)),
    projCount: sum(companyRows.map(r => r.projCount)),
  }), [companyRows]);

  // ── Project-wise rows ──
  const projectRows = useMemo(() => {
    return projects
      .filter(p => inCo(p.companyId) && inYear(p.yearId))
      .map(p => {
        const spent = sum(expenditures.filter(e => e.projectId === p.id && inDate(e.date)).map(e => e.amount));
        const balance = p.budget - spent;
        const util = p.budget > 0 ? (spent / p.budget) * 100 : 0;
        return { id: p.id, name: p.name, company: companyName(p.companyId), year: yearName(p.yearId), status: p.status, budget: p.budget, spent, balance, util };
      });
  }, [projects, expenditures, yearFilter, companyFilter, fromDate, toDate]);

  const projectTotals = useMemo(() => ({
    budget: sum(projectRows.map(r => r.budget)),
    spent: sum(projectRows.map(r => r.spent)),
    balance: sum(projectRows.map(r => r.balance)),
  }), [projectRows]);

  // ── Grouped bar chart data ──
  const buildGrouped = (groups: { label: string; bars: { value: number; color: string }[] }[]) => {
    const out: any[] = [];
    groups.forEach(g => {
      g.bars.forEach((b, i) => {
        const last = i === g.bars.length - 1;
        out.push({
          value: Math.max(0, b.value),
          frontColor: b.color,
          spacing: last ? 22 : 3,
          // Centre the year/company label under the middle bar of the group.
          label: i === 1 ? shortYear(g.label) : undefined,
          labelWidth: i === 1 ? 64 : undefined,
          labelTextStyle: i === 1 ? styles.barLabel : undefined,
        });
      });
    });
    return out;
  };

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

  const projectChart = useMemo(() => buildGrouped(projectRows.map(r => ({
    label: r.name,
    bars: [
      { value: r.budget, color: C_RECEIVED },
      { value: r.spent, color: C_SPENT },
      { value: Math.max(0, r.balance), color: C_BALANCE },
    ],
  }))), [projectRows]);
  // Each group is 3 bars (14 wide + 3/3/22 spacing) ≈ 70px — scroll horizontally once
  // there are more projects than fit on screen, instead of squeezing every bar.
  const projectChartWidth = Math.max(SCREEN_W - 96, projectRows.length * 70 + 14);

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

  // ── Donut: share of total approved budget, by project ──
  const projectPie = useMemo(() => projectRows
    .filter(r => r.budget > 0)
    .map((r, i) => ({ value: r.budget, color: PIE_COLORS[i % PIE_COLORS.length], name: r.name })),
    [projectRows]);
  const projectPieTotal = sum(projectPie.map(s => s.value));

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

    if (tab === 'year') {
      title = 'Fund Flow by Financial Year';
      headers = ['Financial Year', 'Received', 'Carry Fwd In', 'Total Available', 'Expenditure', 'Balance', 'Carry Fwd Out'];
      rows = yearRows.map(r => [r.name, inr(r.received), inr(r.carryIn), inr(r.available), inr(r.spent), inr(r.balance), inr(r.carryOut)]);
      totals = ['Total', inr(yearTotals.received), inr(yearTotals.carryIn), inr(yearTotals.available), inr(yearTotals.spent), inr(yearTotals.balance), inr(yearTotals.carryOut)];
    } else if (tab === 'company') {
      title = 'Fund Position by Company';
      headers = ['Company', 'Received', 'Carry Forward', 'Expenditure', 'Balance', 'Projects'];
      rows = companyRows.map(r => [r.name, inr(r.received), inr(r.carry), inr(r.spent), inr(r.balance), r.projCount]);
      totals = ['Total', inr(companyTotals.received), inr(companyTotals.carry), inr(companyTotals.spent), inr(companyTotals.balance), companyTotals.projCount];
    } else {
      title = 'Project-wise Budget & Expenditure';
      headers = ['Project', 'Company', 'Year', 'Status', 'Approved Budget', 'Expenditure', 'Balance', 'Utilization'];
      rows = projectRows.map(r => [r.name, r.company, shortYear(r.year), projectStatusLabel(r.status), inr(r.budget), inr(r.spent), inr(r.balance), `${r.util.toFixed(1)}%`]);
      totals = ['Total', '', '', '', inr(projectTotals.budget), inr(projectTotals.spent), inr(projectTotals.balance), ''];
      numericFrom = 4;
    }

    const filtersLine =
      `Company: ${companyFilter === 'all' ? 'All Companies' : companyName(companyFilter)}` +
      `  •  Year: ${yearFilter === 'all' ? 'All Years' : yearName(yearFilter)}` +
      (fromDate || toDate ? `  •  ${fromDate || 'Start'} to ${toDate || 'Today'}` : '');
    const generated = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const cellHtml = (v: string | number, i: number) => `<td class="${i >= numericFrom ? 'num' : ''}">${escapeHtml(v)}</td>`;

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
      .total td { font-weight: 700; background: ${theme.bg}; }
    </style></head><body>
      <h1>CSR Financial Report</h1>
      <div class="sub">${escapeHtml(title)}</div>
      <div class="meta">${escapeHtml(filtersLine)} &nbsp;•&nbsp; Generated: ${escapeHtml(generated)}</div>
      <table>
        <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map(r => `<tr>${r.map((c, i) => cellHtml(c, i)).join('')}</tr>`).join('')}
          <tr class="total">${totals.map((c, i) => cellHtml(c, i)).join('')}</tr>
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
    { key: 'year', label: 'Year-wise' },
    { key: 'company', label: 'Company-wise' },
    { key: 'project', label: 'Project-wise' },
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

          {/* Segmented tabs */}
          <View style={styles.segment}>
            {TABS.map(t => {
              const on = tab === t.key;
              return (
                <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.segBtn, on && styles.segBtnOn]}>
                  <Text style={[styles.segText, on && styles.segTextOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

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
                  : <BarChart data={yearChart} barWidth={14} initialSpacing={14} roundedTop maxValue={chartMax} noOfSections={4} yAxisLabelTexts={yLabels} yAxisLabelWidth={46} yAxisTextStyle={styles.axisText} yAxisColor={theme.border} xAxisColor={theme.border} rulesColor={theme.border} height={180} width={SCREEN_W - 96} isAnimated />}
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
                  : <BarChart data={companyChart} barWidth={14} initialSpacing={14} roundedTop maxValue={chartMax} noOfSections={4} yAxisLabelTexts={yLabels} yAxisLabelWidth={46} yAxisTextStyle={styles.axisText} yAxisColor={theme.border} xAxisColor={theme.border} rulesColor={theme.border} height={180} width={SCREEN_W - 96} isAnimated />}
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
                <View style={styles.legendRow}>
                  <Legend color={C_RECEIVED} text="Budget" />
                  <Legend color={C_SPENT} text="Expenditure" />
                  <Legend color={C_BALANCE} text="Balance" />
                </View>
                {projectChart.length === 0
                  ? <Text style={styles.noData}>No data for this selection.</Text>
                  : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <BarChart data={projectChart} barWidth={14} initialSpacing={14} roundedTop maxValue={projectChartMax} noOfSections={4} yAxisLabelTexts={projectYLabels} yAxisLabelWidth={46} yAxisTextStyle={styles.axisText} yAxisColor={theme.border} xAxisColor={theme.border} rulesColor={theme.border} height={180} width={projectChartWidth} isAnimated />
                    </ScrollView>
                  )}
              </Card>

              {/* Donut — share of total approved budget by project */}
              <Card style={styles.chartCard}>
                <Text style={styles.chartTitle}>Budget Distribution by Project</Text>
                {projectPie.length === 0 ? (
                  <Text style={styles.noData}>No project budgets for this selection.</Text>
                ) : (
                  <View style={styles.pieWrap}>
                    <PieChart
                      donut
                      data={projectPie.map(s => ({ value: s.value, color: s.color }))}
                      radius={78}
                      innerRadius={50}
                      innerCircleColor={theme.surface}
                      centerLabelComponent={() => (
                        <View style={{ alignItems: 'center' }}>
                          <Text style={styles.pieCenterCap}>TOTAL</Text>
                          <Text style={styles.pieCenterVal}>{inrShort(projectPieTotal)}</Text>
                        </View>
                      )}
                    />
                    <View style={styles.pieLegend}>
                      {projectPie.map(s => (
                        <View key={s.name} style={styles.pieLegendRow}>
                          <View style={[styles.dot, { backgroundColor: s.color }]} />
                          <Text style={styles.pieLegendName} numberOfLines={1}>{s.name}</Text>
                          <Text style={styles.pieLegendPct}>{projectPieTotal ? Math.round((s.value / projectPieTotal) * 100) : 0}%</Text>
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
                    <Title w={150} text="Company" />
                    <Title w={100} text="Year" />
                    <Title w={110} text="Status" />
                    <Title w={130} text="Approved Budget" numeric />
                    <Title w={120} text="Expenditure" numeric />
                    <Title w={120} text="Balance" numeric />
                    <Title w={90} text="Utilization" numeric />
                  </DataTable.Header>
                  {projectRows.map(r => (
                    <DataTable.Row key={r.id} style={styles.dtRow}>
                      <Cell w={170} text={r.name} bold />
                      <Cell w={150} text={r.company} />
                      <Cell w={100} text={shortYear(r.year)} />
                      <DataTable.Cell style={{ width: 110 }}>
                        <Pill text={projectStatusLabel(r.status)} tone={projectStatusTone(r.status)} />
                      </DataTable.Cell>
                      <Cell w={130} text={inr(r.budget)} numeric />
                      <Cell w={120} text={inr(r.spent)} numeric color={theme.danger} />
                      <Cell w={120} text={inr(r.balance)} numeric color={r.balance < 0 ? theme.danger : theme.success} />
                      <Cell w={90} text={`${r.util.toFixed(1)}%`} numeric color={r.util > 90 ? theme.danger : theme.success} bold />
                    </DataTable.Row>
                  ))}
                  <DataTable.Row style={styles.totalRow}>
                    <Cell w={170} text="Total" bold />
                    <Cell w={150} text="" />
                    <Cell w={100} text="" />
                    <Cell w={110} text="" />
                    <Cell w={130} text={inr(projectTotals.budget)} numeric bold />
                    <Cell w={120} text={inr(projectTotals.spent)} numeric bold color={theme.danger} />
                    <Cell w={120} text={inr(projectTotals.balance)} numeric bold color={projectTotals.balance < 0 ? theme.danger : theme.success} />
                    <Cell w={90} text="" numeric />
                  </DataTable.Row>
                </DataTable>
              </ScrollView>
              {projectRows.length === 0 && <EmptyState text="No projects match the selected filters." />}
              </Card>
            </>
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

  segment: { flexDirection: 'row', backgroundColor: '#ecedf6', borderRadius: 12, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segBtnOn: { backgroundColor: '#fff', shadowColor: '#1e1b4b', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText: { fontSize: 12.5, fontWeight: '700', color: theme.muted },
  segTextOn: { color: theme.primary },

  chartCard: { gap: 6 },
  chartTitle: { fontSize: 15, fontWeight: '800', color: theme.text, marginBottom: 8 },
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
