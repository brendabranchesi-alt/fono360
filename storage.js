// ============================================================
// storage.js — Capa de persistencia de FONO360
// Extraído de index_evaluaciones_v8.html
//
// RESPONSABILIDADES:
//   storageKey()  — calcula la clave localStorage por usuario
//   loadS()       — carga y migra el estado S desde localStorage
//   saveS()       — persiste S en localStorage + dispara Firestore sync
//
// DEPENDENCIAS GLOBALES (resueltas en tiempo de ejecución):
//   S                — estado global (declarado en el <script> main)
//   currentUserEmail — email del usuario autenticado
//   migratePatient   — función de migración de datos de paciente
//   showAutoSave     — indicador visual (utils.js)
//   _fbConfigured    — flag de Firebase
//   _fbSyncing       — flag anti-loop de sync
//   saveSFirestore   — persistencia Firestore (declarada en main)
//
// KEYS DE localStorage (no se cambian):
//   'f360_d_<email>'  — datos principales del usuario (storageKey())
//   'f360_d'          — key legacy (migración automática en loadS)
//
// CARGA: <script src="storage.js"></script>
//   Debe ir DESPUÉS de utils.js y ANTES del <script> main.
//   Las funciones se definen aquí pero se invocan desde el main,
//   cuando todas las variables globales ya existen.
// ============================================================

// ── Clave de almacenamiento por usuario ──────────────────────
// Cada usuario tiene su propia "caja" de datos en localStorage,
// identificada por su email. Así, si varios profesionales comparten
// el mismo dispositivo, no se pisan los datos.
// Cada usuario tiene su propia "caja" de datos en localStorage, identificada por su email.
// Así, si varios profesionales comparten el mismo dispositivo, no se pisan los datos;
// y si el mismo usuario vuelve a ingresar con su email en otro dispositivo, el sistema
// lee su caja propia (en ese dispositivo).
function storageKey(){return 'f360_d_'+(currentUserEmail||'default')}

// ── Cargar estado desde localStorage ────────────────────────
function loadS(){
  try{
    const key=storageKey();
    let d=localStorage.getItem(key);
    // Migración desde la versión sin email: si existía f360_d y todavía no hay datos
    // para este email, lo copiamos a la caja del email actual.
    if(!d){
      const legacy=localStorage.getItem('f360_d');
      if(legacy){
        localStorage.setItem(key,legacy);
        d=legacy;
      }
    }
    if(d)S=JSON.parse(d);
    ['patients','finances','turnos','analyzerSessions'].forEach(k=>{if(!S[k])S[k]=[]});
    if(!S.settings)S.settings={name:'',license:'',signature:'',bgTheme:'default',sidebarTheme:'slate',profilePhoto:'',wallpaper:'',googleScriptUrl:'',googleCalendarId:'primary',googleSyncEnabled:false,meetAutoCreate:false,emailConfirmEnabled:false};
    if(S.settings.googleScriptUrl===undefined)S.settings.googleScriptUrl='';
    if(S.settings.googleCalendarId===undefined)S.settings.googleCalendarId='primary';
    if(S.settings.googleSyncEnabled===undefined)S.settings.googleSyncEnabled=false;
    if(S.settings.meetAutoCreate===undefined)S.settings.meetAutoCreate=false;
    if(S.settings.emailConfirmEnabled===undefined)S.settings.emailConfirmEnabled=false;
    if(!S.settings.bgTheme)S.settings.bgTheme='default';
    if(!S.settings.sidebarTheme)S.settings.sidebarTheme='slate';
    if(S.settings.profilePhoto===undefined)S.settings.profilePhoto='';
    if(S.settings.wallpaper===undefined)S.settings.wallpaper='';
    if(!S.account)S.account={email:currentUserEmail};
    // Migración: pacientes sin areasActivas reciben todas las áreas compatibles
    S.patients=S.patients.map(migratePatient);
  }catch(e){}
}

// ── Guardar estado en localStorage ──────────────────────────
function saveS(){
  try{
    S.lastSaved=new Date().toISOString();
    localStorage.setItem(storageKey(),JSON.stringify(S));
    showAutoSave();
    // Sync a Firestore en background
    if(_fbConfigured){
      _fbSyncing=true;
      saveSFirestore().finally(()=>{_fbSyncing=false;});
    }
  }catch(e){}
}

// ── Wrappers de datos de pacientes ─────────────────────────────────────────
// La app persiste todo como un único blob S en localStorage.
// Estos wrappers exponen una API granular sobre S.patients y S.evaluaciones
// sin cambiar la estructura de datos ni las keys de localStorage.

// Devuelve el array de pacientes del estado global.
// Lectura pura — no llama a loadS (S ya está en memoria tras el login).
function loadPatients() {
  return S.patients || [];
}

// Reemplaza el array completo de pacientes y persiste.
// Uso: cuando se importa o reemplaza la lista completa.
// Para modificar un paciente individual, modificar S directamente y llamar saveS().
function savePatients(patients) {
  S.patients = patients || [];
  saveS();
}

// Devuelve las evaluaciones estandarizadas de un paciente (p.evaluaciones[]).
// Distinto de p.evaluation (objeto de áreas) y p.evaluationAnswers.
// pid: id del paciente.
function loadEvaluations(pid) {
  const p = (S.patients || []).find(x => x.id === pid);
  return p ? (p.evaluaciones || []) : [];
}

// Reemplaza el array de evaluaciones estandarizadas de un paciente y persiste.
// Solo toca p.evaluaciones — no modifica p.evaluation ni p.evaluationAnswers.
function saveEvaluations(pid, evaluaciones) {
  const p = (S.patients || []).find(x => x.id === pid);
  if (!p) return false;
  p.evaluaciones = evaluaciones || [];
  saveS();
  return true;
}

// ── Wrappers de sesión de autenticación ────────────────────────────────────
// Centralizan las keys 'f360_session' y 'f360_last_email'.
// No contienen lógica de auth — solo lectura/escritura de las keys.

// Lee la sesión activa. Devuelve { email, mode } o null.
function loadSession() {
  try {
    const raw = localStorage.getItem('f360_session');
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

// Persiste la sesión si remember=true, o la borra si remember=false.
// Siempre persiste el último email usado (para pre-rellenar el login).
function saveSession(email, mode, remember) {
  try {
    localStorage.setItem('f360_last_email', email);
    if (remember) {
      localStorage.setItem('f360_session', JSON.stringify({ email, mode }));
    } else {
      localStorage.removeItem('f360_session');
    }
  } catch(e) {}
}

// Borra la sesión activa (logout).
function clearSession() {
  try { localStorage.removeItem('f360_session'); } catch(e) {}
}

// Lee el último email usado (para pre-rellenar el campo de login).
function loadLastEmail() {
  try { return localStorage.getItem('f360_last_email') || ''; } catch(e) { return ''; }
}

// ── Wrappers de backup en cloud (PRO) ──────────────────────────────────────
// Centralizan la key 'f360_cloud' usada por doSync() y restoreFromCloud().

// Guarda el estado S serializado como backup de cloud.
function saveCloudBackup() {
  try { localStorage.setItem('f360_cloud', JSON.stringify(S)); } catch(e) {}
}

// Lee el backup de cloud. Devuelve el objeto S deserializado o null.
function loadCloudBackup() {
  try {
    const raw = localStorage.getItem('f360_cloud');
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}
