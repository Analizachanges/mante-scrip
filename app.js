/* ============================================================
   Mantenimiento Analiza - Frontend
   Antes de usar: reemplaza CONFIG.API_URL con la URL de tu
   implementación de Apps Script (ver GUIA_INSTALACION.md).
   ============================================================ */

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyeMZRPaHOh2EzNzLRsKLvXqIbuZeRU4OE4X3S6z9rfXPRYAxp8ji3w2iif3YOc9x1zHQ/exec'
};

const MENU = [
  { id: 'dashboard',  label: '📊 Dashboard',          roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Gerente de Área', 'Consulta', 'Técnico'] },
  { id: 'ordenes',    label: '🧾 Órdenes de trabajo',  roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Técnico', 'Consulta', 'Gerente de Área'] },
  { id: 'sucursales', label: '🏢 Sucursales',          roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Gerente de Área', 'Consulta'] },
  { id: 'tecnicos',   label: '👷 Técnicos',            roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor'] },
  { id: 'vehiculos',  label: '🚚 Vehículos',           roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Consulta'] },
  { id: 'inventario', label: '📦 Inventario',          roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor'] },
  { id: 'preventivo', label: '📅 Preventivo',          roles: ['Administrador', 'Gerente de Operaciones', 'Supervisor', 'Técnico'] },
  { id: 'solicitud',  label: '📝 Reportar necesidad',  roles: ['Gerente de Sucursal'] },
];

// Roles que solo pueden ver información, sin crear/editar/eliminar.
const READ_ONLY_ROLES = ['Consulta', 'Gerente de Área'];
function isReadOnly() {
  return state.user && READ_ONLY_ROLES.indexOf(state.user.rol) > -1;
}

/* ----------------------------------------------------------
   Normalización de roles
   ----------------------------------------------------------
   La columna "rol" de la hoja Usuarios la llena una persona a
   mano: puede tener mayúsculas distintas, faltar una tilde, o
   traer un espacio de más. Para que eso nunca deje a alguien
   sin menú (silenciosamente), comparamos el rol ignorando
   mayúsculas/tildes/espacios y lo traducimos a su forma exacta.
   ---------------------------------------------------------- */
const ROLE_CANONICAL = [
  'Administrador', 'Gerente de Operaciones', 'Supervisor', 'Técnico',
  'Gerente de Área', 'Gerente de Sucursal', 'Consulta'
];
const ACCENT_MAP = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n' };
function stripAccents(s) {
  return String(s).toLowerCase().split('').map(function (ch) { return ACCENT_MAP[ch] || ch; }).join('');
}
function roleKey(s) {
  return stripAccents(String(s || '').trim()).replace(/\s+/g, ' ');
}
const ROLE_LOOKUP = {};
ROLE_CANONICAL.forEach(function (r) { ROLE_LOOKUP[roleKey(r)] = r; });
function canonicalRole(rawRol) {
  return ROLE_LOOKUP[roleKey(rawRol)] || rawRol;
}

// Limpia espacios de más en todos los campos del usuario que llegan
// de la Sheet (rol, area, sucursal_id, nombre), para que celdas con un
// espacio de sobra no rompan las comparaciones exactas del resto del código.
function normalizeUser(u) {
  u.rol = canonicalRole(u.rol);
  u.area = String(u.area || '').trim();
  u.sucursal_id = String(u.sucursal_id || '').trim();
  u.nombre = String(u.nombre || '').trim();
  return u;
}

const ENTITIES = {
  Sucursales: {
    label: 'Sucursal',
    fields: [
      { key: 'nombre', label: 'Nombre', type: 'text', required: true },
      { key: 'direccion', label: 'Dirección', type: 'text' },
      { key: 'ciudad', label: 'Ciudad', type: 'text' },
      { key: 'contacto', label: 'Contacto', type: 'text' },
      { key: 'telefono', label: 'Teléfono', type: 'text' },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Operativa', 'Alerta', 'Inactiva'] },
      { key: 'gerente_area', label: 'Gerente de Área', type: 'text' }
    ]
  },
  Tecnicos: {
    label: 'Técnico',
    fields: [
      { key: 'nombre', label: 'Nombre', type: 'text', required: true },
      { key: 'especialidad', label: 'Especialidad', type: 'text' },
      { key: 'telefono', label: 'Teléfono', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'activo', label: 'Activo', type: 'select', options: ['true', 'false'] }
    ]
  },
  Vehiculos: {
    label: 'Vehículo',
    fields: [
      { key: 'placa', label: 'Placa', type: 'text', required: true },
      { key: 'marca', label: 'Marca', type: 'text' },
      { key: 'modelo', label: 'Modelo', type: 'text' },
      { key: 'anio', label: 'Año', type: 'number' },
      { key: 'asignado_a', label: 'Asignado a', type: 'text' },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Operativo', 'En mantenimiento', 'Fuera de servicio'] }
    ]
  },
  Inventario: {
    label: 'Repuesto',
    fields: [
      { key: 'nombre', label: 'Nombre', type: 'text', required: true },
      { key: 'categoria', label: 'Categoría', type: 'text' },
      { key: 'stock', label: 'Stock', type: 'number' },
      { key: 'stock_minimo', label: 'Stock mínimo', type: 'number' },
      { key: 'costo_unitario', label: 'Costo unitario', type: 'number' },
      { key: 'ubicacion', label: 'Ubicación', type: 'text' }
    ]
  },
  Preventivo: {
    label: 'Plan preventivo',
    fields: [
      { key: 'sucursal_id', label: 'Sucursal', type: 'select-sucursal' },
      { key: 'equipo', label: 'Equipo', type: 'text' },
      { key: 'frecuencia_dias', label: 'Frecuencia (días)', type: 'number' },
      { key: 'ultima_fecha', label: 'Última fecha', type: 'date' },
      { key: 'proxima_fecha', label: 'Próxima fecha', type: 'date' },
      { key: 'responsable', label: 'Responsable', type: 'text' },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Al día', 'Próximo', 'Vencido'] }
    ]
  }
};

const state = {
  user: null,
  cache: { Sucursales: [], Tecnicos: [], Vehiculos: [], Ordenes: [], Inventario: [], Preventivo: [] },
  currentView: 'dashboard',
  editing: { entity: null, id: null },
  ordenEditingId: null,
  signature: { drawing: false, ctx: null, hasDrawing: false },
  charts: {}
};

/* ----------------------------------------------------------
   API (JSONP: <script> con callback)
   ----------------------------------------------------------
   Google Apps Script bloquea fetch() por CORS de forma
   irresoluble, y también impide que sus páginas se muestren
   dentro de un iframe (X-Frame-Options). Un <script src="...">
   con callback (JSONP) no está sujeto a ninguna de las dos
   restricciones: el navegador simplemente ejecuta el script que
   Apps Script devuelve, que llama a nuestra función callback.
   ---------------------------------------------------------- */
let reqCounter = 0;

function apiCall(action, sheet, body) {
  return new Promise(function (resolve, reject) {
    const cbName = 'cmmsCb' + (++reqCounter) + '_' + Date.now();
    const payload = encodeURIComponent(JSON.stringify(body || {}));
    let url = CONFIG.API_URL + '?action=' + encodeURIComponent(action);
    if (sheet) url += '&sheet=' + encodeURIComponent(sheet);
    url += '&callback=' + cbName + '&payload=' + payload;

    const script = document.createElement('script');

    const timeoutId = setTimeout(function () {
      cleanup();
      reject(new Error('Tiempo de espera agotado'));
    }, 20000);

    function cleanup() {
      clearTimeout(timeoutId);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = function (data) {
      cleanup();
      resolve(data);
    };

    script.onerror = function () {
      cleanup();
      reject(new Error('Error al cargar la API'));
    };

    script.src = url;
    document.body.appendChild(script);
  });
}

function setApiStatus(ok) {
  const el = document.getElementById('apiStatus');
  if (ok) { el.textContent = '● API conectada'; el.classList.add('ok'); }
  else { el.textContent = '● API no configurada'; el.classList.remove('ok'); }
}

/* ---------------- LOGIN ---------------- */
document.getElementById('loginForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const usuario = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  if (CONFIG.API_URL.indexOf('PEGA_AQUI') > -1) {
    errEl.textContent = 'Configura CONFIG.API_URL en app.js primero (ver GUIA_INSTALACION.md).';
    return;
  }

  apiCall('login', null, { usuario: usuario, password: password })
    .then(function (res) {
      if (res.error) { errEl.textContent = res.error; return; }
      state.user = normalizeUser(res.user);
      sessionStorage.setItem('cmms_user', JSON.stringify(state.user));
      setApiStatus(true);
      startApp();
    })
    .catch(function () {
      errEl.textContent = 'No se pudo conectar con la API. Revisa la URL y el despliegue de Apps Script.';
    });
});

document.getElementById('logoutBtn').addEventListener('click', function () {
  sessionStorage.removeItem('cmms_user');
  location.reload();
});

function tryAutoLogin() {
  const saved = sessionStorage.getItem('cmms_user');
  if (saved) {
    state.user = normalizeUser(JSON.parse(saved));
    startApp();
  }
}

/* ---------------- APP SHELL ---------------- */
function startApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('sidebarUser').textContent = state.user.nombre + ' · ' + state.user.rol;
  buildSidebar();
  applyReadOnlyUI();

  if (state.user.rol === 'Gerente de Sucursal') {
    // Vista mínima: solo reportar necesidades de su propia sucursal.
    setApiStatus(true);
    switchView('solicitud');
    return;
  }

  loadAll().then(function () {
    applyRoleScope();
    setApiStatus(true);
    switchView('dashboard');
  });
}

/**
 * Limita los datos visibles según el rol. El "Gerente de Área" solo debe
 * ver las sucursales de su propia zona (y las órdenes de esas sucursales).
 */
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

/** Oculta botones de crear/editar/eliminar para roles de solo lectura. */
function applyReadOnlyUI() {
  if (!isReadOnly()) return;
  document.querySelectorAll('[data-add]').forEach(function (btn) { btn.style.display = 'none'; });
  const btnOrden = document.getElementById('btnNuevaOrden');
  if (btnOrden) btnOrden.style.display = 'none';
}

function buildSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';
  MENU.filter(function (m) { return m.roles.indexOf(state.user.rol) > -1; }).forEach(function (m) {
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.textContent = m.label;
    btn.dataset.view = m.id;
    btn.addEventListener('click', function () {
      switchView(m.id);
      document.querySelector('.sidebar').classList.remove('open');
    });
    nav.appendChild(btn);
  });
}

function switchView(viewId) {
  state.currentView = viewId;
  document.querySelectorAll('.view').forEach(function (v) { v.classList.add('hidden'); });
  document.getElementById('view-' + viewId).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(function (n) {
    n.classList.toggle('active', n.dataset.view === viewId);
  });
  const titles = { dashboard: 'Dashboard', ordenes: 'Órdenes de trabajo', sucursales: 'Sucursales', tecnicos: 'Técnicos', vehiculos: 'Vehículos', inventario: 'Inventario', preventivo: 'Mantenimiento preventivo', solicitud: 'Reportar necesidad de mantenimiento' };
  document.getElementById('viewTitle').textContent = titles[viewId];

  if (viewId === 'dashboard') renderDashboard();
  else if (viewId === 'ordenes') renderOrdenesTable();
  else if (viewId === 'solicitud') renderSolicitudView();
  else if (ENTITIES[capitalize(viewId)]) renderGenericTable(capitalize(viewId));
}

function capitalize(id) {
  const map = { sucursales: 'Sucursales', tecnicos: 'Tecnicos', vehiculos: 'Vehiculos', inventario: 'Inventario', preventivo: 'Preventivo' };
  return map[id];
}

document.getElementById('menuToggle').addEventListener('click', function () {
  document.querySelector('.sidebar').classList.toggle('open');
});

/* ---------------- LOAD DATA ---------------- */
function loadAll() {
  const sheets = ['Sucursales', 'Tecnicos', 'Vehiculos', 'Ordenes', 'Inventario', 'Preventivo'];
  return Promise.all(sheets.map(function (s) {
    return apiCall('list', s).then(function (res) { state.cache[s] = res.data || []; });
  }));
}

function refreshSheet(sheetName) {
  return apiCall('list', sheetName).then(function (res) { state.cache[sheetName] = res.data || []; });
}

/* ---------------- GENERIC CRUD TABLE ---------------- */
function renderGenericTable(entityName) {
  const cfg = ENTITIES[entityName];
  const table = document.getElementById('table-' + entityName);
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  const readOnly = isReadOnly();
  thead.innerHTML = '<tr>' + cfg.fields.map(function (f) { return '<th>' + f.label + '</th>'; }).join('') + (readOnly ? '' : '<th>Acciones</th>') + '</tr>';

  const rows = state.cache[entityName] || [];
  tbody.innerHTML = rows.map(function (row) {
    const cells = cfg.fields.map(function (f) {
      let val = row[f.key] !== undefined ? row[f.key] : '';
      if (f.type === 'select-sucursal') val = sucursalNombre(val);
      return '<td>' + escapeHtml(String(val)) + '</td>';
    }).join('');
    const actions = readOnly ? '' :
      '<td class="row-actions">' +
      '<button title="Editar" onclick="editGeneric(\'' + entityName + '\',\'' + row.id + '\')">✏️</button>' +
      '<button title="Eliminar" onclick="deleteGeneric(\'' + entityName + '\',\'' + row.id + '\')">🗑️</button>' +
      '</td>';
    return '<tr>' + cells + actions + '</tr>';
  }).join('');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + (cfg.fields.length + (readOnly ? 0 : 1)) + '" style="text-align:center;color:#9ca3af;padding:24px;">Sin registros todavía</td></tr>';
  }
}

function sucursalNombre(id) {
  const s = state.cache.Sucursales.find(function (x) { return x.id === id; });
  return s ? s.nombre : (id || '');
}
function tecnicoNombre(id) {
  const t = state.cache.Tecnicos.find(function (x) { return x.id === id; });
  return t ? t.nombre : (id || '');
}
function vehiculoLabel(id) {
  const v = state.cache.Vehiculos.find(function (x) { return x.id === id; });
  return v ? (v.placa + ' - ' + v.marca) : (id || '-');
}
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

document.querySelectorAll('[data-add]').forEach(function (btn) {
  btn.addEventListener('click', function () { openGenericModal(btn.dataset.add, null); });
});
document.querySelectorAll('[data-export]').forEach(function (btn) {
  btn.addEventListener('click', function () { exportCSV(btn.dataset.export); });
});

function editGeneric(entityName, id) {
  const row = state.cache[entityName].find(function (r) { return r.id === id; });
  openGenericModal(entityName, row);
}

function deleteGeneric(entityName, id) {
  if (!confirm('¿Eliminar este registro?')) return;
  apiCall('delete', entityName, { id: id }).then(function () {
    return refreshSheet(entityName);
  }).then(function () { renderGenericTable(entityName); });
}

/* ---------------- GENERIC MODAL ---------------- */
const modalOverlay = document.getElementById('modalOverlay');
document.getElementById('modalClose').addEventListener('click', closeGenericModal);
document.getElementById('modalCancel').addEventListener('click', closeGenericModal);

function closeGenericModal() {
  modalOverlay.classList.add('hidden');
  state.editing = { entity: null, id: null };
}

function openGenericModal(entityName, existingRow) {
  const cfg = ENTITIES[entityName];
  state.editing = { entity: entityName, id: existingRow ? existingRow.id : null };
  document.getElementById('modalTitle').textContent = (existingRow ? 'Editar ' : 'Nueva ') + cfg.label.toLowerCase();

  const body = document.getElementById('modalBody');
  body.innerHTML = cfg.fields.map(function (f) {
    const val = existingRow && existingRow[f.key] !== undefined ? existingRow[f.key] : '';
    if (f.type === 'select') {
      return '<label>' + f.label + '</label><select data-field="' + f.key + '">' +
        f.options.map(function (o) { return '<option value="' + o + '"' + (String(val) === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') +
        '</select>';
    }
    if (f.type === 'select-sucursal') {
      return '<label>' + f.label + '</label><select data-field="' + f.key + '">' +
        state.cache.Sucursales.map(function (s) { return '<option value="' + s.id + '"' + (val === s.id ? ' selected' : '') + '>' + s.nombre + '</option>'; }).join('') +
        '</select>';
    }
    return '<label>' + f.label + '</label><input type="' + f.type + '" data-field="' + f.key + '" value="' + escapeHtml(String(val)) + '">';
  }).join('');

  modalOverlay.classList.remove('hidden');
}

document.getElementById('modalSave').addEventListener('click', function () {
  const entityName = state.editing.entity;
  const cfg = ENTITIES[entityName];
  const data = {};
  document.querySelectorAll('#modalBody [data-field]').forEach(function (input) {
    data[input.dataset.field] = input.value;
  });
  if (state.editing.id) data.id = state.editing.id;

  const action = state.editing.id ? 'update' : 'create';
  apiCall(action, entityName, data).then(function () {
    return refreshSheet(entityName);
  }).then(function () {
    renderGenericTable(entityName);
    closeGenericModal();
  });
});

/* ---------------- CSV EXPORT ---------------- */
function exportCSV(entityName) {
  const cfg = ENTITIES[entityName] || { fields: Object.keys((state.cache[entityName][0]) || {}).map(function (k) { return { key: k, label: k }; }) };
  const rows = state.cache[entityName] || [];
  const headers = entityName === 'Ordenes'
    ? ['id', 'fecha', 'sucursal', 'tipo', 'descripcion', 'tecnico', 'vehiculo', 'estado', 'prioridad', 'costo']
    : cfg.fields.map(function (f) { return f.key; });

  let lines = [headers.join(',')];
  rows.forEach(function (row) {
    let vals;
    if (entityName === 'Ordenes') {
      vals = [row.id, row.fecha, sucursalNombre(row.sucursal_id), row.tipo, row.descripcion, tecnicoNombre(row.tecnico_id), vehiculoLabel(row.vehiculo_id), row.estado, row.prioridad, row.costo];
    } else {
      vals = headers.map(function (h) { return row[h]; });
    }
    lines.push(vals.map(function (v) { return '"' + String(v === undefined ? '' : v).replace(/"/g, '""') + '"'; }).join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = entityName + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- ORDENES (modal con firma digital) ---------------- */
document.getElementById('btnNuevaOrden').addEventListener('click', function () { openOrdenModal(null); });
document.getElementById('ordenModalClose').addEventListener('click', closeOrdenModal);
document.getElementById('ordenCancel').addEventListener('click', closeOrdenModal);
document.getElementById('filtroEstado').addEventListener('change', renderOrdenesTable);

function closeOrdenModal() {
  document.getElementById('ordenModalOverlay').classList.add('hidden');
  state.ordenEditingId = null;
}

function openOrdenModal(existingRow) {
  state.ordenEditingId = existingRow ? existingRow.id : null;
  document.getElementById('ordenModalTitle').textContent = existingRow ? 'Editar orden de trabajo' : 'Nueva orden de trabajo';

  const sucSel = document.getElementById('ordenSucursal');
  sucSel.innerHTML = state.cache.Sucursales.map(function (s) { return '<option value="' + s.id + '">' + s.nombre + '</option>'; }).join('');

  const vehSel = document.getElementById('ordenVehiculo');
  vehSel.innerHTML = '<option value="">-- Ninguno --</option>' +
    state.cache.Vehiculos.map(function (v) { return '<option value="' + v.id + '">' + v.placa + ' - ' + v.marca + '</option>'; }).join('');

  const tecSel = document.getElementById('ordenTecnico');
  tecSel.innerHTML = state.cache.Tecnicos.map(function (t) { return '<option value="' + t.id + '">' + t.nombre + '</option>'; }).join('');

  if (existingRow) {
    sucSel.value = existingRow.sucursal_id || '';
    vehSel.value = existingRow.vehiculo_id || '';
    tecSel.value = existingRow.tecnico_id || '';
    document.getElementById('ordenTipo').value = existingRow.tipo || 'Preventivo';
    document.getElementById('ordenPrioridad').value = existingRow.prioridad || 'Media';
    document.getElementById('ordenEstado').value = existingRow.estado || 'Pendiente';
    document.getElementById('ordenFechaProgramada').value = existingRow.fecha_programada ? String(existingRow.fecha_programada).slice(0, 10) : '';
    document.getElementById('ordenCosto').value = existingRow.costo || '';
    document.getElementById('ordenDescripcion').value = existingRow.descripcion || '';
    document.getElementById('ordenObservaciones').value = existingRow.observaciones || '';
  } else {
    document.getElementById('ordenTipo').value = 'Preventivo';
    document.getElementById('ordenPrioridad').value = 'Media';
    document.getElementById('ordenEstado').value = 'Pendiente';
    document.getElementById('ordenFechaProgramada').value = '';
    document.getElementById('ordenCosto').value = '';
    document.getElementById('ordenDescripcion').value = '';
    document.getElementById('ordenObservaciones').value = '';
  }

  clearSignaturePad();
  if (existingRow && existingRow.firma) loadSignatureFromDataUrl(existingRow.firma);

  document.getElementById('ordenModalOverlay').classList.remove('hidden');
}

/* Signature pad */
const sigCanvas = document.getElementById('signaturePad');
const sigCtx = sigCanvas.getContext('2d');
sigCtx.strokeStyle = '#1f2937';
sigCtx.lineWidth = 2;
sigCtx.lineJoin = 'round';
sigCtx.lineCap = 'round';

function getPos(evt) {
  const rect = sigCanvas.getBoundingClientRect();
  const scaleX = sigCanvas.width / rect.width;
  const scaleY = sigCanvas.height / rect.height;
  const point = evt.touches ? evt.touches[0] : evt;
  return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
}
function startDraw(evt) {
  state.signature.drawing = true;
  const p = getPos(evt);
  sigCtx.beginPath();
  sigCtx.moveTo(p.x, p.y);
  evt.preventDefault();
}
function moveDraw(evt) {
  if (!state.signature.drawing) return;
  const p = getPos(evt);
  sigCtx.lineTo(p.x, p.y);
  sigCtx.stroke();
  state.signature.hasDrawing = true;
  evt.preventDefault();
}
function endDraw() { state.signature.drawing = false; }

sigCanvas.addEventListener('mousedown', startDraw);
sigCanvas.addEventListener('mousemove', moveDraw);
window.addEventListener('mouseup', endDraw);
sigCanvas.addEventListener('touchstart', startDraw);
sigCanvas.addEventListener('touchmove', moveDraw);
sigCanvas.addEventListener('touchend', endDraw);

document.getElementById('clearSignature').addEventListener('click', clearSignaturePad);
function clearSignaturePad() {
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  state.signature.hasDrawing = false;
}
function loadSignatureFromDataUrl(dataUrl) {
  const img = new Image();
  img.onload = function () { sigCtx.drawImage(img, 0, 0, sigCanvas.width, sigCanvas.height); state.signature.hasDrawing = true; };
  img.src = dataUrl;
}

document.getElementById('ordenSave').addEventListener('click', function () {
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
    firma: state.signature.hasDrawing ? sigCanvas.toDataURL('image/png') : ''
  };

  if (!data.sucursal_id) { alert('Selecciona una sucursal'); return; }

  if (state.ordenEditingId) {
    data.id = state.ordenEditingId;
    if (data.estado === 'Finalizado') data.fecha_cierre = new Date().toISOString();
    apiCall('update', 'Ordenes', data).then(finishOrdenSave);
  } else {
    data.fecha = new Date().toISOString();
    if (data.estado === 'Finalizado') data.fecha_cierre = new Date().toISOString();
    apiCall('create', 'Ordenes', data).then(finishOrdenSave);
  }
});

function finishOrdenSave() {
  refreshSheet('Ordenes').then(function () {
    renderOrdenesTable();
    closeOrdenModal();
  });
}

document.getElementById('ordenPrint').addEventListener('click', function () { window.print(); });

// El Gerente de Área no tiene edición completa, pero sí puede marcar
// una orden como urgente, extraordinaria o cerrada desde botones rápidos.
function isAreaManager() {
  return state.user && state.user.rol === 'Gerente de Área';
}

function renderOrdenesTable() {
  const tbody = document.querySelector('#table-Ordenes tbody');
  const thead = document.querySelector('#table-Ordenes thead');
  const fullEdit = !isReadOnly();
  const quickActions = isAreaManager();
  const showActionsCol = fullEdit || quickActions;
  thead.innerHTML = '<tr><th>Fecha</th><th>Sucursal</th><th>Tipo</th><th>Técnico</th><th>Vehículo</th><th>Estado</th><th>Prioridad</th><th>Costo</th>' + (showActionsCol ? '<th>Acciones</th>' : '') + '</tr>';

  const filtro = document.getElementById('filtroEstado').value;
  let rows = state.cache.Ordenes || [];
  if (filtro) rows = rows.filter(function (r) { return r.estado === filtro; });
  rows = rows.slice().sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  tbody.innerHTML = rows.map(function (row) {
    const badgeClass = row.estado === 'Finalizado' ? 'badge-finalizado' : (row.estado === 'En proceso' ? 'badge-enproceso' : 'badge-pendiente');
    let actions = '';
    if (fullEdit) {
      actions = '<td class="row-actions">' +
        '<button title="Editar" onclick="editOrden(\'' + row.id + '\')">✏️</button>' +
        '<button title="Eliminar" onclick="deleteOrden(\'' + row.id + '\')">🗑️</button>' +
        '</td>';
    } else if (quickActions) {
      let btns = '';
      if (row.prioridad !== 'Alta') btns += '<button class="btn btn-ghost btn-sm" title="Marcar urgente" onclick="marcarOrden(\'' + row.id + '\',\'prioridad\',\'Alta\')">🔴 Urgente</button> ';
      if (row.tipo !== 'Extraordinario') btns += '<button class="btn btn-ghost btn-sm" title="Marcar mantenimiento extraordinario" onclick="marcarOrden(\'' + row.id + '\',\'tipo\',\'Extraordinario\')">⚠️ Extraordinario</button> ';
      if (row.estado !== 'Finalizado') btns += '<button class="btn btn-ghost btn-sm" title="Marcar cerrado" onclick="marcarOrdenCerrada(\'' + row.id + '\')">✅ Cerrado</button>';
      actions = '<td class="row-actions">' + btns + '</td>';
    }
    return '<tr>' +
      '<td>' + (row.fecha ? String(row.fecha).slice(0, 10) : '') + '</td>' +
      '<td>' + escapeHtml(sucursalNombre(row.sucursal_id)) + '</td>' +
      '<td>' + escapeHtml(row.tipo || '') + '</td>' +
      '<td>' + escapeHtml(tecnicoNombre(row.tecnico_id)) + '</td>' +
      '<td>' + escapeHtml(vehiculoLabel(row.vehiculo_id)) + '</td>' +
      '<td><span class="badge ' + badgeClass + '">' + row.estado + '</span></td>' +
      '<td>' + escapeHtml(row.prioridad || '') + '</td>' +
      '<td>$' + (Number(row.costo) || 0).toFixed(2) + '</td>' +
      actions + '</tr>';
  }).join('');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + (showActionsCol ? 9 : 8) + '" style="text-align:center;color:#9ca3af;padding:24px;">Sin órdenes registradas</td></tr>';
  }
}

function editOrden(id) {
  const row = state.cache.Ordenes.find(function (r) { return r.id === id; });
  openOrdenModal(row);
}
function deleteOrden(id) {
  if (!confirm('¿Eliminar esta orden?')) return;
  apiCall('delete', 'Ordenes', { id: id }).then(function () {
    return refreshOrdenesForRole();
  }).then(renderOrdenesTable);
}

// Refresca Ordenes desde el servidor y, si el usuario es Gerente de
// Área, vuelve a acotar el resultado a su zona (refreshSheet trae la
// lista completa sin filtrar).
function refreshOrdenesForRole() {
  return refreshSheet('Ordenes').then(function () {
    if (isAreaManager()) applyRoleScope();
  });
}

function marcarOrden(id, campo, valor) {
  const data = { id: id };
  data[campo] = valor;
  apiCall('update', 'Ordenes', data).then(function () {
    return refreshOrdenesForRole();
  }).then(renderOrdenesTable);
}

function marcarOrdenCerrada(id) {
  apiCall('update', 'Ordenes', { id: id, estado: 'Finalizado', fecha_cierre: new Date().toISOString() }).then(function () {
    return refreshOrdenesForRole();
  }).then(renderOrdenesTable);
}

/* ---------------- DASHBOARD ---------------- */
// Calculado en el cliente a partir de state.cache, para que respete
// automáticamente el filtrado por zona del Gerente de Área.
function renderDashboard() {
  const ordenes = state.cache.Ordenes || [];
  const vehiculos = state.cache.Vehiculos || [];
  const scoped = state.user.rol === 'Gerente de Área';

  const abiertas = ordenes.filter(function (o) { return o.estado !== 'Finalizado'; }).length;
  const cerradas = ordenes.filter(function (o) { return o.estado === 'Finalizado'; }).length;

  const tiempos = ordenes
    .filter(function (o) { return o.estado === 'Finalizado' && o.fecha && o.fecha_cierre; })
    .map(function (o) { return (new Date(o.fecha_cierre) - new Date(o.fecha)) / (1000 * 60 * 60 * 24); })
    .filter(function (n) { return !isNaN(n) && n >= 0; });
  const tiempoProm = tiempos.length ? (tiempos.reduce(function (a, b) { return a + b; }, 0) / tiempos.length).toFixed(1) : 0;

  const costoTotal = ordenes.reduce(function (sum, o) { return sum + (Number(o.costo) || 0); }, 0);

  const porTecnico = {};
  ordenes.forEach(function (o) { if (o.tecnico_id) porTecnico[o.tecnico_id] = (porTecnico[o.tecnico_id] || 0) + 1; });

  document.getElementById('kpiAbiertas').textContent = abiertas;
  document.getElementById('kpiCerradas').textContent = cerradas;
  document.getElementById('kpiTiempo').textContent = tiempoProm;
  document.getElementById('kpiCosto').textContent = '$' + costoTotal.toFixed(2);
  // Los vehículos no están ligados a una sucursal, así que ese dato no
  // se puede acotar por zona; se oculta para el Gerente de Área.
  document.getElementById('kpiFueraServicio').textContent = scoped ? 'N/D' : vehiculos.filter(function (v) { return v.estado === 'Fuera de servicio'; }).length;

  let topTecnico = '-';
  let max = 0;
  Object.keys(porTecnico).forEach(function (tid) {
    if (porTecnico[tid] > max) { max = porTecnico[tid]; topTecnico = tecnicoNombre(tid); }
  });
  document.getElementById('kpiTecnicoTop').textContent = topTecnico;

  renderCharts();
  renderSucursalesGrid();
}

function renderCharts() {
  const ordenes = state.cache.Ordenes || [];
  const estados = ['Pendiente', 'En proceso', 'Finalizado'];
  const countByEstado = estados.map(function (e) { return ordenes.filter(function (o) { return o.estado === e; }).length; });

  const porSucursal = {};
  ordenes.forEach(function (o) { if (o.sucursal_id) porSucursal[o.sucursal_id] = (porSucursal[o.sucursal_id] || 0) + 1; });
  const topSucursales = Object.keys(porSucursal)
    .map(function (id) { return { nombre: sucursalNombre(id), count: porSucursal[id] }; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, 10);

  if (state.charts.estado) state.charts.estado.destroy();
  state.charts.estado = new Chart(document.getElementById('chartEstado'), {
    type: 'doughnut',
    data: {
      labels: estados,
      datasets: [{ data: countByEstado, backgroundColor: ['#f4a300', '#1565c0', '#2a9d8f'] }]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  if (state.charts.sucursal) state.charts.sucursal.destroy();
  state.charts.sucursal = new Chart(document.getElementById('chartSucursal'), {
    type: 'bar',
    data: {
      labels: topSucursales.map(function (s) { return s.nombre; }),
      datasets: [{ label: 'Órdenes', data: topSucursales.map(function (s) { return s.count; }), backgroundColor: '#1e6091' }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}

function renderSucursalesGrid() {
  const grid = document.getElementById('sucursalesGrid');
  const sucursales = state.cache.Sucursales || [];
  grid.innerHTML = sucursales.map(function (s) {
    let cls = 'sucursal-badge';
    if (s.estado === 'Alerta') cls += ' alerta';
    else if (s.estado === 'Inactiva') cls += ' inactivo';
    return '<div class="' + cls + '" title="' + escapeHtml(s.direccion || '') + '">' + escapeHtml(s.nombre) + '</div>';
  }).join('');
  if (sucursales.length === 0) grid.innerHTML = '<p style="color:#9ca3af;">Registra tus sucursales para verlas aquí.</p>';
}

/* ---------------- SOLICITUD (Gerente de Sucursal) ---------------- */
// Vista mínima: el gerente de sucursal solo reporta necesidades de
// mantenimiento de SU propia sucursal y ve el estado de lo que reportó.
function renderSolicitudView() {
  const nombreEl = document.getElementById('solicitudSucursalNombre');
  const msgEl = document.getElementById('solicitudMsg');
  msgEl.textContent = '';
  document.getElementById('solDescripcion').value = '';

  Promise.all([
    apiCall('list', 'Sucursales'),
    apiCall('list', 'Ordenes')
  ]).then(function (results) {
    const sucursales = results[0].data || [];
    const ordenes = results[1].data || [];
    const misucursal = sucursales.find(function (s) { return s.id === state.user.sucursal_id; });

    nombreEl.textContent = misucursal
      ? 'Sucursal: ' + misucursal.nombre
      : 'No tienes una sucursal asignada. Pide a tu administrador que configure "sucursal_id" en tu usuario.';

    const misSolicitudes = ordenes
      .filter(function (o) { return o.sucursal_id === state.user.sucursal_id; })
      .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

    const thead = document.querySelector('#table-Solicitudes thead');
    const tbody = document.querySelector('#table-Solicitudes tbody');
    thead.innerHTML = '<tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Prioridad</th><th>Estado</th></tr>';
    tbody.innerHTML = misSolicitudes.map(function (row) {
      const badgeClass = row.estado === 'Finalizado' ? 'badge-finalizado' : (row.estado === 'En proceso' ? 'badge-enproceso' : 'badge-pendiente');
      return '<tr>' +
        '<td>' + (row.fecha ? String(row.fecha).slice(0, 10) : '') + '</td>' +
        '<td>' + escapeHtml(row.tipo || '') + '</td>' +
        '<td>' + escapeHtml(row.descripcion || '') + '</td>' +
        '<td>' + escapeHtml(row.prioridad || '') + '</td>' +
        '<td><span class="badge ' + badgeClass + '">' + row.estado + '</span></td>' +
        '</tr>';
    }).join('');
    if (misSolicitudes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:24px;">Aún no has reportado ninguna necesidad</td></tr>';
    }
  });
}

document.getElementById('btnEnviarSolicitud').addEventListener('click', function () {
  const msgEl = document.getElementById('solicitudMsg');
  const descripcion = document.getElementById('solDescripcion').value.trim();
  if (!state.user.sucursal_id) {
    msgEl.textContent = 'No tienes una sucursal asignada; no se puede enviar.';
    return;
  }
  if (!descripcion) {
    msgEl.textContent = 'Describe la necesidad antes de enviar.';
    return;
  }

  const data = {
    sucursal_id: state.user.sucursal_id,
    tipo: document.getElementById('solTipo').value,
    prioridad: document.getElementById('solPrioridad').value,
    descripcion: descripcion,
    estado: 'Pendiente',
    fecha: new Date().toISOString(),
    tecnico_id: '',
    vehiculo_id: '',
    costo: '',
    fecha_programada: '',
    observaciones: '',
    firma: ''
  };

  msgEl.textContent = 'Enviando...';
  apiCall('create', 'Ordenes', data).then(function () {
    msgEl.textContent = 'Solicitud enviada correctamente.';
    renderSolicitudView();
  }).catch(function () {
    msgEl.textContent = 'No se pudo enviar. Intenta de nuevo.';
  });
});

/* ---------------- INIT ---------------- */
tryAutoLogin();
