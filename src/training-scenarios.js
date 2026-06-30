/**
 * CORE-SENTINEL — Training Scenarios (WP 3.6)
 * Guided step-by-step scenario definitions for operator certification.
 *
 * Rules:
 *   - checkFn MUST be pure: no side-effects, reads state S only
 *   - timeout is in seconds; null = no auto-fail
 *   - targetComponentId maps to a DOM element ID that receives a gold highlight
 *   - action drives the UI label shown in the overlay
 */

export const TRAINING_SCENARIOS = [

  // ─────────────────────────────────────────────────────────────────
  // SCN-01 — Normal Operations Check  (EASY, 5 steps, ~5 min)
  // ─────────────────────────────────────────────────────────────────
  {
    id: 'SCN-01',
    title: 'Normal Operations Check',
    description: 'Familiarise yourself with the CORE-SENTINEL HMI panels and key telemetry points. No action is required — observe and navigate.',
    difficulty: 'EASY',
    estimatedMinutes: 5,
    steps: [
      {
        id: 'SCN-01-01',
        instruction: 'Navigate to the Primary Circuit panel to begin the normal operations walkthrough.',
        targetComponentId: 'panel-primary',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-primary',
        timeout: 30,
        hint: 'Click "Primary Circuit" in the left sidebar, or the "Reactor" tab in the top navigation bar.',
      },
      {
        id: 'SCN-01-02',
        instruction: 'Observe the Core Thermal Load chart. Confirm the current temperature is below the 1,200 °C trip limit.',
        targetComponentId: 'svg-temp',
        action: 'observe',
        checkFn: (S) => S.activePanel === 'panel-primary' && (S.sensors.CORE_TEMP?.v ?? 0) < 1200,
        timeout: 20,
        hint: 'The Core Thermal Load chart is in the lower-left section of the Primary Circuit panel. The red dashed line is the trip setpoint.',
      },
      {
        id: 'SCN-01-03',
        instruction: 'Navigate to the Safety Systems panel and review the protection interlock status table.',
        targetComponentId: 'panel-safety',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-safety',
        timeout: 30,
        hint: 'Click "Safety Systems" in the left sidebar navigation under "Plant Systems".',
      },
      {
        id: 'SCN-01-04',
        instruction: 'Navigate to the Diagnostics panel and review the full sensor health table.',
        targetComponentId: 'panel-diagnostics',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-diagnostics',
        timeout: 30,
        hint: 'Click "Diagnostics" in the left sidebar navigation under "Intelligence".',
      },
      {
        id: 'SCN-01-05',
        instruction: 'Return to the Primary Circuit panel. Normal operations walkthrough complete.',
        targetComponentId: 'panel-primary',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-primary',
        timeout: 30,
        hint: 'Click "Primary Circuit" in the sidebar or the "Reactor" tab at the top.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // SCN-02 — Primary Circuit Alarm Response  (MEDIUM, 8 steps, ~8 min)
  // ─────────────────────────────────────────────────────────────────
  {
    id: 'SCN-02',
    title: 'Primary Circuit Alarm Response',
    description: 'Practice the correct alarm response procedure for a primary circuit pressure deviation. Follow ISA-101 alarm management protocol.',
    difficulty: 'MEDIUM',
    estimatedMinutes: 8,
    steps: [
      {
        id: 'SCN-02-01',
        instruction: 'A primary circuit anomaly has been detected. Navigate to the Primary Circuit panel to assess system state.',
        targetComponentId: 'panel-primary',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-primary',
        timeout: 30,
        hint: 'Click "Primary Circuit" in the sidebar or the "Reactor" tab at the top.',
      },
      {
        id: 'SCN-02-02',
        instruction: 'Review the alarm banner at the top of the screen. Identify the colour, priority, and sensor tag of the highest-severity alarm.',
        targetComponentId: 'alarm-inner',
        action: 'observe',
        checkFn: (S) => S.activePanel === 'panel-primary' && S.alarms.length > 0,
        timeout: 25,
        hint: 'The alarm banner spans the top of the display. Red = P1 Critical, Amber = P2 Urgent, Orange = P3 High. The tag (e.g. P-PRI-01) identifies the affected sensor.',
      },
      {
        id: 'SCN-02-03',
        instruction: 'Navigate to the AI Copilot panel for automated anomaly analysis and recommended actions.',
        targetComponentId: 'panel-ai',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-ai',
        timeout: 30,
        hint: 'Click "AI Copilot" in the left sidebar under "Intelligence".',
      },
      {
        id: 'SCN-02-04',
        instruction: 'Review the Anomaly List on the AI Copilot panel. Note any [FIRST-OUT] alarm — this is the initiating event.',
        targetComponentId: 'anomaly-list',
        action: 'observe',
        checkFn: (S) => S.activePanel === 'panel-ai',
        timeout: 25,
        hint: 'The Anomaly List is in the left column of the AI Copilot panel. The [FIRST-OUT] badge marks the alarm that started the cascade.',
      },
      {
        id: 'SCN-02-05',
        instruction: 'Acknowledge all active alarms using the ACK ALL button in the alarm banner. ISA-101 requires acknowledgment to confirm situational awareness.',
        targetComponentId: 'btn-ack-all',
        action: 'acknowledge_alarm',
        checkFn: (S) => S.alarms.filter(a => !a.acked).length === 0,
        timeout: 35,
        hint: 'Click the "ACK ALL" button at the right end of the alarm banner. Acknowledging does not clear or silence alarms — it records that you have noted them.',
      },
      {
        id: 'SCN-02-06',
        instruction: 'Navigate to the Safety Systems panel to verify that all protection interlocks are in the ARMED state.',
        targetComponentId: 'panel-safety',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-safety',
        timeout: 30,
        hint: 'Click "Safety Systems" in the left sidebar.',
      },
      {
        id: 'SCN-02-07',
        instruction: 'Review the interlock table. Confirm no interlock is showing TRIPPED status. TRIPPED indicates an automatic protective action has fired.',
        targetComponentId: 'interlock-table',
        action: 'observe',
        checkFn: (S) => S.activePanel === 'panel-safety' && !S.interlocks.some(i => i.st === 'TRIPPED'),
        timeout: 25,
        hint: 'Each row in the interlock table shows a tag, current setpoint (SP), and status badge. ARMED = ready, TRIPPED = actuated, OFFLINE = failed.',
      },
      {
        id: 'SCN-02-08',
        instruction: 'Return to the Primary Circuit panel. The alarm response procedure is complete. Document findings in the shift log.',
        targetComponentId: 'panel-primary',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-primary',
        timeout: 30,
        hint: 'Click "Primary Circuit" in the sidebar or the "Reactor" tab.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────
  // SCN-03 — SCRAM Procedure  (HARD, 10 steps, ~12 min)
  // ─────────────────────────────────────────────────────────────────
  {
    id: 'SCN-03',
    title: 'SCRAM Procedure',
    description: 'Walk through the full emergency reactor shutdown (SCRAM) procedure. Each step follows IEC 61511 / NUREG-0700 SBO-SCRAM-74A protocol.',
    difficulty: 'HARD',
    estimatedMinutes: 12,
    steps: [
      {
        id: 'SCN-03-01',
        instruction: 'EMERGENCY — Core temperature excursion in progress. Navigate to the Primary Circuit panel immediately.',
        targetComponentId: 'panel-primary',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-primary',
        timeout: 20,
        hint: 'Click "Primary Circuit" in the sidebar or the "Reactor" tab. Speed is critical in a real emergency.',
      },
      {
        id: 'SCN-03-02',
        instruction: 'Observe the Core Thermal Load trend chart. Assess the rate of temperature rise and the predictive dashed projection line.',
        targetComponentId: 'svg-temp',
        action: 'observe',
        checkFn: (S) => S.activePanel === 'panel-primary',
        timeout: 20,
        hint: 'The dashed prediction line shows the projected temperature over the next 2 minutes. A steep upward slope toward the red trip line requires immediate SCRAM.',
      },
      {
        id: 'SCN-03-03',
        instruction: 'Confirm a P1 Critical alarm is active in the alarm banner for sensor T-CORE-01 (Core Temperature).',
        targetComponentId: 'alarm-inner',
        action: 'observe',
        checkFn: (S) => S.alarms.some(a => a.p === 1),
        timeout: 20,
        hint: 'A P1 alarm is shown with a red background in the alarm banner. The tag T-CORE-01 identifies the core temperature sensor.',
      },
      {
        id: 'SCN-03-04',
        instruction: 'Navigate to the AI Copilot panel. Review the automated threat assessment and recommended emergency actions.',
        targetComponentId: 'panel-ai',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-ai',
        timeout: 25,
        hint: 'Click "AI Copilot" in the sidebar. The Politecnico AI physics model provides real-time SCRAM recommendations.',
      },
      {
        id: 'SCN-03-05',
        instruction: 'Identify the FIRST-OUT alarm in the Anomaly List. This is the initiating event of the cascade — it must be logged for the post-incident report.',
        targetComponentId: 'anomaly-list',
        action: 'observe',
        checkFn: (S) => S.activePanel === 'panel-ai',
        timeout: 20,
        hint: 'The [FIRST-OUT] badge in the Anomaly List marks the alarm that triggered the cascade — important for root-cause analysis.',
      },
      {
        id: 'SCN-03-06',
        instruction: 'Navigate to the Safety Systems panel to verify SCRAM readiness.',
        targetComponentId: 'panel-safety',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-safety',
        timeout: 25,
        hint: 'Click "Safety Systems" in the left sidebar.',
      },
      {
        id: 'SCN-03-07',
        instruction: 'Verify the SCRAM bus voltage (V-SCR-01) is above the 40 V minimum threshold. Below 40 V triggers a passive gravity-drop SCRAM.',
        targetComponentId: 'interlock-table',
        action: 'observe',
        checkFn: (S) => S.activePanel === 'panel-safety' && (S.sensors.SCRAM_V?.v ?? 48) > 40,
        timeout: 20,
        hint: 'Find the "SCRAM Bus Undervoltage" row in the interlock table. The SP column shows "< 40 V". The current SCRAM_V sensor value must be above this.',
      },
      {
        id: 'SCN-03-08',
        instruction: 'Acknowledge all active alarms. ISA-101 §5.4 requires documented acknowledgment before actuating protective measures.',
        targetComponentId: 'btn-ack-all',
        action: 'acknowledge_alarm',
        checkFn: (S) => S.alarms.filter(a => !a.acked).length === 0,
        timeout: 30,
        hint: 'Click ACK ALL in the alarm banner. This records your acknowledgment in the audit trail — it does not silence or clear the alarms.',
      },
      {
        id: 'SCN-03-09',
        instruction: 'Navigate back to the Primary Circuit panel and locate the SCRAM control. TRAINEE NOTE: In a live scenario (OD/AS role), you would now press the SCRAM button. This step auto-completes for assessment.',
        targetComponentId: 'panel-primary',
        action: 'navigate_to',
        checkFn: (S) => S.activePanel === 'panel-primary',
        timeout: 35,
        hint: 'The SCRAM button is in the Safety Systems panel and requires OD or AS role. In Training Mode, navigate to Primary Circuit to confirm you know the panel layout.',
      },
      {
        id: 'SCN-03-10',
        instruction: 'Final confirmation: observe the Digital Twin and system status. In a live SCRAM all control rods insert and the reactor enters safe shutdown. SCRAM procedure assessment complete.',
        targetComponentId: 'three-container',
        action: 'observe',
        checkFn: (S) => S.activePanel === 'panel-primary',
        timeout: 25,
        hint: 'The 3D Digital Twin shows rod positions. In a live SCRAM the rods drop to 100% insertion and core temperature begins falling within 30 seconds.',
      },
    ],
  },
];

/** Convenience: look up a scenario by ID */
export function getScenario(id) {
  return TRAINING_SCENARIOS.find(sc => sc.id === id) ?? null;
}

/** Load best scores map from localStorage */
export function loadScores() {
  try { return JSON.parse(localStorage.getItem('dao-training-scores') ?? '{}'); }
  catch { return {}; }
}

/** Persist a scenario score (keeps best only) */
export function saveScore(scenarioId, score) {
  const scores = loadScores();
  if (scores[scenarioId] == null || score > scores[scenarioId]) {
    scores[scenarioId] = score;
    localStorage.setItem('dao-training-scores', JSON.stringify(scores));
  }
}
