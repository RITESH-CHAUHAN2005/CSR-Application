# CSR Fund Manager — Complete Feature List

App type: React Native Android app (builds to an APK) for managing Corporate Social Responsibility (CSR) funds, projects, companies, and reporting. Backend: shared web-app API on Render (`csr-manager.onrender.com`), JWT auth, MongoDB Atlas `csr_manager` database (same DB used by the website).

---

## 1. Authentication & Session

- Sign in with email + password (email auto-lowercased, no autocorrect).
- Password field with show/hide (eye icon) toggle.
- Inline validation: blocks submit if email/password empty ("Please enter your email and password.").
- Server-side login errors shown in red under the password field; error clears automatically when user starts typing again.
- "Sign in" button shows a busy state ("Signing in…") and disables itself to prevent double submission.
- Submitting via the keyboard's "Go" key also triggers sign-in.
- Login screen shows a demo/admin credential hint box (`admin@csr.com / Admin@123`).
- Footer note explains accounts are admin-created only — no self-registration.
- Keyboard-aware scrolling layout so the keyboard never covers the form.
- **Persistent session** — login is saved to on-device storage (AsyncStorage); closing/reopening the app keeps the user signed in.
- **Auto-login on relaunch** — saved session is silently restored before any screen renders (no login-screen flash).
- **Backend warm-up ping** on app launch to wake a cold Render server before login is attempted (reduces perceived wait, retries up to 3×).
- **Session expiry handling** — if the server rejects an expired/invalid token, the user is auto-logged-out and returned to Login.
- **Sign out** button in the side drawer — clears session and returns to Login.
- Every sign-in/sign-out and failed-login attempt is recorded in the Activity Log automatically.
- Friendly network-error messages instead of raw errors ("Could not reach the server. Check your connection.").

## 2. Roles & Permissions (RBAC)

Three roles: **Admin**, **Editor**, **Viewer**.

- **Admin** — full access: manage data, users, and activity logs.
- **Editor** — can add, edit, and delete records (no user management).
- **Viewer** — strictly read-only; "Add" buttons and edit/delete controls are hidden everywhere, and any accidental write attempt is a no-op.
- Admin-only "Admin Panel" tab (hidden for Editor/Viewer).
- "My Profile" tab shown to Editors/Viewers only (Admins manage their info via Admin Panel instead).
- Every create/update/delete action checks role before hitting the server; failures show a popup alert with the server's error (or a generic fallback).
- Plain-language role descriptions shown at account creation and on the Profile screen.

## 3. Global Navigation & Shell

- Bottom-root / drawer navigation with up to 9 destinations depending on role: Dashboard, Companies, Financial Years, Projects, Fund Receipts, Expenditures, Reports, Admin Panel (admin-only), My Profile (non-admin).
- Hamburger menu opens a slide-in side drawer listing all destinations with icons; current page highlighted.
- Drawer shows app logo, "CSR Manager" title, and current page name as subtitle.
- Drawer closes by tapping the backdrop or an explicit close (X) button.
- Sign-out button pinned to the drawer footer.
- Switching tabs auto-refreshes all underlying data lists (companies, years, projects, receipts, expenditures) from the server.
- Returning to the app from background (foreground resume) silently reloads all data to avoid stale numbers.
- Each data list loads independently — one slow/failed request (e.g., during a cold start) doesn't block other screens.

## 4. Shared UI Components (used across all CRUD screens)

- **Searchable dropdown selector** — auto-shows a search box when a list has 6+ options; type-to-filter; "No matches" state; checkmark on the selected item.
- **Custom calendar date picker** — friendly display format (e.g. "5 Aug 2023") backed by ISO storage; Day → Month → Year drill-down views for fast navigation; prev/next arrows; "Clear" and "Today" shortcuts; highlights today and the selected date.
- **Animated count-up numbers** for stat cards/dashboard values (~1.1s animation).
- Reusable colored **stat cards** (icon, label, value, optional subtitle, optional tap-to-drill-in).
- Colored **status/label pills** with tone variants (primary, success, amber, danger, neutral, accent, violet).
- **Info button + read-only info modal** for viewing a record's extra details/description/notes without edit access (available to all roles, including Viewers).
- **Confirm-delete dialog** on every delete action (Cancel / Delete).
- Generic **modal/bottom-sheet** used for all Add/Edit forms (title bar, close button, scrollable body).
- **Empty-state messaging** on every list instead of a blank screen.
- **"Add" pill button** — hidden entirely for Viewer role.
- Consistent Primary / Secondary / Danger button styling.
- **Currency formatting** — full Indian-style grouped format (₹12,34,567) and a compact/abbreviated format for charts (₹8.5L, ₹1.2Cr, ₹40k), with a manual fallback formatter.

## 5. Dashboard

- Live summary sourced from `/dashboard/summary` (falls back to client-side calculation if the API is slow/unavailable).
- 4 animated stat cards (2×2 grid): Total Balance, Total Received, Total Expenditure, Active Projects — each with a "this year" sub-value; Active Projects also shows "N completed, M total".
- **Year-wise Fund Overview** grouped bar chart (Received vs Expenditure per financial year), with gridlines, value labels, and short-currency axis formatting.
- **Fund Distribution by Company** pie/donut chart with color legend and per-company percentage share; renders a full circle if only one company has funds; empty state if no receipts exist yet.
- **Company Fund Positions** table — sortable (tap any column header to sort asc/desc, with an arrow indicator): Company, Received, Carry Forward, Expenditure, Balance, Number of Projects. Balance is color-coded green/red.

## 6. Companies (Donor Companies)

- List/search companies by Name, Contact Person, or Email (live filter).
- Company cards: colored avatar, name, CIN/registration number, project count, contact block (person/email/phone, each icon-labeled), mini financial stat grid (Received, Carry Forward, Expenditure, Balance).
- **Add/Edit Company** form: Name (required), CIN/Registration No. (auto-uppercased), Contact Person, Phone, Email (validated format), Address (multiline), Notes (multiline). Contextual save label ("Add Company" / "Save Changes").
- **Delete Company** — confirmation warns that it cascades: also removes the company's projects, receipts, and expenditures.
- **Company Detail screen** (full-screen drill-in):
  - Contact Information card.
  - Fund Overview stat tiles (Received, Carry Forward, Total Projects, Active Projects).
  - Year-wise Fund Summary table (per financial year: Received, Carry Fwd In, Expenditure, Balance, Carry Fwd Out).
  - Linked Projects list (name, year/category/location, budget, status pill).
  - Fund Receipts table (Date, Year, Reference, Mode, Carry Forward, Amount).
  - "Edit Company" shortcut button.
- All write actions (Add/Edit/Delete) hidden for non-edit roles; browsing/search/detail view remains available to everyone.

## 7. Projects (CSR Projects)

- List with **Company filter**, **Financial Year filter**, and free-text **search** (Name/Category/Location) — all combine together.
- Project cards: category-colored accent bar, status pill (Active/Completed/On Hold/Cancelled), category chip, location, company + year + budget meta row, start→end date range ("Ongoing" if no end date), description/notes.
- Info popup (read-only, all roles) with Status, Company, Year, Period, Description, Notes.
- **Add/Edit Project** form: Name (required), Company (required), Financial Year (required, restricted to active years), Status, Approved Budget (₹), Category, Location, Start Date (required), End Date, **Ongoing toggle** (clears End Date), Description, Notes.
  - Validation: required-fields alert; separate "Start date required" alert; business rule — if Status is On Hold or Cancelled, Description or Notes must explain why (enforced client-side, matches the shared backend rule).
- **Delete Project** — blocked while status is Active ("mark it Completed before deleting"); confirmation dialog otherwise (matches a server-side delete guard).
- Company↔Project and Year↔Project linkage drives all derived financial calculations app-wide.
- ⚠️ **Known drift vs. the website (2026-07-10) — see Part 2, Phase 2 for the fix plan:** the live shared schema stores a project's companies as an ARRAY (`companyIds`, multi-select on web) and has NO `financialYearId` field at all (the website's Add Project form has no Financial Year picker — end date is auto-computed server-side from whichever Financial Year the Start Date falls into, +3y if Ongoing / +1y if not, and shown as a read-only preview). This app still models Projects as single-company + a required Financial Year field the backend silently ignores, and lets the user hand-pick an End Date that the server then overwrites anyway. Data now saves correctly (the `companyId → companyIds` / `ongoing → derivedStatus` mapping in `src/api.ts` was fixed 2026-07-10), but the screen itself still needs the rework described in Part 2.

## 8. Financial Years

- List of financial years as cards: name, date range, "Active" badge.
- **Independent active toggle per year** — more than one year can be active simultaneously.
- **Add/Edit** form: Name (required), Start Date, End Date, "Mark as active period" checkbox.
- **Delete** with confirmation.
- Active years are visually distinguished (highlighted border/accent).

## 9. Fund Receipts

- List with Company filter, Financial Year filter, and search (reference/mode/company).
- Running total in the header (record count + sum of amounts), recalculated live with filters.
- Receipt cards: company, date, amount (green), reference, payment mode tag, financial year, carry-forward amount, notes.
- **Add/Edit** form: Company (required), Financial Year (required, active years), Amount ₹ (required), Carry Forward ₹, Receipt Date (required), Payment Mode (dropdown, default NEFT), Reference Number, Notes.
- **Delete** with confirmation.
- Read-only info popup for all roles.
- ⚠️ **Known drift vs. the website (2026-07-10) — see Part 2, Phase 3 for the fix plan:** the website has TWO receipt flows — "Record Receipt" (Company required) and "Receipt From Other Source" (a Master Data "Source" value like Interest/SIP/FD required instead; as of today it can ALSO optionally tag a Company, e.g. money received before its project starts). This app has no "Other Source" flow at all — every receipt implicitly requires a Company. The website also made Project optional on a receipt ("No project" is valid) with a "which of this project's companies" narrowing selector when a project has multiple companies — this app has no Project field on a receipt at all. Lastly, the website **removed "Payment Mode" from its form** (kept only for old records) and relabeled "Reference" → "Account Number" — this app still requires Payment Mode and shows "Reference Number".

## 10. Expenditures

- List with Company filter, Financial Year filter, and search (category/approver/description/reference/project/company).
- Running total in the header (record count + sum of amounts).
- Expenditure cards: project, date, company, amount (red), category, financial year, approved-by, reference, description, notes.
- **Add/Edit** form: Project (required — auto-fills Company & Financial Year from the chosen project, Company field becomes locked/read-only), Financial Year (active years), Amount ₹ (required, positive), Date (required), Category, Approved By, Description, Reference Number, Notes.
- **Delete** with confirmation.
- Read-only info popup for all roles.
- ⚠️ **Known drift vs. the website (2026-07-10) — see Part 2, Phase 4:** the website adds a "Carry Forward Amount (₹)" field that only appears when the picked project is Ongoing, and a read-only "Contributing Companies" reference box (how much each company has actually put into that project, from Fund Receipts). Neither exists in this app. The Company field here is locked to one project company because Projects are single-company on mobile (see Phase 2) — full parity on the "narrow to project's companies" behavior depends on that fix.

## 11. Reports

Mirrors the web app's Reports page — charts, tables, and PDF export.

- Shared filters across all tabs: Company, Financial Year, From/To date range (with a "Clear dates" shortcut).
- Segmented tabs: **Year-wise**, **Company-wise**, **Project-wise**.
- **Export to PDF** — generates a PDF of the currently active report tab (title, filter summary, generation timestamp, styled table with totals row) and opens the native share sheet (WhatsApp/Gmail/Drive/Save to Files); shows an "Exporting…" state.
- ⚠️ **Known drift vs. the website (2026-07-10) — see Part 2, Phase 5:** the website has TWO more tabs this app is missing — **Transaction Ledger** (flat chronological list of every receipt+expenditure with a running balance) and **Carry Forward** (unused budget on Ongoing projects, split by each company's actual contribution). The website also exports to **Excel**, not just PDF (viewers can now use both exports too, as of today). This app's chart colors are its own theme constants, not tied to any shared "received=blue/expenditure=amber" convention the website now uses everywhere.

**Year-wise tab:** grouped bar chart (Received / Carry-Fwd In / Expenditure per year) + full data table with a Totals row (Financial Year, Received, Carry Fwd In, Total Available, Expenditure, Balance, Carry Fwd Out).

**Company-wise tab:** grouped bar chart (Received / Expenditure / Balance per company) + donut chart (fund distribution by company, with center total label) + data table with Totals row (Company, Received, Carry Forward, Expenditure, Balance, Project count).

**Project-wise tab:** grouped bar chart (Budget vs Expenditure per project) + donut chart (budget distribution by project) + data table with Totals row (Project, Company, Year, Status pill, Approved Budget, Expenditure, Balance, **Utilization %** — flagged red above 90% utilization).

All tables/charts are horizontally scrollable for phone screens; all figures use Indian Rupee formatting.

## 12. Admin Panel (Admin-only)

- **Summary count cards**: Total Users, Admins, Editors, Viewers — each tappable to open a breakdown popup listing users in that group (animated counters; current admin's own row tagged "You").
- **Add User Account** form: Full Name, Email, Password (show/hide toggle, min 8 chars + 1 letter + 1 number), Role (dropdown, default "editor", with an inline description of what the role can do).
  - Validation: required name, valid email format, duplicate-email check, password strength check — each with a specific inline error message.
  - Success message on creation; form resets automatically.
- **All Users table**: search (name/email/role), paginated (6/page, prev/next + page indicator + range summary), colored role pill per row.
  - **Remove a user** — trash icon per row (not shown for the admin's own account), with a confirmation dialog.
  - Empty state when search has no matches.
- **Activity Logs (system-wide)**:
  - Search across action text + user email.
  - Filter by action category (auto-derived: Signed In, Signed Out, Created, Updated, Deleted, Other).
  - Filter by specific user (auto-derived list of emails).
  - Paginated table (6/page): When, User, Role, Activity.
  - **Share a single log entry** via native share sheet.
  - **Clear All Logs** button (wipes the entire log).
  - Empty state when no logs/matches.

## 13. Profile ("My Profile" — Editor/Viewer)

- Identity card: auto-generated initials avatar, name, role badge, plain-language role description.
- Account Information card (read-only): Full Name, Email, Role, Company.
- **My Activity** card — personal activity log auto-filtered to the signed-in user:
  - Activity count badge.
  - Search box (filters own activity descriptions).
  - Chronological feed with formatted timestamps.
  - Share a single entry via native share sheet.
  - Pagination (8/page) shown only when needed.
  - Empty state ("your actions will appear here").

## 14. Activity Log / Audit Trail (system-wide behavior)

- Every sign-in, sign-out, failed login, and create/update/delete action across the entire app is recorded with timestamp, acting user's email, role, and a human-readable description (e.g. `Added company "Tata Consultancy Services"`).
- Role-aware visibility: Admins see everyone's log (via Admin Panel); Editors/Viewers only ever see their own (via Profile) — enforced server-side through separate endpoints.
- Human-friendly timestamp formatting (e.g. "30 Jun 2026, 10:34 am").
- Cascading deletes are logged too (e.g. deleting a company removes and logs the removal of its projects/receipts/expenditures).

## 15. Backend / Data Layer Notes (not user-facing screens, but power the above)

- JWT-based auth with automatic token persistence (AsyncStorage) and automatic logout on 401/expired token.
- Centralized error-message normalization — surfaces the most specific validation reason available (field-level Zod errors → generic error/message → errors array → network fallback) so form error messages are always meaningful.
- Server-computed dashboard/report aggregates (`/dashboard/summary`, `/reports/year-wise`, `/reports/company-positions`) ensure the app and the website always show identical numbers — no client-side drift.
- Generic CRUD engine shared across Companies, Financial Years, Projects, Fund Receipts, and Expenditures, with per-resource field-shape translation to tolerate backend schema differences (e.g. Projects store `companyIds` as an array + a derived `derivedStatus` field under the hood, translated to a simple single-company + "ongoing" toggle in the UI).
- Defensive data coercion utilities: safe number parsing for amounts/budgets, cross-runtime-safe date parsing (guards against a Hermes-vs-Node date-parsing mismatch), and Mongo ID normalization.
- No pagination or server-side filtering on list endpoints currently — all list/report data is fetched in full and filtered/searched client-side.
- No file/document upload feature exists anywhere in the app currently, and no Master Data screen exists — see Part 2, Phases 1 and 6.

---

### Data entities at a glance (current app model — see Part 2 for the corrected shared-schema shapes)
**Companies** · **Financial Years** (multiple can be active) · **Projects** (linked to Company + Year) · **Fund Receipts** (money in, linked to Company + Year) · **Expenditures** (money out, linked to Project + Company + Year) · **Users** (Admin/Editor/Viewer) · **Activity Logs**

---
---

# PART 2 — Gap Analysis & Phased Roadmap to Full Website Parity

_Compiled 2026-07-10 by comparing this app against `CSR Manager Website` (same Render backend, same MongoDB `csr_manager` database — no backend/database work is needed for almost everything below; this is overwhelmingly a mobile-frontend rework to catch up to schema/UX changes already live on the shared API)._

Phases are ordered by dependency — earlier phases unblock later ones (e.g. Master Data's Category/Source lists are consumed by Projects/Expenditures/Fund Receipts; Projects' multi-company model unblocks full parity on Fund Receipts/Expenditures narrowing).

## Phase 1 — Master Data (foundational)
**Frontend:** New "Master Data" screen, 3 tabs (Category/Status/Source), each a simple list + Add/Edit modal (single "value" text field) + delete, gated to Admin+Editor only (hidden for Viewer, matching the website's 2026-07-10 change). Add a `masterData` resource to `src/api.ts` (`GET/POST/PUT/DELETE /api/master-data`, payload `{type, value}`). Replace the free-text Category input on Projects/Expenditures, and add a Source dropdown on Fund Receipts, both sourced from this list instead of free text.
**Backend:** None — `/api/master-data` already exists, shared, generic CRUD.
**Database:** None — `masterdataitems` collection already seeded (Category: Education, Environment, Skill Development, Healthcare, Infrastructure, Women Empowerment, Rural Development; Status: Active, Not Active; Source: Interest, SIP, FD, Bank Deposit).

## Phase 2 — Projects rework
**Frontend:** Replace the single Company picker with a multi-select (checkbox list) writing `companyIds: string[]`. Remove the "Financial Year" field entirely (the live schema has none — it's a dead field today). Remove the manual End Date picker; replace with a read-only "auto-computed" preview (start date's Financial Year end date, +3 years if Ongoing, +1 year if not — port the website's `previewProjectEndDate` logic). Replace the `ongoing` boolean with an explicit `derivedStatus: 'ongoing'|'other'` to match the server field name/shape. Update the `Project` type in `App.tsx` accordingly.
**Backend:** None — `computeProjectDates` middleware and Zod validation already enforce this identically for any client.
**Database:** None.

## Phase 3 — Fund Receipts rework
**Frontend:** Add the second "Receipt From Other Source" flow (Source dropdown from Master Data, Company becomes optional instead of required). Add an optional Project field to every receipt ("No project" default), plus a "which of this project's companies" narrowing selector when the chosen project has more than one company (depends on Phase 2). Drop the "Payment Mode" field to match the website (kept only for legacy display, no longer collected). Rename "Reference Number" label to "Account Number". Update `FundReceipt` type and `src/api.ts`'s `receipts` mapping to carry `receiptType`, `source`, `projectId`.
**Backend:** None — schema/validators already support all of this.
**Database:** None.

## Phase 4 — Expenditures enhancements
**Frontend:** Add a "Carry Forward Amount (₹)" field, shown only when the linked project is Ongoing (real schema field `carryForwardAmount`, already exists). Add a read-only "Contributing Companies" info box once a Project is picked — sum each company's actual Fund Receipts against that project (`receiptType === 'company'` only), client-computed the same way the website does it. Full "narrow Company by project" parity depends on Phase 2 (multi-company Projects).
**Backend:** None — `carryForwardAmount` already on the shared schema.
**Database:** None.

## Phase 5 — Reports expansion
**Frontend:** Add two tabs — **Transaction Ledger** (flat chronological receipts+expenditures list with a running balance column) and **Carry Forward** (unused Ongoing-project budget split by each company's actual contribution — reuse the same computation as Phase 4's Contributing Companies box). Add an **Excel export** option alongside the existing PDF export (call the shared `/reports/export/excel` endpoint and share the returned file, same pattern as the current PDF share-sheet flow). Optionally align chart colors with the website's shared "received=blue / expenditure=amber" convention for visual consistency.
**Backend:** None — Ledger/Carry Forward are computed client-side on the website too (no dedicated endpoint to port); Excel export endpoint already exists and is shared.
**Database:** None.

## Phase 6 — Document Attachments (new capability)
**Frontend:** Add attachment UI to Project and Expenditure screens: file picker (image/PDF, capped at 5 files / 8MB each to protect the Atlas free-tier quota), thumbnail/icon list, delete (write roles only), tap-to-download. Add a "staged" pre-create flow — hold picked files locally and upload them right after the record is created (mirror the website's partial-failure messaging: "created, but N of M documents failed to upload"). Add `projectDocuments`/`expenditureDocuments` resources to `src/api.ts` (list/upload-multipart/download/delete).
**Backend:** None — both endpoint sets already exist and are role-gated identically to what's needed (`requireWrite` for upload/delete, any role for list/download).
**Database:** None — files are stored as `Buffer` fields directly in MongoDB (not on Render's ephemeral disk), so they already survive backend redeploys; just respect the same 8MB/file, 5-files/parent caps client-side to avoid confusing errors from the shared backend.

## Phase 7 — Roles & access verification checklist
No code gaps found here — this is a confirm-only phase:
- ✅ Viewer can already export Reports on mobile (button has no role gate) — matches the website's 2026-07-10 change.
- ✅ Admin Panel (stat-card breakdowns, Add User, Activity Logs with search/filter/share/clear) already at full parity with the website.
- ✅ Dashboard and Company Detail (as a modal) already cover the same 5 sections as the website.
- ⬜ New in Phase 1: gate the Master Data screen to Admin+Editor only once it's built.

## Phase 8 — Visual/theme polish (optional, low priority)
Native apps don't need pixel parity with a web app, so treat this phase as nice-to-have, not urgent:
- Website's login card is now glassmorphism (translucent/blurred) with a transparent-background logo; mobile's is a solid white card with a boxed logo. Cosmetic-only fix if desired.
- Website has a full light/dark theme toggle; mobile has one fixed theme. A mobile dark mode is a large lift (re-theming every screen's inline styles) — only take this on if there's a specific ask for it, not as part of catching up on functional parity.

### Corrected data entities (shared schema, as of 2026-07-10)
**Companies** · **Financial Years** (multiple can be active) · **Projects** (`companyIds` array, NO financial year field, `status` + `derivedStatus`) · **Fund Receipts** (`receiptType: 'company'|'other_source'`, optional `companyId`, optional `source`, optional `projectId`) · **Expenditures** (`projectId` + `companyId` + `financialYearId`, optional `carryForwardAmount`) · **Master Data** (Category/Status/Source value lists) · **Project/Expenditure Documents** (file attachments, ≤8MB/file, ≤5/parent) · **Users** (Admin/Editor/Viewer) · **Activity Logs**
