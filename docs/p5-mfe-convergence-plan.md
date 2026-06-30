# P5 — MFE Convergence Plan (single shared core)

> **Status:** PLAN ONLY — no code changes yet. Drafted 2026-06-10.
> **Goal:** Eliminate the `src/` ↔ `packages/*` duplication **without** discarding the
> micro-frontend (MFE) architecture, which is required by the spec
> (REQ-IOS-001-01 modularity; KPI-IOS-001-01-1 ≥80% extensions by module/config;
> ROADMAP DoD lists the "MFE workspace" as a deliverable asset).

---

## 1. The problem in one sentence

Core logic exists in **two hand-maintained copies** — `src/*.js` and
`packages/shared/src/*.js` — and they have drifted. The app we actively develop
(`src/`, 20 commits) is the monolith; the architecture we must ship (the MFE in
`packages/`, 3 commits) is the neglected copy. They will keep diverging until
there is **one** source of truth.

## 2. The target (already half-built)

The intended design is visible in the repo today:

```
packages/shared/index.js   ← the ONE public API (singleton via Module Federation)
        ▲                      re-exports model, reducer, dao, config-service,
        │                      telemetry-buffer, scenario-engine, unit-converter,
        │                      component-registry, rbac-factory, actionTypes, utils
        │
   ┌────┴───────────────┬───────────────────┐
packages/shell   packages/mfe-*        src/  (monolith app)
(frame)          (plug-in panels)      ← TODAY: imports its OWN private copies
                                         ← TARGET: imports from @sentinel/shared
```

**Principle:** exactly one copy of each core module lives in `packages/shared`.
Both the MFE shell **and** the `src/` monolith import from it. No file is
maintained in two places.

## 3. Current drift (measured 2026-06-10)

| Core module | Differing lines | Notes |
|---|---|---|
| config-service.js | 0 | identical — safe to dedupe first |
| telemetry-buffer.js | 0 | identical |
| unit-converter.js | 0 | identical |
| model.js | 27 | minor (incl. recent escHtml cleanup) |
| reducer.js | 40 | minor |
| rbac-factory.js | 156 | moderate |
| dao.js | 252 | large |
| scenario-engine.js | 510 | large |
| component-registry.js | 1072 | large — mostly the new `specScreenId/specCmpId` fields added to `src/` only |

**Reconcile direction:** `src/` is the active, ahead copy (has the Training
component, the P1 XSS fix, and the new spec cross-reference fields). So in
general the **`src/` version is promoted into `packages/shared`**, then `src/`
switches to importing from shared. Each module's direction must still be
confirmed by reading its diff (a module could have a fix that only landed in
`packages/`).

## 4. Phased steps

### Phase 0 — Baseline & safety net
- Ensure `npm test` is green and capture current behavior of both entry points
  (`npm run dev:app` = monolith, `npm run dev` = MFE shell).
- `git tag pre-p5-convergence` for a clean rollback point.

### Phase 1 — Promote core into `packages/shared`, module by module
Order chosen to de-risk (trivial first, biggest last):
1. ✅ **DONE (2026-06-10) — Identical (0-drift):** `config-service`, `telemetry-buffer`,
   `unit-converter` deduped. `packages/shared/src` is now authoritative; `src/` copies
   deleted; `src/` importers repointed via a new `@shared` Vite alias
   (`vite.config.js` → `packages/shared/src`). `tests/unit-converter.test.js` repointed too.
   Verified: 78/78 tests pass, monolith build green. Rollback tag: `pre-p5-convergence`.
1b. ✅ **DONE (2026-06-10) — `utils.js`** (dependency of model/reducer/etc., lives at
   `packages/shared/utils.js`). Verified logically identical except: shared copy
   gained `provenanceBadge` (monolith needed it); 6 monolith importers repointed to
   `@shared/utils.js`; root `utils.js` deleted. Alias rebased: `@shared` → `packages/shared`
   (so `@shared/src/<module>.js` for core, `@shared/utils.js` for utils). 78/78 tests pass, build green.

1c. ✅ **DONE (2026-06-10) — `dao.js`.** Confirmed clean merge (not MFE-architectural).
   Shared copy promoted to the superset (gained the `source:'SIM'` provenance field);
   `src/dao.js` deleted; 5 importers repointed to `@shared/src/dao.js`. 78/78 tests, build green.

1d. ✅ **DONE (2026-06-10) — `model.js`.** Shared copy gained the `ui` + `training` state
   it was missing and dropped its dead `escHtml`; `src/model.js` deleted; 6 importers
   (incl. `tests/reducer.test.js`) repointed to `@shared/src/model.js`. 78/78 tests, build green.

1e. ✅ **DONE (2026-06-10) — `component-registry.js`.** Bidirectional merge: kept `src/`'s
   spec cross-ref fields + CMP-25 training entry + TR-aware `canAccess`, AND carried over the
   packages copy's CMP-24 `description`. Promoted to shared; `src/` deleted; importer
   (`rbac-factory`) repointed. 78/78 tests, build green.

1f. ✅ **DONE (2026-06-10) — `rbac-factory.js`.** Clean merge, `src/` was the ahead version
   (TR-role handling, border-left fix, flexible `stateCard`); no MFE-architectural divergence.
   Promoted to shared with relative `./component-registry.js` import; `src/` deleted;
   `src/events.js` importer repointed to `@shared/src/rbac-factory.js`. 78/78 tests, build green.

### ✅ COMPLETE (2026-06-10) — `reducer.js` + `scenario-engine.js`
Both done. The monolith adopted the MFE's decoupled pattern:
- `reducer.js`: promoted shared copy (gained `src/`'s `TOGGLE_PREDICTION` + `SET_PID_ZOOM`
  cases); `src/main.js` now subscribes to the `sentinel:render` event and calls `render(S)`
  instead of the reducer calling `render()` directly. 8 importers repointed.
- `scenario-engine.js`: confirmed logic-identical to `src/` (only the callback indirection
  differs). Adopted the shared callback-based copy; `src/events.js` calls
  `registerScenarioCallbacks({ addAIMessage, showDemoBar, setEmergencyOverlay, hideDemoBar })`.
- **Runtime-verified** via dev:app on :3000 — zero console errors, 16 sensor rows + HUD +
  alarm banner render, `sentinel:render` re-renders cleanly.

**ALL 9 core modules are now single-source in `packages/shared`.** 78/78 tests, build green.

> Note: the `packages/mfe-*/dist` bundles are pre-built artifacts from before convergence;
> the MFE side needs `npm run build:remotes` to pick up the shared-core changes (separate task).

<details><summary>Original remaining-work note (historical)</summary>

Both `reducer.js` and `scenario-engine.js` deliberately **decouple from the shell** in the MFE copy:
- `reducer.js`: shared copy uses `registerRenderer`/`callRenderer` events instead of calling
  `render()` directly.
- `scenario-engine.js`: shared copy exports `registerScenarioCallbacks` and does NOT
  `import { addAIMessage, ... } from './events.js'` (the monolith does).

To share one copy of each, the monolith must adopt the same decoupled pattern: `src/main.js`
registers its `render` (and the scenario callbacks) once, and the shared modules invoke them
via the registry. Behaviorally identical, but changes the monolith's render/callback wiring —
real risk, hence the deliberate pause. **Do these two together** (same decision).

2. **Minor:** `reducer` — see above: the keystone with the event-render design decision.
3. **Moderate:** `rbac-factory` — review 156-line diff (note: relates to ROADMAP **F5**
   RBAC merge; do them together if possible).
4. **Large:** `dao`, `scenario-engine`, `component-registry` — review carefully;
   `component-registry` is mostly the additive spec fields, so the merge is
   straightforward despite the big line count.

For each module, the per-module recipe is:
- Confirm which copy is ahead (read the diff).
- Make `packages/shared/src/<module>.js` the single canonical version.
- Delete `src/<module>.js`.
- Repoint `src/` importers to `@sentinel/shared` (or a relative path to
  `packages/shared`) — see Phase 2.

</details>

### Phase 2 — Wire `src/` to the shared core (the seam)
- Add `@sentinel/shared` as a dependency the `src/` build can resolve
  (path alias in `vite.config.js`, or workspace import).
- Replace `import { ... } from './dao.js'` style lines in `src/` with
  imports from the shared entry point.
- This is the step that actually removes the duplication; until now `src/`
  still ran. After this, both apps run off the same code.

### Phase 3 — Verify both entry points
- `npm run dev:app` (monolith) and `npm run dev` (MFE shell) both boot and
  behave identically, now backed by one core.
- `npm test` still green.

### Phase 4 — Guardrail against regression
- Add a lint/CI check that **fails if a core module reappears under `src/`**
  (so the duplication can't silently grow back).
- Update README + ROADMAP DoD to state: core logic lives only in
  `packages/shared`.

## 5. Alignment with ROADMAP F-series
- This convergence is the structural prerequisite that makes the F-series
  honest: **F1** (data layer), **F2** (viz standards), **F5** (RBAC merge),
  **F6** (nav shell) should all be implemented **once** in `packages/shared`,
  not twice. Doing P5 first means F-work isn't duplicated.
- **F5** in particular overlaps Phase 1.3 (the two RBAC sources). Consider
  merging those efforts.

## 5b. Why "automatic syncing" (file-copy) is NOT an option

Investigation (2026-06-10) shows the two copies are **not meant to be identical** —
they contain two different kinds of difference:

1. **Intentional / architectural.** `packages/shared/src/reducer.js` deliberately
   **removes** the direct `render()` call and replaces it with an event-based
   `registerRenderer`/`callRenderer` system so each MFE mounts independently and a
   crash in one panel can't silence the others (its own comment: *"MFE NOTE:
   render() is no longer called directly here"*). The `src/` reducer still calls
   `render()` directly (monolith style).
2. **Accidental / feature drift.** `src/model.js` has the full Training feature +
   `ui` state that `packages/shared` lacks.

A file-mirroring script (watcher / git hook / `cp`) cannot distinguish (1) from (2)
— it would clobber the intentional MFE wiring or wipe a real feature. **Auto-COPY
is therefore unsafe and is rejected.**

What IS safe and wanted is **auto-DETECT**: a CI check that *fails* when core logic
diverges, prompting a human merge (this is the Phase 4 guardrail). The only way to
make "in sync" both automatic and correct is to have **one** shared module — then
there is nothing to sync.

**Consequence for Phase 1:** the reducer (and any other MFE-adapted module) cannot
be "promote `src/` → delete" blindly. The shared core must keep the MFE-adapted
event wiring, and the monolith `src/` must **adopt** that event-based render path
(or the monolith retires — see §7 Q3). This makes the reducer step a real merge,
not a copy. Re-rank reducer from "minor (40 lines)" to **moderate-with-design-decision**.

## 6. Effort & risk
- **Effort:** ~M (1 focused day) for Phases 0–2 on the 6 small/identical
  modules; the 3 large modules add ~M more depending on how much real logic
  diverged vs. formatting.
- **Risk:** low-to-moderate. The 0-drift modules are free wins. The large
  modules need diff review, but `component-registry`'s size is inflated by
  additive (non-conflicting) spec fields.
- **Reversible:** yes — `git tag` in Phase 0; each module is an independent step.

## 7. Open decisions for the user (resolve before Phase 1)
1. **Import mechanism for `src/`:** Vite path alias to `packages/shared`, or
   promote `src/` into a real workspace package? (Alias is lighter.)
2. **Per-module direction confirmation:** any module where `packages/` has a
   fix `src/` lacks? (Default assumption: `src/` is ahead everywhere.)
3. **End-state of the `src/` monolith:** does it remain a permanent "all-in-one"
   build alongside the MFE, or is it a transitional shim that eventually goes
   away once the MFE shell is the only entry point?
