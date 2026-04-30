// @sentinel/shared — Single import point for all MFEs and the shell.
// Module Federation ensures this module is loaded exactly once (singleton),
// so S, dispatch, and all service singletons share the same instance.

export { mkModel, S, setS } from './src/model.js';
export {
  reduce, dispatch, scheduleRender,
  INTENT_PERMISSIONS,
  registerRenderer, callRenderer,
} from './src/reducer.js';
export { DAO } from './src/dao.js';
export { ConfigService } from './src/config-service.js';
export { TelemetryBuffer } from './src/telemetry-buffer.js';
export { ScenarioEngine, registerScenarioCallbacks } from './src/scenario-engine.js';
export { UnitConverter } from './src/unit-converter.js';
export {
  COMPONENT_REGISTRY, DESIGN_TOKENS,
  canAccess, getComponent, getVisibleComponents, parseAccess,
} from './src/component-registry.js';
export { RBACContext, bindGuardedButton } from './src/rbac-factory.js';
export { ACTION_TYPES } from './constants/actionTypes.js';

// Utility functions
export { ts, mkEntry, setText, setAttr, escHtml, dlFile, pct, p2, p3 } from './utils.js';
