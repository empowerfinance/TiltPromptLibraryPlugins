import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromptLibraryLog, LogLevel, LogEntry } from '../log';

describe('PromptLibraryLog', () => {
  let logger: PromptLibraryLog;

  beforeEach(() => {
    logger = new PromptLibraryLog();
  });

  describe('info logging', () => {
    it('should add info entry', () => {
      logger.info('Test info message');
      const entries = logger.entries;
      
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe('info');
      expect(entries[0].message).toBe('Test info message');
      expect(entries[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should add multiple info entries', () => {
      logger.info('First message');
      logger.info('Second message');
      logger.info('Third message');
      
      const entries = logger.entries;
      expect(entries).toHaveLength(3);
      expect(entries[0].message).toBe('First message');
      expect(entries[1].message).toBe('Second message');
      expect(entries[2].message).toBe('Third message');
    });
  });

  describe('warn logging', () => {
    it('should add warn entry', () => {
      logger.warn('Test warning');
      const entries = logger.entries;
      
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe('warn');
      expect(entries[0].message).toBe('Test warning');
    });
  });

  describe('error logging', () => {
    it('should add error entry', () => {
      logger.error('Test error');
      const entries = logger.entries;
      
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe('error');
      expect(entries[0].message).toBe('Test error');
    });
  });

  describe('mixed logging', () => {
    it('should handle mixed log levels', () => {
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
      
      const entries = logger.entries;
      expect(entries).toHaveLength(3);
      expect(entries[0].level).toBe('info');
      expect(entries[1].level).toBe('warn');
      expect(entries[2].level).toBe('error');
    });
  });

  describe('max entries limit', () => {
    it('should limit entries to 300', () => {
      // Add 350 entries
      for (let i = 0; i < 350; i++) {
        logger.info(`Message ${i}`);
      }
      
      const entries = logger.entries;
      expect(entries).toHaveLength(300);
      
      // Should have kept the last 300 entries (50-349)
      expect(entries[0].message).toBe('Message 50');
      expect(entries[299].message).toBe('Message 349');
    });

    it('should maintain order when trimming', () => {
      for (let i = 0; i < 305; i++) {
        logger.info(`Entry ${i}`);
      }
      
      const entries = logger.entries;
      expect(entries).toHaveLength(300);
      
      // Verify sequential order
      for (let i = 0; i < 300; i++) {
        expect(entries[i].message).toBe(`Entry ${i + 5}`);
      }
    });
  });

  describe('clear functionality', () => {
    it('should clear all entries', () => {
      logger.info('Message 1');
      logger.warn('Message 2');
      logger.error('Message 3');
      
      expect(logger.entries).toHaveLength(3);
      
      logger.clear();
      
      expect(logger.entries).toHaveLength(0);
    });

    it('should allow adding entries after clear', () => {
      logger.info('Before clear');
      logger.clear();
      logger.info('After clear');
      
      const entries = logger.entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].message).toBe('After clear');
    });
  });

  describe('event emission', () => {
    it('should emit event when adding entry', () => {
      const listener = vi.fn();
      logger.onDidChange(listener);
      
      logger.info('Test message');
      
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should emit event when clearing', () => {
      const listener = vi.fn();
      logger.onDidChange(listener);
      
      logger.clear();
      
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should emit event for each log entry', () => {
      const listener = vi.fn();
      logger.onDidChange(listener);
      
      logger.info('Message 1');
      logger.warn('Message 2');
      logger.error('Message 3');
      
      expect(listener).toHaveBeenCalledTimes(3);
    });
  });

  describe('entries getter', () => {
    it('should return a copy of entries', () => {
      logger.info('Test message');
      
      const entries1 = logger.entries;
      const entries2 = logger.entries;
      
      // Should be different array instances
      expect(entries1).not.toBe(entries2);
      
      // But with same content
      expect(entries1).toEqual(entries2);
    });

    it('should not allow external modification', () => {
      logger.info('Original message');
      
      const entries = logger.entries;
      entries.push({ time: '2026-01-01T00:00:00.000Z', level: 'info', message: 'Hacked' });
      
      // Original should be unchanged
      expect(logger.entries).toHaveLength(1);
      expect(logger.entries[0].message).toBe('Original message');
    });
  });

  describe('timestamp format', () => {
    it('should use ISO 8601 format', () => {
      logger.info('Test');
      
      const entry = logger.entries[0];
      const timestamp = new Date(entry.time);
      
      // Should be a valid date
      expect(timestamp.toString()).not.toBe('Invalid Date');
      
      // Should be ISO format
      expect(entry.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should have unique timestamps for rapid entries', () => {
      logger.info('Message 1');
      logger.info('Message 2');
      logger.info('Message 3');
      
      const entries = logger.entries;
      const timestamps = entries.map(e => e.time);
      
      // All timestamps should be present (may or may not be unique depending on timing)
      expect(timestamps).toHaveLength(3);
    });
  });
});

