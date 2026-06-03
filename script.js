/* ═══════════════════════════════════════════════════════════
   SSI TSSS · TO14 · SNIM — script.js v2.0
   Updated: Solution Relais 24V DC intégrée dans simulation
   Budget: 403 148 MRU · Variables: %M521–%M549 (29 EBOOL)
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ─── ZONES DATA ───────────────────────────────────────────
const ZONES = [
  { id: 1, name: 'Salle Opérateur',        det: 1,  surf: '27,6 m²', risk: 'Courts-circuits postes informatiques', var: '%M521', out: '%M529' },
  { id: 2, name: 'Salle Batterie',          det: 2,  surf: '25 m²',   risk: 'Emballement thermique / dégagement H₂', var: '%M522', out: '%M530' },
  { id: 3, name: 'Salle Automates',         det: 3,  surf: '45 m²',   risk: 'Défaut isolement cartes E/S automate',  var: '%M523', out: '%M531' },
  { id: 4, name: 'Tableaux MT 5,5kV',       det: 5,  surf: '80 m²',   risk: 'Arc électrique interne, fuite SF6',     var: '%M524', out: '%M532' },
  { id: 5, name: 'Tableaux MCC/CCM',        det: 8,  surf: '120 m²',  risk: 'Surcharge, échauffement câbles BT',     var: '%M525', out: '%M533' },
  { id: 6, name: 'Armoires Cos φ',          det: 5,  surf: '70 m²',   risk: 'Éclatement condensateurs sous surtension', var: '%M526', out: '%M534' },
  { id: 7, name: 'Salle Transformateurs',   det: 4,  surf: '132 m²',  risk: 'Échauffement enroulements en surcharge', var: '%M527', out: '%M535' },
  { id: 8, name: 'Salle Câbles (Sous-sol)', det: 8,  surf: '251 m²',  risk: 'Propagation rapide par câbles PVC',     var: '%M528', out: '%M537' },
];

// ─── STATE ────────────────────────────────────────────────
const state = {
  activeAlarms:  new Set(),     // zones currently in alarm
  acknowledged:  new Set(),     // zones acknowledged (%M548 action)
  derangement:   false,         // %M546
  sirenActive:   false,         // %M538/%M539/%M540
  timerIds:      {},            // zone timers
  alarmLog:      [],            // full alarm history
  variables:     {},            // EBOOL live states
};

// Init all 29 variables to 0
function initVars() {
  for (let i = 521; i <= 549; i++) state.variables[`%M${i}`] = 0;
}
initVars();

// ─── CLOCK ────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const s = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const el = document.getElementById('ihmClock');
  if (el) el.textContent = s;
}
setInterval(updateClock, 1000);
updateClock();

// ─── LOG ──────────────────────────────────────────────────
function addLog(msg, type = 'info') {
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const date = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;
  const entry = { msg, type, time, date };
  state.alarmLog.unshift(entry);

  const logBody = document.getElementById('ihmLog');
  if (!logBody) return;
  const div = document.createElement('div');
  div.className = `log-entry ${type}-log`;
  div.innerHTML = `<span class="log-time">${time}</span><span>${msg}</span>`;
  logBody.insertBefore(div, logBody.firstChild);
  if (logBody.children.length > 40) logBody.removeChild(logBody.lastChild);
}

// ─── RENDER ZONES PANEL ───────────────────────────────────
function renderZonesGrid() {
  const grid = document.getElementById('zonesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ZONES.forEach(z => {
    const card = document.createElement('div');
    card.className = 'zone-card';
    card.id = `zone-card-${z.id}`;
    card.innerHTML = `
      <div class="zc-num">Z${z.id}</div>
      <div class="zc-info">
        <div class="zc-name">${z.name}</div>
        <div class="zc-det">${z.det} dét. · ${z.surf} · ${z.var}</div>
      </div>
      <div class="zc-controls">
        <span class="zc-led" id="zled-${z.id}"></span>
        <button class="zc-btn" id="zbtn-${z.id}" onclick="triggerZone(${z.id})">Déclencher</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ─── RENDER IHM VOYANTS ───────────────────────────────────
function renderIhmVoyants() {
  const container = document.getElementById('ihmVoyants');
  if (!container) return;
  container.innerHTML = '';
  ZONES.forEach(z => {
    const div = document.createElement('div');
    div.className = 'ihm-voyant';
    div.id = `ihm-voyant-${z.id}`;
    div.innerHTML = `
      <div class="iv-led" id="iv-led-${z.id}"></div>
      <div class="iv-label">Z${z.id}</div>
      <div class="iv-var">${z.var}</div>
    `;
    container.appendChild(div);
  });
}

// ─── RENDER LADDER VARS ───────────────────────────────────
function renderLadderVars() {
  const grid = document.getElementById('lvGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const vars = [
    { addr: '%M521', sym: 'In_zone1' }, { addr: '%M522', sym: 'In_zone2' },
    { addr: '%M523', sym: 'In_zone3' }, { addr: '%M524', sym: 'In_zone4' },
    { addr: '%M529', sym: 'Out_zone1' }, { addr: '%M530', sym: 'Out_zone2' },
    { addr: '%M538', sym: 'Sir_etage1' }, { addr: '%M544', sym: 'In_al_feu' },
    { addr: '%M545', sym: 'Out_al_feu' }, { addr: '%M546', sym: 'In_derang' },
    { addr: '%M548', sym: 'In_acquit' }, { addr: '%M549', sym: 'Out_acquit' },
  ];
  vars.forEach(v => {
    const div = document.createElement('div');
    div.className = 'lv-item';
    div.id = `lv-${v.addr.replace('%','').replace('M','')}`;
    div.innerHTML = `<span class="lv-dot" id="lvdot-${v.addr.replace('%','').replace('M','')}"></span><span class="lv-addr">${v.addr}</span><span class="lv-sym">${v.sym}</span>`;
    grid.appendChild(div);
  });
}

// ─── UPDATE VARIABLE DISPLAY ──────────────────────────────
function setVar(addr, val) {
  state.variables[addr] = val;
  const num = addr.replace('%M','');
  const dot = document.getElementById(`lvdot-${num}`);
  const item = document.getElementById(`lv-${num}`);
  if (!dot) return;
  if (val) {
    dot.className = 'lv-dot on';
    if (item) item.classList.add('active');
  } else {
    dot.className = 'lv-dot';
    if (item) { item.classList.remove('active'); item.classList.remove('alarm'); }
  }
}
function setVarAlarm(addr) {
  state.variables[addr] = 1;
  const num = addr.replace('%M','');
  const dot = document.getElementById(`lvdot-${num}`);
  const item = document.getElementById(`lv-${num}`);
  if (dot) dot.className = 'lv-dot alarm';
  if (item) item.classList.add('alarm');
}

// ─── RELAIS ANIMATION ─────────────────────────────────────
function animateRelais(zoneId, phase) {
  // phase: 'normal' | 'heating' | 'triggered' | 'reset'
  const detBody = document.getElementById('detectorBody');
  const detTemp = document.getElementById('detTemp');
  const detStatus = document.getElementById('detStatus');
  const termR = document.getElementById('termR');
  const termL = document.getElementById('termL');
  const wireA1 = document.getElementById('wireA1');
  const wireA2 = document.getElementById('wireA2');
  const coilBody = document.getElementById('coilBody');
  const coilState = document.getElementById('coilState');
  const contactState = document.getElementById('contactState');
  const logicNormal = document.getElementById('logicNormal');
  const logicAlarm = document.getElementById('logicAlarm');
  const logicFailsafe = document.getElementById('logicFailsafe');

  if (!detBody) return;

  if (phase === 'normal') {
    detBody.className = 'det-body';
    if (detTemp) detTemp.textContent = '~20°C';
    if (detStatus) { detStatus.textContent = 'VEILLE'; detStatus.className = 'det-status'; }
    if (termR) termR.className = 'terminal';
    if (termL) termL.className = 'terminal';
    if (wireA1) wireA1.className = 'wire-line';
    if (wireA2) wireA2.className = 'wire-line';
    if (coilBody) coilBody.className = 'coil-body';
    if (coilState) { coilState.textContent = 'ACTIVÉ'; coilState.className = 'coil-state'; }
    if (contactState) { contactState.textContent = 'OUVERT → %M = 0'; contactState.className = 'contact-state'; }
    if (logicNormal) logicNormal.classList.add('active-row');
    if (logicAlarm) logicAlarm.classList.remove('active-row');
    if (logicFailsafe) logicFailsafe.classList.remove('active-row');
  }

  if (phase === 'heating') {
    // Simulate temperature rising
    let temp = 20;
    const interval = setInterval(() => {
      temp += Math.floor(Math.random() * 8) + 4;
      if (detTemp) detTemp.textContent = `~${temp}°C`;
      if (temp >= 65) {
        clearInterval(interval);
        animateRelais(zoneId, 'triggered');
      }
    }, 150);
  }

  if (phase === 'triggered') {
    detBody.className = 'det-body triggered';
    if (detTemp) detTemp.textContent = '65°C ⚡';
    if (detStatus) { detStatus.textContent = 'ALARME'; detStatus.className = 'det-status alarm'; }
    if (termR) termR.className = 'terminal active';
    if (termL) termL.className = 'terminal active';
    if (wireA1) wireA1.className = 'wire-line active';
    if (wireA2) wireA2.className = 'wire-line active';
    if (coilBody) coilBody.className = 'coil-body triggered';
    if (coilState) { coilState.textContent = 'DÉSACTIVÉ'; coilState.className = 'coil-state deactivated'; }
    if (contactState) { contactState.textContent = 'FERMÉ → %M = 1'; contactState.className = 'contact-state closed'; }
    if (logicNormal) logicNormal.classList.remove('active-row');
    if (logicAlarm) logicAlarm.classList.add('active-row');
    if (logicFailsafe) logicFailsafe.classList.add('active-row');
    addLog(`Relais Z${zoneId} : courant boucle chute → contact NO fermé → ${ZONES[zoneId-1].var} = 1`, 'relais');
  }

  if (phase === 'reset') {
    animateRelais(zoneId, 'normal');
  }
}

// ─── TRIGGER ZONE ─────────────────────────────────────────
window.triggerZone = function(id) {
  if (state.derangement) {
    addLog(`Zone Z${id} : déclenchement bloqué par dérangement actif (%M546=1)`, 'derang');
    return;
  }
  if (state.activeAlarms.has(id)) return;

  const zone = ZONES[id - 1];
  addLog(`Zone Z${id} (${zone.name}) : détecteur A1R déclenche — Temp ≥ 65°C`, 'alarm');
  addLog(`Séquence : relais 24V DC → ${zone.var} → temporisateur F_ton (10s)`, 'relais');

  // Start relay animation
  animateRelais(id, 'heating');

  // Delay 10s (simulated as 2s for demo)
  const timerId = setTimeout(() => {
    if (!state.activeAlarms.has(id)) {
      activateAlarm(id);
    }
  }, 2000);
  state.timerIds[id] = timerId;

  // Visual: zone card timing state
  const card = document.getElementById(`zone-card-${id}`);
  const btn = document.getElementById(`zbtn-${id}`);
  const led = document.getElementById(`zled-${id}`);
  if (card) card.classList.add('alarming');
  if (btn) { btn.textContent = '⏱ 10s...'; btn.disabled = true; }
  if (led) led.className = 'zc-led'; // orange before alarm

  setVarAlarm(zone.var);
  updateLadder(id, 'timer');
};

// ─── ACTIVATE ALARM ───────────────────────────────────────
function activateAlarm(id) {
  state.activeAlarms.add(id);
  const zone = ZONES[id - 1];

  setVarAlarm(zone.var);
  setVarAlarm(zone.out);

  // Zone card UI
  const card = document.getElementById(`zone-card-${id}`);
  const btn = document.getElementById(`zbtn-${id}`);
  const led = document.getElementById(`zled-${id}`);
  if (card) { card.classList.remove('alarming'); card.classList.add('active'); }
  if (btn) { btn.textContent = 'Reset Z'; btn.disabled = false; btn.className = 'zc-btn reset'; btn.onclick = () => resetZone(id); }
  if (led) led.className = 'zc-led red';

  // IHM voyant
  const ihmV = document.getElementById(`ihm-voyant-${id}`);
  const ivLed = document.getElementById(`iv-led-${id}`);
  if (ihmV) ihmV.classList.add('alarming');
  if (ivLed) ivLed.className = 'iv-led red';

  // Global alarm (%M544, %M545)
  setVarAlarm('%M544');
  setVarAlarm('%M545');
  const ledAlarm = document.getElementById('ledAlarm');
  const gAlarm = document.getElementById('gAlarm');
  if (ledAlarm) ledAlarm.className = 'global-led green';
  if (gAlarm) gAlarm.classList.add('active-green');

  // Siren
  activateSiren();

  // Centrale status
  const cs = document.getElementById('centraleStatus');
  const cvAlFeu = document.getElementById('cvAlFeu');
  if (cs) { cs.textContent = `ALARME FEU — ZONE ${id} — ${zone.name.toUpperCase()}\nZ${id}-DÉTECTÉ-Z${id}-D1`; cs.className = 'centrale-status alarm'; }
  if (cvAlFeu) cvAlFeu.className = 'cv-led red';

  // Nav status
  const navStatus = document.getElementById('navStatus');
  if (navStatus) { navStatus.textContent = 'ALARME FEU'; navStatus.className = 'nav-status alarm'; }

  // Siren banner
  const sirenBanner = document.getElementById('sirenBanner');
  if (sirenBanner) sirenBanner.classList.add('active');

  // Ladder
  updateLadder(id, 'alarm');
  animateRelais(id, 'triggered');

  addLog(`ALARME CONFIRMÉE Z${id} : ${zone.out}=1 — Sirènes activées (%M538/%M539/%M540)`, 'alarm');
  addLog(`${zone.var} → Out_zone${id}=${zone.out} — Séquence mise en sécurité déclenchée`, 'relais');
}

// ─── SIREN ────────────────────────────────────────────────
function activateSiren() {
  if (!state.sirenActive) {
    state.sirenActive = true;
    setVarAlarm('%M538'); setVarAlarm('%M539'); setVarAlarm('%M540');
    addLog('Sirènes activées : %M538 / %M539 / %M540 = 1', 'alarm');
  }
}
function deactivateSiren() {
  state.sirenActive = false;
  setVar('%M538', 0); setVar('%M539', 0); setVar('%M540', 0);
}

// ─── RESET ZONE ───────────────────────────────────────────
window.resetZone = function(id) {
  state.activeAlarms.delete(id);
  clearTimeout(state.timerIds[id]);
  const zone = ZONES[id - 1];

  setVar(zone.var, 0); setVar(zone.out, 0);

  const card = document.getElementById(`zone-card-${id}`);
  const btn = document.getElementById(`zbtn-${id}`);
  const led = document.getElementById(`zled-${id}`);
  if (card) { card.classList.remove('active', 'alarming'); }
  if (btn) { btn.textContent = 'Déclencher'; btn.disabled = false; btn.className = 'zc-btn'; btn.onclick = () => triggerZone(id); }
  if (led) led.className = 'zc-led';

  const ihmV = document.getElementById(`ihm-voyant-${id}`);
  const ivLed = document.getElementById(`iv-led-${id}`);
  if (ihmV) ihmV.classList.remove('alarming');
  if (ivLed) ivLed.className = 'iv-led';

  updateLadder(id, 'reset');
  animateRelais(id, 'reset');
  addLog(`Zone Z${id} réinitialisée — ${zone.var} = 0`, 'ok');

  checkGlobalReset();
};

// ─── CHECK GLOBAL RESET ───────────────────────────────────
function checkGlobalReset() {
  if (state.activeAlarms.size === 0 && !state.derangement) {
    setVar('%M544', 0); setVar('%M545', 0);
    deactivateSiren();

    const ledAlarm = document.getElementById('ledAlarm');
    const gAlarm = document.getElementById('gAlarm');
    if (ledAlarm) ledAlarm.className = 'global-led';
    if (gAlarm) gAlarm.classList.remove('active-green');

    const cs = document.getElementById('centraleStatus');
    const cvAlFeu = document.getElementById('cvAlFeu');
    if (cs) { cs.textContent = 'VEILLE — TOUS CIRCUITS OK\n8 ZONES · 36 DÉT. OPÉRATIONNELS'; cs.className = 'centrale-status'; }
    if (cvAlFeu) cvAlFeu.className = 'cv-led';

    const navStatus = document.getElementById('navStatus');
    if (navStatus) { navStatus.textContent = 'EN VEILLE'; navStatus.className = 'nav-status'; }

    const sirenBanner = document.getElementById('sirenBanner');
    if (sirenBanner) sirenBanner.classList.remove('active');

    addLog('Système retour en veille — Tous circuits OK', 'ok');
    animateRelais(0, 'normal');
  }
}

// ─── LADDER UPDATE ────────────────────────────────────────
function updateLadder(zoneId, phase) {
  const ldc1 = document.getElementById('ldc1');
  const lct1 = document.getElementById('lct1');
  const ldc9 = document.getElementById('ldc9');
  const lco9 = document.getElementById('lco9');
  const ldc10 = document.getElementById('ldc10');
  const lco10 = document.getElementById('lco10');

  if (phase === 'timer') {
    if (zoneId === 1 && ldc1) ldc1.classList.add('energized');
    if (lct1) lct1.classList.add('energized');
  }
  if (phase === 'alarm') {
    if (ldc9) ldc9.classList.add('energized');
    if (lco9) lco9.classList.add('energized');
    if (ldc10) ldc10.classList.add('energized');
    if (lco10) lco10.classList.add('energized');
  }
  if (phase === 'reset') {
    if (zoneId === 1 && ldc1) ldc1.classList.remove('energized');
    if (lct1) lct1.classList.remove('energized');
    if (state.activeAlarms.size === 0) {
      [ldc9, lco9, ldc10, lco10].forEach(el => { if (el) el.classList.remove('energized'); });
    }
  }
}

// ─── ACQUITTEMENT (%M548) ─────────────────────────────────
document.getElementById('btnAcquit')?.addEventListener('click', () => {
  if (state.activeAlarms.size === 0 && !state.derangement) {
    addLog('Acquittement : aucune alarme active à acquitter', 'info');
    return;
  }
  setVar('%M548', 1); setVar('%M549', 1);
  addLog('Acquittement opérateur : %M548 = 1 → %M549 = 1 — Sirènes arrêtées', 'ok');
  deactivateSiren();
  setTimeout(() => { setVar('%M548', 0); setVar('%M549', 0); }, 500);
  const sirenBanner = document.getElementById('sirenBanner');
  if (sirenBanner) sirenBanner.classList.remove('active');
});

// ─── DÉRANGEMENT (%M546) ──────────────────────────────────
document.getElementById('btnDerang')?.addEventListener('click', () => {
  state.derangement = !state.derangement;
  const btn = document.getElementById('btnDerang');
  const msg = document.getElementById('ihmDerangMsg');
  const ledDerang = document.getElementById('ledDerang');
  const gDerang = document.getElementById('gDerang');
  const cvDerang = document.getElementById('cvDerang');

  if (state.derangement) {
    setVar('%M546', 1); setVar('%M547', 1);
    if (btn) btn.classList.add('active');
    if (msg) msg.classList.add('visible');
    if (ledDerang) ledDerang.className = 'global-led green';
    if (gDerang) gDerang.classList.add('active-green');
    if (cvDerang) cvDerang.className = 'cv-led orange';
    addLog('DÉRANGEMENT ACTIF : %M546=1 — Coupure boucle détection simulée', 'derang');
  } else {
    setVar('%M546', 0); setVar('%M547', 0);
    if (btn) btn.classList.remove('active');
    if (msg) msg.classList.remove('visible');
    if (ledDerang) ledDerang.className = 'global-led';
    if (gDerang) gDerang.classList.remove('active-green');
    if (cvDerang) cvDerang.className = 'cv-led';
    addLog('Dérangement effacé : %M546=0 — Boucle rétablie', 'ok');
    checkGlobalReset();
  }
});

// ─── RÉARMEMENT GÉNÉRAL ───────────────────────────────────
document.getElementById('btnRearm')?.addEventListener('click', () => {
  // Reset all active alarms
  const toReset = [...state.activeAlarms];
  toReset.forEach(id => resetZone(id));
  state.derangement = false;
  setVar('%M546', 0); setVar('%M547', 0);
  const derangBtn = document.getElementById('btnDerang');
  const msg = document.getElementById('ihmDerangMsg');
  const ledDerang = document.getElementById('ledDerang');
  const gDerang = document.getElementById('gDerang');
  if (derangBtn) derangBtn.classList.remove('active');
  if (msg) msg.classList.remove('visible');
  if (ledDerang) ledDerang.className = 'global-led';
  if (gDerang) gDerang.classList.remove('active-green');

  initVars();
  addLog('RÉARMEMENT GÉNÉRAL — Tous bits remis à 0 — Retour en veille', 'ok');
  checkGlobalReset();
});

// ─── ALARM LIST MODAL ─────────────────────────────────────
document.getElementById('btnAlarmList')?.addEventListener('click', () => {
  const modal = document.getElementById('alarmModal');
  const body = document.getElementById('modalTableBody');
  if (!modal || !body) return;
  body.innerHTML = '';
  if (state.alarmLog.length === 0) {
    body.innerHTML = '<div style="padding:16px;font-family:var(--font-mono);font-size:0.72rem;color:var(--gray);text-align:center">Aucun événement enregistré</div>';
  } else {
    state.alarmLog.forEach(e => {
      const div = document.createElement('div');
      const isAlarm = e.type === 'alarm';
      div.className = `modal-row ${isAlarm ? 'alarm-row' : 'ok-row'}`;
      div.innerHTML = `<span>${e.msg}</span><span>${e.date}</span><span>${e.time}</span><span>${isAlarm ? 'ACTIF' : 'OK'}</span>`;
      body.appendChild(div);
    });
  }
  modal.classList.add('open');
});
document.getElementById('modalClose')?.addEventListener('click', () => {
  document.getElementById('alarmModal')?.classList.remove('open');
});
document.getElementById('alarmModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'alarmModal') e.target.classList.remove('open');
});

// ─── NAV SCROLL EFFECT ────────────────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  if (window.scrollY > 60) nav.style.background = 'rgba(10,15,34,0.98)';
  else nav.style.background = 'rgba(13,27,62,0.95)';
});

// ─── INTERSECTION OBSERVER (scroll animations) ────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.arch-card, .zone-card, .projet-card, .relais-problem, .relais-solution, .relais-validation').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// ─── INIT ──────────────────────────────────────────────────
renderZonesGrid();
renderIhmVoyants();
renderLadderVars();
animateRelais(0, 'normal');
addLog('Système SSI TSSS initialisé — 8 zones · 36 dét. A1R · Centrale Desautel UC', 'ok');
addLog('Solution relais 24V DC : bornes –R/L1IN détecteur A1R → %M521–%M528', 'relais');
addLog('Communication IHM : IP 172.16.17.80 · Ethernet Modbus TCP · Vijeo Designer 6.2', 'info');
addLog('Environnement : Oracle VirtualBox "Zeynou M37" · PL7 Pro · TSSS_28_04_26', 'info');
