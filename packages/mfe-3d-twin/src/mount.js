/**
 * mfe-3d-twin mount — non-critical digital twin.
 * If this module fails to load or throws, the shell's error boundary catches
 * it and the rest of the HMI (telemetry, alarms) continues unaffected.
 */
import { initThreeJS } from './three-twin.js';

export function mount() {
  initThreeJS();
}
