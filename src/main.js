import { S } from '@shared/src/model.js';
import { DAO } from '@shared/src/dao.js';
import { bindAll, resetSessionTimer, startClock, startDataLoop } from './events.js';
import { initThreeJS } from './three-twin.js';
import { scheduleRender, dispatch } from '@shared/src/reducer.js';
import { render } from './views/render.js';
import { initSpecViews } from './spec/spec-views.js';
import { initNotificationToasts } from './spec/notifications.js';
import { startNotificationEngine } from '@shared/src/notification-engine.js';
import { ACTION_TYPES as A } from '../constants/actionTypes.js';

document.addEventListener('DOMContentLoaded', () => {
  // P5 convergence: the shared reducer is MFE-decoupled — scheduleRender() fires a
  // 'sentinel:render' event instead of calling render() directly. The monolith
  // subscribes here so its single render() runs on every state change. Registered
  // first so no render is missed during init.
  document.addEventListener('sentinel:render', () => render(S));

  // Initialize DAO from config (ISA-101 §5.4)
  DAO.init();

  // Spec views (Mappatura v5): inject nav + panels BEFORE bindAll so the
  // injected .nav-s buttons get the NAVIGATE click wiring.
  initSpecViews();

  bindAll();
  startClock();
  startDataLoop();
  initThreeJS();
  initNotificationToasts();
  startNotificationEngine();
  scheduleRender();

  // Session activity tracking (NUREG-0700 §6.5)
  ['mousemove','keydown','click','touchstart'].forEach(evt =>
    document.addEventListener(evt, () => {
      if (S && S.role) { 
        dispatch(A.TOUCH_ACTIVITY); 
        resetSessionTimer(); 
      }
    }, { passive: true })
  );
});
