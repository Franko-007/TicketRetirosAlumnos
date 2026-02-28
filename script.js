/* ============================================================
   LICEO BICENTENARIO – NUESTRA SEÑORA DE GUADALUPE
   Sistema de Retiro de Alumnos
   Archivo: script.js
   ============================================================ */

"use strict";


/* ══════════════════════════════════════════════════════════
   1. CONFIGURACIÓN – URL DE GOOGLE SHEETS
   Pegue aquí la URL del Web App generada al implementar
   el archivo appscript.gs en Google Apps Script.
   Ejemplo: 'https://script.google.com/macros/s/AKfyc.../exec'
══════════════════════════════════════════════════════════ */
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwxki3F3lih4LBTjUa-rUM80jSYmF02mqKkJHrNG7JtgTs6V1oEKdJ8XW-PBiVKB2Y/exec';


/* ══════════════════════════════════════════════════════════
   2. ESTADO GLOBAL
══════════════════════════════════════════════════════════ */
const state = {
  ticketCount: 0,
  lastFolio:   null,
};
let registros = [];   // registros guardados en localStorage


/* ══════════════════════════════════════════════════════════
   3. UTILIDADES GENERALES
══════════════════════════════════════════════════════════ */

/** Rellena con cero a la izquierda */
const pad = n => String(n).padStart(2, '0');

/** Formatea hora HH:MM */
function formatTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Formatea fecha larga: "Lunes 22 de Febrero de 2026" */
function formatDate(d) {
  const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Formatea fecha corta: "22/02/2026" */
function formatDateShort(d) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Genera folio único: AAAAMMDD-NNNN */
function generateFolio() {
  const n = new Date();
  return `${n.getFullYear()}${pad(n.getMonth() + 1)}${pad(n.getDate())}-${String(state.ticketCount + 1).padStart(4, '0')}`;
}

/** Muestra una notificación flotante (toast) */
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 3400);
}


/* ══════════════════════════════════════════════════════════
   4. RELOJ EN TIEMPO REAL
══════════════════════════════════════════════════════════ */
function initClock() {
  const elTime = document.getElementById('current-time');
  const elDate = document.getElementById('current-date');
  const tick = () => {
    const now = new Date();
    elTime.textContent = formatTime(now);
    elDate.textContent = formatDate(now);
  };
  tick();
  setInterval(tick, 1000);
}


/* ══════════════════════════════════════════════════════════
   5. FORMATO RUT CHILENO AUTOMÁTICO
══════════════════════════════════════════════════════════ */
function autoFormatRut(el) {
  el.addEventListener('input', function () {
    let v = this.value.replace(/[^0-9kK]/g, '').toUpperCase();
    if (v.length < 2) { this.value = v; return; }
    const dv   = v.slice(-1);
    let body   = v.slice(0, -1);
    let fmt    = '';
    while (body.length > 3) {
      fmt  = '.' + body.slice(-3) + fmt;
      body = body.slice(0, -3);
    }
    this.value = body + fmt + '-' + dv;
  });
}


/* ══════════════════════════════════════════════════════════
   6. NAVEGACIÓN ENTRE PÁGINAS
══════════════════════════════════════════════════════════ */
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
}


/* ══════════════════════════════════════════════════════════
   7. VALIDACIÓN DEL FORMULARIO
══════════════════════════════════════════════════════════ */
function validateForm() {
  const required = [
    { id: 'alumnoNombre'   },
    { id: 'alumnoApellido' },
    { id: 'curso'          },
    { id: 'motivo'         },
    { id: 'apoderadoNombre'},
  ];
  let ok = true;
  required.forEach(f => {
    const el = document.getElementById(f.id);
    el.classList.remove('error');
    if (!el.value.trim()) { el.classList.add('error'); ok = false; }
  });
  if (!ok) showToast('⚠ Complete los campos obligatorios (*)', 'error');
  return ok;
}


/* ══════════════════════════════════════════════════════════
   8. LEER DATOS DEL FORMULARIO
══════════════════════════════════════════════════════════ */
function getFormData() {
  const now = new Date();
  return {
    alumnoNombre:    document.getElementById('alumnoNombre').value.trim(),
    alumnoApellido:  document.getElementById('alumnoApellido').value.trim(),
    curso:           document.getElementById('curso').value,
    rut:             document.getElementById('rut').value.trim()             || '—',
    motivo:          document.getElementById('motivo').value,
    motivoDetalle:   document.getElementById('motivoDetalle').value.trim(),
    apoderadoNombre: document.getElementById('apoderadoNombre').value.trim(),
    apoderadoRut:    document.getElementById('apoderadoRut').value.trim()    || '—',
    parentesco:      document.getElementById('parentesco').value,
    telefono:        document.getElementById('telefono').value.trim()        || '—',
    docente:         document.getElementById('autorizado').value.trim()      || '—',
    asignatura:      document.getElementById('funcionario').value.trim()     || '—',
    fecha:           formatDateShort(now),
    fechaLarga:      formatDate(now),
    hora:            formatTime(now),
    folio:           generateFolio(),
    timestamp:       now.toISOString(),
  };
}


/* ══════════════════════════════════════════════════════════
   9. CONSTRUCCIÓN DEL HTML DEL TICKET (vista previa)
══════════════════════════════════════════════════════════ */

/** Genera las barras del código de barras decorativo */
function buildBarcodeHTML(folio) {
  const seed = folio.replace(/\D/g, '');
  const pat  = [2,1,3,1,2,4,1,2,1,3,2,1,4,1,2,1,3,2,1,2,4,1,2,1,3,2];
  let bars   = '';
  pat.forEach((w, i) => {
    const x = parseInt(seed[i % seed.length] || '1') % 3;
    bars += `<span style="width:${w + x}px"></span>`;
  });
  return `<div class="tp-barcode">${bars}</div>`;
}

/** Genera el HTML de la vista previa en pantalla */
function renderPreview(d) {
  const motivo = d.motivoDetalle ? `${d.motivo} – ${d.motivoDetalle}` : d.motivo;
  return `
    <div class="ticket-preview-card">
      <div class="tp-header">
        <img src="https://i.postimg.cc/sxxwfhwK/LOGO-LBSNG-06-237x300.png"
             class="tp-header-logo" alt="Logo"
             onerror="this.style.display='none'">
        <div class="tp-header-text">
          <div class="tp-school-name">Liceo Bicentenario<br>Ntra. Sra. de Guadalupe</div>
          <div class="tp-school-sub">RETIRO DE ALUMNO / AUTORIZACIÓN DE SALIDA</div>
        </div>
      </div>

      <div class="tp-title">🎫 Comprobante de Retiro</div>
      <div class="tp-folio">Folio: <strong>${d.folio}</strong> &nbsp;|&nbsp; ${d.fecha} &nbsp;|&nbsp; ${d.hora} hrs.</div>

      <div class="tp-body">
        <div class="tp-section-title">▸ Datos del Alumno</div>
        <div class="tp-row"><span class="tp-label">Nombre</span><span class="tp-value">${d.alumnoNombre} ${d.alumnoApellido}</span></div>
        <div class="tp-row"><span class="tp-label">RUT</span><span class="tp-value">${d.rut}</span></div>
        <div class="tp-row"><span class="tp-label">Curso</span><span class="tp-value">${d.curso}</span></div>

        <div class="tp-section-title">▸ Motivo de Retiro</div>
        <div class="tp-row"><span class="tp-label">Motivo</span><span class="tp-value">${motivo}</span></div>

        <div class="tp-section-title">▸ Apoderado / Responsable</div>
        <div class="tp-row"><span class="tp-label">Nombre</span><span class="tp-value">${d.apoderadoNombre}</span></div>
        <div class="tp-row"><span class="tp-label">Parentesco</span><span class="tp-value">${d.parentesco}</span></div>
        <div class="tp-row"><span class="tp-label">RUT</span><span class="tp-value">${d.apoderadoRut}</span></div>
        <div class="tp-row"><span class="tp-label">Teléfono</span><span class="tp-value">${d.telefono}</span></div>

        <div class="tp-section-title">▸ Autorización Docente</div>
        <div class="tp-row"><span class="tp-label">Docente</span><span class="tp-value">${d.docente}</span></div>
        <div class="tp-row"><span class="tp-label">Asignatura</span><span class="tp-value">${d.asignatura}</span></div>
      </div>

      ${buildBarcodeHTML(d.folio)}

      <div class="tp-footer">
        ${d.fechaLarga} — ${d.hora} hrs.<br>
        Este documento acredita el retiro autorizado del establecimiento. Conserve este comprobante.
      </div>

      <div class="tp-firma-box">
        <div class="tp-firma-title">▸ Firma y Timbre del Docente</div>
        <div class="tp-firma-cols">
          <div class="tp-firma-col">Nombre Docente</div>
          <div class="tp-firma-col">Asignatura</div>
          <div class="tp-firma-col">Firma y Timbre</div>
        </div>
      </div>
    </div>`;
}

/** Genera el HTML del ticket para impresora térmica 80mm */
function buildPrintTicket(d) {
  const motivo = d.motivoDetalle ? `${d.motivo} - ${d.motivoDetalle}` : d.motivo;
  return `
    <div class="print-ticket">
      <div class="print-header">
        <div class="print-school-name">LICEO BICENTENARIO</div>
        <div class="print-school-name">NRA. SRA. DE GUADALUPE</div>
        <div class="print-school-sub">Santiago, Chile — Sistema de Retiro</div>
      </div>

      <div class="print-title-bar">RETIRO DE ALUMNO</div>
      <div class="print-folio">Folio: ${d.folio}</div>

      <div class="print-section">Alumno</div>
      <div class="print-big">${d.alumnoNombre} ${d.alumnoApellido}</div>
      <div class="print-row"><span class="print-lbl">RUT:</span><span class="print-val">${d.rut}</span></div>
      <div class="print-row"><span class="print-lbl">Curso:</span><span class="print-val">${d.curso}</span></div>

      <div class="print-section">Retiro</div>
      <div class="print-row"><span class="print-lbl">Fecha:</span><span class="print-val">${d.fecha}</span></div>
      <div class="print-row"><span class="print-lbl">Hora:</span><span class="print-val">${d.hora} hrs.</span></div>
      <div class="print-row"><span class="print-lbl">Motivo:</span><span class="print-val">${motivo}</span></div>

      <div class="print-section">Apoderado</div>
      <div class="print-row"><span class="print-lbl">Nombre:</span><span class="print-val">${d.apoderadoNombre}</span></div>
      <div class="print-row"><span class="print-lbl">Parentesco:</span><span class="print-val">${d.parentesco}</span></div>
      <div class="print-row"><span class="print-lbl">RUT:</span><span class="print-val">${d.apoderadoRut}</span></div>

      <div class="print-section">Autorización</div>
      <div class="print-row"><span class="print-lbl">Docente:</span><span class="print-val">${d.docente}</span></div>
      <div class="print-row"><span class="print-lbl">Asignatura:</span><span class="print-val">${d.asignatura}</span></div>

      <div class="print-sign">
        <div class="print-sign-box">Nombre Docente</div>
        <div class="print-sign-box">Firma y Timbre</div>
        <div class="print-sign-box">Firma Apoderado</div>
      </div>

      <div class="print-footer">
        <div class="print-barcode">||||| ${d.folio} |||||</div>
        <div>${d.fechaLarga}</div>
        <div>Comprobante de retiro autorizado.</div>
        <div>Conserve este documento.</div>
      </div>
      <div class="print-cut">- - - - - CORTAR - - - - -</div>
    </div>`;
}


/* ══════════════════════════════════════════════════════════
   10. INTEGRACIÓN GOOGLE SHEETS
══════════════════════════════════════════════════════════ */
async function enviarASheets(data) {
  if (!SHEETS_URL) return;   // si no hay URL configurada, no hace nada

  const s = document.getElementById('sheetsStatus');
  s.className = 'sheets-status loading';
  s.innerHTML = '⏳ Guardando en Google Sheets...';

  const payload = {
    folio:          data.folio,
    fecha:          data.fecha,
    hora:           data.hora,
    alumno:         `${data.alumnoNombre} ${data.alumnoApellido}`,
    rut_alumno:     data.rut,
    curso:          data.curso,
    motivo:         data.motivo + (data.motivoDetalle ? ' - ' + data.motivoDetalle : ''),
    apoderado:      data.apoderadoNombre,
    rut_apoderado:  data.apoderadoRut,
    parentesco:     data.parentesco,
    telefono:       data.telefono,
    docente:        data.docente,
    asignatura:     data.asignatura,
    timestamp:      data.timestamp,
  };

  try {
    await fetch(SHEETS_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    s.className = 'sheets-status success';
    s.innerHTML = '✅ Registrado en Google Sheets correctamente';
    showToast('✓ Guardado en Google Sheets');
  } catch (e) {
    s.className = 'sheets-status error';
    s.innerHTML = '❌ Error al conectar con Google Sheets.';
    showToast('Error al guardar en Sheets', 'error');
  }
}


/* ══════════════════════════════════════════════════════════
   11. ALMACENAMIENTO LOCAL (respaldo en el navegador)
══════════════════════════════════════════════════════════ */
function guardarLocal(data) {
  try {
    const stored = JSON.parse(localStorage.getItem('retiros_registros') || '[]');
    stored.push(data);
    localStorage.setItem('retiros_registros', JSON.stringify(stored));
    registros = stored;
  } catch (e) { /* silencioso si el localStorage no está disponible */ }
}

function cargarRegistros() {
  try {
    registros = JSON.parse(localStorage.getItem('retiros_registros') || '[]');
  } catch (e) {
    registros = [];
  }
}


/* ══════════════════════════════════════════════════════════
   12. GENERAR TICKET
══════════════════════════════════════════════════════════ */
function generateTicket(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const data = getFormData();
  state.ticketCount++;
  state.lastFolio = data.folio;

  // Actualizar estadísticas
  document.getElementById('ticketCount').textContent    = state.ticketCount;
  document.getElementById('lastTicketTime').textContent = data.hora;
  document.getElementById('currentFolio').textContent   = data.folio;

  // Renderizar vista previa
  const preview = document.getElementById('ticketPreview');
  preview.className = '';
  preview.innerHTML = renderPreview(data);

  // Preparar área de impresión térmica
  document.getElementById('printArea').innerHTML = buildPrintTicket(data);

  // Mostrar botones de acción
  document.getElementById('previewActions').style.display = 'flex';

  // Guardar datos
  guardarLocal(data);
  enviarASheets(data);

  // Persistir contador diario
  try {
    localStorage.setItem(`retiro_${new Date().toDateString()}`, state.ticketCount);
  } catch (e) {}

  showToast(`✓ Ticket ${data.folio} generado correctamente`);
  preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


/* ══════════════════════════════════════════════════════════
   13. IMPRIMIR TICKET (impresora térmica 80mm)
══════════════════════════════════════════════════════════ */
function printTicket() {
  document.body.className = 'print-ticket-mode';
  window.print();
  setTimeout(() => { document.body.className = ''; }, 1000);
  showToast('🖨 Enviando a impresora térmica…');
}


/* ══════════════════════════════════════════════════════════
   14. IMPRIMIR INFORME (hoja A4)
══════════════════════════════════════════════════════════ */
function imprimirInforme() {
  const contenido = document.getElementById('reportContent');
  if (contenido.querySelector('.empty-report') || contenido.querySelector('.empty-icon')) {
    showToast('⚠ Primero genere un informe', 'error');
    return;
  }
  document.body.className = 'print-informe-mode';
  window.print();
  setTimeout(() => { document.body.className = ''; }, 1000);
}


/* ══════════════════════════════════════════════════════════
   15. LIMPIAR FORMULARIO
══════════════════════════════════════════════════════════ */
function resetForm() {
  document.getElementById('ticketForm').reset();

  const p = document.getElementById('ticketPreview');
  p.className = 'ticket-empty';
  p.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🎫</div>
      <p>Complete el formulario y presione<br><strong>Generar Ticket</strong> para ver la vista previa</p>
    </div>`;

  document.getElementById('previewActions').style.display = 'none';
  document.getElementById('sheetsStatus').className = 'sheets-status';
  document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  showToast('Formulario limpiado');
}


/* ══════════════════════════════════════════════════════════
   16. INFORME MENSUAL
══════════════════════════════════════════════════════════ */
async function generarInforme() {
  const mes   = parseInt(document.getElementById('reportMes').value);
  const anio  = parseInt(document.getElementById('reportAnio').value);
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Mostrar indicador de carga
  document.getElementById('reportContent').innerHTML = `
    <div class="empty-report">
      <div class="empty-icon">⏳</div>
      <p>Cargando datos desde Google Sheets...</p>
    </div>`;

  // Intentar cargar datos desde Google Sheets
  let sheetsData = [];
  if (SHEETS_URL) {
    try {
      const url = `${SHEETS_URL}?action=getRetiros&mes=${mes}&anio=${anio}`;
      const resp = await fetch(url);
      const json = await resp.json();
      if (json.ok && Array.isArray(json.registros)) {
        sheetsData = json.registros;
      }
    } catch (err) {
      console.warn('No se pudo cargar desde Sheets, usando datos locales:', err);
    }
  }

  // Combinar datos de Sheets con localStorage (sin duplicar por folio)
  const localData = registros.filter(r => {
    const d = new Date(r.timestamp);
    return d.getFullYear() === anio && (d.getMonth() + 1) === mes;
  });

  // Normalizar registros de Sheets al mismo formato que localStorage
  const sheetsNormalized = sheetsData.map(r => ({
    folio:         r.folio         || '',
    fecha:         r.fecha         || '',
    hora:          r.hora          || '',
    alumno:        r.alumno        || '',
    alumnoNombre:  (r.alumno || '').split(' ')[0] || '',
    alumnoApellido:(r.alumno || '').split(' ').slice(1).join(' ') || '',
    rut:           r.rut_alumno    || '—',
    curso:         r.curso         || '',
    motivo:        r.motivo        || '',
    motivoDetalle: '',
    apoderado:     r.apoderado     || '',
    apoderadoNombre: r.apoderado   || '',
    apoderadoRut:  r.rut_apoderado || '—',
    parentesco:    r.parentesco    || '',
    telefono:      r.telefono      || '—',
    docente:       r.docente       || '—',
    asignatura:    r.asignatura    || '—',
    timestamp:     r.timestamp     || '',
  }));

  // Unir: preferir Sheets, completar con local si no está en Sheets
  const sheetsFolios = new Set(sheetsNormalized.map(r => r.folio));
  const soloLocal    = localData.filter(r => !sheetsFolios.has(r.folio));
  const data         = [...sheetsNormalized, ...soloLocal]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (data.length === 0) {
    document.getElementById('reportContent').innerHTML = `
      <div class="empty-report">
        <div class="empty-icon">📭</div>
        <p>No hay registros para <strong>${MESES[mes - 1]} ${anio}</strong></p>
        <p style="font-size:0.8rem;margin-top:8px;color:var(--text-soft)">
          Los retiros generados se guardan automáticamente en Google Sheets.
        </p>
      </div>`;
    return;
  }

  // Calcular estadísticas
  const totalRetiros  = data.length;
  const alumnosUnicos = new Set(data.map(r => r.alumno || `${r.alumnoNombre || ''} ${r.alumnoApellido || ''}`.trim())).size;
  const motivosCont   = {};
  const cursosCont    = {};
  const diasCont      = {};

  data.forEach(r => {
    const m = (r.motivo || '').split(' - ')[0];
    motivosCont[m]      = (motivosCont[m]      || 0) + 1;
    cursosCont[r.curso] = (cursosCont[r.curso] || 0) + 1;
    const dia = new Date(r.timestamp).getDate();
    diasCont[dia]       = (diasCont[dia]       || 0) + 1;
  });

  const motivoTop  = Object.entries(motivosCont).sort((a, b) => b[1] - a[1])[0];
  const cursoTop   = Object.entries(cursosCont).sort((a, b) => b[1] - a[1])[0];
  const diasLabels = Object.keys(diasCont).map(Number).sort((a, b) => a - b);
  const diasVals   = diasLabels.map(d => diasCont[d]);

  // Paleta de colores institucional para gráficos
  const PIE_COLORS = ['#1a2c6b','#2a3f8f','#3d55b0','#f5c800','#ffe44d','#5e72c7','#7a8dd4','#8a6f00'];

  // Renderizar informe
  document.getElementById('reportContent').innerHTML = `
    <div class="informe-cabecera">
      <img src="https://i.postimg.cc/sxxwfhwK/LOGO-LBSNG-06-237x300.png"
           class="inf-logo" alt="Logo" onerror="this.style.display='none'">
      <div class="inf-title">
        <div class="inf-sub">Liceo Bicentenario – Nuestra Señora de Guadalupe</div>
        <div class="inf-h">Informe Mensual de Retiros</div>
        <div class="inf-date">${MESES[mes - 1]} ${anio} — Generado el ${formatDate(new Date())}</div>
      </div>
    </div>

    <div class="summary-stats">
      <div class="summary-card">
        <div class="summary-num">${totalRetiros}</div>
        <div class="summary-lbl">Total Retiros</div>
      </div>
      <div class="summary-card s2">
        <div class="summary-num">${alumnosUnicos}</div>
        <div class="summary-lbl">Alumnos Distintos</div>
      </div>
      <div class="summary-card s3">
        <div class="summary-num">${motivoTop ? motivoTop[1] : 0}</div>
        <div class="summary-lbl">Motivo Principal</div>
      </div>
      <div class="summary-card s4">
        <div class="summary-num">${cursoTop ? cursoTop[1] : 0}</div>
        <div class="summary-lbl">Curso + Retiros</div>
      </div>
    </div>

    <div class="report-grid">
      <div class="report-card">
        <div class="report-card-header"><h3>📅 Retiros por Día del Mes</h3></div>
        <div class="report-card-body">
          <div class="chart-container"><canvas id="chartLine"></canvas></div>
        </div>
      </div>
      <div class="report-card">
        <div class="report-card-header"><h3>🎯 Retiros por Motivo</h3></div>
        <div class="report-card-body">
          <div class="chart-container"><canvas id="chartPie"></canvas></div>
        </div>
      </div>
      <div class="report-card report-card-full">
        <div class="report-card-header"><h3>🏫 Retiros por Curso</h3></div>
        <div class="report-card-body">
          <div class="chart-container" style="height:220px"><canvas id="chartBar"></canvas></div>
        </div>
      </div>
    </div>

    <div class="report-card" style="margin-bottom:24px">
      <div class="report-card-header"><h3>📋 Detalle Completo — ${MESES[mes - 1]} ${anio}</h3></div>
      <div style="overflow-x:auto">
        <table class="retiros-table">
          <thead>
            <tr>
              <th>Folio</th><th>Fecha</th><th>Hora</th><th>Alumno</th>
              <th>Curso</th><th>Apoderado</th><th>Motivo</th>
              <th>Docente</th><th>Asignatura</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(r => `
              <tr>
                <td style="font-family:var(--font-cond);font-size:0.75rem;color:var(--navy);font-weight:700">${r.folio}</td>
                <td>${r.fecha}</td>
                <td>${r.hora} hrs.</td>
                <td><strong>${r.alumno || `${r.alumnoNombre || ''} ${r.alumnoApellido || ''}`.trim() || '—'}</strong></td>
                <td><span class="curso-badge">${r.curso}</span></td>
                <td>${r.apoderado || r.apoderadoNombre || '—'}</td>
                <td>${r.motivo}</td>
                <td>${r.docente    || '—'}</td>
                <td>${r.asignatura || '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  // Renderizar gráficos con Chart.js (pequeño delay para que el DOM esté listo)
  setTimeout(() => {

    // Gráfico de línea – retiros por día
    new Chart(document.getElementById('chartLine'), {
      type: 'line',
      data: {
        labels: diasLabels.map(d => `Día ${d}`),
        datasets: [{
          label: 'Retiros',
          data: diasVals,
          borderColor: '#1a2c6b',
          backgroundColor: 'rgba(26,44,107,0.10)',
          borderWidth: 2.5,
          pointBackgroundColor: '#f5c800',
          pointBorderColor: '#1a2c6b',
          pointRadius: 5,
          tension: 0.3,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });

    // Gráfico de torta – retiros por motivo
    new Chart(document.getElementById('chartPie'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(motivosCont),
        datasets: [{
          data: Object.values(motivosCont),
          backgroundColor: PIE_COLORS,
          borderColor: '#fff',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } },
      },
    });

    // Gráfico de barras – retiros por curso
    const cLabels = Object.keys(cursosCont).sort();
    new Chart(document.getElementById('chartBar'), {
      type: 'bar',
      data: {
        labels: cLabels,
        datasets: [{
          label: 'Retiros',
          data: cLabels.map(c => cursosCont[c]),
          backgroundColor: 'rgba(26,44,107,0.82)',
          borderColor: '#0f1a45',
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });

  }, 80);
}


/* ══════════════════════════════════════════════════════════
   17. INICIALIZACIÓN
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {

  initClock();
  cargarRegistros();

  // Formato RUT automático
  autoFormatRut(document.getElementById('rut'));
  autoFormatRut(document.getElementById('apoderadoRut'));

  // Poblar selector de años (año actual ± 2)
  const anioSelect  = document.getElementById('reportAnio');
  const anioActual  = new Date().getFullYear();
  for (let a = anioActual + 1; a >= anioActual - 2; a--) {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    if (a === anioActual) opt.selected = true;
    anioSelect.appendChild(opt);
  }

  // Seleccionar mes actual en el informe
  document.getElementById('reportMes').value = new Date().getMonth() + 1;

  // Recuperar contador diario de tickets
  try {
    const saved = parseInt(localStorage.getItem(`retiro_${new Date().toDateString()}`)) || 0;
    state.ticketCount = saved;
    document.getElementById('ticketCount').textContent = saved;
  } catch (e) {}

  // Eventos del formulario
  document.getElementById('ticketForm').addEventListener('submit', generateTicket);
  document.getElementById('btnLimpiar').addEventListener('click', resetForm);
  document.getElementById('btnImprimir').addEventListener('click', printTicket);
  document.getElementById('btnNuevo').addEventListener('click', resetForm);

  // Atajos de teclado
  document.addEventListener('keydown', e => {
    // Ctrl+Enter → generar ticket
    if (e.ctrlKey && e.key === 'Enter') {
      document.getElementById('ticketForm').dispatchEvent(new Event('submit'));
    }
    // Ctrl+P → imprimir ticket (si hay uno generado)
    if (e.ctrlKey && e.key === 'p') {
      e.preventDefault();
      if (state.lastFolio) printTicket();
    }
  });

});
