// ==========================================
// MVI + DAO ARCHITECTURE FOR INREBUS HMI
// ==========================================

// --- 1. DAO Layer (Data Access Object) ---
// Abstracts simulated physics models and fake physical sensors
const DAO = {
    _state: {
        coreTemp: 600.0, // Celsius
        coolantFlow: 100.0, // %
        pressure: 15.0, // MPa
        rodsPosition: 50.0 // % 
    },
    
    // Simulate real-time physical/physics changes
    tick() {
        // Temperature logic based on rods
        const targetTemp = 400 + (100 - this._state.rodsPosition) * 4;
        this._state.coreTemp += (targetTemp - this._state.coreTemp) * 0.05 + (Math.random() - 0.5) * 2;
        
        // Pressure tied to temp
        this._state.pressure = 10 + (this._state.coreTemp - 400) * 0.01 + (Math.random() - 0.5) * 0.1;
        
        // Flow fluctuation
        this._state.coolantFlow += (Math.random() - 0.5) * 0.5;
        this._state.coolantFlow = Math.max(0, Math.min(120, this._state.coolantFlow));
    },

    getTelemetry() {
        return { ...this._state };
    },

    setRods(val) {
        this._state.rodsPosition = Math.max(0, Math.min(100, val));
    },
    
    triggerScram() {
        this.setRods(100); // Fully insert rods
    },
    
    triggerDepressurize() {
        this._state.pressure = Math.max(1.0, this._state.pressure - 5.0);
    }
};

// --- 2. State Management (Model in MVI) ---
const AppState = {
    role: null, // 'OL', 'OD', 'AS'
    activeMFE: 'mfe-reactor',
    telemetry: DAO.getTelemetry(),
    alarms: [],
    auditLog: [],
    history: {
        temp: Array(50).fill(600)
    },
    uiContext: {
        auditPanelOpen: false,
        cameraMode: 'persp' // 'persp' or 'ortho'
    }
};

// --- 3. Intent Dispacher (Intent in MVI) ---
const Dispatcher = {
    dispatch(action, payload) {
        const timestamp = new Date().toISOString();
        let logEvent = null;

        switch (action) {
            case 'SET_ROLE':
                AppState.role = payload;
                logEvent = `User authenticated as ${payload}`;
                break;
            case 'NAVIGATE':
                AppState.activeMFE = payload;
                logEvent = `Navigated to ${payload}`;
                break;
            case 'SET_RODS':
                DAO.setRods(payload);
                logEvent = `Control rods adjusted to ${payload}%`;
                break;
            case 'SCRAM':
                DAO.triggerScram();
                logEvent = `MANUAL SCRAM INITIATED`;
                this.addAlarm('P1', 'MANUAL SCRAM TRIPPED', timestamp);
                break;
            case 'DEPRESSURIZE':
                DAO.triggerDepressurize();
                logEvent = `EMERGENCY DEPRESSURIZATION TRIGGERED`;
                this.addAlarm('P2', 'DEPRESSURIZATION ACTIVE', timestamp);
                break;
            case 'TOGGLE_AUDIT':
                AppState.uiContext.auditPanelOpen = !AppState.uiContext.auditPanelOpen;
                break;
            case 'TOGGLE_CAMERA':
                AppState.uiContext.cameraMode = AppState.uiContext.cameraMode === 'persp' ? 'ortho' : 'persp';
                if(window.threeApp) window.threeApp.setCamera(AppState.uiContext.cameraMode);
                break;
            case 'TICK':
                DAO.tick();
                AppState.telemetry = DAO.getTelemetry();
                
                // Update history
                AppState.history.temp.push(AppState.telemetry.coreTemp);
                if(AppState.history.temp.length > 50) AppState.history.temp.shift();
                
                // Auto alarms
                this.checkAutomatedAlarms(timestamp);
                break;
            case 'AI_QUERY':
                logEvent = `AI Query: ${payload}`;
                setTimeout(() => {
                    View.addAiResponse(`Analyzed query: "${payload}". All parameters within operational limits. No deviation detected in secondary loop.`);
                }, 800);
                break;
        }

        if (logEvent) {
            const entry = `[${timestamp.split('T')[1].split('.')[0]}] [${AppState.role || 'SYS'}] ${logEvent}`;
            AppState.auditLog.unshift(entry);
        }

        // Render pass
        View.render();
    },

    addAlarm(priority, message, time) {
        AppState.alarms = [{priority, message, time}, ...AppState.alarms.slice(0, 4)];
        Dispatcher.dispatch('ALARM_TRIGGERED', null); // just trigger loop
    },

    checkAutomatedAlarms(time) {
        if (AppState.telemetry.coreTemp > 800) {
            const exists = AppState.alarms.find(a => a.message === 'HIGH CORE TEMP');
            if(!exists) this.addAlarm('P1', 'HIGH CORE TEMP', time);
        }
        if (AppState.telemetry.pressure > 25) {
            const exists = AppState.alarms.find(a => a.message === 'HIGH PRESSURE');
            if(!exists) this.addAlarm('P2', 'HIGH PRESSURE', time);
        }
    }
};

// --- 4. View Rendering Layer (View in MVI) ---
const View = {
    init() {
        this.bindEvents();
        this.initThreeJS();
        this.startLoop();
        this.render();
    },

    bindEvents() {
        // Role Selection
        document.querySelectorAll('.role-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const role = e.target.getAttribute('data-role');
                document.getElementById('role-selector').classList.add('hidden');
                Dispatcher.dispatch('SET_ROLE', role);
            });
        });

        // Navigation
        document.querySelectorAll('.nav-top, .nav-side').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-target');
                if (target) {
                    Dispatcher.dispatch('NAVIGATE', target);
                }
                
                // Visual toggle logic
                if (btn.classList.contains('nav-side')) {
                    document.querySelectorAll('.nav-side').forEach(b => {
                        b.classList.remove('active', 'bg-surface', 'border-accent');
                        b.classList.add('text-text_secondary', 'border-transparent');
                    });
                    btn.classList.remove('text-text_secondary', 'border-transparent');
                    btn.classList.add('active', 'bg-surface', 'border-accent');
                } else if (btn.classList.contains('nav-top')) {
                    document.querySelectorAll('.nav-top').forEach(b => {
                        b.classList.remove('active', 'border-accent');
                        b.classList.add('border-transparent', 'text-text_secondary');
                    });
                    btn.classList.remove('border-transparent', 'text-text_secondary');
                    btn.classList.add('active', 'border-accent');
                }
            });
        });

        // Audit Panel
        document.getElementById('btn-audit').addEventListener('click', () => Dispatcher.dispatch('TOGGLE_AUDIT'));
        document.getElementById('btn-audit-close').addEventListener('click', () => Dispatcher.dispatch('TOGGLE_AUDIT'));
        document.getElementById('btn-export-log').addEventListener('click', () => {
             const csvContent = "data:text/csv;charset=utf-8," + AppState.auditLog.join("\n");
             const encodedUri = encodeURI(csvContent);
             window.open(encodedUri);
        });

        // Controls
        const rodCtrl = document.getElementById('rod-control');
        rodCtrl.addEventListener('input', (e) => {
            document.getElementById('rod-val').innerText = `${e.target.value}%`;
            Dispatcher.dispatch('SET_RODS', parseFloat(e.target.value));
        });

        // Modal Action Helpers
        const bindModal = (btnId, title, content, onConfirm) => {
             const btn = document.getElementById(btnId);
             if(!btn) return;
             btn.addEventListener('click', () => {
                 document.getElementById('modal-title').innerText = title;
                 document.getElementById('modal-content').innerHTML = content;
                 document.getElementById('modal-container').classList.remove('hidden');
                 
                 const confirmBtn = document.getElementById('modal-btn-confirm');
                 const cancelBtn = document.getElementById('modal-btn-cancel');
                 
                 const cleanup = () => {
                     document.getElementById('modal-container').classList.add('hidden');
                     confirmBtn.replaceWith(confirmBtn.cloneNode(true));
                     cancelBtn.replaceWith(cancelBtn.cloneNode(true));
                 };

                 cancelBtn.onclick = cleanup;
                 confirmBtn.onclick = () => {
                     if (onConfirm) onConfirm();
                     cleanup();
                 };
             });
        };

        bindModal('btn-scram', 'Confirm SCRAM', '<p class="text-alarm_p1 font-bold">WARNING: INITIATING MANUAL REACTOR SCRAM.</p><p>This will fully insert all control rods.</p>', () => Dispatcher.dispatch('SCRAM'));
        bindModal('btn-depressurize', 'Confirm Depressurization', '<p class="text-alarm_p2 font-bold">WARNING: EMERGENCY DEPRESSURIZATION.</p>', () => Dispatcher.dispatch('DEPRESSURIZE'));
        bindModal('btn-logout', 'Terminate Session', 'Transfer authority to standby console?', () => location.reload());
        bindModal('btn-settings', 'System Configuration', 'Adjust global settings? (Admin only)<br>Note: In this demo, settings changes are transient.', () => alert('Config saved.'));

        // Camera toggle
        document.getElementById('btn-camera-toggle').addEventListener('click', () => Dispatcher.dispatch('TOGGLE_CAMERA'));

        // AI Input
        document.getElementById('btn-ai-send').addEventListener('click', () => {
            const val = document.getElementById('ai-input').value;
            if(val) {
                Dispatcher.dispatch('AI_QUERY', val);
                document.getElementById('ai-input').value = '';
            }
        });
    },

    render() {
        // 1. Role Gating (ISA-101 MFE isolation)
        document.querySelectorAll('.role-gated').forEach(el => {
            const allowed = el.getAttribute('data-allowed').split(',');
            if (AppState.role && allowed.includes(AppState.role)) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });

        if(AppState.role) {
            document.getElementById('current-role-display').innerText = `ROLE: ${AppState.role}`;
        }

        // 2. Routing Views (MFE Container Mux)
        document.querySelectorAll('.mfe-container').forEach(el => {
            if (el.id === AppState.activeMFE) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        // 3. Telemetry binds
        document.getElementById('ui-core-temp').innerText = AppState.telemetry.coreTemp.toFixed(1);
        
        // Update range slider state out-of-band to prevent jank
        document.getElementById('rod-control').value = AppState.telemetry.rodsPosition;
        document.getElementById('rod-val').innerText = `${AppState.telemetry.rodsPosition.toFixed(0)}%`;
        
        // 4. Update predictive chart (SVG path generation)
        this.renderChart();

        // 5. Update Sensor Table if in view
        if (AppState.activeMFE === 'mfe-secondary') {
             this.renderSensorTable();
        }

        // 6. Audit Panel State
        const auditPanel = document.getElementById('audit-panel');
        if (AppState.uiContext.auditPanelOpen) {
            auditPanel.classList.remove('translate-x-full');
        } else {
            auditPanel.classList.add('translate-x-full');
        }

        // 7. Audit Content
        document.getElementById('audit-log-content').innerHTML = AppState.auditLog.map(l => `<div>${l}</div>`).join('');

        // 8. Alarm Banner Update
        const banner = document.getElementById('mfe-alarm-banner');
        if (AppState.alarms.length > 0) {
            banner.classList.remove('hidden');
            const latest = AppState.alarms[0];
            let bgColor = '';
            if(latest.priority === 'P1') bgColor = 'bg-alarm_p1 text-white';
            else if(latest.priority === 'P2') bgColor = 'bg-alarm_p2 text-text_primary';
            else if(latest.priority === 'P3') bgColor = 'bg-alarm_p3 text-text_primary';
            
            banner.className = `w-full border-b border-border h-10 flex items-center justify-between px-4 z-50 ${bgColor}`;
            document.getElementById('alarm-marquee').innerText = `[${latest.priority}] ${latest.message} - ${latest.time}`;
        } else {
            banner.classList.add('hidden');
        }
    },

    renderChart() {
        const svg = document.getElementById('predictive-chart');
        if(!svg) return;
        
        const h = AppState.history.temp;
        const maxData = 1000;
        const minData = 200;
        
        // Map data to 0-100 coords
        let points = h.map((val, i) => {
            const x = (i / 49) * 50; // Use left 50% for history
            const y = 100 - ((val - minData) / (maxData - minData)) * 100;
            return `${x},${y}`;
        }).join(' ');

        // Prediction points (Ghosting dashed line)
        const currentTemp = h[h.length-1];
        const predRods = AppState.telemetry.rodsPosition;
        const predTarget = 400 + (100 - predRods) * 4;
        let predPoints = `${50},${100 - ((currentTemp - minData)/(maxData-minData))*100} `;
        
        let tempSim = currentTemp;
        for(let i=1; i<=20; i++) {
            tempSim += (predTarget - tempSim) * 0.05;
            const x = 50 + (i/20) * 50;
            const y = 100 - ((tempSim - minData) / (maxData - minData)) * 100;
            predPoints += `${x},${y} `;
        }

        // Trip limit line (P1 = 800)
        const tripY = 100 - ((800 - minData)/(maxData - minData))*100;

        const pathHTML = `
            <!-- Trip Limit Red Line -->
            <line x1="0" y1="${tripY}" x2="100" y2="${tripY}" stroke="#ff0000" stroke-width="0.5"/>
            <!-- Historical Solid Line -->
            <polyline points="${points}" fill="none" stroke="#2a2a2a" stroke-width="1" />
            <!-- Predicted Dashed Line -->
            <polyline points="${predPoints}" fill="none" stroke="#555555" stroke-width="1" stroke-dasharray="2,2" />
        `;
        svg.innerHTML = pathHTML;
    },

    renderSensorTable() {
         const tb = document.getElementById('sensor-table-body');
         if(!tb) return;
         
         const t = AppState.telemetry;
         tb.innerHTML = `
             <tr class="border-b border-border hover:bg-border">
                 <td class="p-2">PT-101</td><td class="p-2">Coolant Pressure</td><td class="p-2">${t.pressure.toFixed(2)}</td><td class="p-2">MPa</td><td class="p-2 ${t.pressure > 25 ? 'text-alarm_p1' : 'text-green-700'}">${t.pressure > 25 ? 'HIGH' : 'OK'}</td>
             </tr>
             <tr class="border-b border-border hover:bg-border">
                 <td class="p-2">FT-201</td><td class="p-2">Coolant Flow</td><td class="p-2">${t.coolantFlow.toFixed(1)}</td><td class="p-2">%</td><td class="p-2 text-green-700">OK</td>
             </tr>
             <tr class="border-b border-border hover:bg-border ${t.rodsPosition > 90 ? 'bg-alarm_p2 bg-opacity-20' : ''}">
                 <td class="p-2">ZP-301</td><td class="p-2">Rod Bank Pos</td><td class="p-2">${t.rodsPosition.toFixed(1)}</td><td class="p-2">%</td><td class="p-2">OK</td>
             </tr>
         `;
    },

    addAiResponse(text) {
        const log = document.getElementById('ai-chat');
        if(log) {
            log.innerHTML += `<div class="bg-border p-2 self-end text-right border-border mb-2">${text}</div>`;
            log.scrollTop = log.scrollHeight;
        }
    },

    startLoop() {
        const updateClock = () => {
            const now = new Date();
            const timeStr = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}:${String(now.getUTCSeconds()).padStart(2,'0')}:${String(now.getUTCMilliseconds()).padStart(3,'0')} UTC`;
            document.getElementById('utc-clock').innerText = timeStr;
            requestAnimationFrame(updateClock);
        };
        updateClock();

        setInterval(() => {
            Dispatcher.dispatch('TICK', null);
            // Simulate AI feed 
            if(Math.random() > 0.8) {
                const feed = document.getElementById('ai-feed');
                if(feed) {
                     feed.innerHTML = `<div class="mb-1 text-text_secondary">[AI] Core thermal distribution ∆T: ${(Math.random() > 0.5 ? '+' : '-')}${(Math.random()*2).toFixed(2)}K/min - BOUNDS NOMINAL</div>` + feed.innerHTML;
                }
            }
        }, 1000);
    },

    initThreeJS() {
        const container = document.getElementById('three-container');
        if (!container || !window.THREE) return;

        const scene = new THREE.Scene();
        scene.background = null;

        const aspect = container.clientWidth / container.clientHeight;
        const perspCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        perspCamera.position.set(0, 15, 30);
        perspCamera.lookAt(0, 0, 0);

        const d = 15;
        const orthoCamera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
        orthoCamera.position.set(0, 15, 30);
        orthoCamera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);

        const coreGroup = new THREE.Group();
        scene.add(coreGroup);

        // Geometries
        const innerGeo = new THREE.CylinderGeometry(4, 4, 16, 32);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.2 });
        coreGroup.add(new THREE.Mesh(innerGeo, innerMat));

        const outerGeo = new THREE.CylinderGeometry(5, 5, 18, 16, 8);
        const outerMat = new THREE.MeshBasicMaterial({ color: 0x222222, wireframe: true, transparent: true, opacity: 0.8 });
        coreGroup.add(new THREE.Mesh(outerGeo, outerMat));

        // Control Rods
        const rodMeshes = [];
        for (let i = 0; i < 8; i++) {
            const rodGeo = new THREE.CylinderGeometry(0.2, 0.2, 16, 8);
            const rodMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const rod = new THREE.Mesh(rodGeo, rodMat);
            const angle = (i / 8) * Math.PI * 2;
            rod.position.x = Math.cos(angle) * 3;
            rod.position.z = Math.sin(angle) * 3;
            coreGroup.add(rod);
            rodMeshes.push(rod);
        }

        window.threeApp = {
            setCamera: (mode) => {
               this.activeCam = mode === 'persp' ? perspCamera : orthoCamera;
            },
            activeCam: perspCamera
        };

        const animate = () => {
            requestAnimationFrame(animate);
            coreGroup.rotation.y += 0.005;
            
            // Sync rods visual to state (100 = fully inserted = y=0, 0 = withdrawn = y=8)
            const rodY = (100 - AppState.telemetry.rodsPosition) / 100 * 8;
            rodMeshes.forEach(r => r.position.y = rodY);

            renderer.render(scene, window.threeApp.activeCam);
        };
        animate();
        
        window.addEventListener('resize', () => {
            if (container) {
                const w = container.clientWidth;
                const h = container.clientHeight;
                perspCamera.aspect = w / h;
                perspCamera.updateProjectionMatrix();
                
                const d = 15;
                orthoCamera.left = -d * (w/h);
                orthoCamera.right = d * (w/h);
                orthoCamera.updateProjectionMatrix();
                
                renderer.setSize(w, h);
            }
        });
    }
};

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    View.init();
});
