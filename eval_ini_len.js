// ============================================================
// eval_ini_len.js  —  Evaluación Inicial de Lenguaje Pediátrico
// p_len_ini_01 · Rango: 2–10 años
// ============================================================
//
// ORDEN DE CARGA:
//   utils.js → storage.js → <script principal> → scoring.js
//   → fichas.js → fichas_ui.js → eval_scr_len.js
//   → eval_scr_fon.js → eval_ini_len.js
//
// DEPENDENCIAS:
//   scoring.js  : EVA_SCORE_LABELS, EVA_SCORE_COLORS, EVA_INTERP
//   storage.js  : saveS()
//   utils.js    : esc(), toast()
//   principal   : S, curP
//   fichas.js   : fichaClinicaGet(), fichaClinicaUpdate()
//   fichas_ui.js: FC_EVAL_REGISTRY
//   eval_scr_len.js: estilos .scr-* (reutilizados)
//
// PUNTO DE ENTRADA: rEvalIniLen(p, c, fichaId)
// PREFIJO:          _iniLen_ / INI_LEN_
//
// PERSISTENCIA:
//   evalData.items[id].v  = valor (string | number | array)
//   evalData.items[id].obs = observación opcional
//   evalData.fechaEval, edadEval, updatedAt
//
// TIPOS DE CAMPO:
//   'texto'    → textarea libre
//   'fecha'    → input date
//   'escala'   → botones 0-3 (EVA_SCORE_LABELS)
//   'checkbox' → casillas múltiples, v = array de seleccionados
// ============================================================

// ════════════════════════════════════════════════════════════
// 1. DEFINICIÓN DE SECCIONES Y CAMPOS
// ════════════════════════════════════════════════════════════
var INI_LEN_SECCIONES = [

  // ── S1: Datos de la evaluación ───────────────────────────
  {
    id:     'datos',
    label:  '📋 Datos de la evaluación',
    color:  '#6D4DB8',
    bg:     '#F2EEF9',
    desc:   'Información administrativa de la sesión diagnóstica',
    scoring: false,
    campos: [
      { id: 'ini_fecha',     tipo: 'fecha',  label: 'Fecha de evaluación',           hint: '' },
      { id: 'ini_edad',      tipo: 'texto',  label: 'Edad cronológica',              hint: 'ej: 4 años 3 meses', rows: 1 },
      { id: 'ini_escuela',   tipo: 'texto',  label: 'Institución educativa y año',   hint: 'ej: Jardín de infantes N°5, Sala de 4', rows: 1 },
      { id: 'ini_derivante', tipo: 'texto',  label: 'Derivado por / Motivo de consulta', hint: 'Profesional o familiar que realizó la derivación y motivo principal', rows: 2 },
    ],
  },

  // ── S2: Antecedentes relevantes ──────────────────────────
  {
    id:     'antecedentes',
    label:  '🏥 Antecedentes relevantes',
    color:  '#0A8F85',
    bg:     '#ECFDF5',
    desc:   'Historia clínica y del desarrollo relevante para el área de lenguaje',
    scoring: false,
    campos: [
      { id: 'ant_embarazo',   tipo: 'texto', label: 'Embarazo y parto',                          hint: 'Semanas de gestación, complicaciones, tipo de parto, APGAR si se conoce', rows: 2 },
      { id: 'ant_desarrollo', tipo: 'texto', label: 'Hitos del desarrollo',                       hint: 'Primeras palabras, gateo, marcha, control de esfínteres, otras etapas relevantes', rows: 3 },
      { id: 'ant_familiar',   tipo: 'texto', label: 'Antecedentes familiares',                    hint: 'Familiares con trastornos del lenguaje, habla, audición o aprendizaje', rows: 2 },
      { id: 'ant_medicos',    tipo: 'texto', label: 'Antecedentes médicos',                       hint: 'Otitis, infecciones frecuentes, cirugías, medicación actual, pérdida auditiva', rows: 2 },
      { id: 'ant_previo',     tipo: 'texto', label: 'Intervención fonoaudiológica previa',        hint: 'Fecha de inicio, objetivos, progreso referido por la familia o informes anteriores', rows: 2 },
    ],
  },

  // ── S3: Comprensión del lenguaje ─────────────────────────
  {
    id:     'comprension',
    label:  '👂 Comprensión del lenguaje',
    color:  '#1D4ED8',
    bg:     '#EFF6FF',
    desc:   'Valoración de la capacidad comprensiva en distintos niveles de complejidad',
    scoring: true,
    campos: [
      { id: 'com_vocab',      tipo: 'escala', label: 'Comprensión de vocabulario',                hint: 'Reconocimiento y comprensión de palabras por categorías semánticas' },
      { id: 'com_instruc',    tipo: 'escala', label: 'Seguimiento de instrucciones',              hint: 'Instrucciones simples (1 paso), dobles (2 pasos) y complejas con condición' },
      { id: 'com_conceptos',  tipo: 'escala', label: 'Comprensión de conceptos',                 hint: 'Conceptos espaciales, temporales, cuantitativos y relacionales' },
      { id: 'com_inferencia', tipo: 'escala', label: 'Comprensión inferencial',                   hint: 'Comprensión de cuentos, inferencias y relaciones causales' },
      { id: 'com_obs',        tipo: 'texto',  label: '📝 Observaciones de comprensión',           hint: 'Estrategias compensatorias, errores frecuentes, contextos de mayor dificultad', rows: 3 },
    ],
  },

  // ── S4: Expresión del lenguaje ───────────────────────────
  {
    id:     'expresion',
    label:  '🗣️ Expresión del lenguaje',
    color:  '#B45309',
    bg:     '#FFFBEB',
    desc:   'Valoración de las habilidades expresivas en vocabulario, morfosintaxis y narrativa',
    scoring: true,
    campos: [
      { id: 'exp_vocab',      tipo: 'escala', label: 'Vocabulario expresivo',                     hint: 'Amplitud, precisión y uso contextual del vocabulario' },
      { id: 'exp_morfosint',  tipo: 'escala', label: 'Morfosintaxis',                             hint: 'Estructura oracional, concordancia, uso de nexos y flexión verbal' },
      { id: 'exp_narrativa',  tipo: 'escala', label: 'Habilidades narrativas',                    hint: 'Coherencia, cohesión, secuencia lógica en relatos espontáneos y recontados' },
      { id: 'exp_nominacion', tipo: 'escala', label: 'Denominación y evocación léxica',           hint: 'Acceso al léxico, estrategias de búsqueda, tiempo de respuesta' },
      { id: 'exp_obs',        tipo: 'texto',  label: '📝 Muestra de lenguaje / Observaciones',    hint: 'Registros de LME estimada, tipo de oraciones, errores morfosintácticos frecuentes', rows: 4 },
    ],
  },

  // ── S5: Aspectos pragmáticos ─────────────────────────────
  {
    id:     'pragmatica',
    label:  '🤝 Aspectos pragmáticos',
    color:  '#7C3AED',
    bg:     '#F5F3FF',
    desc:   'Habilidades de uso funcional del lenguaje en contexto comunicativo',
    scoring: true,
    campos: [
      {
        id: 'prag_obs_conductas', tipo: 'checkbox',
        label: 'Conductas comunicativas observadas',
        hint:  'Marcá todas las que se observaron durante la evaluación',
        opciones: [
          'Iniciación espontánea de interacción',
          'Mantenimiento del turno conversacional',
          'Mantenimiento del tema',
          'Intención comunicativa variada (pide, declara, comenta, pregunta)',
          'Adecuación al interlocutor',
          'Uso funcional de comunicación no verbal (gestos, expresión facial)',
          'Reparación de malentendidos',
          'Juego simbólico y juego con roles',
        ],
      },
      { id: 'prag_global', tipo: 'escala', label: 'Impresión global pragmática',               hint: 'Valoración global de la competencia comunicativa en contexto natural' },
      { id: 'prag_obs',    tipo: 'texto',  label: '📝 Observaciones pragmáticas',               hint: 'Contextos de mayor dificultad, estrategias comunicativas predominantes', rows: 3 },
    ],
  },

  // ── S6: Observaciones clínicas generales ─────────────────
  {
    id:     'observaciones',
    label:  '🔎 Observaciones clínicas',
    color:  '#065F46',
    bg:     '#ECFDF5',
    desc:   'Conductas y características del niño durante la evaluación',
    scoring: false,
    campos: [
      {
        id: 'obs_conducta', tipo: 'checkbox',
        label: 'Conducta durante la evaluación',
        hint:  'Marcá todas las que aplican',
        opciones: [
          'Atento y concentrado',
          'Colaborador',
          'Motivado por la tarea',
          'Distraído',
          'Ansioso o inhibido',
          'Oposicionista o poco colaborador',
          'Fatigable',
          'Requirió apoyos frecuentes',
        ],
      },
      { id: 'obs_juego',   tipo: 'texto', label: 'Tipo de juego observado',       hint: 'Funcional, simbólico, con reglas; nivel de complejidad y uso del lenguaje en el juego', rows: 2 },
      { id: 'obs_general', tipo: 'texto', label: 'Observaciones generales',        hint: 'Aspectos del contexto, características del vínculo, otras observaciones relevantes', rows: 3 },
    ],
  },

  // ── S7: Conclusión profesional ───────────────────────────
  {
    id:     'conclusion',
    label:  '📄 Conclusión profesional',
    color:  '#374151',
    bg:     '#F9FAFB',
    desc:   'Síntesis diagnóstica y orientación clínica',
    scoring: false,
    campos: [
      { id: 'con_impresion', tipo: 'texto', label: 'Impresión diagnóstica fonoaudiológica', hint: 'Síntesis clínica del perfil lingüístico: áreas afectadas, nivel de severidad, características predominantes', rows: 4 },
      { id: 'con_hipotesis', tipo: 'texto', label: 'Hipótesis diagnóstica',                 hint: 'Categoría diagnóstica presuntiva (ej. TEL, Retraso del lenguaje, TEA con afectación del lenguaje)', rows: 2 },
      { id: 'con_pasos',     tipo: 'texto', label: 'Próximos pasos',                        hint: 'Inicio de tratamiento, frecuencia propuesta, interconsultas, reevaluación, derivaciones', rows: 3 },
      { id: 'con_firma',     tipo: 'texto', label: 'Profesional evaluador',                 hint: 'Nombre, título y matrícula', rows: 1 },
    ],
  },
];

// Índice de todos los campos por id
var _INI_LEN_CAMPOS_IDX = {};
INI_LEN_SECCIONES.forEach(function(sec) {
  sec.campos.forEach(function(campo) {
    _INI_LEN_CAMPOS_IDX[campo.id] = { seccion: sec, campo: campo };
  });
});

// IDs de campos de escala (para scoring)
var _INI_LEN_IDS_ESCALA = [];
INI_LEN_SECCIONES.forEach(function(sec) {
  sec.campos.forEach(function(c) {
    if (c.tipo === 'escala') _INI_LEN_IDS_ESCALA.push(c.id);
  });
});

// Total de campos para completitud
var _INI_LEN_TOTAL_CAMPOS = Object.keys(_INI_LEN_CAMPOS_IDX).length;

var _iniLenDebounce = null;

// ════════════════════════════════════════════════════════════
// 2. SCORING Y COMPLETITUD
// ════════════════════════════════════════════════════════════

// Scoring: solo ítems de tipo 'escala' (0=Normal … 3=Severo)
// % alteración = promedio de valores / 3 → EVA_INTERP
function _iniLenCalcScore(evalData) {
  var items   = (evalData && evalData.items) || {};
  var suma    = 0;
  var n       = 0;

  _INI_LEN_IDS_ESCALA.forEach(function(id) {
    var v = items[id] && items[id].v;
    if (v !== undefined && v !== null && v !== '') {
      suma += Number(v);
      n++;
    }
  });

  if (n === 0) return { n: 0, total: _INI_LEN_IDS_ESCALA.length, promedio: null, interp: null };

  var promedio   = suma / n;
  var pctAlter   = Math.round((promedio / 3) * 100);
  var interp     = EVA_INTERP.find(function(t) { return pctAlter < t.maxPct; })
                || EVA_INTERP[EVA_INTERP.length - 1];

  return { n: n, total: _INI_LEN_IDS_ESCALA.length, promedio: promedio, pctAlter: pctAlter, interp: interp };
}

// Completitud: % de campos con algún valor
function _iniLenCompletitud(evalData) {
  var items    = (evalData && evalData.items) || {};
  var llenos   = 0;

  Object.keys(_INI_LEN_CAMPOS_IDX).forEach(function(id) {
    var entry = items[id];
    if (!entry) return;
    var v = entry.v;
    if (v === undefined || v === null) return;
    if (typeof v === 'string'  && v.trim())       llenos++;
    if (typeof v === 'number'  && !isNaN(v))       llenos++;
    if (Array.isArray(v)       && v.length > 0)    llenos++;
  });

  return { llenos: llenos, total: _INI_LEN_TOTAL_CAMPOS, pct: Math.round((llenos / _INI_LEN_TOTAL_CAMPOS) * 100) };
}

// ════════════════════════════════════════════════════════════
// 3. PERSISTENCIA
// ════════════════════════════════════════════════════════════
function _iniLenSave(p, fichaId, evalData) {
  var fp = S.patients.find(function(x) { return x.id === p.id; });
  if (!fp || !fp.fichasClinicas) return;
  var f = fp.fichasClinicas.find(function(f) { return f.id === fichaId; });
  if (!f) return;
  evalData.updatedAt = new Date().toISOString();
  f.evalData  = evalData;
  f.updatedAt = evalData.updatedAt;
  saveS();
}

function _iniLenScheduleSave(p, fichaId, evalData) {
  clearTimeout(_iniLenDebounce);
  var ind = document.getElementById('iniLenAutosave');
  if (ind) { ind.textContent = 'Guardando'; ind.className = 'scr-autosave scr-autosave--saving'; }

  _iniLenDebounce = setTimeout(function() {
    _iniLenSave(p, fichaId, evalData);
    _iniLenRefreshProgreso(evalData);
    var ind2 = document.getElementById('iniLenAutosave');
    if (ind2) {
      ind2.textContent = '✔ Guardado';
      ind2.className   = 'scr-autosave scr-autosave--ok';
      setTimeout(function() {
        if (ind2) { ind2.textContent = ''; ind2.className = 'scr-autosave'; }
      }, 2200);
    }
  }, 600);
}

// ════════════════════════════════════════════════════════════
// 4. RENDER HTML — CAMPOS
// ════════════════════════════════════════════════════════════

// Dispatcher: renderiza el campo correcto según tipo
function _iniLenHtmlCampo(campo, evalData) {
  var entry = (evalData.items && evalData.items[campo.id]) || {};
  var v     = entry.v;

  switch (campo.tipo) {

    case 'fecha':
      return '<div class="ini-campo">' +
        '<label class="ini-label">' + campo.label + '</label>' +
        '<input type="date" class="ini-input" id="inif_' + campo.id + '"' +
          ' data-campo="' + campo.id + '" data-tipo="fecha"' +
          ' value="' + esc(v || '') + '">' +
      '</div>';

    case 'texto':
      return '<div class="ini-campo">' +
        '<label class="ini-label">' + campo.label + '</label>' +
        '<textarea class="ini-ta" id="inif_' + campo.id + '"' +
          ' data-campo="' + campo.id + '" data-tipo="texto"' +
          ' placeholder="' + esc(campo.hint || '') + '"' +
          ' rows="' + (campo.rows || 2) + '">' + esc(v || '') + '</textarea>' +
      '</div>';

    case 'escala':
      var scoreVal = (v !== undefined && v !== null && v !== '') ? Number(v) : null;
      var btns = [0, 1, 2, 3].map(function(i) {
        var label  = EVA_SCORE_LABELS[i];
        var color  = EVA_SCORE_COLORS[i];
        var active = scoreVal === i;
        return '<button type="button"' +
          ' class="ini-escala-btn' + (active ? ' ini-escala-btn--active' : '') + '"' +
          ' data-campo="' + campo.id + '" data-val="' + i + '" data-tipo="escala"' +
          (active ? ' style="background:' + color + ';color:#fff;border-color:' + color + '"' : '') +
          '>' + i + ' — ' + label + '</button>';
      }).join('');
      return '<div class="ini-campo">' +
        '<label class="ini-label">' + campo.label + '</label>' +
        '<div class="ini-escala-desc">' + esc(campo.hint || '') + '</div>' +
        '<div class="ini-escala-btns" id="inif_' + campo.id + '">' + btns + '</div>' +
      '</div>';

    case 'checkbox':
      var selArr = Array.isArray(v) ? v : [];
      var checks = (campo.opciones || []).map(function(opt) {
        var checked = selArr.indexOf(opt) !== -1;
        return '<label class="ini-check-label">' +
          '<input type="checkbox" class="ini-check-input"' +
            ' data-campo="' + campo.id + '" data-opcion="' + esc(opt) + '" data-tipo="checkbox"' +
            (checked ? ' checked' : '') + '>' +
          '<span>' + esc(opt) + '</span>' +
        '</label>';
      }).join('');
      return '<div class="ini-campo">' +
        '<label class="ini-label">' + campo.label + '</label>' +
        '<div class="ini-check-hint">' + esc(campo.hint || '') + '</div>' +
        '<div class="ini-checks">' + checks + '</div>' +
      '</div>';

    default:
      return '';
  }
}

// ════════════════════════════════════════════════════════════
// 5. RENDER HTML — SECCIONES
// ════════════════════════════════════════════════════════════
var _iniLenSecAbiertas = {}; // estado colapsable en sesión

function _iniLenHtmlSeccion(sec, evalData, isFirst) {
  var campos    = sec.campos;
  var items     = (evalData && evalData.items) || {};
  var secSlug   = sec.id;
  var isAbierta = isFirst || !!_iniLenSecAbiertas[secSlug];

  // Completitud de la sección
  var totalSec  = campos.length;
  var llenosSec = campos.filter(function(c) {
    var entry = items[c.id];
    if (!entry) return false;
    var v = entry.v;
    if (typeof v === 'string')  return v.trim().length > 0;
    if (typeof v === 'number')  return !isNaN(v);
    if (Array.isArray(v))       return v.length > 0;
    return false;
  }).length;
  var pctSec = Math.round((llenosSec / totalSec) * 100);

  // Score de la sección (solo si tiene escalas)
  var scoreInfo = '';
  if (sec.scoring) {
    var escalasSec = campos.filter(function(c) { return c.tipo === 'escala'; });
    var respondidos = escalasSec.filter(function(c) {
      var v = items[c.id] && items[c.id].v;
      return v !== undefined && v !== null && v !== '';
    });
    if (respondidos.length > 0) {
      var suma = respondidos.reduce(function(acc, c) { return acc + Number(items[c.id].v); }, 0);
      var prom = suma / respondidos.length;
      var pctA = Math.round((prom / 3) * 100);
      var terp = EVA_INTERP.find(function(t) { return pctA < t.maxPct; }) || EVA_INTERP[EVA_INTERP.length-1];
      scoreInfo = '<span class="ini-sec-interp" style="background:' + terp.bg + ';color:' + terp.color + '">' +
        terp.icon + ' ' + terp.label + '</span>';
    }
  }

  // Chevron
  var chevron = '<svg class="scr-chevron' + (isAbierta ? ' scr-chevron--open' : '') +
    '" viewBox="0 0 16 16" width="14" height="14" fill="none">' +
    '<path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8"' +
    ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Minibar
  var barColor = pctSec === 100 ? 'var(--ok)' : sec.color;
  var minibar  = '<div class="scr-sec-minibar"><div class="scr-sec-minifill"' +
    ' style="width:' + pctSec + '%;background:' + barColor + '"></div></div>';

  // Contenido de campos
  var camposHTML = campos.map(function(c) { return _iniLenHtmlCampo(c, evalData); }).join('');

  return '<div class="scr-seccion" data-sec="' + secSlug + '">' +
    '<button type="button" class="scr-sec-toggle ini-sec-toggle"' +
      ' data-sec="' + secSlug + '" aria-expanded="' + isAbierta + '">' +
      '<div class="scr-sec-toggle-left">' +
        chevron +
        '<span class="scr-seccion-titulo" style="color:' + sec.color + '">' + sec.label + '</span>' +
        '<span class="scr-sec-count' + (llenosSec === totalSec ? ' scr-sec-count--done' : '') + '">' +
          llenosSec + '/' + totalSec + '</span>' +
        scoreInfo +
      '</div>' +
      '<div class="scr-sec-toggle-right">' +
        minibar +
        '<span class="scr-sec-pct">' + pctSec + '%</span>' +
      '</div>' +
    '</button>' +
    '<div class="scr-sec-body' + (isAbierta ? ' scr-sec-body--open' : '') + '"' +
      ' id="inisec-' + secSlug + '">' +
      '<div class="ini-sec-body-inner">' + camposHTML + '</div>' +
    '</div>' +
  '</div>';
}

// ════════════════════════════════════════════════════════════
// 6. RENDER HTML — RESUMEN / HEADER
// ════════════════════════════════════════════════════════════
function _iniLenHtmlResumen(evalData) {
  var score  = _iniLenCalcScore(evalData);
  var comp   = _iniLenCompletitud(evalData);
  var items  = (evalData && evalData.items) || {};

  if (comp.llenos === 0) return '<div id="iniLenResumen"></div>';

  var interpHTML = '';
  if (score.interp) {
    var terp = score.interp;
    interpHTML =
      '<div class="scr-resumen-interp" style="background:' + terp.bg +
        ';color:' + terp.color + ';border:1.5px solid ' + terp.color + '20">' +
        '<div class="scr-resumen-interp-icon">' + terp.icon + '</div>' +
        '<div style="flex:1">' +
          '<div class="scr-resumen-interp-label">' + terp.label + '</div>' +
          '<div class="scr-resumen-interp-sub">' +
            score.n + '/' + score.total + ' áreas cuantitativas evaluadas' +
          '</div>' +
        '</div>' +
        '<button id="iniLenBtnVolcar" class="btn btn-p btn-sm scr-btn-volcar">📋 Volcar a ficha</button>' +
      '</div>';
  }

  // Barra de completitud global
  var pctColor = comp.pct === 100 ? 'var(--ok)' : 'var(--accent)';
  var compHTML =
    '<div class="ini-comp-wrap">' +
      '<div class="ini-comp-info">' +
        '<span style="font-size:12px;color:var(--t3)">Evaluación completada</span>' +
        '<span style="font-size:12px;font-weight:700;color:' + pctColor + '">' + comp.pct + '%</span>' +
      '</div>' +
      '<div class="scr-prog-bar scr-prog-bar--lg">' +
        '<div class="scr-prog-fill" id="iniLenCompFill"' +
          ' style="width:' + comp.pct + '%;background:' + pctColor + '"></div>' +
      '</div>' +
    '</div>';

  return '<div class="scr-resumen" id="iniLenResumen">' +
    '<div class="scr-resumen-title">📊 Estado de la evaluación</div>' +
    compHTML +
    interpHTML +
  '</div>';
}

// ════════════════════════════════════════════════════════════
// 7. PUNTO DE ENTRADA PÚBLICO
// ════════════════════════════════════════════════════════════
function rEvalIniLen(p, c, fichaId) {
  if (!p || !c) return;

  var ficha = fichaClinicaGet(p.id, fichaId);
  if (!ficha) { toast('Ficha no encontrada', 'error'); return; }

  var evalData = ficha.evalData || { items: {}, fechaEval: '', edadEval: '', updatedAt: '' };

  _iniLenInjectStyles();

  // Fechas para el header
  var fechaCrea = ficha.createdAt
    ? new Date(ficha.createdAt).toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' })
    : '—';
  var fechaEdit = ficha.updatedAt
    ? new Date(ficha.updatedAt).toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : '—';

  var seccionesHTML = INI_LEN_SECCIONES.map(function(sec, i) {
    return _iniLenHtmlSeccion(sec, evalData, i === 0);
  }).join('');

  c.innerHTML =
    '<div class="scr-wrap">' +

      // Cabecera
      '<div class="scr-header">' +
        '<button class="btn btn-s btn-sm" id="iniLenBtnVolver">‹ Volver</button>' +
        '<div class="scr-header-right">' +
          '<div>' +
            '<div class="scr-titulo">Evaluación Inicial de Lenguaje</div>' +
            '<div class="scr-subtitulo">2–10 años · Diagnóstico fonoaudiológico completo</div>' +
            '<div class="ini-fechas">' +
              '<span>Creada: ' + fechaCrea + '</span>' +
              '<span>Última edición: <span id="iniLenFechaEdit">' + fechaEdit + '</span></span>' +
            '</div>' +
          '</div>' +
          '<span class="scr-autosave" id="iniLenAutosave"></span>' +
        '</div>' +
      '</div>' +

      // Resumen (se actualiza en vivo)
      _iniLenHtmlResumen(evalData) +

      // Secciones colapsables
      '<div class="ini-secciones">' + seccionesHTML + '</div>' +

    '</div>';

  window._iniLenVolcarCtx = { p: p, fichaId: fichaId, evalData: evalData };
  _iniLenBind(p, fichaId, evalData, c);
}

// ════════════════════════════════════════════════════════════
// 8. BIND
// ════════════════════════════════════════════════════════════
function _iniLenBind(p, fichaId, evalData, c) {
  // Volver
  var btnVolver = document.getElementById('iniLenBtnVolver');
  if (btnVolver) {
    btnVolver.onclick = function() {
      clearTimeout(_iniLenDebounce);
      c.innerHTML = '';
      var slot = document.getElementById('evalRendererSlot');
      if (slot) {
        slot.parentNode.removeChild(slot);
        var fichaLevel = document.getElementById('evalFichaLevel');
        if (fichaLevel) {
          Array.prototype.forEach.call(fichaLevel.children, function(ch) {
            ch.style.display = '';
          });
        }
      }
      if (typeof EVAL_ROUTER !== 'undefined' && EVAL_ROUTER.goToFichas) {
        EVAL_ROUTER.goToFichas();
        var fichaLevel = document.getElementById('evalFichaLevel');
        if (fichaLevel) fichaLevel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
  }

  // Volcar a ficha
  var btnVolcar = document.getElementById('iniLenBtnVolcar');
  if (btnVolcar) {
    btnVolcar.onclick = function() { _iniLenVolcarAFicha(p, fichaId, evalData); };
  }

  // Toggles de secciones colapsables
  document.querySelectorAll('.ini-sec-toggle').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var sec     = btn.getAttribute('data-sec');
      var body    = document.getElementById('inisec-' + sec);
      var chevron = btn.querySelector('.scr-chevron');
      if (!body) return;

      var abierta = !!_iniLenSecAbiertas[sec];
      if (abierta) {
        body.style.height = body.scrollHeight + 'px';
        requestAnimationFrame(function() {
          body.style.height = '0';
          body.classList.remove('scr-sec-body--open');
        });
        if (chevron) chevron.classList.remove('scr-chevron--open');
        btn.setAttribute('aria-expanded', 'false');
        delete _iniLenSecAbiertas[sec];
      } else {
        body.classList.add('scr-sec-body--open');
        var h = body.scrollHeight;
        body.style.height = '0';
        requestAnimationFrame(function() {
          body.style.height = h + 'px';
          body.addEventListener('transitionend', function cleanup() {
            body.style.height = '';
            body.removeEventListener('transitionend', cleanup);
          });
        });
        if (chevron) chevron.classList.add('scr-chevron--open');
        btn.setAttribute('aria-expanded', 'true');
        _iniLenSecAbiertas[sec] = true;
        setTimeout(function() { btn.scrollIntoView({ behavior:'smooth', block:'nearest' }); }, 280);
      }
    });
  });

  // Campos de texto y fecha
  c.querySelectorAll('.ini-ta, .ini-input').forEach(function(el) {
    el.addEventListener('input', function() {
      var id   = el.getAttribute('data-campo');
      var tipo = el.getAttribute('data-tipo');
      if (!evalData.items) evalData.items = {};
      if (!evalData.items[id]) evalData.items[id] = {};
      evalData.items[id].v = el.value;
      _iniLenScheduleSave(p, fichaId, evalData);
    });
    // Auto-resize para textareas
    if (el.tagName === 'TEXTAREA') {
      el.addEventListener('input', function() {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      });
    }
  });

  // Botones de escala
  c.querySelectorAll('.ini-escala-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id  = btn.getAttribute('data-campo');
      var val = parseInt(btn.getAttribute('data-val'), 10);
      if (!evalData.items) evalData.items = {};
      if (!evalData.items[id]) evalData.items[id] = {};

      // Toggle: click en el mismo valor lo deselecciona
      var current = evalData.items[id].v;
      if (current === val) {
        evalData.items[id].v = undefined;
      } else {
        evalData.items[id].v = val;
      }

      _iniLenRefreshEscala(id, evalData);
      _iniLenRefreshResumen(evalData);
      _iniLenScheduleSave(p, fichaId, evalData);
    });
  });

  // Checkboxes
  c.querySelectorAll('.ini-check-input').forEach(function(chk) {
    chk.addEventListener('change', function() {
      var id     = chk.getAttribute('data-campo');
      var opcion = chk.getAttribute('data-opcion');
      if (!evalData.items) evalData.items = {};
      if (!evalData.items[id]) evalData.items[id] = {};
      var arr = Array.isArray(evalData.items[id].v) ? evalData.items[id].v.slice() : [];
      if (chk.checked) {
        if (arr.indexOf(opcion) === -1) arr.push(opcion);
      } else {
        arr = arr.filter(function(x) { return x !== opcion; });
      }
      evalData.items[id].v = arr;
      _iniLenScheduleSave(p, fichaId, evalData);
    });
  });
}

// ════════════════════════════════════════════════════════════
// 9. ACTUALIZACIÓN LIVE DEL DOM
// ════════════════════════════════════════════════════════════
function _iniLenRefreshEscala(campoId, evalData) {
  var container = document.getElementById('inif_' + campoId);
  if (!container) return;
  var val = evalData.items[campoId] && evalData.items[campoId].v;
  container.querySelectorAll('.ini-escala-btn').forEach(function(btn) {
    var bVal   = parseInt(btn.getAttribute('data-val'), 10);
    var active = val === bVal;
    var color  = EVA_SCORE_COLORS[bVal];
    btn.classList.toggle('ini-escala-btn--active', active);
    btn.style.background  = active ? color : '';
    btn.style.color       = active ? '#fff' : '';
    btn.style.borderColor = active ? color : '';
  });
}

function _iniLenRefreshResumen(evalData) {
  var el = document.getElementById('iniLenResumen');
  var newHTML = _iniLenHtmlResumen(evalData);
  if (el) {
    el.outerHTML = newHTML;
  } else {
    var secs = document.querySelector('.ini-secciones');
    if (secs) secs.insertAdjacentHTML('beforebegin', newHTML);
  }
  // Re-bindear botón volcar
  var btn = document.getElementById('iniLenBtnVolcar');
  if (btn && window._iniLenVolcarCtx) {
    btn.onclick = function() {
      _iniLenVolcarAFicha(
        window._iniLenVolcarCtx.p,
        window._iniLenVolcarCtx.fichaId,
        window._iniLenVolcarCtx.evalData
      );
    };
  }
}

function _iniLenRefreshProgreso(evalData) {
  var comp = _iniLenCompletitud(evalData);
  var fill = document.getElementById('iniLenCompFill');
  if (fill) {
    var pctColor = comp.pct === 100 ? 'var(--ok)' : 'var(--accent)';
    fill.style.width      = comp.pct + '%';
    fill.style.background = pctColor;
  }
  // Actualizar fecha de última edición
  var fechaEl = document.getElementById('iniLenFechaEdit');
  if (fechaEl && evalData.updatedAt) {
    fechaEl.textContent = new Date(evalData.updatedAt).toLocaleDateString('es-AR', {
      day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
    });
  }
  // Actualizar badges de secciones
  INI_LEN_SECCIONES.forEach(function(sec) {
    var btn = document.querySelector('.ini-sec-toggle[data-sec="' + sec.id + '"]');
    if (!btn) return;
    var items = (evalData && evalData.items) || {};
    var total  = sec.campos.length;
    var llenos = sec.campos.filter(function(c) {
      var entry = items[c.id];
      if (!entry) return false;
      var v = entry.v;
      if (typeof v === 'string')  return v.trim().length > 0;
      if (typeof v === 'number')  return !isNaN(v) && v !== undefined;
      if (Array.isArray(v))       return v.length > 0;
      return false;
    }).length;
    var pct = Math.round((llenos / total) * 100);
    var countEl = btn.querySelector('.scr-sec-count');
    if (countEl) {
      countEl.textContent = llenos + '/' + total;
      countEl.className   = 'scr-sec-count' + (llenos === total ? ' scr-sec-count--done' : '');
    }
    var fillEl = btn.querySelector('.scr-sec-minifill');
    if (fillEl) { fillEl.style.width = pct + '%'; }
    var pctEl = btn.querySelector('.scr-sec-pct');
    if (pctEl) pctEl.textContent = pct + '%';
  });
}

// ════════════════════════════════════════════════════════════
// 10. CONEXIÓN CON FICHA CLÍNICA
// ════════════════════════════════════════════════════════════
function _iniLenGenerarDiagnostico(evalData, score) {
  var items = (evalData && evalData.items) || {};
  var lineas = ['Evaluación Inicial de Lenguaje Pediátrico.'];

  if (evalData.edadEval) lineas[0] += ' Edad: ' + evalData.edadEval + '.';

  if (score.interp) {
    lineas.push('Perfil lingüístico global: ' + score.interp.icon + ' ' + score.interp.label + '.');
  }

  // Agregar impresión si la completó el profesional
  var imp = (items.con_impresion && items.con_impresion.v) || '';
  if (imp.trim()) lineas.push(imp.trim());

  var hip = (items.con_hipotesis && items.con_hipotesis.v) || '';
  if (hip.trim()) lineas.push('Hipótesis diagnóstica: ' + hip.trim());

  return lineas.join(' ');
}

function _iniLenGenerarObservaciones(evalData, score) {
  var items = (evalData && evalData.items) || {};
  var lineas = [];

  // Áreas cuantitativas con sus observaciones
  [
    { id: 'com_obs', label: 'Comprensión' },
    { id: 'exp_obs', label: 'Expresión' },
    { id: 'prag_obs', label: 'Pragmática' },
    { id: 'obs_general', label: 'Observaciones generales' },
    { id: 'con_pasos', label: 'Próximos pasos' },
  ].forEach(function(f) {
    var v = (items[f.id] && items[f.id].v) || '';
    if (v.trim()) lineas.push(f.label + ':\n  ' + v.trim());
  });

  return lineas.length > 0 ? lineas.join('\n\n') : 'Sin observaciones registradas.';
}

function _iniLenVolcarAFicha(p, fichaId, evalData) {
  var score = _iniLenCalcScore(evalData);
  var comp  = _iniLenCompletitud(evalData);

  if (comp.llenos === 0) { toast('Completá al menos algunos campos antes de volcar', ''); return; }

  var fp = S.patients.find(function(x) { return x.id === p.id; });
  if (!fp) return;
  var f  = fp.fichasClinicas && fp.fichasClinicas.find(function(f) { return f.id === fichaId; });
  if (!f) return;

  var diagExiste = (f.diagnostico  || '').trim().length > 0;
  var obsExiste  = (f.observaciones || '').trim().length > 0;
  if (diagExiste || obsExiste) {
    if (!confirm('La ficha clínica ya tiene contenido en Diagnóstico u Observaciones.\n¿Reemplazar con el resumen de esta evaluación?')) return;
  }

  fichaClinicaUpdate(p.id, fichaId, {
    diagnostico:   _iniLenGenerarDiagnostico(evalData, score),
    observaciones: _iniLenGenerarObservaciones(evalData, score),
  });

  toast('✔ Resultado volcado a la ficha clínica', 'success');
  var btn = document.getElementById('iniLenBtnVolcar');
  if (btn) { btn.textContent = '✔ Volcado'; btn.disabled = true; btn.style.opacity = '0.6'; }
}

// ════════════════════════════════════════════════════════════
// 11. ESTILOS
// ════════════════════════════════════════════════════════════
function _iniLenInjectStyles() {
  // Reutilizar estilos .scr-* de eval_scr_len.js
  if (typeof _scrLenInjectStyles === 'function') _scrLenInjectStyles();

  // Estilos específicos de la evaluación inicial
  if (document.getElementById('iniLenStyles')) return;
  var s = document.createElement('style');
  s.id  = 'iniLenStyles';
  s.textContent = [
    // Contenedor de secciones
    '.ini-secciones{display:flex;flex-direction:column;gap:8px}',

    // Cuerpo interior de sección (más padding que scr)
    '.ini-sec-body-inner{padding:6px 18px 20px;display:flex;flex-direction:column;gap:18px}',

    // Campos
    '.ini-campo{display:flex;flex-direction:column;gap:6px}',
    '.ini-label{font-size:13px;font-weight:700;color:var(--text)}',
    '.ini-input{border:1.5px solid var(--border);border-radius:var(--rs);padding:8px 12px;' +
      'font-size:13px;font-family:inherit;color:var(--text);background:var(--bg);' +
      'transition:border-color .15s}',
    '.ini-input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--ag)}',
    '.ini-ta{border:1.5px solid var(--border);border-radius:var(--rs);padding:9px 12px;' +
      'font-size:13px;font-family:inherit;color:var(--text);background:var(--bg);' +
      'resize:vertical;line-height:1.65;transition:border-color .15s;min-height:52px;width:100%;box-sizing:border-box}',
    '.ini-ta:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--ag)}',

    // Escala 0-3
    '.ini-escala-desc{font-size:12px;color:var(--t3);font-style:italic;margin-bottom:6px}',
    '.ini-escala-btns{display:flex;flex-direction:column;gap:6px}',
    '.ini-escala-btn{text-align:left;padding:8px 14px;border-radius:var(--rs);' +
      'border:1.5px solid var(--border);background:var(--bg);color:var(--t2);' +
      'cursor:pointer;font-size:13px;font-family:inherit;transition:all .15s}',
    '.ini-escala-btn:hover{border-color:var(--accent);color:var(--accent)}',
    '.ini-escala-btn--active{font-weight:700}',

    // Checkboxes
    '.ini-check-hint{font-size:12px;color:var(--t3);font-style:italic;margin-bottom:8px}',
    '.ini-checks{display:flex;flex-direction:column;gap:8px}',
    '.ini-check-label{display:flex;align-items:flex-start;gap:8px;cursor:pointer;' +
      'font-size:13px;color:var(--text);line-height:1.5}',
    '.ini-check-input{width:16px;height:16px;flex-shrink:0;margin-top:2px;accent-color:var(--accent)}',

    // Badge de interpretación en sección
    '.ini-sec-interp{display:inline-block;font-size:11px;font-weight:700;' +
      'padding:2px 8px;border-radius:20px;margin-left:6px}',

    // Barra de completitud global
    '.ini-comp-wrap{margin-bottom:14px}',
    '.ini-comp-info{display:flex;justify-content:space-between;margin-bottom:5px;font-size:12px}',

    // Fechas en header
    '.ini-fechas{display:flex;gap:14px;flex-wrap:wrap;margin-top:4px;font-size:11px;color:var(--t3)}',

    // Mobile
    '@media(max-width:480px){' +
      '.scr-header{flex-direction:column}' +
      '.ini-escala-btns{gap:5px}' +
      '.ini-fechas{flex-direction:column;gap:2px}' +
    '}',
  ].join('\n');
  document.head.appendChild(s);
}

// ════════════════════════════════════════════════════════════
// 12. REGISTRO EN FC_EVAL_REGISTRY
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  if (typeof FC_EVAL_REGISTRY !== 'undefined') {
    FC_EVAL_REGISTRY['p_len_ini_01'] = {
      nombre:     'Evaluaci\u00f3n Inicial de Lenguaje (2\u201310 a\u00f1os)',
      area:       'lenguaje',
      tipo:       'inicial',
      calcGlobal: function(evalData) {
        var score = _iniLenCalcScore(evalData);
        var comp  = _iniLenCompletitud(evalData);
        return {
          globalInterp:      score.interp,
          totalRespondidos:  score.n,
          totalItems:        score.total,
          completitud:       comp,
        };
      },
      renderer: rEvalIniLen,
    };
  }
});
