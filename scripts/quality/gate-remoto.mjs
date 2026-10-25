#!/usr/bin/env node
/* Gate en la VPS 89 (AGENTS §1, §7): el portátil no ejecuta sentinel ni varsense.
 * [por que] Sentinel necesita git real (worktrees y ramas en su coordinador de tareas), y la
 * réplica Mutagen no lleva `.git` (14AA-1). Por eso el gate corre en un checkout propio de la 89,
 * fijado al commit empujado. Dentro de la 89 este mismo script ejecuta el gate local. */
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cargarTaller } from './adapters/remoto-vps.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/* [por que] El checkout vive en `~/.local/share` (AGENTS §1): `/var/tmp` lo barre cm-sweep. */
const REPO_REMOTO = '$HOME/.local/share/WANDORIUS/repo';

const git = (...args) => execFileSync('git', ['-C', RAIZ, ...args], { encoding: 'utf8' }).trim();

/* [por que] `npm ci` solo si hay package-lock.json en `dir` y cambió (en la 89 es caro). Sin lock, no hay deps. */
const instalaDeps = dir => `{ [ ! -f ${dir}/package-lock.json ] || { DEPS=$(sha256sum ${dir}/package-lock.json | cut -c1-64) && { [ "$(cat ${dir}/node_modules/.gate-deps 2>/dev/null)" = "$DEPS" ] || { cm-heavy npm --prefix ${dir} ci --no-audit --no-fund && echo "$DEPS" > ${dir}/node_modules/.gate-deps; }; }; }; }`;

function scriptRemoto(taller, origen, sha, args) {
  const q = taller.shQuote;
  const proyecto = path.basename(RAIZ);
  /* [por que] Herramientas: copia del clon fijado al pin (`gate-tools`), así la comprobación de
   * árbol instalado de sentinel.lock.json ve el mismo commit que en el portátil. */
  /* [por que] `.quality-pin` es marca del aprovisionamiento (remoto-vps.mjs): sin borrarla, sentinel ve el checkout sucio. */
  const herramientas = ['sentinel', 'varsense'].map(t => (
    `pin=$(node -p "require('./quality-tools.json').tools.${t}.commit") && ` +
    `{ [ "$(git -C tools/${t} rev-parse HEAD 2>/dev/null)" = "$pin" ] || { rm -rf tools/${t} && cp -a ~/.local/share/WANDORIUS/gate-tools/${t} tools/${t}; }; } && ` +
    `rm -f tools/${t}/.quality-pin`
  ));
  return [
    `[ -d ${REPO_REMOTO}/.git ] || git clone --quiet ${q(origen)} ${REPO_REMOTO}`,
    `cd ${REPO_REMOTO}`,
    `git fetch --quiet origin ${sha} || { echo "el commit ${sha.slice(0, 8)} no está en origin: empuja antes del gate" >&2; exit 2; }`,
    `git checkout --quiet -f --detach ${sha}`,
    /* [por que] El .env no viaja por git ni por Mutagen (AGENTS §2): se toma el de la réplica del taller
     * en la propia 89, donde ya está por envRemoto. Sin él, `run-with-db` no encuentra DATABASE_URL. */
    `[ -f .env ] || { [ ! -f $HOME/taller/${proyecto}/.env ] || cp -p $HOME/taller/${proyecto}/.env .env; }`,
    ...herramientas,
    instalaDeps('.'),
    instalaDeps('frontend'),
    /* [por que] Los clientes generados (`frontend/src/api/generated`) no van a git y el frontend no compila sin ellos:
     * se regeneran desde el contrato Rust (codegen-local, orval). Incremental tras la primera vez. */
    'cm-heavy node scripts/codegen-local.mjs',
    `cm-heavy node scripts/quality/gate-check.mjs ${args.map(q).join(' ')}`,
  ].join(' && ');
}

async function gateEnVps(taller, args) {
  const sha = git('rev-parse', 'HEAD');
  if (git('status', '--porcelain')) process.stderr.write(`[gate] AVISO: hay cambios sin commit; el gate valida el commit empujado ${sha.slice(0, 8)}\n`);
  const config = taller.cargarConfig();
  const { BIN_SSH } = await import(pathToFileURL(path.join(RAIZ, '..', 'workspace-manager', 'scripts', 'shared', 'binarios.mjs')).href);
  const ssh = taller.argsSsh(config, ['bash', '-lc', taller.shQuote(scriptRemoto(taller, git('remote', 'get-url', 'origin'), sha, args))]);
  return new Promise(resolve => {
    spawn(BIN_SSH, ssh, { stdio: 'inherit', windowsHide: true }).on('close', code => resolve(code ?? 2));
  });
}

const args = process.argv.slice(2);
const taller = await cargarTaller();
if (taller.esVps()) {
  // Dentro de la 89 el gate es local: el checkout ya es el de la 89.
  const hijo = spawn(process.execPath, ['scripts/quality/gate-check.mjs', ...args], { cwd: RAIZ, stdio: 'inherit' });
  hijo.on('close', code => { process.exitCode = code ?? 2; });
} else {
  process.exitCode = await gateEnVps(taller, args);
}
