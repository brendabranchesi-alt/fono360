// ============================================================
// utils.js — Utilidades UI reutilizables de FONO360
// Extraído de index_evaluaciones_v8.html
//
// DEPENDENCIAS: ninguna — funciones puras o DOM genérico.
// CARGA: <script src="utils.js"></script> antes del cierre
//        de </body>, ANTES del bloque <script> principal.
//
// FUNCIONES:
//   Validación      : validEmail
//   Formato / texto : uid, fmt, td, ini, $, esc
//   UI / DOM        : toast, opM, clM, showAutoSave
//   HTML helpers    : proLockHTML
//
// NO MOVIDAS (dependen del core):
//   chkBk()   — lee S.lastBackup (estado global)
//   calcAge() — DOM específico del modal de paciente
// ============================================================

// ── Validación ─────────────────────────────────────────────

function validEmail(e){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)}

// ── Formato y texto ─────────────────────────────────────────

function uid(){return Date.now().toString(36)+Math.random().toString(36).substr(2,5)}
function fmt(d){if(!d)return'';return new Date(d+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'})}
function td(){return new Date().toISOString().split('T')[0]}
function ini(n){return(n||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substr(0,2)}
function $(n){return(Number(n)||0).toLocaleString('es-AR')}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

// ── UI: toast y modales ─────────────────────────────────────

function toast(m,t=''){const e=document.getElementById('toast');e.textContent=m;e.className='toast show '+t;setTimeout(()=>e.classList.remove('show'),3000)}
function opM(id){const m=document.getElementById(id);m.classList.add('on');
  // Click backdrop to close
  m.onclick=function(e){if(e.target===m)clM(id)};
}
function clM(id){document.getElementById(id).classList.remove('on')}

// ── UI: indicadores de estado ───────────────────────────────

function showAutoSave(){const el=document.getElementById('autoSave');if(!el)return;el.classList.add('show');clearTimeout(window._asTm);window._asTm=setTimeout(()=>el.classList.remove('show'),1800)}

// ── HTML helpers ─────────────────────────────────────────────

function proLockHTML(msg){return '<div class="pro-lock"><div class="pro-lock-icon">🔒</div><div class="pro-lock-text">Disponible en versión PRO 🔒</div><div class="pro-lock-sub">'+(msg||'Actualizá tu plan para acceder')+'</div></div>'}
