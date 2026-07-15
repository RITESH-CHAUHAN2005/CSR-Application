import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Base URL of the shared backend. Change this one line to point the app at a
// different deployment (e.g. a local server or a new host).
export const BASE = 'https://csr-manager.onrender.com/api';

const TOKEN_KEY = 'csr_token'; // JWT persisted on-device

// ── token store (in-memory + persisted) ──────────────────────────────────────
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

// AuthGate registers a handler so a 401 (e.g. the 1-day JWT expired) bounces the
// user back to the login screen instead of silently failing.
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

// Wake the backend as early as possible (Render's free tier sleeps after idle).
// Fired on app launch so the server is warming up while the user is still on the
// login screen — hiding most of the cold-start delay. Fire-and-forget; retries a
// couple of times because the very first hit is what triggers the wake-up.
export function warmUp() {
  let tries = 0;
  const ping = () => {
    http.get('/health', { timeout: 60000 })
      .catch(() => { if (++tries < 3) setTimeout(ping, 4000); });
  };
  ping();
}

// Load any saved token into memory on app start (call & await before first request).
export async function loadToken() {
  try { authToken = await AsyncStorage.getItem(TOKEN_KEY); } catch { authToken = null; }
  return authToken;
}
async function setToken(t: string) { authToken = t; try { await AsyncStorage.setItem(TOKEN_KEY, t); } catch {} }
async function clearToken() { authToken = null; try { await AsyncStorage.removeItem(TOKEN_KEY); } catch {} }
export { clearToken };

// ── axios instance ───────────────────────────────────────────────────────────
// Render's free tier cold-starts (~30-50s) after idle, so the timeout is generous.
const http = axios.create({
  baseURL: BASE,
  timeout: 90000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((cfg) => {
  if (authToken) cfg.headers.Authorization = `Bearer ${authToken}`;
  return cfg;
});

http.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    const url: string = err?.config?.url || '';
    // Expired / invalid session → drop the token and send the user to login.
    if (status === 401 && !url.includes('/auth/login')) {
      clearToken();
      if (onUnauthorized) onUnauthorized();
    }
    // Different backend routes shape errors differently — try every known
    // shape before falling back, so a validation failure always shows the
    // real reason (e.g. which field) instead of a generic "Validation failed".
    // The Zod-backed routes return { error: 'Validation failed', details: { field: [reason] } } —
    // `details` is what actually names the offending field, so prefer it over the generic `error`.
    const d = err?.response?.data;
    let msg: string | undefined;
    if (d?.details && typeof d.details === 'object') {
      msg = Object.entries(d.details)
        .map(([field, reasons]: [string, any]) => `${field}: ${Array.isArray(reasons) ? reasons.join(', ') : reasons}`)
        .join('; ');
    }
    if (!msg) msg = d?.error || d?.message;
    if (!msg && d?.errors) {
      msg = Array.isArray(d.errors)
        ? d.errors.map((e: any) => e?.message || e?.msg || e).filter(Boolean).join('; ')
        : Object.values(d.errors).map((e: any) => e?.message || e).filter(Boolean).join('; ');
    }
    // A 413 is the server rejecting an oversized attachment. The body is often
    // empty on that status, so name the real limit rather than showing nothing.
    if (!msg && status === 413) msg = 'That file is too large — the maximum is 15 MB per file.';
    if (!msg) msg = err?.response ? err?.message : 'Could not reach the server. Check your connection.';
    return Promise.reject(new Error(msg));
  },
);

// ── shape helpers ─────────────────────────────────────────────────────────────
const idStr = (v: any) => (v == null ? '' : typeof v === 'object' ? String(v.id || v._id || '') : String(v));
const num = (n: any) => Number(n) || 0;

// base64 of a binary string. Uses Hermes' global btoa when present, else a small
// pure-JS encoder (avoids a Buffer/node dependency). Used only for document downloads.
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Encode(binary: string): string {
  const g: any = typeof globalThis !== 'undefined' ? globalThis : {};
  if (typeof g.btoa === 'function') return g.btoa(binary);
  let out = '';
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const b = i + 1 < binary.length ? binary.charCodeAt(i + 1) : NaN;
    const c = i + 2 < binary.length ? binary.charCodeAt(i + 2) : NaN;
    const e1 = a >> 2;
    const e2 = ((a & 3) << 4) | (isNaN(b) ? 0 : b >> 4);
    const e3 = isNaN(b) ? 64 : (((b & 15) << 2) | (isNaN(c) ? 0 : c >> 6));
    const e4 = isNaN(c) ? 64 : c & 63;
    out += B64_CHARS[e1] + B64_CHARS[e2] + (e3 === 64 ? '=' : B64_CHARS[e3]) + (e4 === 64 ? '=' : B64_CHARS[e4]);
  }
  return out;
}
const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};
// Any backend date → 'YYYY-MM-DD'. Parsed deterministically (NOT via the JS
// engine) because Hermes on-device parses the `Date.toString()` format
// ("Fri Apr 01 2022 00:00:00 GMT+0000 (…)") differently from Node.
const dstr = (v: any) => {
  if (!v) return '';
  const s = String(v);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // already ISO / 'YYYY-MM-DD'
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{2})\s+(\d{4})/); // Date.toString()
  if (m && MONTHS[m[1]]) return `${m[3]}-${MONTHS[m[1]]}-${m[2]}`;
  const d = new Date(s); // last-resort engine parse
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const mapUser = (u: any) => ({
  id: idStr(u?.id ?? u?._id), name: u?.name || '', email: u?.email || '',
  role: u?.role || 'viewer', company: u?.company || '',
  // Kept in API responses (unlike passwordHash) — true after an admin approves a
  // password-reset (the account is now on the temp password <firstname>@apl123).
  // The client reads it to force a password change before letting the user in.
  mustChangePassword: !!u?.mustChangePassword,
}); // note: never carry the backend's `password` hash into the app

// ── support requests (the help desk — replaces the old PasswordResetRequest) ──
// `type: 'password'` = a "forgot my password" ticket an admin approves/rejects;
// `type: 'general'` = a free-text help message an admin replies to.
const mapSupport = (s: any) => ({
  id: idStr(s?.id ?? s?._id),
  userId: idStr(s?.userId ?? s?.user),
  name: s?.name || '', email: s?.email || '',
  type: s?.type === 'password' ? 'password' : 'general',
  subject: s?.subject || '', message: s?.message || '',
  status: s?.status || 'pending',
  reply: s?.reply || '', resolvedByEmail: s?.resolvedByEmail || '',
  at: s?.createdAt || s?.at || '',
});

// ── activity-log mapping (backend auto-logs; shape differs from the app's) ─────
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const actionText = (l: any) => {
  const a = String(l?.action || '').toLowerCase();
  if (a === 'login') return 'Signed In';
  if (a === 'logout') return 'Signed Out';
  if (a === 'login_failed') return 'Failed sign-in attempt';
  const verb = a === 'create' ? 'Created' : a === 'update' ? 'Updated' : a === 'delete' ? 'Deleted' : cap(a);
  const ent = String(l?.entity || '').replace(/([A-Z])/g, ' $1').trim();
  let s = ent ? `${verb} ${ent}` : verb || 'Activity';
  if (l?.label) s += ` "${l.label}"`;
  return s;
};
const mapLog = (l: any) => ({
  id: idStr(l?.id ?? l?._id), at: l?.createdAt || l?.at || '',
  userEmail: l?.userEmail || '—', role: l?.role || '', action: actionText(l),
});

// ── resource map: backend path + field transforms ─────────────────────────────
// toClient(doc) → flat app shape;  toDb(body) → the backend's Mongoose shape.
//
// SCHEMA NOTE (the 2026-07-14 migration): there is no `notes` field anywhere in
// the system any more. Company, Project, FundReceipt and Expenditure each carry
// exactly ONE free-text field, `description`. Posting `notes` — or an
// Expenditure `category` / `carryForwardAmount` — is rejected with a 422.
const RES: Record<string, { path: string; toClient: (d: any) => any; toDb: (b: any) => any }> = {
  companies: {
    path: 'companies',
    toClient: (d) => ({
      id: idStr(d.id ?? d._id), name: d.name || '', cin: d.cin || d.registrationNo || '',
      pan: d.pan || '',
      contact: d.contactPerson || d.contact || '', email: d.email || '',
      phone: d.phone || '', address: d.address || '', description: d.description || '',
    }),
    toDb: (b) => ({
      name: b.name, cin: b.cin || '',
      // Optional, but when non-empty the server format-checks it against
      // ^[A-Z]{5}[0-9]{4}[A-Z]$ and stores it uppercase (422 otherwise).
      pan: (b.pan || '').toUpperCase(),
      contactPerson: b.contact || '',
      email: b.email || '', phone: b.phone || '', address: b.address || '',
      description: b.description || '',
    }),
  },
  years: {
    path: 'financial-years',
    toClient: (d) => ({
      id: idStr(d.id ?? d._id), name: d.name || '',
      start: dstr(d.startDate), end: dstr(d.endDate), active: !!d.isActive,
    }),
    toDb: (b) => ({ name: b.name, startDate: b.start || null, endDate: b.end || null, isActive: !!b.active }),
  },
  projects: {
    path: 'projects',
    toClient: (d) => ({
      id: idStr(d.id ?? d._id), name: d.name || '',
      // The "Project ID" (e.g. RURA2025) — issued by the server, never sent by
      // the client. Shown everywhere a project is named.
      projectCode: d.projectCode || '',
      // A project is funded by ONE OR MORE companies — the live schema stores them
      // as an array (`companyIds`). Read the whole array (falling back to any legacy
      // singular field so old documents still show a company).
      companyIds: Array.isArray(d.companyIds)
        ? d.companyIds.map(idStr).filter(Boolean)
        : (d.company ?? d.companyId ? [idStr(d.company ?? d.companyId)] : []),
      category: d.category || '', location: d.location || '', budget: num(d.budget),
      // The implementing agency / NGO delivering the project, when it isn't run directly.
      interventionPartner: d.interventionPartner || '',
      status: d.status || 'active',
      // The live schema has no boolean `ongoing` — it's `derivedStatus: 'ongoing' | 'other'`.
      derivedStatus: d.derivedStatus === 'ongoing' ? 'ongoing' : 'other',
      description: d.description || '',
      startDate: dstr(d.startDate),
      // endDate and financialYearId are BOTH derived server-side from the start
      // date's financial year — never sent by the client, only read back for display.
      endDate: dstr(d.endDate),
      yearId: idStr(d.financialYear ?? d.financialYearId),
    }),
    // The live Project schema REQUIRES `companyIds` (non-empty array) and
    // `derivedStatus` ('ongoing' | 'other'). `projectCode`, `financialYearId` and
    // `endDate` are omitted on purpose — the server derives all three from the
    // start date and refuses to take them from the client.
    toDb: (b) => ({
      name: b.name, companyIds: Array.isArray(b.companyIds) ? b.companyIds.filter(Boolean) : [],
      category: b.category || '', location: b.location || '', budget: num(b.budget),
      interventionPartner: b.interventionPartner || '',
      status: b.status || 'active', derivedStatus: b.derivedStatus === 'ongoing' ? 'ongoing' : 'other',
      description: b.description || '',
      startDate: b.startDate || '',
    }),
  },
  receipts: {
    path: 'fund-receipts',
    toClient: (d) => ({
      id: idStr(d.id ?? d._id), date: dstr(d.date),
      // 'company' = a donor company's direct contribution; 'other_source' = income
      // earned on that company's funds (Interest/SIP/FD…). companyId is set for both.
      receiptType: d.receiptType === 'other_source' ? 'other_source' : 'company',
      companyId: idStr(d.company ?? d.companyId), source: d.source || '',
      projectId: idStr(d.project ?? d.projectId),
      yearId: idStr(d.financialYear ?? d.financialYearId),
      // `reference` is shown as "Account Number" in the UI (field name kept to avoid a migration).
      reference: d.reference || '', amount: num(d.amount), description: d.description || '',
    }),
    toDb: (b) => ({
      date: b.date || null, receiptType: b.receiptType || 'company',
      // companyId is required for BOTH receipt types — money always arrives on
      // behalf of some company.
      companyId: b.companyId, source: b.source || '',
      // projectId is optional — omit it entirely when unset so the server treats it as unallocated.
      ...(b.projectId ? { projectId: b.projectId } : {}),
      financialYearId: b.yearId, reference: b.reference || '',
      amount: num(b.amount), description: b.description || '',
      // `mode` and `carryForward` are legacy columns: never collected on the form,
      // never sent, and no report reads them any more.
    }),
  },
  expenditures: {
    path: 'expenditures',
    toClient: (d) => ({
      id: idStr(d.id ?? d._id), date: dstr(d.date), projectId: idStr(d.project ?? d.projectId),
      companyId: idStr(d.company ?? d.companyId), yearId: idStr(d.financialYear ?? d.financialYearId),
      approvedBy: d.approvedBy || '', amount: num(d.amount),
      description: d.description || '', reference: d.reference || '',
    }),
    // An expenditure is deliberately minimal: project, company, financial year,
    // amount, date, approved by, description. There is no category, no notes, no
    // carryForwardAmount (carry forward is derived — see /reports/carry-forward),
    // no natureOfExpense, no capitalAsset and no fundingRoute.
    toDb: (b) => ({
      date: b.date || null, projectId: b.projectId, companyId: b.companyId, financialYearId: b.yearId,
      approvedBy: b.approvedBy || '', amount: num(b.amount),
      description: b.description || '', reference: b.reference || '',
    }),
  },
  // Editable dropdown value-lists (Category / Status / Source) shown on the Master
  // Data screen. For the Category list, `description` carries the Schedule VII clause.
  masterData: {
    path: 'master-data',
    toClient: (d) => ({
      id: idStr(d.id ?? d._id), type: d.type || '', value: d.value || '',
      description: d.description || '',
    }),
    toDb: (b) => ({ type: b.type, value: b.value, description: b.description || '' }),
  },
};

export const api = {
  // ── auth ──
  login: async (email: string, password: string) => {
    const { data } = await http.post('/auth/login', {
      email: String(email || '').trim().toLowerCase(), password,
    });
    if (data?.token) await setToken(data.token);
    return { user: mapUser(data?.user), token: data?.token as string };
  },
  logout: async () => { try { await http.post('/auth/logout'); } catch {} await clearToken(); },

  // Re-fetch the signed-in user (used after a forced password change clears
  // mustChangePassword, so the gate re-evaluates against fresh server state).
  me: async () => { const { data } = await http.get('/auth/me'); return mapUser(data?.user ?? data); },

  // ── password recovery & change (2026-07-15 — admin-mediated, no email) ──
  // Public + rate-limited. ALWAYS resolves (anti-enumeration): the endpoint
  // returns { ok: true } whether or not the email exists, so we never leak which
  // accounts are real. Creates a type:'password' SupportRequest for an admin.
  forgotPassword: async (email: string) => {
    try { await http.post('/auth/forgot-password', { email: String(email || '').trim().toLowerCase() }); } catch {}
    return { ok: true };
  },
  // Verifies currentPassword, sets newPassword, clears mustChangePassword.
  // newPassword must be min 8 chars, ≥1 letter, ≥1 number (server-enforced).
  changePassword: async (currentPassword: string, newPassword: string) => {
    await http.post('/auth/change-password', { currentPassword, newPassword });
  },

  // ── support requests (help desk) ──
  createSupportRequest: async (subject: string, message: string) => {
    const { data } = await http.post('/support-requests', { subject, message });
    return mapSupport(data);
  },
  getMySupportRequests: async () => { const { data } = await http.get('/support-requests/mine'); return (data || []).map(mapSupport); },
  // Admin: the pending queue (both password + general tickets).
  getSupportRequests: async () => { const { data } = await http.get('/support-requests'); return (data || []).map(mapSupport); },
  // Admin, password tickets only → resets the user to <firstname>@apl123 and
  // returns { id, tempPassword } so the admin can relay it out-of-band.
  approveSupportRequest: async (id: string) => {
    const { data } = await http.post(`/support-requests/${id}/approve`);
    return { id: idStr(data?.id) || id, tempPassword: data?.tempPassword || '' };
  },
  rejectSupportRequest: async (id: string) => { await http.post(`/support-requests/${id}/reject`); },
  // Admin, general tickets only → marks the ticket resolved; reply shows on My Requests.
  replySupportRequest: async (id: string, reply: string) => { await http.post(`/support-requests/${id}/reply`, { reply }); },

  // ── users (admin only on the server) ──
  getUsers: async () => { const { data } = await http.get('/users'); return (data || []).map(mapUser); },
  createUser: async (u: any) => {
    const { data } = await http.post('/users', {
      name: u.name, email: u.email, password: u.password, role: u.role, company: u.company || '',
    });
    return mapUser(data);
  },
  removeUser: async (id: string) => { await http.delete('/users/' + id); },

  // ── activity logs (admin sees all; everyone can see their own via /mine) ──
  getLogs: async () => { const { data } = await http.get('/logs'); return (data || []).map(mapLog); },
  getMyLogs: async () => { const { data } = await http.get('/logs/mine'); return (data || []).map(mapLog); },
  clearLogs: async () => { await http.delete('/logs'); },

  // ── computed analytics (SAME numbers the website shows — server-side) ──
  dashboard: async () => { const { data } = await http.get('/dashboard/summary'); return data; },
  reportYearWise: async () => { const { data } = await http.get('/reports/year-wise'); return data || []; },
  reportCompanyPositions: async () => { const { data } = await http.get('/reports/company-positions'); return data || []; },

  // Carry forward is DERIVED — never stored, never posted. One row per
  // (Ongoing project × company): max(0, received − spent) for that pair.
  reportCarryForward: async () => {
    const { data } = await http.get('/reports/carry-forward');
    return (data || []).map((r: any) => ({
      projectId: idStr(r.projectId), projectCode: r.projectCode || '', projectName: r.projectName || '',
      companyId: idStr(r.companyId), companyName: r.companyName || '',
      received: num(r.received), spent: num(r.spent), carryForward: num(r.carryForward),
    }));
  },

  // ── generic resource CRUD ──
  list: async (resource: string) => { const c = RES[resource]; const { data } = await http.get('/' + c.path); return (data || []).map(c.toClient); },
  create: async (resource: string, body: any) => { const c = RES[resource]; const { data } = await http.post('/' + c.path, c.toDb(body)); return c.toClient(data); },
  update: async (resource: string, id: string, body: any) => { const c = RES[resource]; const { data } = await http.put('/' + c.path + '/' + id, c.toDb(body)); return c.toClient(data); },
  remove: async (resource: string, id: string) => { const c = RES[resource]; await http.delete('/' + c.path + '/' + id); },

  // ── multi-company fund receipt entry (all-or-nothing) ──
  // Every filled company row becomes its own ordinary FundReceipt. The server
  // validates the whole batch BEFORE writing any of them, so a rejected row
  // stores nothing. Returns the created receipts in app shape.
  bulkCreateReceipts: async (rows: any[]) => {
    const c = RES.receipts;
    const { data } = await http.post('/fund-receipts/bulk', { receipts: rows.map(c.toDb) });
    const arr = Array.isArray(data) ? data : (data?.receipts || []);
    return arr.map(c.toClient);
  },

  // ── document attachments (Projects / Expenditures / Fund Receipts) ──
  // `parent` is the app resource key; mapped to the backend path here so callers
  // never hardcode a URL. Bytes live in MongoDB (no disk on the free tier), so a
  // file is capped at 15 MB and that cap cannot be lifted — see FEATURES.md §5.10.
  // There is NO limit on how many documents a record can carry.
  listDocuments: async (parent: 'projects' | 'expenditures' | 'receipts', id: string) => {
    const path = RES[parent].path;
    const { data } = await http.get(`/${path}/${id}/documents`);
    return (data || []).map((d: any) => ({
      id: idStr(d.id ?? d._id), name: d.filename || d.name || 'document',
      size: num(d.size), contentType: d.contentType || d.mimeType || '',
    }));
  },
  // file: { uri, name, type } from the native picker.
  uploadDocument: async (parent: 'projects' | 'expenditures' | 'receipts', id: string, file: { uri: string; name: string; type?: string }) => {
    const path = RES[parent].path;
    const fd = new FormData();
    fd.append('file', { uri: file.uri, name: file.name, type: file.type || 'application/octet-stream' } as any);
    const { data } = await http.post(`/${path}/${id}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return data;
  },
  deleteDocument: async (parent: 'projects' | 'expenditures' | 'receipts', id: string, docId: string) => {
    const path = RES[parent].path;
    await http.delete(`/${path}/${id}/documents/${docId}`);
  },
  // Fetch a document's bytes as a base64 data URL — the native download can't set
  // an Authorization header, so we pull it through axios (which does) and hand the
  // caller a data: URL it can pass straight to the share sheet.
  documentDataUrl: async (parent: 'projects' | 'expenditures' | 'receipts', id: string, docId: string, contentType: string) => {
    const path = RES[parent].path;
    const { data } = await http.get(`/${path}/${id}/documents/${docId}/download`, { responseType: 'arraybuffer' as any });
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = base64Encode(binary);
    return `data:${contentType || 'application/octet-stream'};base64,${b64}`;
  },

  // ── server-generated report files (PDF / Excel) ──
  // The report tables are rendered by the SERVER, so an exported file always
  // matches what the website produces for the same tab.
  //
  // The endpoints also accept the JWT via ?token= (a native file download can't set
  // an Authorization header) — that URL is exposed for anything that needs a plain
  // link. The app itself pulls the bytes through axios (which does send the header,
  // so the token never leaks into a URL) and hands the share sheet a data: URL.
  reportExportUrl: (kind: 'pdf' | 'excel', type: string) =>
    `${BASE}/reports/export/${kind}?type=${encodeURIComponent(type)}${authToken ? `&token=${encodeURIComponent(authToken)}` : ''}`,

  // `companyId` is only used by the `company-detail` report (a comprehensive
  // per-company report); it is ignored by every other type.
  reportExportFile: async (kind: 'pdf' | 'excel', type: string, companyId?: string) => {
    const { data } = await http.get(`/reports/export/${kind}`, {
      params: companyId ? { type, companyId } : { type },
      responseType: 'arraybuffer' as any,
    });
    const mime = kind === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return {
      dataUrl: `data:${mime};base64,${base64Encode(binary)}`,
      mime,
      filename: `CSR_${type}_report.${kind === 'pdf' ? 'pdf' : 'xlsx'}`,
    };
  },
};
