# CSR Fund Manager — Feature & Behaviour Spec

**Purpose of this document.** The website (React + Vite) and the Android app (React Native) share **one backend and one MongoDB database**. The website is the source of truth for behaviour. This document describes what the system does *today*, so the app can be built to match it exactly. Where the app currently differs, it is called out as **[APP TODO]**.

- Backend: Express + Mongoose on Render — `https://csr-manager.onrender.com`, base path `/api`.
- Database: MongoDB Atlas, `csr_manager`. **No automated backups** (free M0 tier) — never run a destructive script against it without dumping first.
- Auth: JWT.

---

## 1. Data model

Seven collections. Anything an app screen shows is either one of these fields or is derived from them at read time — **no totals, balances, or "spent" figures are stored**.

### Company
`name` (required) · `cin` · `contactPerson` · `email` · `phone` · `address` · `notes`

### FinancialYear
`name` ("FY 2025-26") · `startDate` · `endDate` · `isActive`

Dates are ISO `yyyy-mm-dd` strings and are compared as strings. **More than one year can be active at the same time** — this is intentional, not a bug.

### Project
`name` (required) · `companyIds[]` · `budget` · `category` · `location` · `status` · `derivedStatus` · `startDate` (required) · `endDate` · `description` · `notes`

- A project is funded by **one or more companies**. There is no financial year on a project.
- **`companyIds`** is just the list of funding companies. The server dedupes it on every write; there is no per-company pledged amount anywhere in the system.
- **`budget`** is the project's *approved cost*, entered by the user.
- `status` — `active` | `completed` | `on_hold` | `cancelled`
- `derivedStatus` — `ongoing` | `other` (shown as "Ongoing" / "Other than Ongoing")

### FundReceipt (money in)
`date` (required) · `receiptType` · `companyId` (required) · `source` · `financialYearId` (required) · `projectId` · `reference` · `amount` (required) · `notes` · `mode`, `carryForward` *(legacy)*

- **`receiptType`** — `company` (a donor company's direct contribution) or `other_source` (income *earned on* that company's funds — Interest, SIP, FD…, picked from Master Data).
- **`companyId` is required for both types.** Money always arrives on behalf of some company. **[APP TODO]** — the app must not offer a "no company" option.
- `projectId` is **optional** — money can be received before it is allocated to a project.
- `reference` is labelled **"Account Number"** in the UI (the field name stays `reference` to avoid a data migration). Each receipt carries its own account number — companies do not share one.
- A receipt can carry up to **5 proof documents** (photo / PDF / doc / CSV, 8 MB each) — optional. See §8.
- `mode` (NEFT/RTGS/Cheque) and `carryForward` are **legacy**: still read for historical records, never collected on the form. **[APP TODO]** — remove the Payment Mode dropdown and the Carry Forward field from the receipt form.

### Expenditure (money out)
`date` (required) · `projectId` (required) · `companyId` (required) · `financialYearId` (required) · `category` · `approvedBy` · `amount` (required) · `carryForwardAmount` · `description` · `reference` · `notes`

- `carryForwardAmount` = unused budget rolled into the next year. It is stored **per expenditure**, not on the project, and is **only meaningful when the project's `derivedStatus === 'ongoing'`**. The server stores `0` otherwise.

### MasterDataItem
`type` (`category` | `status` | `source`) · `value` — the editable dropdown value-lists.

### User / AuditLog
`User`: `name`, `email`, `role` (`admin` | `editor` | `viewer`), optional `companyId`. No self-registration.
`AuditLog`: every mutating request, with a field-level before→after diff.

---

## 2. The money concepts (read this before building any screen)

These are constantly confused, and every reporting bug traces back to mixing them up:

| | What it is | Where it lives |
|---|---|---|
| **Received** | What a company *actually paid* | Sum of `FundReceipt.amount` where `projectId` + `companyId` match and `receiptType === 'company'` |
| **Budget** | The project's approved cost | `Project.budget` |
| **Spent** | Sum of `Expenditure.amount` for the project | Derived |
| **Utilization %** | Spent ÷ **Budget** | Derived |

There is **no "committed"/"pledged" amount** in the system. A project records *which* companies fund it; how much each actually paid comes only from its Fund Receipts.

An `other_source` receipt is **not** a contribution — it never counts toward a project's "Received", even though it does count toward that company's overall `totalReceived` on the Dashboard.

---

## 3. Authentication & session

- Sign in with email + password. Accounts are **admin-created only**; there is no sign-up.
- JWT, **1-day expiry**. Two transports:
  - **httpOnly cookie** `csr_token` (`secure` + `sameSite=none` in production, since the frontend and backend are on different domains).
  - **`Authorization: Bearer` fallback** — the login response also returns the raw `token`. **The mobile app must use this**, storing it in AsyncStorage; cookies are not workable across the split-domain setup.
- Session is restored via `GET /auth/me`. A rejected/expired token must log the user out and return them to Login.
- Report-download endpoints (`/reports/export/...`) additionally accept `?token=` in the query string, because a native file download can't set headers.
- **Rate limits:** 600 requests / 15 min globally; **10 failed logins / 15 min** on `/auth/login` (successful logins don't count).
- Every sign-in, failed sign-in, and create/update/delete is written to the Activity Log automatically.

## 4. Roles & permissions

| | Read | Create / Edit / Delete | User mgmt + Activity Logs |
|---|---|---|---|
| **Admin** | ✅ | ✅ | ✅ |
| **Editor** | ✅ | ✅ | ❌ |
| **Viewer** | ✅ | ❌ | ❌ |

Enforced **server-side** (`requireWrite` = admin + editor; `requireAdmin` for `/users` and `/logs`). Hiding buttons on the client is convenience only — never a security control. Every signed-in role can see the Dashboard.

---

## 5. Screens

### 5.1 Dashboard
- Four stat cards, each with a "this year" sub-value: **Total Balance**, **Total Received**, **Total Expenditure**, **Active Projects** (+ "N completed, M total").
- Bar chart — **Year-wise Fund Overview** (Received vs Expenditure per FY).
- Doughnut — **Fund Distribution by Company** (share of total received), with the total in the centre and a legend showing percent + amount.
- Table — **Company Fund Positions**: Company, Total Received, Carry Forward, Expenditure, Balance, Projects.

All of it comes from `GET /dashboard/summary` so the app and website can never drift apart. Don't recompute it client-side.

### 5.2 Companies
- Card grid; live search over name, CIN, contact person, email.
- **Add/Edit**: Name (required), CIN, Contact Person, Phone, Email, Address, Notes.
- **Delete does NOT cascade.** Deleting a company removes only the company document — its projects, receipts and expenditures survive as orphans. **[APP TODO]** — the app's delete dialog currently *claims* it cascades. Fix the copy; don't implement a cascade.
- **Company Detail**: contact tile · Fund Overview (Received, Carry Forward, Expenditure, Current Balance, Total/Active Projects) · Year-wise Fund Summary table · Projects table · Fund Receipts table (Date, Year, Account Number, Amount).

Carry Forward for a company = its receipts' legacy `carryForward` + its expenditures' `carryForwardAmount`.
Current Balance = Received + Carry Forward − Expenditure.

### 5.3 Financial Years
- Cards: name, date range, "Active" pill, an independent active/inactive toggle, delete.
- **Add** form only (no edit modal): Name, Start Date, End Date, "Mark as active" (default on).
- Several years may be active simultaneously.

### 5.4 Projects
- List with Company filter + free-text search (name, category, location, description, company names).
- **Add/Edit form:**
  - **Name** (required).
  - **Companies** (required, ≥1): a plain checkbox list of companies. No per-company amount — that is not a concept in this app.
  - **Approved Budget (₹)** — typed by the user.
  - **Status**, **Derived Status**, **Category** (from Master Data), **Location**, **Start Date** (required, never in the future), **Description**, **Notes**, **Attach Document**.
  - **End Date is read-only and derived server-side** — see §7.
  - Business rule: `on_hold` or `cancelled` requires a Description or Notes explaining why.
- **Delete is blocked while `status === 'active'`** (HTTP 409) — for everyone, including admins. Mark it Completed first. Deleting a project also deletes its attached documents.

### 5.5 Fund Receipts
Two entry buttons: **Record Receipt** (`receiptType: 'company'`) and **Receipt From Other Source** (`receiptType: 'other_source'`).

Shared fields: Financial Year (**active years only**), Project (optional), Receipt Date (required, not in the future), Attach Proof (optional), Notes.

- **Other Source**: adds a required **Source** dropdown (Master Data `source`) and a required **Company** dropdown, plus a single Amount and a single Account Number.
- **Record Receipt with no project selected**: a single **Donor Company** dropdown + a single Amount + a single Account Number.
- **Record Receipt with a project selected** → the form switches to a **per-company grid**, and the single Account Number field disappears (each company banks from its own account):

  | Company | Account Number | Amount |
  |---|---|---:|
  | ABC Ltd | `[____________]` | `[______]` |
  | XYZ Pvt | `[____________]` | `[______]` |

  Fill in whichever companies paid; leave the rest blank (a blank/zero Amount skips the row entirely). The shared date and financial year are entered once at the top. A running **Total** shows under the grid.

  **Every filled row becomes its own ordinary `FundReceipt` document**, with its own account number. They appear individually in the list and are individually editable and deletable. This is a data-entry shortcut, not a storage change — the audit trail is unaffected.

  The batch is **all-or-nothing**: if any row fails validation, nothing is written (`POST /fund-receipts/bulk`).

- **Attach Proof** (optional): photo / PDF / doc / CSV, up to 5 files × 8 MB per receipt. On a grid entry, each staged file is attached to **every** receipt the entry creates.
- **Editing** is always single-record, whatever the project. Deleting a receipt also deletes its proof documents.
- List columns: Date · Donor Company / Source · Year · Project · Account Number · Amount. Header shows record count + running total, recalculated with the filters (Company, Year, search).

### 5.6 Expenditures
- **Project** (required) drives everything: it narrows the **Company** dropdown to that project's companies and auto-selects when there is only one.
- **Financial Year** is chosen independently and is limited to **active** years. When editing a record whose year has since gone inactive, that year stays selectable so old data isn't corrupted.
- **Carry Forward Amount** only appears when the chosen project is **Ongoing**; it is forced to `0` otherwise.
- Also: Amount (required), Date (required), Category (Master Data), Approved By, Description, Reference, Notes, Attach Document.
- A read-only **Contributing Companies** panel shows who has funded the project so far.
- List: Date, Project, Company, Year, Category, Approved By, Amount. Filters: Company, Year, search.

### 5.7 Master Data
Three tabs — **Category**, **Status**, **Source** — each a simple list of values with add/edit/delete. These populate the Category dropdowns (Projects, Expenditures) and the Source dropdown (Other-Source receipts). Deleting a value does not rewrite records that already use it.

**[APP TODO]** — this screen does not exist in the app yet.

### 5.8 Reports
Filters: Company, Financial Year. Five tabs:

1. **Transaction Ledger** — bar chart + table: Type, Date, Company, Project, FY, Base Amount, Carry Forward, running Total Balance.
2. **Year-wise** — bar (Received / Carry In / Expenditure) + pie (expenditure share). Table: Financial Year, Funds Received, Carry Forward In, Total Available, Expenditure, Balance, Carry Forward Out.
3. **Company-wise** — bar + pie. Table: Company, Total Received, Carry Forward, Expenditure, Balance, Projects.
4. **Project-wise** — bar (Budget vs Spent, top 10) + pie (projects by status). Table: **Project, Company, Period, Budget, Received, Spent, Utilization %, Status**.
5. **Carry Forward** — table: Project, Company, Contribution %, Carry Forward Share, Rolls Into. Only Ongoing projects with carry-forward > 0; the amount is split across contributing companies in proportion to what each actually paid.

**Export**: server-generated **PDF** and **Excel** via `GET /reports/export/{pdf|excel}?type=<tab>`. The website falls back to browser-print / client-side CSV when the API is unavailable; the app should just use the server endpoints and hand the file to the native share sheet.

### 5.9 Admin Panel *(admin only)*
- Stat cards — Total Users / Admins / Editors / Viewers; tapping one lists those users.
- **Add User**: Name, Email, Password (**min 8 chars, ≥1 letter, ≥1 number**), Role.
- **All Users** table with delete. **Cannot delete your own account, and cannot delete the last remaining admin.**
- **Activity Logs**: search + filter by action and by user; each row expands to the field-level before→after diff; share a single entry; "Clear Logs" wipes the collection.

### 5.10 Document attachments
Supported on **Projects**, **Expenditures** and **Fund Receipts** (there labelled "Attach Proof"). Bytes are stored in MongoDB (no disk on the free tier). Any file type — photo, PDF, doc, CSV.

- **Max 5 documents per record, max 8 MB each** — enforced on the server (409 / 413).
- Upload/delete require write permission; **any signed-in role can list and download**.
- Downloads are served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` — an uploaded `.svg` or `.html` must never render in-browser.
- On a *new* record, files are staged locally and uploaded after the record is created; partial upload failures are reported without losing the record.
- **Deleting the parent record deletes its documents** (server-side cascade) — no orphaned blobs.

**[APP TODO]** — the app has no upload feature at all yet.

---

## 6. API contract

Standard REST, all under `/api`, all requiring authentication:

```
GET    /companies            GET/POST/PUT/DELETE   … /:id
GET    /financial-years      …
GET    /projects             …
GET    /fund-receipts        …
POST   /fund-receipts/bulk   { receipts: [ …FundReceipt ] }   ← multi-company entry
GET    /expenditures         …
GET    /master-data          …

GET    /projects/:id/documents        POST (multipart "file")  GET /:docId/download  DELETE /:docId
GET    /expenditures/:id/documents    …
GET    /fund-receipts/:id/documents   …

GET    /dashboard/summary
GET    /reports/year-wise
GET    /reports/company-positions
GET    /reports/export/{pdf|excel}?type={year|company|project|carryForward|ledger}

POST   /auth/login    GET /auth/me    POST /auth/logout
GET    /users   POST /users   DELETE /users/:id          (admin)
GET    /logs    GET /logs/mine   DELETE /logs            (admin; /mine for self)
```

**`POST /fund-receipts/bulk`** validates every row *before writing any of them* — a rejected batch stores nothing. It returns the array of created receipts. Use it whenever a project's companies are entered together.

Reads are open to every authenticated role; writes are admin + editor. Every list endpoint returns the **full collection** — there is no server-side pagination or filtering, so filter and search on the client.

---

## 7. Server-derived values — do not compute these in the app

- **Project `endDate`** is never accepted from the client. The server finds the financial year that the project's **start date** falls into (not today's date, so backdated projects work), then:
  - `derivedStatus === 'ongoing'` → end of the FY **3 years** later.
  - otherwise → end of the FY **1 year** later.
- **Project `companyIds`** is deduped on every create and update; blank ids are dropped.
- **Dashboard and report aggregates** come from `/dashboard/summary`, `/reports/year-wise`, `/reports/company-positions`.

## 8. Rules the server enforces (and the app must not bypass)

- New fund receipts and expenditures can only be booked against an **active** financial year (400 otherwise). This is checked on **create only** — editing an old record whose year has since gone inactive still works.
- A project with `status === 'active'` **cannot be deleted** (409).
- `startDate` (Project) and `date` (FundReceipt) **cannot be in the future**.
- `on_hold` / `cancelled` projects must carry a Description or Notes.
- Deleting a company, financial year, or master-data value **does not cascade**.
- Every write is Zod-validated and audit-logged with a before→after diff.

---

## 9. Client-side conventions worth copying

- **Currency**: full Indian grouping (₹12,34,567) everywhere; abbreviated form (₹8.5L, ₹1.2Cr, ₹40k) on chart axes only.
- **Dates**: ISO `yyyy-mm-dd` in storage and on the wire; `5 Aug 2023` on screen.
- **Errors**: surface the most specific reason available — field-level Zod errors → server `message` → network fallback ("Could not reach the server").
- **Empty states** on every list rather than a blank screen.
- **Cold starts**: the Render free tier sleeps. Ping `/api/health` on launch and retry; expect the first request after idle to take ~30 s.
