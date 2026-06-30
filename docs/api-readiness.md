# API Readiness — Partner Integration Contract

**Status (2026-06-18):** all data flows through [`DataService`](../packages/shared/src/data-service.js) (ROADMAP F1). Every provider is uniformly shaped `{ snapshot(), subscribe(cb), query(opts?) }`. Today every provider runs the **`simulated`** transport (wraps DAO/ScenarioEngine/S). Flipping `DataService.setTransport('websocket' | 'opcua')` is the single swap-point where partner backends plug in.

This document lists every provider and the contract each partner is expected to honor on the wire.

---

## Provenance contract (universal)

Every datum exposed through DataService — regardless of transport — must satisfy:

```ts
type Datum = {
  value:      number | string | boolean
  source:     'Misurato' | 'Stimato' | 'Predetto' | 'Simulato' | 'Aggregato' | 'Manuale'
  unit:       string | null
  confidence: number   // 0..1
  quality:    'good' | 'degraded' | 'critical' | 'stale'
  timestamp:  number   // epoch ms (UTC)
}
```

Constants live in `SOURCE` (`packages/shared/src/data-service.js`).

---

## Partner contracts by provider

### `DataService.sensors`  · **FOS** (WebSocket or OPC UA gateway)

**Current backing:** `DAO` simulated tick (16 LFR sensors @ 0.8s).

**Required wire format (one of):**

| Mode | Endpoint | Payload |
|---|---|---|
| WebSocket push | `wss://fos.local/api/v1/sensors` | `{ key, value, unit, quality, source, timestamp }` per message |
| OPC UA subscribe | `ns=2;s=Sensors/<KEY>` | Standard OPC UA Variable Node; mapped to `Datum` in adapter |
| REST poll | `GET /api/v1/sensors?keys=...` | `{ [key]: Datum }` |

**Required keys (16):** `CORE_TEMP`, `COOLANT_IN`, `COOLANT_OUT`, `PRIM_PRESS`, `PUMP_A`, `PUMP_B`, `NEUTRON_FLUX`, `FUEL_BURNUP`, `SG_INLET`, `STEAM_PRESS`, `TURBINE_RPM`, `GRID_OUT`, `ROD_POS`, `SCRAM_V`, `LEAD_LEVEL`, `SEC_FLOW`. Each sensor record must include `tag`, `label`, `sys` (system), `trip` (high limit), `low` (low limit). Tags appear in SCR-03 CMP-18, charts, and alarm messages.

**Latency budget:** ≤ 1 s tick-to-render (drives KPI-ALR-001-04).
**Swap point:** [`packages/shared/src/data-service.js`](../packages/shared/src/data-service.js) `sensorsProvider`.

---

### `DataService.events` / `DataService.alarms`  · **FOS**

**Current backing:** `S.alarms` + `S.auditLog`.

**Required:** durable alarm store with audit trail.

```ts
type Alarm = {
  id:       string
  p:        1 | 2 | 3              // priority
  tag:      string                  // sensor tag, e.g. 'P-PRI-01'
  msg:      string
  acked:    boolean
  cleared:  boolean
  shelved:  boolean
  ts:       string                  // HH:MM:SS UTC
  firstOut: boolean                 // ISA-101 first-out marker
  ackBy?:   string                  // role name
}
```

**Required endpoints:**
- `WS push` new alarms / state transitions
- `POST /api/v1/alarms/:id/ack`  (role required: any)
- `POST /api/v1/alarms/:id/shelve` (OD / AS)
- `POST /api/v1/alarms/:id/clear`  (OD / AS)
- `GET /api/v1/audit?since=ts`

Drives SCR-07 (operational) and SCR-08 (cyber via separate stream).

**Swap point:** `eventsProvider` in data-service.js.

---

### `DataService.twin`  · **PoliTO**

**Current backing:** `ScenarioEngine` + synthetic histograms.

**Required:**
- WS push of twin tick: `{ scenario: {active, name, tripTimeSec}, histTemp[], histPress[], deviationPct, byNode?: {...} }`
- `POST /api/v1/twin/scenarios/:name/start` (OD / AS)
- `POST /api/v1/twin/scenarios/:name/stop`  (OD / AS)
- `GET /api/v1/twin/state` for cold-load on first connect.

**Real-vs-sim divergence:** PoliTO must compute and publish per-tick divergence so CMP-74 and CMP-44 stop relying on the synthetic local estimator. `NP-TWIN-DIVERGENCE-01` fires off this value.

**Swap point:** `twinProvider` in data-service.js.

---

### `DataService.ai`  · **Links**

**Current backing:** stub returning `{ items: [] }`.

**Required (virtual sensors — SCR-04):**
- `GET /api/v1/ai/virtual-sensors` → list of `{ id, label, model, inputs[], unit, rmsePct, confidence, twinNode, active }`
- WS push of computed output per virtual sensor (must carry `source: 'Stimato'` — never `'Misurato'`; per spec these MUST NOT trigger alarms)
- `POST /api/v1/ai/virtual-sensors/:id/retrain` (OD / AS)
- `GET /api/v1/ai/predictions?key=...` for SCR-09 CMP-62 and SCR-10 CMP-66/67 (RUL, P(failure))

Drives SCR-04 (all 7 CMPs), SCR-10 CMP-66/67/71, SCR-09 CMP-62.

**Swap point:** `aiProvider` in data-service.js.

---

### `DataService.iot`  · **FOS** (edge layer)

**Current backing:** static `IOT_NODES` array in `live-data.js`.

**Required:**
- `GET /api/v1/iot/topology` → `{ nodes: [...], links: [...] }`
- WS push of node health: `{ id, status, latencyMs, packetLoss, lastHeartbeat }`
- `GET /api/v1/iot/nodes/:id` for CMP-36 detail.

Drives SCR-05.

**Swap point:** `iotProvider` in data-service.js.

---

### `DataService.security`  · **FOS** (security layer)

**Current backing:** stub.

**Required:**
- WS push of cyber alerts: `{ id, kind, cve?, ip?, severity, ts, message }`
- `GET /api/v1/security/vulnerabilities`
- `GET /api/v1/security/suspicious-logins`
- `POST /api/v1/security/alerts/:id/mitigate` (AS only)

Drives SCR-08.

**Swap point:** `securityProvider` in data-service.js.

---

### `DataService.training`  · **InRebus** (owned in-house)

**Current backing:** stub + static `TRAINING_CATALOG`.

**Required:**
- `GET /api/v1/training/scenarios` → catalog
- `GET /api/v1/training/users/:id/progress`
- `POST /api/v1/training/sessions` (start/end)
- `GET /api/v1/training/results?period=30d` for CSV export (CMP-87, AS only)

Drives SCR-13.

**Swap point:** `trainingProvider` in data-service.js.

---

### `DataService.auth`  · **FOS Identity**

**Current backing:** stub; legacy SCR-01 cards dispatch `SET_ROLE` locally.

**Required:**
- `POST /api/v1/auth/login` → `{ token, role, mfaRequired }`
- `POST /api/v1/auth/mfa/verify`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/sessions` for AS audit
- Lockout after N (configurable via SCR-14 CMP-90).

Drives SCR-01.

**Swap point:** `authProvider` in data-service.js.

---

## Transport-flip checklist

When a partner is ready:

1. Implement an adapter conforming to `{ snapshot(), subscribe(cb), query(opts?) }` against the wire endpoint.
2. Replace the corresponding provider export in `data-service.js` (or branch on `getTransport()`).
3. Set `DataService.setTransport('websocket')` (or `'opcua'`).
4. No UI change required — screens already render from the abstraction.

## Open items

- **Auth token plumbing:** not yet threaded through DataService request headers — when auth is real, add a `Bearer ${token}` to all REST/WS calls.
- **Time-series back-fill:** `TelemetryBuffer` holds 10 minutes locally; SCR-09's longer windows require a Historian endpoint (`GET /api/v1/historian/series?key=...&from=...&to=...`).
- **Notification channels:** UI + audit are live; Email is stubbed pending FOS Notify service.
