const { spawn } = require('child_process');
const path = require('path');

function run(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === 'win32' ? true : false;
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: useShell, ...opts });
    proc.on('close', (code) => {
      if (code === 0) resolve(); else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on('error', (err) => {
      console.error(`Failed to start command '${cmd}':`, err);
      reject(err);
    });
  });
}

async function main() {
  const cwd = path.resolve(__dirname, '..');
  console.log('VS Code Prompt Library: Reinstall local VSIX');
  console.log('Working directory:', cwd);

  // 1) Uninstall existing extension (ignore errors if not installed)
  console.log('\n[1/4] Uninstalling existing extension tilt.prompt-library (if present)...');
  try {
    await run('code', ['--uninstall-extension', 'tilt.prompt-library'], { cwd });
  } catch (e) {
    console.warn('Uninstall step reported an error (likely not installed). Continuing...');
  }

  // 2) Package a fresh VSIX (this compiles first)
  console.log('\n[2/4] Packaging new VSIX (npm run package:local)...');
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'package:local'], { cwd });

  // 3) Install the new VSIX
  console.log('\n[3/4] Installing VSIX...');
  const vsixPath = path.join(cwd, 'prompt-library-local.vsix');
  try {
    await run('code', ['--install-extension', vsixPath, '--force'], { cwd });
  } catch (e) {
    console.warn("Install step returned non-zero exit. If the extension shows as installed, you can ignore this. If not, install the VSIX manually via Extensions → ... → Install from VSIX...");
  }

  // 4) Reload the current VS Code window (disabled: VS Code CLI can crash Node on some platforms)
  console.log('\n[4/4] Reload step skipped. Please manually reload the VS Code window (Developer: Reload Window).');

  console.log('\nDone. The Prompt Library extension has been reinstalled.');
}

main().catch((err) => {
  console.error('Reinstall failed:', err.message || err);
  process.exit(1);
});

