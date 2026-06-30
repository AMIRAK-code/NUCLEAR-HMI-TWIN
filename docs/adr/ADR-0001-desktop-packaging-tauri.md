# ADR-0001: Package CORE-SENTINEL HMI as a Desktop App with Tauri

**Status:** Proposed
**Date:** 2026-06-29
**Deciders:** HMI Engineering Lead · WP 3.x owners (InRebus) · Cybersecurity (IEC 62443) reviewer

---

## Context

CORE-SENTINEL is a high-performance reactor HMI for the LFR-4G Unit 4: a **Vite vanilla-JS single-page app** (MVI architecture, `S` model + reducer, SVG "atom" chart renderers, a Three.js digital twin, 14 Mappatura screens). It currently runs in the browser and is intended for **air-gapped** deployment on dedicated control-room workstations (**Windows 11**).

We want to ship it as an installable **desktop application**. The forces at play:

- **Air-gap / supply chain** — the plant network has no internet; the app must be fully self-contained.
- **Security** — control-room software is in scope for IEC 62443; minimize attack surface, sandbox the UI, control updates.
- **Safety / certifiability** — the HMI is a *display* layer. Actual protection (SCRAM, interlocks) lives in independent, qualified safety systems (IEC 61511/60880). The HMI's safety duty is narrow: don't mislead the operator, fail visibly.
- **Footprint & startup** — control stations are long-lived; small, fast, low-RAM is preferred.
- **Future connectivity** — roadmap calls for live PLC/SCADA links (OPC-UA, Modbus, serial), which need a trusted native I/O layer.
- **Cost of change** — a working ~6k-line JS app already exists; a UI rewrite is expensive.

> **Out of scope for this ADR (but higher leverage than the shell choice):** two issues must be fixed regardless of which shell wins — (1) the runtime CDN dependencies (breaks the air-gap), and (2) client-side-only RBAC in the reducer, which must be re-enforced PLC/server-side for any safety-critical command. See *Consequences*.

---

## Decision

**Adopt Tauri** (Rust core + OS WebView2) to package the existing web HMI, after vendoring its runtime assets for offline use. Reserve a native-Rust rewrite for a hypothetical future version that must itself enter a safety classification.

---

## Options Considered

### Option A: Tauri (Rust + OS WebView2)  ✅ chosen

| Dimension | Assessment |
|-----------|------------|
| Complexity | **Low–Med** — keep the web UI; add a thin Rust shell |
| Reuse of existing code | **Full** — no UI rewrite |
| Installer / RAM | **~3–10 MB**, ~half Electron's idle RAM, fast cold start |
| Attack surface | **Small** — no bundled Node; memory-safe Rust core; capability allowlist; CSP on by default |
| Determinism (safety) | Browser-engine async/GC (same class as Electron) — manageable |
| Certifiability | Better than Electron (no bundled Chromium), weaker than native |
| Team familiarity | Rust toolchain new to most web teams |

**Pros:** Keeps the proven HMI; smallest practical attack surface for a web-based shell; Rust gives a hardened, sandboxed boundary for future OPC-UA/Modbus/serial; secure-by-default config.
**Cons:** Requires Rust toolchain; relies on WebView2 (Chromium) being present/patched; cross-OS webview differences (mitigated — single Windows target).

### Option B: Electron (bundled Chromium + Node)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — most familiar |
| Reuse of existing code | Full |
| Installer / RAM | **~85–150 MB**, highest idle RAM |
| Attack surface | **Largest** — full Chromium **+ Node in renderer** (classic RCE vector); you own every Chromium CVE |
| Determinism | Browser-engine async/GC |
| Certifiability | Worst — bundled Chromium (~tens of MLOC) is effectively un-auditable |
| Team familiarity | Highest |

**Pros:** Ubiquitous, bundles a known/pinned Chromium → byte-identical rendering everywhere.
**Cons:** Huge footprint; largest attack surface; heavy, frequent mandatory Chromium-patch redistribution (painful air-gapped); easy to misconfigure (`nodeIntegration`/`contextIsolation`).

### Option C: Native Rust GUI (Slint / egui)

| Dimension | Assessment |
|-----------|------------|
| Complexity | **High** — full UI rewrite |
| Reuse of existing code | **None** |
| Installer / RAM | Smallest |
| Attack surface | **Smallest** — no browser engine *and* memory-safe |
| Determinism | **Best** — no GC pauses, predictable timing |
| Certifiability | **Best** — small, auditable, browser-free TCB |

**Pros:** Strongest safety/security posture; eliminates both the browser-vuln class and the memory-corruption class; Slint is purpose-built for industrial HMIs.
**Cons:** Discards the entire working codebase; months of rework; re-implement the Three.js twin natively.

### Option D: Native C++ GUI (Qt/QML)

| Dimension | Assessment |
|-----------|------------|
| Complexity | High — full rewrite |
| Reuse of existing code | None |
| Attack surface | No browser engine, **but reintroduces memory-unsafety** (overflow/UAF) |
| Certifiability | Strong; industry standard for industrial/medical HMIs |
| Cost | Commercial Qt licensing for closed-source |

**Pros:** Mature, certifiable, the long-standing industrial-HMI default.
**Cons:** Full rewrite; memory-safety burden; licensing cost. Justified only if tied to an existing C++ control-system codebase.

---

## Trade-off Analysis

- **Security ranking:** Native Rust > **Tauri** > Native C++ ≈ … > Electron. C++ removes browser vulns but adds memory-unsafety, so it is *not* clearly safer than memory-safe Tauri.
- **Certifiability ranking (nuclear):** Native (Rust/Qt) > **Tauri** > Electron.
- **Cost-to-deliver:** Electron ≈ **Tauri** ≪ Native (full rewrite).
- The decisive factor is the **bounding reality**: the HMI is a non-safety display, so the certifiability edge of a native rewrite buys little *today* — it would matter only if the HMI itself were pulled into a safety class. Against that, a native rewrite throws away a working app for months of effort.
- Tauri is the point on the curve that captures **most of the security/footprint win at a fraction of native's cost**, while keeping a clean Rust path for the future fieldbus layer. Electron's only unique advantage (pinned-Chromium rendering determinism) is irrelevant on a single controlled Windows target.

**Conclusion:** Tauri dominates for the app *as it exists*. Native Rust (Slint) is the contingency if regulatory qualification of the HMI is ever required.

---

## Consequences

**Becomes easier**
- Air-gapped distribution (small, self-contained installer).
- Hardening: no Node in renderer, capability allowlist, default CSP.
- A trusted, memory-safe Rust boundary for OPC-UA/Modbus/serial, isolated from the UI via IPC.

**Becomes harder / new burden**
- Rust toolchain + build pipeline to learn and maintain.
- Must ensure/patch the WebView2 runtime offline (bundle the fixed-version runtime).
- Authenticode code-signing and a controlled offline update mechanism.

**Must be revisited regardless of shell (do not let the shell choice mask these)**
- **Remove runtime CDN dependencies** — `index.html` loads Tailwind, Three.js, and Google Fonts from the internet; this breaks the air-gap and is a supply-chain hole.
- **Re-enforce RBAC server/PLC-side** — SCRAM/interlock guards currently live only in the JS reducer (`INTENT_PERMISSIONS`) and are bypassable from the renderer; the desktop shell does not fix this.
- **Render-liveness** — browser engines throttle `requestAnimationFrame` for backgrounded/occluded windows (observed during testing); enforce always-on/kiosk and add a render watchdog so the display can never silently stop updating.

---

## Project Dependencies & Prerequisites

Ordered: do the shell-agnostic web work first (it is required for *any* path and makes the app offline-capable), then add Tauri.

### 1. Make the web app self-contained (shell-agnostic — do first)
- [ ] **Tailwind** — replace the `cdn.tailwindcss.com` Play CDN (runtime JIT, not for production) with a build step: `tailwindcss` + `postcss` + `autoprefixer` as dev deps, emit a static CSS file.
- [ ] **Three.js** — `npm i three` (pin r128 to match `window.THREE` usage in `src/three-twin.js`, or upgrade deliberately); vendor it instead of the cdnjs `<script>`.
- [ ] **Fonts** — self-host woff2 for **Inter**, **Space Grotesk**, **Material Symbols Outlined** with local `@font-face` (otherwise icons render as literal text offline).
- [ ] **Vite** — set `base: './'` in `vite.config.js` so built asset paths work under the `file://`/Tauri protocol.
- [ ] Add a strict **Content-Security-Policy** (no remote origins) once assets are local.

### 2. Tauri shell
- [ ] **Rust toolchain** — stable `rustc` + `cargo` (via rustup).
- [ ] **Windows build prerequisites** — Microsoft Visual Studio C++ Build Tools; **WebView2 runtime** (bundle the *fixed-version* runtime for air-gapped machines).
- [ ] **Tauri packages** — `@tauri-apps/cli`, `@tauri-apps/api` (dev), Tauri Rust crates.
- [ ] **`tauri.conf.json`** — point `build.distDir` at the Vite `dist/`, `devPath` at the Vite dev server; set CSP; enable the minimal capability allowlist (lock down `fs`, `shell`, etc.); window config = kiosk/always-on.
- [ ] **`src-tauri/`** — Rust main + (future) command handlers for fieldbus I/O over IPC.

### 3. Distribution & security
- [ ] **Authenticode code-signing** certificate for the installer/binaries.
- [ ] Offline/controlled **update + integrity verification** mechanism (no evergreen auto-update on the air-gapped net).

### 4. Architectural follow-ups (tracked separately)
- [ ] Move SCRAM/interlock **authorization to the PLC/server boundary**; HMI only *requests*.
- [ ] Render-liveness watchdog; disable rAF/background throttling.

---

## Action Items
1. [ ] Approve this ADR (set Status → Accepted).
2. [ ] Vendor CDN assets + `base: './'` + CSP (Dependencies §1) — independent, shippable on its own.
3. [ ] Scaffold Tauri shell and produce a signed offline installer (§2–§3).
4. [ ] Open follow-up tickets for server-side RBAC and render-liveness (§4).
5. [ ] Re-evaluate vs. native-Rust (Slint) **only if** the HMI is pulled into a safety classification.
