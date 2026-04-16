# CORE-SENTINEL HMI
### InRebus DAO · LFR-4G Unit 4 · ISA-101 Compliant Human-Machine Interface

[![Standard](https://img.shields.io/badge/HMI%20Standard-ISA--101.01-blue)](https://www.isa.org/)
[![Nuclear](https://img.shields.io/badge/Nuclear-NUREG--0700%20Rev.3-red)](https://www.nrc.gov/)
[![Safety](https://img.shields.io/badge/IEC%2061511-SIL--2-orange)](https://webstore.iec.ch/)
[![Cybersec](https://img.shields.io/badge/IEC%2062443-Compliant-green)](https://webstore.iec.ch/)

---

## Overview

**CORE-SENTINEL** is a mission-critical HMI for a **Fourth-Generation Lead-Cooled Fast Reactor (LFR-4G)** unit. It provides real-time monitoring, predictive analytics via AI Copilot, and emergency scenario simulation in an ISA-101 / NUREG-0700 compliant interface.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MVI Architecture                                │
│                                                                     │
│  ┌──────────┐   Intent    ┌───────────┐   New State  ┌──────────┐  │
│  │  Events  │ ──────────► │  Reducer  │ ────────────► │   View   │  │
│  │ (bindAll)│             │(reduce()) │              │(render())│  │
│  └──────────┘             └───────────┘              └──────────┘  │
│                                 ▲                          │        │
│                                 └──────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘

                    ┌────────────────────────────┐
                    │       DAO Layer             │
                    │  SIMULATED ←──→ PHYSICAL   │
                    │  Politecnico LFR Model v3.1 │
                    └────────────────────────────┘
```

### File Structure

| File | Responsibility | Lines |
|------|---------------|-------|
| `index.html` | DOM structure, CSS tokens, layout | ~730 |
| `script.js` | Full MVI: DAO · Model · Reducer · Views · Events | ~1680 |
| `component-registry.js` | CMP-ID → access matrix · design tokens | ~490 |
| `rbac-factory.js` | Component-level RBAC rendering | ~480 |
| `utils.js` | Helpers: ts(), setText(), escHtml(), dlFile() | ~80 |
| `hmi-config.json` | Trip setpoints · role permissions · config | - |
| `CHANGELOG.md` | Version history with standard references | - |

### Planned Module Split (v4.4.0)

```
src/
├── dao.js              ← DAO layer + sensor physics model
├── model.js            ← mkModel(), state constants
├── reducer.js          ← reduce(), dispatch(), scheduleRender()
├── scenario-engine.js  ← Emergency scenario A/B/C
├── views/
│   ├── render.js       ← Master render() + active panel routing
│   ├── alarm.js        ← renderAlarmBanner(), renderAnomalyList()
│   ├── safety.js       ← renderSafetyPanel(), renderSCRAMStatus()
│   ├── charts.js       ← renderCharts() SVG trend rendering
│   └── diagnostics.js  ← renderDiagnostics(), sensor table
├── events.js           ← bindAll() event handler registration
├── three-twin.js       ← initThreeJS() Digital Twin
└── main.js             ← DOMContentLoaded bootstrap
```

---

## Running

Open `index.html` in a modern browser. No build step required.

> **Air-gap deployment**: Replace Tailwind CDN script with a local build:
> ```bash
> npm install tailwindcss
> npx tailwindcss -i ./input.css -o ./output.css --watch
> ```
> Then swap `<script src="https://cdn.tailwindcss.com">` for `<link rel="stylesheet" href="output.css">`.

---

## Role System (RBAC)

| Role | Label | Permissions | SCRAM Authority |
|------|-------|-------------|-----------------|
| `OL` | Local Operator | Read-only monitoring | ❌ |
| `OD` | Diagnostic Operator | R + Update + AI Copilot | ✅ |
| `AS` | System Admin | Full R/U/C/D + Cybersecurity | ✅ |

RBAC is enforced **at the reducer layer** — not just in the view. Unauthorized intents are blocked and logged to the audit trail.

---

## Standards Compliance

| Standard | Area | Implementation |
|----------|------|----------------|
| **ISA-101.01** | HMI Design | Color tokens, alarm priority (P1/P2/P3), confirmation dialogs |
| **ISA-5.1** | Tag Naming | Regex validator at startup: `T-CORE-01`, `P-PRI-01` etc. |
| **NUREG-0700 Rev. 3** | Nuclear HMI | Focus styles, ARIA, color-independent indicators, session timeout |
| **IEC 61511 SIL-2** | Functional Safety | Guarded SCRAM confirm, double-click + modal, audit trail |
| **IEC 62443** | Cybersecurity | Role separation, audit logging, AES-256-GCM, TLS 1.3 |
| **IAEA NS-G-1.3** | Operations | Emergency procedures, SOP documentation access |

---

## Alarm Management (ISA-101 §5.5–5.8)

- **Priority**: P1 (Critical/Red/■) · P2 (High/Amber/▲) · P3 (Advisory/Orange/●)
- **Banner**: Shows `■ P1:N ▲ P2:N ● P3:N` count + top-priority alarm message
- **Ack vs Clear**: Acknowledgement (`acked`) and clearance (`cleared`) are separate states
- **RTN Logging**: Return-to-Normal events are automatically logged to audit trail
- **ARIA**: Banner has `role="alert"` and `aria-live="assertive"` for screen readers

---

## Security

- **Session timeout**: 15 min inactivity → auto logout (NUREG-0700 §6.5)
- **Warning modal**: 1 min before timeout
- **XSS protection**: All user-supplied text sanitized via `escHtml()` before DOM insertion
- **Audit trail**: Every action logged with role, timestamp, and message. CSV export available.
- **Encryption**: AES-256-GCM · ECDH P-521 · SHA-3-512 · JWT RS-4096

---

## Configuration

Edit `hmi-config.json` to adjust process limits **without code changes** (ISA-101 §5.4):

```json
{
  "sensors": {
    "CORE_TEMP": { "tripHigh": 1200, "tripLow": 900 }
  },
  "session": { "timeoutMinutes": 15 }
}
```

> **Note**: Config file changes require a page reload to take effect in the current implementation.

---

## Testing

```bash
npm install vitest
npx vitest run tests/reducer.test.js
```

Test files: `tests/reducer.test.js` — covers all reducer intents and RBAC guards.

---

## References

- [ISA-101 HMI Standard](https://www.isa.org/products/ansi-isa-101-01-2015-human-machine-interfaces-for)
- [NUREG-0700 Rev. 3](https://www.nrc.gov/reading-rm/doc-collections/nuregs/staff/sr0700/)
- [IEC 61511 Functional Safety](https://webstore.iec.ch/)
- [IEC 62443 Industrial Cybersecurity](https://webstore.iec.ch/)
- [Politecnico di Milano — Advanced Nuclear Systems Group](https://www.polimi.it/)
