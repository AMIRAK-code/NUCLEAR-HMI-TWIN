/**
 * mfe-telemetry mount — safety-critical entry point.
 * IEC 60964 §5.3: alarm display must be uninterruptible.
 *
 * mount() subscribes to 'sentinel:render' once. Every dispatch() in the
 * shared reducer fires this event; render(s) is called with error isolation
 * so a render bug here can never prevent the event from being re-subscribed
 * on the next tick.
 */
import { render } from './views/render.js';

export function mount() {
  document.addEventListener('sentinel:render', (e) => {
    try {
      render(e.detail);
    } catch (err) {
      // Log but do NOT re-throw — the alarm display must keep receiving events
      console.error('[mfe-telemetry] render error (isolated):', err);
    }
  });
}
