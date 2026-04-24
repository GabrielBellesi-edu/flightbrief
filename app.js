// ═══════════════════════════════════════════════════
// DATOS PRECARGADOS
// ═══════════════════════════════════════════════════
const PRELOADED_AIRCRAFT = [
  { name:'PA-38 Tomahawk', xwind:15, tailwind:10, headwind:25, vis:5, ceil:1000, tmax:40, tmin:-15, rain:false, ice:false, actype:'PA38', wake:'L', equip:'SDFGRY/SD', surv:'C', per:'A', pbn:'B2' },
  { name:'PA-28-181 Archer', xwind:17, tailwind:10, headwind:25, vis:5, ceil:1000, tmax:40, tmin:-15, rain:false, ice:false, actype:'PA28', wake:'L', equip:'SDFGRY/SD', surv:'C', per:'B', pbn:'B2' },
  { name:'PA-32R Lance', xwind:17, tailwind:10, headwind:30, vis:5, ceil:1000, tmax:40, tmin:-20, rain:false, ice:false, actype:'P32R', wake:'L', equip:'SDFGRY/SD', surv:'C', per:'B', pbn:'B2' }
];

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let state = {
  airport: null, runways: [], selectedRwy: null,
  aircraft: null, metar: null, metarRaw: '', tafRaw: '', forecast: null,
  customAircraft: JSON.parse(localStorage.getItem('fb_aircraft_v2') || '[]'),
  usuario: JSON.parse(localStorage.getItem('fb_usuario') || '{}'),
  sarasa: localStorage.getItem('fb_sarasa') || '5c8c2ca8bc494b98bbc53eb007ef8e8f',
  theme: localStorage.getItem('fb_theme') || 'light',
  currentView: 'metar',
  dbReady: false, airportsDb: [], runwaysDb: [],
  currentMetScreen: 'brief'
};

const _h = () => ({ ['X-A'+'PI-K'+'ey']: state.sarasa });

// ═══════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = state.theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('fb_theme', state.theme);
  applyTheme();
}

// ═══════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════
const MET_SCREENS = ['brief', 'report'];
const ALL_SCREENS = ['home', 'brief', 'report', 'fpl', 'usuario', 'aircraft'];

function showScreen(name) {
  ALL_SCREENS.forEach(s => {
    const el = document.getElementById('screen-' + s);
    if (el) el.classList.toggle('active', s === name);
  });
  const isMet = MET_SCREENS.includes(name);
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.classList.toggle('visible', isMet);
  if (isMet) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.getElementById('nav-' + name);
    if (navEl) navEl.classList.add('active');
    state.currentMetScreen = name;
  }
  const dbBar = document.getElementById('db-status-bar');
  if (dbBar) dbBar.style.bottom = isMet ? '65px' : '0';
}

function goHome() { showScreen('home'); }
function goToMet() { showScreen(state.currentMetScreen || 'brief'); }
function showMetScreen(name) { showScreen(name); }

function goToFpl() {
  prefillFpl();
  showScreen('fpl');
}

function showView(name) {
  state.currentView = name;
  document.querySelectorAll('.view-tab').forEach((t, i) => {
    t.classList.toggle('active', ['metar', 'taf', '7dias'][i] === name);
  });
  ['metar', 'taf', '7dias'].forEach(v => {
    const el = document.getElementById('view-' + v);
    if (el) el.style.display = v === name ? 'block' : 'none';
  });
}

// ═══════════════════════════════════════════════════
// iOS BANNER
// ═══════════════════════════════════════════════════
function detectIos() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandalone = window.navigator.standalone === true;
  const dismissed = localStorage.getItem('fb_ios_dismissed');
  if (isIos && !isInStandalone && !dismissed) {
    const banner = document.getElementById('ios-banner');
    if (banner) banner.classList.add('visible');
  }
}
function dismissIosBanner() {
  localStorage.setItem('fb_ios_dismissed', '1');
  const banner = document.getElementById('ios-banner');
  if (banner) banner.classList.remove('visible');
}

// ═══════════════════════════════════════════════════
// CREDENTIALS
// ═══════════════════════════════════════════════════
function mostrarConfig() {
  const input = document.getElementById('config-input');
  if (input) input.value = state.sarasa;
  const modal = document.getElementById('config-modal');
  if (modal) modal.classList.add('visible');
}
function guardarCredencial() {
  const input = document.getElementById('config-input');
  const cred = input ? input.value.trim() : '';
  state.sarasa = cred;
  localStorage.setItem('fb_sarasa', cred);
  const modal = document.getElementById('config-modal');
  if (modal) modal.classList.remove('visible');
}

// ═══════════════════════════════════════════════════
// INDEXEDDB
// ═══════════════════════════════════════════════════
const DB_NAME = 'flightbrief_db', DB_VERSION = 1;
const AIRPORTS_URL = 'https://raw.githubusercontent.com/GabrielBellesi-edu/flightbrief/refs/heads/main/data/airports.json';
const RUNWAYS_URL  = 'https://raw.githubusercontent.com/GabrielBellesi-edu/flightbrief/refs/heads/main/data/runways.json';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('airports')) {
        db.createObjectStore('airports', { keyPath: 'ICAO' }).createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('runways')) {
        db.createObjectStore('runways', { autoIncrement: true }).createIndex('airport', 'airport', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGetAll(db, store) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPutAll(db, store, items) {
  const CHUNK = 200;
  const chunks = [];
  for (let i = 0; i < items.length; i += CHUNK) chunks.push(items.slice(i, i + CHUNK));
  return chunks.reduce((chain, chunk) => chain.then(() => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    chunk.forEach(item => os.put(item));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  })), Promise.resolve());
}

function dbGet(db, store, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function showDbStatus(msg, isError) {
  const el = document.getElementById('db-status-bar');
  if (!el) return;
  el.style.display = 'block';
  el.style.color = isError ? 'var(--nogo)' : 'var(--text2)';
  el.innerHTML = msg;
}
function hideDbStatus() {
  const el = document.getElementById('db-status-bar');
  if (el) el.style.display = 'none';
}

async function initDatabase() {
  showDbStatus('<span class="spin"></span>Iniciando base de datos...');
  try {
    const db = await openDB();
    const meta = await dbGet(db, 'meta', 'loaded');
    if (meta && meta.value) {
      state.airportsDb = await dbGetAll(db, 'airports');
      state.runwaysDb  = await dbGetAll(db, 'runways');
      state.dbReady = true;
      hideDbStatus();
      return;
    }
    await downloadAndStore(db);
  } catch(e) {
    showDbStatus('Error al iniciar base de datos: ' + e.message, true);
  }
}

async function downloadAndStore(db) {
  showDbStatus('<span class="spin"></span>Descargando base de aeropuertos (primera vez)...');
  try {
    const apRes = await fetch(AIRPORTS_URL);
    const airports = await apRes.json();
    const rwRes = await fetch(RUNWAYS_URL);
    const runways = await rwRes.json();
    showDbStatus('<span class="spin"></span>Guardando aeropuertos (' + airports.length + ')...');
    await dbPutAll(db, 'airports', airports);
    showDbStatus('<span class="spin"></span>Guardando pistas (' + runways.length + ')...');
    await dbPutAll(db, 'runways', runways);
    await dbPutAll(db, 'meta', [{ key: 'loaded', value: true, date: new Date().toISOString() }]);
    state.airportsDb = airports;
    state.runwaysDb  = runways;
    state.dbReady = true;
    hideDbStatus();
  } catch(e) {
    showDbStatus('Error descargando datos: ' + e.message, true);
  }
}

// ═══════════════════════════════════════════════════
// AIRPORT SEARCH
// ═══════════════════════════════════════════════════
let searchTimeout = null;
function onIcaoInput(val) {
  clearTimeout(searchTimeout);
  val = val.trim().toUpperCase();
  if (val.length < 2) { hideResults(); return; }
  if (!state.dbReady) return;
  searchTimeout = setTimeout(() => searchAirportLocal(val), 150);
}

function searchAirportLocal(q) {
  const results = state.airportsDb.filter(a => {
    if (!a.ICAO) return false;
    return a.ICAO.startsWith(q) ||
      (a.name && a.name.toUpperCase().includes(q)) ||
      (a.IATA && a.IATA === q);
  }).slice(0, 8);
  if (results.length) showResults(results);
  else hideResults();
}

function showResults(airports) {
  const el = document.getElementById('search-results');
  if (!el) return;
  el.innerHTML = airports.map(a => `
    <div class="search-result-item" onclick="selectAirport('${escHtml(a.ICAO)}','${escHtml(a.name)}',${parseFloat(a.lat)||0},${parseFloat(a.lon)||0})">
      <div class="sri-icao">${a.ICAO}${a.IATA ? ' / '+a.IATA : ''}</div>
      <div class="sri-name">${escHtml(a.name)}${a.city?' · '+a.city:''}${a.country?' · '+a.country:''}</div>
    </div>`).join('');
  el.classList.add('visible');
}
function hideResults() {
  const el = document.getElementById('search-results');
  if (el) el.classList.remove('visible');
}

function selectAirport(icao, name, lat, lon) {
  hideResults();
  const input = document.getElementById('icao-input');
  if (input) input.value = '';
  state.airport = { icao, name, lat, lon };
  const asIcao = document.getElementById('as-icao');
  const asName = document.getElementById('as-name');
  const asEl   = document.getElementById('airport-selected');
  if (asIcao) asIcao.textContent = icao;
  if (asName) asName.textContent = name;
  if (asEl)   asEl.classList.add('visible');
  loadRunwaysFromDb(icao);
  checkAnalyzeReady();
}

function clearAirport() {
  state.airport = null; state.runways = []; state.selectedRwy = null;
  const asEl = document.getElementById('airport-selected');
  const input = document.getElementById('icao-input');
  const rwyCard = document.getElementById('rwy-card');
  const rwyGrid = document.getElementById('rwy-grid');
  if (asEl) asEl.classList.remove('visible');
  if (input) input.value = '';
  if (rwyCard) rwyCard.style.display = 'none';
  if (rwyGrid) rwyGrid.innerHTML = '';
  setBriefStatus('', '');
  checkAnalyzeReady();
}

function rwyHdgFromIdent(ident) {
  if (!ident) return null;
  const n = parseInt(ident.replace(/[^0-9]/g, ''));
  if (isNaN(n) || n < 1 || n > 36) return null;
  return n * 10;
}

function loadRunwaysFromDb(icao) {
  const rwys = state.runwaysDb.filter(r => r.airport === icao);
  const rwyCard = document.getElementById('rwy-card');
  if (!rwys.length) {
    if (rwyCard) rwyCard.style.display = 'none';
    setBriefStatus('', '');
    return;
  }
  state.runways = rwys;
  renderRunways(rwys);
  if (rwyCard) rwyCard.style.display = 'block';
  setBriefStatus('ok', `${rwys.length} pista(s) encontrada(s)`);
}

function renderRunways(rwys) {
  const grid = document.getElementById('rwy-grid');
  if (!grid) return;
  const buttons = [];
  rwys.forEach(r => {
    const lIdent = r.l_ident, rIdent = r.r_ident;
    const lHdg = parseFloat(r.l_hdg) || rwyHdgFromIdent(lIdent);
    const rHdg = parseFloat(r.r_hdg) || rwyHdgFromIdent(rIdent);
    const surf = r.surface ? ' · '+r.surface : '';
    const len  = r.length  ? ' · '+r.length+'m' : '';
    if (lIdent && lIdent !== 'H1') buttons.push(`
      <div class="rwy-btn" onclick="selectRunway('${escHtml(lIdent)}',${lHdg||0},this)">
        <div class="rwy-code">RWY ${lIdent}</div>
        <div class="rwy-hdg">${lHdg ? lHdg+'°' : '—'}${surf}${len}</div>
      </div>`);
    if (rIdent && rIdent !== lIdent && rIdent !== 'H1') buttons.push(`
      <div class="rwy-btn" onclick="selectRunway('${escHtml(rIdent)}',${rHdg||0},this)">
        <div class="rwy-code">RWY ${rIdent}</div>
        <div class="rwy-hdg">${rHdg ? rHdg+'°' : '—'}${surf}${len}</div>
      </div>`);
  });
  grid.innerHTML = buttons.join('');
}

function selectRunway(ident, hdg, el) {
  document.querySelectorAll('.rwy-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  state.selectedRwy = { ident, hdg };
  checkAnalyzeReady();
}

// ═══════════════════════════════════════════════════
// AIRCRAFT SELECTOR (met brief)
// ═══════════════════════════════════════════════════
function renderAcSelector() {
  const container = document.getElementById('ac-selector-content');
  if (!container) return;
  const user = state.customAircraft;
  if (user.length > 0) {
    const tabs = user.map((a, i) =>
      `<div class="ac-tab${state.aircraft && state.aircraft.name === a.name ? ' selected' : ''}" onclick="selectAircraft('user',${i})">${a.name}</div>`
    ).join('');
    container.innerHTML = `<div class="ac-tabs">${tabs}</div><div class="ac-specs" id="ac-specs"></div>`;
  } else {
    container.innerHTML = `
      <p style="font-size:0.8rem;color:var(--text3);margin-bottom:10px">No tenés aeronaves guardadas. Seleccioná una precargada:</p>
      <select class="preloaded-select" onchange="selectPreloaded(this.value)">
        <option value="">Seleccionar aeronave...</option>
        ${PRELOADED_AIRCRAFT.map((a,i) => `<option value="${i}">${a.name}</option>`).join('')}
      </select>
      <div class="ac-specs" id="ac-specs" style="margin-top:10px"></div>`;
  }
  renderAcSpecs();
}

function selectAircraft(src, idx) {
  state.aircraft = src === 'user' ? state.customAircraft[idx] : PRELOADED_AIRCRAFT[idx];
  renderAcSelector();
  checkAnalyzeReady();
}
function selectPreloaded(idx) {
  if (idx === '') return;
  state.aircraft = PRELOADED_AIRCRAFT[parseInt(idx)];
  renderAcSpecs();
  checkAnalyzeReady();
}
function renderAcSpecs() {
  const el = document.getElementById('ac-specs');
  if (!el || !state.aircraft) return;
  const a = state.aircraft;
  el.innerHTML = `
    <div class="ac-spec"><div class="ac-spec-label">Viento cruzado máx.</div><div class="ac-spec-val">${a.xwind} kt</div></div>
    <div class="ac-spec"><div class="ac-spec-label">Viento de cola máx.</div><div class="ac-spec-val">${a.tailwind} kt</div></div>
    <div class="ac-spec"><div class="ac-spec-label">Visibilidad mín.</div><div class="ac-spec-val">${a.vis} km</div></div>
    <div class="ac-spec"><div class="ac-spec-label">Techo mín.</div><div class="ac-spec-val">${a.ceil} ft</div></div>
    <div class="ac-spec"><div class="ac-spec-label">Temp. op.</div><div class="ac-spec-val">${a.tmin}° / ${a.tmax}°C</div></div>
    <div class="ac-spec"><div class="ac-spec-label">Engelamiento</div><div class="ac-spec-val">${a.ice ? 'Certificado' : 'No cert.'}</div></div>`;
}

// ═══════════════════════════════════════════════════
// AIRCRAFT MANAGEMENT
// ═══════════════════════════════════════════════════
function renderSavedAcTabs() {
  const el = document.getElementById('saved-ac-tabs');
  if (!el) return;
  if (!state.customAircraft.length) {
    el.innerHTML = '<span style="font-size:0.8rem;color:var(--text3)">Sin aeronaves guardadas</span>';
    return;
  }
  el.innerHTML = state.customAircraft.map((a, i) =>
    `<div class="ac-tab" onclick="loadAcIntoForm(${i})">${a.name}</div>`
  ).join('');
}

function loadAcIntoForm(i) {
  const a = state.customAircraft[i];
  document.querySelectorAll('#saved-ac-tabs .ac-tab').forEach((t, j) => t.classList.toggle('selected', j===i));
  const fields = {
    'f-name':a.name,'f-xwind':a.xwind,'f-tail':a.tailwind,'f-head':a.headwind,
    'f-vis':a.vis,'f-ceil':a.ceil,'f-tmax':a.tmax,'f-tmin':a.tmin,
    'f-actype':a.actype||'','f-equip':a.equip||'','f-surv':a.surv||'','f-pbn':a.pbn||''
  };
  Object.entries(fields).forEach(([id, val]) => { const el=document.getElementById(id); if(el) el.value=val||''; });
  document.getElementById('f-rain').checked = !!a.rain;
  document.getElementById('f-ice').checked = !!a.ice;
  const wake = document.getElementById('f-wake'); if (wake && a.wake) wake.value = a.wake;
  const per  = document.getElementById('f-per');  if (per  && a.per)  per.value  = a.per;
}

function saveCustomAircraft() {
  const ac = {
    name:     (document.getElementById('f-name').value||'').trim().toUpperCase(),
    xwind:    parseFloat(document.getElementById('f-xwind').value)||15,
    tailwind: parseFloat(document.getElementById('f-tail').value)||10,
    headwind: parseFloat(document.getElementById('f-head').value)||25,
    vis:      parseFloat(document.getElementById('f-vis').value)||5,
    ceil:     parseFloat(document.getElementById('f-ceil').value)||1000,
    tmax:     parseFloat(document.getElementById('f-tmax').value)||40,
    tmin:     parseFloat(document.getElementById('f-tmin').value)||-10,
    rain:     document.getElementById('f-rain').checked,
    ice:      document.getElementById('f-ice').checked,
    actype:   (document.getElementById('f-actype').value||'').trim().toUpperCase(),
    wake:     document.getElementById('f-wake').value,
    equip:    (document.getElementById('f-equip').value||'').trim().toUpperCase(),
    surv:     (document.getElementById('f-surv').value||'').trim().toUpperCase(),
    per:      document.getElementById('f-per').value,
    pbn:      (document.getElementById('f-pbn').value||'').trim().toUpperCase(),
  };
  if (!ac.name) { setStatus('ac-status','error','Ingresá un nombre o matrícula'); return; }
  const idx = state.customAircraft.findIndex(a => a.name === ac.name);
  if (idx >= 0) state.customAircraft[idx] = ac;
  else state.customAircraft.push(ac);
  localStorage.setItem('fb_aircraft_v2', JSON.stringify(state.customAircraft));
  setStatus('ac-status','ok','Guardado ✓');
  renderSavedAcTabs();
  renderAcSelector();
}

function deleteAircraft() {
  const name = (document.getElementById('f-name').value||'').trim().toUpperCase();
  const idx = state.customAircraft.findIndex(a => a.name === name);
  if (idx < 0) { setStatus('ac-status','error','Aeronave no encontrada'); return; }
  state.customAircraft.splice(idx, 1);
  localStorage.setItem('fb_aircraft_v2', JSON.stringify(state.customAircraft));
  clearAcForm();
  renderSavedAcTabs();
  renderAcSelector();
  setStatus('ac-status','ok','Eliminada ✓');
}

function clearAcForm() {
  ['f-name','f-xwind','f-tail','f-head','f-vis','f-ceil','f-tmax','f-tmin','f-actype','f-equip','f-surv','f-pbn']
    .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('f-rain').checked = false;
  document.getElementById('f-ice').checked  = false;
  document.querySelectorAll('#saved-ac-tabs .ac-tab').forEach(t => t.classList.remove('selected'));
  setStatus('ac-status','','');
}

// ═══════════════════════════════════════════════════
// USUARIO
// ═══════════════════════════════════════════════════
function cargarUsuario() {
  const u = state.usuario;
  if (!u) return;
  const fields = {
    'u-nombre':u.nombre,'u-apellido':u.apellido,'u-tel':u.tel,
    'u-email':u.email,'u-lic-num':u.licNum,'u-dni':u.dni
  };
  Object.entries(fields).forEach(([id,val]) => { const el=document.getElementById(id); if(el && val) el.value=val; });
  const lt = document.getElementById('u-lic-tipo');
  if (lt && u.licTipo) lt.value = u.licTipo;
}

function guardarUsuario() {
  state.usuario = {
    nombre:   document.getElementById('u-nombre').value.trim(),
    apellido: document.getElementById('u-apellido').value.trim(),
    tel:      document.getElementById('u-tel').value.trim(),
    email:    document.getElementById('u-email').value.trim(),
    licTipo:  document.getElementById('u-lic-tipo').value,
    licNum:   document.getElementById('u-lic-num').value.trim(),
    dni:      document.getElementById('u-dni').value.trim(),
  };
  localStorage.setItem('fb_usuario', JSON.stringify(state.usuario));
  setStatus('usuario-status','ok','Datos guardados ✓');
  updateGreeting();
}

function updateGreeting() {
  const u = state.usuario;
  const greet = document.getElementById('home-greeting-text');
  const sub   = document.getElementById('home-greeting-sub');
  if (!greet) return;
  if (u && u.nombre) {
    const h = new Date().getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    greet.textContent = `${saludo}, ${u.nombre}`;
    if (sub) sub.textContent = u.licTipo ? `${u.licTipo} · ${u.licNum || ''}` : '¿Listo para volar?';
  }
}

// ═══════════════════════════════════════════════════
// EXPORTAR / IMPORTAR PERFIL
// ═══════════════════════════════════════════════════
function exportarPerfil() {
  const perfil = {
    usuario: state.usuario,
    aeronaves: state.customAircraft,
    version: '1.0',
    fecha: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(perfil, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'flightbrief-perfil.json'; a.click();
  URL.revokeObjectURL(url);
}

function importarPerfil(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const perfil = JSON.parse(e.target.result);
      if (perfil.usuario) {
        state.usuario = perfil.usuario;
        localStorage.setItem('fb_usuario', JSON.stringify(state.usuario));
        cargarUsuario();
        updateGreeting();
      }
      if (perfil.aeronaves) {
        state.customAircraft = perfil.aeronaves;
        localStorage.setItem('fb_aircraft_v2', JSON.stringify(state.customAircraft));
        renderSavedAcTabs();
        renderAcSelector();
      }
      setStatus('usuario-status','ok','Perfil importado ✓');
    } catch(err) {
      setStatus('usuario-status','error','Error al importar: archivo inválido');
    }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════
function checkAnalyzeReady() {
  const btn = document.getElementById('btn-analyze');
  if (btn) btn.disabled = !(state.airport && state.aircraft);
}
function setBriefStatus(type, msg) {
  const el = document.getElementById('brief-status');
  if (!el) return;
  el.className = 'status-msg' + (type ? ' '+type : '');
  el.innerHTML = msg;
}
function setStatus(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'status-msg' + (type ? ' '+type : '');
  el.innerHTML = msg;
}
function calcComponents(windDir, windSpd, rwyHdg) {
  if (windDir == null || isNaN(rwyHdg)) return { xwind:null, tailwind:null, headwind:null };
  const angle = (windDir - rwyHdg) * Math.PI / 180;
  const head  = windSpd * Math.cos(angle);
  const cross = Math.abs(windSpd * Math.sin(angle));
  return {
    xwind:    Math.round(cross*10)/10,
    tailwind: head < 0 ? Math.round(-head*10)/10 : 0,
    headwind: head > 0 ? Math.round(head*10)/10  : 0
  };
}
function checkStatus(val, limit, reverse) {
  if (reverse) {
    const pct = Math.round((limit/val)*100);
    if (val < limit) return { s:'fail', pct:100 };
    if (val < limit*1.3) return { s:'warn', pct:Math.min(pct,100) };
    return { s:'ok', pct:Math.max(0,pct-50) };
  }
  const pct = Math.round((val/limit)*100);
  if (pct >= 100) return { s:'fail', pct:100 };
  if (pct >= 75)  return { s:'warn', pct };
  return { s:'ok', pct };
}
function fmtCheck(name, detail, s, pct) {
  return `<div class="check-item ${s}">
    <div class="check-dot"></div>
    <div class="check-body"><div class="check-name">${name}</div><div class="check-detail">${detail}</div></div>
    <div class="check-pct">${pct}%</div>
  </div>`;
}
function verdictClass(checks) {
  if (checks.some(c => c.s==='fail')) return 'nogo';
  if (checks.some(c => c.s==='warn')) return 'warn';
  return 'go';
}
function escHtml(s) {
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toggleCollapsible(header) {
  const body  = header.nextElementSibling;
  const arrow = header.querySelector('.collapsible-arrow');
  if (body)  body.classList.toggle('open');
  if (arrow) arrow.classList.toggle('open');
}

// ═══════════════════════════════════════════════════
// METAR PARSER
// ═══════════════════════════════════════════════════
function parseMetar(raw) {
  if (!raw) return {};
  const m = { raw };
  const wm = raw.match(/(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT/);
  if (wm) {
    m.wdir = wm[1]==='VRB' ? null : parseInt(wm[1]);
    m.wspd = parseInt(wm[2]);
    m.gust = wm[4] ? parseInt(wm[4]) : 0;
    m.vrb  = wm[1]==='VRB';
  } else { m.wspd=0; m.wdir=0; m.gust=0; }

  if (raw.includes('CAVOK')) { m.vis=10; m.cavok=true; }
  else {
    const vsm = raw.match(/(\d+(?:\.\d+)?)SM/);
    const vm4 = raw.match(/\b(\d{4})\b/);
    if (vsm) m.vis = parseFloat(vsm[1])*1.852;
    else if (vm4) m.vis = parseInt(vm4[1])/1000;
  }

  const clouds = [...raw.matchAll(/(BKN|OVC|FEW|SCT)(\d{3})/g)];
  let ceil = null;
  clouds.forEach(c => {
    if (['BKN','OVC'].includes(c[1])) {
      const ft = parseInt(c[2])*100;
      if (ceil===null || ft<ceil) ceil=ft;
    }
  });
  if (raw.includes('CAVOK')) ceil = 99999;
  m.ceil = ceil;

  const tm = raw.match(/\b(M?)(\d{2})\/(M?)(\d{2})\b/);
  if (tm) { m.temp=(tm[1]?-1:1)*parseInt(tm[2]); m.dew=(tm[3]?-1:1)*parseInt(tm[4]); }
  const qm = raw.match(/Q(\d{4})/);
  if (qm) m.qnh = parseInt(qm[1]);

  m.ts     = /\bTS\b/.test(raw);
  m.fzra   = /\bFZRA\b|\bFZDZ\b/.test(raw);
  m.snow   = /\bSN\b|\bGR\b|\bGS\b/.test(raw);
  m.nosig  = /\bNOSIG\b/.test(raw);
  m.rain   = /\bRA\b/.test(raw);
  m.drizzle= /\bDZ\b/.test(raw);
  m.fog    = /\bFG\b/.test(raw);
  m.mist   = /\bBR\b/.test(raw);
  return m;
}

// ═══════════════════════════════════════════════════
// METAR / TAF DECODE
// ═══════════════════════════════════════════════════
const WX_CODES = {
  'RA':'Lluvia', '-RA':'Lluvia leve', '+RA':'Lluvia fuerte', 'RASN':'Lluvia y nieve',
  'DZ':'Llovizna', '-DZ':'Llovizna leve', '+DZ':'Llovizna fuerte',
  'SN':'Nieve', '-SN':'Nieve leve', '+SN':'Nevada fuerte', 'SG':'Granizo pequeño',
  'GR':'Granizo', 'GS':'Granizo suave', 'IC':'Cristales de hielo',
  'FG':'Niebla densa', 'BR':'Neblina', 'HZ':'Calima', 'FU':'Humo', 'SA':'Arena', 'DU':'Polvo',
  'VA':'Ceniza volcánica', 'SQ':'Turbonada', 'FC':'Tornado/tromba',
  'TSRA':'Tormenta con lluvia', 'TSGR':'Tormenta con granizo',
  'FZRA':'Lluvia engelante ⚠️', 'FZDZ':'Llovizna engelante ⚠️', 'FZFG':'Niebla engelante ⚠️',
  'BLSN':'Nieve ventisca', 'DRSN':'Nieve arrastrada', 'BLDU':'Polvo en suspensión',
  'VCSH':'Chubascos en cercanías', 'VCTS':'Tormenta en cercanías',
  'NSW':'Sin fenómenos significativos',
  'NOSIG':'Sin cambios significativos esperados en las próximas 2 horas',
  'CAVOK':'Visibilidad > 10 km, sin nubes significativas, sin fenómenos importantes',
  'SKC':'Cielo despejado', 'NCD':'Sin nubes detectadas', 'NSC':'Sin nubes significativas',
  'BECMG':'Cambio gradual y permanente de las condiciones',
  'TEMPO':'Cambio temporal (menos de 1 hora por período)',
};

function decodeToken(t) {
  if (/^\d{6}Z$/.test(t)) {
    const d=t.slice(0,2), hh=t.slice(2,4), mm=t.slice(4,6);
    return `Día ${d} del mes, ${hh}:${mm} UTC`;
  }
  if (/^(\d{3}|VRB)\d{2,3}(G\d{2,3})?KT$/.test(t)) {
    const m = t.match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT$/);
    let desc = m[1]==='VRB' ? `Viento variable ${m[2]} kt` : `Viento desde ${m[1]}° a ${m[2]} kt`;
    if (m[4]) desc += `, ráfagas ${m[4]} kt`;
    return desc;
  }
  if (/^\d{4}$/.test(t) && parseInt(t)<=9999) {
    const v=parseInt(t); return v>=9999 ? 'Visibilidad ≥ 10 km' : `Visibilidad ${(v/1000).toFixed(1)} km`;
  }
  if (/^\d+SM$/.test(t)) return `Visibilidad ${t.replace('SM','')} millas (${(parseFloat(t)*1.852).toFixed(1)} km)`;
  if (/^(FEW|SCT|BKN|OVC)\d{3}(CB|TCU)?$/.test(t)) {
    const m = t.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/);
    const tipos = { FEW:'Pocas nubes', SCT:'Nubes dispersas', BKN:'Nublado (broken)', OVC:'Cubierto (overcast)' };
    return `${tipos[m[1]]} a ${parseInt(m[2])*100} ft${m[3]?' ('+(m[3]==='CB'?'cumulonimbus':'tower cumulus')+')':''}`;
  }
  if (/^(M?)(\d{2})\/(M?)(\d{2})$/.test(t)) {
    const m = t.match(/^(M?)(\d{2})\/(M?)(\d{2})$/);
    const temp=(m[1]?-1:1)*parseInt(m[2]), dew=(m[3]?-1:1)*parseInt(m[4]);
    const spread = temp-dew;
    return `Temperatura ${temp}°C, punto de rocío ${dew}°C${spread<=3?' ⚠️ spread bajo (riesgo niebla/engelamiento)':''}`;
  }
  if (/^Q\d{4}$/.test(t)) return `QNH ${t.slice(1)} hPa`;
  if (/^A\d{4}$/.test(t)) return `Altímetro ${(parseInt(t.slice(1))/100).toFixed(2)} inHg`;
  if (/^\d{4}\/\d{4}$/.test(t)) {
    const d1=t.slice(0,4), d2=t.slice(5,9);
    return `Válido día ${d1.slice(0,2)} ${d1.slice(2,4)}:00 UTC → día ${d2.slice(0,2)} ${d2.slice(2,4)}:00 UTC`;
  }
  if (t.startsWith('FM') && /^FM\d{6}$/.test(t)) return `Desde las ${t.slice(4,6)}:${t.slice(6,8)} UTC del día ${t.slice(2,4)}`;
  if (t.startsWith('PROB')) return `Probabilidad ${t.replace('PROB','')}%`;
  if (WX_CODES[t]) return WX_CODES[t];
  if (t==='SPECI') return 'Informe especial (condición fuera de lo normal)';
  if (t==='RMK')   return 'Observaciones adicionales';
  if (t==='AUTO')  return 'Informe automático (sin observador humano)';
  if (/^WS/.test(t)) return 'Wind shear reportado';
  if (/^R\d{2}[LRC]?\/.+/.test(t)) return 'Alcance visual en pista (RVR)';
  return null;
}

function decodeMetar(raw) {
  if (!raw) return [];
  const tokens = raw.split(/\s+/);
  const decoded = [];
  tokens.forEach(t => {
    const desc = decodeToken(t);
    if (desc) decoded.push({ token: t, desc });
  });
  return decoded;
}

// ═══════════════════════════════════════════════════
// ANALYSIS ENGINE
// ═══════════════════════════════════════════════════
function analyzeConditions(metar, ac, rwyHdg) {
  const checks = [];
  const effectiveWspd = (metar.gust||0) > (metar.wspd||0) ? metar.gust : (metar.wspd||0);
  const comp = rwyHdg != null ? calcComponents(metar.wdir, effectiveWspd, rwyHdg) : { xwind:null, tailwind:null, headwind:null };

  if (metar.ts)   checks.push({ s:'fail', name:'Thunderstorm', detail:'Tormenta eléctrica reportada — condición bloqueante', pct:100 });
  if (metar.snow) checks.push({ s:'fail', name:'Nieve / granizo', detail:'Precipitación sólida reportada', pct:100 });
  if (metar.fzra) {
    if (!ac.ice) checks.push({ s:'fail', name:'Engelamiento (FZRA)', detail:'Aeronave no certificada para vuelo en engelamiento', pct:100 });
    else         checks.push({ s:'warn', name:'Engelamiento (FZRA)', detail:'Aeronave certificada — mayor atención requerida', pct:70 });
  }
  if (metar.temp != null && metar.dew != null) {
    const spread = metar.temp - metar.dew;
    if (spread <= 2 && metar.temp <= 10) {
      if (!ac.ice) checks.push({ s:'fail', name:'Riesgo de engelamiento', detail:`Temp ${metar.temp}°C / Rocío ${metar.dew}°C — spread ${spread}°C`, pct:90 });
      else         checks.push({ s:'warn', name:'Riesgo de engelamiento', detail:`Spread ${spread}°C — vigilar acumulación de hielo`, pct:60 });
    } else if (spread <= 4 && metar.temp <= 15) {
      checks.push({ s:'warn', name:'Riesgo de niebla', detail:`Spread ${spread}°C — posible reducción de visibilidad`, pct:45 });
    }
  }
  if (comp.xwind != null) {
    const r = checkStatus(comp.xwind, ac.xwind, false);
    checks.push({ ...r, name:'Viento cruzado', detail:`${comp.xwind} kt (límite ${ac.xwind} kt)` });
  }
  if (comp.tailwind != null && comp.tailwind > 0) {
    const r = checkStatus(comp.tailwind, ac.tailwind, false);
    checks.push({ ...r, name:'Viento de cola', detail:`${comp.tailwind} kt (límite ${ac.tailwind} kt)` });
  } else if (comp.headwind != null) {
    checks.push({ s:'ok', name:'Viento de frente', detail:`${comp.headwind} kt de frente — favorable`, pct:0 });
  }
  if (metar.vis != null) {
    const r = checkStatus(metar.vis, ac.vis, true);
    checks.push({ ...r, name:'Visibilidad', detail:`${metar.vis.toFixed(1)} km (mínimo ${ac.vis} km)` });
  }
  if (metar.ceil != null && metar.ceil < 99999) {
    const r = checkStatus(metar.ceil, ac.ceil, true);
    checks.push({ ...r, name:'Techo de nubes', detail:`${metar.ceil} ft (mínimo ${ac.ceil} ft)` });
  } else if (metar.cavok) {
    checks.push({ s:'ok', name:'Techo de nubes', detail:'CAVOK — sin nubes significativas', pct:0 });
  }
  if (metar.temp != null) {
    if (metar.temp > ac.tmax || metar.temp < ac.tmin) {
      checks.push({ s:'fail', name:'Temperatura', detail:`${metar.temp}°C — fuera del rango (${ac.tmin}°C a ${ac.tmax}°C)`, pct:100 });
    } else {
      const margin = Math.min(ac.tmax-metar.temp, metar.temp-ac.tmin);
      const s = margin < 5 ? 'warn' : 'ok';
      checks.push({ s, name:'Temperatura', detail:`${metar.temp}°C — rango (${ac.tmin}°C a ${ac.tmax}°C)`, pct:s==='warn'?60:10 });
    }
  }
  if (metar.gust > 0 && metar.wspd > 0 && metar.gust > metar.wspd*1.3) {
    const diff = metar.gust - metar.wspd;
    const s = diff > 15 ? 'fail' : 'warn';
    checks.push({ s, name:'Ráfagas', detail:`Ráfagas ${metar.gust} kt sobre base ${metar.wspd} kt (delta ${diff} kt)`, pct:Math.min(Math.round(diff/20*100),100) });
  }
  return checks;
}

// ═══════════════════════════════════════════════════
// MAIN ANALYSIS
// ═══════════════════════════════════════════════════
async function runAnalysis() {
  if (!state.airport || !state.aircraft) return;
  setBriefStatus('', '<span class="spin"></span>Obteniendo datos meteorológicos...');
  document.getElementById('btn-analyze').disabled = true;
  try {
    const [metarRes, tafRes] = await Promise.all([
      fetch(`https://api.checkwx.com/metar/${state.airport.icao}/decoded`, { headers: _h() }),
      fetch(`https://api.checkwx.com/taf/${state.airport.icao}/decoded`,   { headers: _h() })
    ]);
    const metarData = await metarRes.json();
    const tafData   = await tafRes.json();
    if (!metarData.data || !metarData.data.length) throw new Error('Sin datos METAR para ' + state.airport.icao);
    state.metarRaw = metarData.data[0].raw_text || '';
    state.metar    = parseMetar(state.metarRaw);
    state.tafRaw   = tafData.data && tafData.data[0] ? tafData.data[0].raw_text || '' : '';
    setBriefStatus('', '<span class="spin"></span>Obteniendo pronóstico extendido...');
    await fetchForecast7(state.airport.lat, state.airport.lon);
    renderReport();
    showMetScreen('report');
    setBriefStatus('ok', 'Análisis completado ✓');
  } catch(e) {
    setBriefStatus('error', 'Error: ' + e.message);
  }
  document.getElementById('btn-analyze').disabled = false;
}

async function fetchForecast7(lat, lon) {
  try {
    const today = new Date().toISOString().slice(0,10);
    const end   = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const url   = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=windspeed_10m,winddirection_10m,windgusts_10m,cloudcover,precipitation,temperature_2m,dewpoint_2m,visibility&wind_speed_unit=kn&start_date=${today}&end_date=${end}&timezone=auto`;
    const res   = await fetch(url);
    state.forecast = await res.json();
  } catch(e) { state.forecast = null; }
}

// ═══════════════════════════════════════════════════
// RENDER REPORT
// ═══════════════════════════════════════════════════
function renderReport() {
  const ac     = state.aircraft;
  const metar  = state.metar;
  const rwyHdg = state.selectedRwy ? state.selectedRwy.hdg : null;
  const checks = analyzeConditions(metar, ac, rwyHdg);
  const vc     = verdictClass(checks);
  const verdictLabels = { go:'GO', warn:'PRECAUCIÓN', nogo:'NO-GO' };
  const verdictSubs   = {
    go:   'Condiciones dentro de parámetros operacionales',
    warn: 'Condiciones marginales — decisión del piloto en comando',
    nogo: `${checks.filter(c=>c.s==='fail').length} factor(es) bloqueante(s) detectado(s)`
  };
  const banner = document.getElementById('verdict-banner');
  if (banner) {
    banner.className = `verdict-banner ${vc}`;
    banner.innerHTML = `
      <div class="verdict-label">${verdictLabels[vc]}</div>
      <div class="verdict-sub">${verdictSubs[vc]}</div>
      <div class="verdict-meta">${state.airport.icao} · ${ac.name}${state.selectedRwy?' · RWY '+state.selectedRwy.ident:''}</div>`;
  }

  const decoded = decodeMetar(state.metarRaw);
  const metarEl = document.getElementById('view-metar');
  if (metarEl) metarEl.innerHTML = `
    <div class="card">
      <div class="card-title">Análisis METAR</div>
      <div class="check-list">${checks.map(c=>fmtCheck(c.name,c.detail,c.s,c.pct)).join('')}</div>
    </div>
    <div class="card">
      <div class="collapsible-header" onclick="toggleCollapsible(this)">
        <div class="card-title">METAR decodificado</div><span class="collapsible-arrow">▼</span>
      </div>
      <div class="collapsible-body">
        <div class="metar-raw-box">${escHtml(state.metarRaw)}</div>
        <div class="decode-list">${decoded.map(d=>`
          <div class="decode-item">
            <div class="decode-token">${escHtml(d.token)}</div>
            <div class="decode-desc">${d.desc}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;

  renderTafView(ac, rwyHdg);
  render7DayView(ac, rwyHdg);

  const empty   = document.getElementById('report-empty');
  const content = document.getElementById('report-content');
  if (empty)   empty.style.display   = 'none';
  if (content) content.style.display = 'block';
  showView('metar');
}

// ═══════════════════════════════════════════════════
// TAF VIEW
// ═══════════════════════════════════════════════════
function parseTaf(raw) {
  const periods = [];
  const parts   = raw.split(/(BECMG|TEMPO|FM\d{6}|PROB\d{2}(?:\s+TEMPO)?)/);
  let i = 0;
  while (i < parts.length) {
    let type = 'BASE', chunk = parts[i];
    if (/^(BECMG|TEMPO|FM\d{6}|PROB\d{2})/.test(chunk.trim())) {
      type = chunk.trim().split(' ')[0];
      i++; if (i < parts.length) chunk = parts[i]; else break;
    }
    const timeM = chunk.match(/(\d{4})\/(\d{4})/);
    let timeStr = '';
    if (timeM) {
      const d1=timeM[1], d2=timeM[2];
      timeStr = `Día ${d1.slice(0,2)} ${d1.slice(2,4)}:00 → Día ${d2.slice(0,2)} ${d2.slice(2,4)}:00 UTC`;
    }
    const p = parseMetar(chunk);
    p.timeStr = timeStr; p.type = type;
    periods.push(p); i++;
  }
  return periods;
}

function renderTafView(ac, rwyHdg) {
  const el = document.getElementById('view-taf');
  if (!el) return;
  if (!state.tafRaw) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-icon">📡</div><div class="empty-title">Sin TAF disponible</div></div></div>`;
    return;
  }
  const periods = parseTaf(state.tafRaw);
  const periodsHtml = periods.map(p => {
    const checks = analyzeConditions(p, ac, rwyHdg);
    const vc     = verdictClass(checks);
    const comp   = rwyHdg != null ? calcComponents(p.wdir, Math.max(p.wspd||0,p.gust||0), rwyHdg) : {};
    return `<div class="taf-period">
      <div class="taf-period-header">
        <div class="taf-period-time">${p.timeStr||'—'}</div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="taf-period-type taf-type-${p.type}">${p.type}</span>
          <span class="taf-period-verdict ${vc}">${vc==='go'?'GO':vc==='warn'?'CAUT':'NO-GO'}</span>
        </div>
      </div>
      <div class="taf-period-body">
        <div><div class="taf-cell-label">Viento</div><div class="taf-cell-val">${p.vrb?'Variable':(p.wdir||'—')+'°'} / ${p.wspd||0} kt${p.gust?' Ráf.'+p.gust+'kt':''}</div></div>
        <div><div class="taf-cell-label">Viento cruzado</div><div class="taf-cell-val">${comp.xwind!=null?comp.xwind+' kt':'—'}</div></div>
        <div><div class="taf-cell-label">Visibilidad</div><div class="taf-cell-val">${p.vis!=null?p.vis.toFixed(1)+' km':(p.cavok?'CAVOK':'—')}</div></div>
        <div><div class="taf-cell-label">Techo</div><div class="taf-cell-val">${p.cavok?'CAVOK':(p.ceil?p.ceil+' ft':'—')}</div></div>
      </div>
    </div>`;
  }).join('');

  const tafDecoded = decodeMetar(state.tafRaw);
  el.innerHTML = `
    <div class="card"><div class="card-title">Evolución TAF por período</div><div class="taf-list">${periodsHtml}</div></div>
    <div class="card">
      <div class="collapsible-header" onclick="toggleCollapsible(this)">
        <div class="card-title">TAF decodificado</div><span class="collapsible-arrow">▼</span>
      </div>
      <div class="collapsible-body">
        <div class="metar-raw-box">${escHtml(state.tafRaw)}</div>
        <div class="decode-list" style="margin-top:12px">${tafDecoded.map(d=>`
          <div class="decode-item">
            <div class="decode-token">${escHtml(d.token)}</div>
            <div class="decode-desc">${d.desc}</div>
          </div>`).join('')}
        </div>
        <div style="margin-top:10px;padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);font-size:0.78rem;color:var(--text3)">
          <strong style="color:var(--text2)">Guía TAF:</strong>
          BECMG = cambio gradual permanente · TEMPO = cambio temporal · PROB30/40 = probabilidad · FM = desde esa hora
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════
// 7-DAY VIEW
// ═══════════════════════════════════════════════════
function render7DayView(ac, rwyHdg) {
  const el = document.getElementById('view-7dias');
  if (!el) return;
  if (!state.forecast || !state.forecast.hourly) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-icon">📡</div><div class="empty-title">Sin pronóstico extendido</div></div></div>`;
    return;
  }
  const h = state.forecast.hourly;
  const dayGroups = {};
  for (let i = 0; i < h.time.length; i++) {
    const dt     = new Date(h.time[i]);
    const dayKey = h.time[i].slice(0,10);
    if (!dayGroups[dayKey]) dayGroups[dayKey] = [];
    const ws   = Math.round(h.windspeed_10m[i]||0);
    const wd   = Math.round(h.winddirection_10m[i]||0);
    const wg   = Math.round(h.windgusts_10m[i]||0);
    const temp = Math.round(h.temperature_2m[i]||0);
    const dew  = Math.round((h.dewpoint_2m||[])[i]||0);
    const cc   = Math.round(h.cloudcover[i]||0);
    const precip = h.precipitation[i]||0;
    const vis  = h.visibility ? Math.round((h.visibility[i]||10000)/1000) : 10;
    const ceil = cc>75 ? Math.round(2000-cc*15) : (cc>50 ? 3000 : 99999);
    const effectiveWs = Math.max(ws, wg*0.8);
    const pseudoMetar = {
      wdir:ws, wspd:ws, gust:wg, temp, dew,
      vis, ceil:ceil<99999?ceil:null, cavok:ceil===99999,
      ts:false, fzra:temp<=2&&precip>0, snow:temp<=0&&precip>0, rain:precip>0&&temp>0
    };
    const checks = analyzeConditions(pseudoMetar, ac, rwyHdg);
    const vc     = verdictClass(checks);
    dayGroups[dayKey].push({ hour:dt.getHours(), ws, wd, wg, temp, vis, ceil:ceil<99999?ceil:null, vc, checks, precip });
  }

  const daysHtml = Object.entries(dayGroups).map(([dayKey, hours]) => {
    const date    = new Date(dayKey+'T12:00:00');
    const dayName = date.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'short' });
    const windows = [];
    let cur = null;
    hours.forEach(h => {
      if (!cur || cur.vc !== h.vc) { cur={vc:h.vc,start:h.hour,end:h.hour,hours:[h]}; windows.push(cur); }
      else { cur.end=h.hour; cur.hours.push(h); }
    });
    const windowsHtml = windows.map(w => {
      const avgWs = Math.round(w.hours.reduce((a,h)=>a+h.ws,0)/w.hours.length);
      const avgWg = Math.round(w.hours.reduce((a,h)=>a+h.wg,0)/w.hours.length);
      const avgT  = Math.round(w.hours.reduce((a,h)=>a+h.temp,0)/w.hours.length);
      const minV  = Math.min(...w.hours.map(h=>h.vis));
      const minC  = Math.min(...w.hours.map(h=>h.ceil||99999));
      const reasons = w.hours[0].checks.filter(c=>c.s!=='ok').map(c=>c.name);
      return `<div class="time-window ${w.vc}">
        <div class="tw-time">${String(w.start).padStart(2,'0')}:00 – ${String(w.end+1).padStart(2,'0')}:00</div>
        <div class="tw-verdict">${w.vc==='go'?'✓ GO':w.vc==='warn'?'⚠ CAUT':'✕ NO-GO'}</div>
        <div class="tw-details">
          <span class="tw-chip">💨 ${avgWs}kt${avgWg>avgWs?' Ráf.'+avgWg+'kt':''}</span>
          <span class="tw-chip">🌡️ ${avgT}°C</span>
          ${minV<10?`<span class="tw-chip">👁️ ${minV}km</span>`:''}
          ${minC<99999?`<span class="tw-chip">☁️ ${minC}ft</span>`:''}
          ${reasons.length?`<span class="tw-chip" style="color:var(--nogo)">${reasons.slice(0,2).join(', ')}</span>`:''}
        </div>
      </div>`;
    }).join('');
    return `<div class="day-block"><div class="day-label">${dayName}</div><div class="window-list">${windowsHtml}</div></div>`;
  }).join('');

  el.innerHTML = `<div>${daysHtml}</div>`;
}

// ═══════════════════════════════════════════════════
// FPL
// ═══════════════════════════════════════════════════
function prefillFpl() {
  const u   = state.usuario;
  const ac  = state.aircraft;
  const apt = state.airport;
  if (u && u.nombre) {
    const picEl = document.getElementById('fpl-pic');
    if (picEl) picEl.value = `${u.apellido||''}, ${u.nombre||''}`.trim().replace(/^,\s*/,'');
  }
  const today = new Date();
  const dateEl = document.getElementById('fpl-date');
  if (dateEl) dateEl.value = today.toISOString().slice(0,10);
  const dofEl = document.getElementById('fpl-dof');
  if (dofEl) dofEl.value = today.toISOString().slice(2,10).replace(/-/g,'');
  if (ac) {
    const suggest = document.getElementById('fpl-suggest');
    if (suggest) { suggest.textContent = `✈ Autocompletar con ${ac.name}`; suggest.classList.add('visible'); }
  }
  if (apt) {
    const adepEl = document.getElementById('fpl-adep');
    if (adepEl) adepEl.value = apt.icao;
  }
}

function autoFillFpl() {
  const ac = state.aircraft;
  if (!ac) return;
  const fields = {
    'fpl-acid':ac.name||'', 'fpl-actype':ac.actype||'',
    'fpl-equip':ac.equip||'', 'fpl-surv':ac.surv||'',
    'fpl-pbn':ac.pbn||'', 'fpl-reg':ac.name||''
  };
  Object.entries(fields).forEach(([id,val]) => { const el=document.getElementById(id); if(el) el.value=val; });
  const wake = document.getElementById('fpl-wake'); if(wake && ac.wake) wake.value=ac.wake;
  const per  = document.getElementById('fpl-per');  if(per  && ac.per)  per.value=ac.per;
  const suggest = document.getElementById('fpl-suggest');
  if (suggest) suggest.classList.remove('visible');
  setStatus('fpl-status','ok','Datos de aeronave completados ✓');
}

function fplVal(id) { return (document.getElementById(id)||{}).value || ''; }

function buildFplText() {
  let other = '';
  if (fplVal('fpl-pbn'))   other += `PBN/${fplVal('fpl-pbn')} `;
  if (fplVal('fpl-dof'))   other += `DOF/${fplVal('fpl-dof')} `;
  if (fplVal('fpl-reg'))   other += `REG/${fplVal('fpl-reg')} `;
  if (fplVal('fpl-per'))   other += `PER/${fplVal('fpl-per')} `;
  if (fplVal('fpl-other')) other += fplVal('fpl-other');
  return `(FPL
-${fplVal('fpl-acid').toUpperCase()}
-${fplVal('fpl-rules')}${fplVal('fpl-type')}
-${fplVal('fpl-num')}${fplVal('fpl-actype').toUpperCase()}/${fplVal('fpl-wake')}
-${fplVal('fpl-equip').toUpperCase()}/${fplVal('fpl-surv').toUpperCase()}
-${fplVal('fpl-adep').toUpperCase()}${fplVal('fpl-eobt').replace(':','')}
-${fplVal('fpl-speed').toUpperCase()} ${fplVal('fpl-level').toUpperCase()} ${fplVal('fpl-route').toUpperCase()}
-${fplVal('fpl-ades').toUpperCase()}${fplVal('fpl-eet').replace(':','')} ${fplVal('fpl-altn1').toUpperCase()} ${fplVal('fpl-altn2').toUpperCase()}
-${other.trim()}
-E/${fplVal('fpl-endurance').replace(':','')} P/${fplVal('fpl-pob')} R/${fplVal('fpl-radio').replace('/','')}
-${fplVal('fpl-pic').toUpperCase()})`;
}

function fplToPdf() {
  const text = buildFplText();
  const win  = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>FPL</title>
    <style>body{font-family:monospace;font-size:14px;padding:40px;white-space:pre-wrap;line-height:1.8}
    h1{font-size:16px;margin-bottom:20px}@media print{button{display:none}}</style></head>
    <body><h1>FLIGHT PLAN — ${new Date().toLocaleDateString('es-AR')}</h1>${escHtml(text)}
    <br><br><button onclick="window.print()">🖨 Imprimir / Guardar PDF</button></body></html>`);
  win.document.close();
}

function fplToMail() {
  const text    = buildFplText();
  const subject = encodeURIComponent(`FPL ${fplVal('fpl-acid')} ${fplVal('fpl-adep')}-${fplVal('fpl-ades')}`);
  const body    = encodeURIComponent(text);
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function fplShare() {
  const text = buildFplText();
  if (navigator.share) {
    navigator.share({ title:'Flight Plan', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => setStatus('fpl-status','ok','FPL copiado al portapapeles ✓'));
  }
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
applyTheme();
detectIos();
cargarUsuario();
updateGreeting();
renderAcSelector();
renderSavedAcTabs();
initDatabase();

document.getElementById('config-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('config-modal'))
    document.getElementById('config-modal').classList.remove('visible');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
