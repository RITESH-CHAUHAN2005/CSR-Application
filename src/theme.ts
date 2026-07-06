// ─────────────────────────────────────────────────────────────────────────
//  Design tokens — kept in a standalone module so screens can read them at
//  StyleSheet.create() time WITHOUT importing App.tsx (which would create a
//  require cycle: App imports screens, screens import App's theme before it
//  is defined → "Cannot read property 'text' of undefined").
// ─────────────────────────────────────────────────────────────────────────

// CSR project categories. Lives here (not App.tsx) so screens can read it at
// module-init time — e.g. Projects' `blank` default — without the require cycle.
export const CATEGORIES = ['Education', 'Environment', 'Skill Development', 'Healthcare', 'Infrastructure'];

// Finance option lists + the payment-mode type. These MUST live here (not App.tsx)
// for the same reason as CATEGORIES: the finance screens read them at module-init
// time (e.g. Expenditures' `blank` default uses EXPENSE_CATEGORIES[0]/APPROVERS[0]).
// App.tsx imports App's screens BEFORE it defines its own constants, so reading
// these from App at init time returns `undefined` → `undefined[0]` crash → blank
// screen on launch. Keeping them here breaks that require cycle.
export type PaymentMode = 'NEFT' | 'RTGS' | 'Cheque';
export const PAYMENT_MODES: PaymentMode[] = ['NEFT', 'RTGS', 'Cheque'];
export const EXPENSE_CATEGORIES = ['Infrastructure', 'Training', 'Equipment', 'Scholarships', 'Environment'];
export const APPROVERS = ['Trustee Board', 'Executive Director'];

export const theme = {
  bg:          '#f4f5fc',
  surface:     '#ffffff',
  primary:     '#5b4be8', // vivid indigo
  primaryDk:   '#4636d0',
  primarySoft: '#eceafe',
  accent:      '#0ea5a3', // teal accent (fresh contrast)
  accentSoft:  '#d3f5f3',
  text:        '#15172b',
  muted:       '#666b8a',
  faint:       '#9aa0bd',
  border:      '#e8eaf6',
  success:     '#0f9d6b',
  successSoft: '#d6f6e7',
  danger:      '#e23a63',
  dangerSoft:  '#ffe1e9',
  amber:       '#e0850b',
  amberSoft:   '#fdeecb',
  violet:      '#8b3fe8',
  violetSoft:  '#f0e3ff',
};

// Distinct colour per category chip — gives the app its "unique" palette.
export const categoryColors: Record<string, { fg: string; bg: string }> = {
  Education:           { fg: theme.primary, bg: theme.primarySoft },
  Environment:         { fg: theme.success, bg: theme.successSoft },
  'Skill Development': { fg: theme.violet,  bg: theme.violetSoft },
  Healthcare:          { fg: theme.danger,  bg: theme.dangerSoft },
  Infrastructure:      { fg: theme.amber,   bg: theme.amberSoft },
};

// Rotating chip colours for avatar-style icon chips (companies, etc.)
export const iconChipColors = [
  { fg: theme.primary, bg: theme.primarySoft },
  { fg: theme.accent,  bg: theme.accentSoft },
  { fg: theme.violet,  bg: theme.violetSoft },
  { fg: theme.amber,   bg: theme.amberSoft },
];
