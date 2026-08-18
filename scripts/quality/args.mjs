const TASK_ID_PATTERN = /^\d{2}[1-9ABC][A-Z]-\d+$/;

export function parseArgs(rawArgs) {    const options = { fresh: false, full: false, ci: false, allowHeavy: false, allowForeign: false, debug: false, profiles: [], heavyReason: null, scopeManifest: null };
  const positional = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const value = rawArgs[index];
    if (value === '--fresh') options.fresh = true;
    else if (value === '--full') options.full = true;
    else if (value === '--ci') options.ci = true;
    else if (value === '--allow-heavy') options.allowHeavy = true;
    else if (value === '--allow-foreign') options.allowForeign = true;
    else if (value === '--heavy-reason') {
      const reason = rawArgs[index + 1];
      if (!reason || reason.startsWith('--')) throw new Error('Falta valor para --heavy-reason');
      options.heavyReason = reason;
      index += 1;
    } else if (value === '--scope-manifest') {
      const manifest = rawArgs[index + 1];
      if (!manifest || manifest.startsWith('--')) throw new Error('Falta valor para --scope-manifest');
      options.scopeManifest = manifest;
      index += 1;
    } else if (value === '--debug') options.debug = true;
    else if (value === '--base') {
      options.base = rawArgs[index + 1];
      if (!options.base || options.base.startsWith('--')) throw new Error('Falta valor para --base');
      index += 1;
    } else if (value === '--profile') {
      const profile = rawArgs[index + 1];
      if (!profile || profile.startsWith('--')) throw new Error('Falta valor para --profile');
      options.profiles.push(profile);
      index += 1;
    } else if (value.startsWith('--')) throw new Error(`Opción desconocida: ${value}`);
    else positional.push(value);
  }

  if (positional.length !== 1 || !TASK_ID_PATTERN.test(positional[0])) {
    throw new Error('Uso: npm run task:check -- 297A-N [--fresh|--full|--ci|--allow-heavy|--heavy-reason "<motivo>"|--allow-foreign|--base <ref>|--profile <name>]');
  }
  return { taskId: positional[0], ...options };
}
