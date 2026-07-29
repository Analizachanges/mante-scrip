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
  u.nombre = String(u.nombre || '').trim();
  return u;
}

const FULL_ACCESS_ROLES = ['Administrador', 'Gerente de Operaciones'];
const READ_ONLY_ROLES = ['Consulta', 'Gerente de Área'];
function isReadOnly() { return !!(state.user && READ_ONLY_ROLES.indexOf(state.user.rol) > -1); }
function isAreaManager() { return !!(state.user && state.user.rol === 'Gerente de Área'); }
function isFullAccess() { return !!(state.user && FULL_ACCESS_ROLES.indexOf(state.user.rol) > -1); }

/* ===================== MENÚ LATERAL ===================== */
const MENU = [
  { id: 'dashboard', label: 'Dashboard', roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Gerente de Área', 'Consulta', 'Técnico'] },
  { id: 'ordenes', label: 'Órdenes de trabajo', roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Técnico', 'Consulta', 'Gerente de Área'] },
  { id: 'sucursales', label: 'Sucursales', roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Gerente de Área', 'Consulta'] },
  { id: 'tecnicos', label: 'Técnicos', roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor'] },
  { id: 'vehiculos', label: 'Vehículos', roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Consulta'] },
  { id: 'inventario', label: 'Inventario', roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor'] },
  { id: 'preventivo', label: 'Mantenimiento preventivo', roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Técnico'] },
  { id: 'solicitud', label: 'Reportar necesidad', roles: ['Gerente de Sucursal'] }
];

/* ===================== ENTIDADES CRUD GENÉRICAS ===================== */
const ENTITIES = {
  Sucursales: {
    label: 'Sucursal',
    fields: [
      { key: 'nombre', label: 'Nombre', type: 'text' },
      { key: 'direccion', label: 'Dirección', type: 'text' },
      { key: 'ciudad', label: 'Ciudad', type: 'text' },
      { key: 'contacto', label: 'Contacto', type: 'text' },
      { key: 'telefono', label: 'Teléfono', type: 'text' },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Operativa', 'Con alerta', 'Inactiva'] },
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
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('sidebarUser').textContent = state.user.nombre + ' · ' + state.user.rol;
  renderSidebar();

  if (state.user.rol === 'Gerente de Sucursal') {
    switchView('solicitud');
    return;
  }

  loadAll().then(function () {
    applyRoleScope();
    applyReadOnlyUI();
    switchView('dashboard');
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
  if (state.user.rol === 'Gerente de Área' && state.user.area) {
    const userArea = state.user.area.trim().toLowerCase();
    const allowed = state.cache.Sucursales.filter(function (s) {
      return String(s.gerente_area || '').trim().toLowerCase() === userArea;
    });
    const allowedIds = allowed.map(function (s) { return s.id; });
    state.cache.Sucursales = allowed;
    state.cache.Ordenes = state.cache.Ordenes.filter(function (o) { return allowedIds.indexOf(o.sucursal_id) > -1; });
  }
}

function applyReadOnlyUI() {
  const ro = isReadOnly();
  document.querySelectorAll('[data-add]').forEach(function (b) { b.classList.toggle('hidden', ro); });
  const btnNueva = document.getElementById('btnNuevaOrden');
  if (btnNueva) btnNueva.classList.toggle('hidden', ro);
}

/* ===================== HELPERS DE NOMBRES ===================== */
function sucursalNombre(id) {
  const s = state.cache.Sucursales.find(function (x) { return x.id === id; });
  return s ? s.nombre : (id || '');
}
function tecnicoNombre(id) {
  const t = state.cache.Tecnicos.find(function (x) { return x.id === id; });
  return t ? t.nombre : (id || '-');
}

/* ===================== DASHBOARD ===================== */
let chartEstadoInstance = null;
let chartSucursalInstance = null;

function renderDashboard() {
  const ordenes = state.cache.Ordenes;
  const vehiculos = state.cache.Vehiculos;
  const scoped = state.user.rol === 'Gerente de Área';

  const abiertas = ordenes.filter(function (o) { return o.estado !== 'Finalizado'; }).length;
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

function renderSucursalesGrid() {
  const grid = document.getElementById('sucursalesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  state.cache.Sucursales.forEach(function (s) {
    const badge = document.createElement('div');
    let cls = 'sucursal-badge';
    if (s.estado === 'Con alerta') cls += ' alerta';
    else if (s.estado === 'Inactiva') cls += ' inactivo';
    badge.className = cls;
    badge.textContent = s.nombre;
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
        o.value = s.id; o.textContent = s.nombre;
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
function renderOrdenesTable() {
  const table = document.getElementById('table-Ordenes');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const filtro = document.getElementById('filtroEstado').value;
  let ordenes = state.cache.Ordenes.slice();
  if (filtro) ordenes = ordenes.filter(function (o) { return o.estado === filtro; });

  const fullEdit = !isReadOnly();
  const quickActions = isAreaManager();

  thead.innerHTML = '<tr><th>Fecha</th><th>Sucursal</th><th>Tipo</th><th>Descripción</th><th>Técnico</th><th>Estado</th><th>Prioridad</th><th>Costo</th>' +
    ((fullEdit || quickActions) ? '<th>Acciones</th>' : '') + '</tr>';

  tbody.innerHTML = '';
  ordenes.forEach(function (o) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + (o.fecha ? new Date(o.fecha).toLocaleDateString() : '') + '</td>' +
      '<td>' + sucursalNombre(o.sucursal_id) + '</td>' +
      '<td>' + (o.tipo || '') + '</td>' +
      '<td>' + (o.descripcion || '') + '</td>' +
      '<td>' + tecnicoNombre(o.tecnico_id) + '</td>' +
      '<td><span class="badge badge-' + String(o.estado || '').toLowerCase().replace(/\s+/g, '') + '">' + (o.estado || '') + '</span></td>' +
      '<td>' + (o.prioridad || '') + '</td>' +
      '<td>' + (o.costo ? '$' + Number(o.costo).toFixed(2) : '') + '</td>';

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
      if (o.estado !== 'Finalizado') {
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✅ Cerrado';
        closeBtn.addEventListener('click', function () { marcarOrdenCerrada(o.id); });
        td.appendChild(closeBtn);
      }
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
}

function refreshOrdenesForRole() {
  return refreshSheet('Ordenes').then(function () { if (isAreaManager()) applyRoleScope(); });
}

function marcarOrden(id, campo, valor) {
  const data = { id: id };
  data[campo] = valor;
  apiCall('update', 'Ordenes', data).then(refreshOrdenesForRole).then(renderOrdenesTable);
}

function marcarOrdenCerrada(id) {
  apiCall('update', 'Ordenes', { id: id, estado: 'Finalizado', fecha_cierre: new Date().toISOString() })
    .then(refreshOrdenesForRole).then(renderOrdenesTable);
}

/* ===================== MODAL ORDEN DE TRABAJO ===================== */
function openOrdenModal(existing) {
  state.editing = { sheet: 'Ordenes', id: existing ? existing.id : null };
  document.getElementById('ordenModalTitle').textContent = existing ? 'Editar orden' : 'Nueva orden de trabajo';

  const sucSelect = document.getElementById('ordenSucursal');
  sucSelect.innerHTML = state.cache.Sucursales.map(function (s) { return '<option value="' + s.id + '">' + s.nombre + '</option>'; }).join('');

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
  if (existing) {
    sucSelect.value = existing.sucursal_id || '';
    vehSelect.value = existing.vehiculo_id || '';
    tecSelect.value = existing.tecnico_id || '';
  }

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
    firma: canvas.toDataURL('image/png')
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
function setupSignaturePad() {
  const canvas = document.getElementById('signaturePad');
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

function clearSignaturePad() {
  const canvas = document.getElementById('signaturePad');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/* ===================== VISTA "REPORTAR NECESIDAD" (Gerente de Sucursal) =====================
   FIX: la hoja Usuarios a veces trae en sucursal_id el NOMBRE de la sucursal
   (ej. "SS - Escalon - L001") en vez del id interno (UUID) de Sucursales.
   Aceptamos ambos casos y normalizamos al id real apenas lo encontramos. */
function renderSolicitudView() {
  Promise.all([refreshSheet('Sucursales'), refreshSheet('Ordenes')]).then(function () {
    const sucursales = state.cache.Sucursales;
    const ordenes = state.cache.Ordenes;

    const raw = String(state.user.sucursal_id || '').trim();
    const misucursal = sucursales.find(function (s) {
      return String(s.id) === raw || String(s.nombre).trim().toLowerCase() === raw.toLowerCase();
    });

    const nombreEl = document.getElementById('solicitudSucursalNombre');
    if (misucursal) {
      state.user.sucursal_id = misucursal.id;
      localStorage.setItem('cmms_user', JSON.stringify(state.user));
      nombreEl.textContent = 'Sucursal: ' + misucursal.nombre;
    } else {
      nombreEl.textContent = raw
        ? 'No se encontró la sucursal "' + raw + '" en el catálogo de Sucursales. Verifica el valor de sucursal_id en la hoja Usuarios.'
        : 'No tienes una sucursal asignada. Contacta al administrador.';
    }

    const misSolicitudes = ordenes.filter(function (o) {
      return misucursal ? o.sucursal_id === misucursal.id : false;
    });
    renderSolicitudesTable(misSolicitudes);
  });
}

function renderSolicitudesTable(rows) {
  const table = document.getElementById('table-Solicitudes');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '<tr><th>Fecha</th><th>Tipo</th><th>Prioridad</th><th>Descripción</th><th>Estado</th></tr>';
  tbody.innerHTML = '';
  rows.slice().reverse().forEach(function (o) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (o.fecha ? new Date(o.fecha).toLocaleDateString() : '') + '</td>' +
      '<td>' + (o.tipo || '') + '</td><td>' + (o.prioridad || '') + '</td><td>' + (o.descripcion || '') + '</td>' +
      '<td><span class="badge badge-' + String(o.estado || '').toLowerCase().replace(/\s+/g, '') + '">' + (o.estado || '') + '</span></td>';
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
    observaciones: ''
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
  document.getElementById('clearSignature').addEventListener('click', clearSignaturePad);

  document.getElementById('btnEnviarSolicitud').addEventListener('click', enviarSolicitud);

  setupSignaturePad();
}
