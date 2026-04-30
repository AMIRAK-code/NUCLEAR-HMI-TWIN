/**
 * CORE-SENTINEL Shell Bootstrap
 * IEC 60964 §5.3 — Safety-critical displays must be uninterruptible.
 *
 * Load order:
 *  1. @sentinel/shared  — state, reducer, DAO (singleton, eager)
 *  2. mfe-telemetry     — HUD, alarms, gauges (safety-critical, awaited)
 *  3. DAO.init + events — data loop, session, event bindings
 *  4. scheduleRender    — first render
 *  5. mfe-3d-twin       — Three.js digital twin (lazy, error-isolated)
 *  6. mfe-config        — Config manager (lazy, error-isolated)
 *
 * If step 5 or 6 throws, the error boundary logs and continues — the
 * alarm display from step 2 is never affected.
 */
import { S, DAO, dispatch, scheduleRender, ACTION_TYPES as A } from '@sentinel/shared';
import { bindAll, resetSessionTimer, startClock, startDataLoop } from './events.js';

document.addEventListener('DOMContentLoaded', async () => {
  // ── Step 1: Initialise data layer ──────────────────────────────────────
  DAO.init();

  // ── Step 2: Load safety-critical telemetry MFE synchronously ──────────
  // Any failure here is fatal — the HMI cannot operate without its alarm display.
  // Dev-mode federation wraps named exports as { default: module }, so normalise.
  const _telMod = await import('mfeTelemetry/mount');
  const mountTelemetry = _telMod.mount ?? _telMod.default?.mount;
  mountTelemetry();

  // ── Step 3: Wire shell-level event handlers & data loop ───────────────
  bindAll();
  startClock();
  startDataLoop();

  // ── Step 4: First render ───────────────────────────────────────────────
  scheduleRender();

  // ── Step 5: Session activity tracking (NUREG-0700 §6.5) ───────────────
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt =>
    document.addEventListener(evt, () => {
      if (S && S.role) {
        dispatch(A.TOUCH_ACTIVITY);
        resetSessionTimer();
      }
    }, { passive: true })
  );

  // ── Step 6: Non-critical MFEs — fully error-isolated ──────────────────
  // A crash in either MFE is caught here; the alarm display keeps running.

  try {
    const _3dMod = await import('mfe3dTwin/mount');
    const mount3D = _3dMod.mount ?? _3dMod.default?.mount;
    mount3D();
  } catch (e) {
    // Non-critical: 3D twin unavailable — HMI remains fully operational
    console.warn('[Shell] mfe-3d-twin failed to load — continuing without 3D twin:', e.message);
    const container = document.getElementById('three-container');
    if (container) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;
                    height:100%;font-family:'Courier New',monospace;
                    font-size:11px;color:#6c757d;text-align:center;padding:1rem;">
          <div>
            <div style="font-weight:700;margin-bottom:4px;color:#d97d06;">3D TWIN UNAVAILABLE</div>
            <div>Digital twin module did not load.</div>
            <div>All safety functions nominal.</div>
          </div>
        </div>`;
    }
  }

  try {
    const _cfgMod = await import('mfeConfig/mount');
    const mountConfig = _cfgMod.mount ?? _cfgMod.default?.mount;
    mountConfig();
  } catch (e) {
    console.warn('[Shell] mfe-config failed to load — config panel disabled:', e.message);
  }
});
