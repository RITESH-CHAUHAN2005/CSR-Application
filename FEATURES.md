# CSR Fund Manager — Feature & Behaviour Spec

**Purpose of this document.** The website (React + Vite) and the Android app (React Native) share **one backend and one MongoDB database**. The website is the source of truth for behaviour. This document describes what the system does *today*, so the app can be built to match it exactly. Where the app currently differs, it is called out as **[APP TODO]**.

- Backend: Express + Mongoose on Render — `https://csr-manager.onrender.com`, base path `/api`.
- Website: `https://wheat-aardvark-709394.hostingersite.com`.
- Database: MongoDB Atlas, `csr_manager`. **No automated backups** (free M0 tier) — never run a destructive script against it without dumping first.
- Auth: JWT.

---

## 0. What changed on 2026-07-14 — the app's migration checklist

The backend and database have **already been migrated**. The live API now speaks the schema below, so **an app build that still posts the old fields will fail**. Work through this list; the rest of the document is the full spec.

### 0.1 Breaking — the app will get a `422` until these are fixed

| # | Change | What the app must do |
|---|---|---|
| 1 | **`Expenditure.category` removed** | Stop sending it. Delete the Category dropdown from the expenditure form. |
| 2 | **`Expenditure.carryForwardAmount` removed** | Stop sending it. Delete the Carry Forward *input*. Carry forward is now computed — §2. |
| 3 | **`notes` removed from every model** (Company, Project, FundReceipt, Expenditure) | Rename every Notes field to **`description`** in the payloads, and relabel the input "Description". Do not send `notes`. |
| 4 | **`Expenditure.date` can no longer be in the future** | Cap the date picker at today. The server 422s a future date. |
| 5 | **`Company.pan` is format-checked** | If you send `pan`, it must match `^[A-Z]{5}[0-9]{4}[A-Z]$`. An empty string is fine. Uppercase it before sending. |
| 6 | **`on_hold` / `cancelled` projects need a Description** | The old rule accepted "description *or* notes". Notes is gone, so a Description is now mandatory for those two statuses. |

Nothing was lost: the migration folded old `category` and `notes` text into each record's `description`.

### 0.2 New fields to surface (not breaking, but the point of the release)

| # | Field | Where it goes |
|---|---|---|
| 7 | **`Company.pan`** | Company form, list column, and detail header next to CIN. |
| 8 | **`Project.projectCode` — the "Project ID"** | **Everywhere a project is named**: project list/detail, the expenditure and receipt forms' project dropdown (`RURA2025 — Rural Uplift`), every list column, every report. **Read-only — the server issues it.** See §7. |
| 9 | **`Project.interventionPartner`** | Free-text field on the project form + detail. |
| 10 | **`MasterDataItem.description`** | Show it under each Category value, and under the chosen category on the project form. It carries the Schedule VII clause. |

### 0.3 Behaviour changes

| # | Change | Detail |
|---|---|---|
| 11 | **Carry forward is derived, never typed** | `max(0, received − spent)` per (Ongoing project × company). New endpoint `GET /reports/carry-forward`. Full rules in §2 — **read that section before touching any report screen.** |
| 12 | **Company Balance formula fixed** | `Balance = Received − Expenditure`. Carry Forward is a *slice of* that balance, **not added to it**. The old `received + carryForward − expenditure` double-counted. |
| 13 | **Year-wise flow chains** | Each FY's closing balance is the next FY's `carryForwardIn`. Those columns are running positions — **never sum them down a column**. |
| 14 | **Non-Ongoing projects end WITH their start FY** | Was: start FY + 1 year. Now: that FY's own end date. Server-derived either way. |
| 15 | **Master Data Categories are the 12 Schedule VII heads** | Exactly 12, (i)–(xii). Clause (ix)'s two limbs are one category. Every other category value was deleted and the projects using them remapped. |
| 16 | **No cap on attachment count** | Was 5 per record. Now unlimited, multi-select picker. Per-file cap is **15 MB** (was 8 MB) and **cannot be lifted** — see §5.10. |
| 17 | **Every Reports tab has a search box** | Top-left, above the table, on its own line. Matches any text column (Project ID / project / company). Filters the table only, not the charts. See §5.8 for the exact layout. |

### 0.4 Things that were built and then removed — do NOT build them

Briefly present on 2026-07-14, then withdrawn. If you see them in an older draft of this doc, ignore it:

- `Expenditure.natureOfExpense` (Project Intervention / Administrative Overheads / Impact Assessment / Capital Asset / Any Other)
- `Expenditure.capitalAsset { particulars, address, district, state, pinCode, dateOfCreation }`
- `Expenditure.fundingRoute` (Direct / Through Intervention Partner)

An expenditure is deliberately minimal: **project, company, financial year, amount, date, approved by, description.** That's it.

---

## 0.5 What changed on 2026-07-15 — help desk, self-service passwords, wider exports

A second release layered on top of 2026-07-14. The headline is an **admin-mediated password recovery + help-desk** flow (there is no email/SMTP anywhere), a **self-service Change Password**, a **Source** filter/column on Fund Receipts, richer Company detail, a chart on the Carry Forward report, and **server-generated PDF/Excel exports on nearly every list page**. The backend and database parts below are what an app build must match; the rest is UI parity.

### 0.5.1 Backend / DB — the app must handle these

| # | Change | What the app must do |
|---|---|---|
| 1 | **New collection `SupportRequest`** (the help desk). Fields: `userId`, `name?`, `email?`, `type` (`'password'` \| `'general'`), `subject?`, `message?`, `status` (`'pending'` \| `'approved'` \| `'rejected'` \| `'resolved'`, default `pending`), `reply?`, `resolvedByEmail?`, timestamps. | Add the model + screens described below. |
| 2 | **Old `PasswordResetRequest` model REMOVED**, and the old **`/api/users/reset-requests*` routes REMOVED.** | Any app build still calling `/users/reset-requests…` will now 404 — move to the endpoints in §0.5.2. |
| 3 | **New `User` field `mustChangePassword: boolean`** (default `false`). It is **kept in API responses** (not stripped in `toJSON`, unlike `passwordHash`/`loginAttempts`). | When `true`, force the user through a password change before letting them use the app; clear it by calling `/auth/change-password`. |
| 4 | **Password recovery is admin-mediated — no email is ever sent.** The temporary password pattern is **`<firstname>@apl123`** — the first name token, lowercased (e.g. "Ravi Kumar" → `ravi@apl123`). | The login screen gets a "Forgot password?" flow (email only, §0.5.2). Recovery is: user asks → admin approves → admin tells the user the temp password out-of-band → user logs in and is forced to change it. |

### 0.5.2 New / changed endpoints

All are live now. `forgot-password` is public (rate-limited); the rest need auth; `/support-requests` admin actions need `requireAdmin`.

| Method + path | Access | Body | Effect |
|---|---|---|---|
| `POST /auth/forgot-password` | **public**, rate-limited (shares the login limiter) | `{ email }` | Creates a `type:'password'` SupportRequest for that user. **Anti-enumeration: always returns `{ ok: true }`**, whether or not the email exists — never leak account existence. |
| `POST /auth/change-password` | auth | `{ currentPassword, newPassword }` | Verifies the current password, sets the new one, **clears `mustChangePassword`**. `newPassword` obeys the same policy as user creation (min 8 chars, ≥1 letter, ≥1 number). |
| `POST /support-requests` | auth | `{ subject, message }` | Files a **general** help-desk ticket for the caller. |
| `GET  /support-requests/mine` | auth | — | The caller's own tickets, including any admin `reply`. |
| `GET  /support-requests` | **admin** | — | The **pending** queue (both password and general). |
| `POST /support-requests/:id/approve` | **admin** | — | **Password tickets only.** Resets that user to the temporary password `<firstname>@apl123`, sets their `mustChangePassword = true`, marks the ticket `approved`. Returns **`{ id, tempPassword }`** so the admin can read the temp password back to the user. |
| `POST /support-requests/:id/reject` | **admin** | — | Marks the ticket `rejected`. |
| `POST /support-requests/:id/reply` | **admin** | `{ reply }` | Replies to a **general** ticket and marks it `resolved`. The reply surfaces on the user's "My Requests" list. |

### 0.5.3 Roles / navigation

- **"My Dashboard"** (the personal profile page) is now **editor + viewer only — admins do NOT have it.** It holds three things: self-service **Change Password**, a **Raise a Request** help-desk form (files a `general` ticket), and a **My Requests** list that shows the admin's replies.
- **Admins** get **Change Password** inside the **Admin Panel** instead, which also gains the **Help Desk Requests** queue. Each queued row carries a **type badge — "Password" vs "General"** — so the admin knows whether to *approve* (reset the password) or *reply* (answer a question).

### 0.5.4 UI-only changes (no API impact — match for parity)

- **Fund Receipts**: a new **Source** filter on the list; the old "Donor Company / Source" column now reads **`Company — Source`** (company first). See §5.5.
- **Company detail**: shows **CIN & PAN** as labeled fields, and a **Source** column in its fund-receipts table. See §5.2.
- **Reports**: the explanatory prose blurbs were **removed** from the report tabs — **totals and actionable warnings are kept**. The **Carry Forward** tab gains a **bar chart** (Received vs Spent vs Carry Forward) plus a **pie chart** (each project's share of total carry forward). See §5.8.
- **Exports**: every list page now has **Export PDF / Export Excel** *except* the **Dashboard** and **Financial Years** — plus **Company detail** (a comprehensive per-company report) and **Admin → Activity Logs**. Driven by the export types in §5.11 / §6.
- **Master Data**: the descriptive hint/placeholder texts were removed (the Schedule VII blurb, "e.g. Active, Not Active", "e.g. Interest, SIP, FD", etc.). The value + description fields themselves are unchanged.

---

## 1. Data model

Seven collections. Anything an app screen shows is either one of these fields or is derived from them at read time — **no totals, balances, or "spent" figures are stored**.

> **There is no `notes` field anywhere.** Company, Project, FundReceipt and Expenditure each have exactly one free-text field: **`description`**.

### Company
`name` (required) · `cin` · `pan` · `contactPerson` · `email` · `phone` · `address` · `description`

- **`pan`** — the company's Permanent Account Number. Optional, but when supplied it must match `[A-Z]{5}[0-9]{4}[A-Z]` (e.g. `AAACT2727Q`) or the write is rejected with a 422. Stored uppercase. **[APP TODO]** — add PAN to the company form, list and detail.

### FinancialYear
`name` ("FY 2025-26") · `startDate` · `endDate` · `isActive`

Dates are ISO `yyyy-mm-dd` strings and are compared as strings. **More than one year can be active at the same time** — this is intentional, not a bug.

### Project
`name` (required) · `projectCode` · `companyIds[]` · `budget` · `category` · `location` · `interventionPartner` · `status` · `derivedStatus` · `startDate` (required) · `endDate` · `financialYearId` · `description`

- **`projectCode` is the Project ID**: the first 4 letters of the name + the start year of its financial year, e.g. `RURA2025`. Two projects can never share one — a clash gets `-2`, `-3`. **Never sent by the client**; the server issues it, exactly like `endDate` and `financialYearId`. It is stable across renames, and is only re-issued if the project's financial year changes. Everything still links by `_id`, never by code. **[APP TODO]** — show the Project ID everywhere a project appears; never let the user type it.
- **`interventionPartner`** — free text: the implementing agency/NGO delivering the project, when it isn't run directly. Editable, optional. **[APP TODO]** — add the field to the project form and detail.
- **`financialYearId`** is the financial year the project belongs to. It is **not entered by the user** — the server sets it to the FY the **start date** falls into. Read-only; shown auto-filled on the form. **[APP TODO]** — show a read-only "Financial Year" field on the Project form and a "FY" line in the list/detail; never let the user type it.
- **`companyIds`** is just the list of funding companies. The server dedupes it on every write; there is no per-company pledged amount anywhere in the system.
- **`budget`** is the project's *approved cost*, entered by the user.
- **`category`** must be one of the 12 Schedule VII values from Master Data.
- `status` — `active` | `completed` | `on_hold` | `cancelled`
- `derivedStatus` — `ongoing` | `other` (shown as "Ongoing" / "Other than Ongoing")

### FundReceipt (money in)
`date` (required) · `receiptType` · `companyId` (required) · `source` · `financialYearId` (required) · `projectId` · `reference` · `amount` (required) · `description` · `mode`, `carryForward` *(legacy)*

- **`receiptType`** — `company` (a donor company's direct contribution) or `other_source` (income *earned on* that company's funds — Interest, SIP, FD…, picked from Master Data).
- **`companyId` is required for both types.** Money always arrives on behalf of some company. **[APP TODO]** — the app must not offer a "no company" option.
- **`projectId` is optional but strongly recommended** — a receipt must name a project for that project's carry forward to be computable (§2).
- `reference` is labelled **"Account Number"** in the UI (the field name stays `reference` to avoid a data migration). Each receipt carries its own account number — companies do not share one.
- `mode` (NEFT/RTGS/Cheque) and `carryForward` are **legacy**: kept so old documents still validate, never collected on the form, and **no report reads `carryForward` any more**. **[APP TODO]** — remove the Payment Mode and Carry Forward inputs from the receipt form.

### Expenditure (money out) — the "F.Expense" record
`date` (required) · `projectId` (required) · `companyId` (required) · `financialYearId` (required) · `approvedBy` · `amount` (required) · `description` · `reference`

- **`date` can never be in the future.** Money cannot be spent tomorrow; the server 422s.
- **There is no carry-forward field.** Carry forward is derived — see §2.
- There is no Category, no Notes, no Nature of Expense, no Capital Asset block and no Direct/Partner flag. See §0.4.

### MasterDataItem
`type` (`category` | `status` | `source`) · `value` · `description` — the editable dropdown value-lists.

- **`description`** — what the value covers, as plain prose. For the **Category** list this carries the full **Schedule VII** clause (Companies Act, 2013) behind the short 2–3 word label — see §10 for the exact 12 values. **[APP TODO]** — surface the description under each category value, and under the Category dropdown on the project form.

### User / AuditLog / SupportRequest
`User`: `name`, `email`, `role` (`admin` | `editor` | `viewer`), optional `companyId`, **`mustChangePassword`** (boolean, default `false`). No self-registration.

- **`mustChangePassword`** is set `true` when an admin approves a password-reset request (the account is now on the temporary password `<firstname>@apl123`) and cleared when the user sets their own password via `/auth/change-password`. Unlike `passwordHash`/`loginAttempts`, it is **kept in `toJSON` / API responses** — the client reads it to decide whether to force a password change. **[APP TODO]** — honour it on login and after `/auth/me`.

`AuditLog`: every mutating request, with a field-level before→after diff.

`SupportRequest` *(new 2026-07-15)*: the help desk. `userId` · `name?` · `email?` · `type` (`password` | `general`) · `subject?` · `message?` · `status` (`pending` | `approved` | `rejected` | `resolved`, default `pending`) · `reply?` · `resolvedByEmail?` · timestamps.

- A **`password`** ticket is a "forgot my password" request an admin *approves* (resetting the account to a temp password) or *rejects*. A **`general`** ticket is a free-text help message an admin *replies* to (which marks it `resolved`). Replaces the removed `PasswordResetRequest` model. Full flow in §3.1.

---

## 2. The money concepts (read this before building any screen)

These are constantly confused, and every reporting bug traces back to mixing them up:

| | What it is | Where it lives |
|---|---|---|
| **Received** | What a company *actually paid* | Sum of `FundReceipt.amount` where `projectId` + `companyId` match and `receiptType === 'company'` |
| **Budget** | The project's approved cost | `Project.budget` |
| **Spent** | Sum of `Expenditure.amount` for the project | Derived |
| **Utilization %** | Spent ÷ **Budget** | Derived |
| **Carry Forward** | Money received against an **Ongoing** project that has not been spent on it | Derived — `max(0, received − spent)` per (project, company) |

There is **no "committed"/"pledged" amount** in the system. A project records *which* companies fund it; how much each actually paid comes only from its Fund Receipts.

An `other_source` receipt is **not** a contribution — it never counts toward a project's "Received", even though it does count toward that company's overall `totalReceived` on the Dashboard.

### Carry forward is derived, never entered

Nobody types a carry-forward figure anywhere. For every project with `derivedStatus === 'ongoing'`, per contributing company:

```
carryForward = max(0, sum(receipts for this project+company) − sum(expenditures for this project+company))
```

Both receipts and expenditures name a company, so the split is exact — nothing is apportioned pro-rata. A project that has out-spent its linked receipts carries **nothing** forward; the shortfall shows on the row as `spent > received`.

Consequences the app must respect:

- A receipt has to be **linked to a project** (`projectId`) for that project's carry forward to be computable. An Ongoing project with no linked receipt shows no carry-forward row, and the website says so explicitly in a banner. **[APP TODO]** — do the same, or users will think the figure is broken.
- **Company Carry Forward** = the sum of its carry-forward rows. It is a *slice of* the company's balance, **not an addition to it**:
  `Balance = Total Received − Total Expenditure`. (The old formula, `received + carryForward − expenditure`, double-counted the same rupee. **[APP TODO]** — fix this if the app reproduces it.)
- **Year-wise flow** chains: each financial year's closing balance becomes the next year's `carryForwardIn`.
  `totalAvailable = carryForwardIn + fundsReceived`; `carryForwardOut = balance = totalAvailable − expenditure`.
  Those are **running positions, not flows** — summing them down a column is meaningless.
- Server endpoint: `GET /reports/carry-forward` → one row per (Ongoing project × company):
  `{ projectId, projectCode, projectName, companyId, companyName, received, spent, carryForward }`.

The legacy `FundReceipt.carryForward` field is **no longer read by any report**.

---

## 3. Authentication & session

- Sign in with email + password. Accounts are **admin-created only**; there is no sign-up.
- JWT, **1-day expiry**. Two transports:
  - **httpOnly cookie** `csr_token` (`secure` + `sameSite=none` in production, since the frontend and backend are on different domains).
  - **`Authorization: Bearer` fallback** — the login response also returns the raw `token`. **The mobile app must use this**, storing it in AsyncStorage; cookies are not workable across the split-domain setup.
- Session is restored via `GET /auth/me`. A rejected/expired token must log the user out and return them to Login.
- Report-download endpoints (`/reports/export/...`) additionally accept `?token=` in the query string, because a native file download can't set headers.
- **Rate limits:** 600 requests / 15 min globally; **10 failed logins / 15 min** on `/auth/login` (successful logins don't count). The same limiter guards `POST /auth/forgot-password`.
- Every sign-in, failed sign-in, and create/update/delete is written to the Activity Log automatically.

### 3.1 Password recovery & change *(2026-07-15 — admin-mediated, no email)*

There is **no email/SMTP** in this system. A forgotten password is recovered through the admin, via the `SupportRequest` help desk (§1):

1. **Login → "Forgot password?"** collects **email only** and calls `POST /auth/forgot-password` (public, rate-limited). This creates a `type:'password'` SupportRequest. The endpoint **always responds `{ ok: true }`** regardless of whether the email exists — anti-enumeration, so the app must show the same "if that account exists, an admin will review it" message either way.
2. An **admin** sees the ticket in the Admin Panel's Help Desk queue and calls **`POST /support-requests/:id/approve`**. That resets the user to the temporary password **`<firstname>@apl123`** (first name token, lowercased), sets `mustChangePassword = true`, and returns `{ id, tempPassword }` so the admin can pass it to the user out-of-band. (Or the admin **rejects** it.)
3. The user logs in with the temp password. Because `mustChangePassword` is `true`, the app **forces a password change** — `POST /auth/change-password` `{ currentPassword, newPassword }`, which sets the new password and clears the flag. `newPassword` must meet the create-user policy: **min 8 chars, ≥1 letter, ≥1 number.**

Any signed-in user can also change their password at will (same `/auth/change-password` endpoint) and can file a **general** help-desk ticket — see §5.9 / §5.12.

**[APP TODO]** — add the "Forgot password?" link on Login, the forced-change gate when `mustChangePassword` is `true`, and a self-service Change Password screen.

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
- Doughnut — **Fund Distribution by Company** (share of total received).
- Table — **Company Fund Positions**: Company, Total Received, Carry Forward, Expenditure, Balance, Projects.

All of it comes from `GET /dashboard/summary` so the app and website can never drift apart. Don't recompute it client-side.

### 5.2 Companies
- Flat table; live search over name, CIN, **PAN**, contact person, email.
- **Add/Edit**: Name (required), CIN, **PAN**, Contact Person, Phone, Email, Address, **Description**.
- **Delete does NOT cascade.** Deleting a company removes only the company document — its projects, receipts and expenditures survive as orphans. **[APP TODO]** — the app's delete dialog currently *claims* it cascades. Fix the copy; don't implement a cascade.
- **Company Detail**: **CIN & PAN** shown as labeled fields under the name · contact tile · Fund Overview (Received, Carry Forward, Expenditure, Current Balance, Total/Active Projects) · Year-wise Fund Summary · Projects table (**with Project ID**) · Fund Receipts table (**with a Source column**, 2026-07-15). Has its own **Export PDF / Export Excel** — a comprehensive per-company report (§5.11).

Carry Forward for a company = the sum of its derived carry-forward rows (§2).
Current Balance = Received − Expenditure. **Carry Forward is not added to it.**

### 5.3 Financial Years
- Cards: name, date range, "Active" pill, an independent active/inactive toggle, delete.
- **Add** form only (no edit modal): Name, Start Date, End Date, "Mark as active" (default on).
- Several years may be active simultaneously.

### 5.4 Projects
- List with Company filter + free-text search (**Project ID**, name, category, location, intervention partner, description, company names).
- Each row shows the **Project ID** as a badge next to the name.
- **Add/Edit form:**
  - **Name** (required).
  - **Project ID** — read-only, auto-filled preview. The server issues the real one on save.
  - **Companies** (required, ≥1): a plain checkbox list. No per-company amount — that is not a concept in this app.
  - **Approved Budget (₹)**, **Status**, **Derived Status**, **Category** (Master Data — the clause shows underneath), **Intervention Partner**, **Location**, **Start Date** (required, never in the future), **Description**, **Attach Documents**.
  - **Financial Year is read-only and auto-filled** from the FY the Start Date falls into — see §7. It updates live as the Start Date changes.
  - **End Date is read-only and derived server-side** — see §7.
  - Business rule: `on_hold` or `cancelled` requires a **Description** explaining why.
- **Delete is blocked while `status === 'active'`** (HTTP 409) — for everyone, including admins. Mark it Completed first. Deleting a project also deletes its attached documents.

### 5.5 Fund Receipts
Two entry buttons: **Record Receipt** (`receiptType: 'company'`) and **Receipt From Other Source** (`receiptType: 'other_source'`).

Shared fields: Financial Year (**active years only**), Project (optional, shown as `PROJECTID — Name`), Receipt Date (required, not in the future), Attach Proof (optional), **Description**.

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

- **Attach Proof** (optional): any file type, **any number of them**, 15 MB each. On a grid entry, each staged file is attached to **every** receipt the entry creates.
- **Editing** is always single-record, whatever the project. Deleting a receipt also deletes its proof documents.
- List columns: Date · **Company — Source** · Year · **Project ID** · Project · Account Number · Amount. The donor/source column now leads with the **company** and appends the Source after an em-dash (an `other_source` receipt reads e.g. `ABC Ltd — Interest`; a plain company receipt shows just the company). Filters: **Company**, **Source** *(new 2026-07-15 — Master Data `source` values)*, **Year**, and free-text search. The header shows record count + running total, recalculated with all active filters.

### 5.6 Expenditures
- **Project** (required) drives everything. It is picked as `PROJECTID — Name` and it narrows the **Company** dropdown to that project's companies.
- Picking a project shows a read-only **position table** — one row per company:

  | Company | Received | Already Spent | Remaining |
  |---|---:|---:|---:|
  | Tata Consultancy Services Ltd | ₹40,00,000 | ₹15,50,000 | ₹24,50,000 |

  That is what tells the user how much of each company's money is still available before booking a new spend. When editing an existing record, that record's own amount is excluded from "Already Spent" so it isn't double-counted.
- **Financial Year** is chosen independently and is limited to **active** years. When editing a record whose year has since gone inactive, that year stays selectable so old data isn't corrupted.
- **Carry Forward is a read-only field, not an input.** For an Ongoing project it shows what remains unspent after this entry. A spend that over-runs what that company has left is flagged with a warning.
- **Date of Spend cannot be in the future** — cap the picker at today; the server rejects it regardless.
- Also: **Amount Spent** (required), **Approved By**, **Description**, **Attach Documents**.
- **No Category, no Notes, no Nature of Expense, no Capital Asset, no Direct/Partner field.**
- List: **Project ID**, Date of Spend, Project, Company, Year, Approved By, Amount Spent. Filters: Company, Year, search (Project ID included).

### 5.7 Master Data
Three tabs — **Category**, **Status**, **Source** — each a list of values **with a description**, add/edit/delete. These populate the Category dropdowns (Projects) and the Source dropdown (Other-Source receipts). Deleting a value does not rewrite records that already use it.

The **Category** list holds the **12** statutory **Schedule VII** activity heads (§10): a short 2–3 word `value` to pick from, with the clause as its `description`, in plain prose.

*(2026-07-15)* The descriptive hint/placeholder texts on this screen were **removed** — the Schedule VII explainer blurb, the "e.g. Active, Not Active" status hint, the "e.g. Interest, SIP, FD" source hint, etc. Only the `value` and `description` inputs remain; the data model is unchanged.

**[APP TODO]** — this screen does not exist in the app yet.

### 5.8 Reports
Filters: **Company** and **Financial Year** dropdowns at the top of the page, which drive the charts, the totals and the tables on every tab.

**Every tab's table also has its own search box**, laid out like this:

```
┌─ table card ───────────────────────────────────────────────┐
│  [ 🔍 Search… ]                          ← top-LEFT, on its │
│                                            own line         │
│  Total Received: ₹1,48,02,937 · Expenditure: ₹67,36,910 …  │  ← totals, full width
│  ⚠ 2 Ongoing projects have no linked receipt …             │  ← warnings only, full width
│  ─────────────────────────────────────────────────────────  │
│  FINANCIAL YEAR │ FUNDS RECEIVED │ CARRY FORWARD IN │ …     │
└────────────────────────────────────────────────────────────┘
```

- The search box sits **top-left, above the table, on its own line** — not beside the totals. Giving the totals the full width is what keeps them readable; squeezing them into the space left over next to a right-hand search box wraps them into a mess.
- *(2026-07-15)* The **explanatory prose blurbs were removed** from every tab — the running-position explainer, etc. **Totals and actionable warnings are kept** (e.g. the Carry Forward tab's "Ongoing projects with no linked receipt" banner). Match that: keep the numbers and the warnings, drop the paragraphs.
- It matches **any text column** on the row, so a Project ID, a project name and a company name all work without the user having to pick which field they meant.
- It **filters the table only**. The charts and the totals keep reflecting the Company/Year dropdowns, so the overview doesn't shift on every keystroke.
- It is **cleared when the tab changes** — each tab searches different columns, so a carried-over query just looks broken.
- **[APP TODO]** — the app should do the same rather than use a table library's stock search field.

Five tabs:

1. **Transaction Ledger** — bar chart + table: Type, Date, **Project ID**, Project, Company, FY, Amount, running Balance.
2. **Year-wise** — bar (Received / Carry In / Expenditure) + pie (expenditure share). Table: Financial Year, Funds Received, Carry Forward In, Total Available, Expenditure, Balance, Carry Forward Out. Each year's closing balance is the next year's Carry Forward In, so those columns are running positions — **do not sum them down the column**.
3. **Company-wise** — bar + pie. Table: Company, Total Received, Expenditure, **Balance**, **Carry Forward**, Projects (in that order — Balance is received − expenditure; Carry Forward is a slice of it).
4. **Project-wise** — bar (Budget vs Spent, top 10, labelled by Project ID) + pie (projects by status). Table: **Project ID, Project, Company, Intervention Partner, Period, Budget, Received, Spent, Utilization %, Status**.
5. **Carry Forward** — *(2026-07-15)* now has a **bar chart** (Received vs Spent vs Carry Forward) + **pie chart** (each project's share of total carry forward), above the table. Table: **Project ID, Project, Company, Received, Spent, Carry Forward, Rolls Into**. One row per (Ongoing project × company), derived (§2). Ongoing projects with no receipt linked to them are still called out in a banner, since no carry forward can be computed for them.

**Export**: server-generated **PDF** and **Excel** via `GET /reports/export/{pdf|excel}?type=<tab>`. The website falls back to browser-print / client-side CSV when the API is unavailable; the app should just use the server endpoints and hand the file to the native share sheet.

### 5.9 Admin Panel *(admin only)*
- Stat cards — Total Users / Admins / Editors / Viewers; tapping one lists those users.
- **Add User**: Name, Email, Password (**min 8 chars, ≥1 letter, ≥1 number**), Role.
- **All Users** table with delete. **Cannot delete your own account, and cannot delete the last remaining admin.**
- **Change Password** *(2026-07-15)* — admins change **their own** password here (they have no "My Dashboard"; §5.12). Uses `POST /auth/change-password`.
- **Help Desk Requests** *(2026-07-15)* — the pending `SupportRequest` queue (`GET /support-requests`). Each row carries a **type badge — "Password" vs "General"**:
  - **Password** ticket → **Approve** (`POST /support-requests/:id/approve`, resets the user to `<firstname>@apl123` and reveals the temp password to relay) or **Reject** (`…/reject`).
  - **General** ticket → **Reply** (`POST /support-requests/:id/reply` `{ reply }`, marks it `resolved`; the reply shows on the user's My Requests list).
- **Activity Logs**: search + filter by action and by user; each row expands to the field-level before→after diff; share a single entry; "Clear Logs" wipes the collection. Has **Export PDF / Export Excel** (§5.11).

### 5.10 Document attachments
Supported on **Projects**, **Expenditures** and **Fund Receipts** (there labelled "Attach Proof"). Bytes are stored in MongoDB (no disk on the free tier). Any file type — photo, PDF, doc, CSV.

- **No limit on how many documents a record can carry.** The picker is multi-select; each file is one `POST` to the single-file endpoint.
- **Max 15 MB per file** — enforced on the server (413). **This one cannot be lifted.** The bytes live inside the MongoDB document, and MongoDB rejects any document over 16 MB. A file bigger than that would need external object storage, which this app does not have.
- The database is a free Atlas M0 tier with a **512 MB total quota**, shared with every other record. Uncapped attachment *counts* can still exhaust it — worth watching.
- Upload/delete require write permission; **any signed-in role can list and download**.
- Downloads are served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` — an uploaded `.svg` or `.html` must never render in-browser.
- On a *new* record, files are staged locally and uploaded after the record is created; partial upload failures are reported without losing the record.
- **Deleting the parent record deletes its documents** (server-side cascade) — no orphaned blobs.

**[APP TODO]** — the app has no upload feature at all yet.

### 5.11 Exports *(server-generated PDF / Excel)*

Every list page has **Export PDF** and **Export Excel** buttons **except the Dashboard and Financial Years**. Exports are also on **Company detail** (a comprehensive per-company report) and **Admin → Activity Logs**. All are one call:

```
GET /reports/export/{pdf|excel}?type=<type>[&companyId=<id>]
```

`<type>` is one of: `year`, `company`, `project`, `carryForward`, `ledger` *(the five Report tabs)*, `companies`, `company-detail` *(needs `&companyId=`)*, `projects`, `fund-receipts`, `expenditures`, `financial-years`, `master-data`, `users`, `activity-logs`.

- **`company-detail`** is multi-section — company info + fund overview + year-wise summary + projects + fund receipts, assembled as one report.
- These endpoints also accept **`?token=`** in the query string (a native download can't set an `Authorization` header) — see §3.
- **PDF fixes (2026-07-15):** long text (e.g. Master Data Schedule VII descriptions) now **wraps** onto multiple lines with dynamic row height, and **every table is scaled to fit the page width** so the right-hand columns are never clipped.

The app should just call these endpoints and hand the returned file to the native share sheet.

### 5.12 My Dashboard *(editor + viewer only — 2026-07-15)*

The personal/profile page. **Admins do NOT have it** — their equivalents live in the Admin Panel (§5.9). It holds:

- **Change Password** — self-service, `POST /auth/change-password`.
- **Raise a Request** — a help-desk form (`POST /support-requests` `{ subject, message }`) that files a `general` ticket.
- **My Requests** — the caller's own tickets via `GET /support-requests/mine`, showing status and any admin **reply**.

**[APP TODO]** — build this profile screen (change password + raise/track help-desk tickets) for editor/viewer accounts.

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
GET    /reports/carry-forward
GET    /reports/export/{pdf|excel}?type=<type>[&companyId=<id>][&token=<jwt>]
       type ∈ year | company | project | carryForward | ledger        (Report tabs)
              | companies | company-detail(&companyId) | projects
              | fund-receipts | expenditures | financial-years
              | master-data | users | activity-logs                   (per-page tables)

POST   /auth/login    GET /auth/me    POST /auth/logout
POST   /auth/forgot-password   { email }                 (public, rate-limited; always → {ok:true})
POST   /auth/change-password   { currentPassword, newPassword }   (auth; clears mustChangePassword)

GET    /users   POST /users   DELETE /users/:id          (admin)
       (REMOVED: /users/reset-requests* — replaced by /support-requests)

POST   /support-requests            { subject, message }  (auth — file a general ticket)
GET    /support-requests/mine                             (auth — caller's own tickets + replies)
GET    /support-requests                                  (admin — pending queue)
POST   /support-requests/:id/approve                      (admin — password tickets; → { id, tempPassword })
POST   /support-requests/:id/reject                       (admin)
POST   /support-requests/:id/reply  { reply }             (admin — general tickets; marks resolved)

GET    /logs    GET /logs/mine   DELETE /logs            (admin; /mine for self)
```

**`POST /fund-receipts/bulk`** validates every row *before writing any of them* — a rejected batch stores nothing. It returns the array of created receipts. Use it whenever a project's companies are entered together.

Reads are open to every authenticated role; writes are admin + editor. Every list endpoint returns the **full collection** — there is no server-side pagination or filtering, so filter and search on the client.

### Example: create an expenditure

```jsonc
POST /api/expenditures
{
  "date": "2026-07-14",                      // never in the future
  "projectId": "665f…",                      // required
  "companyId": "665a…",                      // required — must be on the project
  "financialYearId": "6650…",                // required — must be an ACTIVE year
  "amount": 50000,
  "approvedBy": "Trustee Board",
  "description": "Tailoring batch 3"
  // no category, no notes, no carryForwardAmount, no natureOfExpense
}
```

---

## 7. Server-derived values — do not compute these in the app

- **Project `endDate`, `financialYearId` and `projectCode`** are never accepted from the client. The server finds the financial year that the project's **start date** falls into (not today's date, so backdated projects work), and:
  - sets `financialYearId` to that FY.
  - sets `endDate`: `derivedStatus === 'ongoing'` → end of the FY **3 years** later; **otherwise → the end of the start FY itself.** A project that isn't Ongoing finishes inside the financial year it began in. *(This changed — it used to be the start FY + 1 year.)*
  - issues `projectCode`: 4 letters of the name + the FY's start year, `-2` / `-3` on a clash. Stable across renames; re-issued only if the project's FY changes. Records link by `_id`, never by code — so a re-issue breaks nothing.
  - If no known FY contains the start date, the FY falls back to the active/latest year.
- **Project `companyIds`** is deduped on every create and update; blank ids are dropped.
- **All carry-forward figures** — never stored, never posted. See §2.
- **Dashboard and report aggregates** come from `/dashboard/summary`, `/reports/year-wise`, `/reports/company-positions`, `/reports/carry-forward`.

## 8. Rules the server enforces (and the app must not bypass)

- New fund receipts and expenditures can only be booked against an **active** financial year (400 otherwise). Checked on **create only** — editing an old record whose year has since gone inactive still works.
- A project with `status === 'active'` **cannot be deleted** (409).
- **No future dates**: `Project.startDate`, `FundReceipt.date` and `Expenditure.date` all reject a date after today (422).
- `on_hold` / `cancelled` projects must carry a **Description**.
- `Company.pan`, when non-empty, must match `^[A-Z]{5}[0-9]{4}[A-Z]$` (422).
- Attachments: max **15 MB** per file (413). No cap on the number of files.
- Deleting a company, financial year, or master-data value **does not cascade**.
- **`/auth/forgot-password` never confirms an account exists** — it always returns `{ ok: true }` (anti-enumeration). Rate-limited by the login limiter.
- **`/auth/change-password`** requires the correct `currentPassword`; `newPassword` must be **min 8 chars, ≥1 letter, ≥1 number**; success clears `mustChangePassword`.
- **`/support-requests/:id/approve`** only acts on **`type:'password'`** tickets and resets the user to the temporary password **`<firstname>@apl123`**; `/reply` only acts on **`type:'general'`** tickets. Approve/reject/reply and the pending queue are **admin-only**.
- Every write is Zod-validated and audit-logged with a before→after diff.

---

## 9. Client-side conventions worth copying

- **Currency**: full Indian grouping (₹12,34,567) everywhere; abbreviated form (₹8.5L, ₹1.2Cr, ₹40k) on chart axes only.
- **Dates**: ISO `yyyy-mm-dd` in storage and on the wire; `5 Aug 2023` on screen.
- **Errors**: surface the most specific reason available — field-level Zod errors → server `message` → network fallback ("Could not reach the server").
- **Empty states** on every list rather than a blank screen.
- **Cold starts**: the Render free tier sleeps. Ping `/api/health` on launch and retry; expect the first request after idle to take ~30 s.

---

## 10. The 12 Schedule VII categories

These are seeded into Master Data as `type: 'category'`. The `value` is what a user picks; the `description` is the clause. Source of truth: `server/src/data/scheduleVII.ts`.

| Clause | Value (the dropdown label) | Description (the clause) |
|---|---|---|
| (i) | **Hunger, Health & Sanitation** | Eradicating hunger, poverty and malnutrition, promoting health care including preventive health care and sanitation including contribution to the Swachh Bharat Kosh set-up by the Central Government for the promotion of sanitation and making available safe drinking water. |
| (ii) | **Education & Livelihood** | Promoting education, including special education and employment enhancing vocation skills especially among children, women, elderly and the differently abled and livelihood enhancement projects. |
| (iii) | **Gender Equality & Women Empowerment** | Promoting gender equality, empowering women, setting up homes and hostels for women and orphans; setting up old age homes, day care centres and such other facilities for senior citizens and measures for reducing inequalities faced by socially and economically backward groups. |
| (iv) | **Environmental Sustainability** | Ensuring environmental sustainability, ecological balance, protection of flora and fauna, animal welfare, agroforestry, conservation of natural resources and maintaining quality of soil, air and water including contribution to the Clean Ganga Fund set-up by the Central Government for rejuvenation of river Ganga. |
| (v) | **National Heritage, Art & Culture** | Protection of national heritage, art and culture including restoration of buildings and sites of historical importance and works of art; setting up public libraries; promotion and development of traditional art and handicrafts. |
| (vi) | **Armed Forces Veterans Welfare** | Measures for the benefit of armed forces veterans, war widows and their dependents, Central Armed Police Forces (CAPF) and Central Para Military Forces (CPMF) veterans, and their dependents including widows. |
| (vii) | **Sports Promotion** | Training to promote rural sports, nationally recognised sports, paralympic sports and olympic sports. |
| (viii) | **Central Government Funds** | Contribution to the Prime Minister's National Relief Fund or Prime Minister's Citizen Assistance and Relief in Emergency Situations Fund (PM CARES Fund) or any other fund set up by the Central Government for socio-economic development and relief and welfare of the Scheduled Castes, Scheduled Tribes, other backward classes, minorities and women. |
| (ix) | **Research & Development** | Contribution to incubators or research and development projects in the field of science, technology, engineering and medicine, funded by the Central Government or State Government or Public Sector Undertaking or any agency of the Central Government or State Government; and contributions to public funded Universities, Indian Institutes of Technology (IITs), National Laboratories and autonomous bodies established under the Department of Atomic Energy (DAE), Department of Biotechnology (DBT), Department of Science and Technology (DST), Department of Pharmaceuticals, Ministry of Ayurveda, Yoga and Naturopathy, Unani, Siddha and Homoeopathy (AYUSH), Ministry of Electronics and Information Technology, and other bodies namely Defence Research and Development Organisation (DRDO), Indian Council of Agricultural Research (ICAR), Indian Council of Medical Research (ICMR) and Council of Scientific and Industrial Research (CSIR), engaged in conducting research in science, technology, engineering and medicine aimed at promoting Sustainable Development Goals (SDGs). |
| (x) | **Rural Development** | Rural development projects. |
| (xi) | **Slum Area Development** | Slum area development. |
| (xii) | **Disaster Management** | Disaster management, including relief, rehabilitation and reconstruction activities. |

Clause (ix) has two limbs, (a) and (b), in the Act. They are **one category** here, with both limbs in the description — which is why there are 12 values, not 13.

The app should never hard-code this list: read it from `GET /master-data` (`type === 'category'`), so an admin editing Master Data is reflected everywhere.
