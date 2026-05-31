// ============================================================
// fichas_ui.js  —  UI de Fichas Clínicas · FONO360
// Versión 2 — con secciones de contexto anamnésico
// ============================================================
//
// ORDEN DE CARGA REQUERIDO:
//   utils.js → storage.js → <script principal> → scoring.js
//   → fichas.js → fichas_ui.js
//
// DEPENDENCIAS GLOBALES (resueltas en runtime):
//   utils.js   : toast(msg, type), esc(str)
//   principal  : curP (string), S (objeto global)
//   storage.js : saveS()
//   fichas.js  : fichaClinicaCreate, fichaClinicaGet,
//                fichaClinicaUpdate, fichaClinicaDelete,
//                fichaClinicaList, fichaEstado, fichaPct
//
// ARQUITECTURA DE CAMPOS — DOS GRUPOS:
//
//   _FICHA_CAMPOS_BASE  → campos del schema v1 de fichas.js
//     Los 4 que fichaPct()/fichaEstado() calculan.
//     Se persisten vía fichaClinicaUpdate() (CAMPOS_EDITABLES).
//     Afectan el % de completado y el badge de estado.
//
//   _FICHA_CAMPOS_EXTRA → extensión aditiva en fichas_ui.js v2
//     7 campos nuevos (medicacion + 6 secciones anamnésicas).
//     NO afectan fichaPct() ni fichaEstado() → fichas.js intacto.
//     Se persisten directamente en el objeto con un único saveS().
//     Compatibilidad total: campo ausente = string vacío (f[id]||'').
//
// ARCHIVOS MODIFICADOS:
//   fichas_ui.js  → este archivo (reemplaza v1 completo)
//   fichas.js     → NO SE MODIFICA
//   index_html.html → NO SE MODIFICA (3 cambios previos son suficientes)
//
// MIGRACIÓN:
//   Ninguna requerida. Las fichas existentes (v1) simplemente
//   no tendrán los campos extra → se leen como string vacío.
//   Al guardar por primera vez, el campo se persiste.
//
// ============================================================

// ── Estado interno del módulo ────────────────────────────────
var _fichaActivaId = null;   // resetea en rFichas() si cambia paciente
var _fichaDebounce = null;   // timer de autoguardado

// Secciones colapsables: Set con los nombres de secciones ABIERTAS.
// Persiste en memoria de sesión (no en localStorage — es preferencia de UI).
// Por defecto: ninguna sección abierta (cerradas al entrar).
var _fichaSecAbiertas = {}; // { 'Antecedentes del desarrollo': true, ... }

// ════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE CAMPOS
// ════════════════════════════════════════════════════════════

// ── Campos base: schema v1 de fichas.js ─────────────────────
// Afectan fichaPct() y fichaEstado(). Se guardan vía fichaClinicaUpdate().
var _FICHA_CAMPOS_BASE = [
  { id: 'motivoConsulta',
    label: '📋 Motivo de consulta',
    hint:  'Razón de derivación o consulta inicial…',
    rows:  3 },
  { id: 'antecedentes',
    label: '🏥 Antecedentes',
    hint:  'Historia clínica médica, familiar y evolutiva relevante…',
    rows:  4 },
  { id: 'diagnostico',
    label: '🔍 Diagnóstico fonoaudiológico',
    hint:  'Impresión diagnóstica, clasificación…',
    rows:  3 },
  { id: 'observaciones',
    label: '💬 Observaciones clínicas',
    hint:  'Comportamiento, contexto de evaluación, notas adicionales…',
    rows:  3 },
];

// ── Campos extra: extensión aditiva (sin tocar fichas.js) ────
// NO afectan fichaPct()/fichaEstado(). Se guardan directamente en el objeto.
// Organizados en dos secciones visuales para el editor.
var _FICHA_CAMPOS_EXTRA = [
  // Sección 1 — Antecedentes del desarrollo
  { id: 'medicacion',
    label: '💊 Medicación actual',
    hint:  'Medicamentos vigentes, dosis si es relevante…',
    rows:  2,
    seccion: 'Antecedentes del desarrollo' },
  { id: 'desarrolloEvolutivo',
    label: '👶 Desarrollo evolutivo',
    hint:  'Hitos del desarrollo: gateo, marcha, primeras palabras, control de esfínteres…',
    rows:  3,
    seccion: 'Antecedentes del desarrollo' },
  { id: 'alimentacion',
    label: '🍽️ Alimentación',
    hint:  'Tipo de alimentación, consistencias, dificultades de masticación o deglución…',
    rows:  2,
    seccion: 'Antecedentes del desarrollo' },
  { id: 'suenio',
    label: '🌙 Sueño',
    hint:  'Patrón de sueño, ronquidos, apneas, dificultades para conciliar…',
    rows:  2,
    seccion: 'Antecedentes del desarrollo' },

  // Sección 2 — Contexto familiar y escolar
  { id: 'escolaridad',
    label: '🏫 Escolaridad',
    hint:  'Institución, año/grado, rendimiento académico, apoyo escolar, dificultades…',
    rows:  2,
    seccion: 'Contexto familiar y escolar' },
  { id: 'comunicacion',
    label: '🗣️ Comunicación',
    hint:  'Modalidad comunicativa habitual, interacción con pares y adultos, uso del lenguaje…',
    rows:  3,
    seccion: 'Contexto familiar y escolar' },
  { id: 'observacionesFamiliares',
    label: '👨‍👩‍👧 Observaciones familiares',
    hint:  'Preocupaciones de la familia, dinámica vincular, contexto sociofamiliar relevante…',
    rows:  3,
    seccion: 'Contexto familiar y escolar' },
];

// Lista unificada de todos los ids extra (para el guardado)
var _IDS_EXTRA = _FICHA_CAMPOS_EXTRA.map(function(c) { return c.id; });

// Preview de la card: orden de preferencia para mostrar el resumen
var _CAMPOS_PREVIEW_ORDER = [
  'motivoConsulta', 'antecedentes', 'diagnostico',
  'observaciones', 'comunicacion', 'desarrolloEvolutivo',
];

// ── Mapa de estado → etiqueta + color ───────────────────────
var _FICHA_ESTADO_META = {
  borrador:   { label: 'Borrador',   bg: 'var(--bg3)',            color: 'var(--t3)'  },
  en_proceso: { label: 'En proceso', bg: '#FFF8E1',               color: '#856404'    },
  completada: { label: 'Completada', bg: 'rgba(76,175,135,.15)',  color: 'var(--ok)'  },
  archivada:  { label: 'Archivada',  bg: 'var(--bg3)',            color: 'var(--t2)'  },
};

// ════════════════════════════════════════════════════════════
// 1. PUNTO DE ENTRADA — llamado desde pTab('fichas', btn)
// ════════════════════════════════════════════════════════════
function rFichas(p, c) {
  if (!c || !p) return;

  // Migración lazy: garantiza p.fichasClinicas[]
  if (!p.fichasClinicas) { p.fichasClinicas = []; saveS(); }

  // Inyectar estilos una sola vez por sesión
  _fichaInjectStyles();

  // Si hay ficha activa, verificar que pertenece a ESTE paciente
  if (_fichaActivaId) {
    var ficha = fichaClinicaGet(p.id, _fichaActivaId);
    if (ficha) {
      _renderEditor(p, ficha, c);
      return;
    }
    _fichaActivaId = null;  // otro paciente o ficha eliminada
  }

  _renderLista(p, c);
}

// ════════════════════════════════════════════════════════════
// 2. VISTA LISTA
// ════════════════════════════════════════════════════════════
function _renderLista(p, c) {
  var fichas = fichaClinicaList(p.id);
  c.innerHTML = _htmlLista(p, fichas);
  _bindLista(p, fichas, c);
}

function _htmlLista(p, fichas) {
  var items = fichas.length
    ? fichas.map(_htmlCard).join('')
    : '<div class="fc-empty">' +
        '<div class="fc-empty-icon">🗒️</div>' +
        '<p class="fc-empty-title">Sin fichas clínicas aún</p>' +
        '<p class="fc-empty-sub">Creá la primera ficha para registrar el motivo de consulta,<br>antecedentes y diagnóstico del paciente.</p>' +
        '<button class="btn btn-p btn-sm" style="margin-top:16px" onclick="document.getElementById(\'fcBtnNueva\').click()">+ Crear primera ficha</button>' +
      '</div>';

  return '<div class="fc-wrap">' +
    '<div class="fc-list-header">' +
      '<div>' +
        '<div class="fc-list-title">🩺 Fichas clínicas</div>' +
        '<div class="fc-list-meta">' + fichas.length +
          (fichas.length === 1 ? ' ficha registrada' : ' fichas registradas') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn-s btn-sm" id="fcBtnTimeline">📅 Timeline</button>' +
        '<button class="btn btn-p btn-sm" id="fcBtnNueva">+ Nueva ficha</button>' +
      '</div>' +
    '</div>' +
    '<div class="fc-list" id="fcList">' + items + '</div>' +
  '</div>';
}

function _htmlCard(f) {
  var estado = fichaEstado(f);
  var pct    = fichaPct(f);
  var meta   = _FICHA_ESTADO_META[estado] || _FICHA_ESTADO_META.borrador;
  var fecha  = f.updatedAt
    ? new Date(f.updatedAt).toLocaleDateString('es-AR',
        { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  // Preview: primer campo con contenido, según orden de prioridad
  var preview = '';
  for (var i = 0; i < _CAMPOS_PREVIEW_ORDER.length; i++) {
    var v = (f[_CAMPOS_PREVIEW_ORDER[i]] || '').trim();
    if (v) { preview = v; break; }
  }
  preview = preview.length > 110
    ? preview.slice(0, 110) + '…'
    : preview || 'Sin contenido aún';

  // Indicadores de completitud: campos base + secciones extra
  var baseIds  = _FICHA_CAMPOS_BASE.map(function(c) { return c.id; });
  var llenosBase  = baseIds.filter(function(id) { return (f[id]||'').trim(); }).length;
  var llenosExtra = _IDS_EXTRA.filter(function(id) { return (f[id]||'').trim(); }).length;

  // Anillo SVG de progreso (solo campos base — semántica diagnóstica)
  var r = 16, circ = 2 * Math.PI * r;
  var dash = Math.round((pct / 100) * circ * 10) / 10;
  var ringColor = pct === 100 ? 'var(--ok)' : 'var(--accent)';
  var ring =
    '<svg class="fc-ring" viewBox="0 0 40 40" width="40" height="40">' +
      '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="var(--border)" stroke-width="3.5"/>' +
      '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="' + ringColor + '" stroke-width="3.5"' +
        ' stroke-dasharray="' + dash + ' ' + circ + '"' +
        ' stroke-dashoffset="0" stroke-linecap="round"' +
        ' transform="rotate(-90 20 20)"/>' +
      '<text x="20" y="24" text-anchor="middle" font-size="9" font-weight="700"' +
        ' fill="' + ringColor + '" font-family="inherit">' + pct + '%</text>' +
    '</svg>';

  // Chips de completitud
  var chipsHTML =
    '<span class="fc-chip fc-chip--base' + (llenosBase === baseIds.length ? ' fc-chip--done' : '') + '">' +
      llenosBase + '/' + baseIds.length + ' diagnóstico' +
    '</span>' +
    (llenosExtra > 0
      ? '<span class="fc-chip fc-chip--extra">' + llenosExtra + '/' + _IDS_EXTRA.length + ' contexto</span>'
      : '');

  var borderColor = { borrador:'var(--border)', en_proceso:'#F59E0B', completada:'var(--ok)', archivada:'var(--t3)' }[estado] || 'var(--border)';
  return '<div class="fc-card fc-card--anim" data-id="' + f.id + '" style="border-left:3px solid ' + borderColor + '">' +
    '<div class="fc-card-top">' +
      '<div class="fc-card-top-left">' +
        ring +
        '<div>' +
          '<div style="margin-bottom:4px">' +
            '<span class="fc-badge fc-badge--' + estado + '">' + meta.label + '</span>' +
          '</div>' +
          '<div class="fc-chips">' + chipsHTML + '</div>' +
        '</div>' +
      '</div>' +
      '<span class="fc-card-fecha">' + fecha + '</span>' +
    '</div>' +
    '<div class="fc-card-preview">' + esc(preview) + '</div>' +
    '<div class="fc-card-actions">' +
      '<button class="btn btn-s btn-sm fc-btn-abrir" data-id="' + f.id + '">✏️ Editar</button>' +
      '<button class="btn btn-sm fc-btn-del" data-id="' + f.id + '"' +
        ' style="background:transparent;color:var(--err);border:1.5px solid rgba(196,88,88,.2)"' +
        ' title="Eliminar ficha">🗑️</button>' +
    '</div>' +
  '</div>';
}

function _bindLista(p, fichas, c) {
  // Botón nueva ficha
  var btnNueva = document.getElementById('fcBtnNueva');
  if (btnNueva) {
    btnNueva.onclick = function() {
      var ficha = fichaClinicaCreate(p.id, null, null);
      if (!ficha) { toast('Error al crear ficha', 'error'); return; }
      _fichaActivaId = ficha.id;
      _renderEditor(p, ficha, c);
    };
  }

  // Botón timeline
  var btnTimeline = document.getElementById('fcBtnTimeline');
  if (btnTimeline) {
    btnTimeline.onclick = function() {
      _renderTimeline(p, c);
    };
  }

  // Abrir al hacer click en botón
  document.querySelectorAll('.fc-btn-abrir').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var fid = btn.getAttribute('data-id');
      var ficha = fichaClinicaGet(p.id, fid);
      if (!ficha) { toast('Ficha no encontrada', 'error'); return; }
      _fichaActivaId = fid;
      _renderEditor(p, ficha, c);
    };
  });

  // Abrir al hacer click en la card
  document.querySelectorAll('.fc-card').forEach(function(card) {
    card.onclick = function(e) {
      if (e.target.classList.contains('fc-btn-del') ||
          e.target.closest('.fc-btn-del')) return;
      var fid = card.getAttribute('data-id');
      var ficha = fichaClinicaGet(p.id, fid);
      if (!ficha) return;
      _fichaActivaId = fid;
      _renderEditor(p, ficha, c);
    };
  });

  // Eliminar
  document.querySelectorAll('.fc-btn-del').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var fid = btn.getAttribute('data-id');
      if (!confirm('¿Eliminar esta ficha? La acción no se puede deshacer.')) return;
      var ok = fichaClinicaDelete(p.id, fid);
      if (!ok) { toast('No se pudo eliminar', 'error'); return; }
      if (_fichaActivaId === fid) _fichaActivaId = null;
      toast('Ficha eliminada', 'success');
      _renderLista(p, c);
    };
  });
}

// ════════════════════════════════════════════════════════════
// 3. VISTA EDITOR
// ════════════════════════════════════════════════════════════
function _renderEditor(p, ficha, c) {
  c.innerHTML = _htmlEditor(ficha);
  _bindEditor(p, ficha, c);
}

function _htmlEditor(ficha) {
  var estado = fichaEstado(ficha);
  var pct    = fichaPct(ficha);
  var meta   = _FICHA_ESTADO_META[estado] || _FICHA_ESTADO_META.borrador;

  // ── Cabecera de sección base con mini-stats ───────────────
  var baseIds    = _FICHA_CAMPOS_BASE.map(function(c) { return c.id; });
  var llenosBase = baseIds.filter(function(id) { return (ficha[id]||'').trim(); }).length;
  var pctBase    = Math.round((llenosBase / baseIds.length) * 100);

  var htmlBase = _FICHA_CAMPOS_BASE.map(function(campo, i) {
    // Destacar motivoConsulta (idx 0) y diagnostico (idx 2) — campos clínicos clave
    var destacado = (campo.id === 'motivoConsulta' || campo.id === 'diagnostico');
    return _htmlCampo(campo, ficha[campo.id] || '', destacado);
  }).join('');

  // ── Secciones extra colapsables ──────────────────────────
  var secciones = [];
  var seccionMap = {};
  _FICHA_CAMPOS_EXTRA.forEach(function(campo) {
    var s = campo.seccion;
    if (!seccionMap[s]) { seccionMap[s] = []; secciones.push(s); }
    seccionMap[s].push(campo);
  });

  var htmlSecciones = secciones.map(function(nombreSeccion) {
    var campos       = seccionMap[nombreSeccion];
    var ids          = campos.map(function(c) { return c.id; });
    var llenos       = ids.filter(function(id) { return (ficha[id]||'').trim(); }).length;
    var pctSec       = Math.round((llenos / ids.length) * 100);
    var isOpen       = !!_fichaSecAbiertas[nombreSeccion];
    var secSlug      = nombreSeccion.replace(/\s+/g, '-').toLowerCase();

    // Mini barra de la sección
    var barColor     = llenos === ids.length ? 'var(--ok)' : 'var(--accent)';
    var minibar =
      '<div class="fc-sec-minibar">' +
        '<div class="fc-sec-minifill" style="width:' + pctSec + '%;background:' + barColor + '"></div>' +
      '</div>';

    // Chevron animado
    var chevron =
      '<svg class="fc-chevron' + (isOpen ? ' fc-chevron--open' : '') + '"' +
        ' viewBox="0 0 16 16" width="14" height="14" fill="none">' +
        '<path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8"' +
          ' stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';

    // Badge de completitud de la sección
    var secBadge = llenos > 0
      ? '<span class="fc-sec-count' + (llenos === ids.length ? ' fc-sec-count--done' : '') + '">' +
          llenos + '/' + ids.length +
        '</span>'
      : '<span class="fc-sec-count">0/' + ids.length + '</span>';

    var camposHTML = campos.map(function(campo) {
      return _htmlCampo(campo, ficha[campo.id] || '', false);
    }).join('');

    return '<div class="fc-seccion" data-sec="' + secSlug + '">' +
      '<button type="button" class="fc-sec-toggle" data-sec="' + secSlug + '"' +
        ' data-nombre="' + nombreSeccion + '" aria-expanded="' + isOpen + '">' +
        '<div class="fc-sec-toggle-left">' +
          chevron +
          '<span class="fc-seccion-titulo">' + nombreSeccion + '</span>' +
          secBadge +
        '</div>' +
        '<div class="fc-sec-toggle-right">' +
          minibar +
          '<span class="fc-sec-pct">' + pctSec + '%</span>' +
        '</div>' +
      '</button>' +
      '<div class="fc-sec-body' + (isOpen ? ' fc-sec-body--open' : '') + '"' +
        ' id="fcsec-' + secSlug + '">' +
        '<div class="fc-sec-body-inner">' + camposHTML + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  return '<div class="fc-wrap">' +

    // ── Cabecera del editor ───────────────────────────────
    '<div class="fc-editor-header">' +
      '<button class="btn btn-s btn-sm" id="fcBtnVolver">‹ Fichas</button>' +
      '<div class="fc-editor-meta">' +
        '<span class="fc-badge fc-badge--' + estado + '" id="fcEstadoBadge">' +
          meta.label +
        '</span>' +
        '<span class="fc-autosave" id="fcAutosave"></span>' +
      '</div>' +
    '</div>' +

    // ── Barra de progreso diagnóstico ─────────────────────
    '<div class="fc-prog-wrap">' +
      '<div class="fc-prog-info">' +
        '<span style="font-size:12px;color:var(--t3)">Diagnóstico completado</span>' +
        '<span id="fcProgPct" style="font-size:12px;font-weight:700;color:var(--accent)">' +
          pct + '%' +
        '</span>' +
      '</div>' +
      '<div class="fc-prog-bar fc-prog-bar--lg">' +
        '<div class="fc-prog-fill" id="fcProgFill" style="width:' + pct + '%"></div>' +
      '</div>' +
    '</div>' +

    // ── Resultado del screening (si existe evalData) ───────
    _fcHtmlEvalDataBloque(ficha) +

    // ── Bloque diagnóstico (siempre visible) ──────────────
    '<div class="fc-bloque-base">' +
      '<div class="fc-bloque-label">' +
        '<span>📋 Diagnóstico clínico</span>' +
        '<span class="fc-bloque-required">Campos que determinan el estado de la ficha</span>' +
      '</div>' +
      '<div class="fc-form">' + htmlBase + '</div>' +
    '</div>' +

    // ── Secciones de contexto (colapsables) ──────────────
    '<div class="fc-secciones">' + htmlSecciones + '</div>' +

  '</div>';
}

// Bloque informativo: muestra resumen del screening si la ficha tiene evalData
// Se inyecta en el editor de fichas_ui.js cuando fichaRegistryId es de un screening.
// No altera la persistencia — solo lectura visual.
function _fcHtmlEvalDataBloque(ficha) {
  if (!ficha || !ficha.evalData || !ficha.evalData.items) return '';

  // Solo mostrar si hay ítems respondidos
  var items = ficha.evalData.items;
  var respondidos = Object.keys(items).filter(function(k) {
    return items[k] && items[k].v !== undefined;
  }).length;
  if (respondidos === 0) return '';

  // Intentar calcular resultado si SCR_LEN_AREAS está disponible (eval_scr_len.js cargado)
  var resumenHTML = '';
  if (typeof _scrLenCalcGlobal === 'function' && typeof SCR_LEN_AREAS !== 'undefined') {
    var g = _scrLenCalcGlobal(ficha.evalData);
    if (g && g.globalInterp) {
      var interp = g.globalInterp;
      resumenHTML =
        '<div class="fc-eval-interp" style="background:' + interp.bg +
          ';border:1.5px solid ' + interp.color + '30;color:' + interp.color + '">' +
          '<span style="font-size:18px">' + interp.icon + '</span>' +
          '<div>' +
            '<div style="font-weight:700;font-size:13px">' + interp.label + '</div>' +
            '<div style="font-size:11px;opacity:.8;margin-top:1px">' +
              g.totalRespondidos + '/' + g.totalItems + ' ítems evaluados' +
            '</div>' +
          '</div>' +
        '</div>';
    }
  }

  var fecha = ficha.evalData.fechaEval
    ? new Date(ficha.evalData.fechaEval).toLocaleDateString('es-AR', {day:'2-digit',month:'short',year:'numeric'})
    : '—';
  var edad = ficha.evalData.edadEval || '—';

  return '<div class="fc-eval-bloque">' +
    '<div class="fc-eval-bloque-header">' +
      '<span class="fc-eval-bloque-titulo">🔬 Screening realizado</span>' +
      '<span class="fc-eval-bloque-meta">' + fecha + ' · ' + edad + '</span>' +
    '</div>' +
    resumenHTML +
    '<div class="fc-eval-bloque-hint">' +
      'El diagnóstico y observaciones pueden haber sido generados automáticamente desde el screening. ' +
      'Editá libremente los campos de abajo.' +
    '</div>' +
  '</div>';
}

function _htmlCampo(campo, valor, destacado) {
  return '<div class="fc-campo' + clsExtra + '">' +
    '<label class="fc-label" for="fcf_' + campo.id + '">' + campo.label +
      (destacado ? ' <span class="fc-campo-req">✱</span>' : '') +
    '</label>' +
    '<textarea' +
      ' class="fc-textarea' + (destacado ? ' fc-textarea--key' : '') + '"' +
      ' id="fcf_' + campo.id + '"' +
      ' data-campo="' + campo.id + '"' +
      ' placeholder="' + campo.hint + '"' +
      ' rows="' + campo.rows + '"' +
    '>' + esc(valor) + '</textarea>' +
  '</div>';
}

function _bindEditor(p, ficha, c) {
  // ── Botón volver ─────────────────────────────────────────
  var btnVolver = document.getElementById('fcBtnVolver');
  if (btnVolver) {
    btnVolver.onclick = function() {
      clearTimeout(_fichaDebounce);
      _fichaActivaId = null;
      _renderLista(p, c);
    };
  }

  // ── Toggle de secciones colapsables ──────────────────────
  document.querySelectorAll('.fc-sec-toggle').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var nombre  = btn.getAttribute('data-nombre');
      var secSlug = btn.getAttribute('data-sec');
      var body    = document.getElementById('fcsec-' + secSlug);
      var chevron = btn.querySelector('.fc-chevron');
      if (!body) return;

      var abierta = !!_fichaSecAbiertas[nombre];

      if (abierta) {
        // Cerrar: animar height → 0
        body.style.height = body.scrollHeight + 'px';
        requestAnimationFrame(function() {
          body.style.height = '0';
          body.classList.remove('fc-sec-body--open');
        });
        if (chevron) chevron.classList.remove('fc-chevron--open');
        btn.setAttribute('aria-expanded', 'false');
        delete _fichaSecAbiertas[nombre];
      } else {
        // Abrir: animar height 0 → scrollHeight
        body.classList.add('fc-sec-body--open');
        var h = body.scrollHeight;
        body.style.height = '0';
        requestAnimationFrame(function() {
          body.style.height = h + 'px';
          // Limpiar height fija al terminar la transición
          body.addEventListener('transitionend', function cleanup() {
            body.style.height = '';
            body.removeEventListener('transitionend', cleanup);
          });
        });
        if (chevron) chevron.classList.add('fc-chevron--open');
        btn.setAttribute('aria-expanded', 'true');
        _fichaSecAbiertas[nombre] = true;

        // M3: scroll suave para que el header de la sección quede visible
        setTimeout(function() {
          btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 280);
      }
    });
  });

  // ── Autoguardado en todos los textareas (base + extra) ───
  document.querySelectorAll('.fc-textarea').forEach(function(ta) {
    ta.addEventListener('input', function() {
      _fichaScheduleGuardado(p, ficha);
    });
  });

  // ── M1: Focus automático en el primer campo vacío ─────────
  setTimeout(function() {
    var primer = document.querySelector('.fc-textarea');
    // Buscar el primero con contenido vacío; si todos llenos, el primero
    var vacio = Array.prototype.find.call(
      document.querySelectorAll('.fc-textarea'),
      function(t) { return !t.value.trim(); }
    );
    if (vacio) vacio.focus();
    else if (primer) primer.focus();
  }, 80);
}

// ════════════════════════════════════════════════════════════
// 4. AUTOGUARDADO CON DEBOUNCE (600ms)
// ════════════════════════════════════════════════════════════
function _fichaScheduleGuardado(p, ficha) {
  clearTimeout(_fichaDebounce);

  // M5: mostrar "Guardando···" inmediatamente mientras corre el debounce
  var ind = document.getElementById('fcAutosave');
  if (ind) {
    ind.textContent = 'Guardando';
    ind.className   = 'fc-autosave fc-autosave--saving';
  }

  _fichaDebounce = setTimeout(function() {
    _fichaGuardarAhora(p, ficha);
  }, 600);
}

function _fichaGuardarAhora(p, ficha) {
  // ── 1. Leer todos los valores del DOM ─────────────────────
  var todosLosCampos = _FICHA_CAMPOS_BASE.concat(_FICHA_CAMPOS_EXTRA);
  var cambios = {};
  todosLosCampos.forEach(function(campo) {
    var el = document.getElementById('fcf_' + campo.id);
    if (el) cambios[campo.id] = el.value;
  });

  // ── 2. Persistir campos BASE vía fichaClinicaUpdate ───────
  // (filtra internamente por CAMPOS_EDITABLES: motivoConsulta,
  //  antecedentes, diagnostico, observaciones, archivada)
  fichaClinicaUpdate(p.id, ficha.id, cambios);

  // ── 3. Persistir campos EXTRA directamente + un saveS() ──
  // Todos los campos extra en un único write para eficiencia.
  var fp = S.patients.find(function(x) { return x.id === p.id; });
  if (fp && fp.fichasClinicas) {
    var f = fp.fichasClinicas.find(function(f) { return f.id === ficha.id; });
    if (f) {
      var huboCambioExtra = false;
      _IDS_EXTRA.forEach(function(id) {
        if (cambios[id] !== undefined) {
          f[id] = cambios[id];
          huboCambioExtra = true;
        }
      });
      if (huboCambioExtra) {
        f.updatedAt = new Date().toISOString();
        saveS();
      }
    }
  }

  // ── 4. Actualizar barra de progreso en el DOM ────────────
  _fichaActualizarProgreso(p, ficha.id);

  // ── 5. Indicador visual ───────────────────────────────────
  var ind = document.getElementById('fcAutosave');
  if (ind) {
    ind.textContent = '✔ Guardado';
    ind.className   = 'fc-autosave fc-autosave--ok';
    setTimeout(function() {
      if (ind) { ind.textContent = ''; ind.className = 'fc-autosave'; }
    }, 2200);
  }
}

function _fichaActualizarProgreso(p, fichaId) {
  // Recuperar ficha actualizada desde S
  var fp = S.patients.find(function(x) { return x.id === p.id; });
  if (!fp || !fp.fichasClinicas) return;
  var f = fp.fichasClinicas.find(function(f) { return f.id === fichaId; });
  if (!f) return;

  var pct    = fichaPct(f);   // calcula sobre campos base
  var estado = fichaEstado(f);
  var meta   = _FICHA_ESTADO_META[estado] || _FICHA_ESTADO_META.borrador;

  // ── Barra y badge de diagnóstico ──────────────────────────
  var fill  = document.getElementById('fcProgFill');
  var pctEl = document.getElementById('fcProgPct');
  var badge = document.getElementById('fcEstadoBadge');

  if (fill)  fill.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
  if (badge) {
    badge.textContent      = meta.label;
    badge.className        = 'fc-badge fc-badge--' + estado;
  }

  // ── Badges de secciones colapsables ──────────────────────
  var secciones = [];
  var seccionMap = {};
  _FICHA_CAMPOS_EXTRA.forEach(function(campo) {
    var s = campo.seccion;
    if (!seccionMap[s]) { seccionMap[s] = []; secciones.push(s); }
    seccionMap[s].push(campo);
  });

  secciones.forEach(function(nombreSeccion) {
    var campos   = seccionMap[nombreSeccion];
    var ids      = campos.map(function(c) { return c.id; });
    var llenos   = ids.filter(function(id) { return (f[id]||'').trim(); }).length;
    var pctSec   = Math.round((llenos / ids.length) * 100);
    var secSlug  = nombreSeccion.replace(/\s+/g, '-').toLowerCase();
    var toggle   = document.querySelector('.fc-sec-toggle[data-sec="' + secSlug + '"]');
    if (!toggle) return;

    // Actualizar badge de count
    var countEl = toggle.querySelector('.fc-sec-count');
    if (countEl) {
      countEl.textContent = llenos + '/' + ids.length;
      countEl.className   = 'fc-sec-count' + (llenos === ids.length ? ' fc-sec-count--done' : '');
    }

    // Actualizar minibar
    var minifill = toggle.querySelector('.fc-sec-minifill');
    if (minifill) {
      minifill.style.width      = pctSec + '%';
      minifill.style.background = llenos === ids.length ? 'var(--ok)' : 'var(--accent)';
    }

    // Actualizar pct text
    var pctSecEl = toggle.querySelector('.fc-sec-pct');
    if (pctSecEl) pctSecEl.textContent = pctSec + '%';
  });
}

// ════════════════════════════════════════════════════════════
// 6. TIMELINE CLÍNICO
// ════════════════════════════════════════════════════════════
//
// Derivado en memoria — NO persiste, NO modifica schema.
// Fuentes: p.admission, p.fichasClinicas, p.sessions,
//          p.evaluaciones.
// Ordenado por fecha descendente (más reciente primero).

// Tipos de evento: config de ícono, color y etiqueta
var _TL_TIPOS = {
  admision:       { icon: '🏥', color: 'var(--lav-600,#7B5CC4)', label: 'Admisión' },
  ficha_creada:   { icon: '📋', color: 'var(--accent)',          label: 'Nueva ficha clínica' },
  ficha_editada:  { icon: '✏️', color: 'var(--lav-400,#B8A3E2)', label: 'Ficha actualizada' },
  sesion:         { icon: '📝', color: 'var(--ok)',              label: 'Sesión' },
  sesion_inasist: { icon: '❌', color: 'var(--warn)',            label: 'Inasistencia' },
  evaluacion:     { icon: '🔬', color: '#2196F3',               label: 'Evaluación' },
};

// ── Construir array de eventos desde las fuentes ─────────────
function _tlBuildEventos(p) {
  var eventos = [];

  // 1. Admisión
  var adm = (p.admission || p.admissionDate || '').trim();
  if (adm) {
    eventos.push({
      tipo:  'admision',
      fecha: adm + 'T00:00:00.000Z',
      titulo: 'Inicio del proceso',
      detalle: 'Fecha de admisión',
    });
  }

  // 2. Fichas clínicas
  (p.fichasClinicas || []).forEach(function(f) {
    // Creación
    if (f.createdAt) {
      var resumen = (f.motivoConsulta || f.antecedentes || f.diagnostico || '').trim();
      eventos.push({
        tipo:   'ficha_creada',
        fecha:  f.createdAt,
        titulo: 'Ficha clínica creada',
        detalle: resumen ? resumen.slice(0, 80) + (resumen.length > 80 ? '…' : '') : '',
        fichaId: f.id,
      });
    }
    // Edición significativa (updatedAt ≠ createdAt, diferencia > 60 segundos)
    if (f.updatedAt && f.createdAt && f.updatedAt !== f.createdAt) {
      var diffMs = new Date(f.updatedAt).getTime() - new Date(f.createdAt).getTime();
      if (diffMs > 60000) {
        var estado = fichaEstado(f);
        var estadoLabel = { borrador: 'Borrador', en_proceso: 'En proceso', completada: 'Completada', archivada: 'Archivada' }[estado] || estado;
        eventos.push({
          tipo:   'ficha_editada',
          fecha:  f.updatedAt,
          titulo: 'Ficha actualizada',
          detalle: 'Estado: ' + estadoLabel + ' · ' + fichaPct(f) + '% completada',
          fichaId: f.id,
        });
      }
    }
  });

  // 3. Sesiones
  (p.sessions || []).forEach(function(s) {
    if (!s.date) return;
    var inasist = s.asistencia && s.asistencia !== 'asistio';
    var tipo = inasist ? 'sesion_inasist' : 'sesion';
    var detalle = '';
    if (inasist) {
      detalle = s.motivoInasistencia ? 'Motivo: ' + s.motivoInasistencia.slice(0, 60) : 'Sin asistencia registrada';
    } else {
      detalle = (s.goals || s.achievements || s.observations || '').slice(0, 80).trim();
      if (detalle.length === 80) detalle += '…';
    }
    eventos.push({
      tipo:   tipo,
      fecha:  s.date + 'T12:00:00.000Z',
      titulo: inasist ? 'Inasistencia' : 'Sesión clínica',
      detalle: detalle,
      sesionId: s.id,
    });
  });

  // 4. Evaluaciones estandarizadas
  (p.evaluaciones || []).forEach(function(e) {
    var fechaStr = e.fecha || (e.createdAt ? e.createdAt.slice(0, 10) : '');
    if (!fechaStr) return;
    var isoFecha = fechaStr.length === 10
      ? fechaStr + 'T12:00:00.000Z'
      : fechaStr;
    var detalle = e.test || '';
    if (e.observaciones && e.observaciones.trim()) {
      detalle += (detalle ? ' · ' : '') + e.observaciones.trim().slice(0, 60);
    }
    eventos.push({
      tipo:   'evaluacion',
      fecha:  isoFecha,
      titulo: 'Evaluación: ' + (e.test || 'Sin nombre'),
      detalle: detalle.slice(0, 90),
      evalId: e.id,
    });
  });

  // Ordenar: más reciente primero, luego por tipo como desempate
  eventos.sort(function(a, b) {
    var da = new Date(a.fecha).getTime() || 0;
    var db = new Date(b.fecha).getTime() || 0;
    if (db !== da) return db - da;
    return 0;
  });

  return eventos;
}

// ── Formatear fecha para mostrar ─────────────────────────────
function _tlFmtFecha(isoStr) {
  if (!isoStr) return '—';
  try {
    var d = new Date(isoStr);
    return d.toLocaleDateString('es-AR', {
      day:   '2-digit',
      month: 'long',
      year:  'numeric',
    });
  } catch(e) { return isoStr.slice(0, 10); }
}

// ── Render HTML de un evento ─────────────────────────────────
function _tlHtmlEvento(ev, isLast) {
  var meta = _TL_TIPOS[ev.tipo] || { icon: '⚡', color: 'var(--t3)', label: ev.tipo };
  var fecha = _tlFmtFecha(ev.fecha);

  return '<div class="tl-item' + (isLast ? ' tl-item--last' : '') + '">' +
    // Línea vertical + nodo
    '<div class="tl-track">' +
      '<div class="tl-node" style="background:' + meta.color + ';border-color:' + meta.color + '">' +
        '<span class="tl-node-icon">' + meta.icon + '</span>' +
      '</div>' +
      (!isLast ? '<div class="tl-line"></div>' : '') +
    '</div>' +
    // Contenido del evento
    '<div class="tl-content">' +
      '<div class="tl-fecha">' + fecha + '</div>' +
      '<div class="tl-titulo">' + esc(ev.titulo) + '</div>' +
      (ev.detalle
        ? '<div class="tl-detalle">' + esc(ev.detalle) + '</div>'
        : '') +
    '</div>' +
  '</div>';
}

// ── Render principal del timeline ────────────────────────────
function _renderTimeline(p, c) {
  var eventos = _tlBuildEventos(p);
  var totalEv = eventos.length;

  // Stats rápidas
  var nSesiones    = (p.sessions || []).filter(function(s) { return s.asistencia === 'asistio' || !s.asistencia; }).length;
  var nEvals       = (p.evaluaciones || []).length;
  var nFichas      = (p.fichasClinicas || []).length;
  var nInasist     = (p.sessions || []).filter(function(s) { return s.asistencia && s.asistencia !== 'asistio'; }).length;

  var statsHTML =
    '<div class="tl-stats">' +
      _tlStat('📝', nSesiones, 'sesiones') +
      _tlStat('❌', nInasist, 'inasist.') +
      _tlStat('🔬', nEvals, 'evalua.') +
      _tlStat('📋', nFichas, 'fichas') +
    '</div>';

  var itemsHTML = totalEv > 0
    ? eventos.map(function(ev, i) { return _tlHtmlEvento(ev, i === totalEv - 1); }).join('')
    : '<div class="tl-empty">' +
        '<div class="tl-empty-icon">📅</div>' +
        '<div class="tl-empty-msg">Sin eventos registrados</div>' +
        '<div class="tl-empty-sub">Las sesiones, evaluaciones y fichas aparecerán aquí ordenadas en el tiempo</div>' +
      '</div>';

  c.innerHTML =
    '<div class="fc-wrap">' +
      '<div class="fc-list-header">' +
        '<div>' +
          '<div class="fc-list-title">📅 Timeline clínico</div>' +
          '<div class="fc-list-meta">' + totalEv + ' evento' + (totalEv !== 1 ? 's' : '') + ' registrado' + (totalEv !== 1 ? 's' : '') + '</div>' +
        '</div>' +
        '<button class="btn btn-s btn-sm" id="fcBtnTlVolver">‹ Fichas</button>' +
      '</div>' +
      statsHTML +
      '<div class="tl-container">' + itemsHTML + '</div>' +
    '</div>';

  // Bind botón volver
  var btnVolver = document.getElementById('fcBtnTlVolver');
  if (btnVolver) {
    btnVolver.onclick = function() {
      _renderLista(p, c);
    };
  }
}

function _tlStat(icon, n, label) {
  return '<div class="tl-stat">' +
    '<div class="tl-stat-n">' + icon + ' ' + n + '</div>' +
    '<div class="tl-stat-label">' + label + '</div>' +
  '</div>';
}


function _fichaInjectStyles() {
  if (document.getElementById('fcStyles')) return;

  var s = document.createElement('style');
  s.id  = 'fcStyles';
  s.textContent = [

    // ── Contenedor ────────────────────────────────────────
    '.fc-wrap{padding:2px 0}',

    // ── Cabecera de lista ─────────────────────────────────
    '.fc-list-header{display:flex;align-items:center;justify-content:space-between;' +
      'gap:8px;margin-bottom:18px;flex-wrap:wrap}',
    '.fc-list-title{font-size:17px;font-weight:700;color:var(--text);font-family:var(--fd)}',
    '.fc-list-meta{font-size:12px;color:var(--t3);margin-top:2px}',

    // ── Lista ─────────────────────────────────────────────
    '.fc-list{display:flex;flex-direction:column;gap:10px}',

    // ── Card ──────────────────────────────────────────────
    '.fc-card{background:var(--bg2);border:1.5px solid var(--border);' +
      'border-radius:var(--r);padding:16px;cursor:pointer;transition:var(--tr)}',
    '.fc-card:hover{box-shadow:var(--sh);border-color:var(--lav-300);transform:translateY(-1px)}',
    '.fc-card--anim{animation:fcSlideIn .2s ease}',
    '.fc-card-top{display:flex;align-items:flex-start;justify-content:space-between;' +
      'gap:10px;margin-bottom:10px}',
    '.fc-card-top-left{display:flex;align-items:center;gap:10px}',
    '.fc-card-fecha{font-size:11px;color:var(--t3);white-space:nowrap;padding-top:2px}',
    '.fc-card-preview{font-size:13px;color:var(--t2);line-height:1.55;margin-bottom:12px}',
    '.fc-card-actions{display:flex;gap:6px;justify-content:flex-end}',

    // ── Anillo SVG de progreso ────────────────────────────
    '.fc-ring{flex-shrink:0;display:block}',

    // ── Chips de completitud ──────────────────────────────
    '.fc-chips{display:flex;gap:5px;flex-wrap:wrap}',
    '.fc-chip{display:inline-block;font-size:10px;font-weight:600;' +
      'padding:2px 7px;border-radius:20px;' +
      'background:var(--bg3);color:var(--t3);white-space:nowrap}',
    '.fc-chip--done{background:rgba(76,175,135,.12);color:var(--ok)}',
    '.fc-chip--extra{background:var(--lav-100,#F2EEF9);color:var(--lav-600,#7B5CC4)}',

    // ── Badges de estado (por nombre de estado) ───────────
    '.fc-badge{display:inline-flex;align-items:center;font-size:11px;font-weight:700;' +
      'padding:3px 10px;border-radius:20px;letter-spacing:.2px;white-space:nowrap;' +
      'transition:var(--tr)}',
    '.fc-badge--borrador{background:var(--bg3);color:var(--t3)}',
    '.fc-badge--en_proceso{background:#FFF8E1;color:#856404}',
    '.fc-badge--completada{background:rgba(76,175,135,.15);color:var(--ok)}',
    '.fc-badge--archivada{background:var(--bg3);color:var(--t2)}',

    // ── Estado vacío ──────────────────────────────────────
    '.fc-empty{text-align:center;padding:48px 20px}',
    '.fc-empty-icon{font-size:44px;margin-bottom:12px}',
    '.fc-empty-title{font-size:15px;font-weight:700;color:var(--t2);' +
      'margin:0 0 6px;font-family:var(--fd)}',
    '.fc-empty-sub{font-size:13px;color:var(--t3);line-height:1.6;margin:0}',

    // ── Cabecera del editor ───────────────────────────────
    '.fc-editor-header{display:flex;align-items:center;justify-content:space-between;' +
      'gap:8px;margin-bottom:16px;flex-wrap:wrap}',
    '.fc-editor-meta{display:flex;align-items:center;gap:10px}',

    // ── Barra de progreso diagnóstico ─────────────────────
    '.fc-prog-wrap{margin-bottom:22px}',
    '.fc-prog-info{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}',
    '.fc-prog-bar{height:3px;background:var(--border);border-radius:4px;overflow:hidden}',
    '.fc-prog-bar--lg{height:5px}',
    '.fc-prog-fill{height:100%;background:var(--accent);border-radius:4px;' +
      'transition:width .35s cubic-bezier(.4,0,.2,1)}',

    // ── Formulario dentro del bloque base ─────────────────
    '.fc-form{display:flex;flex-direction:column;gap:14px}',
    '.fc-campo{display:flex;flex-direction:column;gap:6px}',
    '.fc-label{font-size:13px;font-weight:700;color:var(--t2)}',
    '.fc-textarea{line-height:1.65;min-height:64px}',

    // ── Secciones colapsables ─────────────────────────────
    '.fc-secciones{display:flex;flex-direction:column;gap:8px}',
    '.fc-seccion{background:var(--bg2);border:1.5px solid var(--border);' +
      'border-radius:var(--r);overflow:hidden;transition:border-color var(--tr)}',
    '.fc-seccion:has(.fc-sec-body--open){border-color:var(--lav-300)}',

    // Toggle (botón cabecera de sección)
    '.fc-sec-toggle{width:100%;display:flex;align-items:center;' +
      'justify-content:space-between;gap:10px;' +
      'padding:13px 16px;background:transparent;' +
      'cursor:pointer;font-family:inherit;' +
      'transition:background var(--tr)}',
    '.fc-sec-toggle:hover{background:var(--bg3)}',
    '.fc-sec-toggle-left{display:flex;align-items:center;gap:8px;min-width:0}',
    '.fc-sec-toggle-right{display:flex;align-items:center;gap:8px;flex-shrink:0}',

    // Título de sección
    '.fc-seccion-titulo{font-size:12px;font-weight:700;color:var(--t2);' +
      'text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}',

    // Badge count de sección
    '.fc-sec-count{font-size:10px;font-weight:700;' +
      'padding:2px 7px;border-radius:20px;' +
      'background:var(--bg3);color:var(--t3);white-space:nowrap;' +
      'transition:background var(--tr),color var(--tr)}',
    '.fc-sec-count--done{background:rgba(76,175,135,.12);color:var(--ok)}',

    // % de sección
    '.fc-sec-pct{font-size:11px;font-weight:700;color:var(--t3);width:28px;text-align:right;' +
      'transition:color var(--tr)}',

    // Mini barra de sección
    '.fc-sec-minibar{width:52px;height:3px;background:var(--border);' +
      'border-radius:4px;overflow:hidden;flex-shrink:0}',
    '.fc-sec-minifill{height:100%;border-radius:4px;' +
      'transition:width .35s cubic-bezier(.4,0,.2,1),background var(--tr)}',

    // Chevron animado
    '.fc-chevron{color:var(--t3);flex-shrink:0;' +
      'transition:transform .22s cubic-bezier(.4,0,.2,1)}',
    '.fc-chevron--open{transform:rotate(180deg)}',

    // Cuerpo colapsable con transición de altura
    '.fc-sec-body{height:0;overflow:hidden;' +
      'transition:height .26s cubic-bezier(.4,0,.2,1)}',
    '.fc-sec-body--open{height:auto}',
    '.fc-sec-body-inner{padding:4px 18px 18px;display:flex;flex-direction:column;gap:14px}',

    // ── Bloque resultado de screening ─────────────────────
    '.fc-eval-bloque{background:var(--bg2);border:1.5px solid var(--border);' +
      'border-radius:var(--r);padding:14px 16px;margin-bottom:14px}',
    '.fc-eval-bloque-header{display:flex;align-items:center;' +
      'justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px}',
    '.fc-eval-bloque-titulo{font-size:12px;font-weight:700;color:var(--t2)}',
    '.fc-eval-bloque-meta{font-size:11px;color:var(--t3)}',
    '.fc-eval-interp{display:flex;align-items:center;gap:10px;' +
      'border-radius:var(--rs);padding:10px 12px;margin-bottom:10px}',
    '.fc-eval-bloque-hint{font-size:11px;color:var(--t3);font-style:italic;' +
      'line-height:1.5;margin-top:6px}',

    // ── Bloque diagnóstico ────────────────────────────────────
    '.fc-bloque-base{background:var(--bg2);border:1.5px solid var(--border);' +
      'border-radius:var(--r);padding:18px 18px 20px;margin-bottom:14px;' +
      'box-shadow:var(--sh)}',
    '.fc-bloque-label{display:flex;align-items:baseline;justify-content:space-between;' +
      'font-size:12px;font-weight:700;color:var(--t3);' +
      'text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px;flex-wrap:wrap;gap:6px}',
    '.fc-bloque-required{font-size:11px;font-weight:400;color:var(--t3);' +
      'text-transform:none;letter-spacing:0;font-style:italic}',

    // ── Campo destacado (motivoConsulta, diagnostico) ─────────
    '.fc-campo--destacado .fc-label{color:var(--text)}',
    '.fc-campo-req{color:var(--accent);font-size:11px;margin-left:3px;font-weight:700}',
    '.fc-textarea--key{border-color:var(--lav-300)}',
    '.fc-textarea--key:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--ag)}',

    // ── Indicador autosave ────────────────────────────────────
    '.fc-autosave{font-size:12px;font-weight:600;transition:opacity .2s}',
    '.fc-autosave--ok{color:var(--ok)}',
    '.fc-autosave--saving{color:var(--t3);letter-spacing:.5px}',
    '.fc-autosave--saving::after{content:"···";animation:fcDots 1s steps(3,end) infinite}',
    '@keyframes fcDots{0%{content:"."}33%{content:".."}66%{content:"..."}100%{content:"."}}',

    // ── Animaciones ───────────────────────────────────────
    '@keyframes fcSlideIn{' +
      'from{opacity:0;transform:translateY(6px)}' +
      'to{opacity:1;transform:translateY(0)}' +
    '}',

    // ── Responsive mobile ─────────────────────────────────
    '@media(max-width:480px){' +
      '.fc-list-header{flex-direction:column;align-items:flex-start}' +
      '.fc-card-top{flex-direction:column}' +
      '.fc-card-top-left{width:100%}' +
      '.fc-card-actions{width:100%;justify-content:flex-start}' +
      '.fc-editor-header{flex-direction:column;align-items:flex-start}' +
      '.fc-sec-toggle{padding:12px 14px}' +
      '.fc-sec-minibar{width:36px}' +
      '.fc-seccion-titulo{font-size:11px}' +
      '.tl-stats{grid-template-columns:repeat(2,1fr)}' +
      '.tl-content{padding-left:10px}' +
    '}',

    // ── Timeline ──────────────────────────────────────────────
    // Stats
    '.tl-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:22px}',
    '.tl-stat{background:var(--bg2);border:1.5px solid var(--border);border-radius:var(--rs);' +
      'padding:10px 12px;text-align:center}',
    '.tl-stat-n{font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px}',
    '.tl-stat-label{font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.3px}',

    // Contenedor
    '.tl-container{display:flex;flex-direction:column;padding-left:4px}',

    // Ítem
    '.tl-item{display:flex;gap:0;min-height:52px}',
    '.tl-item--last .tl-line{display:none}',

    // Track (línea + nodo)
    '.tl-track{display:flex;flex-direction:column;align-items:center;width:32px;flex-shrink:0}',
    '.tl-node{width:28px;height:28px;border-radius:50%;border:2.5px solid;' +
      'display:flex;align-items:center;justify-content:center;' +
      'background:var(--bg2);flex-shrink:0;z-index:1;' +
      'box-shadow:0 0 0 3px var(--bg)}',
    '.tl-node-icon{font-size:12px;line-height:1}',
    '.tl-line{flex:1;width:2px;background:var(--border);margin:2px 0}',

    // Contenido del evento
    '.tl-content{padding:0 0 18px 14px;min-width:0;flex:1}',
    '.tl-fecha{font-size:11px;color:var(--t3);margin-bottom:3px;letter-spacing:.2px}',
    '.tl-titulo{font-size:13px;font-weight:700;color:var(--text);margin-bottom:2px}',
    '.tl-detalle{font-size:12px;color:var(--t2);line-height:1.5}',

    // Estado vacío
    '.tl-empty{text-align:center;padding:40px 20px}',
    '.tl-empty-icon{font-size:40px;margin-bottom:10px}',
    '.tl-empty-msg{font-size:15px;font-weight:700;color:var(--t2);margin-bottom:6px;font-family:var(--fd)}',
    '.tl-empty-sub{font-size:13px;color:var(--t3);line-height:1.6;max-width:300px;margin:0 auto}',

  ].join('\n');

  document.head.appendChild(s);
}
