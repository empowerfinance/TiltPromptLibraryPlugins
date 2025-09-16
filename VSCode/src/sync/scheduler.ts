import * as vscode from 'vscode';
import { fetch } from './git';
import { getSettings, onSettingsChanged } from '../settings';
import { log } from '../log';

let timer: NodeJS.Timer | null = null;

function schedule() {
  if (timer) {
    clearInterval(timer as any);
    timer = null;
  }
  const cfg = getSettings();
  if (!cfg.autoFetch?.enabled) {
    log.info('Auto-fetch disabled');
    return;
  }
  const minutes = Math.max(1, Number(cfg.autoFetch.minutes || 5));
  const repoPath = cfg.repoPath;
  if (!repoPath) {
    log.warn('Auto-fetch is enabled but repoPath is not set');
    return;
  }
  const intervalMs = minutes * 60 * 1000;
  log.info(`Auto-fetch enabled: every ${minutes}m`);
  timer = setInterval(async () => {
    try {
      const ok = await fetch(repoPath);
      if (ok) {
        log.info('Auto-fetch: fetch completed');
      } else {
        log.warn('Auto-fetch: fetch failed');
      }
    } catch (e: any) {
      log.error(`Auto-fetch error: ${e?.message || e}`);
    }
  }, intervalMs);
}

export function start(context: vscode.ExtensionContext) {
  schedule();
  const disp = onSettingsChanged(() => schedule());
  context.subscriptions.push(disp);
  context.subscriptions.push({ dispose: () => { if (timer) { clearInterval(timer as any); timer = null; } } });
}

