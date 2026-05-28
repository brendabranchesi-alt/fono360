// ============================================================
// fichas.js — Lógica de fichas clínicas de evaluación
// Extraído de index_evaluaciones_v8.html
//
// DEPENDENCIAS (deben cargarse antes):
//   utils.js   → uid()
//   storage.js → saveS(), loadS()
//
// CARGA: <script src="fichas.js"></script> en el <body>,
//        DESPUÉS del bloque <script> principal, para que
//        migratePatient y EVAL estén declarados cuando el
//        IIFE _patchMigratePatient() se ejecuta.
//
// NO depende de: router, navegación, DOM, curP, rendering.
// FUNCIONES PÚBLICAS:
//   fichaClinicaNew(patientId, fichaRegistryId, context)
//   fichaClinicaCreate(patientId, fichaRegistryId, context)
//   fichaClinicaGet(patientId, fichaId)
//   fichaClinicaUpdate(patientId, fichaId, cambios)
//   fichaClinicaDelete(patientId, fichaId)
//   fichaClinicaList(patientId, opts)
//   fichaEstado(ficha)
//   fichaPct(ficha)
// ============================================================

// ══════════════════════════════════════════════════════════════════════════════
// FICHA_CLINICA  —  Estructura de datos para fichas clínicas de evaluación
// ──────────────────────────────────────────────────────────────────────────────
//
// DISEÑO DE DATOS
// ───────────────
// Las fichas clínicas se almacenan en p.fichasClinicas[] dentro del objeto
// paciente, siguiendo el mismo patrón que p.evaluaciones[] y p.sessions[].
//
// Ventajas de este enfoque frente a una colección separada en S:
//   • Un único saveS() persiste todo — sin riesgo de desincronización
//   • El backup JSON ya existente las incluye automáticamente
//   • El acceso por paciente es O(1): p.fichasClinicas.find(f => f.id === id)
//   • La migración lazy (añadir [] si no existe) es la misma que usan
//     p.evaluaciones, p.sessions, p.objectives, etc.
//
// RELACIÓN CON EVAL.FICHAS_REGISTRY
// ──────────────────────────────────
// EVAL.FICHAS_REGISTRY define el CATÁLOGO (qué fichas existen, por área/tipo).
// p.fichasClinicas almacena las INSTANCIAS completadas (datos reales por paciente).
// fichaRegistryId vincula cada instancia con su definición en el catálogo.
//
// CAMPOS CLÍNICOS (los 4 requeridos)
// ────────────────────────────────────
//   motivoConsulta   → texto libre, razón de derivación o consulta inicial
//   antecedentes     → historia clínica relevante (médica, familiar, evolutiva)
//   diagnostico      → impresión diagnóstica fonoaudiológica
//   observaciones    → notas clínicas adicionales, comportamiento, contexto
//
// Todos son strings vacíos por defecto — nunca null — para simplificar
// las verificaciones de "¿tiene contenido?" a un simple .trim() check.
//
// ESTADO
// ──────
// 'borrador'    → creada, sin completar
// 'en_proceso'  → al menos un campo con contenido
// 'completada'  → todos los campos con contenido
// 'archivada'   → cerrada, no editable (para cuando se agregue esa UI)
//
// La función fichaEstado(ficha) calcula el estado automáticamente desde
// el contenido real — no se guarda como campo mutable para evitar drift.
//
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. FACTORY — crea una ficha nueva con valores por defecto ─────────────────
//
// Parámetros:
//   patientId        string  — id del paciente (p.id)
//   fichaRegistryId  string  — id de la ficha en EVAL.FICHAS_REGISTRY
//                              (ej. 'p_len_scr_01'). null si es ad-hoc.
//   context          object  — contexto en que se creó (área, tipo, categoría)
//                              se copia tal cual para trazabilidad.
//
function fichaClinicaNew(patientId, fichaRegistryId, context) {
  if(!patientId) throw new Error('fichaClinicaNew: patientId es obligatorio');

  return {
    // ── Identidad ────────────────────────────────────────────────────────────
    id:              uid(),           // id único de esta instancia
    patientId:       patientId,       // vínculo al paciente
    fichaRegistryId: fichaRegistryId || null,  // vínculo al catálogo (puede ser null)

    // ── Contexto clínico en que se originó ───────────────────────────────────
    // Se guarda para poder agrupar/filtrar sin requerir el catálogo.
    context: {
      categoria: (context && context.categoria) || null,  // 'pediatrico' | 'adultos'
      area:      (context && context.area)      || null,  // 'lenguaje' | 'habla' | ...
      tipo:      (context && context.tipo)      || null,  // 'screening' | 'inicial' | ...
    },

    // ── Campos clínicos (los 4 requeridos) ───────────────────────────────────
    motivoConsulta: '',   // ¿Por qué consulta? (derivación, inquietud del paciente/familia)
    antecedentes:   '',   // Historia clínica relevante al área evaluada
    diagnostico:    '',   // Impresión diagnóstica fonoaudiológica
    observaciones:  '',   // Notas adicionales: contexto, comportamiento, condiciones

    // ── Metadatos de ciclo de vida ────────────────────────────────────────────
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
    // 'completada' y 'archivada' no se guardan — se derivan con fichaEstado()

    // ── Reservado para extensiones futuras ────────────────────────────────────
    // Estos campos se agregan aquí —vacíos— para que las versiones futuras
    // de fichaEstado() y el renderer los encuentren sin necesidad de migración.
    _version: 1,   // schema version — incrementar si cambia la estructura
  };
}

// ── 2. ESTADO DERIVADO — calcula el estado desde el contenido real ────────────
//
// No se persiste: siempre se recalcula. Así el estado refleja la realidad
// sin riesgo de que un bug lo deje desincronizado con el contenido.
//
// Retorna: 'borrador' | 'en_proceso' | 'completada' | 'archivada'
//
function fichaEstado(ficha) {
  if(!ficha) return 'borrador';

  // Campo archivada explícito (futuro — cuando se agregue esa acción)
  if(ficha.archivada) return 'archivada';

  const campos = [
    ficha.motivoConsulta,
    ficha.antecedentes,
    ficha.diagnostico,
    ficha.observaciones,
  ];

  const llenos = campos.filter(v => (v || '').trim().length > 0).length;

  if(llenos === 0)           return 'borrador';
  if(llenos === campos.length) return 'completada';
  return 'en_proceso';
}

// ── 3. PROGRESO — porcentaje de campos completados (0–100) ───────────────────
//
// Útil para barras de progreso en la UI sin necesidad de lógica adicional.
//
function fichaPct(ficha) {
  if(!ficha) return 0;
  const campos = [
    ficha.motivoConsulta,
    ficha.antecedentes,
    ficha.diagnostico,
    ficha.observaciones,
  ];
  const llenos = campos.filter(v => (v || '').trim().length > 0).length;
  return Math.round((llenos / campos.length) * 100);
}

// ── 4. CRUD — operaciones sobre p.fichasClinicas[] ───────────────────────────

// Garantiza que p.fichasClinicas existe (migración lazy, sin romper pacientes
// creados antes de esta versión — igual que p.evaluaciones || []).
function _ensureFichas(p) {
  if(!p.fichasClinicas) p.fichasClinicas = [];
}

// Crear y persistir una nueva ficha. Devuelve la ficha creada.
function fichaClinicaCreate(patientId, fichaRegistryId, context) {
  const p = S.patients.find(x => x.id === patientId);
  if(!p) { console.warn('fichaClinicaCreate: paciente no encontrado', patientId); return null; }

  _ensureFichas(p);
  const ficha = fichaClinicaNew(patientId, fichaRegistryId, context);
  p.fichasClinicas.push(ficha);
  saveS();

  // Disparar hook existente si está registrado
  EVAL.fire('onEvalSaved', { _type: 'fichaClinica', fichaId: ficha.id, patientId });

  return ficha;
}

// Leer una ficha por id. Devuelve el objeto o null.
function fichaClinicaGet(patientId, fichaId) {
  const p = S.patients.find(x => x.id === patientId);
  if(!p) return null;
  _ensureFichas(p);
  return p.fichasClinicas.find(f => f.id === fichaId) || null;
}

// Actualizar campos de una ficha. Solo actualiza las claves presentes en
// `cambios` — no reemplaza la ficha completa.
// Uso: fichaClinicaUpdate(patientId, fichaId, { motivoConsulta: '...' })
function fichaClinicaUpdate(patientId, fichaId, cambios) {
  const p = S.patients.find(x => x.id === patientId);
  if(!p) return false;
  _ensureFichas(p);

  const idx = p.fichasClinicas.findIndex(f => f.id === fichaId);
  if(idx < 0) return false;

  // Solo permite actualizar los campos del schema — nunca id, patientId ni _version
  const CAMPOS_EDITABLES = ['motivoConsulta', 'antecedentes', 'diagnostico', 'observaciones', 'archivada'];
  const delta = {};
  CAMPOS_EDITABLES.forEach(k => { if(k in cambios) delta[k] = cambios[k]; });

  Object.assign(p.fichasClinicas[idx], delta, { updatedAt: new Date().toISOString() });
  saveS();
  return true;
}

// Eliminar una ficha por id. Devuelve true si se eliminó.
function fichaClinicaDelete(patientId, fichaId) {
  const p = S.patients.find(x => x.id === patientId);
  if(!p) return false;
  _ensureFichas(p);

  const before = p.fichasClinicas.length;
  p.fichasClinicas = p.fichasClinicas.filter(f => f.id !== fichaId);
  if(p.fichasClinicas.length === before) return false;

  saveS();
  return true;
}

// Listar fichas de un paciente, con filtros opcionales.
// Opciones: { area, tipo, categoria, estado }
// Retorna array ordenado por updatedAt desc (más reciente primero).
function fichaClinicaList(patientId, opts) {
  const p = S.patients.find(x => x.id === patientId);
  if(!p) return [];
  _ensureFichas(p);

  let fichas = p.fichasClinicas.slice();

  if(opts) {
    if(opts.area)      fichas = fichas.filter(f => f.context.area      === opts.area);
    if(opts.tipo)      fichas = fichas.filter(f => f.context.tipo      === opts.tipo);
    if(opts.categoria) fichas = fichas.filter(f => f.context.categoria === opts.categoria);
    if(opts.estado)    fichas = fichas.filter(f => fichaEstado(f)      === opts.estado);
  }

  return fichas.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

// ── 5. MIGRACIÓN — se ejecuta en loadS() junto a migratePatient ──────────────
//
// Añade p.fichasClinicas = [] a pacientes existentes sin romper nada.
// Patrón idéntico a migratePatient (línea 5311).
//
function migrateFichasClinicas(p) {
  _ensureFichas(p);

  // Reparación de integridad: fichas sin patientId heredan el del paciente
  let dirty = false;
  p.fichasClinicas = p.fichasClinicas.map(f => {
    if(!f.patientId) { dirty = true; return { ...f, patientId: p.id }; }
    // Schema v1 → añadir campos faltantes sin perder datos existentes
    if(f._version === undefined) {
      dirty = true;
      return {
        motivoConsulta: '',
        antecedentes:   '',
        diagnostico:    '',
        observaciones:  '',
        ...f,           // los campos existentes sobreescriben los defaults
        _version: 1,
      };
    }
    return f;
  });

  if(dirty) saveS();
  return p;
}

// ── 6. CONECTAR migración al pipeline de loadS ────────────────────────────────
//
// migratePatient ya es llamado en loadS() sobre cada paciente.
// Extendemos su resultado encadenando migrateFichasClinicas.
// Usamos el patrón de wrapping para no modificar la función original.
//

// ── 6. CONECTAR migración al pipeline de loadS ────────────────────────────────
// Envuelto en DOMContentLoaded para garantizar que migratePatient
// ya está declarado en el <script> principal antes de que el patch
// se aplique. Sin este wrapper, cargar fichas.js en <head> haría
// que el IIFE sobreescriba window.migratePatient con el fallback,
// y luego el <script> principal lo volvería a sobreescribir sin el patch.
//
document.addEventListener('DOMContentLoaded', function _applyFichasMigrationPatch() {
  (function _patchMigratePatient() {
    const _original = window.migratePatient || function(p){ return p; };
    window.migratePatient = function(p) {
      return migrateFichasClinicas(_original(p));
    };
  })();
});

// ── 7. ENGANCHE al hook onFichaSelected (reservado en EVAL.hooks) ─────────────
//
// Cuando la UI implemente la apertura de una ficha existente,
// este hook recibirá el fichaId y podrá cargar fichaClinicaGet().
// Por ahora se deja como stub documentado — no-op.
//
// Para activarlo desde la UI futura:
//   EVAL.hooks.onFichaSelected = (fichaId, categoria, area, tipo) => {
//     const ficha = fichaClinicaGet(curP, fichaId);
//     // ... renderizar formulario con los datos de `ficha`
//   };
