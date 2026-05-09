const API  = window.MOTORISK_CONFIG?.API_URL  ?? 'http://localhost:8080';

// ── Themes ─────────────────────────────────────────────────────────────────

const THEMES = {
  // BMW M colors — blue dominant, M red accent, clean white bg
  bmwM1000RR: {
    name: 'BMW M1000RR',
    abbr: 'M RR',
    year: '2021',
    mode: 'light',
    tiles: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    bg: '#f0f4f8',
    surface: 'rgba(0,102,177,0.10)',
    surfaceSolid: '#bdcfda',
    text: '#060c14',
    muted: '#406080',
    border: 'rgba(0,102,177,0.14)',
    risk: '#E22718',
    route: '#0066B1',
  },  
  // Honda CB750 — candy chrome gold, warm ivory bg
  hondaCB750: {
    name: 'Honda CB750',
    abbr: 'CB750',
    year: '1969',
    mode: 'light',
    tiles: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    bg: '#f7f3e8',
    surface: 'rgba(139,105,20,0.12)',
    surfaceSolid: '#c7cdc8',
    text: '#141008',
    muted: '#7a6030',
    border: 'rgba(139,105,20,0.16)',
    risk: '#9B1C1C',
    route: '#8b6914',
  },
  // Kawasaki lime green — dark green-black bg, green surface glass
  kawasakiH2R: {
    name: 'Kawasaki H2R',
    abbr: 'H2R',
    year: '2015',
    mode: 'dark',
    tiles: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    bg: '#030a04',
    surface: 'rgba(75,158,0,0.18)',
    surfaceSolid: '#2d3c25',
    text: '#e0f0e0',
    muted: '#72aa78',
    border: 'rgba(75,158,0,0.22)',
    risk: '#d40000',
    route: '#4B9E00',
  },
  // Arancio Laverda — signature Italian orange, warm dark bg
  laverda750SF: {
    name: 'Laverda 750 SF',
    abbr: 'L750',
    year: '1969',
    mode: 'dark',
    tiles: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    bg: '#0f0800',
    surface: 'rgba(244,121,32,0.18)',
    surfaceSolid: '#4c3527',
    text: '#faeee0',
    muted: '#c28c58',
    border: 'rgba(244,121,32,0.22)',
    risk: '#c0392b',
    route: '#F47920',
  },

};

const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const defaultTheme = systemDark ? 'kawasakiH2R' : 'bmwM1000RR';
let currentThemeKey = localStorage.getItem('moto-risk-theme') || defaultTheme;

function applyThemeCSSVars(theme) {
  const root = document.documentElement;
  root.style.setProperty('--bg',           theme.bg);
  root.style.setProperty('--surface',      theme.surface);
  root.style.setProperty('--surface-solid', theme.surfaceSolid);
  root.style.setProperty('--text',         theme.text);
  root.style.setProperty('--muted',        theme.muted);
  root.style.setProperty('--border',       theme.border);
  root.style.setProperty('--accent-risk',  theme.risk);
  root.style.setProperty('--accent-route', theme.route);
  root.dataset.themeMode = theme.mode;
}

// Apply initial theme vars before map init to avoid flash
applyThemeCSSVars(THEMES[currentThemeKey] || THEMES.bmwM1000RR);

const map = L.map('map', { zoomControl: false }).setView([40.4, -3.7], 6);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
map.createPane('weatherPane').style.zIndex = 620;
map.createPane('waypointPane').style.zIndex = 630;

// ── Locate control ──────────────────────────────────────────────────────────
const LocateControl = L.Control.extend({
  options: { position: 'bottomleft' },
  onAdd() {
    const container = L.DomUtil.create('div', 'leaflet-control-locate leaflet-bar');
    const btn = L.DomUtil.create('a', '', container);
    btn.setAttribute('aria-label', 'Mi ubicación');
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-locate-icon lucide-locate"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/></svg>';
    L.DomEvent.on(btn, 'click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (!navigator.geolocation) return;
      btn.classList.add('locating');
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          btn.classList.remove('locating');
          map.setView([coords.latitude, coords.longitude], 13);
        },
        () => { btn.classList.remove('locating'); }
      );
    });
    return container;
  },
});
new LocateControl().addTo(map);

let tileLayer = L.tileLayer((THEMES[currentThemeKey] || THEMES.bmwM1000RR).tiles, {
  attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

function applyTheme(key) {
  const theme = THEMES[key];
  if (!theme) return;
  currentThemeKey = key;
  applyThemeCSSVars(theme);
  tileLayer.setUrl(theme.tiles);
  segments.forEach(s => { if (s) s.layer.setStyle({ color: theme.route }); });
  riskLayers.forEach(l => l.setStyle({ color: theme.risk }));
  weatherMarkers.forEach(m => {
    const c = m.options.alert ? theme.risk : theme.route;
    m.setStyle({ color: c, fillColor: c });
  });
  waypoints.forEach(w => w.marker.setIcon(makePointIcon()));
  const svg = document.getElementById('elevation-svg');
  if (svg) {
    const c = THEMES[key].route;
    svg.querySelector('.elev-fill')?.setAttribute('fill', c);
    svg.querySelector('.elev-line')?.setAttribute('stroke', c);
  }
  document.getElementById('theme-abbr').textContent = theme.abbr;
  document.querySelectorAll('.theme-option').forEach(el => {
    el.classList.toggle('active', el.dataset.key === key);
  });
  localStorage.setItem('moto-risk-theme', key);
  highlightSelectedDay();
}

// ── DOM ────────────────────────────────────────────────────────────────────

const btnTheme       = document.getElementById('btn-theme');
const bottomBar      = document.getElementById('bottom-bar');
const chipInfo       = document.getElementById('chip-info');
const btnAnalyze     = document.getElementById('btn-analyze');
const btnClear       = document.getElementById('btn-clear');
const btnExportGPX   = document.getElementById('btn-export-gpx');
const btnReverse     = document.getElementById('btn-reverse');
const btnCurves      = document.getElementById('btn-curves');
const curvesFlyout   = document.getElementById('curves-flyout');
const CURVE_MODES    = ['balanced', 'fast', 'curvy'];
const CURVE_TOOLTIPS = { balanced: 'Ruta equilibrada', fast: 'Ruta más rápida', curvy: 'Ruta con más curvas' };
const gpxFileInput   = document.getElementById('gpx-file-input');
const resultsPanel   = document.getElementById('results-panel');
const btnClosePanel  = document.getElementById('btn-close-panel');
const themePopover   = document.getElementById('theme-popover');
const riskSubtitle   = document.getElementById('risk-subtitle');
const riskList       = document.getElementById('risk-list');
const weatherSubtitle = document.getElementById('weather-subtitle');
const weatherList    = document.getElementById('weather-list');
const btnToggleRisk  = document.getElementById('btn-toggle-risk');
const btnToggleWeather = document.getElementById('btn-toggle-weather');

// Build theme popover
(function buildPopover() {
  const darkKeys  = ['kawasakiH2R', 'laverda750SF'];
  const lightKeys = ['bmwM1000RR', 'hondaCB750'];

  function makeOption(key) {
    const t   = THEMES[key];
    const div = document.createElement('div');
    div.className = 'theme-option';
    div.dataset.key = key;
    if (key === currentThemeKey) div.classList.add('active');
    div.innerHTML = `
      <span class="theme-option-name">${t.name} · ${t.year}</span>
      <div class="theme-dots">
        <div class="theme-dot" style="background:${t.route}"></div>
        <div class="theme-dot" style="background:${t.risk}"></div>
      </div>`;
    div.addEventListener('click', () => {
      applyTheme(key);
      themePopover.classList.remove('open');
    });
    return div;
  }

  function makeLabel(text) {
    const el = document.createElement('div');
    el.className = 'theme-label';
    el.textContent = text;
    return el;
  }

  themePopover.appendChild(makeLabel('Claro'));
  lightKeys.forEach(k => themePopover.appendChild(makeOption(k)));
  const divider = document.createElement('div');
  divider.className = 'theme-divider';
  themePopover.appendChild(divider);
  themePopover.appendChild(makeLabel('Oscuro'));
  darkKeys.forEach(k => themePopover.appendChild(makeOption(k)));
})();

// Set initial abbr text
document.getElementById('theme-abbr').textContent = (THEMES[currentThemeKey] || THEMES.bmwM1000RR).abbr;

// Init hour slider to current hour
const _initHour = new Date().getHours();
document.getElementById('hour-slider').value = _initHour;
document.getElementById('hour-label').textContent = String(_initHour).padStart(2, '0') + ':00';

// ── Geometry utilities ─────────────────────────────────────────────────────

function bearingTo(from, to) {
  const φ1 = from[0] * Math.PI / 180, φ2 = to[0] * Math.PI / 180;
  const Δλ = (to[1] - from[1]) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function destinationPoint(from, distKm, bearing) {
  const R = 6371, d = distKm / R;
  const φ1 = from[0] * Math.PI / 180, λ1 = from[1] * Math.PI / 180;
  const b  = bearing * Math.PI / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(b));
  const λ2 = λ1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return [φ2 * 180 / Math.PI, λ2 * 180 / Math.PI];
}

// ── State ──────────────────────────────────────────────────────────────────

// waypoints[i] = { latlng: [lat, lng], marker, name }
// segments[i]  = { coords: [[lng,lat],...], layer, distance } | null
// invariant: segments.length === max(0, waypoints.length - 1)
let waypoints       = [];
let segments        = [];
const moveSeq       = [];  // per-slot sequence numbers to discard out-of-order writes
let riskLayers      = [];
let weatherMarkers  = [];
let riskVisible     = true;
let weatherVisible  = true;
let selectedDate = new Date();
let selectedHour = new Date().getHours();
let isNow        = true;
let _analyzeDebounce    = null;
let _analyzeController  = null;
let _pendingSlot        = null;   // null = closed, number = slot index with search open
let _insertSlot         = null;   // null = no insert mode, number = insert position
let _geocodeDebounce    = null;
let _dragSrcIndex       = null;
let _circularActive     = false;
let _circularPreviewCircle  = null;
let _nextWpId           = 0;
let _circularPreviewMarker  = null;
let _curvatureMode      = 'balanced'; // 'fast' | 'balanced' | 'curvy' 

// ── Onboarding tutorial ─────────────────────────────────────────────────────
const tutorialBrandEl    = document.getElementById('brand');
const tutorialBrandGroup = document.getElementById('brand-group');

let tutorialExpanded    = false;
let _collapsingTimer    = null;

function expandTutorial() {
  clearTimeout(_collapsingTimer);
  tutorialBrandEl.classList.remove('tutorial-collapsing');
  tutorialExpanded = true;
  tutorialBrandEl.classList.add('tutorial-expanded');
  tutorialBrandGroup.classList.add('tutorial-open');
  document.body.classList.add('tutorial-open');
}

function collapseTutorial() {
  if (!tutorialExpanded) return;
  tutorialExpanded = false;
  tutorialBrandEl.classList.add('tutorial-collapsing');
  tutorialBrandEl.classList.remove('tutorial-expanded');
  tutorialBrandGroup.classList.remove('tutorial-open');
  _collapsingTimer = setTimeout(() => {
    tutorialBrandEl.classList.remove('tutorial-collapsing');
    document.body.classList.remove('tutorial-open');
  }, 360);
}

expandTutorial();
refreshUI();

tutorialBrandEl.addEventListener('click', () => {
  if (tutorialExpanded) collapseTutorial();
  else expandTutorial();
});

let _tutorialMouseDown = null;
document.addEventListener('mousedown', (e) => { _tutorialMouseDown = { x: e.clientX, y: e.clientY }; });
document.addEventListener('click', (e) => {
  if (!tutorialExpanded || tutorialBrandEl.contains(e.target)) return;
  if (_tutorialMouseDown) {
    const dx = e.clientX - _tutorialMouseDown.x;
    const dy = e.clientY - _tutorialMouseDown.y;
    if (dx * dx + dy * dy > 25) return; // >5px → was a pan, not a click
  }
  collapseTutorial();
});

// ── Settings panel ─────────────────────────────────────────────────────────

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  const btn   = document.getElementById('btn-settings');
  const visible = panel.classList.contains('open');
  panel.classList.toggle('open', !visible);
  btn.classList.toggle('settings-open', !visible);
  if (!visible) buildDayButtons();
}

function buildDayButtons() {
  const container = document.getElementById('day-buttons');
  container.innerHTML = '';
  const codes = ['D','L','M','X','J','V','S'];
  const now = new Date();

  for (let i = 0; i <= 6; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const btn = document.createElement('div');
    btn.className = 'chip';
    btn.style.cssText = 'cursor:pointer;font-size:11px;min-width:28px;justify-content:center;';
    btn.textContent = i === 0 ? 'Hoy' : codes[d.getDay()];
    btn.dataset.index = i;
    btn.onclick = () => selectDay(d, btn, i);
    container.appendChild(btn);
  }

  highlightSelectedDay();
  updateHourSliderMin();
}

function selectDay(date, btn, index) {
  selectedDate = date;
  if (index !== 0) isNow = false;
  highlightSelectedDay();
  updateHourSliderMin();
  updateSettingsLabel();
  if (resultsPanel.classList.contains('open')) analyzeRoute();
}

function updateHourSliderMin() {
  const slider = document.getElementById('hour-slider');
  const now = new Date();
  const selectedMidnight = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  const todayMidnight    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isToday = selectedMidnight.getTime() === todayMidnight.getTime();
  const minHour = isToday ? now.getHours() : 0;
  slider.min = minHour;
  if (selectedHour < minHour) {
    selectedHour = minHour;
    slider.value = minHour;
    document.getElementById('hour-label').textContent = String(minHour).padStart(2, '0') + ':00';
  }
}

function highlightSelectedDay() {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const selectedMidnight = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  document.querySelectorAll('#day-buttons .chip').forEach(b => {
    const diffDays = Math.round((selectedMidnight - todayMidnight) / 86400000);
    const isSelected = parseInt(b.dataset.index) === diffDays;
    if (isSelected) {
      b.style.borderColor = 'var(--accent-route)';
      b.style.color       = 'var(--bg)';
      b.style.background  = 'var(--accent-route)';
    } else {
      b.style.borderColor = '';
      b.style.color       = '';
      b.style.background  = '';
    }
  });
}

let _hourDebounce = null;
function onHourChange(value) {
  selectedHour = parseInt(value);
  document.getElementById('hour-label').textContent =
    String(selectedHour).padStart(2, '0') + ':00';
  isNow = false;
  updateSettingsLabel();
  if (resultsPanel.classList.contains('open')) {
    clearTimeout(_hourDebounce);
    _hourDebounce = setTimeout(analyzeRoute, 600);
  }
}

function updateSettingsLabel() {
  const label = document.getElementById('settings-label');
  if (isNow) { label.textContent = 'Ahora'; return; }
  const codes = ['D','L','M','X','J','V','S'];
  const now = new Date();
  const diffDays = Math.round((selectedDate - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const dayLabel = diffDays === 0 ? 'Hoy' : codes[selectedDate.getDay()];
  label.textContent = `${dayLabel} ${String(selectedHour).padStart(2, '0')}:00`;
}

// Close settings panel on outside click.
// Use composedPath() instead of contains() so that clicks on chips that
// mutate the DOM (e.g. "Otro" calling innerHTML='') don't falsely trigger
// a close — the path is captured at dispatch time, before any DOM changes.
document.addEventListener('click', (e) => {
  const panel = document.getElementById('settings-panel');
  const btn   = document.getElementById('btn-settings');
  const path  = e.composedPath();
  if (panel && !path.includes(panel) && !path.includes(btn)) {
    panel.classList.remove('open');
    btn.classList.remove('settings-open');
  }
});

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function getRouteCoordinates() {
  const all = [];
  for (const seg of segments) {
    if (!seg) continue;
    if (all.length === 0) all.push(...seg.coords);
    else all.push(...seg.coords.slice(1));
  }
  return all;
}

function updateBottomBar() {
  const n    = waypoints.length;
  const dist = segments.reduce((sum, s) => sum + (s?.distance ?? 0), 0);

  if (n === 0) {
    bottomBar.classList.remove('visible');
    return;
  }

  bottomBar.classList.add('visible');
  chipInfo.innerHTML = `<strong>${n}</strong> punto${n !== 1 ? 's' : ''}${dist > 0 ? ' · ' + formatDistance(dist) : ''}`;

  if (getRouteCoordinates().length >= 2) {
    btnAnalyze.classList.add('ready');
    btnExportGPX.classList.add('ready');
    btnExportGPX.disabled = false;
  } else {
    btnAnalyze.classList.remove('ready');
    btnExportGPX.classList.remove('ready');
    btnExportGPX.disabled = true;
  }
}

let _chipErrorTimer = null;

function showBottomBarError(msg) {
  if (_chipErrorTimer) clearTimeout(_chipErrorTimer);
  bottomBar.classList.add('visible');
  chipInfo.textContent = msg;
  _chipErrorTimer = setTimeout(() => {
    _chipErrorTimer = null;
    updateBottomBar();
  }, 3000);
}

function makePointIcon() {
  const color = cssVar('--accent-route');
  return L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;background:${color};border:2px solid #fff;border-radius:50%;cursor:grab;animation:pointAppear 0.2s ease both;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

async function fetchRoadSegment(from, to, signal) {
  let res;
  try {
    res = await fetch(`${API}/route/geometry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, mode: _curvatureMode }),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (err.name !== 'AbortError') showBottomBarError('No se pudo trazar el segmento');
    return null;
  }
  if (!res.ok) {
    showBottomBarError('No se pudo trazar el segmento');
    return null;
  }
  const data = await res.json();
  return { geometry: { type: 'LineString', coordinates: data.coordinates }, distance: data.distance, curvatureGain: data.curvature_gain ?? 0 };
}

function buildSegment(result) {
  if (!result) return null;
  const color = cssVar('--accent-route');
  const gain = result.curvatureGain ?? 0;
  const layer = L.geoJSON(result.geometry, {
    style: { color, weight: 2, dashArray: '6 4' },
  }).addTo(map);
  return { coords: result.geometry.coordinates, layer, distance: result.distance, curvatureGain: gain };
}

// ── Marker ─────────────────────────────────────────────────────────────────

let isDragging = false;

function createMarker(latlng) {
  const marker = L.marker(latlng, {
    icon: makePointIcon(),
    draggable: true,
    interactive: true,
    autoPan: true,
    pane: 'waypointPane',
  }).addTo(map);

  marker.on('contextmenu', async (e) => {
    L.DomEvent.stopPropagation(e);
    const i = waypoints.findIndex(w => w.marker === marker);
    if (i !== -1) {
      await deleteWaypoint(i);
      scheduleAnalyze();
    }
  });

  let dragTimer = null;
  let dragController = null;

  marker.on('dragstart', () => { isDragging = true; });

  marker.on('drag', (e) => {
    if (dragController) dragController.abort();
    clearTimeout(dragTimer);

    const ll = e.target.getLatLng();
    const i  = waypoints.findIndex(w => w.marker === marker);
    if (i === -1) return;

    dragController = new AbortController();
    const controller = dragController;
    dragTimer = setTimeout(async () => {
      await moveWaypoint(i, [ll.lat, ll.lng], controller.signal);
    }, 80);
  });

  marker.on('dragend', async (e) => {
    if (dragController) { dragController.abort(); dragController = null; }
    clearTimeout(dragTimer);

    const ll = e.target.getLatLng();
    const i  = waypoints.findIndex(w => w.marker === marker);
    if (i !== -1) {
      if (_circularActive && (i === 0 || i === waypoints.length - 1)) exitCircularMode();
      const wpId = waypoints[i].id;
      waypoints[i].name = null;
      await moveWaypoint(i, [ll.lat, ll.lng]);
      reverseGeocode([ll.lat, ll.lng]).then(name => patchWaypointName(wpId, name));
    }
    setTimeout(() => { isDragging = false; }, 50);
    scheduleAnalyze();
  });

  return marker;
}

// ── Waypoint operations ────────────────────────────────────────────────────

async function snapToRoad(latlng) {
  const [lat, lng] = latlng;
  let res;
  try {
    res = await fetch(`${API}/route/snap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon: lng }),
    });
  } catch {
    showBottomBarError('No se pudo ajustar el punto a la carretera');
    return latlng;
  }
  if (!res.ok) {
    showBottomBarError('No se pudo ajustar el punto a la carretera');
    return latlng;
  }
  const data = await res.json();
  return [data.lat, data.lon];
}

// ── Geocoding helpers ───────────────────────────────────────────────────────

function fillNameEl(el, text) {
  el.textContent = '';
  const lastComma = text.lastIndexOf(',');
  if (lastComma === -1) {
    const main = document.createElement('span');
    main.className = 'wp-name-main';
    main.textContent = text;
    el.appendChild(main);
  } else {
    const main = document.createElement('span');
    main.className = 'wp-name-main';
    main.textContent = text.slice(0, lastComma + 1).trimEnd();
    const sub = document.createElement('span');
    sub.className = 'wp-name-sub';
    sub.textContent = text.slice(lastComma + 1).trimStart();
    el.append(main, sub);
  }
}

function formatCoords(latlng) {
  return latlng[0].toFixed(5) + ', ' + latlng[1].toFixed(5);
}

async function reverseGeocode(latlng) {
  try {
    const res = await fetch(`${API}/route/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: latlng[0], lon: latlng[1] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.address || null;
  } catch { return null; }
}

async function geocodeSearch(q) {
  try {
    const res = await fetch(`${API}/route/geocode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, limit: 6 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}


// ── Waypoint list rendering ─────────────────────────────────────────────────

function makeSearchBox(isOrigin = false) {
  const box = document.createElement('div');
  box.className = 'wp-box';

  const input = document.createElement('input');
  input.className = 'wp-search-input';
  input.id = 'wp-search-input';
  input.placeholder = 'Buscar lugar...';
  input.autocomplete = 'off';

  // Portal dropdown to body so it escapes all overflow/backdrop-filter containers
  const existingDd = document.getElementById('wp-dropdown');
  if (existingDd) existingDd.remove();
  const dropdown = document.createElement('div');
  dropdown.className = 'wp-dropdown';
  dropdown.id = 'wp-dropdown';
  document.body.appendChild(dropdown);

  input.addEventListener('input', () => {
    clearTimeout(_geocodeDebounce);
    const q = input.value.trim();
    if (!q) { closeDropdown(); return; }
    _geocodeDebounce = setTimeout(() => runGeocodeSearch(q), 400);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancelSearch(); return; }
    const dd = document.getElementById('wp-dropdown');
    if (!dd || !dd.classList.contains('open')) return;
    const items = Array.from(dd.querySelectorAll('.wp-dropdown-item'));
    if (!items.length) return;
    const active = dd.querySelector('.wp-dropdown-item.active');
    let idx = items.indexOf(active);
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      idx = (idx + 1) % items.length;
      items.forEach((it, i) => it.classList.toggle('active', i === idx));
      items[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      idx = (idx - 1 + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle('active', i === idx));
      items[idx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && active) {
      e.preventDefault();
      active.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(cancelSearch, 200);
  });

  box.appendChild(input);

  if (isOrigin && navigator.geolocation) {
    const locBtn = document.createElement('button');
    locBtn.className = 'wp-locate-btn';
    locBtn.setAttribute('aria-label', 'Usar mi ubicación');
    locBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/></svg>';
    locBtn.addEventListener('mousedown', (e) => e.preventDefault()); // prevent input blur
    locBtn.addEventListener('click', async () => {
      const slot = _pendingSlot;
      locBtn.classList.add('locating');
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          locBtn.classList.remove('locating');
          _pendingSlot = null;
          closeDropdown();
          const latlng = [coords.latitude, coords.longitude];
          const name = 'Mi ubicación';
          if (slot !== null && slot < waypoints.length) {
            await replaceWaypoint(slot, latlng, name);
          } else {
            await addWaypointWithName(latlng, name);
          }
          scheduleAnalyze();
        },
        () => { locBtn.classList.remove('locating'); }
      );
    });
    box.appendChild(locBtn);
  }

  setTimeout(() => { const el = document.getElementById('wp-search-input'); if (el) el.focus(); }, 0);
  return box;
}

function patchWaypointName(wpId, name) {
  const wp = waypoints.find(w => w.id === wpId);
  if (!wp) return;
  wp.name = name;
  const idx = waypoints.indexOf(wp);
  // If this slot is currently showing a search box, the name is stored and will
  // render correctly when the search closes — don't destroy the active input.
  if (_pendingSlot === idx) { updateCircularBtn(); return; }
  const list = document.getElementById('waypoint-list');
  const nameEl = list?.querySelector(`[data-index="${idx}"] .wp-name:not(.wp-placeholder-label)`);
  if (nameEl) {
    fillNameEl(nameEl, name || formatCoords(wp.latlng));
  } else {
    renderWaypointList();
  }
  updateCircularBtn();
}

function refreshUI() {
  updateBottomBar();
  renderWaypointList();
  updateCircularBtn();
  updateCurvatureBtn();
}

function renderWaypointList() {
  const list = document.getElementById('waypoint-list');
  if (!list) return;
  const existingDd = document.getElementById('wp-dropdown');
  if (existingDd) existingDd.remove();
  while (list.firstChild) list.removeChild(list.firstChild);

  const n            = waypoints.length;
  const maxReached   = n >= 10;
  const displayCount = Math.max(n, 2, _pendingSlot !== null ? _pendingSlot + 1 : 0);
  const showAddDots  = n >= 2 && !maxReached && _pendingSlot === null && _insertSlot === null;

  for (let i = 0; i < displayCount; i++) {
    const isFilled    = i < n;
    const isFirstSlot = i === 0;
    const isLastSlot  = i === displayCount - 1;
    const isEditing   = _pendingSlot === i;

    const item = document.createElement('div');
    item.className = 'wp-item';
    item.dataset.index = i;

    const track = document.createElement('div');
    track.className = 'wp-track';
    const dot = document.createElement('div');
    dot.className = 'wp-dot ' + (isFirstSlot ? 'wp-dot-first' : (isLastSlot ? 'wp-dot-last' : 'wp-dot-mid'));
    track.appendChild(dot);

    let box;
    if (isFilled && !isEditing) {
      const wp = waypoints[i];
      item.draggable = true;

      box = document.createElement('div');
      box.className = 'wp-box';

      const dragHandle = document.createElement('div');
      dragHandle.className = 'wp-drag';
      dragHandle.textContent = '⠿';

      const nameEl = document.createElement('span');
      nameEl.className = 'wp-name';
      nameEl.style.cursor = 'pointer';
      fillNameEl(nameEl, wp.name || formatCoords(wp.latlng));
      nameEl.addEventListener('click', (e) => {
        e.stopPropagation();
        openSearch(i);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'wp-del';
      delBtn.setAttribute('aria-label', 'Eliminar punto');
      delBtn.textContent = '×';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteWaypoint(i);
      });

      box.append(dragHandle, nameEl, delBtn);

      item.addEventListener('dragstart', (e) => {
        _dragSrcIndex = i;
        e.dataTransfer.effectAllowed = 'move';
        // Chromium/WebKit on macOS fails to snapshot elements with
        // backdrop-filter, leaving the drag image stuck to the cursor.
        // Provide an explicit drag image from a filter-less clone.
        const rect = box.getBoundingClientRect();
        const ghost = box.cloneNode(true);
        ghost.style.cssText += `
          position: fixed; top: -9999px; left: -9999px;
          width: ${rect.width}px; height: ${rect.height}px;
          backdrop-filter: none; -webkit-backdrop-filter: none;
          background: var(--bg); pointer-events: none;
        `;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, e.clientX - rect.left, e.clientY - rect.top);
        setTimeout(() => ghost.remove(), 0);
      });
      item.addEventListener('dragend', () => {
        _dragSrcIndex = null;
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (_dragSrcIndex !== null && _dragSrcIndex !== i) {
          reorderWaypoints(_dragSrcIndex, i);
          _dragSrcIndex = null;
        }
      });
    } else if (isEditing) {
      box = makeSearchBox(isFirstSlot);
    } else {
      box = document.createElement('div');
      box.className = 'wp-box';
      box.style.cursor = 'pointer';

      const label = document.createElement('span');
      label.className = 'wp-name wp-placeholder-label';
      label.textContent = isFirstSlot ? 'Origen' : 'Destino';
      box.appendChild(label);
      box.addEventListener('click', () => openSearch(i));
    }

    item.append(track, box);
    list.appendChild(item);

    // After each filled item, insert a .wp-add-row or an inline search box
    if (isFilled) {
      if (_insertSlot === i + 1) {
        // Inline insert search box
        const insertItem = document.createElement('div');
        insertItem.className = 'wp-item';
        const insertTrack = document.createElement('div');
        insertTrack.className = 'wp-track';
        const insertDot = document.createElement('div');
        insertDot.className = 'wp-dot wp-dot-pending';
        insertTrack.appendChild(insertDot);
        const insertBox = makeSearchBox(false);
        insertItem.append(insertTrack, insertBox);
        list.appendChild(insertItem);
      } else if (showAddDots && !(_circularActive && i === waypoints.length - 1)) {
        // + dot row
        const insertPos = i + 1;
        const addRow = document.createElement('div');
        addRow.className = 'wp-add-row';
        const addTrack = document.createElement('div');
        addTrack.className = 'wp-track';
        const addDot = document.createElement('button');
        addDot.className = 'wp-dot-add';
        addDot.setAttribute('aria-label', 'Añadir parada aquí');
        addDot.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-icon lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
        addRow.addEventListener('click', () => openInsert(insertPos));
        addTrack.appendChild(addDot);
        addRow.appendChild(addTrack);
        list.appendChild(addRow);
      }
    }
  }
}

function openSearch(slotIndex) {
  if (waypoints.length >= 10) return;
  _pendingSlot = slotIndex ?? waypoints.length;
  refreshUI();
}

function openInsert(position) {
  if (waypoints.length >= 10) return;
  _insertSlot  = position;
  _pendingSlot = null;
  refreshUI();
}

function cancelSearch() {
  const dd = document.getElementById('wp-dropdown');
  if (dd && dd.matches(':hover')) return;
  _pendingSlot = null;
  _insertSlot  = null;
  refreshUI();
}

function closeDropdown() {
  const dd = document.getElementById('wp-dropdown');
  if (!dd) return;
  while (dd.firstChild) dd.removeChild(dd.firstChild);
  dd.classList.remove('open');
}

function positionDropdown(dd) {
  const input = document.getElementById('wp-search-input');
  if (!input) return;
  const rect = input.getBoundingClientRect();
  dd.style.top   = (rect.bottom + 4) + 'px';
  dd.style.left  = rect.left + 'px';
  dd.style.width = rect.width + 'px';
}

async function runGeocodeSearch(q) {
  const candidates = await geocodeSearch(q);
  const dd = document.getElementById('wp-dropdown');
  if (!dd) return;
  while (dd.firstChild) dd.removeChild(dd.firstChild);
  if (!candidates.length) { dd.classList.remove('open'); return; }

  candidates.forEach(c => {
    const item = document.createElement('div');
    item.className = 'wp-dropdown-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'wp-dropdown-name';
    nameSpan.textContent = c.address || c.id || '';

    const typeSpan = document.createElement('span');
    typeSpan.className = 'wp-dropdown-type';
    typeSpan.textContent = c.type || '';

    item.append(nameSpan, typeSpan);
    item.addEventListener('mousedown', async (e) => {
      e.preventDefault();
      await selectCandidate(c);
    });
    dd.appendChild(item);
  });
  positionDropdown(dd);
  dd.classList.add('open');
}

async function selectCandidate(candidate) {
  const slot   = _pendingSlot;
  const insert = _insertSlot;
  _pendingSlot = null;
  _insertSlot  = null;
  closeDropdown();
  if (candidate.lat == null) { refreshUI(); return; }
  const latlng = [candidate.lat, candidate.lon];
  const name   = candidate.address || formatCoords(latlng);
  let nextSlot;
  if (insert !== null) {
    await insertWaypoint(insert, latlng, name);
    nextSlot = insert + 1;
  } else if (slot !== null && slot < waypoints.length) {
    await replaceWaypoint(slot, latlng, name);
    nextSlot = slot + 1;
  } else {
    await addWaypointWithName(latlng, name);
    nextSlot = waypoints.length;
  }
  const minZoom = 12;
  if (map.getZoom() < minZoom) {
    map.flyTo(latlng, minZoom);
  } else {
    map.panTo(latlng);
  }
  scheduleAnalyze();
  openSearch(nextSlot);
}

async function reorderWaypoints(fromIndex, toIndex) {
  _insertSlot = null;
  const last = waypoints.length - 1;
  if (_circularActive && (fromIndex === 0 || fromIndex === last || toIndex === 0 || toIndex === last)) {
    exitCircularMode();
  }
  const [wp] = waypoints.splice(fromIndex, 1);
  waypoints.splice(toIndex, 0, wp);

  segments.forEach(seg => { if (seg?.layer) map.removeLayer(seg.layer); });
  segments.length = 0;
  (await Promise.all(
    Array.from({ length: waypoints.length - 1 }, (_, i) =>
      fetchRoadSegment(waypoints[i].latlng, waypoints[i + 1].latlng)
    )
  )).forEach(r => segments.push(buildSegment(r)));

  refreshUI();
  scheduleAnalyze();
}

async function addWaypoint(latlng) {
  latlng = await snapToRoad(latlng);
  const marker = createMarker(latlng);
  waypoints.push({ id: _nextWpId++, latlng, marker, name: null });
  if (waypoints.length === 1) collapseTutorial();

  if (waypoints.length > 1) {
    const prev   = waypoints[waypoints.length - 2].latlng;
    const result = await fetchRoadSegment(prev, latlng);
    segments.push(buildSegment(result));
  }

  // Reverse geocode non-blocking — find by stable id, not index, to survive reorder/delete.
  const wpId = waypoints[waypoints.length - 1].id;
  reverseGeocode(latlng).then(name => patchWaypointName(wpId, name));

  refreshUI();
}

async function addWaypointWithName(latlng, name) {
  latlng = await snapToRoad(latlng);
  const marker = createMarker(latlng);
  waypoints.push({ id: _nextWpId++, latlng, marker, name });
  if (waypoints.length === 1) collapseTutorial();

  if (waypoints.length > 1) {
    const prev = waypoints[waypoints.length - 2].latlng;
    const result = await fetchRoadSegment(prev, latlng);
    segments.push(buildSegment(result));
  }

  refreshUI();
}

async function deleteWaypoint(i) {
  _insertSlot = null;
  map.removeLayer(waypoints[i].marker);

  const hasPrev = i > 0;
  const hasNext = i < waypoints.length - 1;

  // Collect the original indices of adjacent segments and remove them highest-first
  // so that the first splice never shifts the index needed by the second.
  const toRemove = [];
  if (hasNext) toRemove.push(i);      // segment after waypoint i:  segments[i]
  if (hasPrev) toRemove.push(i - 1); // segment before waypoint i: segments[i-1]
  // toRemove is already descending (i > i-1), so splices are safe in order.

  for (const j of toRemove) {
    const seg = segments[j];
    if (seg?.layer) map.removeLayer(seg.layer);
    segments.splice(j, 1);
  }

  const wasFirstOrLastWaypoint = _circularActive
    && (i === waypoints.length - 1 || i === 0)
    && waypoints[0].latlng[0] === waypoints[i].latlng[0]
    && waypoints[0].latlng[1] === waypoints[i].latlng[1];

  waypoints.splice(i, 1);
  // Reconnect neighbors with a new segment
  if (hasPrev && hasNext) {
    const result = await fetchRoadSegment(waypoints[i - 1].latlng, waypoints[i].latlng);
    segments.splice(i - 1, 0, buildSegment(result));
  }

  if (wasFirstOrLastWaypoint) _circularActive = false;

  refreshUI();
}

async function moveWaypoint(i, newLatlng, signal) {
  waypoints[i].latlng = newLatlng;

  const hasPrev = i > 0;
  const hasNext = i < waypoints.length - 1;

  // Stamp each segment slot before the await so a later call can invalidate this one.
  const seqPrev = hasPrev ? (moveSeq[i - 1] = (moveSeq[i - 1] || 0) + 1) : null;
  const seqNext = hasNext ? (moveSeq[i]     = (moveSeq[i]     || 0) + 1) : null;

  try {
    // Fetch both adjacent segments in parallel
    const [prevResult, nextResult] = await Promise.all([
      hasPrev ? fetchRoadSegment(waypoints[i - 1].latlng, newLatlng, signal) : Promise.resolve(null),
      hasNext ? fetchRoadSegment(newLatlng, waypoints[i + 1].latlng, signal) : Promise.resolve(null),
    ]);

    // Only write if no newer call has claimed the slot while we were awaiting.
    if (hasPrev && moveSeq[i - 1] === seqPrev) {
      if (segments[i - 1]) map.removeLayer(segments[i - 1].layer);
      segments[i - 1] = buildSegment(prevResult);
    }

    if (hasNext && moveSeq[i] === seqNext) {
      if (segments[i]) map.removeLayer(segments[i].layer);
      segments[i] = buildSegment(nextResult);
    }

    refreshUI();
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
    // Aborted by a newer drag update — ignore
  }
}

async function replaceWaypoint(i, latlng, name) {
  const wpId = waypoints[i].id;
  map.removeLayer(waypoints[i].marker);
  latlng = await snapToRoad(latlng);
  const marker = createMarker(latlng);
  waypoints[i] = { id: wpId, latlng, marker, name };

  const hasPrev = i > 0;
  const hasNext = i < waypoints.length - 1;

  const toRemove = [];
  if (hasNext) toRemove.push(i);
  if (hasPrev) toRemove.push(i - 1);
  for (const j of toRemove) {
    if (segments[j]?.layer) map.removeLayer(segments[j].layer);
    segments[j] = null;
  }

  const [prevResult, nextResult] = await Promise.all([
    hasPrev ? fetchRoadSegment(waypoints[i - 1].latlng, latlng) : Promise.resolve(null),
    hasNext ? fetchRoadSegment(latlng, waypoints[i + 1].latlng) : Promise.resolve(null),
  ]);
  if (hasPrev) segments[i - 1] = buildSegment(prevResult);
  if (hasNext) segments[i] = buildSegment(nextResult);

  refreshUI();
}

async function insertWaypoint(position, latlng, name) {
  latlng = await snapToRoad(latlng);
  const marker = createMarker(latlng);
  waypoints.splice(position, 0, { id: _nextWpId++, latlng, marker, name });
  segments.forEach(seg => { if (seg?.layer) map.removeLayer(seg.layer); });
  segments.length = 0;
  (await Promise.all(
    Array.from({ length: waypoints.length - 1 }, (_, i) =>
      fetchRoadSegment(waypoints[i].latlng, waypoints[i + 1].latlng)
    )
  )).forEach(r => segments.push(buildSegment(r)));
  if (name == null) {
    const wpId = waypoints[position].id;
    reverseGeocode(latlng).then(name => patchWaypointName(wpId, name));
  }
  refreshUI();
  scheduleAnalyze();
}

// ── Map click ──────────────────────────────────────────────────────────────

map.on('click', async (e) => {
  if (isDragging) return;
  if (_pendingSlot !== null || _insertSlot !== null) { cancelSearch(); return; }
  if (waypoints.length >= 10) return;
  const { lat, lng } = e.latlng;
  if (_circularActive) {
    // Insert before the closing origin to keep the loop closed
    await insertWaypoint(waypoints.length - 1, [lat, lng], null);
  } else {
    await addWaypoint([lat, lng]);
  }
  scheduleAnalyze();
});

// ── Analyze ────────────────────────────────────────────────────────────────

function scheduleAnalyze() {
  if (!resultsPanel.classList.contains('open')) return;
  clearTimeout(_analyzeDebounce);
  _analyzeDebounce = setTimeout(analyzeRoute, 800);
}

async function analyzeRoute() {
  if (getRouteCoordinates().length < 2) {
    if (_analyzeController) { _analyzeController.abort(); _analyzeController = null; }
    resultsPanel.classList.remove('open');
    document.body.classList.remove('panel-open');
    clearResults();
    return;
  }

  if (_analyzeController) _analyzeController.abort();
  _analyzeController = new AbortController();
  const { signal } = _analyzeController;

  const wasOpen = resultsPanel.classList.contains('open');

  btnAnalyze.disabled = true;
  btnAnalyze.innerHTML = '<span style="animation:pulse 1.2s ease-in-out infinite">Analizando</span>';
  if (!wasOpen) clearResults();
  document.querySelectorAll('.panel-error').forEach(el => el.remove());
  document.getElementById('section-risk').style.display      = '';
  document.getElementById('section-elevation').style.display = '';
  document.getElementById('section-weather').style.display   = '';
  document.querySelectorAll('#results-list .section-divider').forEach(el => el.style.display = '');

  const coords = getRouteCoordinates();
  const body = JSON.stringify({ coordinates: coords });
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal };

  const weatherBody = { coordinates: coords };
  if (!isNow) {
    const yyyy = selectedDate.getFullYear();
    const mm   = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd   = String(selectedDate.getDate()).padStart(2, '0');
    const utcOffset = -new Date().getTimezoneOffset() / 60;
    weatherBody.date = `${yyyy}-${mm}-${dd}`;
    weatherBody.hour = (selectedHour - utcOffset + 24) % 24;
  }
  const weatherOpts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(weatherBody),
    signal,
  };

  const checkOk = async r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  };

  const [segsResult, weatherResult, elevResult] = await Promise.allSettled([
    fetch(`${API}/route/segments`, opts).then(checkOk),
    fetch(`${API}/route/weather`, weatherOpts).then(checkOk),
    fetch(`${API}/route/elevation`, opts).then(checkOk),
  ]);

  if (signal.aborted) return;

  const elevChart = document.getElementById('elevation-chart');
  const allFailed = [segsResult, weatherResult, elevResult].every(r => r.status === 'rejected');

  resultsPanel.classList.add('open');
  document.body.classList.add('panel-open');

  if (wasOpen) {
    resultsPanel.classList.add('no-anim');
    clearResults();
  }

  if (allFailed) {
    const p = document.createElement('p');
    p.className = 'panel-error';
    p.style.cssText = 'margin:8px;font-size:11px;color:var(--muted);font-family:var(--sans);';
    p.textContent = 'No se pudo conectar con el servidor';
    const sectionRisk = document.getElementById('section-risk');
    sectionRisk.parentNode.insertBefore(p, sectionRisk);
    document.getElementById('section-risk').style.display      = 'none';
    document.getElementById('section-elevation').style.display = 'none';
    document.getElementById('section-weather').style.display   = 'none';
    document.querySelectorAll('#results-list .section-divider').forEach(el => el.style.display = 'none');
  } else {
    const segs       = segsResult.status    === 'fulfilled' ? segsResult.value    : null;
    const weatherPts = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
    const elevPts    = elevResult.status    === 'fulfilled' ? elevResult.value    : null;

    if (segsResult.status === 'rejected') {
      renderSectionError(riskList, 'Error al cargar los tramos de riesgo');
    } else {
      renderRiskResults(segs);
    }

    if (weatherResult.status === 'rejected') {
      renderSectionError(weatherList, 'Error al cargar la meteorología');
    } else {
      renderWeatherResults(weatherPts);
    }

    if (elevResult.status === 'rejected') {
      renderSectionError(elevChart, 'Error al cargar la elevación');
    } else {
      renderElevationChart(elevPts, weatherPts);
    }
  }

  btnAnalyze.disabled = false;
  btnAnalyze.innerHTML = 'Analizar ruta';

  if (wasOpen) {
    requestAnimationFrame(() => resultsPanel.classList.remove('no-anim'));
  }
}

btnAnalyze.addEventListener('click', analyzeRoute);

// ── Render results ─────────────────────────────────────────────────────────

function renderSectionError(container, msg) {
  const p = document.createElement('p');
  p.style.cssText = 'margin:8px;font-size:11px;color:var(--muted);font-family:var(--sans);';
  p.textContent = msg;
  container.appendChild(p);
}

function renderRiskResults(segs) {
  riskList.innerHTML = '';

  const riskChevron = document.querySelector('#hdr-risk .chevron');
  if (!segs || segs.length === 0) {
    riskSubtitle.textContent = 'Ningún tramo en esta ruta';
    riskChevron.style.display = 'none';
    btnToggleRisk.style.display = 'none';
    return;
  }
  riskChevron.style.display = '';
  btnToggleRisk.style.display = '';

  const totalRisk = segs.reduce((sum, s) => sum + s.length_m, 0);
  riskSubtitle.textContent = `${segs.length} tramo${segs.length !== 1 ? 's' : ''} · ${formatDistance(totalRisk)}`;

function classifyRoad(road) {
  if (/^AP-/i.test(road)) return 'autopista';

  // A- con 1-2 dígitos → autovía estatal (A-1, A-3, A-66)
  // A- con 3+ dígitos → autonómica (A-308, A-3075)
  if (/^A-\d{1,2}$/i.test(road)) return 'autovia';

  if (/^N-/i.test(road)) return 'nacional';

  // Prefijos autonómicos conocidos de una sola letra
  // M- Madrid, B- Barcelona, C- Cataluña, R- radiales
  // Se excluyen A- y N- ya tratados arriba
  if (/^[A-Z]-/i.test(road)) return 'autonomica';

  // Prefijos de dos letras: GC-, TF-, CV-, BI-, SS-, VI-, etc.
  if (/^[A-Z]{2}-/i.test(road)) return 'autonomica';

  return 'local';
}
  const ROAD_STYLES = {
    autopista:  { bg: '#0047AB', text: '#ffffff' },
    autovia:    { bg: '#0047AB', text: '#ffffff' },
    nacional:   { bg: '#C0392B', text: '#ffffff' },
    autonomica: { bg: '#ff9900', text: '#000000' },
    local:      { bg: '#4a4a4a', text: '#ffffff' },
  };

  function darken(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const toHex = v => Math.round(v * factor).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  function roadBadge(road) {
    const type   = classifyRoad(road);
    const style  = ROAD_STYLES[type];
    const bgDark = darken(style.bg, 0.7);
    const base   = 'display:inline-flex;align-items:center;gap:0;border-radius:3px;overflow:hidden;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:0.02em;margin-bottom:4px;';
    const main   = '<span style="background:' + style.bg + ';color:' + style.text + ';padding:2px 8px;">' + road + '</span>';
    return '<div style="' + base + '">' + main + '</div>';
  }

  segs.forEach((seg, i) => {
    const card = document.createElement('div');
    card.className = 'segment-card';
    card.style.animationDelay = i * 40 + 'ms';
    card.innerHTML = '<div class="seg-dot"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-asterisk-icon lucide-asterisk"><path d="M12 6v12"/><path d="M17.196 9 6.804 15"/><path d="m6.804 9 10.392 6"/></svg></div><div class="seg-body">'
      + roadBadge(seg.road)
      + '<div class="seg-province">' + seg.province + '</div>'
      + '<div class="seg-meta">PK <span>' + (seg.pk_start / 1000).toFixed(1) + '</span>–<span>' + (seg.pk_end / 1000).toFixed(1) + '</span> km &nbsp;·&nbsp; <span>' + (seg.length_m / 1000).toFixed(2) + ' km</span><br>'
      + (seg.direction === 'bothWays' ? 'Ambos sentidos' : seg.direction)
      + '</div></div>';

    const riskColor = cssVar('--accent-risk');
    const layer = L.geoJSON(seg.geojson, {
      style: { color: riskColor, weight: 4, opacity: 0.9 },
      onEachFeature: (_, l) => {
        l.bindTooltip(
          roadBadge(seg.road)
          + '<div class="seg-province">' + seg.province + '</div>'
          + '<div class="seg-meta">PK <span>' + (seg.pk_start / 1000).toFixed(1) + '</span>–<span>' + (seg.pk_end / 1000).toFixed(1) + '</span> km &nbsp;·&nbsp; <span>' + (seg.length_m / 1000).toFixed(2) + ' km</span><br>'
          + (seg.direction === 'bothWays' ? 'Ambos sentidos' : seg.direction) + '</div>',
          { sticky: true }
        );
        l.on('mouseover', () => l.setStyle({ weight: 6, opacity: 1 }));
        l.on('mouseout',  () => l.setStyle({ weight: 4, opacity: 0.9 }));
      },
    }).addTo(map);

    setTimeout(() => {
      layer.eachLayer(l => {
        const el = l.getElement();
        if (el) el.classList.add('risk-path');
      });
    }, 100);

    riskLayers.push(layer);

    card.addEventListener('click', () => {
      map.fitBounds(layer.getBounds(), { padding: [40, 40] });
    });

    riskList.appendChild(card);
  });
}

function renderWeatherResults(pts) {
  weatherList.innerHTML = '';

  if (!pts || pts.length === 0) {
    weatherSubtitle.textContent = 'Sin datos meteorológicos';
    return;
  }

  weatherSubtitle.textContent = `${pts.length} punto${pts.length !== 1 ? 's' : ''}`;

  const routeColor = cssVar('--accent-route');
  pts.forEach((pt, i) => {
    const card = document.createElement('div');
    card.className = 'weather-card';
    card.style.animationDelay = `${i * 40}ms`;

    const windDeg  = pt.wind_direction_deg ?? 0;
    const windSpd  = (pt.wind_speed_kmh ?? 0).toFixed(1);
    const prec     = (pt.precipitation_mm ?? 0).toFixed(1);
    const vis      = (pt.visibility_km ?? 0).toFixed(1);

    const svgArrow = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" style="transform:rotate(' + windDeg + 'deg)" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-icon lucide-arrow-up"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>';

    const svgRain  = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-droplet-icon lucide-droplet"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>';
    const svgVis = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-haze-icon lucide-haze"><path d="m5.2 6.2 1.4 1.4"/><path d="M2 13h2"/><path d="M20 13h2"/><path d="m17.4 7.6 1.4-1.4"/><path d="M22 17H2"/><path d="M22 21H2"/><path d="M16 13a4 4 0 0 0-8 0"/><path d="M12 5V2.5"/></svg>';

    const routeKm  = (pt.route_km ?? 0).toFixed(1);
    const riskColor = cssVar('--accent-risk');
    const alertDot  = pt.alert ? '<div class="seg-dot" style="margin-top:0;margin-right:4px;display:inline-flex;"><svg width="12" height="12" viewBox="0 0 24 24"><line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="19.8" y1="7.5" x2="4.2" y2="16.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="4.2" y1="7.5" x2="19.8" y2="16.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></div>' : '';
    const wRisk = pt.wind_speed_kmh   > 50  ? ' class="risk"' : '';
    const pRisk = pt.precipitation_mm > 0.5 ? ' class="risk"' : '';
    const vRisk = pt.visibility_km    < 1.0 ? ' class="risk"' : '';

    card.innerHTML = '<div class="weather-loc" style="display:flex;align-items:center;">' + alertDot + 'km ' + routeKm + '</div>'
      + '<div class="weather-row">' + svgArrow + '<span' + wRisk + '>' + windSpd + '</span> km/h</div>'
      + '<div class="weather-row">' + svgRain  + '<span' + pRisk + '>' + prec    + '</span> mm</div>'
      + '<div class="weather-row">' + svgVis   + '<span' + vRisk + '>' + vis     + '</span> km</div>';

    const markerColor = pt.alert ? riskColor : routeColor;
    const marker = L.circleMarker([pt.lat, pt.lon], {
      radius: 4,
      alert: pt.alert,
      color: markerColor,
      fillColor: markerColor,
      fillOpacity: 0.9,
      weight: 1.5,
      pane: 'weatherPane',
    }).addTo(map);

    marker.bindTooltip(
      '<div class="weather-loc">km ' + routeKm + '</div>'
      + '<div class="weather-row">' + svgArrow + '<span>' + windSpd + '</span> km/h</div>'
      + '<div class="weather-row">' + svgRain  + '<span>' + prec   + '</span> mm</div>'
      + '<div class="weather-row">' + svgVis   + '<span>' + vis    + '</span> km</div>',
      { sticky: true }
    );

    weatherMarkers.push(marker);

    card.addEventListener('click', () => {
      map.setView([pt.lat, pt.lon], Math.max(map.getZoom(), 11));
    });

    weatherList.appendChild(card);
  });
}

function renderElevationChart(pts, weatherPts) {
  const container = document.getElementById('elevation-chart');
  container.innerHTML = '';

  if (!pts || pts.length < 2) {
    document.getElementById('elevation-subtitle').textContent = 'Sin datos';
    return;
  }

  const elevs  = pts.map(p => p.elevation_m);
  const minE   = Math.min(...elevs);
  const maxE   = Math.max(...elevs);
  const totalKm = pts[pts.length - 1].route_km;

  const gain = elevs.reduce((sum, e, i) => i === 0 ? 0 : sum + Math.max(0, e - elevs[i - 1]), 0);
  document.getElementById('elevation-subtitle').textContent =
    `${Math.round(minE)}–${Math.round(maxE)} m · +${Math.round(gain)} m`;

  const W = 252, H = 80, pad = 4;
  const xScale = pt => (pt.route_km / totalKm) * W;
  const yScale = e  => H - pad - ((e - minE) / (Math.max(maxE - minE, 1))) * (H - pad * 2);

  const pts2 = pts.map(p => `${xScale(p).toFixed(1)},${yScale(p.elevation_m).toFixed(1)}`).join(' ');
  const color = cssVar('--accent-route');

  const fillPts = `0,${H} ` + pts2 + ` ${W},${H}`;

  const riskColor   = cssVar('--accent-risk');
  const alertMarkers = (weatherPts || [])
    .filter(p => p.alert)
    .map(p => {
      const x = (p.route_km / totalKm) * W;
      return `<text x="${x.toFixed(1)}" y="${H + 13}" font-size="15" font-weight="700" fill="${riskColor}" text-anchor="middle" font-family="var(--sans)">✱</text>`;
    }).join('');

  const svgHTML = `<svg id="elevation-svg" viewBox="0 0 ${W} ${H + 16}" preserveAspectRatio="none">
    <polygon points="${fillPts}" fill="${color}" class="elev-fill"/>
    <polyline points="${pts2}" stroke="${color}" class="elev-line"/>
    ${alertMarkers}
    <line id="elev-cursor" x1="0" y1="0" x2="0" y2="${H}" stroke="${color}" stroke-width="1" opacity="0" stroke-dasharray="3 2"/>
    <circle id="elev-dot" cx="0" cy="0" r="3" fill="${color}" opacity="0"/>
    <text id="elev-label" x="0" y="0" font-size="9" fill="${color}" opacity="0" font-family="var(--mono)"></text>
    <rect id="elev-overlay" x="0" y="0" width="${W}" height="${H}" fill="transparent" style="cursor:crosshair;"/>
  </svg>`;

  container.innerHTML = svgHTML;

  const svgEl   = document.getElementById('elevation-svg');
  const cursor  = document.getElementById('elev-cursor');
  const dot     = document.getElementById('elev-dot');
  const label   = document.getElementById('elev-label');
  const overlay = document.getElementById('elev-overlay');
  const xs      = pts.map(p => xScale(p));

  overlay.addEventListener('mousemove', e => {
    const rect  = svgEl.getBoundingClientRect();
    const svgX  = (e.clientX - rect.left) / rect.width * W;
    let closest = 0, minDist = Infinity;
    xs.forEach((x, i) => { const d = Math.abs(x - svgX); if (d < minDist) { minDist = d; closest = i; } });
    const pt = pts[closest];
    const cx = xs[closest];
    const cy = yScale(pt.elevation_m);
    const text = `${Math.round(pt.elevation_m)} m`;
    const labelX = cx + 4 > W - 32 ? cx - text.length * 5.5 - 4 : cx + 4;
    const labelY = cy < 14 ? cy + 14 : cy - 4;
    cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.setAttribute('opacity', '0.5');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('opacity', '1');
    label.setAttribute('x', labelX); label.setAttribute('y', labelY);
    label.textContent = text; label.setAttribute('opacity', '1');
  });

  overlay.addEventListener('mouseleave', () => {
    cursor.setAttribute('opacity', '0');
    dot.setAttribute('opacity', '0');
    label.setAttribute('opacity', '0');
  });
}

function clearResults() {
  riskLayers.forEach(l => map.removeLayer(l));
  riskLayers = [];
  riskList.innerHTML = '';
  riskSubtitle.textContent = '';

  weatherMarkers.forEach(m => map.removeLayer(m));
  weatherMarkers = [];
  weatherList.innerHTML = '';
  weatherSubtitle.textContent = '';

  riskVisible    = true;
  weatherVisible = true;
  btnToggleRisk.classList.add('active');
  btnToggleRisk.innerHTML = EYE_OPEN;
  btnToggleWeather.classList.add('active');
  btnToggleWeather.innerHTML = EYE_OPEN;
  document.getElementById('section-risk').classList.remove('collapsed');
  document.getElementById('section-weather').classList.remove('collapsed');
  document.getElementById('elevation-chart').innerHTML = '';
  document.getElementById('elevation-subtitle').textContent = '';
  document.getElementById('section-elevation').classList.remove('collapsed');
}

// ── Clear ──────────────────────────────────────────────────────────────────

function clearAll() {
  exitCircularMode();
  waypoints.forEach(w => map.removeLayer(w.marker));
  segments.forEach(s => { if (s) map.removeLayer(s.layer); });
  waypoints = [];
  segments  = [];
  clearResults();
  resultsPanel.classList.remove('open');
  document.body.classList.remove('panel-open');
  bottomBar.classList.remove('visible');
  btnAnalyze.classList.remove('ready');
  btnExportGPX.classList.remove('ready');
  btnExportGPX.disabled = true;
  selectedDate = new Date();
  selectedHour = new Date().getHours();
  isNow        = true;
  document.getElementById('settings-label').textContent = 'Ahora';
  document.getElementById('hour-slider').value = selectedHour;
  document.getElementById('hour-label').textContent =
    String(selectedHour).padStart(2, '0') + ':00';
  document.getElementById('settings-panel').classList.remove('open');
  refreshUI();
}

// ── GPX export ────────────────────────────────────────────────────────────

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function exportGPX() {
  const coords = getRouteCoordinates();
  const date = new Date().toISOString().slice(0, 10);
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="motorisk.app" xmlns="http://www.topografix.com/GPX/1/1">`;
  for (const wp of waypoints) {
    const [lat, lon] = wp.latlng;
    const nameTag = wp.name ? `<name>${escapeXml(wp.name)}</name>` : '';
    xml += `\n  <wpt lat="${lat}" lon="${lon}">${nameTag}</wpt>`;
  }
  xml += `\n  <trk><name>motorisk route</name><trkseg>`;
  for (const [lng, lat] of coords) {
    xml += `\n    <trkpt lat="${lat}" lon="${lng}"/>`;
  }
  xml += `\n  </trkseg></trk>\n</gpx>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([xml], { type: 'application/gpx+xml' }));
  a.download = `motorisk-${date}.gpx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── GPX import ────────────────────────────────────────────────────────────

async function importGPX(file) {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    showBottomBarError('Fichero GPX no válido'); return;
  }

  const wptEls = Array.from(doc.getElementsByTagName('wpt'));
  const pts = [];

  for (const el of wptEls) {
    const lat = parseFloat(el.getAttribute('lat'));
    const lon = parseFloat(el.getAttribute('lon'));
    if (isNaN(lat) || isNaN(lon)) continue;
    const nameEl = el.getElementsByTagName('name')[0];
    pts.push({ latlng: [lat, lon], name: nameEl ? nameEl.textContent.trim() || null : null });
  }

  if (pts.length === 0) {
    const trkpts = Array.from(doc.getElementsByTagName('trkpt'));
    if (trkpts.length === 0) { showBottomBarError('No se encontraron waypoints en el GPX'); return; }
    const parsePt = el => [parseFloat(el.getAttribute('lat')), parseFloat(el.getAttribute('lon'))];
    pts.push({ latlng: parsePt(trkpts[0]), name: null });
    if (trkpts.length > 1) pts.push({ latlng: parsePt(trkpts[trkpts.length - 1]), name: null });
  }

  clearAll();
  for (const pt of pts) {
    await addWaypointWithName(pt.latlng, pt.name);
  }
}

document.getElementById('btn-import-gpx').addEventListener('click', () => gpxFileInput.click());
gpxFileInput.addEventListener('change', e => {
  if (e.target.files[0]) { importGPX(e.target.files[0]); e.target.value = ''; }
});
btnExportGPX.addEventListener('click', exportGPX);

const EYE_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;

const EYE_CLOSED = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-.722-3.25"/><path d="M2 8a10.645 10.645 0 0 0 20 0"/><path d="m20 15-1.726-2.05"/><path d="m4 15 1.726-2.05"/><path d="m9 18 .722-3.25"/></svg>`;

// Initialize eye icons
btnToggleRisk.innerHTML    = EYE_OPEN;
btnToggleWeather.innerHTML = EYE_OPEN;

btnClear.addEventListener('click', clearAll);
btnClosePanel.addEventListener('click', () => {
  resultsPanel.classList.remove('open');
  document.body.classList.remove('panel-open');
});

document.getElementById('hdr-risk').addEventListener('click', () => {
  if (riskList.children.length === 0) return;
  document.getElementById('section-risk').classList.toggle('collapsed');
});

document.getElementById('hdr-elevation').addEventListener('click', () => {
  document.getElementById('section-elevation').classList.toggle('collapsed');
});

document.getElementById('hdr-weather').addEventListener('click', () => {
  document.getElementById('section-weather').classList.toggle('collapsed');
});

btnToggleRisk.addEventListener('click', (e) => {
  e.stopPropagation();
  riskVisible = !riskVisible;
  btnToggleRisk.classList.toggle('active', riskVisible);
  btnToggleRisk.innerHTML = riskVisible ? EYE_OPEN : EYE_CLOSED;
  riskLayers.forEach(l => riskVisible ? l.addTo(map) : map.removeLayer(l));
});

btnToggleWeather.addEventListener('click', (e) => {
  e.stopPropagation();
  weatherVisible = !weatherVisible;
  btnToggleWeather.classList.toggle('active', weatherVisible);
  btnToggleWeather.innerHTML = weatherVisible ? EYE_OPEN : EYE_CLOSED;
  weatherMarkers.forEach(m => weatherVisible ? m.addTo(map) : map.removeLayer(m));
});

btnTheme.addEventListener('click', (e) => {
  e.stopPropagation();
  const rect = btnTheme.getBoundingClientRect();
  themePopover.style.top  = rect.top + 'px';
  themePopover.style.left = (rect.right + 10) + 'px';
  themePopover.classList.toggle('open');
});
themePopover.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => themePopover.classList.remove('open'));

// ── Ruta circular ─────────────────────────────────────────────────────────

function isRouteAlreadyCircular() {
  return waypoints.length >= 2
    && waypoints[0].latlng[0] === waypoints[waypoints.length - 1].latlng[0]
    && waypoints[0].latlng[1] === waypoints[waypoints.length - 1].latlng[1];
}

function updateCircularBtn() {
  const btn = document.getElementById('btn-circular');
  if (!btn) return;
  if (_circularActive) {
    if (waypoints.length >= 10) { exitCircularMode(); return; }
    btn.disabled = false;
    btn.classList.add('active');
  } else {
    // Allow re-entry if closing waypoint is already present; only block if too few or too many
    const canEnter = waypoints.length < 10 && (isRouteAlreadyCircular() || waypoints.length >= 1);
    btn.disabled = !canEnter;
    btn.classList.remove('active');
  }
  btnReverse.disabled = waypoints.length < 2;
}

async function enterCircularMode() {
  if (!isRouteAlreadyCircular()) {
    const origin = waypoints[0];
    await addWaypointWithName(origin.latlng, origin.name);
  }

  _circularActive = true;
  refreshUI();
  scheduleAnalyze();
}

function exitCircularMode() {
  if (!_circularActive) return;

  _circularActive = false;
  refreshUI();
}

document.getElementById('btn-circular').addEventListener('click', (e) => {
  if (_circularActive) {
    exitCircularMode();
  } else if (!e.currentTarget.disabled) {
    enterCircularMode();
  }
});

// ── Invertir ruta ───────────────────────────────────────────────────────────

async function reverseRoute() {
  waypoints.reverse();
  segments.forEach(seg => { if (seg?.layer) map.removeLayer(seg.layer); });
  segments.length = 0;
  (await Promise.all(
    Array.from({ length: waypoints.length - 1 }, (_, i) =>
      fetchRoadSegment(waypoints[i].latlng, waypoints[i + 1].latlng)
    )
  )).forEach(r => segments.push(buildSegment(r)));
  refreshUI();
  scheduleAnalyze();
}

btnReverse.addEventListener('click', reverseRoute);

// ── Modo curvas ─────────────────────────────────────────────────────────────

function updateCurvatureBtn() {
  if (!btnCurves) return;
  btnCurves.classList.remove('fast', 'curvy');
  if (_curvatureMode !== 'balanced') btnCurves.classList.add(_curvatureMode);
  btnCurves.dataset.tooltip = CURVE_TOOLTIPS[_curvatureMode];
  btnCurves.querySelectorAll('svg[data-icon]').forEach(svg => {
    svg.style.display = svg.dataset.icon === _curvatureMode ? '' : 'none';
  });
}

async function applyCurvatureMode() {
  if (waypoints.length < 2) return;
  segments.forEach(seg => { if (seg?.layer) map.removeLayer(seg.layer); });
  const results = await Promise.all(
    Array.from({ length: waypoints.length - 1 }, (_, i) =>
      fetchRoadSegment(waypoints[i].latlng, waypoints[i + 1].latlng)
    )
  );
  segments.length = 0;
  results.forEach(r => segments.push(buildSegment(r)));
  refreshUI();
  scheduleAnalyze();
}

let _curvesOpen = false;

function openCurvesFlyout() {
  const btnRect     = btnCurves.getBoundingClientRect();
  const actionsRect = document.getElementById('route-actions').getBoundingClientRect();
  curvesFlyout.style.left = (btnRect.left - actionsRect.left) + 'px';
  document.querySelectorAll('.curve-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === _curvatureMode);
  });
  _curvesOpen = true;
  curvesFlyout.classList.add('open');
}

function closeCurvesFlyout() {
  curvesFlyout.classList.remove('open');
  _curvesOpen = false;
}

btnCurves.addEventListener('click', () => {
  _curvesOpen ? closeCurvesFlyout() : openCurvesFlyout();
});

document.querySelectorAll('.curve-opt').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const newMode = btn.dataset.mode;
    closeCurvesFlyout();
    if (newMode === _curvatureMode) return;
    _curvatureMode = newMode;
    updateCurvatureBtn();
    await applyCurvatureMode();
  });
});

document.addEventListener('click', (e) => {
  if (_curvesOpen && !e.target.closest('#btn-curves') && !e.target.closest('#curves-flyout')) {
    closeCurvesFlyout();
  }
});

document.getElementById('hour-slider').addEventListener('input', e => onHourChange(e.target.value));
document.getElementById('btn-settings').addEventListener('click', toggleSettings);
