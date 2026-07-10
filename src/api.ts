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
    msg = msg || err?.message || 'Network error. Check your connection.';
    return Promise.reject(new Error(msg));
  },
);

// ── shape helpers ─────────────────────────────────────────────────────────────
const idStr = (v: any) => (v == null ? '' : typeof v === 'object' ? String(v.id || v._id || '') : String(v));
const num = (n: any) => Number(n) || 0;
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
}); // note: never carry the backend's `password` hash into the app

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
const RES: Record<string, { path: string; toClient: (d: any) => any; toDb: (b: any) => any }> = {
  companies: {
    path: 'companies',
    toClient: (d) => ({
      id: idStr(d.id ?? d._id), name: d.name || '', cin: d.cin || d.registrationNo || '',
      contact: d.contactPerson || d.contact || '', email: d.email || '',
      phone: d.phone || '', address: d.address || '', notes: d.notes || '',
    }),
    toDb: (b) => ({
      name: b.name, cin: b.cin || '', contactPerson: b.contact || '',
      email: b.email || '', phone: b.phone || '', address: b.address || '', notes: b.notes || '',
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
      // The live schema stores companies as an ARRAY (`companyIds`) — this app's UI
      // only supports one company per project, so read the first entry.
      companyId: idStr(Array.isArray(d.companyIds) ? d.companyIds[0] : (d.company ?? d.companyId)),
      yearId: idStr(d.financialYear ?? d.financialYearId),
      category: d.category || '', location: d.location || '', budget: num(d.budget),
      status: d.status || 'active',
      // The live schema has no boolean `ongoing` — it's `derivedStatus: 'ongoing' | 'other'`.
      ongoing: d.derivedStatus === 'ongoing' || !!d.ongoing,
      description: d.description || '',
      startDate: typeof d.startDate === 'string' ? d.startDate.slice(0, 10) : dstr(d.startDate),
      endDate: typeof d.endDate === 'string' ? d.endDate.slice(0, 10) : dstr(d.endDate), notes: d.notes || '',
    }),
    // The live Project schema REQUIRES `companyIds` (non-empty array) and
    // `derivedStatus` ('ongoing' | 'other') — it has no `companyId`/`companyId`
    // singular or boolean `ongoing` field. Sending the old shape silently fails
    // Zod validation (companyIds missing), so creates/edits from this app never
    // actually saved. This app only picks one company, so wrap it in an array.
    toDb: (b) => ({
      name: b.name, companyIds: b.companyId ? [b.companyId] : [],
      category: b.category || '', location: b.location || '', budget: num(b.budget),
      status: b.status || 'active', derivedStatus: b.ongoing ? 'ongoing' : 'other',
      description: b.description || '',
      startDate: b.startDate || '', endDate: b.endDate || '', notes: b.notes || '',
    }),
  },
  receipts: {
    path: 'fund-receipts',
    toClient: (d) => ({
      id: idStr(d.id ?? d._id), date: dstr(d.date),
      companyId: idStr(d.company ?? d.companyId), yearId: idStr(d.financialYear ?? d.financialYearId),
      reference: d.reference || '', mode: d.mode || 'NEFT',
      carryForward: num(d.carryForward), amount: num(d.amount), notes: d.notes || '',
    }),
    toDb: (b) => ({
      date: b.date || null, companyId: b.companyId, financialYearId: b.yearId,
      reference: b.reference || '', mode: b.mode || 'NEFT',
      carryForward: num(b.carryForward), amount: num(b.amount), notes: b.notes || '',
    }),
  },
  expenditures: {
    path: 'expenditures',
    toClient: (d) => ({
      id: idStr(d.id ?? d._id), date: dstr(d.date), projectId: idStr(d.project ?? d.projectId),
      companyId: idStr(d.company ?? d.companyId), yearId: idStr(d.financialYear ?? d.financialYearId),
      category: d.category || '', approvedBy: d.approvedBy || '', amount: num(d.amount),
      description: d.description || '', reference: d.reference || '', notes: d.notes || '',
    }),
    toDb: (b) => ({
      date: b.date || null, projectId: b.projectId, companyId: b.companyId, financialYearId: b.yearId,
      category: b.category || '', approvedBy: b.approvedBy || '', amount: num(b.amount),
      description: b.description || '', reference: b.reference || '', notes: b.notes || '',
    }),
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

  // ── generic resource CRUD ──
  list: async (resource: string) => { const c = RES[resource]; const { data } = await http.get('/' + c.path); return (data || []).map(c.toClient); },
  create: async (resource: string, body: any) => { const c = RES[resource]; const { data } = await http.post('/' + c.path, c.toDb(body)); return c.toClient(data); },
  update: async (resource: string, id: string, body: any) => { const c = RES[resource]; const { data } = await http.put('/' + c.path + '/' + id, c.toDb(body)); return c.toClient(data); },
  remove: async (resource: string, id: string) => { const c = RES[resource]; await http.delete('/' + c.path + '/' + id); },
};
