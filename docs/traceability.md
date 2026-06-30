# Traceability Matrix — CORE-SENTINEL HMI v4.3.0

**Source of truth:** [`packages/shared/src/mappatura.js`](../packages/shared/src/mappatura.js) (auto-generated from `_ref_mappatura_v5/`).
**Requirements & KPIs:** `D1.1.1_OR1_WP1.2_2.xlsx` (dump: `_ref_dump.txt`).

This document maps every implemented screen → component → requirement → KPI. It is what the project shows to FOS/PoliTO/Links/newcleo and to the WP review to demonstrate spec coverage.

---

## 1. Coverage summary

| Tier | Defined | Implemented | % |
|---|---:|---:|---:|
| Screens (SCR-01 … SCR-14) | 14 | 14 | 100% |
| Components (CMP-01 … CMP-93, sheet skips CMP-52) | 92 | 92 routable; ≥ 47 with custom data providers (others use atom default content) | 100% / 51% |
| Visualization standards | 24 | 24 | 100% |
| Notification policies (NP-*) | 20 | 8 actively fired by built-in watchers/triggers, 12 schema-only | 40% live |
| Roles | OL / OD / AS | OL / OD / AS (legacy TR mapped → OL) | 100% |
| Color/line semantics | 7 | 7 | 100% |

---

## 2. Screen → Component → REQ → KPI

> Standards: `TREND_STD_01`, `KPI_STD_01`, `STATE_STD_01`, `ALARM_STD_01`, `TABLE_STD_01`, `FORM_STD_01`, `ACTION_STD_01`, `DATA_QUALITY_STD_01`, `MAP_STD_01`, `TOPOLOGY_STD_01`, `HEATMAP_STD_01`, `CORR_STD_01`, `TWIN_COMPARE_STD_01`, `TWIN_3D_STD_01`, `VIDEO_STREAM_STD_01`, `VIDEO_OVERLAY_STD_01`, `VISION_DETECTION_STD_01`, `EVIDENCE_STD_01`, `CATALOG_STD_01`, `LAYOUT_STD_01`, `KPI_TABLE_STD_01`, `AUDIT_STD_01`, `ACTION_PANEL_STD_01`, `AUDIT_STD_01`.

### SCR-01 Login + MFA · *L5 · Core/Utenti · OL/OD/AS — R*
| CMP | Standard | Bound REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-01 Login form | FORM_STD_01 | REQ-CYB-001-01 | KPI-CYB-001-01-1 | `cmp01` — dispatches `SET_ROLE` |
| CMP-02 Stato sistema | STATE_STD_01 | REQ-HMI-001-02 | — | `cmp02` |
| CMP-03 MFA OTP | FORM_STD_01 | REQ-CYB-001-01 | KPI-CYB-001-01-1 | `cmp03` (OTP regex validation) |

### SCR-02 Dashboard operativa · *L1/L2 · Cross-layer · OL/OD/AS*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-04 Stato sistema | STATE_STD_01 | REQ-HMI-001-02 | HMI-001-01 | `cmp04` |
| CMP-05 Variabili critiche | TREND_STD_01 | REQ-ACG-002-01 | HMI-001-01 | trend of `histTemp` |
| CMP-06 Allarmi | ALARM_STD_01 | REQ-ALR-001-04 | KPI-ALR-001-04-1 | `alarmData()` |
| CMP-07 Eventi recenti | AUDIT_STD_01 | REQ-HMI-002-02 | — | `cmp07` (live audit log) |
| CMP-08 Sensori | STATE_STD_01 | REQ-ACG-001-01 | ACG-001-01-1 | `cmp08` |
| CMP-09 Trend variabili | TREND_STD_01 | REQ-ACG-002-01 | HMI-001-01 | trend of `histPress` |
| CMP-10 SHI/RUL *(OD/AS)* | KPI_STD_01 | REQ-DGN-001-01 | DGN-001-01-1 | `cmp10` |
| CMP-11 Modelli/VS *(OD/AS)* | STATE_STD_01 | REQ-SVR-001-01 | SVR-001-01 | `cmp11` |
| CMP-12 Componenti AM | KPI_STD_01 | REQ-DGN-002-02 | DGN-002-02 | `cmp12` |
| CMP-13 IoT status *(AS)* | STATE_STD_01 | REQ-CYB-002-01 | CYB-002-01 | `cmp13` |
| CMP-14 Cybersecurity *(AS)* | STATE_STD_01 | REQ-CYB-002-03 | KPI-CYB-002-* | `cmp14` |
| CMP-15 Config log *(AS)* | AUDIT_STD_01 | REQ-HMI-002-01 | HMI-002-01 | `cmp15` |
| CMP-16 Stato utenti *(AS)* | STATE_STD_01 | REQ-CYB-001-01 | — | `cmp16` |
| CMP-17 Customization (InRebus) | LAYOUT_STD_01 | REQ-HMI-002-02 | HMI-002-02 | atom default |

### SCR-03 Acquisizione & configurazione sensori · *L2 · Sensori*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-18 Registry CRUD | TABLE_STD_01 | REQ-ACG-001-01 | ACG-001-01-1 | `cmp18` (live DAO) |
| CMP-19 Pipeline status | STATE_STD_01 | REQ-ACG-001-03 | ACG-001-03 | `cmp19` |
| CMP-20 Datasheet | FORM_STD_01 | REQ-ACG-001-04 | — | `cmp20` |
| CMP-21 Acquisition config | FORM_STD_01 | REQ-DGN-003-01 | DGN-003-01 | `cmp21` w/ validation |
| CMP-22 Raw monitor | TREND_STD_01 | REQ-DGN-003-02 | DGN-003-02 | `cmp22` (live buffer) |
| CMP-23 Validation & calib | KPI_STD_01 | REQ-DGN-003-03 | DGN-003-03 | `cmp23` |
| CMP-24 Twin association | TWIN_3D_STD_01 | REQ-DTW-001-01 | — | atom default |
| CMP-25 Event log | AUDIT_STD_01 | REQ-ALR-001-01 | — | `cmp25` |
| CMP-26 Device security | STATE_STD_01 | REQ-CYB-002-02 | CYB-002-02 | `cmp26` |

### SCR-04 Sensori virtuali · *L3 · Links AI*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-27 Lista VS | TABLE_STD_01 | REQ-SVR-001-01 | SVR-001-01 | `cmp27` |
| CMP-28 Logica | FORM_STD_01 | REQ-SVR-001-01 | — | `cmp28` |
| CMP-29 Output monitor | TREND_STD_01 | REQ-SVR-001-01 | — | `cmp29` (dashed blue) |
| CMP-30 Real-vs-virtual | TREND_STD_01 | REQ-SVR-001-01 | — | `cmp30` |
| CMP-31 AI params *(OD/AS)* | KPI_STD_01 | REQ-DGN-002-02 | DGN-002-02 | `cmp31` |
| CMP-32 Twin association | TWIN_COMPARE_STD_01 | REQ-DTW-001-01 | DTW-001-01 | `cmp32` |
| CMP-33 Model event log | AUDIT_STD_01 | REQ-HMI-002-01 | — | `cmp33` |

### SCR-05 Rete sensori & IoT · *L2 · FOS edge*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-34 Mappa stato | MAP_STD_01 | REQ-ACG-001-01 | ACG-001-01-1 | synoptic override |
| CMP-35 IoT topology *(OD/AS)* | TOPOLOGY_STD_01 | REQ-CYB-002-01 | CYB-002-01 | atom default |
| CMP-36 Node detail | STATE_STD_01 | REQ-CYB-002-02 | CYB-002-02 | `cmp36` |
| CMP-37 Comm performance | TREND_STD_01 | REQ-ACG-001-04 | — | `cmp37` |
| CMP-38 Network security *(AS)* | STATE_STD_01 | REQ-CYB-002-03 | KPI-CYB-002-* | `cmp38` |
| CMP-39 Asset filter (InRebus) | FORM_STD_01 | REQ-HMI-002-02 | HMI-002-02 | `cmp39` |

### SCR-06 Visualizzazione multisensore · *L2/L3 · mostly InRebus*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-40 Variable selector | FORM_STD_01 | REQ-DGN-002-01 | DGN-002-01-1 | `cmp40` |
| CMP-41 Multi-layer chart | TREND_STD_01 | REQ-DGN-002-01 | DGN-002-01-1 | `cmp41` (3+ vars normalized) |
| CMP-42 Anomaly heatmap | HEATMAP_STD_01 | REQ-DGN-002-01 | — | atom default |
| CMP-43 Correlation | CORR_STD_01 | REQ-DGN-002-01 | — | atom default |
| CMP-44 Twin overlay | TWIN_COMPARE_STD_01 | REQ-DTW-001-02 | DTW-001-01 | synoptic override |
| CMP-45 Export (InRebus) | ACTION_STD_01 | REQ-HMI-002-01 | HMI-002-01 | `cmp45` — CSV |

### SCR-07 Gestione allarmi · *L1–L3 · Cross-layer*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-46 Lista attiva | ALARM_STD_01 | REQ-ALR-001-01 | ALR-001-03 | `alarmData()` |
| CMP-47 Detail popup | ALARM_STD_01 | REQ-ALR-001-03 | — | `cmp47` |
| CMP-48 Acknowledge | ACTION_STD_01 | REQ-ALR-001-04 | KPI-ALR-001-04-1 | `cmp48` — dispatches `ACK_ALL` |
| CMP-49 Threshold config *(OD/AS)* | FORM_STD_01 | REQ-ALR-001-05 | — | `cmp49` w/ validation |
| CMP-50 History | ALARM_STD_01 | REQ-ALR-001-01 | — | `cmp50` (live acks) |
| CMP-51 Escalation *(OD/AS)* | FORM_STD_01 | REQ-ALR-002-01 | — | `cmp51` |
| CMP-53 Quality KPIs *(OD/AS)* | KPI_STD_01 | REQ-ALR-002-02 | KPI-ALR-002-* | `cmp53` |

### SCR-08 Allarmi cybersecurity · *AS only · L1*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-54 Alert list | ALARM_STD_01 | REQ-ALR-002-01 | KPI-ALR-002-* | `cmp54` |
| CMP-55 Threat detail | ALARM_STD_01 | REQ-ALR-002-02 | — | `cmp55` |
| CMP-56 Ack/mitigation | ALARM_STD_01 | REQ-ALR-002-03 | — | `cmp56` (block IP / escalate) |
| CMP-57 Vulnerability | STATE_STD_01 | REQ-CYB-002-03 | — | `cmp57` |
| CMP-58 Detection KPIs | KPI_TABLE_STD_01 | REQ-ALR-002-02 | KPI-ALR-002-* | `cmp58` |
| CMP-59 Suspicious log | STATE_STD_01 | REQ-CYB-002-03 | — | `cmp59` |

### SCR-09 Analisi storica & trending · *L2/L3 · Historian*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-60 Selettore (InRebus) | FORM_STD_01 | REQ-ANL-001-01 | — | `cmp60` |
| CMP-61 Historic chart | TREND_STD_01 | REQ-ANL-001-02 | ANL-001-03 | `cmp61` (MA overlay) |
| CMP-62 Predictive *(OD/AS)* | TREND_STD_01 | REQ-ANL-001-04 | — | `cmp62` (regression + band) |
| CMP-63 Series integrity | DATA_QUALITY_STD_01 | REQ-ANL-001-02 | — | `cmp63` |
| CMP-64 Baseline deviation | KPI_STD_01 | REQ-ANL-001-03 | **ANL-001-03-1 (≥5 stats — ACHIEVED with 6)** | `cmp64` |
| CMP-65 Export (InRebus) | ACTION_STD_01 | REQ-HMI-002-01 | HMI-002-01 | `cmp65` (CSV + JSON) |

### SCR-10 Manutenzione predittiva · *L2 · Links AI*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-66 Risk-ranked list *(OD/AS)* | KPI_TABLE_STD_01 | REQ-DGN-001-01 | DGN-001-01-1 | `cmp66` |
| CMP-67 Asset detail | KPI_STD_01 | REQ-DGN-001-03 | DGN-001-* | `cmp67` |
| CMP-68 Maintenance history | TABLE_STD_01 | REQ-DGN-001-04 | — | `cmp68` |
| CMP-69 Planning *(OD R/U, AS CRUD)* | FORM_STD_01 | REQ-DGN-002-03 | — | `cmp69` (fires NP-MAINT-REMINDER-01) |
| CMP-70 Maintenance KPIs | KPI_STD_01 | REQ-DGN-001-03 | DGN-001-03 | `cmp70` (MTBF, MTTR) |
| CMP-71 Diagnostic reliability | KPI_STD_01 | REQ-DGN-002-02 | DGN-002-02 | `cmp71` (precision/recall) |
| CMP-72 Session history | AUDIT_STD_01 | REQ-DGN-002-03 | — | `cmp72` |

### SCR-11 Digital Twin · *L2/L3 · PoliTO*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-73 3D view + overlay | TWIN_3D_STD_01 | REQ-DTW-001-01 | DTW-001-01 | live `three-twin.js` adoption |
| CMP-74 Real-vs-sim | TWIN_COMPARE_STD_01 | REQ-DTW-001-02 | DTW-001-01 | `cmp74` |
| CMP-75 Scenarios *(OD/AS)* | FORM_STD_01 | REQ-DTW-001-01 | — | `cmp75` (runs ScenarioEngine) |
| CMP-76 Scenario log | AUDIT_STD_01 | REQ-DTW-001-02 | — | `cmp76` |

### SCR-12 Ispezione ottica · *L2 · newcleo + Links vision*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-77 Stream | VIDEO_STREAM_STD_01 | REQ-OTT-001-01 | OTT-001-01 | atom default |
| CMP-78 Overlay | VIDEO_OVERLAY_STD_01 | REQ-OTT-001-02 | — | atom default |
| CMP-79 Snapshot CRUD | EVIDENCE_STD_01 | REQ-OTT-001-02 | — | atom default |
| CMP-80 Vision AI *(OD/AS)* | VISION_DETECTION_STD_01 | REQ-OTT-001-02 | — | atom default |
| CMP-81 Stability KPIs | KPI_STD_01 | REQ-OTT-001-01 | OTT-001-01 | `cmp81` |

### SCR-13 Training · *InRebus*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-82 Current twin view | TWIN_3D_STD_01 | REQ-TRN-001-01 | TRN-001-01 | atom default |
| CMP-83 Catalog | CATALOG_STD_01 | REQ-TRN-001-01 | — | `cmp83` |
| CMP-84 My courses | CATALOG_STD_01 | REQ-TRN-001-01 | — | `cmp84` |
| CMP-85 Add course *(AS)* | FORM_STD_01 | REQ-TRN-001-01 | — | `cmp85` |
| CMP-86 User KPIs | KPI_STD_01 | REQ-TRN-001-01 | TRN-001-01 | `cmp86` |
| CMP-87 Export *(AS)* | ACTION_STD_01 | REQ-HMI-002-01 | — | `cmp87` (CSV) |

### SCR-14 Config & admin · *AS only · L5*
| CMP | Standard | REQ | KPI | Provider |
|---|---|---|---|---|
| CMP-88 User CRUD | TABLE_STD_01 | REQ-CYB-001-01 | KPI-CYB-001-01-1 | `cmp88` |
| CMP-89 Roles/perms | TABLE_STD_01 | REQ-CYB-001-01 | — | `cmp89` |
| CMP-90 System config | FORM_STD_01 | REQ-HMI-002-01 | HMI-002-01 | `cmp90` (fires NP-USER-ADMIN-01) |
| CMP-91 Modularity | STATE_STD_01 | REQ-ACG-001-02 | — | `cmp91` |
| CMP-92 Audit log | AUDIT_STD_01 | REQ-HMI-002-01 | — | `cmp92` (live `S.auditLog`) |
| CMP-93 Backup/restore | ACTION_PANEL_STD_01 | REQ-CYB-001-02 | — | `cmp93` (fires NP-BACKUP-01) |

---

## 3. KPI instrumentation status

| KPI | Target | In-app source | Met |
|---|---|---|---|
| HMI-001-01 — ≥ 95% variables rendered | ≥ 95% | 16/16 DAO sensors visible on SCR-03 + SCR-02 | ✅ 100% |
| HMI-002-01 — ≥ 90% functions configurable via HMI | ≥ 90% | SCR-14 CMP-90 covers session/lockout/MFA/audit/lang; thresholds via SCR-03 CMP-21, escalation via SCR-07 CMP-49/51 | ✅ ~95% |
| ANL-001-03-1 — ≥ 5 stats in SCR-09 | ≥ 5 | CMP-64 exposes 6 (mean, σ, variance, min/max, trend, baseline dev) | ✅ |
| DGN-002-01-1 — ≥ 3 vars in one view | ≥ 3 | SCR-06 CMP-41 overlays 3 by default | ✅ |
| ACG-001-01-1 — ≥ 8 sensors | ≥ 8 | 16 in DAO | ✅ |
| ALR-001-04 — alarm notify ≤ 5 s | ≤ 5 s | NotificationEngine ticks on every `sentinel:render` (~800ms) | ✅ |
| CYB-001-01-1 — login/MFA enforced | yes | SCR-01 CMP-01 + CMP-03 + lockout config | ✅ schema; real auth pending FOS |

---

## 4. Cross-reference

- Notification policies → mappatura.js `NOTIFICATION_POLICIES`
- Visual color/line rules → [spec.css](../src/spec/spec.css) CSS variables `--c-ok/warning/critical/stale/estimated/predicted/degraded`
- RBAC matrix → `effectiveMode(cmp, role)` in [packages/shared/src/mappatura.js](../packages/shared/src/mappatura.js); central enforcement in [reducer.js](../packages/shared/src/reducer.js) `INTENT_PERMISSIONS`
- Provenance contract → `datum()` + `SOURCE` in [data-service.js](../packages/shared/src/data-service.js)
