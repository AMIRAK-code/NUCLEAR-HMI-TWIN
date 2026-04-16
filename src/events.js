import { S, setS } from './model.js';
import { DAO } from './dao.js';
import { dispatch, scheduleRender } from './reducer.js';
import { ts, p2, p3, escHtml, bindGuardedButton, dlFile, setText, setAttr } from '../utils.js';
import { ScenarioEngine } from './scenario-engine.js';
import { renderDiagnostics } from './views/render.js';


// ═══════════════════════════════════════════════════════════════════
let _onConfirm = null;
export function showModal({ icon='info', title, content, primary='ACKNOWLEDGE', secondary=null, onConfirm=null }) {
  document.getElementById('modal-icon').textContent = icon;
  setText('modal-title', title);
  document.getElementById('modal-content').innerHTML = content;
  setText('btn-modal-pri', primary);
  const sec = document.getElementById('btn-modal-sec');
  secondary ? (sec.textContent=secondary, sec.classList.remove('hidden')) : sec.classList.add('hidden');
  _onConfirm = onConfirm;
  const ov = document.getElementById('modal-overlay');
  ov.classList.remove('hidden'); ov.classList.add('flex');
}
export function hideModal() {
  const ov = document.getElementById('modal-overlay');
  ov.classList.add('hidden'); ov.classList.remove('flex');
  _onConfirm = null;
}
// ═══════════════════════════════════════════════════════════════════
export function showDemoBar(msg, col) {
  const bar = document.getElementById('demo-bar');
  const inner = document.getElementById('demo-inner');
  if (!bar || !inner) return;
  bar.style.height = '2.5rem';
  const bg = col==='#e31a1a'?'#fcdcdc':col==='#159647'?'#03140a':col==='#d97d06'?'#141000':'#100c00';
  inner.style.background = bg;
  inner.style.borderColor = col + '40';
  setText('demo-bar-text', msg);
  document.querySelector('#demo-inner .blink')?.style.setProperty('color', col);
}

export function hideDemoBar() {
  const bar = document.getElementById('demo-bar');
  if (bar) bar.style.height = '0';
}

export function setEmergencyOverlay(opacity) {
  const el = document.getElementById('three-emergency-overlay');
  if (el) el.style.opacity = Math.min(1, opacity);
}
// ═══════════════════════════════════════════════════════════════════
export function bindAll() {

  // Modal controls
  document.getElementById('btn-modal-close').addEventListener('click', hideModal);
  document.getElementById('btn-modal-sec').addEventListener('click', hideModal);
  document.getElementById('btn-modal-pri').addEventListener('click', () => { if(_onConfirm) _onConfirm(); hideModal(); });
  document.getElementById('modal-overlay').addEventListener('click', e => { if(e.target.id==='modal-overlay') hideModal(); });

  // Role selection
  document.querySelectorAll('.role-btn').forEach(b => {
    b.addEventListener('click', () => {
      const role = b.getAttribute('data-role');
      dispatch('SET_ROLE', {role});
      document.getElementById('role-overlay').style.display = 'none';
      const ts2 = document.getElementById('ai-init-ts');
      if (ts2) ts2.textContent = ts();

      // ── RBAC: activate component factory for this role ──────────
      if (window.RBACContext) {
        RBACContext.setRole(role);
        // Show Cybersecurity nav item only for AS
        const navCyber = document.getElementById('nav-cyber');
        if (navCyber) navCyber.style.display = role === 'AS' ? '' : 'none';
      }
    });
  });

  // RBAC Permission Matrix info button (on login screen)
  document.getElementById('btn-rbac-info')?.addEventListener('click', () => {
    if (!window.renderRoleSummary) return;
    showModal({
      icon: 'manage_accounts',
      title: 'Component Permission Matrix — All Roles',
      content: `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
          <div>
            <div style="font-family:'Courier New',monospace;font-size:12px;
                        color:#212529;font-weight:700;margin-bottom:8px;
                        border-bottom:1px solid rgba(0,0,0,.08);padding-bottom:4px;">
              LOCAL OPERATOR — OL</div>
            ${renderRoleSummary('OL')}
          </div>
          <div>
            <div style="font-family:'Courier New',monospace;font-size:12px;
                        color:#212529;font-weight:700;margin-bottom:8px;
                        border-bottom:1px solid rgba(0,0,0,.08);padding-bottom:4px;">
              DIAGNOSTIC OPERATOR — OD</div>
            ${renderRoleSummary('OD')}
          </div>
          <div>
            <div style="font-family:'Courier New',monospace;font-size:12px;
                        color:#212529;font-weight:700;margin-bottom:8px;
                        border-bottom:1px solid rgba(0,0,0,.08);padding-bottom:4px;">
              SYSTEM ADMIN — AS</div>
            ${renderRoleSummary('AS')}
          </div>
        </div>`,
    });
  });

  // Navigation
  document.querySelectorAll('.nav-s, .nav-t').forEach(b => {
    b.addEventListener('click', () => {
      const panel = b.getAttribute('data-panel');
      if (panel) dispatch('NAVIGATE', {panel});
    });
  });

  // Alarm banner
  document.getElementById('btn-ack-all').addEventListener('click', () => dispatch('ACK_ALL'));
  document.getElementById('btn-dismiss-banner').addEventListener('click', () => dispatch('DISMISS_BANNER'));

  // Audit panel
  ['btn-audit-hdr','btn-logs'].forEach(id => document.getElementById(id)?.addEventListener('click', () => dispatch('TOGGLE_AUDIT')));
  document.getElementById('btn-close-audit').addEventListener('click', () => dispatch('TOGGLE_AUDIT'));
  document.getElementById('btn-clear-audit').addEventListener('click', () => dispatch('CLEAR_AUDIT'));
  document.getElementById('btn-export-audit').addEventListener('click', () => {
    const csv = 'Timestamp,Role,Event\n' + S.auditLog.map(e=>`"${e.ts}","${e.role}","${e.msg}"`).join('\n');
    dlFile(csv, `audit-${Date.now()}.csv`, 'text/csv');
    dispatch('LOG',{msg:'Audit log exported to CSV'});
  });

  // ── DEMO BUTTON — CMP-22: OL=X, OD=R/U, AS=C/R/U/D ─────────────
  document.getElementById('btn-demo').addEventListener('click', () => {
    // RBAC guard: OL cannot access emergency scenario simulator
    if (S.role === 'OL') {
      showModal({
        icon: 'lock',
        title: 'Access Denied — Emergency Simulator',
        content: `<div class="tv text-sm space-y-3">
          <div style="color:#e31a1a;font-weight:700;font-size:12px;padding:10px;
                      border:1px solid rgba(255,32,32,.2);background:rgba(255,32,32,.05);">
            PERMISSION DENIED — CMP-22
          </div>
          <p style="color:#343a40;font-size:11px;">
            The Emergency Scenario Simulator requires <strong style="color:#212529;">Diagnostic Operator (OD)</strong>
            or <strong style="color:#212529;">System Admin (AS)</strong> role.<br/>
            Current role: <strong style="color:#d97d06;">OL</strong> — Read-only monitoring only.
          </p>
          <div style="font-family:'Courier New',monospace;font-size:11px;color:#6c757d;
                      border:1px solid rgba(0,0,0,.08);padding:8px;">
            CMP-22 Access Matrix: OL=<span style="color:#adb5bd;">X</span> ·
            OD=<span style="color:#159647;">R/U</span> ·
            AsetS();">C/R/U/D</span>
          </div>
        </div>`,
      });
      return;
    }
    showModal({
      icon: 'science',
      title: 'Emergency Scenario Simulator',
      content: `<div class="tv space-y-3 text-sm">
        <div class="p-3 border border-[#cd5c08]/20 bg-[#cd5c08]/5 text-[#cd5c08] text-[12px] uppercase tracking-wider font-bold">
          ⚠ Demo Mode — Simulated Emergency Scenarios · All data is synthetic
        </div>
        <p class="text-[#343a40] text-xs">Select a scenario to simulate. The HMI will escalate sensor values, fire alarms, and trigger AI advisories in real time. You can SCRAM at any time (OD/AS) or let the system auto-trip.</p>
        <div class="space-y-2 mt-3">
          <button id="demo-btn-a" class="w-full text-left p-3 border border-[rgba(0,0,0,.1)] hover:bg-[#d1d6dc] transition-colors group">
            <div class="flex items-center gap-2">
              <span class="tv font-bold text-[#d97d06] text-[11px] uppercase tracking-wider">Scenario A — Rising Core Temperature</span>
              <span class="tv text-[11px] text-[#6c757d] ml-auto">~7 min to trip</span>
            </div>
            <p class="tv text-[11px] text-[#343a40] mt-1">Coolant bypass valve partial closure → core temp rises → P3→P2→P1 alarms → auto-SCRAM if unchecked.</p>
          </button>
          <button id="demo-btn-b" class="w-full text-left p-3 border border-[rgba(0,0,0,.1)] hover:bg-[#d1d6dc] transition-colors group">
            <div class="flex items-center gap-2">
              <span class="tv font-bold text-[#cd5c08] text-[11px] uppercase tracking-wider">Scenario B — Loss of Coolant Flow (LOCA)</span>
              <span class="tv text-[11px] text-[#6c757d] ml-auto">~3 min to trip</span>
            </div>
            <p class="tv text-[11px] text-[#343a40] mt-1">Pump-A bearing seizure → flow loss → rapid temp rise → overloaded Pump-B → auto-SCRAM by RPS.</p>
          </button>
          <button id="demo-btn-c" class="w-full text-left p-3 border border-[rgba(0,0,0,.1)] hover:bg-[#d1d6dc] transition-colors group">
            <div class="flex items-center gap-2">
              <span class="tv font-bold text-[#e31a1a] text-[11px] uppercase tracking-wider">Scenario C — Station Blackout (SBO)</span>
              <span class="tv text-[11px] text-[#6c757d] ml-auto">~2 min to trip</span>
            </div>
            <p class="tv text-[11px] text-[#343a40] mt-1">Total AC power loss → pumps coast-down → EDG failure → passive lead-bismuth cooling → passive SCRAM.</p>
          </button>
        </div>
        <div class="mt-3 pt-3 border-t border-[rgba(0,0,0,.08)] text-[12px] text-[#6c757d]">
          Tip: Switch to Safety panel to watch control rod positions and interlock status in real-time.
        </div>
      </div>`,
      primary: 'CLOSE',
    });

    // Bind scenario buttons after modal renders
    setTimeout(() => {
      document.getElementById('demo-btn-a')?.addEventListener('click', () => { hideModal(); ScenarioEngine.runRisingTemp(); dispatch('NAVIGATE',{panel:'panel-primary'}); });
      document.getElementById('demo-btn-b')?.addEventListener('click', () => { hideModal(); ScenarioEngine.runLOCA();       dispatch('NAVIGATE',{panel:'panel-primary'}); });
      document.getElementById('demo-btn-c')?.addEventListener('click', () => { hideModal(); ScenarioEngine.runBlackout();   dispatch('NAVIGATE',{panel:'panel-primary'}); });
    }, 50);
  });

  // Demo reset
  document.getElementById('btn-demo-reset').addEventListener('click', () => ScenarioEngine.resetToNominal());

  // ── Header: System Topology ──────────────────────────────────────
  document.getElementById('btn-tree').addEventListener('click', () => {
    dispatch('LOG',{msg:'System topology reviewed'});
    showModal({
      icon:'account_tree', title:'System Topology — RT-SIM-04',
      content:`<div class="tv text-xs space-y-0">
        <div class="text-[#6c757d] text-[11px] mb-3 uppercase tracking-wider">DAO Connection Map — LFR-4G Unit 4</div>
        ${[['Node Alpha','Reactor Core / Primary Loop','ONLINE','#159647'],
           ['Node Beta', 'Primary Pumps A/B',         'ONLINE','#159647'],
           ['Node Gamma','Emergency Relief Valve',     'OFFLINE','#e31a1a'],
           ['Node Delta','Steam Generator Loop',       'ONLINE','#159647'],
           ['Node Epsilon','Turbine / Generator',      'ONLINE','#159647'],
           ['Node Zeta', 'Grid Interface',             'ONLINE','#159647'],
           ['Node Eta',  'Politecnico AI Physics Core','ONLINE','#159647'],
        ].map(([id,desc,st,col])=>`
          <div class="flex justify-between py-2 border-b border-[rgba(0,0,0,.06)]">
            <span class="text-[#343a40]">${id} — ${desc}</span>
            <span class="font-bold ml-4 shrink-0" style="color:${col}">${st}</span>
          </div>`).join('')}
      </div>`,
    });
  });

  // ── Header: Settings ─────────────────────────────────────────────
  document.getElementById('btn-settings').addEventListener('click', () => {
    showModal({
      icon:'settings', title:'HMI Configuration',
      content:`<div class="tv text-sm space-y-4">
        <div class="text-[#6c757d] text-[11px] uppercase tracking-wider border-b border-[rgba(0,0,0,.08)] pb-2">Display & Operations</div>
        <label class="flex items-center justify-between cursor-pointer py-1 border-b border-[rgba(0,0,0,.06)]">
          <span class="text-[#343a40]">Safe-Mode Overrides</span>
          <input type="checkbox" id="s-safe" class="w-4 h-4 accent-[#495057]" checked/>
        </label>
        <label class="flex items-center justify-between cursor-pointer py-1 border-b border-[rgba(0,0,0,.06)]">
          <span class="text-[#343a40]">Verbose Telemetry Output</span>
          <input type="checkbox" id="s-verb" class="w-4 h-4 accent-[#495057]"/>
        </label>
        <label class="flex items-center justify-between cursor-pointer py-1 border-b border-[rgba(0,0,0,.06)]">
          <span class="text-[#343a40]">Mute Routine Notifications</span>
          <input type="checkbox" id="s-mute" class="w-4 h-4 accent-[#495057]"/>
        </label>
        <div class="pt-2 border-t border-[rgba(0,0,0,.06)]">
          <label class="text-[11px] text-[#6c757d] uppercase tracking-wider">DAO Source Mode</label>
          <select id="s-dao" class="w-full mt-1 bg-[#f4f6f8] border border-[rgba(0,0,0,.1)] px-2 py-1.5 tv text-xs text-[#212529] focus:outline-none">
            <option value="SIMULATED">SIMULATED (Politecnico Model)</option>
            <option value="PHYSICAL">PHYSICAL (Live Sensors)</option>
          </select>
        </div>
        <div class="pt-2 border-t border-[rgba(0,0,0,.06)]">
          <div class="text-[11px] text-[#6c757d] uppercase tracking-widest mb-2">Display (NUREG-0700 §11.4.2)</div>
          <label class="flex items-center justify-between cursor-pointer py-1 border-b border-[rgba(0,0,0,.06)]">
            <span class="text-[#343a40]">High-Contrast Mode</span>
            <input type="checkbox" id="s-hc" class="w-4 h-4 accent-[#495057]" ${S.highContrast ? 'checked' : ''}/>
          </label>
        </div>
      </div>`,
      primary:'SAVE CHANGES', secondary:'CANCEL',
      onConfirm: () => {
        const dao = document.getElementById('s-dao')?.value || 'SIMULATED';
        DAO.mode = dao;
        setText('dao-label', `DAO: ${dao}`);
        setText('diag-dao', dao);
        setText('ai-dao-mode', dao);
        const hcChecked = document.getElementById('s-hc')?.checked ?? false;
        if (hcChecked !== S.highContrast) dispatch('TOGGLE_HIGH_CONTRAST');
        dispatch('LOG',{msg:`Settings saved. DAO mode: ${dao}${hcChecked?' | High-contrast: ON':''}`});
      }
    });
  });

  // ── Header: Logout ───────────────────────────────────────────────
  document.getElementById('btn-logout').addEventListener('click', () => {
    showModal({
      icon:'logout', title:'Terminate Session',
      content:`<div class="tv text-sm space-y-3">
        <div class="p-3 border border-[#e31a1a]/20 bg-[#e31a1a]/5 text-[#e31a1a] text-center font-bold uppercase text-xs">Warning: Active Shift In Progress</div>
        <p class="text-[#343a40]">Ending session transfers authority to standby console. SOP-02B procedural hand-off required.</p>
        <div class="p-2 bg-[#f4f6f8] border border-[rgba(0,0,0,.08)] text-[12px] text-[#6c757d]">Role: ${S.role} · Session: ${S.sessionStart ? ts() : 'N/A'}</div>
      </div>`,
      primary:'TERMINATE', secondary:'ABORT',
      onConfirm: () => {
        ScenarioEngine.stop();
        dispatch('LOG',{msg:`Session terminated. Role: ${S.role}`});
        setTimeout(()=>{
          document.getElementById('role-overlay').style.display='flex';
          // Clear RBAC context on logout
          if (window.RBACContext) RBACContext.clear();
          const navCyber = document.getElementById('nav-cyber');
          if (navCyber) navCyber.style.display = 'none';
          setS(); scheduleRender();
        },300);
      }
    });
  });

  // ── Sidebar: Help ────────────────────────────────────────────────
  document.getElementById('btn-help').addEventListener('click', () => {
    dispatch('LOG',{msg:'SOP documentation accessed'});
    showModal({
      icon:'help', title:'Protocol Documentation',
      content:`<div class="tv text-xs space-y-3 text-[#343a40]">
        <div class="font-bold text-[#212529] text-sm border-b border-[rgba(0,0,0,.08)] pb-2">SOP-74A: Primary Core Loop Operations</div>
        <div><strong class="text-[#212529]">§4.2.1</strong> Monitor coolant inlet/outlet differential. Max ΔT = 280K.</div>
        <div><strong class="text-[#212529]">§4.2.3</strong> If core temp &gt;1150°C, initiate advisory review per ESS-01.</div>
        <div><strong class="text-[#212529]">§4.2.7</strong> Sub-valve 04-B: inspect every 30-min operational cycle.</div>
        <div><strong class="text-[#212529]">§4.3.1</strong> SCRAM authority: OD and AS roles only. Double-click to confirm.</div>
        <div class="font-bold text-[#212529] text-sm border-b border-[rgba(0,0,0,.08)] pb-2 pt-3">Appendix C: Emergency Depressurization</div>
        <p>Confirm SCRAM engaged → open ERV-01 → notify shift supervisor → log audit trail.</p>
        <div class="p-2 bg-[#f4f6f8] border border-[rgba(0,0,0,.08)] text-[11px] mt-2">IAEA-LFR-OPS-2026-04 | Rev: 4.2 | Class: RESTRICTED</div>
      </div>`,
    });
  });

  // ── Safety: SCRAM (double-click required, CMP-09) ────────────────────────
  let scramN=0, scramT=null;
  bindGuardedButton('btn-scram', 'CMP-09', 'U', () => {
    if (S.scramActive) return;
    scramN++;
    if (scramT) clearTimeout(scramT);
    scramT = setTimeout(()=>{scramN=0;},2200);
    if (scramN>=2) {
      scramN=0;
      showModal({
        icon:'power_settings_new', title:'⚠ CONFIRM SCRAM',
        content:`<div class="tv space-y-3">
          <div class="p-4 border-2 border-[#e31a1a] bg-[#e31a1a]/10 text-center">
            <div class="text-[#e31a1a] font-black text-lg uppercase tracking-wider blink">IRREVERSIBLE ACTION</div>
            <div class="text-sm mt-1 text-[#343a40]">All control rods will be fully inserted. Reactor shuts down immediately.</div>
          </div>
          <div class="tv text-[12px] text-[#6c757d] border border-[rgba(0,0,0,.08)] p-2">Unit: LFR-4G Unit 4 · User: ${S.role} · ${ts()}</div>
        </div>`,
        primary:'EXECUTE SCRAM', secondary:'ABORT',
        onConfirm: () => {
          dispatch('SCRAM');
          dispatch('ADD_ALARM',{alarm:{id:'SCRAM-MAN',p:1,tag:'SCRAM',msg:'Manual SCRAM engaged — all rods inserting',acked:false,ts:ts()}});
          ScenarioEngine.stop();
          showDemoBar('✅ MANUAL SCRAM EXECUTED — Reactor shutting down', '#159647');
        }
      });
    }
  }, showModal);

  // ── Safety: Emergency Depressurize (CMP-12) ──────────────────────────────
  bindGuardedButton('btn-depressurize', 'CMP-12', 'U', () => {
    showModal({
      icon:'warning', title:'Emergency Depressurize',
      content:'<p class="tv text-sm text-[#d97d06]">Opening Emergency Relief Valve ERV-01. This will depressurize the secondary circuit. Continue?</p>',
      primary:'CONFIRM', secondary:'CANCEL',
      onConfirm: () => {
        dispatch('LOG',{msg:'Emergency depressurization — ERV-01 opened'});
        dispatch('ADD_ALARM',{alarm:{id:'DEP-001',p:2,tag:'V-ERV-01',msg:'Emergency depressurization active',acked:false,ts:ts()}});
        addAIMessage('Depressurization confirmed. ERV-01 open. Secondary pressure reducing. Monitor primary pressure ΔP.');
      }
    });
  }, showModal);

  // ── Safety: Reset Interlocks (CMP-13) ─────────────────────────────────────
  bindGuardedButton('btn-reset-locks', 'CMP-13', 'U', () => {
    showModal({
      icon:'settings', title:'Reset Protection Interlocks',
      content:'<p class="tv text-sm text-[#343a40]">Reset all non-SCRAM interlocks to ARMED. Perform only after root cause confirmed.</p>',
      primary:'RESET INTERLOCKS', secondary:'CANCEL',
      onConfirm: ()=>dispatch('RESET_INTERLOCKS'),
    });
  }, showModal);

  // ── SIM RUN ──────────────────────────────────────────────────────
  document.getElementById('btn-run-sim')?.addEventListener('click', () => {
    dispatch('LOG',{msg:'Simulation cycle started — Politecnico Model v3.1'});
    const btn=document.getElementById('btn-run-sim');
    btn.textContent='RUNNING...'; btn.disabled=true;
    setTimeout(()=>{
      btn.textContent='SIM RUN'; btn.disabled=false;
      const ct=S.sensors.CORE_TEMP?.v||1045, pp=S.sensors.PRIM_PRESS?.v||215;
      showModal({
        icon:'check_circle', title:'Simulation Complete',
        content:`<div class="tv text-xs space-y-2">
          <div class="text-[#6c757d] text-[11px]">Politecnico LFR-Physics Model v3.1 · DAO: ${DAO.mode}</div>
          <div class="border border-[rgba(0,0,0,.08)] p-3 space-y-2">
            <div class="flex justify-between"><span class="text-[#6c757d]">Core Temp T+30m</span><span class="font-bold">${(ct+3.4).toFixed(1)} °C</span></div>
            <div class="flex justify-between"><span class="text-[#6c757d]">Pressure T+30m</span><span class="font-bold text-[#d97d06]">${(pp+13.5).toFixed(1)} PSI</span></div>
            <div class="flex justify-between"><span class="text-[#6c757d]">Neutron Flux</span><span class="font-bold">Stable</span></div>
            <div class="flex justify-between"><span class="text-[#6c757d]">Confidence</span><span class="font-bold text-[#159647]">96.2%</span></div>
          </div>
        </div>`,
      });
    }, 3000);
  });

  // ── AI Copilot ───────────────────────────────────────────────────
  document.getElementById('btn-ai-analyze').addEventListener('click', () => {
    dispatch('LOG',{msg:'AI analysis requested'});
    addAIMessage('Thermal analysis complete. Core temp within bounds. Recommend verifying Sub-Valve 04-B within T+5 min. No SCRAM action required at this time.');
    dispatch('NAVIGATE',{panel:'panel-ai'});
  });
  document.getElementById('btn-ai-query').addEventListener('click', handleAIQuery);
  document.getElementById('ai-query-input').addEventListener('keydown', e=>{ if(e.key==='Enter') handleAIQuery(); });
  bindGuardedButton('btn-auto-pilot', 'CMP-17', 'U', () => {
    dispatch('TOGGLE_AUTOPILOT');
    const btn=document.getElementById('btn-auto-pilot');
    if(S.autoPilot){ btn.textContent='⬛ Disable Auto-Pilot'; btn.style.color='#159647'; btn.style.borderColor='#15964733'; }
    else           { btn.textContent='Enable Auto-Pilot Mode'; btn.style.color=''; btn.style.borderColor=''; }
  }, showModal);

  // ── Diagnostics ──────────────────────────────────────────────────
  document.getElementById('diag-search').addEventListener('input', ()=>renderDiagnostics(S));
  document.getElementById('btn-diag-refresh').addEventListener('click', ()=>{ dispatch('LOG',{msg:'Diagnostics refreshed'}); renderDiagnostics(S); });
  bindGuardedButton('btn-diag-export', 'CMP-19', 'R', () => {
    const rows=[['Tag','Description','System','Value','Unit','Trip','Status']];
    Object.values(S.sensors).forEach(s=>rows.push([s.tag,s.label,s.sys,DAO.fmt(s),s.u,s.trip,DAO.status(s).toUpperCase()]));
    dlFile(rows.map(r=>r.join(',')).join('\n'),`sensors-${Date.now()}.csv`,'text/csv');
    dispatch('LOG',{msg:'Sensor data exported to CSV'});
  }, showModal);

  // ── Footer ───────────────────────────────────────────────────────
  document.getElementById('footer-protocol').addEventListener('click', ()=>{
    dispatch('LOG',{msg:'Protocol v4.2 accessed'});
    showModal({icon:'article',title:'Protocol v4.2',content:`<div class="tv text-xs text-[#343a40] space-y-2">
      <div>IAEA-LFR-PROT-2026 · Effective 2026-01-01</div>
      <div class="border border-[rgba(0,0,0,.08)] p-3 space-y-2">
        <div>§1 — HMI Authentication &amp; Role Separation</div>
        <div>§2 — Alarm Priority Classification (ISA-101)</div>
        <div>§3 — Digital Twin Synchronization</div>
        <div>§4 — DAO Physical/Simulated Handover</div>
        <div>§5 — Audit Trail &amp; Compliance</div>
        <div>§6 — Emergency Procedures</div>
      </div>
      <div class="text-[12px] text-[#e31a1a] mt-2">Classification: RESTRICTED</div>
    </div>`});
  });
  document.getElementById('footer-logs').addEventListener('click', ()=>dispatch('TOGGLE_AUDIT'));
  document.getElementById('footer-telemetry').addEventListener('click', ()=>{
    showModal({icon:'sensors',title:'Telemetry Node 08',content:`<div class="tv text-xs space-y-0">
      ${[['Node ID','TELM-NODE-08',''],['Status','ONLINE','#159647'],['Scan Rate','500ms',''],
         ['Latency','8ms','#159647'],['Sensors',String(Object.keys(S.sensors).length),''],
         ['DAO Mode',DAO.mode,'#343a40'],['Encryption','AES-512','']
      ].map(([k,v,c])=>`<div class="flex justify-between py-2 border-b border-[rgba(0,0,0,.06)]"><span class="text-[#6c757d]">${k}</span><span class="font-bold" style="${c?`color:${c}`:'color:#212529'}">${v}</span></div>`).join('')}
    </div>`});
  });
}
// ═══════════════════════════════════════════════════════════════════
export function addAIMessage(text, isUser=false) {
  const feed = document.getElementById('ai-feed');
  if (!feed) return;
  const div = document.createElement('div');
  div.className = 'flex gap-3 fade-in' + (isUser?' justify-end':'');
  if (isUser) {
    div.innerHTML = `<div class="bg-[#d1d6dc] p-3 border-r-2 border-[#495057] max-w-xs">
      <div class="tv text-[11px] text-[#6c757d] mb-1">${S.role||'OL'} — ${ts()}</div>
      <p class="tv text-xs font-medium text-[#212529]">${text}</p>
    </div>`;
  } else {
    // Colour-code based on severity keywords
    const isAlert = text.includes('🚨') || text.includes('CRITICAL') || text.includes('SCRAM');
    const isWarn  = text.includes('⚠') || text.includes('P2');
    const bdrCol  = isAlert ? '#e31a1a' : isWarn ? '#d97d06' : '#495057';
    div.innerHTML = `<div class="w-7 h-7 bg-[#d1d6dc] flex items-center justify-center flex-shrink-0">
      <span class="ms material-symbols-outlined text-[#343a40] text-[13px]" style="font-variation-settings:'FILL' 1">psychology</span>
    </div>
    <div class="flex-1 bg-[#e2e6ea] p-3 border-l-2" style="border-color:${bdrCol}">
      <div class="tv text-[11px] text-[#6c757d] mb-1">AI COPILOT — ${ts()}</div>
      <p class="tv text-xs text-[#212529]">${text}</p>
    </div>`;
  }
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

const AI_RESPONSES = [
  v=>`Analysis complete for "${v}". All primary circuit parameters within operational bounds. Politecnico model projects stable conditions for T+30 minutes at current trajectory.`,
  v=>`Query processed: "${v}". Physics model v3.1 indicates ${(Math.random()*2).toFixed(1)}% deviation from baseline — within ±5% tolerance. No corrective action required.`,
  v=>`Advisory for "${v}": nominal performance confirmed. Continue monitoring per SCCP-74A. Next checkpoint in T+15 minutes.`,
  v=>`Predictive analysis: "${v}" — parameters trending within safe limits. Core temperature stable at current rod position.`,
];

function handleAIQuery() {
  const inp = document.getElementById('ai-query-input');
  const q = inp.value.trim(); if (!q) return;
  addAIMessage(q, true); inp.value = '';
  dispatch('LOG',{msg:`AI query: "${q}"`});
  setTimeout(()=>addAIMessage(AI_RESPONSES[Math.floor(Math.random()*AI_RESPONSES.length)](q)), 500+Math.random()*900);
}
// ═══════════════════════════════════════════════════════════════════
export function startClock() {
  const el = document.getElementById('utc-clock');
  (function tick() {
    if (el) {
      const n=new Date();
      el.textContent=`${p2(n.getUTCHours())}:${p2(n.getUTCMinutes())}:${p2(n.getUTCSeconds())}:${p3(n.getUTCMilliseconds())} UTC`;
    }
    requestAnimationFrame(tick);
  })();
}

// ── Session Timeout (NUREG-0700 §6.5 — 15 min inactivity) ───────────
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const TIMEOUT_WARN_MS = 1 * 60 * 1000; // warn at 1 min remaining
let _sessionTimer = null;
let _sessionWarnShown = false;

export function resetSessionTimer() {
  if (!S.role) return;  // only active when logged in
  _sessionWarnShown = false;
  if (_sessionTimer) clearTimeout(_sessionTimer);
  _sessionTimer = setTimeout(() => {
    console.warn('[SESSION] Timeout — logging out');
    ScenarioEngine.stop();
    setS();
    document.getElementById('role-overlay').style.display = 'flex';
    if (window.RBACContext) RBACContext.clear();
    const navCyber = document.getElementById('nav-cyber');
    if (navCyber) navCyber.style.display = 'none';
    scheduleRender();
  }, SESSION_TIMEOUT_MS);
}

export function startDataLoop() {
  setInterval(() => {
    if (!S.role) return;
    DAO.tick(S.scramActive);
    setS();

    // Flush RTN log entries from DAO
    while (DAO._rtnQueue && DAO._rtnQueue.length > 0) {
      setS();
    }

    // Session timeout warning (1 min before logout)
    if (S.lastActivity && !_sessionWarnShown) {
      const idleMs = Date.now() - S.lastActivity;
      if (idleMs > SESSION_TIMEOUT_MS - TIMEOUT_WARN_MS) {
        _sessionWarnShown = true;
        showModal({
          icon: 'timer',
          title: 'Session Timeout Warning',
          content: '<p class="tv text-sm text-[#d97d06]">Your session will automatically log out in 1 minute due to inactivity. Click STAY LOGGED IN to continue.</p>',
          primary: 'STAY LOGGED IN',
          onConfirm: () => { dispatch('TOUCH_ACTIVITY'); resetSessionTimer(); }
        });
      }
    }

    // Auto-alarm: core temp high (only outside scenario to avoid duplicates)
    const ct = S.sensors.CORE_TEMP?.v ?? 0;
    if (ct > 1150 && !S.alarms.find(a=>a.id==='A-CT-HI') && !ScenarioEngine.active) {
      setS();
    }

    // Update exception alert in primary panel copilot
    if (S.sensors.PRIM_PRESS) {
      const delta = (S.sensors.PRIM_PRESS.v - 214.8).toFixed(1);
      const sign = delta > 0 ? '+' : '';
      setText('copilot-delta', `${sign}${delta} PSI`);
    }

    scheduleRender();
  }, 800);
}