/**
 * mfe-config mount — SCR-14 Platform Configuration Manager.
 * Non-critical: if this MFE fails to load, the alarm display is unaffected.
 * registerRenderer puts renderConfigPanel into the shared renderer registry;
 * mfe-telemetry calls callRenderer('configPanel', s) on every render cycle.
 */
import { registerRenderer } from '@sentinel/shared';
import { renderConfigPanel } from './views/render-config.js';

export function mount() {
  registerRenderer('configPanel', renderConfigPanel);
}
