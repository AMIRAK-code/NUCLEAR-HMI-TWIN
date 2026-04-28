/**
 * CORE-SENTINEL HMI — VR Service
 * Handles cloud relay connection, Meta Horizon deeplink, and WebXR session management.
 *
 * ── Cloud Integration ──────────────────────────────────────────────────────────
 * Replace VR_CLOUD_ENDPOINT with your cloud relay WebSocket URL.
 * Drop your cloud setup files here and call VRService.connectCloud() to use them.
 *
 * ── Meta Horizon ──────────────────────────────────────────────────────────────
 * On Meta Quest Browser:  WebXR immersive-vr session starts directly.
 * On desktop:             A QR code is shown (scan with Quest) plus a
 *                         Meta Horizon redirect link.
 */

// ── Cloud configuration — replace with your relay endpoint ──────────────────
const VR_CLOUD_ENDPOINT = 'wss://your-cloud-relay.example.com/vr-hmi';
// Cloud relay connection timeout in milliseconds
const VR_CONNECT_TIMEOUT_MS = 5000;
// Optionally set a Meta Horizon Worlds App ID for direct deeplink launch
const META_HORIZON_APP_ID = null;

// ── Status values ─────────────────────────────────────────────────────────────
export const VR_STATUS = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING:   'CONNECTING',
  CONNECTED:    'CONNECTED',
  VR_ACTIVE:    'VR_ACTIVE',
  ERROR:        'ERROR',
});

// ── VRService singleton ───────────────────────────────────────────────────────
export const VRService = {
  _ws:      null,
  _session: null,
  status:   VR_STATUS.DISCONNECTED,
  _listeners: [],

  // ── Status helpers ──────────────────────────────────────────────────────────
  _emit(status) {
    this.status = status;
    this._listeners.forEach(fn => fn(status));
  },

  onStatusChange(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(f => f !== fn); };
  },

  // ── Environment detection ───────────────────────────────────────────────────
  isMetaQuest() {
    return /OculusBrowser|MetaQuestBrowser|Quest/i.test(navigator.userAgent);
  },

  isWebXRSupported() {
    return typeof navigator !== 'undefined' && !!navigator.xr;
  },

  async isImmersiveVRSupported() {
    if (!this.isWebXRSupported()) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-vr');
    } catch {
      return false;
    }
  },

  // ── Cloud relay connection ──────────────────────────────────────────────────
  connectCloud() {
    return new Promise((resolve) => {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }

      this._emit(VR_STATUS.CONNECTING);

      let settled = false;
      const settle = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };

      // VR_CONNECT_TIMEOUT_MS timeout
      const timer = setTimeout(() => {
        this._emit(VR_STATUS.ERROR);
        settle(false);
      }, VR_CONNECT_TIMEOUT_MS);

      try {
        this._ws = new WebSocket(VR_CLOUD_ENDPOINT);

        this._ws.onopen = () => {
          clearTimeout(timer);
          this._emit(VR_STATUS.CONNECTED);
          settle(true);
        };

        this._ws.onerror = () => {
          clearTimeout(timer);
          this._emit(VR_STATUS.ERROR);
          settle(false);
        };

        this._ws.onclose = () => {
          if (this.status !== VR_STATUS.ERROR) {
            this._emit(VR_STATUS.DISCONNECTED);
          }
        };
      } catch {
        clearTimeout(timer);
        this._emit(VR_STATUS.ERROR);
        settle(false);
      }
    });
  },

  disconnect() {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    if (this._session) {
      this._session.end().catch(() => {});
      this._session = null;
    }
    this._emit(VR_STATUS.DISCONNECTED);
  },

  // ── WebXR session (for Meta Quest Browser and WebXR-capable browsers) ───────
  async startWebXRSession(renderer) {
    if (!renderer || !renderer.xr) return false;
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });
      this._session = session;
      renderer.xr.setSession(session);
      this._emit(VR_STATUS.VR_ACTIVE);

      session.addEventListener('end', () => {
        this._session = null;
        this._emit(this._ws && this._ws.readyState === WebSocket.OPEN
          ? VR_STATUS.CONNECTED
          : VR_STATUS.DISCONNECTED);
      });
      return true;
    } catch {
      return false;
    }
  },

  // ── Meta Horizon deeplink ───────────────────────────────────────────────────
  launchMetaHorizon() {
    // Use only origin + pathname to avoid leaking query params or fragments
    const safeUrl = encodeURIComponent(window.location.origin + window.location.pathname);
    if (META_HORIZON_APP_ID) {
      window.location.href = `horizonos://app/${META_HORIZON_APP_ID}`;
    } else {
      window.open(`https://oculus.com/open_url/?url=${safeUrl}`, '_blank', 'noopener,noreferrer');
    }
  },

  // ── URL for scanning with a Quest headset (origin + pathname only) ──────────
  getPageURL() {
    return window.location.origin + window.location.pathname;
  },
};
