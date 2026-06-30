# CORE-SENTINEL / DAO HMI — Delivery Roadmap
**Owner:** InRebus (WP 1.6 UI state-of-the-art + WP 3.6 training/customization)
**Target:** Restructure the current nuclear demo into the official DAO HMI deliverable — 14 screens (SCR-01…SCR-14), 93 components (CMP-01…CMP-93), 3 roles (OL/OD/AS), 21 notification policies, 24 visualization standards — fully buildable now on stubs, "ready to connect" when FOS/PoliTO/Links deliver backends.

**Spec sources:** `D1.1.1_OR1_WP1.2_2.xlsx` (UC/REQ/KPI) + `Mappatura schermate-ruoli_inRebus_v5` (screens/roles/components/notifications/standards). Text dump: `_ref_dump.txt`.

---

## 0. Guiding principles

1. **Everything reads through the data-abstraction layer** (Task F1). No screen talks to a data source directly. Today providers return stubs; tomorrow one config swap points them at FOS/PoliTO/Links.
2. **Every screen is composed from the Visualization Standards library** (Task F2). No bespoke markup per screen — pick the `*_STD_*` that the spec assigns to each component.
3. **Every value carries provenance** (Task F3): source (Misurato/Stimato/Predetto/Aggregato/Simulato), confidence, quality, timestamp, plus a defined fallback + degraded behavior.
4. **RBAC is data-driven** (Task F5): one matrix object encodes per-screen + per-component access for OL/OD/AS. UI never hardcodes role checks.
5. **Notifications are policy-driven** (Task F4): components reference an `NP-*` policy id; the engine handles trigger/criticality/recipients/channel/escalation/throttling.
6. **Demo dataset stays:** the 16 LFR sensors remain as the seeded demo data behind the abstraction layer — they prove the platform works without implying the platform is nuclear-only.

---

## 1. Role model (authoritative)

| Role | Name | Scope |
|------|------|-------|
| **OL** | Operatore locale | Real-time supervision: monitoring, alarm view+ack, trend consult, live optical inspection |
| **OD** | Operatore di diagnostica | Advanced analysis: AI/virtual sensors, twin, calibration, maintenance planning, threshold config |
| **AS** | Amministratore di sistema | Config, users/roles, cybersecurity, IoT infra, audit, backup |

Access codes used in the matrix: `R` read · `R/U` read+update · `C/R/U/D` full · `X` no access.

> Note: the current code has a `TR` (trainee) role from the old training prompt. The spec has **only OL/OD/AS**. Task F5 reconciles this — training is accessible to OL/OD/AS, not a separate role.

---

## 2. Visualization Standards (the component kit — Task F2)

| Standard | Use | UI type |
|---|---|---|
| `TREND_STD_01` | Time trends, multi-series, thresholds | Line chart |
| `KPI_STD_01` | Single KPI / SHI / RUL | Numeric card |
| `KPI_TABLE_STD_01` | Ranked/prioritized KPI lists | Table |
| `ALARM_STD_01` | Operational + cyber alarms | Table / popup / action card |
| `STATE_STD_01` | Service/module/node status | Card |
| `TABLE_STD_01` | Generic registries (sensors, users, roles) | Table (+CRUD if role) |
| `AUDIT_STD_01` | Logs / audit trail / sessions | Table |
| `FORM_STD_01` | Config forms, selectors, thresholds | Form / popup form |
| `ACTION_STD_01` | Single action (export, ack, download) | Button |
| `ACTION_PANEL_STD_01` | Status + actions (backup, snapshot) | Card w/ buttons |
| `MAP_STD_01` | Asset/sensor map | Graphic display |
| `TOPOLOGY_STD_01` | IoT network graph | Graphic display |
| `HEATMAP_STD_01` | AI anomaly heatmap | Graphic display |
| `CORR_STD_01` | Correlation matrix (−1..+1) | Graphic display |
| `TWIN_COMPARE_STD_01` | Real vs simulated | Chart |
| `TWIN_3D_STD_01` | 3D twin view | Graphic display |
| `VIDEO_STREAM_STD_01` | Live video | Player |
| `VIDEO_OVERLAY_STD_01` | Video + sensor overlay | Graphic display |
| `VISION_DETECTION_STD_01` | AI bounding boxes | Card / graphic |
| `DATA_QUALITY_STD_01` | Completeness/freshness/error | Card |
| `EVIDENCE_STD_01` | Annotated snapshots | Card w/ buttons |
| `CATALOG_STD_01` | Scenario/course selection | Card |
| `LAYOUT_STD_01` | Dashboard widget layout | Container |

**Color/line semantics (mandatory — Task F3):** real = solid **green**; estimated/virtual = dashed **blue**; predicted (AI/twin) = dotted **purple**; stale = **grey** + last-valid timestamp; degraded = **orange** "DEGRADED" badge; warning = **yellow**; critical = **red**.

---

## 3. Notification policies (Task F4)

| Policy | Trigger | Crit. | To | Channel | Escalation | Throttle |
|---|---|---|---|---|---|---|
| NP-CRIT-VAR-01 | Critical threshold crossed | Alta | OL,AS | UI,Email | after 5 min | 1/event |
| NP-SIGNAL-LOSS-01 | No data > threshold | Alta | OL,AS | UI,Email | to AS | 1/min |
| NP-MODEL-DRIFT-01 | Drift > threshold | Media | OD | UI | — | 1/5min |
| NP-DATA-QUALITY-01 | Completeness below threshold | Media | OL,OD | UI | — | 1/10min |
| NP-PIPELINE-ERR-01 | High error rate | Alta | AS | UI,Email | yes | 1/min |
| NP-CYB-ALERT-01 | Security event | Critica | AS | UI,Email | immediate | none |
| NP-LOGIN-FAIL-01 | Repeated failed logins | Media | AS | Email | — | 1/event |
| NP-TWIN-DIVERGENCE-01 | Deviation above threshold | Media | OD,OL | UI | — | 1/5min |
| NP-MAINT-REMINDER-01 | Planned date | Bassa | OD | Email | — | 1/day |
| NP-CERT-EXP-01 | Cert expiring | Media | AS | Email | — | 1/day |
| NP-SYSTEM-STATE-01 | Service down/degraded | Alta | OL,AS | UI,Email | after 5 min | 1/5min |
| NP-ALARM-CRIT-01 | New critical alarm / escalation | Critica | OL,OD,AS | UI,Email | immediate | 1/event |
| NP-CORR-CRIT-01 | Anomalous correlation | Media | OD | UI | — | 1/10min |
| NP-ALARM-ESC-01 | Escalation misconfigured/failed | Alta | AS | UI,Email | yes | 1/15min |
| NP-OTT-STREAM-01 | Stream loss / latency | Alta | OL,AS | UI,Email | to AS | 1/min |
| NP-OTT-ANOM-01 | Critical visual anomaly | Alta | OL,OD | UI,Email | — | 1/5min |
| NP-TRN-SCENARIO-01 | Training scenario load/sim error | Media | OD,AS | UI,Email | — | 1/event |
| NP-TRN-ASSIGN-01 | Course assignment done/failed | Bassa | OL,OD | Email | — | 1/event |
| NP-USER-ADMIN-01 | User create/modify/provision error | Media | AS | Email | — | 1/event |
| NP-BACKUP-01 | Backup done/failed / restore started | Alta | AS | UI,Email | on failure | 1/event |

---

## 4. Phased roadmap

```
WAVE A — FOUNDATION (F1–F6)      ~ build first, blocks everything
   F1 Data layer ─┬─ F3 Provenance ─┐
   F2 Std library ┤                 ├─ F6 Nav shell ── unlocks all screens
   F5 RBAC ───────┴─ F4 Notifications┘

WAVE B — RESTRUCTURE EXISTING (7–12)   screens you already have material for
   SCR-01 Login · SCR-02 Dashboard · SCR-07 Alarms · SCR-11 Twin · SCR-13 Training · SCR-14 Config

WAVE C — NEW SCREENS (13–20)           build from spec on stubs
   SCR-03 · SCR-04 · SCR-05 · SCR-06 · SCR-08 · SCR-09 · SCR-10 · SCR-12

WAVE D — COMPLIANCE (21–22)            proof for audit + partners
   C1 Traceability + API-readiness · C2 KPI instrumentation + usability
```

**Sequencing rules:**
- Wave A is sequential-ish: F1+F2+F5 can proceed in parallel; F3 depends on F1+F2; F4 depends on F5; F6 depends on all of A.
- Wave B/C screens each depend on all of Wave A. Within B/C they are independent and can be done in any order (or parallelized).
- Recommended order inside C: SCR-09 (trending, reuses predictor) → SCR-04 (virtual sensors) → SCR-06 (multisensor) → SCR-03 → SCR-05 → SCR-10 → SCR-08 → SCR-12.

**Rough effort (relative):** F1 L · F2 L · F3 M · F4 M · F5 M · F6 M · each Wave-B screen M · each Wave-C screen M–L (SCR-06, SCR-10, SCR-12 are L) · C1 M · C2 M.
(S ≈ <½ day, M ≈ ~1 day, L ≈ ~2 days at focused pace — estimates, not commitments.)

---

## 5. Detailed task cards

> Each card: **Depends on · Components · Standards · Data sources (stub→real) · RBAC · Notifications · Requirements/KPIs · Acceptance criteria.**

### WAVE A — FOUNDATION

#### F1 — Data-abstraction / transport layer
- **Depends on:** —
- **Scope:** `DataService` facade + per-domain providers: `sensors`, `events/alarms`, `twin`, `ai` (models/virtual sensors), `iot/edge`, `security`, `training`, `auth`. Each exposes a uniform async/subscribe API and returns stub data seeded from the 16 LFR sensors + synthetic events. A `TRANSPORT` config (`simulated` | `websocket` | `opcua`) selects the live source later.
- **Provenance contract:** every datum = `{ value, source, unit, confidence, quality, timestamp }`.
- **Data sources:** all STUB now → FOS WebSocket/OPC UA, PoliTO twin, Links AI later.
- **Acceptance:** all current screens read through `DataService`; flipping a provider to a mock-WS source changes nothing visible; no direct `DAO`/random calls left in views.
- *(Absorbs old Prompt 11 Transport Abstraction.)*

#### F2 — Visualization Standards library
- **Depends on:** — (pairs with F1)
- **Scope:** one render module per standard in §2 (24 total), each taking a normalized props object and emitting spec-compliant markup + interactions (zoom/hover/sort/filter/drill-down as listed). Storybook-style demo page to eyeball all standards.
- **Acceptance:** a screen can be assembled purely by calling standards; visual rules (lines, badges, colors) come from the standard, not the caller.

#### F3 — Provenance + color/line semantics
- **Depends on:** F1, F2
- **Scope:** CSS tokens + helpers for the 7 semantic colors and 3 line styles; provenance badge component; confidence-band renderer; `fallback()` and `degraded()` wrappers implementing "ultimo dato valido" + grey/orange states + "DATI DEGRADATI" badges.
- **Requirements:** IEC 60964 (telemetry never blanks); REQ-ACG-002-01.
- **Acceptance:** force a provider into degraded/stale → values stay visible, greyed, timestamped; estimated vs predicted vs real are visually distinct on a trend.
- *(Absorbs old Prompt 2 Provenance + Prompt 6 Graceful Degradation.)*

#### F4 — Notification engine (21 NP-*)
- **Depends on:** F5
- **Scope:** policy registry (§3) + dispatcher (criticality, recipients, channel, escalation timer, throttling). UI notification center + toasts; email channel = stub (FOS-ready). Components fire by policy id.
- **Requirements:** REQ-ALR-001-04 (≤5 s notify), REQ-ALR-002-01; KPI-ALR-001-04-1.
- **Acceptance:** crossing a critical threshold raises NP-CRIT-VAR-01 to OL+AS in UI within budget, throttled to 1/event, escalates after 5 min; AS-only policies never shown to OL.

#### F5 — RBAC matrix (per-screen + per-component)
- **Depends on:** —
- **Scope:** single matrix object encoding `Schermate` (screen access) + `Mappatura componenti` (component capability) for OL/OD/AS. Helpers `canSeeScreen`, `canSeeComponent`, `cap(role,cmp)` → R/RU/CRUD/X. Drives nav, component mount, action guards. Reconcile away the `TR` role.
- **Requirements:** REQ-CYB-001-01; KPI-CYB-001-01-1.
- **Acceptance:** logging in as OL hides AS-only screens (SCR-08, SCR-14) and AS/OD-only components (IoT, cyber, SHI); capability gates CRUD buttons exactly per spec.

#### F6 — 14-screen navigation shell (L1–L5)
- **Depends on:** F1–F5
- **Scope:** nav for SCR-01…SCR-14 organized by navigation level (L1 Overview → L5 Config). Each screen = a render module composing standards+data+provenance, mounted/guarded by RBAC. Retire the nuclear SCR/panel scheme.
- **Acceptance:** all 14 screens routable (placeholders OK), role-filtered, level-grouped; deep-link/state per screen works.

---

### WAVE B — RESTRUCTURE EXISTING SCREENS

#### Task 7 — SCR-01 Login + MFA *(L5, Core/Utenti — all roles R)*
- **Components:** CMP-01 Login form, CMP-02 system-status card (`STATE_STD_01`), CMP-03 MFA OTP form.
- **Standards:** `FORM_STD_01`, `STATE_STD_01`. **Data:** Auth service (stub `AuthService`, FOS Identity-ready) + Core system status.
- **Notifications:** NP-LOGIN-FAIL-01, NP-SYSTEM-STATE-01. **Req:** REQ-CYB-001-01.
- **Acceptance:** username/password + OTP flow; 5 fails → lockout w/ countdown; pre-login status badge; demo creds documented; Enter submits. *(Absorbs old Prompt B1.)*

#### Task 8 — SCR-02 Operational Dashboard *(L1/L2, Cross-layer)*
- **Components:** CMP-04 system status, CMP-05 critical variables (real/estimated/predicted overlay), CMP-06 alarms, CMP-07 recent events, CMP-08 sensors summary, CMP-09 variable charts, CMP-10 SHI/RUL *(OD/AS)*, CMP-11 model/virtual-sensor status *(OD/AS)*, CMP-12 AM components, CMP-13 IoT status *(AS)*, CMP-14 cybersecurity *(AS)*, CMP-15 config log *(AS)*, CMP-16 user status *(AS)*, **CMP-17 widget customization (InRebus, `LAYOUT_STD_01`)**.
- **Standards:** `STATE_STD_01`,`TREND_STD_01`,`ALARM_STD_01`,`AUDIT_STD_01`,`KPI_STD_01`,`DATA_QUALITY_STD_01`,`LAYOUT_STD_01`.
- **Notifications:** NP-SYSTEM-STATE-01, NP-CRIT-VAR-01, NP-ALARM-CRIT-01, NP-SIGNAL-LOSS-01. **Req:** REQ-ACG-002-01, REQ-HMI-001-02, REQ-HMI-002-02. **KPI:** HMI-001-01, HMI-002-02.
- **Acceptance:** widgets toggle/reorder, layout persists per user; AS sees extra widgets (IoT/cyber/CPU/storage); CMP-05 shows the 3 provenance line styles.

#### Task 9 — SCR-07 Alarm management *(L1–L3, Cross-layer)*
- **Components:** CMP-46 active list, CMP-47 detail popup, CMP-48 acknowledge, CMP-49 threshold config *(OD/AS)*, CMP-50 history, CMP-51 escalation workflow *(OD/AS)*, CMP-53 alarm-quality KPIs *(OD/AS)*.
- **Standards:** `ALARM_STD_01`,`FORM_STD_01`,`ACTION_STD_01`,`KPI_STD_01`. **Data:** Event engine (stub).
- **Notifications:** NP-ALARM-CRIT-01, NP-ALARM-ESC-01. **Req:** REQ-ALR-001-01/03/04/05. **KPI:** ALR-001-03/04/05.
- **Acceptance:** port existing first-out + shelving; ack tracked to audit; thresholds editable per RBAC; flood/escalation behavior. *(Absorbs old Prompt 9.)*

#### Task 10 — SCR-11 Digital Twin *(L2/L3, Twin — PoliTO data)*
- **Components:** CMP-73 3D view + real overlay, CMP-74 real-vs-sim compare, CMP-75 scenarios *(OD/AS)*, CMP-76 scenario log.
- **Standards:** `TWIN_3D_STD_01`,`TWIN_COMPARE_STD_01`,`FORM_STD_01`,`AUDIT_STD_01`. **Data:** PoliTO twin engine (stub via existing `three-twin.js`).
- **Notifications:** NP-TWIN-DIVERGENCE-01. **Req:** REQ-DTW-001-01/02. **KPI:** DTW-001-01.
- **Acceptance:** port existing 3D twin; deviation %, divergence badge; scenario run logged.

#### Task 11 — SCR-13 Training *(InRebus-owned, Training)*
- **Components:** CMP-82 current-scenario twin view, CMP-83 scenario catalog (`CATALOG_STD_01`), CMP-84 "My courses" (progress/badges), CMP-85 add simulation/course *(AS, VR/SCORM/video upload + role assignment)*, CMP-86 user KPIs, CMP-87 results export *(AS)*.
- **Standards:** `TWIN_3D_STD_01`,`CATALOG_STD_01`,`FORM_STD_01`,`KPI_STD_01`,`ACTION_STD_01`. **Data:** Training DB/engine (stub).
- **Notifications:** NP-TRN-SCENARIO-01, NP-TRN-ASSIGN-01. **Req:** REQ-TRN-001-01. **KPI:** TRN-001-01.
- **Acceptance:** port existing training mode; users see own results, AS sees all + export; courses link to simulations; reconciled to OL/OD/AS.

#### Task 12 — SCR-14 Config & administration *(AS only, L5)*
- **Components:** CMP-88 user mgmt CRUD, CMP-89 roles & permissions, CMP-90 system config (session timeout, security policy), CMP-91 modularity status, CMP-92 audit log, CMP-93 backup/restore.
- **Standards:** `TABLE_STD_01`,`FORM_STD_01`,`STATE_STD_01`,`AUDIT_STD_01`,`ACTION_PANEL_STD_01`. **Data:** FOS (stub); InRebus is Data Processor.
- **Notifications:** NP-USER-ADMIN-01, NP-BACKUP-01. **Req:** REQ-CYB-001-01/02, REQ-HMI-002-01, REQ-ACG-001-02. **KPI:** HMI-002-01.
- **Acceptance:** full CRUD on users/roles; config writes audited; backup action with status panel; reuses existing config-service/versioning.

---

### WAVE C — NEW SCREENS

#### Task 13 — SCR-03 Sensor acquisition & configuration *(Sensori)*
- **Components:** CMP-18 sensor registry CRUD (`TABLE_STD_01`), CMP-19 pipeline status (`STATE_STD_01`), CMP-20 datasheet popup, CMP-21 acquisition config popup (Hz, thresholds, range, units), CMP-22 raw-data monitor (`TREND_STD_01`), CMP-23 validation & calibration (`KPI_STD_01`), CMP-25 sensor event log (`AUDIT_STD_01`), CMP-26 device security.
- **Notifications:** NP-SIGNAL-LOSS-01, NP-PIPELINE-ERR-01, NP-DATA-QUALITY-01. **Req:** REQ-ACG-001-01/03/04, REQ-DGN-003-01/02/03, REQ-ALR-001-01. **KPI:** ACG-001-01-1 (≥8 sensors), DGN-003-*.
- **Acceptance:** create/edit/delete sensors; thresholds drive alarms; calibration history; raw monitor flags spikes/out-of-range; CSV export.

#### Task 14 — SCR-04 Virtual sensors *(Links AI data)*
- **Components:** CMP-27 virtual-sensor list CRUD, CMP-28 logic definition, CMP-29 output monitor (`TREND_STD_01`), CMP-30 real-vs-virtual compare, CMP-31 AI model params *(AI-based only)*, CMP-32 twin association, CMP-33 model event log.
- **Standards:** `TABLE_STD_01`,`FORM_STD_01`,`TREND_STD_01`,`KPI_STD_01`,`TWIN_COMPARE_STD_01`,`AUDIT_STD_01`. Estimated values = **blue dashed**.
- **Notifications:** NP-MODEL-DRIFT-01. **Req:** REQ-SVR-001-01. **KPI:** SVR-001-01.
- **Acceptance:** virtual sensors compute from inputs (stub regression now, LINKS LSTM later), confidence shown, RMSE/error vs real, never trigger SCRAM/alarms. *(Absorbs old Prompt B3.)*

#### Task 15 — SCR-05 Sensor & IoT network *(FOS edge data)*
- **Components:** CMP-34 sensor status map (`MAP_STD_01`), CMP-35 IoT topology (`TOPOLOGY_STD_01`, *OD/AS*), CMP-36 node detail popup, CMP-37 comm-performance (`TREND_STD_01`), CMP-38 network security *(AS)*, **CMP-39 asset filter/search (InRebus, `FORM_STD_01`)**.
- **Notifications:** NP-PIPELINE-ERR-01. **Req:** REQ-ACG-001-01/04, REQ-CYB-002-01/02. **KPI:** CYB-002-01/02.
- **Acceptance:** map markers reflect online/offline/degraded + stale badges; topology shows link health/latency/packet-loss; node drill-down; filter scopes the screen.

#### Task 16 — SCR-06 Multisensor advanced visualization *(mostly InRebus)*
- **Components:** **CMP-40 variable selector (InRebus)**, CMP-41 multi-layer comparative chart (`TREND_STD_01`, real+estimated+predicted+simulated overlay), CMP-42 anomaly heatmap (`HEATMAP_STD_01`), CMP-43 correlation matrix (`CORR_STD_01`), CMP-44 twin overlay (`TWIN_COMPARE_STD_01`), **CMP-45 comparative export (InRebus)**.
- **Notifications:** NP-CORR-CRIT-01. **Req:** REQ-DGN-002-01, REQ-HMI-002-02. **KPI:** DGN-002-01-1 (≥3 vars in one view).
- **Acceptance:** ≥3 heterogeneous sources overlaid in one view with correct line styles; correlation matrix interactive; export of the composed dataset.

#### Task 17 — SCR-08 Cybersecurity alarms *(AS only, FOS security)*
- **Components:** CMP-54 alert list (`ALARM_STD_01`), CMP-55 threat detail (CVE, IP), CMP-56 ack/mitigation, CMP-57 vulnerability status, CMP-58 detection KPIs (`KPI_TABLE_STD_01`), CMP-59 suspicious-access log.
- **Notifications:** NP-CYB-ALERT-01, NP-LOGIN-FAIL-01, NP-CERT-EXP-01. **Req:** REQ-ALR-002-01/02/03, REQ-CYB-002-03. **KPI:** ALR-002-*.
- **Acceptance:** AS-only; alerts ack/mitigated with audit; vuln + expiring-cert surfacing; suspicious-login feed.

#### Task 18 — SCR-09 Historical analysis & trending *(Historian)*
- **Components:** **CMP-60 historical selector (InRebus)**, CMP-61 historic chart (`TREND_STD_01`, moving avg/trend/event annotations), CMP-62 predictive trend *(OD/AS, purple dotted)*, CMP-63 series-integrity (`DATA_QUALITY_STD_01`), CMP-64 baseline-deviation, **CMP-65 export (InRebus)**.
- **Notifications:** NP-CRIT-VAR-01, NP-DATA-QUALITY-01. **Req:** REQ-ANL-001-01/02/03/04. **KPI:** ANL-001-03-1 (**≥5 stats functions in HMI**).
- **Acceptance:** pick var+interval+granularity; ≥5 stats (mean, σ, min/max, trend, variance…); gaps shown; predictive projection w/ confidence; CSV/JSON export. *(Reuses old Prompt 1 predictor; folds in old Prompt 5 reporting.)*

#### Task 19 — SCR-10 Predictive maintenance & diagnostics *(Links AI)*
- **Components:** CMP-66 risk-ranked asset list (`KPI_TABLE_STD_01`, *OD/AS*), CMP-67 asset diagnostic detail, CMP-68 maintenance history, CMP-69 intervention planning *(OD R/U, AS CRUD)*, CMP-70 maintenance KPIs (MTBF/MTTR), CMP-71 diagnostic-reliability KPIs, CMP-72 diagnostic-session history/audit.
- **Notifications:** NP-MAINT-REMINDER-01, NP-MODEL-DRIFT-01. **Req:** REQ-DGN-001-01/03/04, REQ-DGN-002-02/03. **KPI:** DGN-001-*, DGN-002-02.
- **Acceptance:** assets ranked by RUL/failure prob; plan interventions per RBAC; reminders; session history reproducible/audited.

#### Task 20 — SCR-12 Remote optical inspection *(newcleo stream + Links vision)*
- **Components:** CMP-77 live stream (`VIDEO_STREAM_STD_01`), CMP-78 sensor overlay (`VIDEO_OVERLAY_STD_01`), CMP-79 annotated snapshot CRUD (`EVIDENCE_STD_01`), CMP-80 AI visual-anomaly detection *(OD/AS, `VISION_DETECTION_STD_01`)*, CMP-81 streaming-stability KPIs.
- **Notifications:** NP-OTT-STREAM-01, NP-OTT-ANOM-01. **Req:** REQ-OTT-001-01/02. **KPI:** OTT-001-01.
- **Acceptance:** placeholder video stream w/ quality/latency badges; snapshot + annotate + tag + export; bounding-box overlay from stub vision model; stream KPIs.

---

### WAVE D — COMPLIANCE / DELIVERABLE PROOF

#### Task 21 — Traceability matrix + API-readiness doc (C1)
- **Scope:** `docs/traceability.md` mapping screen → component → REQ → KPI (proves coverage of all 30+ requirements). `docs/api-readiness.md` listing every stub provider in F1 with the exact endpoint/payload each partner (FOS/PoliTO/Links/newcleo) must implement and where the swap happens. *(Folds in old Prompt B2 OPC UA contract.)*
- **Acceptance:** every spec REQ traces to ≥1 component; every stub has a documented connection point.

#### Task 22 — KPI instrumentation + usability/accessibility pass (C2)
- **Scope:** make HMI KPIs measurable in-app: HMI-001-01 (≥95% vars rendered), HMI-002-01 (≥90% functions configurable via HMI), ANL-001-03 (≥5 stats), DGN-002-01 (≥3 vars one view), plus a user-rating hook for HMI-001-02/002-02 (≥90% intuitive/customizable). Accessibility/usability pass: keyboard nav, focus rings, contrast, 44×44 touch targets (ISO 9241), screen-reader alarm announcements.
- **Acceptance:** a KPI dashboard/report shows pass/fail vs targets; accessibility checklist met.

---

## 6. Definition of Done (deliverable-level)

- [ ] All 14 screens routable, role-filtered, level-grouped.
- [ ] All 93 components present with correct standard, RBAC capability, provenance, fallback/degraded behavior.
- [ ] 21 notification policies wired and firing per spec.
- [ ] Color/line semantics applied everywhere; no value ever blanks on data loss.
- [ ] Everything reads through the data-abstraction layer; mock-WS source proves "ready to connect."
- [ ] Traceability matrix covers all REQs; API-readiness doc complete.
- [ ] HMI KPIs instrumented and meeting targets; usability/accessibility pass done.
- [ ] Existing assets (3D twin, predictor, alarms, training, config/versioning, MFE workspace) ported into the official structure, nothing regressed.

---

*Generated 2026-06-08. Backlog mirrored as tracked tasks #1–#22. Spec dump: `_ref_dump.txt`. Earlier 16-prompt list: `_extracted_prompts.txt`.*
