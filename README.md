# HMI Core — MVI Reducer & RBAC System

> **ISA-101 compliant HMI logic layer for the InRebus DAO LFR-4G Unit 4 Lead-Cooled Fast Reactor.**

This project implements a High-Performance HMI (Human-Machine Interface) logic layer following **ISA-101** and **NUREG-0700** standards. It utilises a Model-View-Intent (MVI) architecture to ensure predictable, auditable state management in a safety-critical industrial environment.

---

## 🚀 Key Features

| Feature | Detail |
|---|---|
| **MVI Architecture** | Unidirectional data flow — state is never mutated, only replaced |
| **ISA-101 Compliance** | Designed for high-performance monitoring and situational awareness |
| **RBAC Guards** | Strict Role-Based Access Control preventing unauthorised operations (SCRAM, Setpoint changes) based on role (OL, OD, AS) |
| **First-Out Tracking** | ISA-101 §5.3 — first alarm in a quiet cascade is tagged `firstOut:true` |
| **Alarm Shelving** | ISA-101 §5.6 — nuisance alarm suppression (OD/AS only) |
| **Immutable State** | All updates use spread patterns — enables safe undo/replay |
| **Centralised Constants** | `constants/actionTypes.js` — no magic strings anywhere |
| **Automated Testing** | Comprehensive Vitest suite validating every safety-critical guard |

---

## 📁 Project Structure

```
hmi/
├── src/
│   ├── reducer.js          # Central MVI state machine — the "Brain"
│   ├── model.js            # Initial state shape (mkModel factory)
│   ├── dao.js              # Data Access Object — sensor simulation
│   ├── events.js           # DOM event handlers → dispatch()
│   ├── views/              # Pure render functions
│   └── scenario-engine.js  # Emergency scenario simulator
├── constants/
│   └── actionTypes.js      # Frozen ACTION_TYPES object — no magic strings
├── tests/
│   └── reducer.test.js     # Vitest validation for all RBAC guards
├── utils.js                # Shared helpers (ts, mkEntry, escHtml…)
├── vite.config.js          # Build + Vitest configuration
└── index.html              # Single-page HMI shell
```

---

## 🛠 Usage

### Install dependencies
```bash
npm install
```

### Run the test suite (validates all RBAC guards)
```bash
npm run test
```

### Start the development server
```bash
npm run dev
```

### Build for air-gapped deployment
```bash
npm run build
```

---

## 🔐 RBAC Permission Matrix

| Intent | OL | OD | AS |
|---|:---:|:---:|:---:|
| `NAVIGATE` | ✅ | ✅ | ✅ |
| `ACK_ALL` | ✅ | ✅ | ✅ |
| `SCRAM` | ❌ | ✅ | ✅ |
| `RESET_SCRAM` | ❌ | ❌ | ✅ |
| `TOGGLE_AUTOPILOT` | ❌ | ✅ | ✅ |
| `RESET_INTERLOCKS` | ❌ | ❌ | ✅ |
| `SHELF_ALARM` | ❌ | ✅ | ✅ |
| `UNSHELVE_ALARM` | ❌ | ✅ | ✅ |

> **OL** = Operator Level · **OD** = Operations Director · **AS** = Authorised Supervisor

---

## 🧠 How It Works — MVI Architecture

### The Flow
```
User Action → Intent (string) → reduce(state, intent, payload) → newState → render(newState)
```

1. **Intent** — A user clicks "Emergency Stop". The event handler calls `dispatch('SCRAM')`.
2. **RBAC Guard** — Before any logic runs, the reducer checks the permission matrix. If the role is `OL`, the guard rejects the intent and returns the current state unchanged.
3. **Reducer (Model)** — If permitted, the reducer creates a *new* state object (spread pattern). The old state is never touched.
4. **Render (View)** — The pure render function reflects the new state to the DOM via RAF scheduling.

### Why Immutability Matters (ISA-101 §6.5)
- The "PLC ghost data" problem: if you mutate state directly, the view can show stale readings from the previous tick.
- Enables a full audit trail — every state transition is logged in `auditLog`.
- Safe undo/replay for protocol step debugging.

### Why No Magic Strings
A typo like `dispatch('SCRMA')` would silently fall through to the reducer's `default` case and do nothing — no error, no audit entry. With `ACTION_TYPES`, a typo is a `ReferenceError` at parse time.

---

## ✅ Test Coverage

The Vitest suite (`tests/reducer.test.js`) covers:

- **RBAC Guards** — SCRAM blocked for OL/no-role; permitted for OD/AS
- **Interlock Reset** — blocked for OD; permitted only for AS
- **Session Management** — `SET_ROLE`, `TOUCH_ACTIVITY`
- **Alarm Lifecycle** — add, ack, clear, shelf, unshelve
- **First-Out Tracking** — ISA-101 §5.3 cascade logic
- **Pure Function Invariants** — original state is never mutated; unknown intents return state unchanged
- **Audit Trail** — every security denial and state change is logged

---

## 📜 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

---

*CORE-SENTINEL HMI v4.3 · InRebus DAO · Proprietary*
