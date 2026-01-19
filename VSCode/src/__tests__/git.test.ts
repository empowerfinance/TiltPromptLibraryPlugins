import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as git from '../sync/git';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

import { spawn } from 'child_process';
import * as fs from 'fs';

describe('git', () => {
  let mockProc: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock process with event emitters
    mockProc = new EventEmitter();
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();

    vi.mocked(spawn).mockReturnValue(mockProc as any);

    // Mock fs.existsSync to return true for /usr/bin/git (so getGitPath works)
    // and false for everything else by default
    vi.mocked(fs.existsSync).mockImplementation((path: any) => {
      return path === '/usr/bin/git';
    });
  });

  describe('runGit', () => {
    it('should execute git command and return result', async () => {
      const promise = git.runGit('/test/path', ['status']);

      // Simulate git output
      mockProc.stdout.emit('data', Buffer.from('On branch main\n'));
      mockProc.emit('close', 0);

      const result = await promise;

      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['status'], { cwd: '/test/path', shell: false });
      expect(result.code).toBe(0);
      expect(result.stdout).toBe('On branch main\n');
      expect(result.stderr).toBe('');
    });

    it('should capture stderr output', async () => {
      const promise = git.runGit('/test/path', ['status']);

      mockProc.stderr.emit('data', Buffer.from('Error message\n'));
      mockProc.emit('close', 1);

      const result = await promise;

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('Error message\n');
    });

    it('should handle null exit code', async () => {
      const promise = git.runGit('/test/path', ['status']);

      mockProc.emit('close', null);

      const result = await promise;

      expect(result.code).toBe(-1);
    });
  });

  describe('isGitRepo', () => {
    it('should return true for valid git repo', async () => {
      const promise = git.isGitRepo('/test/repo');

      mockProc.stdout.emit('data', Buffer.from('true\n'));
      mockProc.emit('close', 0);

      const result = await promise;

      expect(result.isRepo).toBe(true);
      expect(result.error).toBeUndefined();
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['rev-parse', '--is-inside-work-tree'], expect.any(Object));
    });

    it('should return false for non-git directory', async () => {
      const promise = git.isGitRepo('/test/not-repo');

      mockProc.stderr.emit('data', Buffer.from('fatal: not a git repository\n'));
      mockProc.emit('close', 128);

      const result = await promise;

      expect(result.isRepo).toBe(false);
      expect(result.error).toContain('Not a git repository');
    });

    it('should return false if output is not "true"', async () => {
      const promise = git.isGitRepo('/test/repo');

      mockProc.stdout.emit('data', Buffer.from('false\n'));
      mockProc.emit('close', 0);

      const result = await promise;

      expect(result.isRepo).toBe(false);
    });

    it('should return false with helpful error when git is not installed', async () => {
      const promise = git.isGitRepo('/test/repo');

      const error = new Error('spawn git ENOENT');
      (error as any).code = 'ENOENT';
      mockProc.emit('error', error);

      const result = await promise;

      expect(result.isRepo).toBe(false);
      expect(result.error).toContain('Failed to spawn git');
      expect(result.error).toContain('ENOENT');
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      const promise = git.getCurrentBranch('/test/repo');

      mockProc.stdout.emit('data', Buffer.from('main\n'));
      mockProc.emit('close', 0);

      const result = await promise;

      expect(result).toBe('main');
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['rev-parse', '--abbrev-ref', 'HEAD'], expect.any(Object));
    });

    it('should return null on error', async () => {
      const promise = git.getCurrentBranch('/test/repo');

      mockProc.emit('close', 1);

      const result = await promise;

      expect(result).toBeNull();
    });
  });

  describe('stageAll', () => {
    it('should stage all changes', async () => {
      const promise = git.stageAll('/test/repo');

      mockProc.emit('close', 0);

      await promise;

      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['add', '-A'], expect.any(Object));
    });
  });

  describe('commit', () => {
    it('should commit with message', async () => {
      const promise = git.commit('/test/repo', 'Test commit');

      mockProc.emit('close', 0);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.nothingToCommit).toBeUndefined();
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['commit', '-m', 'Test commit'], expect.any(Object));
    });

    it('should return success when nothing to commit', async () => {
      const promise = git.commit('/test/repo', 'Test commit');

      mockProc.stdout.emit('data', Buffer.from('nothing to commit, working tree clean\n'));
      mockProc.emit('close', 1);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.nothingToCommit).toBe(true);
    });

    it('should return error on other failures', async () => {
      const promise = git.commit('/test/repo', 'Test commit');

      mockProc.stderr.emit('data', Buffer.from('fatal: not a git repository\n'));
      mockProc.emit('close', 128);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a git repository');
    });
  });

  describe('push', () => {
    it('should push to remote', async () => {
      const promise = git.push('/test/repo');

      mockProc.emit('close', 0);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['push'], expect.any(Object));
    });

    it('should push to specific remote and branch', async () => {
      const promise = git.push('/test/repo', 'origin', 'feature-branch');

      mockProc.emit('close', 0);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['push', '-u', 'origin', 'feature-branch'], expect.any(Object));
    });

    it('should return error on push failure', async () => {
      const promise = git.push('/test/repo');

      mockProc.stderr.emit('data', Buffer.from('error: failed to push some refs\n'));
      mockProc.emit('close', 1);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('failed to push');
    });
  });

  describe('checkoutNewBranch', () => {
    it('should create and checkout new branch', async () => {
      const promise = git.checkoutNewBranch('/test/repo', 'new-branch');

      mockProc.emit('close', 0);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['checkout', '-b', 'new-branch'], expect.any(Object));
    });

    it('should return error if branch already exists', async () => {
      const promise = git.checkoutNewBranch('/test/repo', 'existing-branch');

      mockProc.stderr.emit('data', Buffer.from('fatal: A branch named \'existing-branch\' already exists.\n'));
      mockProc.emit('close', 128);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });
  });

  describe('getRemoteUrl', () => {
    it('should return remote URL', async () => {
      const promise = git.getRemoteUrl('/test/repo');

      mockProc.stdout.emit('data', Buffer.from('https://github.com/user/repo.git\n'));
      mockProc.emit('close', 0);

      const result = await promise;

      expect(result).toBe('https://github.com/user/repo.git');
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['remote', 'get-url', 'origin'], expect.any(Object));
    });

    it('should return null if remote does not exist', async () => {
      const promise = git.getRemoteUrl('/test/repo', 'upstream');

      mockProc.emit('close', 2);

      const result = await promise;

      expect(result).toBeNull();
    });
  });

  describe('clone', () => {
    it('should clone repository', async () => {
      // Set up fs mock before calling clone
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const promise = git.clone('/test/base', 'https://github.com/user/repo.git');

      mockProc.emit('close', 0);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['clone', 'https://github.com/user/repo.git'], expect.any(Object));
      expect(fs.existsSync).toHaveBeenCalledWith('/test/base/.git');
    });

    it('should clone to specific directory', async () => {
      // Set up fs mock before calling clone
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const promise = git.clone('/test/base', 'https://github.com/user/repo.git', 'my-repo');

      mockProc.emit('close', 0);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['clone', 'https://github.com/user/repo.git', 'my-repo'], expect.any(Object));
      expect(fs.existsSync).toHaveBeenCalledWith('/test/base/my-repo/.git');
    });

    it('should return error on clone failure', async () => {
      const promise = git.clone('/test/base', 'https://github.com/user/repo.git');

      mockProc.stderr.emit('data', Buffer.from('fatal: repository not found\n'));
      mockProc.emit('close', 128);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Git clone failed');
      expect(result.error).toContain('repository not found');
    });
  });

  describe('fetch', () => {
    it('should fetch from remote', async () => {
      const promise = git.fetch('/test/repo');

      mockProc.emit('close', 0);

      const result = await promise;

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['fetch', 'origin'], expect.any(Object));
    });

    it('should fetch from specific remote', async () => {
      const promise = git.fetch('/test/repo', 'upstream');

      mockProc.emit('close', 0);

      const result = await promise;

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['fetch', 'upstream'], expect.any(Object));
    });
  });

  describe('pull', () => {
    it('should pull from remote', async () => {
      const promise = git.pull('/test/repo');

      mockProc.emit('close', 0);

      const result = await promise;

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['pull', '--rebase'], expect.any(Object));
    });

    it('should pull specific branch', async () => {
      const promise = git.pull('/test/repo', 'origin', 'main');

      mockProc.emit('close', 0);

      const result = await promise;

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['pull', '--rebase', 'origin', 'main'], expect.any(Object));
    });
  });

  describe('resetHardToRemote', () => {
    it('should fetch and reset to remote branch', async () => {
      // Mock getCurrentBranch
      let callCount = 0;
      vi.mocked(spawn).mockImplementation((cmd, args) => {
        callCount++;
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          if (callCount === 1) {
            // getCurrentBranch call
            proc.stdout.emit('data', Buffer.from('main\n'));
          }
          proc.emit('close', 0);
        }, 0);

        return proc;
      });

      const result = await git.resetHardToRemote('/test/repo');

      expect(result).toBe(true);
    });

    it('should use provided branch', async () => {
      let fetchCalled = false;
      let resetCalled = false;

      vi.mocked(spawn).mockImplementation((cmd, args) => {
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();

        setTimeout(() => {
          if (args[0] === 'fetch') fetchCalled = true;
          if (args[0] === 'reset') {
            resetCalled = true;
            expect(args).toContain('origin/feature');
          }
          proc.emit('close', 0);
        }, 0);

        return proc;
      });

      const result = await git.resetHardToRemote('/test/repo', 'origin', 'feature');

      expect(result).toBe(true);
      expect(fetchCalled).toBe(true);
      expect(resetCalled).toBe(true);
    });
  });

  describe('cleanUntracked', () => {
    it('should clean untracked files', async () => {
      const promise = git.cleanUntracked('/test/repo');

      mockProc.emit('close', 0);

      const result = await promise;

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith('/usr/bin/git', ['clean', '-fd'], expect.any(Object));
    });
  });

  describe('tryBuildGithubCompareUrl', () => {
    it('should build URL for HTTPS GitHub remote', () => {
      const url = git.tryBuildGithubCompareUrl('https://github.com/user/repo.git', 'feature-branch');

      expect(url).not.toBeNull();
      // vscode.Uri.parse returns an object with fsPath property in our mock
      expect(url?.fsPath).toBe('https://github.com/user/repo/compare/feature-branch?expand=1');
    });

    it('should build URL for SSH GitHub remote', () => {
      const url = git.tryBuildGithubCompareUrl('git@github.com:user/repo.git', 'feature-branch');

      expect(url).not.toBeNull();
      expect(url?.fsPath).toBe('https://github.com/user/repo/compare/feature-branch?expand=1');
    });

    it('should handle branch names with special characters', () => {
      const url = git.tryBuildGithubCompareUrl('https://github.com/user/repo.git', 'feature/test-branch');

      expect(url).not.toBeNull();
      expect(url?.fsPath).toContain('feature%2Ftest-branch');
    });

    it('should return null for non-GitHub URLs', () => {
      const url = git.tryBuildGithubCompareUrl('https://gitlab.com/user/repo.git', 'main');

      expect(url).toBeNull();
    });

    it('should return null for invalid URLs', () => {
      const url = git.tryBuildGithubCompareUrl('not-a-url', 'main');

      expect(url).toBeNull();
    });

    it('should handle repos without .git extension', () => {
      const url = git.tryBuildGithubCompareUrl('https://github.com/user/repo', 'main');

      expect(url).not.toBeNull();
      expect(url?.fsPath).toBe('https://github.com/user/repo/compare/main?expand=1');
    });
  });
});
