/* =========================================================
   CMMS - Mantenimiento Analiza
   Frontend (app.js)
   Backend: Google Apps Script vía JSONP (ver Code.gs)
   ========================================================= */

/* ===================== CONFIG =====================
   IMPORTANTE: reemplaza el valor de API_URL por la URL de tu
   implementación de Apps Script (la que ya tenías funcionando).
   Debe quedar entre comillas simples, tal cual, sin espacios. */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyeMZRPaHOh2EzNzLRsKLvXqIbuZeRU4OE4X3S6z9rfXPRYAxp8ji3w2iif3YOc9x1zHQ/exec'
};

/* ===================== ESTADO GLOBAL ===================== */
const state = {
  user: null,
  // Se incrementa en cada login/logout para poder detectar y descartar
  // resultados de una carga (loadAll) que quedó "en vuelo" de una sesión
  // anterior si el usuario cierra sesión y entra de nuevo muy rápido.
  sessionId: 0,
  cache: {
    Sucursales: [], Tecnicos: [], Vehiculos: [], Ordenes: [], Inventario: [], Preventivo: []
  },
  currentView: 'dashboard',
  editing: null
};

/* ===================== ROLES ===================== */
const ROLE_CANONICAL = ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Técnico', 'Gerente de Área', 'Gerente de Sucursal', 'Consulta'];
const ACCENT_MAP = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n' };
function stripAccents(s) {
  return String(s).toLowerCase().split('').map(function (ch) { return ACCENT_MAP[ch] || ch; }).join('');
}
function roleKey(s) { return stripAccents(String(s || '').trim()).replace(/\s+/g, ' '); }
const ROLE_LOOKUP = {};
ROLE_CANONICAL.forEach(function (r) { ROLE_LOOKUP[roleKey(r)] = r; });
function canonicalRole(rawRol) { return ROLE_LOOKUP[roleKey(rawRol)] || rawRol; }
function normalizeUser(u) {
  u.rol = canonicalRole(u.rol);
  u.area = String(u.area || '').trim();
  u.sucursal_id = String(u.sucursal_id || '').trim();
  u.tecnico_id = String(u.tecnico_id || '').trim();
  u.nombre = String(u.nombre || '').trim();
  return u;
}

const FULL_ACCESS_ROLES = ['Administrador', 'Gerente de Operaciones'];
const READ_ONLY_ROLES = ['Consulta', 'Gerente de Área'];
function isReadOnly() { return !!(state.user && READ_ONLY_ROLES.indexOf(state.user.rol) > -1); }
function isAreaManager() { return !!(state.user && state.user.rol === 'Gerente de Área'); }
function isFullAccess() { return !!(state.user && FULL_ACCESS_ROLES.indexOf(state.user.rol) > -1); }
function isTecnico() { return !!(state.user && state.user.rol === 'Técnico'); }
function isOperaciones() { return !!(state.user && state.user.rol === 'Gerente de Operaciones'); }
function isSupervisor() { return !!(state.user && state.user.rol === 'Supervisor'); }

/* ===================== MENÚ LATERAL ===================== */
const MENU = [
  { id: 'dashboard', label: 'Dashboard', roles: ['Administrador', 'Gerente de Operaciones', 'Gerente de Área', 'Consulta'] },
  { id: 'ordenes', label: 'Órdenes de trabajo', roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Técnico', 'Consulta', 'Gerente de Área'] },
  { id: 'sucursales', label: 'Sucursales', roles: ['Administrador', 'Gerente de Operaciones', 'Gerente de Área', 'Consulta'] },
  { id: 'tecnicos', label: 'Técnicos', roles: ['Administrador', 'Gerente de Operaciones'] },
  { id: 'vehiculos', label: 'Vehículos', roles: ['Administrador', 'Gerente de Operaciones', 'Consulta'] },
  { id: 'inventario', label: 'Inventario', roles: ['Administrador', 'Gerente de Operaciones'] },
  { id: 'preventivo', label: 'Mantenimiento preventivo', roles: ['Administrador', 'Gerente de Operaciones', 'Técnico'] },
  { id: 'solicitud', label: 'Reportar necesidad', roles: ['Gerente de Sucursal'] }
];

/* ===================== ENTIDADES CRUD GENÉRICAS ===================== */
const ENTITIES = {
  Sucursales: {
    label: 'Sucursal',
    fields: [
      { key: 'sucursal_id', label: 'Código de sucursal', type: 'text' },
      { key: 'nombre', label: 'Nombre (contacto)', type: 'text' },
      { key: 'direccion', label: 'Dirección', type: 'text' },
      { key: 'ciudad', label: 'Ciudad', type: 'text' },
      { key: 'contacto', label: 'Contacto', type: 'text' },
      { key: 'telefono', label: 'Teléfono', type: 'text' },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Operativa', 'Con alerta', 'Inactiva', 'Funcionamiento'] },
      { key: 'gerente_area', label: 'Gerente de Área', type: 'text' }
    ]
  },
  Tecnicos: {
    label: 'Técnico',
    fields: [
      { key: 'nombre', label: 'Nombre', type: 'text' },
      { key: 'especialidad', label: 'Especialidad', type: 'text' },
      { key: 'telefono', label: 'Teléfono', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'activo', label: 'Activo', type: 'select', options: ['TRUE', 'FALSE'] }
    ]
  },
  Vehiculos: {
    label: 'Vehículo',
    fields: [
      { key: 'placa', label: 'Placa', type: 'text' },
      { key: 'marca', label: 'Marca', type: 'text' },
      { key: 'modelo', label: 'Modelo', type: 'text' },
      { key: 'anio', label: 'Año', type: 'text' },
      { key: 'asignado_a', label: 'Asignado a', type: 'text' },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Operativo', 'En mantenimiento', 'Fuera de servicio'] }
    ]
  },
  Inventario: {
    label: 'Repuesto',
    fields: [
      { key: 'nombre', label: 'Nombre', type: 'text' },
      { key: 'categoria', label: 'Categoría', type: 'text' },
      { key: 'stock', label: 'Stock actual', type: 'number' },
      { key: 'stock_minimo', label: 'Stock mínimo', type: 'number' },
      { key: 'costo_unitario', label: 'Costo unitario', type: 'number' },
      { key: 'ubicacion', label: 'Ubicación', type: 'text' }
    ]
  },
  Preventivo: {
    label: 'Plan preventivo',
    fields: [
      { key: 'sucursal_id', label: 'Sucursal', type: 'sucursal-select' },
      { key: 'equipo', label: 'Equipo', type: 'text' },
      { key: 'frecuencia_dias', label: 'Frecuencia (días)', type: 'number' },
      { key: 'ultima_fecha', label: 'Última fecha', type: 'date' },
      { key: 'proxima_fecha', label: 'Próxima fecha', type: 'date' },
      { key: 'responsable', label: 'Responsable', type: 'text' },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Al día', 'Próximo', 'Vencido'] }
    ]
  }
};

/* ===================== JSONP (API) ===================== */
let jsonpCounter = 0;
function apiCall(action, sheet, body) {
  return new Promise(function (resolve, reject) {
    if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('PEGA_AQUI') > -1) {
      setApiStatus(false);
      reject(new Error('API no configurada (falta pegar la URL de Apps Script en CONFIG.API_URL)'));
      return;
    }
    jsonpCounter++;
    const cbName = 'cmmsCb' + Date.now() + jsonpCounter;
    const params = ['action=' + encodeURIComponent(action), 'callback=' + cbName];
    if (sheet) params.push('sheet=' + encodeURIComponent(sheet));
    if (body) params.push('payload=' + encodeURIComponent(JSON.stringify(body)));
    const url = CONFIG.API_URL + '?' + params.join('&');

    const script = document.createElement('script');
    let done = false;

    const timeout = setTimeout(function () {
      if (done) return;
      done = true;
      cleanup();
      setApiStatus(false);
      reject(new Error('Tiempo de espera agotado al llamar a la API'));
    }, 20000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = function (result) {
      if (done) return;
      done = true;
      cleanup();
      setApiStatus(true);
      if (result && result.error) reject(new Error(result.error));
      else resolve(result);
    };

    script.onerror = function () {
      if (done) return;
      done = true;
      cleanup();
      setApiStatus(false);
      reject(new Error('Error de red al llamar a la API'));
    };

    script.src = url;
    document.body.appendChild(script);
  });
}

function setApiStatus(ok) {
  const el = document.getElementById('apiStatus');
  if (!el) return;
  el.textContent = ok ? '● API conectada' : '● Sin conexión con la API';
  el.className = 'api-status' + (ok ? ' ok' : '');
}

/* ===================== LOGIN / SESIÓN ===================== */
document.addEventListener('DOMContentLoaded', function () {
  tryAutoLogin();

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const usuario = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    apiCall('login', null, { usuario: usuario, password: password }).then(function (res) {
      if (!res || !res.success) {
        errEl.textContent = (res && res.error) || 'Usuario o contraseña incorrectos';
        return;
      }
      state.user = normalizeUser(res.user);
      localStorage.setItem('cmms_user', JSON.stringify(state.user));
      startApp();
    }).catch(function (err) {
      errEl.textContent = 'No se pudo conectar con la API: ' + err.message;
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    state.sessionId++; // invalida cualquier carga (loadAll) que haya quedado en vuelo
    localStorage.removeItem('cmms_user');
    state.user = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
  });

  wireGlobalUI();
});

function tryAutoLogin() {
  const saved = localStorage.getItem('cmms_user');
  if (!saved) return;
  try {
    state.user = normalizeUser(JSON.parse(saved));
    startApp();
  } catch (e) {
    localStorage.removeItem('cmms_user');
  }
}

/* ===================== ARRANQUE DE LA APP ===================== */
function startApp() {
  state.sessionId++;
  const mySession = state.sessionId;

  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('sidebarUser').textContent = state.user.nombre + ' · ' + state.user.rol;
  renderSidebar();

  if (state.user.rol === 'Gerente de Sucursal') {
    switchView('solicitud');
    return;
  }

  loadAll().then(function () {
    // Si mientras se cargaban los datos el usuario cerró sesión y entró de
    // nuevo (u otra sesión empezó), este resultado ya quedó obsoleto: no lo
    // apliques, para no pisar el estado de la sesión actual ni crashear
    // leyendo un state.user que ya cambió.
    if (mySession !== state.sessionId || !state.user) return;
    applyRoleScope();
    applyTecnicoScope();
    applySupervisorScope();
    applyReadOnlyUI();
    switchView((isTecnico() || isSupervisor()) ? 'ordenes' : 'dashboard');
  }).catch(function (err) {
    console.error('Error cargando datos:', err);
  });
}

function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';
  MENU.filter(function (item) { return item.roles.indexOf(state.user.rol) > -1; })
    .forEach(function (item) {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.textContent = item.label;
      btn.dataset.view = item.id;
      btn.addEventListener('click', function () { switchView(item.id); });
      nav.appendChild(btn);
    });
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function switchView(viewId) {
  state.currentView = viewId;
  document.querySelectorAll('.view').forEach(function (v) { v.classList.add('hidden'); });
  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(function (b) {
    b.classList.toggle('active', b.dataset.view === viewId);
  });
  const menuItem = MENU.find(function (m) { return m.id === viewId; });
  document.getElementById('viewTitle').textContent = menuItem ? menuItem.label : '';
  const sidebarEl = document.querySelector('.sidebar');
  if (sidebarEl) sidebarEl.classList.remove('open');

  if (viewId === 'dashboard') renderDashboard();
  else if (viewId === 'ordenes') renderOrdenesTable();
  else if (viewId === 'solicitud') renderSolicitudView();
  else if (ENTITIES[capitalize(viewId)]) renderEntityTable(capitalize(viewId));
}

/* ===================== CARGA DE DATOS ===================== */
const SHEETS = ['Sucursales', 'Tecnicos', 'Vehiculos', 'Ordenes', 'Inventario', 'Preventivo'];
function loadAll() {
  return Promise.all(SHEETS.map(function (name) { return refreshSheet(name); }));
}
function refreshSheet(name) {
  return apiCall('list', name).then(function (res) {
    state.cache[name] = (res && res.data) || [];
    return state.cache[name];
  });
}

/* ===================== ALCANCE POR ROL (Gerente de Área) ===================== */
function applyRoleScope() {
  if (!state.user) return;
  if (state.user.rol === 'Gerente de Área' && state.user.area) {
    const userArea = normalizeKey(state.user.area);
    const allowed = state.cache.Sucursales.filter(function (s) {
      return normalizeKey(getField(s, ['gerentearea'])) === userArea;
    });
    const allowedIds = allowed.map(function (s) { return sucursalKey(s); }).filter(function (k) { return !!k; });
    state.cache.Sucursales = allowed;
    state.cache.Ordenes = state.cache.Ordenes.filter(function (o) { return !!o.sucursal_id && allowedIds.indexOf(o.sucursal_id) > -1; });
  }
}

/* ===================== ALCANCE POR ROL (Técnico) =====================
   Un Técnico solo debe ver las órdenes que tiene asignadas. Para saber
   cuál es "su" técnico dentro de la hoja Tecnicos, el usuario debe tener
   en la hoja Usuarios una columna "tecnico_id" con el id o el nombre del
   técnico (tal como aparece en la hoja Tecnicos) — funciona igual que
   sucursal_id para Gerente de Sucursal. */
function tecnicoKey(t) { return getField(t, ['id']) || ''; }

function miTecnicoId() {
  const raw = String(state.user.tecnico_id || '').trim();
  if (!raw) return '';
  const rawNorm = normalizeSucursalName(raw);
  const match = state.cache.Tecnicos.find(function (t) {
    const key = tecnicoKey(t);
    const nom = getField(t, ['nombre']);
    return (!!key && (key === raw || normalizeSucursalName(key) === rawNorm)) ||
      (!!nom && normalizeSucursalName(nom) === rawNorm);
  });
  return match ? tecnicoKey(match) : raw;
}

function applyTecnicoScope() {
  if (!isTecnico()) return;
  const miId = miTecnicoId();
  state.cache.Ordenes = miId
    ? state.cache.Ordenes.filter(function (o) { return o.tecnico_id === miId; })
    : [];
}

/* ===================== ALCANCE POR ROL (Supervisor) =====================
   El Supervisor solo debe ver la pantalla de Órdenes de trabajo, y dentro de
   ella únicamente las órdenes Pendientes y las Finalizadas (no Asignado,
   En proceso ni Cancelado). */
function applySupervisorScope() {
  if (!isSupervisor()) return;
  state.cache.Ordenes = state.cache.Ordenes.filter(function (o) { return o.estado === 'Pendiente' || o.estado === 'Finalizado'; });
}

function applyReadOnlyUI() {
  const ro = isReadOnly();
  document.querySelectorAll('[data-add]').forEach(function (b) { b.classList.toggle('hidden', ro); });
  const btnNueva = document.getElementById('btnNuevaOrden');
  if (btnNueva) btnNueva.classList.toggle('hidden', ro);
}

/* ===================== HELPERS DE NOMBRES ===================== */
/* Busca un valor en una fila sin importar cómo esté escrito el encabezado
   en la hoja de cálculo (mayúsculas, espacios, guiones, tildes...). Google
   Apps Script usa el texto EXACTO del encabezado como llave del objeto, y
   en este proyecto los encabezados manuales han variado varias veces
   ("area" vs "Area", "NOMBRE" vs "nombre", etc.), así que en vez de asumir
   una sola escritura, normalizamos todas las llaves de la fila y buscamos
   por alias normalizados. */
function normalizeKey(k) { return stripAccents(String(k || '')).replace(/[^a-z0-9]/g, ''); }
function getField(obj, aliases) {
  if (!obj) return '';
  const keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    if (aliases.indexOf(normalizeKey(keys[i])) > -1) {
      var v = obj[keys[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
  }
  return '';
}

/* Clave real de una sucursal: en la hoja Sucursales la columna "id" quedó
   vacía en todas las filas cargadas manualmente, así que usamos la columna
   de código de sucursal (tipo "SS - Escalon - L001") como identificador
   verdadero, con "id" solo como respaldo para filas creadas desde la app. */
function sucursalKey(s) { return getField(s, ['sucursalid']) || getField(s, ['id']) || ''; }
/* Etiqueta a mostrar para una sucursal: prefiere el código real, luego el
   campo "nombre" (que en esta hoja a veces contiene el nombre de un
   contacto, no de la sucursal), y como último recurso la clave interna. */
function sucursalLabel(s) {
  return getField(s, ['sucursalid']) || getField(s, ['nombre']) || sucursalKey(s) || '(sin nombre)';
}

function sucursalNombre(id) {
  const s = id ? state.cache.Sucursales.find(function (x) { return !!sucursalKey(x) && sucursalKey(x) === id; }) : null;
  return s ? sucursalLabel(s) : (id || '');
}
function tecnicoNombre(id) {
  const t = state.cache.Tecnicos.find(function (x) { return x.id === id; });
  return t ? t.nombre : (id || '-');
}

/* Una orden se considera "abierta" (todavía requiere atención) si no está
   Finalizada ni Cancelada. Cancelado se trata como cerrada para efectos de
   pendientes/atrasadas/carga, pero no cuenta como un trabajo completado. */
function esOrdenAbierta(o) { return o.estado !== 'Finalizado' && o.estado !== 'Cancelado'; }

/* ===================== DASHBOARD ===================== */
let chartEstadoInstance = null;
let chartSucursalInstance = null;

function renderDashboard() {
  const ordenes = state.cache.Ordenes;
  const vehiculos = state.cache.Vehiculos;
  const scoped = state.user.rol === 'Gerente de Área';

  const abiertas = ordenes.filter(function (o) { return esOrdenAbierta(o); }).length;
  const cerradas = ordenes.filter(function (o) { return o.estado === 'Finalizado'; }).length;

  const tiempos = ordenes
    .filter(function (o) { return o.estado === 'Finalizado' && o.fecha && o.fecha_cierre; })
    .map(function (o) { return (new Date(o.fecha_cierre) - new Date(o.fecha)) / (1000 * 60 * 60 * 24); })
    .filter(function (n) { return !isNaN(n) && n >= 0; });
  const tiempoProm = tiempos.length
    ? (tiempos.reduce(function (a, b) { return a + b; }, 0) / tiempos.length).toFixed(1)
    : 0;

  const costoTotal = ordenes.reduce(function (sum, o) { return sum + (Number(o.costo) || 0); }, 0);

  document.getElementById('kpiAbiertas').textContent = abiertas;
  document.getElementById('kpiCerradas').textContent = cerradas;
  document.getElementById('kpiTiempo').textContent = tiempoProm;
  document.getElementById('kpiCosto').textContent = '$' + costoTotal.toFixed(2);
  document.getElementById('kpiFueraServicio').textContent = scoped
    ? 'N/D'
    : vehiculos.filter(function (v) { return v.estado === 'Fuera de servicio'; }).length;

  const porTecnico = {};
  ordenes.forEach(function (o) { if (o.tecnico_id) porTecnico[o.tecnico_id] = (porTecnico[o.tecnico_id] || 0) + 1; });
  let topTec = '-', topCount = 0;
  Object.keys(porTecnico).forEach(function (id) {
    if (porTecnico[id] > topCount) { topCount = porTecnico[id]; topTec = tecnicoNombre(id); }
  });
  document.getElementById('kpiTecnicoTop').textContent = topTec;

  renderChartEstado(ordenes);
  renderChartSucursal(ordenes);
  renderSucursalesGrid();
  renderSolicitudesPanel();
  renderPanelGestion();
}

/* ===================== VISTA GERENCIAL (Gerente de Área / Operaciones / Administrador) =====================
   Panel estilo "Dashboard de mantenimiento — Vista gerencial": KPIs, gráficas,
   resumen por sucursal, pendientes con detalle, tiempo de atención, tendencia
   vs. mes anterior, recurrencias por equipo y reincidencias. Todo reactivo a
   los filtros (sucursal/estado/prioridad/técnico/tipo). */
const ROLES_PANEL_GESTION = ['Administrador', 'Gerente de Operaciones', 'Gerente de Área'];
function mostrarPanelGestion() { return !!(state.user && ROLES_PANEL_GESTION.indexOf(state.user.rol) > -1); }

const ESTADOS_GV = ['Pendiente', 'Asignado', 'En proceso', 'Finalizado', 'Cancelado'];
const ESTADOS_GV_COLORES = { 'Pendiente': '#f4a300', 'Asignado': '#5e35b1', 'En proceso': '#1565c0', 'Finalizado': '#2a9d8f', 'Cancelado': '#607d8b' };
const PRIORIDADES_GV = ['Crítica', 'Alta', 'Media', 'Baja'];
const PRIORIDADES_GV_COLORES = { 'Crítica': '#b71c1c', 'Alta': '#c62828', 'Media': '#e65100', 'Baja': '#2e7d32' };

let gvFiltrosPoblados = false;
function poblarFiltrosGV() {
  if (gvFiltrosPoblados) return;
  const sucSel = document.getElementById('gvFiltroSucursal');
  if (sucSel) {
    sucSel.innerHTML = '<option value="">Sucursal (Todas)</option>' +
      state.cache.Sucursales.map(function (s) { return '<option value="' + sucursalKey(s) + '">' + sucursalLabel(s) + '</option>'; }).join('');
  }
  const tecSel = document.getElementById('gvFiltroTecnico');
  if (tecSel) {
    tecSel.innerHTML = '<option value="">Técnico (Todos)</option>' +
      state.cache.Tecnicos.map(function (t) { return '<option value="' + t.id + '">' + t.nombre + '</option>'; }).join('');
  }
  gvFiltrosPoblados = true;
}

function leerFiltrosGV() {
  function val(id) { const el = document.getElementById(id); return el ? el.value : ''; }
  return {
    sucursal: val('gvFiltroSucursal'),
    estado: val('gvFiltroEstado'),
    prioridad: val('gvFiltroPrioridad'),
    tecnico: val('gvFiltroTecnico'),
    tipo: val('gvFiltroTipo')
  };
}

function aplicarFiltrosGV(ordenes) {
  const f = leerFiltrosGV();
  return ordenes.filter(function (o) {
    if (f.sucursal && o.sucursal_id !== f.sucursal) return false;
    if (f.estado && o.estado !== f.estado) return false;
    if (f.prioridad && o.prioridad !== f.prioridad) return false;
    if (f.tecnico && o.tecnico_id !== f.tecnico) return false;
    if (f.tipo && o.tipo !== f.tipo) return false;
    return true;
  });
}

function limpiarFiltrosGV() {
  ['gvFiltroSucursal', 'gvFiltroEstado', 'gvFiltroPrioridad', 'gvFiltroTecnico', 'gvFiltroTipo'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderPanelGestion();
}

function renderPanelGestion() {
  const card = document.getElementById('panelGestionCard');
  if (!card) return;
  if (!mostrarPanelGestion()) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');

  poblarFiltrosGV();

  const actualizadoEl = document.getElementById('gvActualizado');
  if (actualizadoEl) actualizadoEl.textContent = 'Última actualización: ' + new Date().toLocaleString();

  const ordenes = aplicarFiltrosGV(state.cache.Ordenes);

  renderGvKpis(ordenes);
  renderGvChartMensual(ordenes);
  renderGvChartEstado(ordenes);
  renderGvChartPrioridad(ordenes);
  renderGvResumenSucursal(ordenes);
  renderGvPendientesDetalle(ordenes);
  renderGvTiempoSucursal(ordenes);
  renderGvTendencia(ordenes);
  renderGvRecurrentes(ordenes);
  renderGvTopTecnicos(ordenes);
  renderGvReincidencias(ordenes);
}

function diasAbiertos(o, hoy) {
  if (!o.fecha) return 0;
  const f = new Date(o.fecha);
  if (isNaN(f)) return 0;
  const fin = esOrdenAbierta(o) ? hoy : (o.fecha_cierre ? new Date(o.fecha_cierre) : hoy);
  return Math.round((fin - f) / 86400000);
}

function tiempoPromedioDias(ordenes) {
  const tiempos = ordenes
    .filter(function (o) { return o.estado === 'Finalizado' && o.fecha && o.fecha_cierre; })
    .map(function (o) { return (new Date(o.fecha_cierre) - new Date(o.fecha)) / 86400000; })
    .filter(function (n) { return !isNaN(n) && n >= 0; });
  return tiempos.length ? (tiempos.reduce(function (a, b) { return a + b; }, 0) / tiempos.length) : 0;
}

function renderGvKpis(ordenes) {
  const requeridos = ordenes.length;
  const finalizados = ordenes.filter(function (o) { return o.estado === 'Finalizado'; }).length;
  const enProceso = ordenes.filter(function (o) { return o.estado === 'En proceso'; }).length;
  const pendientes = ordenes.filter(function (o) { return o.estado === 'Pendiente'; }).length;
  const cumplimiento = requeridos ? (finalizados / requeridos) * 100 : 0;
  const tiempoProm = tiempoPromedioDias(ordenes);
  const criticos = ordenes.filter(function (o) { return o.prioridad === 'Crítica' && esOrdenAbierta(o); }).length;

  document.getElementById('gvRequeridos').textContent = requeridos;
  document.getElementById('gvFinalizados').textContent = finalizados;
  document.getElementById('gvEnProceso').textContent = enProceso;
  document.getElementById('gvPendientesKpi').textContent = pendientes;
  document.getElementById('gvCumplimiento').textContent = cumplimiento.toFixed(1) + '%';
  document.getElementById('gvTiempoProm').textContent = tiempoProm.toFixed(1);
  document.getElementById('gvCriticos').textContent = criticos;
}

let chartGvMensualInstance = null;
function renderGvChartMensual(ordenes) {
  const ctx = document.getElementById('chartGvMensual');
  if (!ctx || typeof Chart === 'undefined') return;

  const hoy = new Date();
  const meses = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push({ label: d.toLocaleDateString('es', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() });
  }
  const requeridosPorMes = meses.map(function (m) {
    return ordenes.filter(function (o) {
      if (!o.fecha) return false;
      const f = new Date(o.fecha);
      return !isNaN(f) && f.getFullYear() === m.year && f.getMonth() === m.month;
    }).length;
  });
  const finalizadosPorMes = meses.map(function (m) {
    return ordenes.filter(function (o) {
      if (o.estado !== 'Finalizado' || !o.fecha_cierre) return false;
      const f = new Date(o.fecha_cierre);
      return !isNaN(f) && f.getFullYear() === m.year && f.getMonth() === m.month;
    }).length;
  });
  const cumplimientoPorMes = meses.map(function (m, i) {
    return requeridosPorMes[i] ? Math.round((finalizadosPorMes[i] / requeridosPorMes[i]) * 100) : 0;
  });

  if (chartGvMensualInstance) chartGvMensualInstance.destroy();
  chartGvMensualInstance = new Chart(ctx, {
    data: {
      labels: meses.map(function (m) { return m.label; }),
      datasets: [
        { type: 'bar', label: 'Requeridos', data: requeridosPorMes, backgroundColor: '#14486b', order: 2 },
        { type: 'bar', label: 'Finalizados', data: finalizadosPorMes, backgroundColor: '#2a9d8f', order: 2 },
        { type: 'line', label: '% Cumplimiento', data: cumplimientoPorMes, borderColor: '#f4a300', backgroundColor: '#f4a300', yAxisID: 'y1', order: 1, tension: 0.3 }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { beginAtZero: true },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: function (v) { return v + '%'; } } }
      }
    }
  });
}

let chartGvEstadoInstance = null;
function renderGvChartEstado(ordenes) {
  const ctx = document.getElementById('chartGvEstado');
  if (!ctx || typeof Chart === 'undefined') return;
  const counts = ESTADOS_GV.map(function (e) { return ordenes.filter(function (o) { return o.estado === e; }).length; });
  if (chartGvEstadoInstance) chartGvEstadoInstance.destroy();
  chartGvEstadoInstance = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ESTADOS_GV, datasets: [{ data: counts, backgroundColor: ESTADOS_GV.map(function (e) { return ESTADOS_GV_COLORES[e]; }) }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
}

let chartGvPrioridadInstance = null;
function renderGvChartPrioridad(ordenes) {
  const ctx = document.getElementById('chartGvPrioridad');
  if (!ctx || typeof Chart === 'undefined') return;
  const counts = PRIORIDADES_GV.map(function (p) { return ordenes.filter(function (o) { return o.prioridad === p; }).length; });
  if (chartGvPrioridadInstance) chartGvPrioridadInstance.destroy();
  chartGvPrioridadInstance = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: PRIORIDADES_GV, datasets: [{ data: counts, backgroundColor: PRIORIDADES_GV.map(function (p) { return PRIORIDADES_GV_COLORES[p]; }) }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
}

function renderGvResumenSucursal(ordenes) {
  const table = document.getElementById('table-GvResumenSucursal');
  if (!table) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '<tr><th>Sucursal</th><th>Requeridos</th><th>Finalizados</th><th>Pendientes</th><th>% Cumplimiento</th><th>Críticos pendientes</th></tr>';

  const filas = state.cache.Sucursales.map(function (s) {
    const key = sucursalKey(s);
    const propias = key ? ordenes.filter(function (o) { return o.sucursal_id === key; }) : [];
    const requeridos = propias.length;
    const finalizados = propias.filter(function (o) { return o.estado === 'Finalizado'; }).length;
    const pendientes = propias.filter(function (o) { return esOrdenAbierta(o); }).length;
    const criticos = propias.filter(function (o) { return o.prioridad === 'Crítica' && esOrdenAbierta(o); }).length;
    const cumplimiento = requeridos ? (finalizados / requeridos) * 100 : 0;
    return { nombre: sucursalLabel(s), requeridos: requeridos, finalizados: finalizados, pendientes: pendientes, criticos: criticos, cumplimiento: cumplimiento };
  }).filter(function (r) { return r.requeridos > 0; })
    .sort(function (a, b) { return b.pendientes - a.pendientes || b.requeridos - a.requeridos; })
    .slice(0, 15);

  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-muted);">Sin órdenes registradas todavía.</td></tr>';
  } else {
    const totReq = ordenes.length;
    const totFin = ordenes.filter(function (o) { return o.estado === 'Finalizado'; }).length;
    const totPend = ordenes.filter(function (o) { return esOrdenAbierta(o); }).length;
    const totCrit = ordenes.filter(function (o) { return o.prioridad === 'Crítica' && esOrdenAbierta(o); }).length;
    const totCump = totReq ? (totFin / totReq) * 100 : 0;

    function barraColor(pct) { return pct >= 80 ? 'var(--success)' : (pct >= 50 ? 'var(--warning)' : 'var(--danger)'); }
    function fila(r, esTotal) {
      return '<tr' + (esTotal ? ' style="font-weight:700;background:#f9fafb;"' : '') + '>' +
        '<td>' + r.nombre + '</td><td>' + r.requeridos + '</td><td>' + r.finalizados + '</td><td>' + r.pendientes + '</td>' +
        '<td><div style="display:flex;align-items:center;gap:6px;"><div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:' + r.cumplimiento.toFixed(0) + '%;background:' + barraColor(r.cumplimiento) + ';"></div></div><span style="font-size:12px;">' + r.cumplimiento.toFixed(1) + '%</span></div></td>' +
        '<td>' + r.criticos + '</td></tr>';
    }
    tbody.innerHTML = filas.map(function (r) { return fila(r, false); }).join('') +
      fila({ nombre: 'TOTAL', requeridos: totReq, finalizados: totFin, pendientes: totPend, criticos: totCrit, cumplimiento: totCump }, true);
  }
}

function renderGvPendientesDetalle(ordenes) {
  const table = document.getElementById('table-GvPendientesDetalle');
  if (!table) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '<tr><th>Fecha solicitud</th><th>Sucursal</th><th>Equipo/Área</th><th>Problema</th><th>Prioridad</th><th>Días pendiente</th><th>Estado</th></tr>';

  const hoy = new Date();
  const filas = ordenes.filter(function (o) {
    if (!esOrdenAbierta(o) || !o.fecha) return false;
    return diasAbiertos(o, hoy) > 2;
  }).sort(function (a, b) { return diasAbiertos(b, hoy) - diasAbiertos(a, hoy); });

  if (!filas.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted);">No hay mantenimientos con más de 2 días pendientes.</td></tr>';
  } else {
    tbody.innerHTML = filas.map(function (o) {
      return '<tr><td>' + new Date(o.fecha).toLocaleDateString() + '</td><td>' + sucursalNombre(o.sucursal_id) + '</td>' +
        '<td>' + (o.equipo || '-') + '</td><td>' + (o.descripcion || '') + '</td>' +
        '<td><span class="' + prioridadClass(o.prioridad) + '">' + (o.prioridad || '') + '</span></td>' +
        '<td class="tiempo-critico">' + diasAbiertos(o, hoy) + '</td>' +
        '<td><span class="badge badge-' + String(o.estado || '').toLowerCase().replace(/\s+/g, '') + '">' + (o.estado || '') + '</span></td></tr>';
    }).join('');
  }
}

let chartGvTiempoSucursalInstance = null;
function renderGvTiempoSucursal(ordenes) {
  const ctx = document.getElementById('chartGvTiempoSucursal');
  const callout = document.getElementById('gvPromedioGeneral');
  if (callout) callout.textContent = 'Promedio general: ' + tiempoPromedioDias(ordenes).toFixed(1) + ' días';
  if (!ctx || typeof Chart === 'undefined') return;

  const porSucursal = {};
  ordenes.forEach(function (o) {
    if (o.estado !== 'Finalizado' || !o.fecha || !o.fecha_cierre || !o.sucursal_id) return;
    const dias = (new Date(o.fecha_cierre) - new Date(o.fecha)) / 86400000;
    if (isNaN(dias) || dias < 0) return;
    if (!porSucursal[o.sucursal_id]) porSucursal[o.sucursal_id] = { total: 0, count: 0 };
    porSucursal[o.sucursal_id].total += dias;
    porSucursal[o.sucursal_id].count++;
  });
  const filas = Object.keys(porSucursal).map(function (id) {
    return { nombre: sucursalNombre(id), prom: porSucursal[id].total / porSucursal[id].count };
  }).sort(function (a, b) { return b.prom - a.prom; }).slice(0, 12);

  if (chartGvTiempoSucursalInstance) chartGvTiempoSucursalInstance.destroy();
  chartGvTiempoSucursalInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: filas.map(function (f) { return f.nombre; }), datasets: [{ label: 'Días promedio', data: filas.map(function (f) { return f.prom.toFixed(1); }), backgroundColor: '#2a9d8f' }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } } }
  });
}

function mesRango(offset) {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - offset, 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() - offset + 1, 1);
  return { inicio: inicio, fin: fin };
}

function metricasDelMes(ordenes, rango) {
  const requeridos = ordenes.filter(function (o) {
    if (!o.fecha) return false;
    const f = new Date(o.fecha);
    return !isNaN(f) && f >= rango.inicio && f < rango.fin;
  }).length;
  const finalizados = ordenes.filter(function (o) {
    if (o.estado !== 'Finalizado' || !o.fecha_cierre) return false;
    const f = new Date(o.fecha_cierre);
    return !isNaN(f) && f >= rango.inicio && f < rango.fin;
  }).length;
  const pendientes = ordenes.filter(function (o) {
    if (!o.fecha || !esOrdenAbierta(o)) return false;
    const f = new Date(o.fecha);
    return !isNaN(f) && f >= rango.inicio && f < rango.fin;
  }).length;
  const cumplimiento = requeridos ? (finalizados / requeridos) * 100 : 0;
  return { requeridos: requeridos, finalizados: finalizados, pendientes: pendientes, cumplimiento: cumplimiento };
}

function renderGvTendencia(ordenes) {
  const actual = metricasDelMes(ordenes, mesRango(0));
  const anterior = metricasDelMes(ordenes, mesRango(1));

  function pintar(prefijo, valorActual, valorAnterior, formato) {
    const vEl = document.getElementById(prefijo + 'V');
    const cEl = document.getElementById(prefijo + 'C');
    const sEl = document.getElementById(prefijo + 'S');
    if (!vEl) return;
    vEl.textContent = formato ? valorActual.toFixed(1) + '%' : valorActual;
    if (!valorAnterior) {
      cEl.innerHTML = '<span class="trend-sub">Sin datos del mes anterior</span>';
      sEl.textContent = '';
      return;
    }
    const cambio = ((valorActual - valorAnterior) / valorAnterior) * 100;
    const subeEsBueno = prefijo !== 'gvTrendPendientes';
    const subio = cambio > 0;
    const esBueno = subio === subeEsBueno;
    const flecha = subio ? '▲' : (cambio < 0 ? '▼' : '➡️');
    cEl.innerHTML = '<span class="' + (cambio === 0 ? 'trend-sub' : (esBueno ? 'trend-change-up' : 'trend-change-down')) + '">' + flecha + ' ' + Math.abs(cambio).toFixed(1) + '%</span>';
    sEl.textContent = 'Mes anterior: ' + (formato ? valorAnterior.toFixed(1) + '%' : valorAnterior);
  }

  pintar('gvTrendRequeridos', actual.requeridos, anterior.requeridos, false);
  pintar('gvTrendFinalizados', actual.finalizados, anterior.finalizados, false);
  pintar('gvTrendPendientes', actual.pendientes, anterior.pendientes, false);
  pintar('gvTrendCumplimiento', actual.cumplimiento, anterior.cumplimiento, true);
}

let chartGvRecurrentesInstance = null;
function renderGvRecurrentes(ordenes) {
  const ctx = document.getElementById('chartGvRecurrentes');
  if (!ctx || typeof Chart === 'undefined') return;
  const porEquipo = {};
  ordenes.forEach(function (o) {
    const eq = String(o.equipo || '').trim();
    if (!eq) return;
    porEquipo[eq] = (porEquipo[eq] || 0) + 1;
  });
  const top = Object.keys(porEquipo).map(function (eq) { return { eq: eq, count: porEquipo[eq] }; })
    .sort(function (a, b) { return b.count - a.count; }).slice(0, 5);

  if (chartGvRecurrentesInstance) chartGvRecurrentesInstance.destroy();
  chartGvRecurrentesInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: top.map(function (t) { return t.eq; }), datasets: [{ label: 'Incidencias', data: top.map(function (t) { return t.count; }), backgroundColor: '#1e6091' }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } } }
  });
}

function renderGvTopTecnicos(ordenes) {
  const el = document.getElementById('gkTopTecnicos');
  if (!el) return;
  const porTecnicoAbiertas = {};
  ordenes.forEach(function (o) {
    if (o.tecnico_id && esOrdenAbierta(o)) porTecnicoAbiertas[o.tecnico_id] = (porTecnicoAbiertas[o.tecnico_id] || 0) + 1;
  });
  const topTecnicos = Object.keys(porTecnicoAbiertas)
    .map(function (id) { return { id: id, count: porTecnicoAbiertas[id] }; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, 5);
  el.innerHTML = topTecnicos.length
    ? topTecnicos.map(function (x) { return '<li>' + tecnicoNombre(x.id) + ' — ' + x.count + ' orden(es) abiertas</li>'; }).join('')
    : '<li style="color:var(--text-muted);">Sin datos todavía.</li>';
}

function renderGvReincidencias(ordenes) {
  const table = document.getElementById('table-GvReincidencias');
  if (!table) return;
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '<tr><th>Sucursal</th><th>Equipo</th><th>Incidencias</th><th>Última reparación</th></tr>';

  const grupos = {};
  ordenes.forEach(function (o) {
    const eq = String(o.equipo || '').trim();
    if (!eq || !o.sucursal_id) return;
    const clave = o.sucursal_id + '||' + eq;
    if (!grupos[clave]) grupos[clave] = { sucursal_id: o.sucursal_id, equipo: eq, count: 0, ultima: null };
    grupos[clave].count++;
    const f = o.fecha_cierre ? new Date(o.fecha_cierre) : (o.fecha ? new Date(o.fecha) : null);
    if (f && !isNaN(f) && (!grupos[clave].ultima || f > grupos[clave].ultima)) grupos[clave].ultima = f;
  });

  const top = Object.keys(grupos).map(function (k) { return grupos[k]; })
    .filter(function (g) { return g.count >= 2; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, 5);

  if (!top.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted);">Sin reincidencias registradas todavía.</td></tr>';
  } else {
    tbody.innerHTML = top.map(function (g) {
      return '<tr><td>' + sucursalNombre(g.sucursal_id) + '</td><td>' + g.equipo + '</td><td>' + g.count + '</td>' +
        '<td>' + (g.ultima ? g.ultima.toLocaleDateString() : '-') + '</td></tr>';
    }).join('');
  }
}

/* ===================== PANEL DE SOLICITUDES POR SUCURSAL + INSIGHTS ===================== */
/* Identifica si una orden viene del formulario "Reportar necesidad" (Gerente
   de Sucursal). Preferimos la columna "origen" si existe; si la hoja Ordenes
   todavía no la tiene, usamos una heurística de respaldo: una solicitud
   enviada desde ese formulario siempre deja técnico, vehículo y costo vacíos. */
function esSolicitud(o) {
  const origen = getField(o, ['origen']);
  if (origen) return origen === 'solicitud_sucursal';
  return !o.tecnico_id && !o.vehiculo_id && !o.costo;
}

function renderSolicitudesPanel() {
  const solicitudes = state.cache.Ordenes.filter(esSolicitud);
  const bySuc = {};
  solicitudes.forEach(function (o) {
    const suc = o.sucursal_id || '(sin sucursal)';
    if (!bySuc[suc]) bySuc[suc] = { total: 0, pendiente: 0, enProceso: 0, finalizado: 0, urgentesAbiertas: 0, ultima: null };
    const g = bySuc[suc];
    g.total++;
    if (o.estado === 'Pendiente') g.pendiente++;
    else if (o.estado === 'En proceso') g.enProceso++;
    else if (o.estado === 'Finalizado') g.finalizado++;
    if (o.prioridad === 'Alta' && esOrdenAbierta(o)) g.urgentesAbiertas++;
    const f = o.fecha ? new Date(o.fecha) : null;
    if (f && !isNaN(f) && (!g.ultima || f > g.ultima)) g.ultima = f;
  });

  const table = document.getElementById('table-SolicitudesResumen');
  if (table) {
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    thead.innerHTML = '<tr><th>Sucursal</th><th>Total</th><th>Pendientes</th><th>En proceso</th><th>Finalizadas</th><th>Urgentes abiertas</th><th>Última solicitud</th></tr>';

    const rows = Object.keys(bySuc).map(function (suc) { return { suc: suc, g: bySuc[suc] }; })
      .sort(function (a, b) { return b.g.pendiente - a.g.pendiente || b.g.total - a.g.total; });

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted);">Aún no hay solicitudes reportadas por sucursales.</td></tr>';
    } else {
      tbody.innerHTML = rows.map(function (r) {
        return '<tr><td>' + sucursalNombre(r.suc) + '</td>' +
          '<td>' + r.g.total + '</td>' +
          '<td>' + r.g.pendiente + '</td>' +
          '<td>' + r.g.enProceso + '</td>' +
          '<td>' + r.g.finalizado + '</td>' +
          '<td>' + (r.g.urgentesAbiertas || '-') + '</td>' +
          '<td>' + (r.g.ultima ? r.g.ultima.toLocaleDateString() : '-') + '</td></tr>';
      }).join('');
    }
  }

  renderInsights(solicitudes, bySuc);
}

function renderInsights(solicitudes, bySuc) {
  const list = document.getElementById('insightsList');
  if (!list) return;
  const items = [];

  if (!solicitudes.length) {
    items.push('Todavía no se han registrado solicitudes de mantenimiento desde las sucursales.');
  } else {
    let peorSuc = null, peorPend = 0;
    Object.keys(bySuc).forEach(function (suc) {
      if (bySuc[suc].pendiente > peorPend) { peorPend = bySuc[suc].pendiente; peorSuc = suc; }
    });
    if (peorSuc && peorPend > 0) {
      items.push('<b>' + sucursalNombre(peorSuc) + '</b> es la sucursal con más solicitudes pendientes (' + peorPend + '). Conviene priorizar su atención.');
    }

    const hoy = new Date();
    const pendientesViejas = solicitudes.filter(function (o) {
      if (!esOrdenAbierta(o) || !o.fecha) return false;
      const f = new Date(o.fecha);
      if (isNaN(f)) return false;
      return (hoy - f) / 86400000 > 7;
    });
    if (pendientesViejas.length) {
      items.push(pendientesViejas.length + ' solicitud(es) llevan más de 7 días abiertas sin cerrarse. Riesgo de acumulación de mantenimiento correctivo.');
    }

    const urgentesAbiertas = solicitudes.filter(function (o) { return o.prioridad === 'Alta' && esOrdenAbierta(o); });
    if (urgentesAbiertas.length) {
      items.push(urgentesAbiertas.length + ' solicitud(es) marcadas como urgentes siguen abiertas.');
    }

    const porTipo = {};
    solicitudes.forEach(function (o) { const t = o.tipo || 'Sin tipo'; porTipo[t] = (porTipo[t] || 0) + 1; });
    const tipoTop = Object.keys(porTipo).sort(function (a, b) { return porTipo[b] - porTipo[a]; })[0];
    if (tipoTop) {
      const pct = Math.round((porTipo[tipoTop] / solicitudes.length) * 100);
      items.push('El ' + pct + '% de las solicitudes son de tipo "' + tipoTop + '"' +
        (tipoTop === 'Correctivo' ? ' — conviene reforzar el mantenimiento preventivo para reducir fallas reactivas.' : '.'));
    }

    const finalizadas = solicitudes.filter(function (o) { return o.estado === 'Finalizado'; }).length;
    const tasaResolucion = Math.round((finalizadas / solicitudes.length) * 100);
    items.push('Tasa de resolución de solicitudes: ' + tasaResolucion + '% (' + finalizadas + ' de ' + solicitudes.length + ').');

    const sucursalesConSolicitud = Object.keys(bySuc).length;
    items.push(sucursalesConSolicitud + ' sucursal(es) han reportado al menos una solicitud de mantenimiento.');
  }

  list.innerHTML = items.map(function (t) { return '<li>' + t + '</li>'; }).join('');
}

function renderChartEstado(ordenes) {
  const counts = { 'Pendiente': 0, 'En proceso': 0, 'Finalizado': 0 };
  ordenes.forEach(function (o) { if (counts[o.estado] !== undefined) counts[o.estado]++; });
  const ctx = document.getElementById('chartEstado');
  if (!ctx || typeof Chart === 'undefined') return;
  if (chartEstadoInstance) chartEstadoInstance.destroy();
  chartEstadoInstance = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: Object.keys(counts), datasets: [{ data: Object.values(counts), backgroundColor: ['#f4a300', '#1565c0', '#2a9d8f'] }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
}

function renderChartSucursal(ordenes) {
  const counts = {};
  ordenes.forEach(function (o) {
    const n = sucursalNombre(o.sucursal_id);
    counts[n] = (counts[n] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
  const ctx = document.getElementById('chartSucursal');
  if (!ctx || typeof Chart === 'undefined') return;
  if (chartSucursalInstance) chartSucursalInstance.destroy();
  chartSucursalInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(function (e) { return e[0]; }),
      datasets: [{ label: 'Órdenes', data: sorted.map(function (e) { return e[1]; }), backgroundColor: '#1e6091' }]
    },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { autoSkip: false, maxRotation: 60, minRotation: 30 } } } }
  });
}

/* El color de cada sucursal refleja sus órdenes de trabajo abiertas (no el
   campo "estado" de la hoja Sucursales, que casi nunca varía): rojo si
   tiene alguna urgente sin resolver, naranja si tiene pendientes, azul si
   tiene en proceso, verde si no tiene nada abierto. */
function renderSucursalesGrid() {
  const grid = document.getElementById('sucursalesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const ordenes = state.cache.Ordenes;
  state.cache.Sucursales.forEach(function (s) {
    const key = sucursalKey(s);
    const abiertas = key ? ordenes.filter(function (o) { return o.sucursal_id === key && esOrdenAbierta(o); }) : [];
    let cls = 'sucursal-badge';
    if (abiertas.some(function (o) { return o.prioridad === 'Alta' || o.prioridad === 'Crítica'; })) cls += ' urgente';
    else if (abiertas.some(function (o) { return o.estado === 'Pendiente'; })) cls += ' pendiente';
    else if (abiertas.some(function (o) { return o.estado === 'En proceso'; })) cls += ' enproceso';
    const badge = document.createElement('div');
    badge.className = cls;
    badge.title = abiertas.length + ' orden(es) abierta(s)';
    badge.textContent = sucursalLabel(s);
    grid.appendChild(badge);
  });
}

/* ===================== CRUD GENÉRICO (Sucursales/Tecnicos/Vehiculos/Inventario/Preventivo) ===================== */
function renderEntityTable(entityName) {
  const entity = ENTITIES[entityName];
  const table = document.getElementById('table-' + entityName);
  if (!table || !entity) return;
  const rows = state.cache[entityName] || [];
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const ro = isReadOnly();

  thead.innerHTML = '<tr>' + entity.fields.map(function (f) { return '<th>' + f.label + '</th>'; }).join('') +
    (ro ? '' : '<th>Acciones</th>') + '</tr>';

  tbody.innerHTML = '';
  rows.forEach(function (row) {
    const tr = document.createElement('tr');
    entity.fields.forEach(function (f) {
      const td = document.createElement('td');
      td.textContent = f.key === 'sucursal_id' ? sucursalNombre(row[f.key]) : (row[f.key] !== undefined ? row[f.key] : '');
      tr.appendChild(td);
    });
    if (!ro) {
      const tdActions = document.createElement('td');
      tdActions.className = 'row-actions';
      const editBtn = document.createElement('button');
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', function () { openEntityModal(entityName, row); });
      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', function () {
        if (!confirm('¿Eliminar este registro?')) return;
        apiCall('delete', entityName, { id: row.id }).then(function () { return refreshSheet(entityName); })
          .then(function () { renderEntityTable(entityName); });
      });
      tdActions.appendChild(editBtn);
      tdActions.appendChild(delBtn);
      tr.appendChild(tdActions);
    }
    tbody.appendChild(tr);
  });
}

function openEntityModal(entityName, existing) {
  const entity = ENTITIES[entityName];
  state.editing = { sheet: entityName, id: existing ? existing.id : null };
  document.getElementById('modalTitle').textContent = (existing ? 'Editar ' : 'Nuevo/a ') + entity.label;
  const body = document.getElementById('modalBody');
  body.innerHTML = '';
  entity.fields.forEach(function (f) {
    const label = document.createElement('label');
    label.textContent = f.label;
    body.appendChild(label);
    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      f.options.forEach(function (opt) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        input.appendChild(o);
      });
    } else if (f.type === 'sucursal-select') {
      input = document.createElement('select');
      state.cache.Sucursales.forEach(function (s) {
        const o = document.createElement('option');
        o.value = sucursalKey(s); o.textContent = sucursalLabel(s);
        input.appendChild(o);
      });
    } else {
      input = document.createElement('input');
      input.type = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text');
    }
    input.id = 'field_' + f.key;
    if (existing && existing[f.key] !== undefined) input.value = existing[f.key];
    body.appendChild(input);
  });
  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeEntityModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  state.editing = null;
}

function saveEntityModal() {
  if (!state.editing) return;
  const entityName = state.editing.sheet;
  const entity = ENTITIES[entityName];
  const data = {};
  if (state.editing.id) data.id = state.editing.id;
  entity.fields.forEach(function (f) {
    const el = document.getElementById('field_' + f.key);
    if (el) data[f.key] = el.value;
  });
  const action = state.editing.id ? 'update' : 'create';
  apiCall(action, entityName, data).then(function () {
    return refreshSheet(entityName);
  }).then(function () {
    if (entityName === 'Sucursales' && isAreaManager()) applyRoleScope();
    renderEntityTable(entityName);
    closeEntityModal();
  }).catch(function (err) { alert('Error al guardar: ' + err.message); });
}

/* ===================== EXPORTAR CSV ===================== */
function exportCSV(entityName) {
  const rows = state.cache[entityName] || [];
  if (!rows.length) { alert('No hay datos para exportar.'); return; }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  rows.forEach(function (row) {
    lines.push(headers.map(function (h) {
      const val = String(row[h] !== undefined ? row[h] : '').replace(/"/g, '""');
      return '"' + val + '"';
    }).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = entityName + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* ===================== ÓRDENES DE TRABAJO ===================== */
/* Días transcurridos desde que se creó la orden hasta que se cerró (o hasta
   hoy si sigue abierta), y una clase de color según qué tan urgente es la
   espera. Esto también sirve como indicador de "tiempo de espera" para
   priorizar qué órdenes atender primero. */
function tiempoEsperaInfo(o) {
  if (!o.fecha) return { texto: '-', clase: '' };
  const inicio = new Date(o.fecha);
  if (isNaN(inicio)) return { texto: '-', clase: '' };
  const cerrada = !esOrdenAbierta(o);
  let fin = new Date();
  if (cerrada && o.fecha_cierre) {
    const fc = new Date(o.fecha_cierre);
    if (!isNaN(fc)) fin = fc;
  }
  const dias = Math.max(0, Math.round((fin - inicio) / 86400000));
  if (o.estado === 'Cancelado') {
    return { texto: dias + ' día(s) (cancelado)', clase: '' };
  }
  if (o.estado === 'Finalizado') {
    return { texto: dias + ' día(s) (resuelto)', clase: 'tiempo-ok' };
  }
  let clase = 'tiempo-ok';
  if (dias > 5) clase = 'tiempo-critico';
  else if (dias >= 2) clase = 'tiempo-alerta';
  return { texto: dias + ' día(s) esperando', clase: clase };
}

function ordenRowClass(o) {
  if (o.estado === 'Finalizado') return 'orden-finalizado';
  if (o.estado === 'Cancelado') return 'orden-cancelado';
  if (o.estado === 'En proceso') return 'orden-enproceso';
  if (o.estado === 'Asignado') return 'orden-asignado';
  return 'orden-pendiente';
}

function prioridadClass(p) {
  const key = stripAccents(String(p || '')).replace(/[^a-z]/g, '');
  if (key === 'critica') return 'prioridad-critica';
  if (key === 'alta') return 'prioridad-alta';
  if (key === 'media') return 'prioridad-media';
  if (key === 'baja') return 'prioridad-baja';
  return '';
}

function renderOrdenesTable() {
  const table = document.getElementById('table-Ordenes');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const filtro = document.getElementById('filtroEstado').value;
  let ordenes = state.cache.Ordenes.slice();
  if (filtro) ordenes = ordenes.filter(function (o) { return o.estado === filtro; });

  // El Técnico puede ver sus órdenes asignadas, pero no editarlas ni
  // eliminarlas — solo consulta.
  const fullEdit = !isReadOnly() && !isTecnico();
  const quickActions = isAreaManager();

  thead.innerHTML = '<tr><th>Fecha</th><th>Sucursal</th><th>Tipo</th><th>Descripción</th><th>Técnico</th><th>Estado</th><th>Prioridad</th><th>Costo</th><th>Tiempo de espera</th>' +
    ((fullEdit || quickActions) ? '<th>Acciones</th>' : '') + '</tr>';

  tbody.innerHTML = '';
  ordenes.forEach(function (o) {
    const tr = document.createElement('tr');
    tr.className = ordenRowClass(o);
    const tiempo = tiempoEsperaInfo(o);
    tr.innerHTML =
      '<td>' + (o.fecha ? new Date(o.fecha).toLocaleDateString() : '') + '</td>' +
      '<td>' + sucursalNombre(o.sucursal_id) + '</td>' +
      '<td>' + (o.tipo || '') + '</td>' +
      '<td>' + (o.descripcion || '') + '</td>' +
      '<td>' + tecnicoNombre(o.tecnico_id) + '</td>' +
      '<td><span class="badge badge-' + String(o.estado || '').toLowerCase().replace(/\s+/g, '') + '">' + (o.estado || '') + '</span></td>' +
      '<td><span class="' + prioridadClass(o.prioridad) + '">' + (o.prioridad || '') + '</span></td>' +
      '<td>' + (o.costo ? '$' + Number(o.costo).toFixed(2) : '') + '</td>' +
      '<td class="' + tiempo.clase + '">' + tiempo.texto + '</td>';

    if (fullEdit) {
      const td = document.createElement('td');
      td.className = 'row-actions';
      const editBtn = document.createElement('button');
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', function () { openOrdenModal(o); });
      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', function () {
        if (!confirm('¿Eliminar esta orden?')) return;
        apiCall('delete', 'Ordenes', { id: o.id }).then(refreshOrdenesForRole).then(renderOrdenesTable);
      });
      td.appendChild(editBtn); td.appendChild(delBtn);
      tr.appendChild(td);
    } else if (quickActions) {
      const td = document.createElement('td');
      td.className = 'row-actions';
      if (o.prioridad !== 'Alta') {
        const urgBtn = document.createElement('button');
        urgBtn.textContent = '🔴 Urgente';
        urgBtn.addEventListener('click', function () { marcarOrden(o.id, 'prioridad', 'Alta'); });
        td.appendChild(urgBtn);
      }
      if (o.tipo !== 'Extraordinario') {
        const extBtn = document.createElement('button');
        extBtn.textContent = '⚠️ Extraordinario';
        extBtn.addEventListener('click', function () { marcarOrden(o.id, 'tipo', 'Extraordinario'); });
        td.appendChild(extBtn);
      }
      if (esOrdenAbierta(o)) {
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✅ Cerrado';
        closeBtn.addEventListener('click', function () { abrirCierreModal(o.id); });
        td.appendChild(closeBtn);
      }
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
}

function refreshOrdenesForRole() {
  return refreshSheet('Ordenes').then(function () {
    if (isAreaManager()) applyRoleScope();
    if (isTecnico()) applyTecnicoScope();
    if (isSupervisor()) applySupervisorScope();
  });
}

function marcarOrden(id, campo, valor) {
  const data = { id: id };
  data[campo] = valor;
  apiCall('update', 'Ordenes', data).then(refreshOrdenesForRole).then(renderOrdenesTable);
}

/* ===================== MODAL FIRMA Y CIERRE RÁPIDO =====================
   Lo usan: el botón "Cerrado" del Gerente de Área en Órdenes de trabajo, y
   el botón "Cerrado" del Gerente de Sucursal en "Mis solicitudes" (para que
   quien reportó la necesidad confirme y firme que ya se resolvió). */
let cierreOrdenId = null;

function abrirCierreModal(id) {
  cierreOrdenId = id;
  clearCierreSignaturePad();
  document.getElementById('cierreModalOverlay').classList.remove('hidden');
}

function cerrarCierreModal() {
  document.getElementById('cierreModalOverlay').classList.add('hidden');
  cierreOrdenId = null;
}

function refrescarVistaTrasOrden() {
  return state.currentView === 'solicitud' ? renderSolicitudView() : refreshOrdenesForRole().then(renderOrdenesTable);
}

function confirmarCierre() {
  if (!cierreOrdenId) return;
  const idQueSeEstaCerrando = cierreOrdenId;
  const canvas = document.getElementById('cierreSignaturePad');
  const firma = compressedSignatureDataUrl(canvas);
  apiCall('update', 'Ordenes', {
    id: idQueSeEstaCerrando,
    estado: 'Finalizado',
    fecha_cierre: new Date().toISOString(),
    firma: firma
  }).then(function () {
    return refrescarVistaTrasOrden();
  }).then(function () {
    cerrarCierreModal();
  }).catch(function () {
    // En conexiones móviles inestables, a veces el navegador reporta "error
    // de red" aunque Apps Script sí haya terminado de guardar el cambio
    // (el servidor sigue ejecutando aunque el cliente pierda la conexión).
    // Antes de avisar que falló, verificamos directamente contra el
    // servidor si la orden realmente quedó cerrada.
    verificarCierre(idQueSeEstaCerrando);
  });
}

function verificarCierre(id) {
  refreshSheet('Ordenes').then(function () {
    const orden = state.cache.Ordenes.find(function (o) { return o.id === id; });
    if (orden && orden.estado === 'Finalizado') {
      if (isAreaManager()) applyRoleScope();
      if (isTecnico()) applyTecnicoScope();
      if (isSupervisor()) applySupervisorScope();
      return refrescarVistaTrasOrden().then(function () { cerrarCierreModal(); });
    }
    alert('Error al cerrar la orden: no se pudo confirmar con el servidor. Verifica tu conexión e intenta de nuevo.');
  }).catch(function () {
    alert('Error al cerrar la orden: no se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.');
  });
}

/* ===================== MODAL ORDEN DE TRABAJO ===================== */
function openOrdenModal(existing) {
  state.editing = { sheet: 'Ordenes', id: existing ? existing.id : null };
  document.getElementById('ordenModalTitle').textContent = existing ? 'Editar orden' : 'Nueva orden de trabajo';

  const sucSelect = document.getElementById('ordenSucursal');
  sucSelect.innerHTML = state.cache.Sucursales.map(function (s) { return '<option value="' + sucursalKey(s) + '">' + sucursalLabel(s) + '</option>'; }).join('');

  const vehSelect = document.getElementById('ordenVehiculo');
  vehSelect.innerHTML = '<option value="">-- Ninguno --</option>' +
    state.cache.Vehiculos.map(function (v) { return '<option value="' + v.id + '">' + v.placa + ' - ' + v.marca + '</option>'; }).join('');

  const tecSelect = document.getElementById('ordenTecnico');
  tecSelect.innerHTML = state.cache.Tecnicos.map(function (t) { return '<option value="' + t.id + '">' + t.nombre + '</option>'; }).join('');

  document.getElementById('ordenTipo').value = (existing && existing.tipo) || 'Preventivo';
  document.getElementById('ordenPrioridad').value = (existing && existing.prioridad) || 'Media';
  document.getElementById('ordenEstado').value = (existing && existing.estado) || 'Pendiente';
  document.getElementById('ordenFechaProgramada').value = (existing && existing.fecha_programada) ? String(existing.fecha_programada).slice(0, 10) : '';
  document.getElementById('ordenCosto').value = (existing && existing.costo) || '';
  document.getElementById('ordenDescripcion').value = (existing && existing.descripcion) || '';
  document.getElementById('ordenObservaciones').value = (existing && existing.observaciones) || '';
  const ordenEquipoEl = document.getElementById('ordenEquipo');
  if (ordenEquipoEl) ordenEquipoEl.value = (existing && existing.equipo) || '';
  if (existing) {
    sucSelect.value = existing.sucursal_id || '';
    vehSelect.value = existing.vehiculo_id || '';
    tecSelect.value = existing.tecnico_id || '';
  }

  // El Gerente de Operaciones no puede reasignar una orden ya existente a
  // otra sucursal — la sucursal queda fija, solo puede asignar/cambiar
  // técnico y los demás campos. Al crear una orden nueva sí puede elegirla.
  sucSelect.disabled = !!(existing && isOperaciones());

  clearSignaturePad();
  if (existing && existing.firma) {
    const img = new Image();
    img.onload = function () {
      const ctx = document.getElementById('signaturePad').getContext('2d');
      ctx.drawImage(img, 0, 0);
    };
    img.src = existing.firma;
  }

  document.getElementById('ordenModalOverlay').classList.remove('hidden');
}

function closeOrdenModal() {
  document.getElementById('ordenModalOverlay').classList.add('hidden');
  state.editing = null;
}

function saveOrden() {
  const canvas = document.getElementById('signaturePad');
  const data = {
    sucursal_id: document.getElementById('ordenSucursal').value,
    vehiculo_id: document.getElementById('ordenVehiculo').value,
    tecnico_id: document.getElementById('ordenTecnico').value,
    tipo: document.getElementById('ordenTipo').value,
    prioridad: document.getElementById('ordenPrioridad').value,
    estado: document.getElementById('ordenEstado').value,
    fecha_programada: document.getElementById('ordenFechaProgramada').value,
    costo: document.getElementById('ordenCosto').value,
    descripcion: document.getElementById('ordenDescripcion').value,
    observaciones: document.getElementById('ordenObservaciones').value,
    equipo: document.getElementById('ordenEquipo') ? document.getElementById('ordenEquipo').value : '',
    firma: compressedSignatureDataUrl(canvas)
  };
  if (state.editing && state.editing.id) {
    data.id = state.editing.id;
  } else {
    data.fecha = new Date().toISOString();
  }
  if (data.estado === 'Finalizado' && !data.fecha_cierre) data.fecha_cierre = new Date().toISOString();

  const action = (state.editing && state.editing.id) ? 'update' : 'create';
  apiCall(action, 'Ordenes', data).then(refreshOrdenesForRole).then(function () {
    renderOrdenesTable();
    closeOrdenModal();
  }).catch(function (err) { alert('Error al guardar la orden: ' + err.message); });
}

/* ===================== FIRMA DIGITAL (canvas) ===================== */
/* La firma viaja dentro de la URL (JSONP no admite POST de verdad), así que
   si el canvas se exporta a tamaño completo la imagen puede superar el
   límite de longitud de URL y fallar con "Error de red" (más frecuente en
   datos móviles). Para evitarlo, la reescalamos a una resolución más chica
   antes de convertirla a data URL, y si aun así queda pesada, la reducimos
   todavía más. */
function compressedSignatureDataUrl(canvas) {
  function scaleTo(width) {
    const scale = width / canvas.width;
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.round(canvas.width * scale));
    tmp.height = Math.max(1, Math.round(canvas.height * scale));
    tmp.getContext('2d').drawImage(canvas, 0, 0, tmp.width, tmp.height);
    return tmp.toDataURL('image/png');
  }
  let data = scaleTo(260);
  if (data.length > 6000) data = scaleTo(160);
  if (data.length > 6000) data = scaleTo(100);
  return data;
}

function setupSignaturePad(canvasId) {
  const canvas = document.getElementById(canvasId || 'signaturePad');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let drawing = false;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
  }

  function start(e) { drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e) { if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
  function end() { drawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
}

function clearSignaturePad(canvasId) {
  const canvas = document.getElementById(canvasId || 'signaturePad');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function clearCierreSignaturePad() { clearSignaturePad('cierreSignaturePad'); }

/* ===================== VISTA "REPORTAR NECESIDAD" (Gerente de Sucursal) =====================
   FIX: la hoja Usuarios a veces trae en sucursal_id el NOMBRE de la sucursal
   (ej. "SS - Escalon - L001") en vez del id interno (UUID) de Sucursales.
   Aceptamos ambos casos y normalizamos al id real apenas lo encontramos. */
function normalizeSucursalName(s) {
  return stripAccents(String(s || '')).trim().replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-');
}

function renderSolicitudView() {
  Promise.all([refreshSheet('Sucursales'), refreshSheet('Ordenes')]).then(function () {
    const sucursales = state.cache.Sucursales;
    const ordenes = state.cache.Ordenes;

    const raw = String(state.user.sucursal_id || '').trim();
    const rawNorm = normalizeSucursalName(raw);
    const misucursal = raw ? sucursales.find(function (s) {
      const key = sucursalKey(s);
      const nom = getField(s, ['nombre']);
      return (!!key && (key === raw || normalizeSucursalName(key) === rawNorm)) ||
        (!!nom && normalizeSucursalName(nom) === rawNorm);
    }) : null;

    const nombreEl = document.getElementById('solicitudSucursalNombre');
    if (misucursal) {
      state.user.sucursal_id = sucursalKey(misucursal);
      localStorage.setItem('cmms_user', JSON.stringify(state.user));
      nombreEl.textContent = 'Sucursal: ' + sucursalLabel(misucursal);
    } else {
      nombreEl.textContent = raw
        ? 'No se encontró la sucursal "' + raw + '" en el catálogo de Sucursales. Verifica el valor de sucursal_id en la hoja Usuarios.'
        : 'No tienes una sucursal asignada. Contacta al administrador.';
    }

    const misSolicitudes = ordenes.filter(function (o) {
      return misucursal ? o.sucursal_id === sucursalKey(misucursal) : false;
    });
    renderSolicitudesTable(misSolicitudes);
  });
}

function renderSolicitudesTable(rows) {
  const table = document.getElementById('table-Solicitudes');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '<tr><th>Fecha</th><th>Tipo</th><th>Prioridad</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr>';
  tbody.innerHTML = '';
  rows.slice().reverse().forEach(function (o) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (o.fecha ? new Date(o.fecha).toLocaleDateString() : '') + '</td>' +
      '<td>' + (o.tipo || '') + '</td><td>' + (o.prioridad || '') + '</td><td>' + (o.descripcion || '') + '</td>' +
      '<td><span class="badge badge-' + String(o.estado || '').toLowerCase().replace(/\s+/g, '') + '">' + (o.estado || '') + '</span></td>';
    const td = document.createElement('td');
    td.className = 'row-actions';
    if (esOrdenAbierta(o)) {
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✅ Cerrado';
      closeBtn.addEventListener('click', function () { abrirCierreModal(o.id); });
      td.appendChild(closeBtn);
    }
    tr.appendChild(td);
    tbody.appendChild(tr);
  });
}

function enviarSolicitud() {
  const msgEl = document.getElementById('solicitudMsg');
  msgEl.textContent = '';
  msgEl.style.color = '';

  if (!state.user.sucursal_id) {
    msgEl.textContent = 'No tienes una sucursal asignada; no se puede enviar.';
    msgEl.style.color = 'var(--danger)';
    return;
  }
  const descripcion = document.getElementById('solDescripcion').value.trim();
  if (!descripcion) {
    msgEl.textContent = 'Describe la necesidad antes de enviar.';
    msgEl.style.color = 'var(--danger)';
    return;
  }

  const data = {
    fecha: new Date().toISOString(),
    sucursal_id: state.user.sucursal_id,
    tipo: document.getElementById('solTipo').value,
    descripcion: descripcion,
    tecnico_id: '',
    vehiculo_id: '',
    estado: 'Pendiente',
    prioridad: document.getElementById('solPrioridad').value,
    fecha_programada: '',
    fecha_cierre: '',
    costo: '',
    firma: '',
    observaciones: '',
    equipo: document.getElementById('solEquipo') ? document.getElementById('solEquipo').value : '',
    // Marca el origen para poder distinguir en el dashboard las solicitudes
    // enviadas por un Gerente de Sucursal de las órdenes creadas directamente
    // por Administrador/Supervisor. Si tu hoja Ordenes no tiene columna
    // "origen" o "reportado_por", Apps Script simplemente ignora estos
    // valores (no rompe nada); agrégalas para que el panel de solicitudes
    // y los insights funcionen.
    origen: 'solicitud_sucursal',
    reportado_por: state.user.nombre || ''
  };

  apiCall('create', 'Ordenes', data).then(function () {
    msgEl.textContent = 'Solicitud enviada correctamente.';
    msgEl.style.color = 'var(--success)';
    document.getElementById('solDescripcion').value = '';
    renderSolicitudView();
  }).catch(function (err) {
    msgEl.textContent = 'Error al enviar: ' + err.message;
    msgEl.style.color = 'var(--danger)';
  });
}

/* ===================== EVENTOS GLOBALES ===================== */
function wireGlobalUI() {
  document.getElementById('modalClose').addEventListener('click', closeEntityModal);
  document.getElementById('modalCancel').addEventListener('click', closeEntityModal);
  document.getElementById('modalSave').addEventListener('click', saveEntityModal);

  document.querySelectorAll('[data-add]').forEach(function (btn) {
    btn.addEventListener('click', function () { openEntityModal(btn.dataset.add, null); });
  });

  document.querySelectorAll('[data-export]').forEach(function (btn) {
    btn.addEventListener('click', function () { exportCSV(btn.dataset.export); });
  });

  document.getElementById('menuToggle').addEventListener('click', function () {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  document.getElementById('filtroEstado').addEventListener('change', renderOrdenesTable);

  document.getElementById('btnNuevaOrden').addEventListener('click', function () { openOrdenModal(null); });
  document.getElementById('ordenModalClose').addEventListener('click', closeOrdenModal);
  document.getElementById('ordenCancel').addEventListener('click', closeOrdenModal);
  document.getElementById('ordenSave').addEventListener('click', saveOrden);
  document.getElementById('ordenPrint').addEventListener('click', function () { window.print(); });
  document.getElementById('clearSignature').addEventListener('click', function () { clearSignaturePad(); });

  document.getElementById('btnEnviarSolicitud').addEventListener('click', enviarSolicitud);

  document.getElementById('cierreModalClose').addEventListener('click', cerrarCierreModal);
  document.getElementById('cierreCancel').addEventListener('click', cerrarCierreModal);
  document.getElementById('cierreConfirmar').addEventListener('click', confirmarCierre);
  document.getElementById('clearCierreSignature').addEventListener('click', clearCierreSignaturePad);

  ['gvFiltroSucursal', 'gvFiltroEstado', 'gvFiltroPrioridad', 'gvFiltroTecnico', 'gvFiltroTipo'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', renderPanelGestion);
  });
  const gvLimpiar = document.getElementById('gvLimpiarFiltros');
  if (gvLimpiar) gvLimpiar.addEventListener('click', limpiarFiltrosGV);

  setupSignaturePad();
  setupSignaturePad('cierreSignaturePad');
}
