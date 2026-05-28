// ============================================================
// eval_scr_len.js  —  Screening de Lenguaje 0–3 años
// Primera evaluación funcional completa — FONO360
// ============================================================
//
// ORDEN DE CARGA:
//   utils.js → storage.js → <script principal> → scoring.js
//   → fichas.js → fichas_ui.js → eval_scr_len.js
//
// DEPENDENCIAS GLOBALES:
//   scoring.js : EVA_INTERP, EVA_SCORE_COLORS
//   storage.js : saveS()
//   utils.js   : esc(), toast()
//   principal  : S, curP
//   fichas.js  : fichaClinicaGet()
//
// PUNTO DE ENTRADA:
//   rEvalScrLen(p, c, fichaId)
//   Llamado desde _cardHTML cuando renderer === 'scrLen'
//
// PERSISTENCIA:
//   p.fichasClinicas[n].evalData = {
//     items:   { [itemId]: { v: 0|1, obs: string } },
//     fechaEval: 'YYYY-MM-DD',
//     edadEval:  string,
//     updatedAt: ISO
//   }
//   Sin tocar fichas.js ni scoring.js.
//
// ARQUITECTURA BASE:
//   Este módulo sirve como PLANTILLA para todas las evaluaciones futuras.
//   Patrón: definición de ítems → render → bind → calcular → persistir
// ============================================================

// ════════════════════════════════════════════════════════════
// 1. DEFINICIÓN DE ÍTEMS CLÍNICOS
//    Fuente: hitos normativos del desarrollo del lenguaje
//    (Rescorla, 1989; Wetherby & Prizant, 2002; Acosta et al., 2007)
// ════════════════════════════════════════════════════════════
var SCR_LEN_AREAS = [
  {
    id:    'comprension',
    label: '👂 Comprensión',
    color: '#6D4DB8',
    bg:    '#F2EEF9',
    desc:  'Capacidad de entender el lenguaje oral en contexto',
    items: [
      { id: 'c1', edad: '0–6m',   texto: 'Responde a su nombre volteando o mirando hacia quien llama' },
      { id: 'c2', edad: '6–9m',   texto: 'Comprende "no" o cambios en el tono de voz' },
      { id: 'c3', edad: '9–12m',  texto: 'Sigue instrucción simple acompañada de gesto ("dame", "vení")' },
      { id: 'c4', edad: '12–18m', texto: 'Señala partes del cuerpo al ser nombradas (al menos 3)' },
      { id: 'c5', edad: '18–24m', texto: 'Comprende preguntas simples ("¿dónde está...?", "¿quién es...?")' },
      { id: 'c6', edad: '24–36m', texto: 'Comprende conceptos básicos: tamaño, color, cantidad (al menos 2)' },
    ],
  },
  {
    id:    'produccion',
    label: '🗣️ Producción',
    color: '#0A8F85',
    bg:    '#ECFDF5',
    desc:  'Habilidades de producción verbal y preverbal',
    items: [
      { id: 'p1', edad: '6–9m',   texto: 'Balbuceo variado con cadenas de sílabas (ba-ba, da-da)' },
      { id: 'p2', edad: '10–14m', texto: 'Primeras palabras funcionales con intención comunicativa' },
      { id: 'p3', edad: '18m',    texto: 'Vocabulario de al menos 10 palabras reconocibles' },
      { id: 'p4', edad: '18–24m', texto: 'Combina 2 palabras espontáneamente ("más agua", "papá no")' },
      { id: 'p5', edad: '24–30m', texto: 'Produce oraciones simples de 3 o más palabras' },
      { id: 'p6', edad: '30–36m', texto: 'Vocabulario de al menos 200 palabras; habla inteligible al 75%' },
    ],
  },
  {
    id:    'comunicacion_social',
    label: '🤝 Comunicación Social',
    color: '#B45309',
    bg:    '#FFFBEB',
    desc:  'Funciones comunicativas y habilidades pragmáticas tempranas',
    items: [
      { id: 's1', edad: '0–6m',   texto: 'Mantiene contacto visual funcional durante la interacción' },
      { id: 's2', edad: '9–12m',  texto: 'Muestra atención conjunta (sigue la mirada o el gesto del adulto)' },
      { id: 's3', edad: '12–18m', texto: 'Señalamiento protodeclarativo (señala para compartir, no solo pedir)' },
      { id: 's4', edad: '12–24m', texto: 'Juego funcional con objetos según su uso convencional' },
      { id: 's5', edad: '18–30m', texto: 'Imita gestos y acciones del adulto de forma espontánea' },
    ],
  },
];

// Mapa id → item para acceso O(1) en el render
var _SCR_LEN_MAP = {};
SCR_LEN_AREAS.forEach(function(area) {
  area.items.forEach(function(item) {
    _SCR_LEN_MAP[item.id] = { area: area.id, item: item };
  });
});

// ════════════════════════════════════════════════════════════
// 2. CÁLCULO DE SCORING
//    Lógica propia — mismo patrón que _calcAreaScore en scoring.js
//    pero adaptada a ítems binarios (presente/ausente)
// ════════════════════════════════════════════════════════════

// Calcula resultado de un área específica
// Retorna: { total, presentes, ausentes, pctRiesgo, interp }
function _scrLenCalcArea(evalData, areaId) {
  var area  = SCR_LEN_AREAS.find(function(a) { return a.id === areaId; });
  if (!area) return null;

  var items  = evalData && evalData.items ? evalData.items : {};
  var total  = area.items.length;
  var presentes = 0;
  var respondidos = 0;

  area.items.forEach(function(item) {
    var entry = items[item.id];
    if (entry && entry.v !== undefined && entry.v !== null) {
      respondidos++;
      if (entry.v === 1) presentes++;
    }
  });

  var ausentes   = respondidos - presentes;
  // % de riesgo = ausencias / total (más ausencias = más riesgo)
  var pctRiesgo  = total > 0 ? Math.round((ausentes / total) * 100) : 0;

  // Interpretación clínica usando EVA_INTERP de scoring.js
  var interp = null;
  if (respondidos >= Math.ceil(total / 2)) {
    interp = EVA_INTERP.find(function(t) { return pctRiesgo < t.maxPct; })
          || EVA_INTERP[EVA_INTERP.length - 1];
  }

  return {
    total: total, presentes: presentes, ausentes: ausentes,
    respondidos: respondidos, pctRiesgo: pctRiesgo, interp: interp,
  };
}

// Calcula resultado global de toda la evaluación
function _scrLenCalcGlobal(evalData) {
  var totalItems = 0, totalPresentes = 0, totalRespondidos = 0;
  var byArea = {};

  SCR_LEN_AREAS.forEach(function(area) {
    var r = _scrLenCalcArea(evalData, area.id);
    byArea[area.id] = r;
    if (r) {
      totalItems      += r.total;
      totalPresentes  += r.presentes;
      totalRespondidos+= r.respondidos;
    }
  });

  var totalAusentes = totalRespondidos - totalPresentes;
  var pctRiesgoGlobal = totalItems > 0
    ? Math.round((totalAusentes / totalItems) * 100) : 0;

  var globalInterp = null;
  if (totalRespondidos >= Math.ceil(totalItems / 2)) {
    globalInterp = EVA_INTERP.find(function(t) { return pctRiesgoGlobal < t.maxPct; })
                || EVA_INTERP[EVA_INTERP.length - 1];
  }

  return {
    byArea: byArea, totalItems: totalItems,
    totalPresentes: totalPresentes, totalRespondidos: totalRespondidos,
    pctRiesgoGlobal: pctRiesgoGlobal, globalInterp: globalInterp,
  };
}

// ════════════════════════════════════════════════════════════
// 3. PERSISTENCIA
// ════════════════════════════════════════════════════════════
var _scrLenDebounce = null;

function _scrLenSave(p, fichaId, evalData) {
  var fp = S.patients.find(function(x) { return x.id === p.id; });
  if (!fp || !fp.fichasClinicas) return;
  var f = fp.fichasClinicas.find(function(f) { return f.id === fichaId; });
  if (!f) return;
  evalData.updatedAt = new Date().toISOString();
  f.evalData   = evalData;
  f.updatedAt  = evalData.updatedAt;
  saveS();
}

function _scrLenScheduleSave(p, fichaId, evalData) {
  clearTimeout(_scrLenDebounce);
  // Feedback inmediato
  var ind = document.getElementById('scrLenAutosave');
  if (ind) { ind.textContent = 'Guardando'; ind.className = 'scr-autosave scr-autosave--saving'; }

  _scrLenDebounce = setTimeout(function() {
    _scrLenSave(p, fichaId, evalData);
    var ind2 = document.getElementById('scrLenAutosave');
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
// 4. RENDER — HTML
// ════════════════════════════════════════════════════════════

function _scrLenHtmlItem(item, evalData) {
  var entry  = (evalData.items && evalData.items[item.id]) || {};
  var val    = entry.v; // 0 | 1 | undefined
  var obs    = entry.obs || '';

  var btnP = '<button type="button"' +
    ' class="scr-btn scr-btn--p' + (val === 1 ? ' scr-btn--active' : '') + '"' +
    ' data-item="' + item.id + '" data-val="1"' +
    ' title="Presente">✓ Presente</button>';
  var btnA = '<button type="button"' +
    ' class="scr-btn scr-btn--a' + (val === 0 ? ' scr-btn--active-a' : '') + '"' +
    ' data-item="' + item.id + '" data-val="0"' +
    ' title="Ausente">✕ Ausente</button>';

  return '<div class="scr-item" data-item-id="' + item.id + '">' +
    '<div class="scr-item-top">' +
      '<div class="scr-item-text">' +
        '<span class="scr-item-edad">' + esc(item.edad) + '</span>' +
        esc(item.texto) +
      '</div>' +
      '<div class="scr-item-btns">' + btnP + btnA + '</div>' +
    '</div>' +
    '<div class="scr-item-obs' + (obs ? ' scr-item-obs--visible' : '') + '">' +
      '<textarea class="scr-obs-ta"' +
        ' data-item="' + item.id + '"' +
        ' placeholder="Observación (opcional)…"' +
        ' rows="1">' + esc(obs) + '</textarea>' +
    '</div>' +
  '</div>';
}

function _scrLenHtmlArea(area, evalData) {
  var result = _scrLenCalcArea(evalData, area.id);
  var pct    = result ? result.pctRiesgo : 0;
  var interp = result && result.interp;
  var respondidos = result ? result.respondidos : 0;
  var total       = result ? result.total : 0;

  var interpHTML = interp
    ? '<span class="scr-area-interp" style="background:' + interp.bg +
        ';color:' + interp.color + '">' +
        interp.icon + ' ' + interp.label +
      '</span>'
    : '';

  var itemsHTML = area.items.map(function(item) {
    return _scrLenHtmlItem(item, evalData);
  }).join('');

  return '<div class="scr-area" id="scrArea-' + area.id + '">' +
    '<div class="scr-area-header" style="border-left:3px solid ' + area.color + '">' +
      '<div class="scr-area-title" style="color:' + area.color + '">' + area.label + '</div>' +
      '<div class="scr-area-meta">' +
        '<span class="scr-area-prog">' +
          respondidos + '/' + total + ' respondidos' +
        '</span>' +
        interpHTML +
      '</div>' +
      '<div class="scr-area-desc">' + esc(area.desc) + '</div>' +
    '</div>' +
    '<div class="scr-items">' + itemsHTML + '</div>' +
  '</div>';
}

function _scrLenHtmlResumen(evalData) {
  var g = _scrLenCalcGlobal(evalData);
  if (g.totalRespondidos === 0) return '';

  var interpHTML = g.globalInterp
    ? '<div class="scr-resumen-interp" style="background:' + g.globalInterp.bg +
        ';color:' + g.globalInterp.color +
        ';border:1.5px solid ' + g.globalInterp.color + '20">' +
        '<div class="scr-resumen-interp-icon">' + g.globalInterp.icon + '</div>' +
        '<div>' +
          '<div class="scr-resumen-interp-label">' + g.globalInterp.label + '</div>' +
          '<div class="scr-resumen-interp-sub">' +
            g.totalRespondidos + ' de ' + g.totalItems + ' ítems evaluados · ' +
            (g.totalItems - g.totalPresentes) + ' señales de riesgo detectadas' +
          '</div>' +
        '</div>' +
      '</div>'
    : '';

  var areasHTML = SCR_LEN_AREAS.map(function(area) {
    var r = g.byArea[area.id];
    if (!r || r.respondidos === 0) return '';
    var interp = r.interp;
    return '<div class="scr-resumen-area">' +
      '<div class="scr-resumen-area-name" style="color:' + area.color + '">' +
        area.label +
      '</div>' +
      '<div class="scr-resumen-area-data">' +
        '<div class="scr-resumen-bar">' +
          '<div class="scr-resumen-bar-fill" style="width:' + (100 - r.pctRiesgo) + '%;' +
            'background:' + (interp ? interp.color : area.color) + '"></div>' +
        '</div>' +
        (interp ? '<span style="font-size:11px;color:' + interp.color + ';font-weight:700">' +
          interp.icon + ' ' + interp.label + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  return '<div class="scr-resumen" id="scrResumen">' +
    '<div class="scr-resumen-title">📊 Resultado del screening</div>' +
    interpHTML +
    (areasHTML ? '<div class="scr-resumen-areas">' + areasHTML + '</div>' : '') +
  '</div>';
}

function _scrLenHtmlDatosEval(evalData) {
  var fecha = evalData.fechaEval || '';
  var edad  = evalData.edadEval  || '';
  return '<div class="scr-datos">' +
    '<div class="scr-datos-field">' +
      '<label class="scr-datos-label">Fecha de evaluación</label>' +
      '<input type="date" class="scr-datos-input" id="scrFechaEval"' +
        ' value="' + esc(fecha) + '">' +
    '</div>' +
    '<div class="scr-datos-field">' +
      '<label class="scr-datos-label">Edad cronológica</label>' +
      '<input type="text" class="scr-datos-input" id="scrEdadEval"' +
        ' placeholder="ej: 1a 8m" value="' + esc(edad) + '">' +
    '</div>' +
  '</div>';
}

// ════════════════════════════════════════════════════════════
// 5. PUNTO DE ENTRADA PÚBLICO
// ════════════════════════════════════════════════════════════
function rEvalScrLen(p, c, fichaId) {
  if (!p || !c) return;

  // Cargar evalData existente o inicializar
  var ficha = fichaClinicaGet(p.id, fichaId);
  if (!ficha) { toast('Ficha no encontrada', 'error'); return; }
  var evalData = ficha.evalData || { items: {}, fechaEval: '', edadEval: '' };

  // Inyectar estilos una sola vez
  _scrLenInjectStyles();

  // Render completo
  c.innerHTML =
    '<div class="scr-wrap">' +

      // Cabecera
      '<div class="scr-header">' +
        '<button class="btn btn-s btn-sm" id="scrBtnVolver">‹ Volver</button>' +
        '<div class="scr-header-right">' +
          '<div>' +
            '<div class="scr-titulo">Screening de Lenguaje</div>' +
            '<div class="scr-subtitulo">0–3 años · Detección de señales de riesgo</div>' +
          '</div>' +
          '<span class="scr-autosave" id="scrLenAutosave"></span>' +
        '</div>' +
      '</div>' +

      // Datos de la evaluación
      _scrLenHtmlDatosEval(evalData) +

      // Instrucciones
      '<div class="scr-instrucciones">' +
        '<strong>Instrucciones:</strong> Marcá cada ítem como <strong>Presente</strong> ' +
        '(habilidad observada o referida por la familia) o <strong>Ausente</strong> ' +
        '(no observada en el rango de edad esperado). ' +
        'Los ítems ausentes fuera del rango de edad del niño pueden omitirse.' +
      '</div>' +

      // Resumen (se actualiza en vivo)
      _scrLenHtmlResumen(evalData) +

      // Áreas clínicas
      SCR_LEN_AREAS.map(function(area) {
        return _scrLenHtmlArea(area, evalData);
      }).join('') +

    '</div>';

  // Bind
  _scrLenBind(p, fichaId, evalData, c);
}

// ════════════════════════════════════════════════════════════
// 6. BIND — eventos del formulario
// ════════════════════════════════════════════════════════════
function _scrLenBind(p, fichaId, evalData, c) {

  // Botón volver
  var btnVolver = document.getElementById('scrBtnVolver');
  if (btnVolver) {
    btnVolver.onclick = function() {
      clearTimeout(_scrLenDebounce);
      // Volver al navegador de evaluaciones
      var fichaLevel = document.getElementById('evalFichaLevel');
      if (fichaLevel) {
        fichaLevel.style.display = '';
        c.innerHTML = '';
      }
    };
  }

  // Botones Presente / Ausente
  c.querySelectorAll('.scr-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var itemId = btn.getAttribute('data-item');
      var val    = parseInt(btn.getAttribute('data-val'), 10);
      if (!evalData.items) evalData.items = {};
      if (!evalData.items[itemId]) evalData.items[itemId] = {};

      // Toggle: si ya tenía ese valor, deseleccionar
      if (evalData.items[itemId].v === val) {
        delete evalData.items[itemId].v;
      } else {
        evalData.items[itemId].v = val;
      }

      // Actualizar UI del ítem
      _scrLenRefreshItem(itemId, evalData);
      // Actualizar resumen en vivo
      _scrLenRefreshResumen(evalData);
      // Guardar
      _scrLenScheduleSave(p, fichaId, evalData);
    });
  });

  // Textareas de observación
  c.querySelectorAll('.scr-obs-ta').forEach(function(ta) {
    ta.addEventListener('input', function() {
      var itemId = ta.getAttribute('data-item');
      if (!evalData.items) evalData.items = {};
      if (!evalData.items[itemId]) evalData.items[itemId] = {};
      evalData.items[itemId].obs = ta.value;
      _scrLenScheduleSave(p, fichaId, evalData);
    });
    // Auto-resize
    ta.addEventListener('input', function() {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    });
  });

  // Datos de la evaluación (fecha, edad)
  var inputFecha = document.getElementById('scrFechaEval');
  var inputEdad  = document.getElementById('scrEdadEval');
  if (inputFecha) {
    inputFecha.addEventListener('input', function() {
      evalData.fechaEval = inputFecha.value;
      _scrLenScheduleSave(p, fichaId, evalData);
    });
  }
  if (inputEdad) {
    inputEdad.addEventListener('input', function() {
      evalData.edadEval = inputEdad.value;
      _scrLenScheduleSave(p, fichaId, evalData);
    });
  }
}

// Actualiza el estado visual de un ítem sin re-renderizar todo
function _scrLenRefreshItem(itemId, evalData) {
  var entry = (evalData.items && evalData.items[itemId]) || {};
  var val   = entry.v;

  var itemEl = document.querySelector('[data-item-id="' + itemId + '"]');
  if (!itemEl) return;

  itemEl.querySelectorAll('.scr-btn').forEach(function(btn) {
    var bVal = parseInt(btn.getAttribute('data-val'), 10);
    btn.classList.remove('scr-btn--active', 'scr-btn--active-a');
    if (val === 1 && bVal === 1) btn.classList.add('scr-btn--active');
    if (val === 0 && bVal === 0) btn.classList.add('scr-btn--active-a');
  });
}

// Actualiza el bloque de resumen en vivo
function _scrLenRefreshResumen(evalData) {
  var resumenEl = document.getElementById('scrResumen');
  var newHTML   = _scrLenHtmlResumen(evalData);

  if (resumenEl) {
    resumenEl.outerHTML = newHTML || '<div id="scrResumen"></div>';
  } else {
    // Insertar antes de la primera área si no existe
    var primerArea = document.querySelector('.scr-area');
    if (primerArea && newHTML) {
      primerArea.insertAdjacentHTML('beforebegin', newHTML);
    }
  }

  // Actualizar stats de cada área
  SCR_LEN_AREAS.forEach(function(area) {
    var r = _scrLenCalcArea(evalData, area.id);
    if (!r) return;
    var areaEl = document.getElementById('scrArea-' + area.id);
    if (!areaEl) return;

    var progEl  = areaEl.querySelector('.scr-area-prog');
    var interpEl = areaEl.querySelector('.scr-area-interp');

    if (progEl) progEl.textContent = r.respondidos + '/' + r.total + ' respondidos';

    if (interpEl) {
      if (r.interp) {
        interpEl.textContent       = r.interp.icon + ' ' + r.interp.label;
        interpEl.style.background  = r.interp.bg;
        interpEl.style.color       = r.interp.color;
      } else {
        interpEl.textContent = '';
      }
    } else if (r.interp) {
      var metaEl = areaEl.querySelector('.scr-area-meta');
      if (metaEl) {
        var span = document.createElement('span');
        span.className = 'scr-area-interp';
        span.style.background = r.interp.bg;
        span.style.color      = r.interp.color;
        span.textContent      = r.interp.icon + ' ' + r.interp.label;
        metaEl.appendChild(span);
      }
    }
  });
}

// ════════════════════════════════════════════════════════════
// 7. ESTILOS — inyectados una sola vez
// ════════════════════════════════════════════════════════════
function _scrLenInjectStyles() {
  if (document.getElementById('scrLenStyles')) return;
  var s = document.createElement('style');
  s.id  = 'scrLenStyles';
  s.textContent = [
    // Contenedor
    '.scr-wrap{padding:2px 0;display:flex;flex-direction:column;gap:16px}',

    // Cabecera
    '.scr-header{display:flex;align-items:flex-start;justify-content:space-between;' +
      'gap:10px;flex-wrap:wrap}',
    '.scr-header-right{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}',
    '.scr-titulo{font-size:17px;font-weight:700;color:var(--text);font-family:var(--fd)}',
    '.scr-subtitulo{font-size:12px;color:var(--t3);margin-top:2px}',

    // Datos de la evaluación
    '.scr-datos{display:flex;gap:12px;flex-wrap:wrap;' +
      'background:var(--bg2);border:1.5px solid var(--border);' +
      'border-radius:var(--r);padding:14px 16px}',
    '.scr-datos-field{display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px}',
    '.scr-datos-label{font-size:12px;font-weight:600;color:var(--t3)}',
    '.scr-datos-input{border:1.5px solid var(--border);border-radius:var(--rs);' +
      'padding:7px 10px;font-size:13px;font-family:inherit;color:var(--text);' +
      'background:var(--bg);transition:border-color .15s}',
    '.scr-datos-input:focus{outline:none;border-color:var(--accent);' +
      'box-shadow:0 0 0 3px var(--ag)}',

    // Instrucciones
    '.scr-instrucciones{font-size:13px;color:var(--t2);line-height:1.6;' +
      'background:var(--bg3);border-radius:var(--rs);padding:12px 14px;' +
      'border-left:3px solid var(--accent)}',

    // Área clínica
    '.scr-area{background:var(--bg2);border:1.5px solid var(--border);' +
      'border-radius:var(--r);overflow:hidden}',
    '.scr-area-header{padding:14px 16px;border-bottom:1px solid var(--border)}',
    '.scr-area-title{font-size:14px;font-weight:700;margin-bottom:6px}',
    '.scr-area-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}',
    '.scr-area-prog{font-size:11px;color:var(--t3)}',
    '.scr-area-desc{font-size:12px;color:var(--t3);font-style:italic}',
    '.scr-area-interp{display:inline-block;font-size:11px;font-weight:700;' +
      'padding:2px 9px;border-radius:20px;white-space:nowrap}',

    // Ítems
    '.scr-items{display:flex;flex-direction:column}',
    '.scr-item{padding:12px 16px;border-bottom:1px solid var(--border);' +
      'transition:background .15s}',
    '.scr-item:last-child{border-bottom:none}',
    '.scr-item:hover{background:var(--bg3)}',
    '.scr-item-top{display:flex;align-items:flex-start;gap:12px;justify-content:space-between}',
    '.scr-item-text{font-size:13px;color:var(--text);line-height:1.55;flex:1}',
    '.scr-item-edad{display:inline-block;font-size:10px;font-weight:700;' +
      'color:var(--t3);background:var(--bg3);border-radius:20px;' +
      'padding:1px 7px;margin-right:6px;white-space:nowrap}',

    // Botones Presente/Ausente
    '.scr-item-btns{display:flex;gap:5px;flex-shrink:0}',
    '.scr-btn{font-size:11px;font-weight:700;padding:5px 10px;border-radius:20px;' +
      'border:1.5px solid var(--border);background:var(--bg);color:var(--t2);' +
      'cursor:pointer;transition:all .15s;white-space:nowrap;font-family:inherit}',
    '.scr-btn:hover{border-color:var(--accent);color:var(--accent)}',
    '.scr-btn--active{background:#D1FAE5;border-color:#059669;color:#065F46}',
    '.scr-btn--active-a{background:#FEE2E2;border-color:#DC2626;color:#991B1B}',

    // Observación
    '.scr-item-obs{margin-top:0;max-height:0;overflow:hidden;transition:max-height .2s}',
    '.scr-item-obs--visible{max-height:200px;margin-top:8px}',
    '.scr-obs-ta{width:100%;box-sizing:border-box;border:1px solid var(--border);' +
      'border-radius:var(--rs);padding:6px 10px;font-size:12px;' +
      'color:var(--t2);background:var(--bg);resize:none;font-family:inherit;' +
      'line-height:1.5;transition:border-color .15s}',
    '.scr-obs-ta:focus{outline:none;border-color:var(--accent)}',

    // Resumen de resultado
    '.scr-resumen{background:var(--bg2);border:1.5px solid var(--border);' +
      'border-radius:var(--r);padding:16px 18px}',
    '.scr-resumen-title{font-size:13px;font-weight:700;color:var(--t2);' +
      'margin-bottom:12px;font-family:var(--fd)}',
    '.scr-resumen-interp{display:flex;align-items:center;gap:12px;' +
      'border-radius:var(--rs);padding:12px 14px;margin-bottom:14px}',
    '.scr-resumen-interp-icon{font-size:22px}',
    '.scr-resumen-interp-label{font-size:15px;font-weight:700}',
    '.scr-resumen-interp-sub{font-size:12px;margin-top:2px;opacity:.8}',
    '.scr-resumen-areas{display:flex;flex-direction:column;gap:8px}',
    '.scr-resumen-area{display:flex;align-items:center;gap:10px}',
    '.scr-resumen-area-name{font-size:12px;font-weight:600;width:160px;flex-shrink:0}',
    '.scr-resumen-area-data{display:flex;align-items:center;gap:8px;flex:1}',
    '.scr-resumen-bar{flex:1;height:6px;background:var(--border);' +
      'border-radius:4px;overflow:hidden}',
    '.scr-resumen-bar-fill{height:100%;border-radius:4px;' +
      'transition:width .4s cubic-bezier(.4,0,.2,1)}',

    // Autosave
    '.scr-autosave{font-size:12px;font-weight:600;color:var(--t3);padding-top:4px}',
    '.scr-autosave--ok{color:var(--ok)}',
    '.scr-autosave--saving{color:var(--t3)}',
    '.scr-autosave--saving::after{content:"···"}',

    // Responsive mobile
    '@media(max-width:480px){' +
      '.scr-item-top{flex-direction:column;gap:8px}' +
      '.scr-item-btns{width:100%;justify-content:flex-start}' +
      '.scr-btn{flex:1;text-align:center}' +
      '.scr-header{flex-direction:column}' +
      '.scr-resumen-area{flex-wrap:wrap}' +
      '.scr-resumen-area-name{width:100%}' +
    '}',
  ].join('\n');
  document.head.appendChild(s);
}
