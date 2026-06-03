// ============================================================
// eval_scr_fon.js  —  Screening Fonológico Escolar 4–7 años
// Segunda evaluación funcional — FONO360
// ============================================================
//
// ORDEN DE CARGA:
//   utils.js → storage.js → <script principal> → scoring.js
//   → fichas.js → fichas_ui.js → eval_scr_len.js → eval_scr_fon.js
//
// DEPENDENCIAS GLOBALES:
//   scoring.js  : EVA_INTERP, EVA_SCORE_COLORS
//   storage.js  : saveS()
//   utils.js    : esc(), toast()
//   principal   : S, curP
//   fichas.js   : fichaClinicaGet(), fichaClinicaUpdate()
//   fichas_ui.js: FC_EVAL_REGISTRY
//   eval_scr_len.js: estilos .scr-* (reutilizados)
//
// PUNTO DE ENTRADA:
//   rEvalScrFon(p, c, fichaId)
//
// PERSISTENCIA:
//   p.fichasClinicas[n].evalData = {
//     items:     { [itemId]: { v: 0|1, obs: string } },
//     fechaEval: 'YYYY-MM-DD',
//     edadEval:  string,
//     updatedAt: ISO
//   }
//
// PREFIJO: _scrFon_ / SCR_FON_  (sin colisión con _scrLen_)
// IDs de ítems: 'a1'–'a6', 'cf1'–'cf6', 'fr1'–'fr4'
//               (distintos de 'c1'–'c6', 'p1'–'p6', 's1'–'s5' de scrLen)
//
// REGISTRO EN FC_EVAL_REGISTRY:
//   FC_EVAL_REGISTRY['p_len_scr_02'] = {
//     nombre, area, tipo, calcGlobal, renderer
//   }
//   → automático al cargar, vía DOMContentLoaded
// ============================================================

// ════════════════════════════════════════════════════════════
// 1. DEFINICIÓN DE ÍTEMS CLÍNICOS
//    Fuente: Acosta & Moreno (2001), Bosch (2004),
//            Aguilar-Mediavilla et al. (2007)
//    Rango: 4–7 años, contexto educativo
// ════════════════════════════════════════════════════════════
var SCR_FON_AREAS = [
  {
    id:    'articulacion',
    label: '🔤 Articulación',
    color: '#6D4DB8',
    bg:    '#F2EEF9',
    desc:  'Producción correcta de fonemas en palabras. Puntaje: Correcto / Error',
    btnP:  'Correcto',
    btnA:  'Error',
    items: [
      { id: 'a1', edad: '4a',   texto: '/r/ en posición intervocálica (p.ej. "cara", "loro")' },
      { id: 'a2', edad: '4–5a', texto: '/rr/ vibrante múltiple (p.ej. "perro", "carro")' },
      { id: 'a3', edad: '4a',   texto: '/s/ en posición inicial y final de sílaba (p.ej. "sol", "manos")' },
      { id: 'a4', edad: '5a',   texto: '/l/ en grupos consonánticos (p.ej. "plato", "globo")' },
      { id: 'a5', edad: '5–6a', texto: '/ch/ africada (p.ej. "chocolate", "leche")' },
      { id: 'a6', edad: '6–7a', texto: '/x/ fricativa (p.ej. "caja", "ojo")' },
    ],
  },
  {
    id:    'conciencia_fonologica',
    label: '🔊 Conciencia Fonológica',
    color: '#0A8F85',
    bg:    '#ECFDF5',
    desc:  'Habilidades metafonológicas evaluadas con tareas orales breves. Puntaje: Logrado / No logrado',
    btnP:  'Logrado',
    btnA:  'No logrado',
    items: [
      { id: 'cf1', edad: '4a',   texto: 'Segmentación silábica: divide palabras en golpes de voz (p.ej. "me-sa")' },
      { id: 'cf2', edad: '4–5a', texto: 'Identificación de rima: reconoce palabras que riman (p.ej. "gato-pato")' },
      { id: 'cf3', edad: '5a',   texto: 'Identificación de fonema inicial: "¿Con qué sonido empieza \'sol\'?"' },
      { id: 'cf4', edad: '5–6a', texto: 'Omisión silábica: "Decí \'paloma\' sin \'pa\'" → "loma"' },
      { id: 'cf5', edad: '6a',   texto: 'Síntesis fonémica: une fonemas escuchados → palabra (/m/-/a/-/r/ → "mar")' },
      { id: 'cf6', edad: '6–7a', texto: 'Omisión de fonema inicial: "Decí \'flan\' sin /f/" → "lan"' },
    ],
  },
  {
    id:    'fluidez_ritmo',
    label: '🎵 Fluidez y Ritmo',
    color: '#B45309',
    bg:    '#FFFBEB',
    desc:  'Observación de la fluencia y prosodia del habla. Puntaje: Adecuado / Alterado',
    btnP:  'Adecuado',
    btnA:  'Alterado',
    items: [
      { id: 'fr1', edad: '4–7a', texto: 'Fluencia del habla: sin repeticiones, bloqueos ni prolongaciones excesivas' },
      { id: 'fr2', edad: '4–7a', texto: 'Velocidad del habla: ritmo apropiado para la edad, no excesivamente rápida ni lenta' },
      { id: 'fr3', edad: '4–7a', texto: 'Prosodia: entonación natural, sin patrón monótono o atípico' },
      { id: 'fr4', edad: '4–7a', texto: 'Inteligibilidad global: habla comprensible por interlocutores desconocidos' },
    ],
  },
];

// Mapa id → item para acceso O(1)
var _SCR_FON_MAP = {};
SCR_FON_AREAS.forEach(function(area) {
  area.items.forEach(function(item) {
    _SCR_FON_MAP[item.id] = { area: area.id, item: item };
  });
});

// ════════════════════════════════════════════════════════════
// 2. CÁLCULO DE SCORING
//    Mismo patrón que eval_scr_len.js
//    Binario: Correcto/Logrado/Adecuado=1, Error/No logrado/Alterado=0
//    % alteración = ausentes / total → EVA_INTERP
// ════════════════════════════════════════════════════════════
function _scrFonCalcArea(evalData, areaId) {
  var area = SCR_FON_AREAS.find(function(a) { return a.id === areaId; });
  if (!area) return null;

  var items       = evalData && evalData.items ? evalData.items : {};
  var total       = area.items.length;
  var correctos   = 0;
  var respondidos = 0;

  area.items.forEach(function(item) {
    var entry = items[item.id];
    if (entry && entry.v !== undefined && entry.v !== null) {
      respondidos++;
      if (entry.v === 1) correctos++;
    }
  });

  var errores    = respondidos - correctos;
  var pctRiesgo  = total > 0 ? Math.round((errores / total) * 100) : 0;

  var interp = null;
  if (respondidos >= Math.ceil(total / 2)) {
    interp = EVA_INTERP.find(function(t) { return pctRiesgo < t.maxPct; })
          || EVA_INTERP[EVA_INTERP.length - 1];
  }

  return {
    total: total, correctos: correctos, errores: errores,
    respondidos: respondidos, pctRiesgo: pctRiesgo, interp: interp,
  };
}

function _scrFonCalcGlobal(evalData) {
  var totalItems       = 0;
  var totalCorrectos   = 0;
  var totalRespondidos = 0;
  var byArea           = {};

  SCR_FON_AREAS.forEach(function(area) {
    var r = _scrFonCalcArea(evalData, area.id);
    byArea[area.id] = r;
    if (r) {
      totalItems       += r.total;
      totalCorrectos   += r.correctos;
      totalRespondidos += r.respondidos;
    }
  });

  var totalErrores    = totalRespondidos - totalCorrectos;
  var pctRiesgoGlobal = totalItems > 0
    ? Math.round((totalErrores / totalItems) * 100) : 0;

  var globalInterp = null;
  if (totalRespondidos >= Math.ceil(totalItems / 2)) {
    globalInterp = EVA_INTERP.find(function(t) { return pctRiesgoGlobal < t.maxPct; })
                || EVA_INTERP[EVA_INTERP.length - 1];
  }

  return {
    byArea: byArea, totalItems: totalItems,
    totalCorrectos: totalCorrectos, totalRespondidos: totalRespondidos,
    totalErrores: totalErrores, pctRiesgoGlobal: pctRiesgoGlobal, globalInterp: globalInterp,
  };
}

// ════════════════════════════════════════════════════════════
// 3. PERSISTENCIA
// ════════════════════════════════════════════════════════════
var _scrFonDebounce = null;

function _scrFonSave(p, fichaId, evalData) {
  var fp = S.patients.find(function(x) { return x.id === p.id; });
  if (!fp || !fp.fichasClinicas) return;
  var f = fp.fichasClinicas.find(function(f) { return f.id === fichaId; });
  if (!f) return;
  evalData.updatedAt = new Date().toISOString();
  f.evalData  = evalData;
  f.updatedAt = evalData.updatedAt;
  saveS();
}

function _scrFonScheduleSave(p, fichaId, evalData) {
  clearTimeout(_scrFonDebounce);
  var ind = document.getElementById('scrFonAutosave');
  if (ind) { ind.textContent = 'Guardando'; ind.className = 'scr-autosave scr-autosave--saving'; }

  _scrFonDebounce = setTimeout(function() {
    _scrFonSave(p, fichaId, evalData);
    var ind2 = document.getElementById('scrFonAutosave');
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
function _scrFonHtmlItem(item, evalData, area) {
  var entry  = (evalData.items && evalData.items[item.id]) || {};
  var val    = entry.v;
  var obs    = entry.obs || '';
  var labelP = area.btnP || 'Correcto';
  var labelA = area.btnA || 'Error';

  var btnP = '<button type="button"' +
    ' class="scr-btn scr-btn--p' + (val === 1 ? ' scr-btn--active' : '') + '"' +
    ' data-item="' + item.id + '" data-val="1">' +
    '✓ ' + labelP + '</button>';
  var btnA = '<button type="button"' +
    ' class="scr-btn scr-btn--a' + (val === 0 ? ' scr-btn--active-a' : '') + '"' +
    ' data-item="' + item.id + '" data-val="0">' +
    '✕ ' + labelA + '</button>';

  return '<div class="scr-item" data-item-id="' + item.id + '">' +
    '<div class="scr-item-top">' +
      '<div class="scr-item-text">' +
        '<span class="scr-item-edad">' + esc(item.edad) + '</span>' +
        esc(item.texto) +
      '</div>' +
      '<div class="scr-item-btns">' + btnP + btnA + '</div>' +
    '</div>' +
    '<div class="scr-item-obs' + (obs ? ' scr-item-obs--visible' : '') + '">' +
      '<textarea class="scr-obs-ta" data-item="' + item.id + '"' +
        ' placeholder="Observación (opcional)…" rows="1">' + esc(obs) + '</textarea>' +
    '</div>' +
  '</div>';
}

function _scrFonHtmlArea(area, evalData) {
  var result      = _scrFonCalcArea(evalData, area.id);
  var respondidos = result ? result.respondidos : 0;
  var total       = result ? result.total : 0;
  var interp      = result && result.interp;

  var interpHTML = interp
    ? '<span class="scr-area-interp" style="background:' + interp.bg +
        ';color:' + interp.color + '">' + interp.icon + ' ' + interp.label + '</span>'
    : '';

  var itemsHTML = area.items.map(function(item) {
    return _scrFonHtmlItem(item, evalData, area);
  }).join('');

  return '<div class="scr-area" id="scrFonArea-' + area.id + '">' +
    '<div class="scr-area-header" style="border-left:3px solid ' + area.color + '">' +
      '<div class="scr-area-title" style="color:' + area.color + '">' + area.label + '</div>' +
      '<div class="scr-area-meta">' +
        '<span class="scr-area-prog">' + respondidos + '/' + total + ' respondidos</span>' +
        interpHTML +
      '</div>' +
      '<div class="scr-area-desc">' + esc(area.desc) + '</div>' +
    '</div>' +
    '<div class="scr-items">' + itemsHTML + '</div>' +
  '</div>';
}

function _scrFonHtmlResumen(evalData) {
  var g = _scrFonCalcGlobal(evalData);
  if (!g || g.totalRespondidos === 0) return '<div id="scrFonResumen"></div>';

  var interpHTML = g.globalInterp
    ? '<div class="scr-resumen-interp" style="background:' + g.globalInterp.bg +
        ';color:' + g.globalInterp.color +
        ';border:1.5px solid ' + g.globalInterp.color + '20">' +
        '<div class="scr-resumen-interp-icon">' + g.globalInterp.icon + '</div>' +
        '<div style="flex:1">' +
          '<div class="scr-resumen-interp-label">' + g.globalInterp.label + '</div>' +
          '<div class="scr-resumen-interp-sub">' +
            g.totalRespondidos + ' de ' + g.totalItems + ' ítems evaluados · ' +
            g.totalErrores + ' error' + (g.totalErrores !== 1 ? 'es' : '') + ' detectado' + (g.totalErrores !== 1 ? 's' : '') +
          '</div>' +
        '</div>' +
        '<button id="scrFonBtnVolcar" class="btn btn-p btn-sm scr-btn-volcar"' +
          ' title="Volcar resultado a la ficha clínica">' +
          '📋 Volcar a ficha' +
        '</button>' +
      '</div>'
    : '';

  var areasHTML = SCR_FON_AREAS.map(function(area) {
    var r = g.byArea[area.id];
    if (!r || r.respondidos === 0) return '';
    return '<div class="scr-resumen-area">' +
      '<div class="scr-resumen-area-name" style="color:' + area.color + '">' + area.label + '</div>' +
      '<div class="scr-resumen-area-data">' +
        '<div class="scr-resumen-bar">' +
          '<div class="scr-resumen-bar-fill" style="width:' + (100 - r.pctRiesgo) + '%;' +
            'background:' + (r.interp ? r.interp.color : area.color) + '"></div>' +
        '</div>' +
        (r.interp ? '<span style="font-size:11px;color:' + r.interp.color + ';font-weight:700">' +
          r.interp.icon + ' ' + r.interp.label + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  return '<div class="scr-resumen" id="scrFonResumen">' +
    '<div class="scr-resumen-title">📊 Resultado del screening</div>' +
    interpHTML +
    (areasHTML ? '<div class="scr-resumen-areas">' + areasHTML + '</div>' : '') +
  '</div>';
}

function _scrFonHtmlDatosEval(evalData) {
  return '<div class="scr-datos">' +
    '<div class="scr-datos-field">' +
      '<label class="scr-datos-label">Fecha de evaluación</label>' +
      '<input type="date" class="scr-datos-input" id="scrFonFechaEval"' +
        ' value="' + esc(evalData.fechaEval || '') + '">' +
    '</div>' +
    '<div class="scr-datos-field">' +
      '<label class="scr-datos-label">Edad cronológica</label>' +
      '<input type="text" class="scr-datos-input" id="scrFonEdadEval"' +
        ' placeholder="ej: 5a 3m" value="' + esc(evalData.edadEval || '') + '">' +
    '</div>' +
    '<div class="scr-datos-field">' +
      '<label class="scr-datos-label">Año escolar</label>' +
      '<input type="text" class="scr-datos-input" id="scrFonAnioEscolar"' +
        ' placeholder="ej: Sala de 5, 1° grado" value="' + esc(evalData.anioEscolar || '') + '">' +
    '</div>' +
  '</div>';
}

// ════════════════════════════════════════════════════════════
// 5. PUNTO DE ENTRADA PÚBLICO
// ════════════════════════════════════════════════════════════
function rEvalScrFon(p, c, fichaId) {
  if (!p || !c) return;

  var ficha = fichaClinicaGet(p.id, fichaId);
  if (!ficha) { toast('Ficha no encontrada', 'error'); return; }
  var evalData = ficha.evalData || { items: {}, fechaEval: '', edadEval: '', anioEscolar: '' };

  _scrFonInjectStyles();

  c.innerHTML =
    '<div class="scr-wrap">' +

      '<div class="scr-header">' +
        '<button class="btn btn-s btn-sm" id="scrFonBtnVolver">‹ Volver</button>' +
        '<div class="scr-header-right">' +
          '<div>' +
            '<div class="scr-titulo">Screening Fonológico Escolar</div>' +
            '<div class="scr-subtitulo">4–7 años · Articulación, conciencia fonológica y fluidez</div>' +
          '</div>' +
          '<span class="scr-autosave" id="scrFonAutosave"></span>' +
        '</div>' +
      '</div>' +

      _scrFonHtmlDatosEval(evalData) +

      '<div class="scr-instrucciones">' +
        '<strong>Instrucciones:</strong> Evaluá cada ítem mediante producción espontánea, ' +
        'denominación de imágenes o tareas dirigidas según el área. ' +
        'Marcá <strong>Correcto/Logrado/Adecuado</strong> si el desempeño es apropiado para la edad, ' +
        'o <strong>Error/No logrado/Alterado</strong> si hay dificultad observable.' +
      '</div>' +

      _scrFonHtmlResumen(evalData) +

      SCR_FON_AREAS.map(function(area) {
        return _scrFonHtmlArea(area, evalData);
      }).join('') +

    '</div>';

  window._scrFonVolcarCtx = { p: p, fichaId: fichaId, evalData: evalData };
  _scrFonBind(p, fichaId, evalData, c);
}

// ════════════════════════════════════════════════════════════
// 6. BIND
// ════════════════════════════════════════════════════════════
function _scrFonBind(p, fichaId, evalData, c) {
  // Botón volver
  var btnVolver = document.getElementById('scrFonBtnVolver');
  if (btnVolver) {
    btnVolver.onclick = function() {
      clearTimeout(_scrFonDebounce);
      c.innerHTML = '';
      if (typeof EVAL_ROUTER !== 'undefined' && EVAL_ROUTER.goToFichas) {
        EVAL_ROUTER.goToFichas();
      }
    };
  }

  // Botón volcar a ficha
  var btnVolcar = document.getElementById('scrFonBtnVolcar');
  if (btnVolcar) {
    btnVolcar.onclick = function() { _scrFonVolcarAFicha(p, fichaId, evalData); };
  }

  // Botones Correcto / Error
  c.querySelectorAll('.scr-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var itemId = btn.getAttribute('data-item');
      var val    = parseInt(btn.getAttribute('data-val'), 10);
      if (!evalData.items) evalData.items = {};
      if (!evalData.items[itemId]) evalData.items[itemId] = {};
      // Toggle
      if (evalData.items[itemId].v === val) {
        delete evalData.items[itemId].v;
      } else {
        evalData.items[itemId].v = val;
      }
      _scrFonRefreshItem(itemId, evalData);
      _scrFonRefreshResumen(evalData);
      _scrFonScheduleSave(p, fichaId, evalData);
    });
  });

  // Observaciones
  c.querySelectorAll('.scr-obs-ta').forEach(function(ta) {
    ta.addEventListener('input', function() {
      var itemId = ta.getAttribute('data-item');
      if (!evalData.items) evalData.items = {};
      if (!evalData.items[itemId]) evalData.items[itemId] = {};
      evalData.items[itemId].obs = ta.value;
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
      _scrFonScheduleSave(p, fichaId, evalData);
    });
  });

  // Datos de evaluación
  ['scrFonFechaEval', 'scrFonEdadEval', 'scrFonAnioEscolar'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function() {
      if (id === 'scrFonFechaEval')    evalData.fechaEval    = el.value;
      if (id === 'scrFonEdadEval')     evalData.edadEval     = el.value;
      if (id === 'scrFonAnioEscolar')  evalData.anioEscolar  = el.value;
      _scrFonScheduleSave(p, fichaId, evalData);
    });
  });

  // Focus automático en primer campo vacío
  setTimeout(function() {
    var inputs = Array.prototype.slice.call(document.querySelectorAll('.scr-datos-input'));
    var vacio = inputs.find(function(i) { return !i.value.trim(); });
    if (vacio) vacio.focus();
  }, 80);
}

function _scrFonRefreshItem(itemId, evalData) {
  var entry   = (evalData.items && evalData.items[itemId]) || {};
  var val     = entry.v;
  var itemEl  = document.querySelector('[data-item-id="' + itemId + '"]');
  if (!itemEl) return;
  itemEl.querySelectorAll('.scr-btn').forEach(function(btn) {
    var bVal = parseInt(btn.getAttribute('data-val'), 10);
    btn.classList.remove('scr-btn--active', 'scr-btn--active-a');
    if (val === 1 && bVal === 1) btn.classList.add('scr-btn--active');
    if (val === 0 && bVal === 0) btn.classList.add('scr-btn--active-a');
  });
}

function _scrFonRefreshResumen(evalData) {
  var resumenEl = document.getElementById('scrFonResumen');
  var newHTML   = _scrFonHtmlResumen(evalData);

  if (resumenEl) {
    resumenEl.outerHTML = newHTML;
  } else {
    var primerArea = document.querySelector('.scr-area');
    if (primerArea) primerArea.insertAdjacentHTML('beforebegin', newHTML);
  }

  // Re-bindear botón volcar
  var btnVolcar = document.getElementById('scrFonBtnVolcar');
  if (btnVolcar && window._scrFonVolcarCtx) {
    btnVolcar.onclick = function() {
      _scrFonVolcarAFicha(
        window._scrFonVolcarCtx.p,
        window._scrFonVolcarCtx.fichaId,
        window._scrFonVolcarCtx.evalData
      );
    };
  }

  // Actualizar stats de cada área
  SCR_FON_AREAS.forEach(function(area) {
    var r = _scrFonCalcArea(evalData, area.id);
    if (!r) return;
    var areaEl = document.getElementById('scrFonArea-' + area.id);
    if (!areaEl) return;
    var progEl   = areaEl.querySelector('.scr-area-prog');
    var interpEl = areaEl.querySelector('.scr-area-interp');
    if (progEl) progEl.textContent = r.respondidos + '/' + r.total + ' respondidos';
    if (interpEl) {
      if (r.interp) {
        interpEl.textContent      = r.interp.icon + ' ' + r.interp.label;
        interpEl.style.background = r.interp.bg;
        interpEl.style.color      = r.interp.color;
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
// 7. CONEXIÓN CON FICHA CLÍNICA
// ════════════════════════════════════════════════════════════
function _scrFonGenerarDiagnostico(g, evalData) {
  if (!g || !g.globalInterp) return '';
  var interp = g.globalInterp;
  var edad   = evalData.edadEval  ? ' (' + evalData.edadEval + ')' : '';
  var anio   = evalData.anioEscolar ? ', ' + evalData.anioEscolar : '';

  var lineas = [
    'Screening Fonológico Escolar' + edad + anio + '.',
    'Resultado global: ' + interp.icon + ' ' + interp.label + '.',
  ];

  // Áreas con riesgo
  var areasRiesgo = [];
  SCR_FON_AREAS.forEach(function(area) {
    var r = g.byArea[area.id];
    if (r && r.interp && r.pctRiesgo >= 20) {
      var nombre = area.label.replace(/[^\w\sáéíóúàèìòùäëïöüñÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÑ]/g, '').trim();
      areasRiesgo.push(nombre + ' (' + r.interp.label.toLowerCase() + ')');
    }
  });

  if (areasRiesgo.length > 0) {
    lineas.push('Áreas con dificultades: ' + areasRiesgo.join(', ') + '.');
    lineas.push('Se recomienda evaluación fonológica completa.');
  } else {
    lineas.push('Sin alteraciones significativas en el perfil fonológico evaluado.');
  }

  return lineas.join(' ');
}

function _scrFonGenerarObservaciones(g, evalData) {
  if (!g) return '';
  var lineas = [];

  SCR_FON_AREAS.forEach(function(area) {
    var r = g.byArea[area.id];
    if (!r || r.respondidos === 0) return;
    var errores = area.items.filter(function(item) {
      var entry = evalData.items && evalData.items[item.id];
      return entry && entry.v === 0;
    });
    if (errores.length > 0) {
      var nombre = area.label.replace(/[^\w\sáéíóúàèìòùäëïöüñÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÑ]/g, '').trim();
      lineas.push(nombre + ':');
      errores.forEach(function(item) {
        lineas.push('  • ' + item.texto + ' [' + item.edad + ']');
        var obs = evalData.items[item.id].obs;
        if (obs && obs.trim()) lineas.push('    → ' + obs.trim());
      });
    }
  });

  if (lineas.length === 0) return 'Sin ítems con dificultades registrados.';
  return 'Ítems con dificultades por área:\n' + lineas.join('\n');
}

function _scrFonVolcarAFicha(p, fichaId, evalData) {
  var g = _scrFonCalcGlobal(evalData);
  if (!g || !g.globalInterp) {
    toast('Completá al menos la mitad de los ítems antes de volcar', '');
    return;
  }

  var fp = S.patients.find(function(x) { return x.id === p.id; });
  if (!fp) return;
  var f = fp.fichasClinicas && fp.fichasClinicas.find(function(f) { return f.id === fichaId; });
  if (!f) return;

  var diagExiste = (f.diagnostico  || '').trim().length > 0;
  var obsExiste  = (f.observaciones || '').trim().length > 0;

  if (diagExiste || obsExiste) {
    if (!confirm('La ficha clínica ya tiene contenido en Diagnóstico u Observaciones.\n¿Reemplazar con el resultado del screening fonológico?')) return;
  }

  fichaClinicaUpdate(p.id, fichaId, {
    diagnostico:   _scrFonGenerarDiagnostico(g, evalData),
    observaciones: _scrFonGenerarObservaciones(g, evalData),
  });

  toast('✔ Resultado volcado a la ficha clínica', 'success');

  var btn = document.getElementById('scrFonBtnVolcar');
  if (btn) { btn.textContent = '✔ Volcado'; btn.disabled = true; btn.style.opacity = '0.6'; }
}

// ════════════════════════════════════════════════════════════
// 8. ESTILOS
//    Reutiliza las clases .scr-* de eval_scr_len.js.
//    Solo inyecta estilos específicos de scrFon si es necesario.
// ════════════════════════════════════════════════════════════
function _scrFonInjectStyles() {
  // Si scrLen ya inyectó sus estilos, los reutilizamos
  if (typeof _scrLenInjectStyles === 'function') {
    _scrLenInjectStyles();
    return;
  }
  // Fallback: inyectar estilos base si scrLen no está cargado
  if (document.getElementById('scrLenStyles')) return;
  var s = document.createElement('style');
  s.id  = 'scrLenStyles';
  s.textContent = [
    '.scr-wrap{padding:2px 0;display:flex;flex-direction:column;gap:16px}',
    '.scr-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}',
    '.scr-header-right{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}',
    '.scr-titulo{font-size:17px;font-weight:700;color:var(--text);font-family:var(--fd)}',
    '.scr-subtitulo{font-size:12px;color:var(--t3);margin-top:2px}',
    '.scr-datos{display:flex;gap:12px;flex-wrap:wrap;background:var(--bg2);border:1.5px solid var(--border);border-radius:var(--r);padding:14px 16px}',
    '.scr-datos-field{display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px}',
    '.scr-datos-label{font-size:12px;font-weight:600;color:var(--t3)}',
    '.scr-datos-input{border:1.5px solid var(--border);border-radius:var(--rs);padding:7px 10px;font-size:13px;font-family:inherit;color:var(--text);background:var(--bg);transition:border-color .15s}',
    '.scr-datos-input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--ag)}',
    '.scr-instrucciones{font-size:13px;color:var(--t2);line-height:1.6;background:var(--bg3);border-radius:var(--rs);padding:12px 14px;border-left:3px solid var(--accent)}',
    '.scr-area{background:var(--bg2);border:1.5px solid var(--border);border-radius:var(--r);overflow:hidden}',
    '.scr-area-header{padding:14px 16px;border-bottom:1px solid var(--border)}',
    '.scr-area-title{font-size:14px;font-weight:700;margin-bottom:6px}',
    '.scr-area-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}',
    '.scr-area-prog{font-size:11px;color:var(--t3)}',
    '.scr-area-desc{font-size:12px;color:var(--t3);font-style:italic}',
    '.scr-area-interp{display:inline-block;font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap}',
    '.scr-items{display:flex;flex-direction:column}',
    '.scr-item{padding:12px 16px;border-bottom:1px solid var(--border);transition:background .15s}',
    '.scr-item:last-child{border-bottom:none}',
    '.scr-item:hover{background:var(--bg3)}',
    '.scr-item-top{display:flex;align-items:flex-start;gap:12px;justify-content:space-between}',
    '.scr-item-text{font-size:13px;color:var(--text);line-height:1.55;flex:1}',
    '.scr-item-edad{display:inline-block;font-size:10px;font-weight:700;color:var(--t3);background:var(--bg3);border-radius:20px;padding:1px 7px;margin-right:6px;white-space:nowrap}',
    '.scr-item-btns{display:flex;gap:5px;flex-shrink:0}',
    '.scr-btn{font-size:11px;font-weight:700;padding:5px 10px;border-radius:20px;border:1.5px solid var(--border);background:var(--bg);color:var(--t2);cursor:pointer;transition:all .15s;white-space:nowrap;font-family:inherit}',
    '.scr-btn:hover{border-color:var(--accent);color:var(--accent)}',
    '.scr-btn--active{background:#D1FAE5;border-color:#059669;color:#065F46}',
    '.scr-btn--active-a{background:#FEE2E2;border-color:#DC2626;color:#991B1B}',
    '.scr-item-obs{margin-top:0;max-height:0;overflow:hidden;transition:max-height .2s}',
    '.scr-item-obs--visible{max-height:200px;margin-top:8px}',
    '.scr-obs-ta{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:var(--rs);padding:6px 10px;font-size:12px;color:var(--t2);background:var(--bg);resize:none;font-family:inherit;line-height:1.5;transition:border-color .15s}',
    '.scr-obs-ta:focus{outline:none;border-color:var(--accent)}',
    '.scr-resumen{background:var(--bg2);border:1.5px solid var(--border);border-radius:var(--r);padding:16px 18px}',
    '.scr-resumen-title{font-size:13px;font-weight:700;color:var(--t2);margin-bottom:12px;font-family:var(--fd)}',
    '.scr-resumen-interp{display:flex;align-items:center;gap:12px;border-radius:var(--rs);padding:12px 14px;margin-bottom:14px}',
    '.scr-resumen-interp-icon{font-size:22px}',
    '.scr-resumen-interp-label{font-size:15px;font-weight:700}',
    '.scr-resumen-interp-sub{font-size:12px;margin-top:2px;opacity:.8}',
    '.scr-resumen-areas{display:flex;flex-direction:column;gap:8px}',
    '.scr-resumen-area{display:flex;align-items:center;gap:10px}',
    '.scr-resumen-area-name{font-size:12px;font-weight:600;width:160px;flex-shrink:0}',
    '.scr-resumen-area-data{display:flex;align-items:center;gap:8px;flex:1}',
    '.scr-resumen-bar{flex:1;height:6px;background:var(--border);border-radius:4px;overflow:hidden}',
    '.scr-resumen-bar-fill{height:100%;border-radius:4px;transition:width .4s cubic-bezier(.4,0,.2,1)}',
    '.scr-btn-volcar{white-space:nowrap;flex-shrink:0;font-size:12px}',
    '.scr-autosave{font-size:12px;font-weight:600;color:var(--t3);padding-top:4px}',
    '.scr-autosave--ok{color:var(--ok)}',
    '.scr-autosave--saving{color:var(--t3)}',
    '.scr-autosave--saving::after{content:"···"}',
    '@media(max-width:480px){.scr-item-top{flex-direction:column;gap:8px}.scr-item-btns{width:100%;justify-content:flex-start}.scr-btn{flex:1;text-align:center}.scr-header{flex-direction:column}.scr-resumen-area{flex-wrap:wrap}.scr-resumen-area-name{width:100%}}',
  ].join('\n');
  document.head.appendChild(s);
}

// ════════════════════════════════════════════════════════════
// 9. REGISTRO EN FC_EVAL_REGISTRY
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  if (typeof FC_EVAL_REGISTRY !== 'undefined') {
    FC_EVAL_REGISTRY['p_len_scr_02'] = {
      nombre:     'Screening Fonol\u00f3gico Escolar (4\u20137 a\u00f1os)',
      area:       'lenguaje',
      tipo:       'screening',
      calcGlobal: _scrFonCalcGlobal,
      renderer:   rEvalScrFon,
    };
  }
});
