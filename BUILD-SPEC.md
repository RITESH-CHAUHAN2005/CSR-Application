# CSR Mini — Build Spec

> **Hand this whole folder to Claude Code and say: _"Read BUILD-SPEC.md and build it."_**
> The React Native environment is already set up. Your job is only to write the UI:
> **`App.tsx` + 4 screen files in `src/components/`.** Nothing else.

---

## 0. What this is

A small React Native (Android) app with **exactly 4 screens**, picked from a larger
"CSR Manager" app:

1. **Dashboard** — summary stats + simple charts
2. **Companies** — donor companies (cards, add/edit/delete)
3. **Financial Years** — list of FY periods (add/delete)
4. **Projects** — CSR projects (filter + cards, add/edit/delete)

All data is **mock / in-memory** — no backend, no login, no API, no database.
Add/Edit/Delete only mutate React state (changes reset on app restart). The whole
point is a clean, attractive, runnable demo with as little code as possible.

**Goal: minimal code, fresh attractive design.** Do not over-engineer.

---

## 1. Hard rules (do not break these)

- **Only touch these files:**
  - `App.tsx` (replace the placeholder)
  - `src/components/Dashboard.tsx`
  - `src/components/Companies.tsx`
  - `src/components/FinancialYears.tsx`
  - `src/components/Projects.tsx`
- **Do NOT** add npm packages. Use only what's already in `package.json`:
  `react`, `react-native`, `react-native-safe-area-context`,
  `react-native-svg`, `phosphor-react-native`.
- **Do NOT** touch `android/`, `ios/`, `index.js`, or config files.
- **TypeScript**, functional components, hooks only.
- Keep total app code lean — target roughly **700–900 lines across all 5 files**.

---

## 2. Architecture (how the 5 files fit together)

Shared things live in **`App.tsx`** and are imported by the screens. This keeps the
file count at exactly 5.

**`App.tsx` owns and exports:**
- `theme` — the colour/spacing tokens (§4)
- The **in-memory store**: `useState` arrays for `companies`, `years`, `projects`,
  plus `add/update/remove` helpers, all passed to screens **as props**.
- Small shared UI primitives (§5): `Card`, `StatCard`, `Pill`, `Header`, `Fab`,
  `Field`, `Input`, `Select`, `Modal`, `Confirm`, `EmptyState`, `iconChipColors`.
- The **bottom tab bar** navigation that switches between the 4 screens.
- TypeScript types (`Company`, `FinancialYear`, `Project`).

> Screens `import { theme, Card, ... } from '../../App';`. This creates a circular
> import (App → screen → App) which is **fine in Metro** because the imported values
> are only used *inside* render, never at module top-level. Just don't call them at
> the top level of a screen module.

**Each screen is a presentational component** that receives its data + mutators via
props from `App.tsx`. Example prop shapes:

```ts
type DashboardProps = { companies: Company[]; years: FinancialYear[]; projects: Project[] };
type CompaniesProps = {
  companies: Company[];
  add: (c: Omit<Company, 'id'>) => void;
  update: (id: string, c: Omit<Company, 'id'>) => void;
  remove: (id: string) => void;
};
// FinancialYears and Projects follow the same add/update/remove pattern.
```

Generate ids with a tiny counter or `Date.now().toString()`.

---

## 3. Data model + mock data

Put these types and seed arrays in `App.tsx`. **Use this exact mock data** (don't invent your own).

```ts
export type Company = {
  id: string; name: string; cin: string;
  contact: string; email: string; phone: string;
  received: number; spent: number; // for stats; balance = received - spent
};

export type FinancialYear = {
  id: string; name: string; start: string; end: string; active: boolean;
};

export type Project = {
  id: string; name: string; companyId: string; yearId: string;
  category: string; location: string; budget: number;
  status: 'active' | 'completed'; description: string;
};

export const CATEGORIES = ['Education', 'Environment', 'Skill Development', 'Healthcare', 'Infrastructure'];

export const SEED_YEARS: FinancialYear[] = [
  { id: 'y1', name: 'FY 2023-24', start: '2023-04-01', end: '2024-03-31', active: false },
  { id: 'y2', name: 'FY 2024-25', start: '2024-04-01', end: '2025-03-31', active: true },
  { id: 'y3', name: 'FY 2025-26', start: '2025-04-01', end: '2026-03-31', active: false },
];

export const SEED_COMPANIES: Company[] = [
  { id: 'c1', name: 'Tata Consultancy Services', cin: 'L22210MH1995PLC084781', contact: 'Anita Rao',   email: 'csr@tcs.com',      phone: '+919820011223', received: 5000000, spent: 3200000 },
  { id: 'c2', name: 'Infosys Foundation',         cin: 'U85110KA1996NPL019759', contact: 'Vikram Shah',  email: 'give@infosys.org', phone: '+918040022114', received: 3800000, spent: 2500000 },
  { id: 'c3', name: 'Wipro Cares',                cin: 'L32102KA1945PLC020800', contact: 'Meera Nair',   email: 'cares@wipro.com',  phone: '+918026667788', received: 2600000, spent: 1900000 },
  { id: 'c4', name: 'Reliance Foundation',        cin: 'U01100MH2010NPL206976', contact: 'Sanjay Gupta', email: 'rf@ril.com',       phone: '+912233445566', received: 4200000, spent: 1500000 },
];

export const SEED_PROJECTS: Project[] = [
  { id: 'p1', name: 'Rural School Digital Labs',   companyId: 'c1', yearId: 'y2', category: 'Education',         location: 'Nagpur, MH',      budget: 1200000, status: 'active',    description: 'Setting up computer labs in 15 government schools.' },
  { id: 'p2', name: 'Clean Water Wells',           companyId: 'c1', yearId: 'y2', category: 'Infrastructure',    location: 'Jaipur, RJ',      budget: 850000,  status: 'completed', description: 'Borewells and water purification for 8 villages.' },
  { id: 'p3', name: 'Women Skilling Program',      companyId: 'c2', yearId: 'y2', category: 'Skill Development', location: 'Pune, MH',        budget: 700000,  status: 'active',    description: 'Tailoring and computer skills for 300 women.' },
  { id: 'p4', name: 'Urban Tree Plantation',       companyId: 'c3', yearId: 'y1', category: 'Environment',       location: 'Bengaluru, KA',   budget: 450000,  status: 'completed', description: 'Planting 10,000 native saplings across the city.' },
  { id: 'p5', name: 'Mobile Health Clinics',       companyId: 'c4', yearId: 'y2', category: 'Healthcare',        location: 'Lucknow, UP',     budget: 1500000, status: 'active',    description: 'Two mobile clinics covering 25 remote villages.' },
  { id: 'p6', name: 'Anganwadi Nutrition Drive',   companyId: 'c2', yearId: 'y1', category: 'Healthcare',        location: 'Bhopal, MP',      budget: 600000,  status: 'completed', description: 'Mid-day nutrition supplements for 1,200 children.' },
];
```

### Derived values (compute in Dashboard, don't store)
- `totalReceived` = Σ company.received
- `totalSpent` = Σ company.spent
- `totalBalance` = totalReceived − totalSpent
- `activeProjects` = projects where status === 'active'; `completedProjects` likewise
- Per-company balance = received − spent
- Company distribution % = company.received / totalReceived × 100

### Currency formatting (helper in App.tsx)
Indian rupee grouping, no decimals for big numbers:
```ts
export const inr = (n: number) =>
  '₹' + Math.round(n).toLocaleString('en-IN');   // ₹50,00,000
```
> If `toLocaleString('en-IN')` is unreliable on the device's Hermes, fall back to a
> simple manual grouping — but try the one-liner first.

---

## 4. Design system (the fresh, attractive look)

This is a **redesign**, deliberately different from the old app (which used a side
drawer + blue theme). New direction: **indigo accent, soft cards, bottom tab bar.**

### Colour tokens (`theme` in App.tsx)
```ts
export const theme = {
  bg:        '#f5f6fb', // app background (very light indigo-grey)
  surface:   '#ffffff', // cards
  primary:   '#4f46e5', // indigo-600 — brand, active tab, buttons
  primaryDk: '#4338ca', // indigo-700 — pressed
  primarySoft:'#eef2ff',// indigo-50 — tinted chips / active pill bg
  text:      '#0f172a', // slate-900
  muted:     '#64748b', // slate-500
  faint:     '#94a3b8', // slate-400
  border:    '#e8eaf3', // hairline borders / dividers
  success:   '#059669', // emerald — balance, active
  successSoft:'#d1fae5',
  danger:    '#e11d48', // rose — spent, delete
  dangerSoft:'#ffe4e6',
  amber:     '#d97706',
  amberSoft: '#fef3c7',
};
```

### Look & feel
- **Background:** `theme.bg`. **Cards:** white, `borderRadius: 18`, soft shadow
  (`shadowColor:'#1e1b4b', shadowOpacity:0.06, shadowRadius:12, shadowOffset:{0,4}, elevation:2`),
  `padding: 16`.
- **Header banner (top of every screen):** solid `theme.primary` block, rounded
  bottom corners (`borderBottomLeftRadius: 26, borderBottomRightRadius: 26`),
  white title (size 24, weight 800) + a lighter white-70% subtitle. On screens that
  create records, put a small white **"+ Add"** pill on the right of the header.
- **Bottom tab bar:** white, top hairline border, 4 tabs (Dashboard / Companies /
  Years / Projects). Each tab = phosphor icon + tiny label. Active tab: icon + label
  in `theme.primary` with a `theme.primarySoft` rounded pill behind the icon;
  inactive: `theme.faint`. Respect bottom safe-area inset.
- **Typography:** screen content titles 16–17/700, card titles 15/700, body 13–14,
  labels 11–12 uppercase muted with slight letter-spacing.
- **Badges/Pills:** fully rounded (`borderRadius: 999`), tinted background + matching
  text colour. Status: active → emerald soft, completed → indigo soft.
- **Spacing:** screen horizontal padding 16, vertical gaps 12–16.
- **Buttons:** primary = indigo fill, white text, radius 12, padding 12×16, pressed
  → `primaryDk` + scale 0.98. Secondary = white with border. Danger = rose fill.

### Icons (phosphor-react-native)
Import **individually from source** to avoid the v3 barrel crash:
```ts
import { House } from 'phosphor-react-native/src/icons/House';
import { Buildings } from 'phosphor-react-native/src/icons/Buildings';
import { CalendarBlank } from 'phosphor-react-native/src/icons/CalendarBlank';
import { Briefcase } from 'phosphor-react-native/src/icons/Briefcase';
import { Plus } from 'phosphor-react-native/src/icons/Plus';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { MagnifyingGlass } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { Wallet } from 'phosphor-react-native/src/icons/Wallet';
import { TrendUp } from 'phosphor-react-native/src/icons/TrendUp';
import { Receipt } from 'phosphor-react-native/src/icons/Receipt';
import { X } from 'phosphor-react-native/src/icons/X';
import { CaretDown } from 'phosphor-react-native/src/icons/CaretDown';
// add others the same way if needed
```
Tab bar icons → House (Dashboard), Buildings (Companies), CalendarBlank (Years),
Briefcase (Projects).

---

## 5. Shared primitives to define in App.tsx

Keep each tiny. Suggested set (adapt as you like, but cover these needs):

- **`Header({ title, subtitle, action? })`** — the indigo banner. `action` is an
  optional node rendered on the right (the "+ Add" pill).
- **`Card({ children, style? })`** — white rounded shadowed surface.
- **`StatCard({ icon, label, value, tint })`** — a Card with a coloured rounded
  **icon chip** (bg = soft tint, icon = solid tint), a muted label, and a big value.
- **`Pill({ text, tone })`** — rounded tinted badge; `tone` ∈ `primary|success|amber|danger|neutral`.
- **`Fab` / "+ Add" pill** — white pill button used in the header.
- **`Field({ label, children })`** + **`Input(props)`** + **`Select({ value, options, onChange })`**
  (a tap-to-open modal list, since RN has no native picker styling). Reuse `Select`
  for category/status/company/year dropdowns.
- **`Modal({ visible, title, onClose, children })`** — centered white sheet, dim
  backdrop, title row with an X close button, scrollable body. Used for add/edit forms.
- **`Confirm({ visible, title, message, onCancel, onConfirm })`** — small delete dialog.
- **`EmptyState({ text })`** — centered muted text for empty lists.

The bottom-tab navigation lives in `App`'s render: a `useState<TabKey>` + a row of
4 pressables; render the active screen above the bar inside a `SafeAreaProvider`.

---

## 6. Screens

> Every screen: `Header` banner at top, then a scrollable content area
> (`ScrollView`, bottom padding ~24 so the tab bar doesn't cover content).

### Screen 1 — Dashboard  (`src/components/Dashboard.tsx`)
Title "Dashboard", subtitle "CSR funds at a glance".
1. **4 stat cards** in a 2×2 grid (use `StatCard`):
   - Total Balance — `inr(totalBalance)` — Wallet icon — tint `success`
   - Total Received — `inr(totalReceived)` — TrendUp — tint `primary`
   - Total Spent — `inr(totalSpent)` — Receipt — tint `danger`
   - Active Projects — count — Briefcase — tint `amber` (sub: "X completed")
2. **"Received vs Spent" card** — a simple **bar chart built from plain Views**
   (no SVG needed): for each company, two thin vertical or horizontal bars
   (received = indigo, spent = rose) scaled to the max value, with the company's
   short name beneath. Add a small legend (two coloured dots + labels). Keep it light.
3. **"Fund Distribution" card** — for each company a row: name on left, then a
   horizontal **progress bar** (track = border colour, fill = indigo, width = its %
   of total received) and the `%` on the right. This replaces the old pie chart and
   is cleaner + less code.

> You may instead use `react-native-svg` if you prefer real bars, but View-based bars
> are encouraged for minimal code.

### Screen 2 — Companies  (`src/components/Companies.tsx`)
Title "Donor Companies", subtitle "X companies". Header action: **"+ Add"** pill.
- A **search input** (MagnifyingGlass icon) filtering by name / contact / email.
- A vertical list of **company cards**, each showing:
  - Name (bold) + CIN (tiny, uppercase, faint).
  - Three contact rows (contact person, email, phone) — small muted text.
  - A divider, then a 2×2 mini-grid of stats: Received `inr`, Balance `inr`
    (`received-spent`, in emerald), Spent `inr` (rose), Projects (count of projects
    where `companyId` matches).
  - Bottom row: **Edit** (pencil) and **Delete** (trash, rose) text buttons.
- **Add/Edit modal** (`Modal` + `Field`/`Input`): fields Name, CIN, Contact Person,
  Email, Phone, Received (₹, numeric), Spent (₹, numeric). Save → `add`/`update`.
- **Delete** → `Confirm` dialog → `remove`.

### Screen 3 — Financial Years  (`src/components/FinancialYears.tsx`)
Title "Financial Years", subtitle "X periods". Header action: **"+ Add"** pill.
- Vertical list of **FY cards**: a CalendarBlank icon chip (indigo soft) on the left,
  then the FY name (bold) with a green **"Active"** `Pill` if `active`, and below it
  `formatted start – end` dates in muted text. A trash button on the right.
- **Add modal:** Name (e.g. "FY 2026-27"), Start Date, End Date (plain text inputs,
  `YYYY-MM-DD` — no date-picker library), and an **"Mark as active"** checkbox/toggle.
  Save → `add`. (Edit not required; create + delete only.)
- **Delete** → `Confirm` → `remove`.
- Format dates as e.g. `1 Apr 2024` via `new Date(s).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})`.

### Screen 4 — Projects  (`src/components/Projects.tsx`)
Title "CSR Projects", subtitle "X projects". Header action: **"+ Add"** pill.
- **Filters row:** a `Select` for Company ("All Companies" + each), a `Select` for
  Year ("All Years" + each), and a search input (name / category / location).
- Vertical list of **project cards**:
  - Title (bold) + a status `Pill` (active → emerald, completed → indigo) on the right.
  - A meta row (wrap): Company name · Year name · Category · Location · `inr(budget)`
    — small `label: value` pairs.
  - Description line in muted/indigo text.
  - Edit + Delete buttons bottom-right.
- **Add/Edit modal:** Name, Company (`Select`), Financial Year (`Select`),
  Category (`Select` from `CATEGORIES`), Status (`Select` active/completed),
  Location, Budget (₹ numeric), Description (multiline). Save → `add`/`update`.
- **Delete** → `Confirm` → `remove`.
- Resolve `companyId`→name and `yearId`→name via lookups from props.

---

## 7. Run & verify

```bash
cd CSR-Mini-App
npm install
# start an Android emulator or plug in a device, then:
npm run android
```

**Acceptance checklist:**
- [ ] App launches to the **Dashboard** with the indigo header + bottom tab bar.
- [ ] All **4 tabs** switch screens; active tab is highlighted in indigo.
- [ ] Dashboard shows 4 correct stat values + the two chart cards with real numbers.
- [ ] Companies / Years / Projects each render the seed data as attractive cards.
- [ ] **Add / Edit / Delete** work on each (changes appear immediately; reset on restart).
- [ ] Search + filters work on Companies and Projects.
- [ ] No red error screen; no TypeScript errors; ~700–900 lines total across 5 files.

---

## 8. Quick reference — final file tree

```
CSR-Mini-App/
├── App.tsx                      ← theme, mock data, store, primitives, tab bar  (you write)
├── src/components/
│   ├── Dashboard.tsx            ← Screen 1  (you write)
│   ├── Companies.tsx            ← Screen 2  (you write)
│   ├── FinancialYears.tsx       ← Screen 3  (you write)
│   └── Projects.tsx             ← Screen 4  (you write)
├── index.js, app.json, package.json, babel/metro/tsconfig …   ← already set up
└── android/ , ios/                                            ← already set up
```

Build it clean and good-looking. That's the whole job.
