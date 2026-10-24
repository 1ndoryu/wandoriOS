import { readFileSync, statSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { runProcess, DEFAULT_ENV_ALLOWLIST } from '../runner.mjs';

/* [por que] Taller remoto de la VPS 89 (AGENTS §1): el portátil no compila ni analiza.
 * Se reutiliza workspace-manager (sync Mutagen + ssh). En la propia 89 esto no se usa:
 * `runEnVps` devuelve null y el adaptador ejecuta en local. */
const RCARGO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'workspace-manager', 'scripts', 'remoto');
/* [por que] Herramientas de calidad fijadas fuera de los submódulos: los submódulos de la 89
 * los usan otras sesiones y no deben cambiar de commit por un gate. Se provisionan con
 * `git archive <commit>` y un `.quality-pin` que el adaptador verifica antes de cada análisis. */
const TOOLS_REMOTO = '/var/tmp/gate-tools';
/* [por que] Salidas e insumos del gate en la 89, fuera de la réplica Mutagen: `.quality-reports`
 * es local del portátil y su sync unidireccional borraría lo que escribamos ahí. */
const REPORTES_REMOTO = '/var/tmp/gate-remoto';

export async function cargarTaller() {
  return import(pathToFileURL(path.join(RCARGO_DIR, 'rcargo.mjs')).href);
}

/* [por que] Sincroniza la réplica antes de ejecutar: sin el flush, la 89 podría validar un
 * árbol antiguo. Un fallo de Mutagen se devuelve como código 2 (infraestructura, no código roto).
 * `comando` puede ser una función que recibe `rutas` (para conocer dirRemoto). */
export async function runEnVps(context, taller, comando, timeoutMs) {
  const config = taller.cargarConfig();
  const proyecto = taller.detectarProyecto(context.projectRoot);
  const rutas = taller.rutasRemotas(config, proyecto, taller.detectarRama(context.projectRoot));
  const sync = taller.asegurarSesion({ config, proyecto, rutaLocal: context.projectRoot, rutas, cwd: context.projectRoot });
  if (sync !== 0) return { code: 2, stdout: '', stderr: `mutagen: sincronización fallida (código ${sync})`, timedOut: false, signal: null, durationMs: 0 };
  const texto = typeof comando === 'function' ? comando(rutas) : comando;
  const interno = `cd ${taller.shQuote(rutas.dirRemoto)} && ${texto}`;
  const ssh = taller.argsSsh(config, ['bash', '-lc', taller.shQuote(interno)]);
  const { BIN_SSH } = await import(pathToFileURL(path.join(RCARGO_DIR, '..', 'shared', 'binarios.mjs')).href);
  return runProcess(BIN_SSH, ssh, { cwd: context.projectRoot, timeoutMs, envAllowlist: context.adapterEnvironmentAllowlist ?? DEFAULT_ENV_ALLOWLIST });
}

function estaDentro(raiz, ruta) {
  const rel = path.relative(raiz, ruta);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/* [por que] Traduce una ruta local del proyecto a su equivalente en la 89. Las herramientas
 * (`.quality-tools/<tool>`) van al pin remoto; los informes (`.quality-reports`), fuera de la réplica. */
function rutaRemota(context, proyecto, local, dirRemoto) {
  const rel = path.relative(context.projectRoot, local).split(path.sep).join('/');
  if (rel.startsWith('.quality-tools/')) return `${TOOLS_REMOTO}/${rel.slice('.quality-tools/'.length)}`;
  if (rel === '.quality-reports' || rel.startsWith('.quality-reports/')) return `${REPORTES_REMOTO}/${proyecto}/${rel}`;
  return rel ? `${dirRemoto}/${rel}` : dirRemoto;
}

const q = valor => `'${String(valor).replace(/'/g, `'\\''`)}'`;

/* [por que] Ejecuta una herramienta estructurada (Sentinel, VarSense) en la 89 con el pin verificado.
 * Devuelve undefined si esta máquina ya es la 89 (el adaptador ejecuta en local). Su stdout se
 * escribe en `outputPath` (el informe JSON) y no viaja al log del gate. */
export async function runRemoteTool(context, { tool, args, outputPath, timeoutMs }) {
  const taller = await cargarTaller();
  if (taller.esVps()) return undefined;
  const pin = context.tools[tool];
  const proyecto = path.basename(context.projectRoot);
  await rm(outputPath, { force: true });
  const execution = await runEnVps(context, taller, (rutas) => {
    const mapear = local => rutaRemota(context, proyecto, local, rutas.dirRemoto);
    const remotos = args.map(arg => (typeof arg === 'string' && path.isAbsolute(arg) && estaDentro(context.projectRoot, arg) ? mapear(arg) : arg));
    const entradas = args.filter(arg => typeof arg === 'string' && path.isAbsolute(arg) && estaDentro(path.join(context.projectRoot, '.quality-reports'), arg) && arg !== outputPath && isFile(arg));
    const salidaRemota = mapear(outputPath);
    const cliRemoto = remotos[0];
    const toolRemoto = `${TOOLS_REMOTO}/${tool}`;
    const verifica = `[ "$(cat ${q(`${toolRemoto}/.quality-pin`)} 2>/dev/null)" = ${q(pin.commit)} ] && [ "$(node ${q(cliRemoto)} --version 2>/dev/null)" = ${q(pin.version)} ] || { echo "${tool} no fijado en la 89 (${toolRemoto}); ver RESTAURANTE/Agente/documentacion" >&2; exit 2; }`;
    const transfiere = entradas.map(local => `mkdir -p ${q(path.posix.dirname(mapear(local)))} && printf %s ${q(readFileSync(local).toString('base64'))} | base64 -d > ${q(mapear(local))}`);
    const ejecuta = `node ${remotos.map(q).join(' ')} >/dev/null; rc=$?; [ -f ${q(salidaRemota)} ] && cat ${q(salidaRemota)}; exit $rc`;
    return [`mkdir -p ${q(path.posix.dirname(salidaRemota))}`, verifica, ...transfiere, `rm -f ${q(salidaRemota)}`, ejecuta].join(' && ');
  }, timeoutMs);
  if (execution.stdout) {
    // [por que] El informe puede vivir en una carpeta que aún no existe (`.quality-reports/debug/`).
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, execution.stdout, 'utf8');
  }
  return { ...execution, stdout: '' };
}

function isFile(ruta) {
  try { return statSync(ruta).isFile(); } catch { return false; }
}
