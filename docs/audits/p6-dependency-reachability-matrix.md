# P6 — Dependency & Reachability Matrix

Base: `HEAD = origin/main = d082dad` (P4 `eedcf92`, P5 `d082dad` closed, P5 Independent Review GREEN).
Method: read-only tracing of every writer/reader over the 14 REASSESS surfaces. No inference from old reports — all entries verified against current HEAD source.

Classification legend:
- **ACTIVE** — on a production runtime path (reachable from App routes / entry).
- **DORMANT** — defined and compiled, but zero production importers.
- **DEAD** — zero importers anywhere (tests included).
- **TEST-ONLY** — imported only by test files.

---

## 1. Repair / customer data (owner item 1 + 2)

### Reachability chain (all ACTIVE)
```
App.tsx routes (repair-* :84-91, deep-link :141)
 ├─ RepairRequestScreen     → repair-repository.createRequest → repair-database → RepairDataService
 ├─ RepairTrackingScreen    → search / getTimeline (QR deep-link #/repair-tracking?code=)
 ├─ RepairAdminDashboard    → getAllRequests / getQuote / createQuote / assignCourier / assignTechnician / updateStatus
 ├─ RepairCourierScreen     → getAllCourierJobs / updateCourierJobStatus
 ├─ RepairCustomerHistory   → getAllRequests (buildCustomerProfile by customerPhone)
 ├─ RepairPersonnelScreen   → couriers/technicians CRUD (localStorage-only)
 ├─ RepairDiagnosticsScreen → getHealth
 └─ RepairHomeScreen        → menu
```
`RepairDataService` (src/core/supabase/repair-data-service.ts) is the **only** Supabase writer of `repair_*` tables. Sole runtime importer: `src/services/repair/repair-database.ts:8`. `repair-repository.ts` (singleton, :11-21) is the facade used by all 8 screens.

### Method × operation × table matrix (repair-data-service.ts)
| Method | :line | Table | Op | Reachability |
|---|---|---|---|---|
| getAllRepairRequests | 96 | repair_requests | select | ACTIVE |
| getRepairRequest | 102 | repair_requests | select | ACTIVE |
| saveRepairRequest | 108 | repair_requests | upsert (PII: customer_name/phone, lat/long, photo_paths base64, customer_id) | ACTIVE |
| deleteRepairRequest | 130 | repair_requests | delete | ACTIVE |
| getRepairRequestsByCustomer | 135 | repair_requests | select | ACTIVE |
| getRepairRequestsByStatus | 141 | repair_requests | select | ACTIVE |
| getRepairRequestsByCourier | 147 | repair_requests | select | ACTIVE |
| getRepairRequestByCode | 153 | repair_requests | select | ACTIVE |
| getRepairRequestsByName | 159 | repair_requests | select (ilike customer_name) | **DORMANT** |
| getRepairRequestsByPhone | 165 | repair_requests | select | **DORMANT** |
| getAllQuotes | 171 | repair_quotes | select | ACTIVE |
| getQuote | 177 | repair_quotes | select | ACTIVE |
| saveQuote | 183 | repair_quotes | upsert | ACTIVE |
| getAllTimelineEvents | 196 | repair_timeline | select | ACTIVE |
| addTimelineEvent | 204 | repair_timeline | insert | ACTIVE |
| getAllCourierJobs | 213 | repair_courier_jobs | select (PII: courier/customer name, phone, address, lat/long) | ACTIVE |
| getCourierJobByRepair | 221 | repair_courier_jobs | select | ACTIVE |
| saveCourierJob | 227 | repair_courier_jobs | upsert | ACTIVE |
| getAllNotifications | 240 | repair_notifications | select | **DORMANT** |
| saveNotification | 248 | repair_notifications | insert | **DORMANT** |
| getAllPhotos | 258 | repair_photos | select | **DORMANT** |
| savePhoto | 266 | repair_photos | insert | **DORMANT** |
| getRepairCodeExists | 275 | repair_requests | select | ACTIVE |
| addStatusHistory | 282 | repair_status_history | insert (ip_address, device_info) | ACTIVE |
| getStatusHistory | 293 | repair_status_history | select | ACTIVE |
| addAuditLog | 309 | repair_audit_log | insert (ip_address, user_agent) | ACTIVE |
| getAuditLog | 320 | repair_audit_log | select | ACTIVE |
| healthCheck | 335 | 9 tables probe | select | ACTIVE |

PII fields persisted (Supabase + localStorage fallback `repair_*_v1` keys, `repair-types.ts:242-253`): `customer_name`, `customer_phone`, `customer_address`, `customer_id`, `latitude`, `longitude`, `google_maps_link`, `photo_paths` (base64), `ip_address`, `user_agent`, `device_info`, courier/technician name+phone (`repair_couriers` / `repair_technicians` localStorage, hardcoded staff defaults in `RepairPersonnelScreen.tsx:13-24`).

### SQL / RLS exposure
- `00001_repair_tables.sql`, `00005_fix_repair_tables.sql`, `00006_add_repair_status_history_and_audit.sql`.
- `00005:33-40` — **public read**: `create policy "Anyone can read repair requests" using (true)`; `:53-54` timeline read/insert public; `:66` photos insert public. Customer names/phones are readable by anonymous clients.
- `00006` — `repair_status_history` (ip_address, device_info :13-14), `repair_audit_log` (ip_address, user_agent :35-36).
- `idx_repair_requests_customer_name` (:22) backs the dormant name-search.

### Related modules
| File | Reachability | Notes |
|---|---|---|
| repair-repository.ts | ACTIVE | singleton facade; `logAudit` writes `navigator.userAgent` (:25, :31), `logStatusChange` writes ip/device (:36-42) |
| repair-database.ts | ACTIVE | facade; localStorage fallback + `syncToSupabase` (:425-437); searchRequests matches code/phone/name (:392-405) |
| repair-engine.ts | **TEST-ONLY** | only importer `__tests__/repair/repair.test.ts:6` |
| repair-bi.ts | **TEST-ONLY** | dynamic import `repair.test.ts:249` |
| repair-whatsapp.ts `sendStatusWhatsApp` | **DEAD** | zero importers (:17) |
| whatsapp-service.ts `openRepairStatus` | **DEAD** | zero callers (:102) |
| whatsapp-service.ts `openRepairRequest` | ACTIVE | embeds `customerPhone` in wa.me message (:95) — KEEP (WhatsApp handoff) |

---

## 2. Device ledger / IMEI (owner item 3)
| File / symbol | :line | Reachability | Data |
|---|---|---|---|
| device-ledger.ts `DeviceLedger` | :125 | **DORMANT** (zero production callers) | `device_ledger_v1` / `device_ledger_sequence`; **IMEI**, serialNumber, counterparty, free-text notes |
| device-ledger.test.ts | :2 | TEST-ONLY | — |
| golden-audit.ts `auditLedger` reads `device_ledger_v1` | :318 | DORMANT tooling (CLI `audit:golden`) | read-only counts, no PII output |
| inventory-service.ts comment | :13-14 | — | reference only |

Module header itself states: "0 Runtime screens call DeviceLedger APIs" (device-ledger.ts:9-14).

---

## 3. customer_memory (owner item 4)
| File / symbol | :line | Reachability | Data |
|---|---|---|---|
| customer-memory.ts `CustomerMemoryService` | :65 | **DEAD** (zero callers, tests included) | `customer_memory_sessions` / `customer_memory_events`; customerId-keyed CRM shape, `customerName?`, free-text `notes?`, `send_whatsapp` events |

No barrel export; no UI/route/test import.

---

## 4. popularity (owner item 5)
| File / symbol | :line | Reachability | Data |
|---|---|---|---|
| popularity-engine.ts `PhonePopularity.getScore` | :181 | ACTIVE (via catalog search) | `popularity_scores` **written** on every search (getScore→persistScores :125-127, :130-136) |
| `PhonePopularity.recordEvent` | :167 | **DORMANT** (zero callers) | `popularity_events` — never written by current code |
| catalog-service.ts `searchCatalog` → getScore | :20 | ACTIVE | catalog UI chain: CatalogCascadeSelector.tsx:105 → RepairRequestScreen / AddInventoryModal / CustomerPhoneFlow |

Data is **anonymous** (brand/model + counters + timestamps; no PII). Existing privacy docs classify `popularity_scores` KEEP, `popularity_events` tracking.

---

## 5. Research / BI remaining surfaces (owner item 6)

### Entry (ACTIVE, role-gated `scientific:read`)
- `research` (ResearchConsole): App.tsx:184-189, guard :76; entry buttons SettingsScreen:170/173, HomeMenu:103 (canManage).
- `business-intelligence` (BusinessIntelligenceCenter): App.tsx:190-195, guard :77; entry SettingsScreen:170.
- Role gate: core/research/permissions.ts — guest→none, user→viewer, researcher→analyst, admin→research_admin, super_admin→super_admin. viewer: overview/sessions/users read only; scientific read → analyst+.

### Research live API (api-supabase.ts, ACTIVE — createResearchAPI() :229)
| Method | :line | Tables / identity exposure |
|---|---|---|
| getOverview | 234 | users(id,role), sessions(measurements, scientific_results, device_id, user_id), calibrations |
| getScientific | 390 | sessions(measurements, scientific_results) |
| getUserAnalytics | 454 | users(id, role, created_at), sessions |
| getSessionAnalytics | 506 | sessions |
| getSessionList | 558 | sessions + **users join display_name** + **devices full fingerprint** (user_agent, timezone, screen, memory, cpu, pointer, touch, pixel_ratio) |
| getDeviceAnalytics | 639 | devices `.select('*')` |
| getDeviceIntelligence | 671 | devices `.select('*')` + sessions + calibrations |
| getSurveyAnalytics | 844 | surveys `.select('*')` (age_range/gender/education aggregates) |
| getSystemHealth | 880 | users count |

### Research demo API
| File | Reachability | Notes |
|---|---|---|
| core/research/api.ts + index.ts barrel | **TEST-ONLY / DEAD** | only `__tests__/research/api.test.ts` imports; barrel has no production importer |

### Research console components
- All dashboards ACTIVE via ResearchConsole switch. DEAD: HeatmapChart.tsx, FunnelChart.tsx, ExportUtils.ts (zero importers).

### Business Intelligence (api.ts, ACTIVE — createBusinessAPI() :26 composes createResearchAPI)
| Method | :line | Identity exposure |
|---|---|---|
| getCommandCenter | 31 | sessions + trade_requests + **users(display_name)** + devices.user_agent |
| getCustomerProfile | 147 | **SELECT * users/sessions/trade_requests** + devices(user_agent, os, browser) |
| getCustomerList | 227 | delegates to commandCenter.opportunities (userId, displayName) |
| getDeviceInsights | 232 | researchAPI.getDeviceIntelligence (fingerprints) |
| getCommerceFunnel | 290 | counts only |
| getTreasureMode | 338 | recommendations embed **displayName** (:387) |

All 19 BI tabs ACTIVE via center switch :24-44. localStorage sandboxes (`bi_*`) ACTIVE but isolated; `bi_staff` = staff performance (staff identity).

---

## 6. Surveys (owner item 7)
| Item | :line | Reachability | Notes |
|---|---|---|---|
| getSurveyAnalytics (surveys table read) | api-supabase.ts:844 | ACTIVE (read-only) | aggregates age_range/gender/education; filters ignored; many distributions hard-coded empty |
| SurveysDashboard | research-console/pages/surveys/ | ACTIVE | only caller of getSurveyAnalytics |
| surveys table (DatabaseSurvey PII: age_range, gender, country, state, education, occupation, sleep/coffee/exercise, dominant_hand, gaming_frequency) | schema.ts:90-105 | DORMANT (type-only) | — |
| **App-side surveys writer** | — | **NONE** | zero `.from('surveys').insert/upsert/update` anywhere |
| User-facing survey flow | — | **NONE** | no screen exists |
| surveys RLS SQL (phase1 02, phase-c CR-004) | supabase/ | DB-SIDE | no app reader/writer dependency |

---

## 7. Contract tables (owner item 8) — DB-side only
| Object | Migration | App references | Notes |
|---|---|---|---|
| system_settings | 00009 | **ZERO** | key/value flags; RLS admin+public |
| audit_log | 00009 | **ZERO** | append-only; admin read |
| job_assignments | 00009 | **ZERO** | campaign delegates |
| contract columns engine_name/campaign_snapshot/trials/observability on sessions | 00010 | ZERO | deferred |
| contract RPC lookup_campaign_by_short_code_v2 | 00011 | ZERO | — |
| backfill / constraints | 00012 / 00013 | ZERO | — |
| verify-live-schema GATE C | verify-live-schema.sql:107 | — | expects 00009 tables "NOT exist yet if never applied" |

Deferred migrations 00009-00013 are **not in the app dependency graph**.

---

## 8. AI Coach (owner item 9)
| File | Reachability | Data |
|---|---|---|
| src/ai/coach/** (engine, learning, analysis, trends, goals, recommendations, insights, confidence, passport, comparative, explainability, personality, reports) | ACTIVE | **pure in-memory**; zero network, zero localStorage, zero Supabase, zero LLM |
| CoachScreen (App.tsx:47/78; entry ResultsScreen:325) | ACTIVE | input = current-run in-memory sessions (store reducer) |
| learning.ts history | :53-82 | closure array only; dies with component |
| export (focus-coach-report-*.txt) | CoachScreen:443-452 | client-side download only |

**No persistence, no identity, no chat.** KEEP.

---

## 9. users (owner item 10)
| Reader | :line | Reachability |
|---|---|---|
| core/auth/index.ts `fetchRoleFromProfile` (users.role) | 50-62 | ACTIVE (auth gate dependency) |
| research api-supabase (id, role, display_name, created_at) | 242/455/576/882 | ACTIVE (admin console) |
| BI api (SELECT * getCustomerProfile; display_name in command center) | 149/38/292 | ACTIVE (admin console) |
| **users writer** | — | **NONE** (auth writes go to auth.users via supabase.auth; public.users row creation is DB-side trigger `handle-new-user`, security-hardening phase-c C2b) |

## 10. system_settings / audit_log / job_assignments (owner items 11-13)
App-side references: **ZERO** for all three (verified by directory scan + `.from()` inventory). DB-side objects defined in deferred migration 00009 only. The only `audit_log`/`status_history` app code is the **repair_*** variants (repair_audit_log, repair_status_history) covered in §1.

## 11. Remaining persistent personal/customer data discovered (owner item 14)
| Key / object | Location | Reachability | PII |
|---|---|---|---|
| repair_requests/quotes/timeline/courier_jobs/status_history/audit_log (+ `_v1` localStorage) | repair chain | ACTIVE | customer name/phone/address/location, courier phone, ip/user_agent, base64 photos |
| repair_couriers / repair_technicians | PersonnelScreen | ACTIVE | staff names + phones (hardcoded defaults) |
| bi_staff | BI StaffPerformance | ACTIVE | staff identity (sandbox) |
| focus_sessions / focus_sessions_v2 | core/repository/local-storage.ts:9, core/storage/repository/index.ts:36 | DORMANT | game session history (no identity fields) |
| devices (fingerprints) / sessions (user_id) / calibrations | research/BI reads | ACTIVE (read-only) | device fingerprints, user_id linkage |
| campaigns / qr_codes / analytics_events / placements / placement_history | DB (migrations 00003-00004, 00007, 00016-00018) | DB-side only | no app readers/writers remain (P5) |

---

## Cross-cutting invariants (verified GREEN today)
| Invariant | Evidence |
|---|---|
| live-sessions.ts has no production importer | DEAD (only file itself + test comments) |
| session-repository (Supabase session writes) has no production importer | DORMANT via dead barrel core/index.ts |
| No app reference to system_settings/audit_log/job_assignments/contracts tables | zero `.from()` hits |
| No `.rpc()` in production | only test file mocks `lookup_campaign_by_short_code` |
| No app write to users/surveys/trade_requests/devices/calibrations | zero insert/upsert/update/delete hits |
