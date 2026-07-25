const CONFIG = {
  API_URL:'https://script.google.com/macros/s/AKfycbxtRRrjb5cfytgAnIbaAGqOea2UMwi2ZVZio1l5BlWH57EuhrbXgGXeag_hemiId9m-/exec'
};

const MENU = [
  { id: 'dashboard',  label: '📊 Dashboard',          roles: ['Administrador', 'Supervisor', 'Gerente', 'Consulta', 'Técnico'] },
  { id: 'ordenes',    label: '🧾 Órdenes de trabajo',  roles: ['Administrador', 'Supervisor', 'Técnico', 'Consulta'] },
  { id: 'sucursales', label: '🏢 Sucursales',          roles: ['Administrador', 'Supervisor', 'Gerente', 'Consulta'] },
  { id: 'tecnicos',   label: '👷 Técnicos',            roles: ['Administrador', 'Supervisor', 'Gerente'] },
  { id: 'vehiculos',  label: '🚚 Vehículos',           roles: ['Administrador', 'Supervisor', 'Gerente', 'Consulta'] },
  { id: 'inventario', label: '📦 Inventario',          roles: ['Administrador', 'Supervisor'] },
  { id: 'preventivo', label: '📅 Preventivo',          roles: ['Administrador', 'Supervisor', 'Técnico'] },
];

const ENTITIES = {
  Sucursales: {
    label: 'Sucursal',
    fields: [
      { key: 'nombre', label: 'Nombre', type: 'text', required: true },
      { key: 'direccion', label: 'Dirección', type: 'text' },
      { key: 'ciudad', label: 'Ciudad', type: 'text' },
      { key: 'contacto', label: 'Contacto', type: 'text' },
      { key: 'telefono', label: 'Teléfono', type: 'text' },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Operativa', 'Alerta', 'Inactiva'] }
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
   API (puente formulario + iframe oculto + postMessage)
   ----------------------------------------------------------
   Google Apps Script bloquea de forma intermitente las
   llamadas fetch() por CORS, incluso con la configuración
   correcta. Los envíos de <form> a un iframe oculto no están
   sujetos a esa restricción, y postMessage() sí puede cruzar
   orígenes sin problema. Code.gs responde con una página HTML
   que hace parent.postMessage(...) de vuelta.
   ---------------------------------------------------------- */
let bridgeIframe = null;
const pendingRequests = {};
let reqCounter = 0;

function ensureBridgeIframe() {
  if (bridgeIframe) return bridgeIframe;
  bridgeIframe = document.createElement('iframe');
  bridgeIframe.name = 'cmmsBridgeFrame';
  bridgeIframe.style.display = 'none';
  document.body.appendChild(bridgeIframe);
  window.addEventListener('message', function (ev) {
    const d = ev.data;
    if (!d || !d.__cmmsBridge) return;
    const pending = pendingRequests[d.reqId];
    if (pending) {
      pending.resolve(d.data);
      delete pendingRequests[d.reqId];
    }
  });
  return bridgeIframe;
}

function apiCall(action, sheet, body) {
  ensureBridgeIframe();
  return new Promise(function (resolve, reject) {
    const reqId = 'r' + (++reqCounter) + '_' + Date.now();
    pendingRequests[reqId] = { resolve: resolve, reject: reject };

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = CONFIG.API_URL;
    form.target = 'cmmsBridgeFrame';
    form.style.display = 'none';

    function addField(name, value) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    addField('action', action);
    if (sheet) addField('sheet', sheet);
    addField('viaForm', '1');
    addField('reqId', reqId);
    addField('payload', JSON.stringify(body || {}));

    document.body.appendChild(form);
    form.submit();
    setTimeout(function () { form.remove(); }, 1000);

    setTimeout(function () {
      if (pendingRequests[reqId]) {
        delete pendingRequests[reqId];
        reject(new Error('Tiempo de espera agotado'));
      }
    }, 20000);
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
      state.user = res.user;
      sessionStorage.setItem('cmms_user', JSON.stringify(res.user));
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
    state.user = JSON.parse(saved);
    startApp();
  }
}

/* ---------------- APP SHELL ---------------- */
function startApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('sidebarUser').textContent = state.user.nombre + ' · ' + state.user.rol;
  buildSidebar();
  loadAll().then(function () {
    setApiStatus(true);
    switchView('dashboard');
  });
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
  const titles = { dashboard: 'Dashboard', ordenes: 'Órdenes de trabajo', sucursales: 'Sucursales', tecnicos: 'Técnicos', vehiculos: 'Vehículos', inventario: 'Inventario', preventivo: 'Mantenimiento preventivo' };
  document.getElementById('viewTitle').textContent = titles[viewId];

  if (viewId === 'dashboard') renderDashboard();
  else if (viewId === 'ordenes') renderOrdenesTable();
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

  thead.innerHTML = '<tr>' + cfg.fields.map(function (f) { return '<th>' + f.label + '</th>'; }).join('') + '<th>Acciones</th></tr>';

  const rows = state.cache[entityName] || [];
  tbody.innerHTML = rows.map(function (row) {
    const cells = cfg.fields.map(function (f) {
      let val = row[f.key] !== undefined ? row[f.key] : '';
      if (f.type === 'select-sucursal') val = sucursalNombre(val);
      return '<td>' + escapeHtml(String(val)) + '</td>';
    }).join('');
    return '<tr>' + cells +
      '<td class="row-actions">' +
      '<button title="Editar" onclick="editGeneric(\'' + entityName + '\',\'' + row.id + '\')">✏️</button>' +
      '<button title="Eliminar" onclick="deleteGeneric(\'' + entityName + '\',\'' + row.id + '\')">🗑️</button>' +
      '</td></tr>';
  }).join('');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + (cfg.fields.length + 1) + '" style="text-align:center;color:#9ca3af;padding:24px;">Sin registros todavía</td></tr>';
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

/* ---------------- ORDENES (rich modal) ---------------- */
document.getElementById('btnNuevaOrden').addEventListener('click', function () { openOrdenModal(null); });
document.getElementById('ordenModalClose').addEventListener('click', closeOrdenModal);
document.getElementById('ordenCancel').addEventListener('click', closeOrdenModal);
document.getElementById('filtroEstado').addEventListener('change', renderOrdenesTable);

function closeOrdenModal() {
  document.getElementById('ordenModalOverlay').classList.add('hidden');
  state.ordenEditingId = null;
}

let currentFotoAntes = '';
let currentFotoDespues = '';

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

  currentFotoAntes = existingRow ? (existingRow.foto_antes || '') : '';
  currentFotoDespues = existingRow ? (existingRow.foto_despues || '') : '';
  togglePreview('fotoAntesPreview', currentFotoAntes);
  togglePreview('fotoDespuesPreview', currentFotoDespues);
  document.getElementById('fotoAntesInput').value = '';
  document.getElementById('fotoDespuesInput').value = '';

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

function togglePreview(imgId, dataUrl) {
  const img = document.getElementById(imgId);
  if (dataUrl) { img.src = dataUrl; img.classList.remove('hidden'); }
  else { img.classList.add('hidden'); img.src = ''; }
}

document.getElementById('fotoAntesInput').addEventListener('change', function (e) {
  if (!e.target.files[0]) return;
  resizeImageFile(e.target.files[0], 800, function (dataUrl) {
    currentFotoAntes = dataUrl;
    togglePreview('fotoAntesPreview', dataUrl);
  });
});
document.getElementById('fotoDespuesInput').addEventListener('change', function (e) {
  if (!e.target.files[0]) return;
  resizeImageFile(e.target.files[0], 800, function (dataUrl) {
    currentFotoDespues = dataUrl;
    togglePreview('fotoDespuesPreview', dataUrl);
  });
});

function resizeImageFile(file, maxWidth, callback) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
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
    foto_antes: currentFotoAntes,
    foto_despues: currentFotoDespues,
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

function renderOrdenesTable() {
  const tbody = document.querySelector('#table-Ordenes tbody');
  const thead = document.querySelector('#table-Ordenes thead');
  thead.innerHTML = '<tr><th>Fecha</th><th>Sucursal</th><th>Tipo</th><th>Técnico</th><th>Vehículo</th><th>Estado</th><th>Prioridad</th><th>Costo</th><th>Acciones</th></tr>';

  const filtro = document.getElementById('filtroEstado').value;
  let rows = state.cache.Ordenes || [];
  if (filtro) rows = rows.filter(function (r) { return r.estado === filtro; });
  rows = rows.slice().sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  tbody.innerHTML = rows.map(function (row) {
    const badgeClass = row.estado === 'Finalizado' ? 'badge-finalizado' : (row.estado === 'En proceso' ? 'badge-enproceso' : 'badge-pendiente');
    return '<tr>' +
      '<td>' + (row.fecha ? String(row.fecha).slice(0, 10) : '') + '</td>' +
      '<td>' + escapeHtml(sucursalNombre(row.sucursal_id)) + '</td>' +
      '<td>' + escapeHtml(row.tipo || '') + '</td>' +
      '<td>' + escapeHtml(tecnicoNombre(row.tecnico_id)) + '</td>' +
      '<td>' + escapeHtml(vehiculoLabel(row.vehiculo_id)) + '</td>' +
      '<td><span class="badge ' + badgeClass + '">' + row.estado + '</span></td>' +
      '<td>' + escapeHtml(row.prioridad || '') + '</td>' +
      '<td>$' + (Number(row.costo) || 0).toFixed(2) + '</td>' +
      '<td class="row-actions">' +
      '<button title="Editar" onclick="editOrden(\'' + row.id + '\')">✏️</button>' +
      '<button title="Eliminar" onclick="deleteOrden(\'' + row.id + '\')">🗑️</button>' +
      '</td></tr>';
  }).join('');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9ca3af;padding:24px;">Sin órdenes registradas</td></tr>';
  }
}

function editOrden(id) {
  const row = state.cache.Ordenes.find(function (r) { return r.id === id; });
  openOrdenModal(row);
}
function deleteOrden(id) {
  if (!confirm('¿Eliminar esta orden?')) return;
  apiCall('delete', 'Ordenes', { id: id }).then(function () {
    return refreshSheet('Ordenes');
  }).then(renderOrdenesTable);
}

/* ---------------- DASHBOARD ---------------- */
function renderDashboard() {
  apiCall('dashboard', null, {}).then(function (stats) {
    document.getElementById('kpiAbiertas').textContent = stats.abiertas || 0;
    document.getElementById('kpiCerradas').textContent = stats.cerradas || 0;
    document.getElementById('kpiTiempo').textContent = stats.tiempoPromedio || 0;
    document.getElementById('kpiCosto').textContent = '$' + (Number(stats.costoTotal) || 0).toFixed(2);
    document.getElementById('kpiFueraServicio').textContent = stats.fueraDeServicio || 0;

    let topTecnico = '-';
    let max = 0;
    Object.keys(stats.porTecnico || {}).forEach(function (tid) {
      if (stats.porTecnico[tid] > max) { max = stats.porTecnico[tid]; topTecnico = tecnicoNombre(tid); }
    });
    document.getElementById('kpiTecnicoTop').textContent = topTecnico;

    renderCharts();
    renderSucursalesGrid();
  });
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

/* ---------------- INIT ---------------- */
tryAutoLogin();
