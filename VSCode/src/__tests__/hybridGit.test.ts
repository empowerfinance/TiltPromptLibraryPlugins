import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [
      { uri: { fsPath: '/workspace/project' } }
    ]
  }
}));

// Mock the underlying git modules
vi.mock('../sync/vscodeGit', () => ({
  isGitRepo: vi.fn(),
  getCurrentBranch: vi.fn(),
  stageAll: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
  checkoutNewBranch: vi.fn(),
  getRemoteUrl: vi.fn(),
  getGitVersion: vi.fn()
}));

vi.mock('../sync/git', () => ({
  isGitRepo: vi.fn(),
  getCurrentBranch: vi.fn(),
  stageAll: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
  checkoutNewBranch: vi.fn(),
  getRemoteUrl: vi.fn(),
  getGitVersion: vi.fn()
}));

vi.mock('../log', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import * as vscodeGit from '../sync/vscodeGit';
import * as spawnGit from '../sync/git';
import * as hybridGit from '../sync/hybridGit';

describe('hybridGit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isGitRepo', () => {
    it('should use VSCode Git API for paths in workspace', async () => {
      vi.mocked(vscodeGit.isGitRepo).mockResolvedValue({ isRepo: true });

      const result = await hybridGit.isGitRepo('/workspace/project/subdir');

      expect(vscodeGit.isGitRepo).toHaveBeenCalledWith('/workspace/project/subdir');
      expect(spawnGit.isGitRepo).not.toHaveBeenCalled();
      expect(result).toEqual({ isRepo: true });
    });

    it('should use git spawn for paths outside workspace', async () => {
      vi.mocked(spawnGit.isGitRepo).mockResolvedValue({ isRepo: true });

      const result = await hybridGit.isGitRepo('/external/repo');

      expect(spawnGit.isGitRepo).toHaveBeenCalledWith('/external/repo');
      expect(vscodeGit.isGitRepo).not.toHaveBeenCalled();
      expect(result).toEqual({ isRepo: true });
    });
  });

  describe('getCurrentBranch', () => {
    it('should use VSCode Git API for paths in workspace', async () => {
      vi.mocked(vscodeGit.getCurrentBranch).mockResolvedValue('main');

      const result = await hybridGit.getCurrentBranch('/workspace/project');

      expect(vscodeGit.getCurrentBranch).toHaveBeenCalledWith('/workspace/project');
      expect(result).toBe('main');
    });

    it('should use git spawn for paths outside workspace', async () => {
      vi.mocked(spawnGit.getCurrentBranch).mockResolvedValue('develop');

      const result = await hybridGit.getCurrentBranch('/external/repo');

      expect(spawnGit.getCurrentBranch).toHaveBeenCalledWith('/external/repo');
      expect(result).toBe('develop');
    });
  });

  describe('stageAll', () => {
    it('should use VSCode Git API for paths in workspace', async () => {
      vi.mocked(vscodeGit.stageAll).mockResolvedValue();

      await hybridGit.stageAll('/workspace/project');

      expect(vscodeGit.stageAll).toHaveBeenCalledWith('/workspace/project');
    });

    it('should use git spawn for paths outside workspace', async () => {
      vi.mocked(spawnGit.stageAll).mockResolvedValue();

      await hybridGit.stageAll('/external/repo');

      expect(spawnGit.stageAll).toHaveBeenCalledWith('/external/repo');
    });
  });

  describe('commit', () => {
    it('should use VSCode Git API for paths in workspace', async () => {
      vi.mocked(vscodeGit.commit).mockResolvedValue({ success: true });

      const result = await hybridGit.commit('/workspace/project', 'test commit');

      expect(vscodeGit.commit).toHaveBeenCalledWith('/workspace/project', 'test commit');
      expect(result).toEqual({ success: true });
    });

    it('should use git spawn for paths outside workspace', async () => {
      vi.mocked(spawnGit.commit).mockResolvedValue({ success: true, nothingToCommit: false });

      const result = await hybridGit.commit('/external/repo', 'test commit');

      expect(spawnGit.commit).toHaveBeenCalledWith('/external/repo', 'test commit');
      expect(result.success).toBe(true);
    });
  });

  describe('push', () => {
    it('should use VSCode Git API for paths in workspace', async () => {
      vi.mocked(vscodeGit.push).mockResolvedValue({ success: true });

      const result = await hybridGit.push('/workspace/project', 'origin', 'main');

      expect(vscodeGit.push).toHaveBeenCalledWith('/workspace/project', 'origin', 'main');
      expect(result).toEqual({ success: true });
    });

    it('should use git spawn for paths outside workspace', async () => {
      vi.mocked(spawnGit.push).mockResolvedValue({ success: true });

      const result = await hybridGit.push('/external/repo');

      expect(spawnGit.push).toHaveBeenCalledWith('/external/repo', 'origin', undefined);
      expect(result).toEqual({ success: true });
    });
  });

  describe('checkoutNewBranch', () => {
    it('should use VSCode Git API for paths in workspace', async () => {
      vi.mocked(vscodeGit.checkoutNewBranch).mockResolvedValue({ success: true });

      const result = await hybridGit.checkoutNewBranch('/workspace/project', 'feature-branch');

      expect(vscodeGit.checkoutNewBranch).toHaveBeenCalledWith('/workspace/project', 'feature-branch');
      expect(result).toEqual({ success: true });
    });

    it('should use git spawn for paths outside workspace', async () => {
      vi.mocked(spawnGit.checkoutNewBranch).mockResolvedValue({ success: true });

      const result = await hybridGit.checkoutNewBranch('/external/repo', 'feature-branch');

      expect(spawnGit.checkoutNewBranch).toHaveBeenCalledWith('/external/repo', 'feature-branch');
      expect(result).toEqual({ success: true });
    });
  });

  describe('getRemoteUrl', () => {
    it('should use VSCode Git API for paths in workspace', async () => {
      vi.mocked(vscodeGit.getRemoteUrl).mockResolvedValue('git@github.com:org/repo.git');

      const result = await hybridGit.getRemoteUrl('/workspace/project');

      expect(vscodeGit.getRemoteUrl).toHaveBeenCalledWith('/workspace/project', 'origin');
      expect(result).toBe('git@github.com:org/repo.git');
    });

    it('should use git spawn for paths outside workspace', async () => {
      vi.mocked(spawnGit.getRemoteUrl).mockResolvedValue('https://github.com/org/repo.git');

      const result = await hybridGit.getRemoteUrl('/external/repo', 'upstream');

      expect(spawnGit.getRemoteUrl).toHaveBeenCalledWith('/external/repo', 'upstream');
      expect(result).toBe('https://github.com/org/repo.git');
    });
  });

  describe('getGitVersion', () => {
    it('should return VSCode result if available', async () => {
      vi.mocked(vscodeGit.getGitVersion).mockResolvedValue({ version: 'git 2.40.0' });

      const result = await hybridGit.getGitVersion();

      expect(result).toEqual({ version: 'git 2.40.0' });
      expect(spawnGit.getGitVersion).not.toHaveBeenCalled();
    });

    it('should fall back to spawn if VSCode fails', async () => {
      vi.mocked(vscodeGit.getGitVersion).mockResolvedValue({ error: 'not available' });
      vi.mocked(spawnGit.getGitVersion).mockResolvedValue({ version: 'git 2.39.0' });

      const result = await hybridGit.getGitVersion();

      expect(result).toEqual({ version: 'git 2.39.0' });
    });
  });
});

