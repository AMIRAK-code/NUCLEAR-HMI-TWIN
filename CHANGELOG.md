# CORE-SENTINEL HMI — Changelog
**System**: InRebus DAO · LFR-4G Unit 4
**Standard**: ISA-101.01 / NUREG-0700 Rev. 3 / IEC 61511 SIL-2

---

## [v4.3.0] — 2026-04-16

### 🔐 Security & RBAC
- **[CRITICAL]** RBAC enforcement moved into MVI reducer kernel — intent guard denies `SCRAM`, `RESET_INTERLOCKS`, `TOGGLE_AUTOPILOT` for unauthorized roles; logs to audit trail
- **[CRITICAL]** Session timeout implemented (NUREG-0700 §6.5) — 15 min inactivity triggers automatic logout; 1 min warning modal
- **[SECURITY]** XSS escaping added to AI Copilot query input via `escHtml()` utility
- **[SECURITY]** Fixed: `AES-512` (non-existent cipher) corrected to `AES-256-GCM` throughout UI and config

### 📐 ISA-101 / NUREG-0700 Compliance
- **[ISA-101 §5.5]** Alarm banner now shows priority counts: `■ P1:N  ▲ P2:N  ● P3:N` with shape indicators (color-independent)
- **[ISA-101 §5.8]** Return-to-Normal (RTN) logging: when a sensor returns from alarm/warning to nominal, audit trail entry is automatically created
- **[ISA-101]** Alarm model extended with `cleared: boolean` field — ack ≠ clear distinction now implemented
- **[ISA-5.1]** ISA tag format validator runs at startup, warns on non-standard tags in browser console
- **[Config]** `hmi-config.json` created — trip setpoints, role permissions, scan rates, security config all externalized (no code change required for limit adjustments)

### ♿ Accessibility (WCAG 2.1 / NUREG-0700 §7.3)
- `:focus-visible` ring styles added globally — keyboard navigation now visible for all interactive elements
- SCRAM button: added `aria-label` with clear action description
- Alarm banner: `role="alert"`, `aria-live="assertive"`, `aria-atomic="true"` — screen reader announcements on alarm changes
- System Health indicator: `role="status"`, `aria-live="polite"`
- `<noscript>` fallback page added

### ⚡ Performance
- Render function refactored: only the **active panel** is rendered per tick (was: all 6 panels rendered at 500ms regardless)
- UTC clock changed from `requestAnimationFrame` loop (60fps) to `setInterval(1000ms)` — eliminates unnecessary CPU usage
- Session activity tracking uses `{ passive: true }` event listeners

### 🔧 Bug Fixes
- `FUEL_BURNUP` sensor had `vlt:0` (never changed) — corrected to `0.003` for realistic slow drift
- Alarm banner now filters `cleared` alarms in addition to `acked` alarms
- `TOUCH_ACTIVITY` intent and `SESSION_TIMEOUT` intent added to reducer

---

## [v4.2.0] — 2026-04-14

### Theme
- Transitioned from dark theme to ISA-101 compliant light gray theme (`#f4f6f8` base)
- Colors aligned with NUREG-0700 §11.4 luminance contrast requirements

### Architecture
- Component Registry (`component-registry.js`) established with full RBAC access matrix
- RBAC Factory (`rbac-factory.js`) added for component-level permission enforcement
- MVI pattern (Model-View-Intent) fully implemented in `script.js`

---

## [v4.1.0] — 2026-04-09

### Architecture
- Secondary Circuit panel added with P&ID schematic
- Configuration-driven rendering via `COMPONENT_REGISTRY`
- Cybersecurity panel (CMP-23, AS-only) added

---

## [v4.0.0] — 2026-04-08

### Initial Release
- ISA-101 compliant HMI for LFR-4G Unit 4
- DAO (Data Access Object) layer for Physical/Simulated sensor abstraction
- Three.js 3D Digital Twin
- Emergency Scenario Engine (Scenarios A/B/C)
- AI Copilot sidebar with agentic step protocol
- Audit trail with CSV export
- RBAC role system: OL / OD / AS
