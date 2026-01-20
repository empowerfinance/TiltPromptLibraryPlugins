import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock repository for tests
const mockRepository = {
  rootUri: { fsPath: '/test/repo' },
  state: {
    HEAD: { name: 'main' },
    workingTreeChanges: [],
    indexChanges: [],
    remotes: [
      { name: 'origin', fetchUrl: 'git@github.com:org/repo.git', pushUrl: 'git@github.com:org/repo.git' }
    ]
  },
  add: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
  createBranch: vi.fn()
};

const mockGitApi = {
  repositories: [mockRepository],
  git: { path: '/usr/bin/git' }
};

const mockGitExtension = {
  getAPI: vi.fn(() => mockGitApi)
};

// Mock vscode
vi.mock('vscode', () => ({
  extensions: {
    getExtension: vi.fn(() => ({
      isActive: true,
      exports: mockGitExtension
    }))
  }
}));

vi.mock('../log', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import * as vscodeGit from '../sync/vscodeGit';

describe('vscodeGit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state
    mockRepository.state.workingTreeChanges = [];
    mockRepository.state.indexChanges = [];
    mockRepository.state.HEAD = { name: 'main' };
  });

  describe('isGitRepo', () => {
    it('should return true for a valid repository', async () => {
      const result = await vscodeGit.isGitRepo('/test/repo');
      expect(result).toEqual({ isRepo: true });
    });

    it('should return false for non-existent repository', async () => {
      const result = await vscodeGit.isGitRepo('/non/existent/path');
      expect(result.isRepo).toBe(false);
      expect(result.error).toContain('Not a git repository');
    });
  });

  describe('getCurrentBranch', () => {
    it('should return the current branch name', async () => {
      const result = await vscodeGit.getCurrentBranch('/test/repo');
      expect(result).toBe('main');
    });

    it('should return null for non-existent repository', async () => {
      const result = await vscodeGit.getCurrentBranch('/non/existent/path');
      expect(result).toBeNull();
    });
  });

  describe('stageAll', () => {
    it('should call repository.add([])', async () => {
      await vscodeGit.stageAll('/test/repo');
      expect(mockRepository.add).toHaveBeenCalledWith([]);
    });

    it('should throw for non-existent repository', async () => {
      await expect(vscodeGit.stageAll('/non/existent/path')).rejects.toThrow('Not a git repository');
    });
  });

  describe('commit', () => {
    it('should return nothingToCommit when no changes', async () => {
      const result = await vscodeGit.commit('/test/repo', 'test message');
      expect(result).toEqual({ success: true, nothingToCommit: true });
      expect(mockRepository.commit).not.toHaveBeenCalled();
    });

    it('should commit when there are working tree changes', async () => {
      mockRepository.state.workingTreeChanges = [{ uri: 'file.txt' }];
      mockRepository.commit.mockResolvedValue(undefined);

      const result = await vscodeGit.commit('/test/repo', 'test message');

      expect(result).toEqual({ success: true });
      expect(mockRepository.commit).toHaveBeenCalledWith('test message');
    });

    it('should commit when there are index changes', async () => {
      mockRepository.state.indexChanges = [{ uri: 'staged-file.txt' }];
      mockRepository.commit.mockResolvedValue(undefined);

      const result = await vscodeGit.commit('/test/repo', 'test message');

      expect(result).toEqual({ success: true });
    });

    it('should return error for non-existent repository', async () => {
      const result = await vscodeGit.commit('/non/existent/path', 'test');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not a git repository');
    });
  });

  describe('push', () => {
    it('should push to origin', async () => {
      mockRepository.push.mockResolvedValue(undefined);

      const result = await vscodeGit.push('/test/repo');

      expect(result).toEqual({ success: true });
      expect(mockRepository.push).toHaveBeenCalledWith('origin', undefined, true);
    });

    it('should push to specific remote and branch', async () => {
      mockRepository.push.mockResolvedValue(undefined);

      const result = await vscodeGit.push('/test/repo', 'upstream', 'feature');

      expect(result).toEqual({ success: true });
      expect(mockRepository.push).toHaveBeenCalledWith('upstream', 'refs/heads/feature', true);
    });

    it('should return error for non-existent repository', async () => {
      const result = await vscodeGit.push('/non/existent/path');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not a git repository');
    });
  });

  describe('checkoutNewBranch', () => {
    it('should create and checkout a new branch', async () => {
      mockRepository.createBranch.mockResolvedValue(undefined);

      const result = await vscodeGit.checkoutNewBranch('/test/repo', 'feature-branch');

      expect(result).toEqual({ success: true });
      expect(mockRepository.createBranch).toHaveBeenCalledWith('feature-branch', true);
    });

    it('should return error for non-existent repository', async () => {
      const result = await vscodeGit.checkoutNewBranch('/non/existent/path', 'branch');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not a git repository');
    });

    it('should return error when branch creation fails', async () => {
      mockRepository.createBranch.mockRejectedValue(new Error('Branch already exists'));

      const result = await vscodeGit.checkoutNewBranch('/test/repo', 'existing-branch');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Branch already exists');
    });
  });

  describe('getRemoteUrl', () => {
    it('should return the remote fetch URL', async () => {
      const result = await vscodeGit.getRemoteUrl('/test/repo');
      expect(result).toBe('git@github.com:org/repo.git');
    });

    it('should return null for non-existent repository', async () => {
      const result = await vscodeGit.getRemoteUrl('/non/existent/path');
      expect(result).toBeNull();
    });

    it('should return null if remote not found', async () => {
      const result = await vscodeGit.getRemoteUrl('/test/repo', 'upstream');
      expect(result).toBeNull();
    });
  });

  describe('getGitVersion', () => {
    it('should return git path when available', async () => {
      const result = await vscodeGit.getGitVersion();
      expect(result.version).toContain('/usr/bin/git');
    });
  });
});

