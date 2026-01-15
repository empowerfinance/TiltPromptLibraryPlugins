import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { start } from '../sync/scheduler';
import * as git from '../sync/git';
import * as settings from '../settings';
import { log } from '../log';

// Mock dependencies
vi.mock('../sync/git');
vi.mock('../settings');
vi.mock('../log');

describe('scheduler', () => {
  let mockContext: vscode.ExtensionContext;
  let subscriptions: vscode.Disposable[];
  let settingsChangeCallback: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    subscriptions = [];
    mockContext = {
      subscriptions,
    } as any;

    // Mock settings
    vi.mocked(settings.getSettings).mockReturnValue({
      repoPath: '/test/repo',
      autoFetch: {
        enabled: true,
        minutes: 5,
      },
    } as any);

    // Mock onSettingsChanged to capture callback
    vi.mocked(settings.onSettingsChanged).mockImplementation((callback) => {
      settingsChangeCallback = callback;
      return { dispose: vi.fn() };
    });

    // Mock git.fetch
    vi.mocked(git.fetch).mockResolvedValue(true);

    // Mock log methods
    vi.mocked(log.info).mockImplementation(() => {});
    vi.mocked(log.warn).mockImplementation(() => {});
    vi.mocked(log.error).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    settingsChangeCallback = null;
  });

  describe('start', () => {
    it('should schedule auto-fetch when enabled', () => {
      start(mockContext);

      expect(log.info).toHaveBeenCalledWith('Auto-fetch enabled: every 5m');
      expect(subscriptions.length).toBeGreaterThan(0);
    });

    it('should not schedule when auto-fetch is disabled', () => {
      vi.mocked(settings.getSettings).mockReturnValue({
        repoPath: '/test/repo',
        autoFetch: {
          enabled: false,
          minutes: 5,
        },
      } as any);

      start(mockContext);

      expect(log.info).toHaveBeenCalledWith('Auto-fetch disabled');
    });

    it('should warn when repoPath is not set', () => {
      vi.mocked(settings.getSettings).mockReturnValue({
        repoPath: '',
        autoFetch: {
          enabled: true,
          minutes: 5,
        },
      } as any);

      start(mockContext);

      expect(log.warn).toHaveBeenCalledWith('Auto-fetch is enabled but repoPath is not set');
    });

    it('should use minimum 1 minute interval', () => {
      vi.mocked(settings.getSettings).mockReturnValue({
        repoPath: '/test/repo',
        autoFetch: {
          enabled: true,
          minutes: 0.5, // Less than 1, should be clamped to 1
        },
      } as any);

      start(mockContext);

      expect(log.info).toHaveBeenCalledWith('Auto-fetch enabled: every 1m');
    });
  });

  describe('auto-fetch execution', () => {
    it('should fetch at scheduled intervals', async () => {
      start(mockContext);

      // Fast-forward 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(git.fetch).toHaveBeenCalledWith('/test/repo');
      expect(log.info).toHaveBeenCalledWith('Auto-fetch: fetch completed');
    });

    it('should log warning on fetch failure', async () => {
      vi.mocked(git.fetch).mockResolvedValue(false);

      start(mockContext);

      // Fast-forward 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(git.fetch).toHaveBeenCalledWith('/test/repo');
      expect(log.warn).toHaveBeenCalledWith('Auto-fetch: fetch failed');
    });

    it('should log error on fetch exception', async () => {
      const error = new Error('Network error');
      vi.mocked(git.fetch).mockRejectedValue(error);

      start(mockContext);

      // Fast-forward 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(git.fetch).toHaveBeenCalledWith('/test/repo');
      expect(log.error).toHaveBeenCalledWith('Auto-fetch error: Network error');
    });

    it('should fetch multiple times at intervals', async () => {
      start(mockContext);

      // Fast-forward 15 minutes (3 intervals)
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);

      expect(git.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('settings changes', () => {
    it('should reschedule when settings change', async () => {
      start(mockContext);

      // Initial schedule
      expect(log.info).toHaveBeenCalledWith('Auto-fetch enabled: every 5m');

      // Change settings to 10 minutes
      vi.mocked(settings.getSettings).mockReturnValue({
        repoPath: '/test/repo',
        autoFetch: {
          enabled: true,
          minutes: 10,
        },
      } as any);

      // Trigger settings change
      settingsChangeCallback?.();

      expect(log.info).toHaveBeenCalledWith('Auto-fetch enabled: every 10m');
    });

    it('should stop scheduling when auto-fetch is disabled via settings', () => {
      start(mockContext);

      // Initial schedule
      expect(log.info).toHaveBeenCalledWith('Auto-fetch enabled: every 5m');

      // Disable auto-fetch
      vi.mocked(settings.getSettings).mockReturnValue({
        repoPath: '/test/repo',
        autoFetch: {
          enabled: false,
          minutes: 5,
        },
      } as any);

      // Trigger settings change
      settingsChangeCallback?.();

      expect(log.info).toHaveBeenCalledWith('Auto-fetch disabled');
    });
  });

  describe('cleanup', () => {
    it('should register disposables', () => {
      start(mockContext);

      // Should have at least 2 disposables: settings listener and timer cleanup
      expect(subscriptions.length).toBeGreaterThanOrEqual(2);
    });

    it('should clean up timer on dispose', async () => {
      start(mockContext);

      // Get the timer cleanup disposable
      const timerDisposable = subscriptions[subscriptions.length - 1];

      // Dispose the timer
      timerDisposable.dispose();

      // Fast-forward time - fetch should not be called
      vi.clearAllMocks();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(git.fetch).not.toHaveBeenCalled();
    });
  });
});
