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
 * los usan otras sesiones y no deben cambiar de commit por un gate. Viven en `~/.local/share`
 * (AGENTS §1): `/var/tmp` lo barre cm-sweep y la copia compilada se perdería. La ruta va sin `~`
 * porque `q()` la entrecomilla y el shell no la expandiría. */
const TOOLS_BASE_REMOTO = '/home/dev/.local/share';
const toolsRemoto = proyecto => `${TOOLS_BASE_REMOTO}/${proyecto}/gate-tools`;
/* [por que] Margen sobre el timeout del análisis: la primera vez clona y compila la herramienta. */
const PROVISION_MS = 900_000;
/* [por que] Salidas e insumos del gate en la 89, fuera de la réplica Mutagen: `.quality-reports`
 * es local del portátil y su sync unidireccional borraría lo que escribamos ahí. */
const REPORTES_REMOTO = '/var/tmp/gate-remoto';

/* [por que] En la 89 (Linux) el repo vive en ~/.local/share y no trae workspace-manager: basta con
 * saber que la máquina es la 89 (mismo criterio que `esVps` de rcargo), sin cargar rcargo. */
export async function cargarTaller() {
  if (process.platform !== 'win32') return { esVps: () => true };
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
  if (rel.startsWith('.quality-tools/')) return `${toolsRemoto(proyecto)}/${rel.slice('.quality-tools/'.length)}`;
  if (rel === '.quality-reports' || rel.startsWith('.quality-reports/')) return `${REPORTES_REMOTO}/${proyecto}/${rel}`;
  return rel ? `${dirRemoto}/${rel}` : dirRemoto;
}

const q = valor => `'${String(valor).replace(/'/g, `'\\''`)}'`;

/* [por que] Clona y compila la herramienta en el commit fijado, solo si el `.quality-pin` no coincide.
 * Los builds van por `cm-heavy` (candado y tope de memoria del taller). El pin se escribe al final:
 * un build a medias no queda marcado como válido, y `&&` corta ante cualquier fallo. */
function aprovisiona(pin, dir) {
  const pinRemoto = q(`${dir}/.quality-pin`);
  return `[ "$(cat ${pinRemoto} 2>/dev/null)" = ${q(pin.commit)} ] || ( mkdir -p ${q(path.posix.dirname(dir))} && { [ -d ${q(`${dir}/.git`)} ] || git clone --quiet ${q(pin.repository)} ${q(dir)}; } && git -C ${q(dir)} fetch --quiet origin && git -C ${q(dir)} checkout --quiet --detach ${q(pin.commit)} && cd ${q(dir)} && cm-heavy npm ci --no-audit --no-fund && cm-heavy npm run ${q(pin.buildScript)} && ${pruebas(pin)} echo ${q(pin.commit)} > ${pinRemoto} )`;
}

/* [por que] Mismo criterio que `setup.mjs`: una herramienta sin suite declarada no añade pruebas.
 * Las pruebas van antes del pin, así un fallo deja la herramienta sin marcar como válida. */
function pruebas(pin) {
  return pin.testScript ? `cm-heavy npm run ${q(pin.testScript)} && ` : '';
}

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
    const dir = `${toolsRemoto(proyecto)}/${tool}`;
    const verifica = `[ "$(node ${q(cliRemoto)} --version 2>/dev/null)" = ${q(pin.version)} ] || { echo "${tool} no compila en la 89 (${dir})" >&2; exit 2; }`;
    const transfiere = entradas.map(local => `mkdir -p ${q(path.posix.dirname(mapear(local)))} && printf %s ${q(readFileSync(local).toString('base64'))} | base64 -d > ${q(mapear(local))}`);
    const ejecuta = `node ${remotos.map(q).join(' ')} >/dev/null; rc=$?; [ -f ${q(salidaRemota)} ] && cat ${q(salidaRemota)}; exit $rc`;
    return [`mkdir -p ${q(path.posix.dirname(salidaRemota))}`, aprovisiona(pin, dir), verifica, ...transfiere, `rm -f ${q(salidaRemota)}`, ejecuta].join(' && ');
  }, timeoutMs + PROVISION_MS);
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
