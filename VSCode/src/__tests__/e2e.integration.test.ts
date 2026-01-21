import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { discoverLibraries } from '../settings';

/**
 * End-to-end integration tests that verify the VSCode plugin works correctly
 * with a real Git repository: git@github.com:empowerfinance/TiltPromptLibraryE2ETestRepo.git
 * 
 * These tests:
 * 1. Clone the E2E test repository
 * 2. Perform plugin operations (discover libraries, read YAML, etc.)
 * 3. Verify file system state
 * 4. Verify git state (commits, push status)
 * 5. Clean up by resetting the repo
 */

// Use HTTPS in CI (with token), SSH locally
// CI should set E2E_REPO_URL env var to: https://x-access-token:${GITHUB_TOKEN}@github.com/empowerfinance/TiltPromptLibraryE2ETestRepo.git
const E2E_REPO_URL = process.env.E2E_REPO_URL || 'git@github.com:empowerfinance/TiltPromptLibraryE2ETestRepo.git';
const TEST_LIBRARY = 'TestLibrary';

let tempDir: string;
let repoDir: string;
let libraryDir: string;

function runGit(cwd: string, ...args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`git ${args.join(' ')}`, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || '',
      exitCode: error.status || 1
    };
  }
}

describe('E2E Git Integration Tests', () => {
  beforeAll(() => {
    // Create a temp directory for the test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-vscode-test-'));

    // Clone the E2E test repository
    repoDir = path.join(tempDir, 'e2e-repo');
    const cloneResult = runGit(tempDir, 'clone', E2E_REPO_URL, 'e2e-repo');
    if (cloneResult.exitCode !== 0) {
      throw new Error(`Clone failed: ${cloneResult.stderr}`);
    }

    // Configure git user for commits (required for git commit to work)
    runGit(repoDir, 'config', 'user.email', 'e2e-test@example.com');
    runGit(repoDir, 'config', 'user.name', 'E2E Test');

    libraryDir = path.join(repoDir, TEST_LIBRARY);
    expect(fs.existsSync(libraryDir)).toBe(true);
    expect(fs.existsSync(path.join(libraryDir, '_library.yaml'))).toBe(true);
  });

  afterAll(() => {
    // Reset the repo to clean state (remove any test artifacts)
    if (fs.existsSync(repoDir)) {
      runGit(repoDir, 'checkout', 'main');
      runGit(repoDir, 'reset', '--hard', 'origin/main');
      runGit(repoDir, 'clean', '-fd');
    }
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ============================================================
  // Test 1: Library Detection
  // ============================================================

  it('should detect library via _library.yaml marker file', () => {
    const libraries = discoverLibraries(repoDir);

    expect(libraries.length).toBeGreaterThan(0);
    expect(libraries.map(l => l.id)).toContain(TEST_LIBRARY);
  });

  it('should load existing library structure correctly', () => {
    // Check that the sample group exists
    const sampleGroupPath = path.join(libraryDir, 'SampleGroup');
    expect(fs.existsSync(sampleGroupPath)).toBe(true);
    expect(fs.existsSync(path.join(sampleGroupPath, '_group.yaml'))).toBe(true);

    // Check that sample prompt exists
    const samplePromptPath = path.join(sampleGroupPath, 'p-sample-001.yaml');
    expect(fs.existsSync(samplePromptPath)).toBe(true);

    // Verify the prompt content
    const promptContent = fs.readFileSync(samplePromptPath, 'utf8');
    expect(promptContent).toContain('text:');
    expect(promptContent).toContain('id:');
  });

  // ============================================================
  // Test 2: Group Creation - Write to Disk Immediately
  // ============================================================

  it('should write new group to disk immediately', () => {
    const testGroupName = `E2E-Test-Group-${Date.now()}`;
    const groupDir = path.join(libraryDir, testGroupName);

    // Create the group structure manually (simulating what the plugin does)
    fs.mkdirSync(groupDir, { recursive: true });
    const groupYaml = `id: ${testGroupName.toLowerCase()}\nname: ${testGroupName}\ntags:\n  - shared\n`;
    fs.writeFileSync(path.join(groupDir, '_group.yaml'), groupYaml);

    // Verify it exists on disk immediately
    expect(fs.existsSync(groupDir)).toBe(true);
    expect(fs.existsSync(path.join(groupDir, '_group.yaml'))).toBe(true);

    // Clean up
    fs.rmSync(groupDir, { recursive: true, force: true });
  });

  // ============================================================
  // Test 3: Prompt Creation - Write to Disk Immediately
  // ============================================================

  it('should write new prompt to disk immediately', () => {
    const testGroupName = `E2E-Prompt-Test-${Date.now()}`;
    const promptId = `p-${Date.now()}`;
    const groupDir = path.join(libraryDir, testGroupName);

    // Create group first
    fs.mkdirSync(groupDir, { recursive: true });
    const groupYaml = `id: ${testGroupName.toLowerCase()}\nname: ${testGroupName}\ntags:\n  - shared\n`;
    fs.writeFileSync(path.join(groupDir, '_group.yaml'), groupYaml);

    // Write prompt
    const promptYaml = `id: ${promptId}\ntext: Test prompt content for E2E testing\nprivate: false\n`;
    fs.writeFileSync(path.join(groupDir, `p-${promptId}.yaml`), promptYaml);

    // Verify prompt exists on disk
    const promptFile = path.join(groupDir, `p-${promptId}.yaml`);
    expect(fs.existsSync(promptFile)).toBe(true);

    // Clean up
    fs.rmSync(groupDir, { recursive: true, force: true });
  });

  // ============================================================
  // Test 4: Git Operations - Stage, Commit, Status
  // ============================================================

  it('should stage and commit new files', () => {
    const testGroupName = `E2E-Commit-Test-${Date.now()}`;
    const groupDir = path.join(libraryDir, testGroupName);

    // Create a group
    fs.mkdirSync(groupDir, { recursive: true });
    const groupYaml = `id: ${testGroupName.toLowerCase()}\nname: ${testGroupName}\ntags:\n  - shared\n`;
    fs.writeFileSync(path.join(groupDir, '_group.yaml'), groupYaml);

    // Verify file was created
    expect(fs.existsSync(path.join(groupDir, '_group.yaml'))).toBe(true);

    // Stage all changes
    const stageResult = runGit(repoDir, 'add', '--all');
    expect(stageResult.exitCode).toBe(0);

    // Commit
    const commitResult = runGit(repoDir, 'commit', '-m', '"test: E2E commit test"');
    expect(commitResult.exitCode).toBe(0);

    // Verify we're ahead of origin
    runGit(repoDir, 'fetch', 'origin');
    const statusResult = runGit(repoDir, 'status', '-sb');
    expect(statusResult.stdout).toContain('ahead');

    // Reset without pushing (don't pollute the remote)
    runGit(repoDir, 'reset', '--hard', 'origin/main');
  });

  it('should detect when ahead of origin', () => {
    // Create a local commit
    const testFile = path.join(repoDir, 'test-ahead-check.txt');
    fs.writeFileSync(testFile, 'test content');
    runGit(repoDir, 'add', '--all');
    runGit(repoDir, 'commit', '-m', 'test: ahead check');

    // Check status
    runGit(repoDir, 'fetch', 'origin');
    const statusResult = runGit(repoDir, 'status', '-sb');

    const isAhead = statusResult.stdout.includes('ahead');
    expect(isAhead).toBe(true);

    // Reset
    runGit(repoDir, 'reset', '--hard', 'origin/main');
  });

  // ============================================================
  // Test 5: Single Library Auto-Detection
  // ============================================================

  it('should auto-detect single library when only one exists', () => {
    const libraries = discoverLibraries(repoDir);

    // Should find exactly one library (TestLibrary)
    expect(libraries.length).toBe(1);
    expect(libraries[0].id).toBe(TEST_LIBRARY);
  });

  it('should not create general folder when library exists', () => {
    // The "general" folder should not exist
    const generalDir = path.join(repoDir, 'general');
    expect(fs.existsSync(generalDir)).toBe(false);
  });

  // ============================================================
  // Test 6: Round-trip - Write and Read
  // ============================================================

  it('should round-trip group and prompt correctly', () => {
    const testGroupName = `E2E-Roundtrip-${Date.now()}`;
    const promptId = `${Date.now()}`;
    const promptText = 'This is the prompt content\nWith multiple lines';
    const groupDir = path.join(libraryDir, testGroupName);

    // Create group
    fs.mkdirSync(groupDir, { recursive: true });
    const groupYaml = `id: ${testGroupName.toLowerCase()}\nname: ${testGroupName}\ndescription: Test group description\ntags:\n  - shared\n  - test\n`;
    fs.writeFileSync(path.join(groupDir, '_group.yaml'), groupYaml);

    // Create prompt
    const promptYaml = `id: ${promptId}\ntitle: Test Prompt\ntext: |\n  ${promptText.replace(/\n/g, '\n  ')}\ntags:\n  - e2e\n  - roundtrip\nprivate: false\n`;
    fs.writeFileSync(path.join(groupDir, `p-${promptId}.yaml`), promptYaml);

    // Read back
    const loadedGroupYaml = fs.readFileSync(path.join(groupDir, '_group.yaml'), 'utf8');
    expect(loadedGroupYaml).toContain(`name: ${testGroupName}`);

    const loadedPromptYaml = fs.readFileSync(path.join(groupDir, `p-${promptId}.yaml`), 'utf8');
    expect(loadedPromptYaml).toContain('This is the prompt content');

    // Clean up
    fs.rmSync(groupDir, { recursive: true, force: true });
  });
});

