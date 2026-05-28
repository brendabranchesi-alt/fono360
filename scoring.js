// ============================================================
// scoring.js — Sistema de puntuación clínica por área
// Extraído de index_evaluaciones_v8.html
//
// DEPENDENCIAS (deben cargarse antes):
//   utils.js   → esc()
//   storage.js → saveS()
//
// CARGA: <script src="scoring.js"></script> en el <body>,
//        DESPUÉS del bloque <script> principal, para que
//        rEvaA(), delEQ() y migratePatient() estén declarados
//        cuando los IIFEs de patch se ejecutan.
//
// FUNCIONES PÚBLICAS:
//   sES(area, idx, val)                — guarda score de un ítem
//   _calcAreaScore(p, area)            — subtotal + interpretación de área
//   _calcGlobalScore(p)                — score total entre áreas activas
//   _buildScoringPanel(p, area)        — HTML del panel de scoring
//   _refreshScoringPanel(p, area)      — re-render del panel sin recargar form
//
// CONSTANTES:
//   EVA_SCORE_LABELS  — etiquetas 0–3
//   EVA_SCORE_COLORS  — colores semánticos 0–3
//   EVA_INTERP        — umbrales de interpretación clínica
// ============================================================

// ══════════════════════════════════════════════════════════════════════════════
// SCORING DE EVALUACIÓN  —  sistema de puntuación clínica por área
// ──────────────────────────────────────────────────────────────────────────────
//
// ARQUITECTURA (incremental — no modifica funciones existentes)
// ─────────────────────────────────────────────────────────────
// • p.evaluationScores[area][i] = 0|1|2|3   ← NUEVO, paralelo a evaluationAnswers
// • sEA()     → NO SE MODIFICA               ← sigue guardando texto libre
// • rEvaA()   → SE EXTIENDE con wrapper      ← inyecta panel de scoring al final
// • delEQ()   → SE EXTIENDE con wrapper      ← reindexar scores al borrar ítem
// • migratePatient → encadenado via _patchMigratePatient (patrón ya establecido)
//
// ESCALA 0–3 (estándar clínico fonoaudiológico, compatible con GRBAS/CAPE-V)
//   0 = Ausente / Normal       sin alteración observable
//   1 = Leve                   alteración presente, impacto mínimo
//   2 = Moderado               alteración evidente, impacto funcional
//   3 = Severo                 alteración marcada, impacto significativo
//
// INTERPRETACIÓN AUTOMÁTICA por área (basada en % del score máximo)
//   ≥ 80% = Normal    60–79% = Leve    40–59% = Moderado    < 40% = Severo
//   Nota: El % se invierte — mayor score = mayor alteración.
//   El umbral se aplica sobre puntos de alteración / máximo posible.
//
// PERSISTENCIA
//   Se guarda en p.evaluationScores dentro de S → saveS() lo incluye
//   automáticamente (mismo objeto paciente). Sin cambios en saveS/loadS.
//
// RIESGOS MITIGADOS
//   • Borrar un ítem desplaza indices → _patchDelEQ reindexara scores igual
//     que delEQ ya hace con evaluationAnswers.
//   • Si el profesional no puntúa → scores vacío, no se muestra interpretación.
//   • No se modifica la lógica de Deglución especial ni el Analizador de Habla.
// ══════════════════════════════════════════════════════════════════════════════

// ── Constantes del scoring ────────────────────────────────────────────────────
const EVA_SCORE_LABELS = ['Ausente','Leve','Moderado','Severo'];
const EVA_SCORE_COLORS = ['#3D9A72','#A07830','#C07030','#C04040'];
// Umbral de interpretación global (% de score sobre máximo)
// Regla: score 0 = óptimo, score 3*n = máximo alteración
const EVA_INTERP = [
  { maxPct: 20,  label: 'Normal',    color: '#3D9A72', bg: '#EEF7F2', icon: '✓' },
  { maxPct: 45,  label: 'Leve',      color: '#8A7020', bg: '#FDF5E4', icon: '▲' },
  { maxPct: 70,  label: 'Moderado',  color: '#B05010', bg: '#FDF0E4', icon: '⚠' },
  { maxPct: 101, label: 'Severo',    color: '#A02020', bg: '#FDEAEA', icon: '✕' },
];

// ── Guardar score de un ítem ──────────────────────────────────────────────────
// Función nueva — no toca sEA().
// Llamada desde los botones 0/1/2/3 en cada ítem del formulario.
function sES(area, idx, val) {
  const p = S.patients.find(x => x.id === curP); if (!p) return;
  if (!p.evaluationScores)               p.evaluationScores = {};
  if (!p.evaluationScores[area])         p.evaluationScores[area] = {};
  // Toggle: si ya tiene ese valor, borrar (deseleccionar)
  if (p.evaluationScores[area][idx] === val) {
    delete p.evaluationScores[area][idx];
  } else {
    p.evaluationScores[area][idx] = val;
  }
  saveS();
  // Re-render solo el panel de scoring (sin re-renderizar el formulario completo)
  _refreshScoringPanel(p, area);
}

// ── Calcular subtotal y score final de un área ───────────────────────────────
function _calcAreaScore(p, area) {
  const qs     = (p.evaluation && p.evaluation[area]) || [];
  const scores = (p.evaluationScores && p.evaluationScores[area]) || {};
  const n      = qs.length;
  if (n === 0) return null;

  let sum      = 0;
  let filled   = 0;
  const items  = [];

  for (let i = 0; i < n; i++) {
    const v = scores[i];
    const hasScore = v !== undefined && v !== null;
    const sv = hasScore ? Number(v) : null;
    items.push({ q: qs[i], score: sv, idx: i });
    if (hasScore) { sum += sv; filled++; }
  }

  const maxPossible = n * 3;
  const pct = maxPossible > 0 ? Math.round((sum / maxPossible) * 100) : 0;

  // Interpretación solo si al menos la mitad de ítems están puntuados
  let interp = null;
  if (filled >= Math.ceil(n / 2)) {
    interp = EVA_INTERP.find(t => pct < t.maxPct) || EVA_INTERP[EVA_INTERP.length - 1];
  }

  return { items, sum, filled, total: n, maxPossible, pct, interp };
}

// ── Calcular score global (todas las áreas activas) ──────────────────────────
function _calcGlobalScore(p) {
  if (!p || !p.evaluation) return null;
  const areas   = Object.keys(p.evaluation);
  let totalSum  = 0, totalMax = 0, areasScored = 0;
  const byArea  = {};

  areas.forEach(a => {
    const r = _calcAreaScore(p, a);
    if (!r) return;
    byArea[a] = r;
    if (r.filled > 0) {
      totalSum  += r.sum;
      totalMax  += r.maxPossible;
      areasScored++;
    }
  });

  if (areasScored === 0) return { byArea, globalInterp: null, totalSum: 0, totalMax: 0 };

  const globalPct  = totalMax > 0 ? Math.round((totalSum / totalMax) * 100) : 0;
  const globalInterp = EVA_INTERP.find(t => globalPct < t.maxPct) || EVA_INTERP[EVA_INTERP.length - 1];

  return { byArea, globalInterp, totalSum, totalMax, globalPct };
}

// ── Construir HTML del panel de scoring para un área ─────────────────────────
function _buildScoringPanel(p, area) {
  const r = _calcAreaScore(p, area);
  if (!r) return '';

  const areaColors = {
    Lenguaje:'var(--accent)', Habla:'#0D9488',
    'Deglución':'#D97706', Voz:'#DB2777', 'Audición':'#2563EB'
  };
  const acColor = areaColors[area] || 'var(--accent)';

  // Fila de botones 0–3 por ítem
  const itemRows = r.items.map(it => {
    const btns = [0,1,2,3].map(v => {
      const isOn  = it.score === v;
      const lbl   = EVA_SCORE_LABELS[v];
      const clr   = EVA_SCORE_COLORS[v];
      const bgOn  = clr + '22';
      const style = isOn
        ? `background:${bgOn};color:${clr};border-color:${clr};font-weight:700`
        : 'background:var(--bg3);color:var(--t3);border-color:var(--border)';
      return `<button class="eva-score-btn" style="${style}"
        onclick="sES('${area}',${it.idx},${v})"
        title="${lbl}">${v}</button>`;
    }).join('');

    const scoreDisplay = it.score !== null
      ? `<span style="font-size:11px;font-weight:700;color:${EVA_SCORE_COLORS[it.score]}">${EVA_SCORE_LABELS[it.score]}</span>`
      : `<span style="font-size:11px;color:var(--t3)">—</span>`;

    return `<div class="eva-score-row">
      <div class="eva-score-row-label">
        <span class="eva-score-row-num">${it.idx + 1}</span>
        <span class="eva-score-row-q">${esc(it.q)}</span>
      </div>
      <div class="eva-score-row-right">
        ${scoreDisplay}
        <div class="eva-score-btns">${btns}</div>
      </div>
    </div>`;
  }).join('');

  // Barra de progreso del subtotal
  const filledPct = r.total > 0 ? Math.round((r.filled / r.total) * 100) : 0;
  const interpBadge = r.interp
    ? `<span class="eva-score-interp-badge" style="background:${r.interp.bg};color:${r.interp.color};border-color:${r.interp.color}22">
        ${r.interp.icon} ${r.interp.label}
       </span>`
    : `<span style="font-size:11px;color:var(--t3)">Puntuá ≥ ${Math.ceil(r.total/2)} ítems para interpretación</span>`;

  return `<div class="eva-scoring-panel" id="evaScoringPanel_${area.replace(/[^a-z]/gi,'_')}">
    <div class="eva-scoring-header">
      <div class="eva-scoring-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${acColor}" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        Puntuación — ${area}
      </div>
      <div class="eva-scoring-meta">
        <span style="font-size:11px;color:var(--t3)">${r.filled}/${r.total} ítems · ${r.sum}/${r.maxPossible} pts</span>
        ${interpBadge}
      </div>
    </div>

    <div class="eva-score-legend">
      ${[0,1,2,3].map(v=>`<span class="eva-score-legend-item" style="color:${EVA_SCORE_COLORS[v]}">
        <b>${v}</b> ${EVA_SCORE_LABELS[v]}
      </span>`).join('')}
    </div>

    <div class="eva-score-rows">${itemRows}</div>

    <div class="eva-scoring-footer">
      <div style="flex:1">
        <div style="font-size:11px;color:var(--t3);margin-bottom:5px">Ítems puntuados</div>
        <div class="eva-scoring-bar-wrap">
          <div class="eva-scoring-bar-fill" style="width:${filledPct}%;background:${acColor}"></div>
        </div>
      </div>
      <div class="eva-scoring-total" style="color:${acColor}">
        <span style="font-size:22px;font-weight:800;line-height:1">${r.sum}</span>
        <span style="font-size:11px;color:var(--t3);margin-top:1px">/ ${r.maxPossible}</span>
      </div>
    </div>
  </div>`;
}

// ── Re-render solo el panel (sin re-renderizar el formulario completo) ────────
function _refreshScoringPanel(p, area) {
  const id  = 'evaScoringPanel_' + area.replace(/[^a-z]/gi, '_');
  const el  = document.getElementById(id);
  if (!el) return;  // panel no visible — no hacer nada
  const fresh = document.createElement('div');
  fresh.innerHTML = _buildScoringPanel(p, area);
  const newPanel = fresh.firstElementChild;
  if (newPanel) el.replaceWith(newPanel);
}

// ── Wrapper de rEvaA — inyecta el panel de scoring debajo del formulario ─────
// No reemplaza rEvaA. Llama al original y luego añade el panel.

// ── CSS del scoring — se inyecta directamente (solo necesita document.head) ──
(function _injectScoringCSS() {
  if (document.getElementById('eva-scoring-styles')) return; // idempotente
  const s = document.createElement('style');
  s.id = 'eva-scoring-styles';
  s.textContent = `
/* ── Panel contenedor ── */
.eva-scoring-panel {
  margin-top: 24px;
  border-top: 2px solid var(--border);
  padding-top: 20px;
}

/* ── Header del panel ── */
.eva-scoring-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.eva-scoring-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 7px;
}
.eva-scoring-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* ── Badge de interpretación ── */
.eva-score-interp-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid transparent;
}

/* ── Leyenda 0/1/2/3 ── */
.eva-score-legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--bg3);
  border-radius: var(--rs);
}
.eva-score-legend-item {
  font-size: 11.5px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.eva-score-legend-item b {
  font-size: 13px;
  font-weight: 800;
}

/* ── Filas de ítem ── */
.eva-score-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.eva-score-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--bg3);
  border-radius: var(--rs);
  transition: background 0.12s;
}
.eva-score-row:hover { background: var(--lav-50); }

.eva-score-row-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.eva-score-row-num {
  font-size: 11px;
  font-weight: 700;
  color: var(--t3);
  min-width: 18px;
  flex-shrink: 0;
}
.eva-score-row-q {
  font-size: 12.5px;
  color: var(--t2);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.eva-score-row-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Botones 0/1/2/3 ── */
.eva-score-btns {
  display: flex;
  gap: 4px;
}
.eva-score-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1.5px solid;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s, transform 0.08s;
  font-family: var(--font);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.eva-score-btn:hover {
  transform: scale(1.1);
  filter: brightness(1.08);
}
.eva-score-btn:active { transform: scale(0.95); }

/* ── Footer: barra + total ── */
.eva-scoring-footer {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 12px 14px;
  background: var(--bg3);
  border-radius: var(--rs);
}
.eva-scoring-bar-wrap {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.eva-scoring-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.35s cubic-bezier(0.4,0,0.2,1);
}
.eva-scoring-total {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}

/* ── Mobile ── */
@media (max-width: 520px) {
  .eva-score-row { flex-direction: column; align-items: flex-start; }
  .eva-score-row-right { width: 100%; justify-content: space-between; }
  .eva-score-row-q { white-space: normal; }
  .eva-scoring-header { flex-direction: column; gap: 8px; }
  .eva-score-btn { width: 36px; height: 36px; font-size: 14px; }
}
  `;
  document.head.appendChild(s);
})();

// ── Patches de integración ────────────────────────────────────────────────────
// Envueltos en DOMContentLoaded para garantizar que rEvaA(), delEQ() y
// migratePatient() ya están declarados en el bloque <script> principal
// antes de que los patches se apliquen.
// Sin este wrapper, si scoring.js se mueve al <head>, los IIFEs usarían
// window.rEvaA = undefined y los patches no tendrían efecto.
document.addEventListener('DOMContentLoaded', function _applyScoringPatches() {
  // ── Extender rEvaA con el panel de scoring ──────────────────────────────
  (function _patchREvaA() {
    const _orig = window.rEvaA || function(){};
    window.rEvaA = function(area, btn) {
      _orig.call(this, area, btn);         // renderiza el formulario existente
      // Deglución tiene su propio renderer (rEvaDeglucion) — no inyectar scoring
      const p = S.patients.find(x => x.id === curP); if (!p) return;
      if (area === 'Deglución' && !p._deglucionFullMode) return;
      // Inyectar panel de scoring después del contenido de #evC
      const evC = document.getElementById('evC');
      if (!evC) return;
      const html = _buildScoringPanel(p, area);
      if (!html) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      evC.appendChild(wrap.firstElementChild);
    };
  })();
  
  // ── Wrapper de delEQ — reindexar scores al borrar un ítem ────────────────────
  // Mismo patrón que delEQ ya usa para evaluationAnswers.

  // ── Reindexar scores al borrar ítem ─────────────────────────────────────
  (function _patchDelEQ() {
    const _orig = window.delEQ || function(){};
    window.delEQ = function(a, i) {
      // Reindexar scores ANTES de que _orig borre el ítem y re-renderice
      const p = S.patients.find(x => x.id === curP); if (!p) { _orig(a, i); return; }
      if (p.evaluationScores && p.evaluationScores[a]) {
        const sc  = p.evaluationScores[a];
        const nsc = {};
        Object.keys(sc).forEach(k => {
          const ki = parseInt(k);
          if (ki < i)  nsc[ki]     = sc[ki];
          else if (ki > i) nsc[ki-1] = sc[ki];
          // ki === i → borrado, no se copia
        });
        p.evaluationScores[a] = nsc;
        // No llamamos saveS() aquí — _orig lo hará
      }
      _orig.call(this, a, i);
    };
  })();
  
  // ── Migración: añadir p.evaluationScores = {} a pacientes existentes ─────────

  // ── Añadir evaluationScores al pipeline de migración ─────────────────────
  (function _patchMigrateForScoring() {
    const _prev = window.migratePatient || function(p){ return p; };
    window.migratePatient = function(p) {
      const migrated = _prev(p);
      if (!migrated.evaluationScores) migrated.evaluationScores = {};
      return migrated;
    };
  })();
  
  // ══════════════════════════════════════════════════════════════════════════════
  // CSS del sistema de scoring — inyectado una vez en <head> al cargar
  // ══════════════════════════════════════════════════════════════════════════════
});
