import { describe, it, expect } from 'vitest';
import { 
  normalizeText, 
  generateId, 
  truncateText,
  Constants 
} from '../types';

describe('types/index.ts', () => {
  describe('normalizeText', () => {
    it('should normalize line endings to \\n', () => {
      expect(normalizeText('hello\r\nworld')).toBe('hello world');
      expect(normalizeText('hello\rworld')).toBe('hello world');
      expect(normalizeText('hello\nworld')).toBe('hello world');
    });

    it('should collapse multiple spaces into one', () => {
      expect(normalizeText('hello    world')).toBe('hello world');
      expect(normalizeText('hello\t\tworld')).toBe('hello world');
      expect(normalizeText('hello  \n  world')).toBe('hello world');
    });

    it('should trim whitespace', () => {
      expect(normalizeText('  hello world  ')).toBe('hello world');
      expect(normalizeText('\n\nhello world\n\n')).toBe('hello world');
    });

    it('should convert to lowercase', () => {
      expect(normalizeText('Hello World')).toBe('hello world');
      expect(normalizeText('HELLO WORLD')).toBe('hello world');
    });

    it('should handle empty strings', () => {
      expect(normalizeText('')).toBe('');
      expect(normalizeText('   ')).toBe('');
    });

    it('should handle complex text', () => {
      const input = '  Hello\r\n  World  \n\n  This   is   a   TEST  ';
      const expected = 'hello world this is a test';
      expect(normalizeText(input)).toBe(expected);
    });
  });

  describe('generateId', () => {
    it('should generate ID with correct prefix', () => {
      const id = generateId('test');
      expect(id).toMatch(/^test-/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateId('test');
      const id2 = generateId('test');
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with timestamp and random component', () => {
      const id = generateId('grp');
      const parts = id.split('-');
      expect(parts.length).toBe(3); // prefix-timestamp-random
      expect(parts[0]).toBe('grp');
      expect(parts[1].length).toBeGreaterThan(0); // timestamp in base36
      expect(parts[2].length).toBe(4); // random 4 chars
    });

    it('should work with different prefixes', () => {
      expect(generateId('grp')).toMatch(/^grp-/);
      expect(generateId('prompt')).toMatch(/^prompt-/);
      expect(generateId('tag')).toMatch(/^tag-/);
    });
  });

  describe('truncateText', () => {
    it('should truncate text longer than maxLength', () => {
      const text = 'This is a very long text that should be truncated';
      const result = truncateText(text, 20);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result).toBe('This is a very long');
    });

    it('should not truncate text shorter than maxLength', () => {
      const text = 'Short text';
      const result = truncateText(text, 20);
      expect(result).toBe('Short text');
    });

    it('should use default maxLength of 20', () => {
      const text = 'This is a text that is longer than twenty characters';
      const result = truncateText(text);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should normalize line breaks to spaces', () => {
      const text = 'Line 1\nLine 2\r\nLine 3';
      const result = truncateText(text, 50);
      expect(result).toBe('Line 1 Line 2 Line 3');
    });

    it('should trim whitespace', () => {
      const text = '  Hello World  ';
      const result = truncateText(text, 50);
      expect(result).toBe('Hello World');
    });

    it('should handle empty strings', () => {
      expect(truncateText('', 20)).toBe('');
      expect(truncateText('   ', 20)).toBe('');
    });

    it('should trim result after truncation', () => {
      const text = 'This is a text with spaces at the end     ';
      const result = truncateText(text, 20);
      expect(result).not.toMatch(/\s$/); // Should not end with whitespace
    });
  });

  describe('Constants', () => {
    it('should have correct root group IDs', () => {
      expect(Constants.ROOT_SHARED_ID).toBe('root-shared');
      expect(Constants.ROOT_PRIVATE_ID).toBe('root-private');
      expect(Constants.UNFILED_GROUP_ID).toBe('grp-unfiled');
    });

    it('should have correct group kinds', () => {
      expect(Constants.KIND_SHARED).toBe('shared');
      expect(Constants.KIND_PRIVATE).toBe('private');
    });

    it('should have correct namespace tags', () => {
      expect(Constants.TAG_NS_SHARED).toBe('ns:shared');
      expect(Constants.TAG_NS_PRIVATE).toBe('ns:private');
    });

    it('should have correct file names', () => {
      expect(Constants.LIBRARY_FILE).toBe('library.v2.json');
      expect(Constants.GROUP_METADATA_FILE).toBe('_group.yaml');
    });

    it('should have correct limits', () => {
      expect(Constants.MAX_LOG_ENTRIES).toBe(300);
      expect(Constants.DEFAULT_FETCH_INTERVAL_MINUTES).toBe(5);
    });
  });
});

