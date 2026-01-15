import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { loadHtmlTemplate, getNonce, generateCSP } from '../ui/htmlLoader';

/**
 * Integration tests for HTML template loading
 * These tests verify that the actual HTML templates can be loaded and rendered correctly
 */
describe('HTML Templates Integration', () => {
  const mockWebview = {
    cspSource: 'vscode-webview://test-source',
  } as any;

  describe('promptLibraryView.html', () => {
    it('should exist in src/ui directory', () => {
      const templatePath = path.join(__dirname, '..', 'ui', 'promptLibraryView.html');
      expect(fs.existsSync(templatePath)).toBe(true);
    });

    it('should load and render with all placeholders replaced', () => {
      const nonce = getNonce();
      const csp = generateCSP(mockWebview, nonce);
      
      const html = loadHtmlTemplate('promptLibraryView.html', {
        CSP: csp,
        NONCE: nonce,
      });
      
      // Verify HTML structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
      
      // Verify CSP was inserted
      expect(html).toContain('Content-Security-Policy');
      expect(html).toContain(`'nonce-${nonce}'`);
      
      // Verify no unreplaced placeholders remain
      expect(html).not.toContain('{{CSP}}');
      expect(html).not.toContain('{{NONCE}}');
      
      // Verify key UI elements exist
      expect(html).toContain('id="composer"');
      expect(html).toContain('id="save"');
      expect(html).toContain('id="list"');
      expect(html).toContain('id="filter"');
    });

    it('should have valid HTML structure', () => {
      const nonce = getNonce();
      const csp = generateCSP(mockWebview, nonce);
      
      const html = loadHtmlTemplate('promptLibraryView.html', {
        CSP: csp,
        NONCE: nonce,
      });
      
      // Check for balanced tags
      const openTags = (html.match(/<(?!\/)[^>]+>/g) || []).length;
      const closeTags = (html.match(/<\/[^>]+>/g) || []).length;
      
      // Should have roughly equal open and close tags (self-closing tags will cause slight difference)
      expect(Math.abs(openTags - closeTags)).toBeLessThan(20);
      
      // Check for required sections
      expect(html).toContain('<head>');
      expect(html).toContain('</head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</body>');
      expect(html).toContain('<script');
      expect(html).toContain('</script>');
    });

    it('should include all required event handlers', () => {
      const nonce = getNonce();
      const csp = generateCSP(mockWebview, nonce);
      
      const html = loadHtmlTemplate('promptLibraryView.html', {
        CSP: csp,
        NONCE: nonce,
      });
      
      // Check for key event listeners
      expect(html).toContain("addEventListener('click'");
      expect(html).toContain("addEventListener('input'");
      expect(html).toContain("addEventListener('message'");
      
      // Check for vscode API usage
      expect(html).toContain('acquireVsCodeApi');
      expect(html).toContain('postMessage');
    });
  });

  describe('syncOpsView.html', () => {
    it('should exist in src/ui directory', () => {
      const templatePath = path.join(__dirname, '..', 'ui', 'syncOpsView.html');
      expect(fs.existsSync(templatePath)).toBe(true);
    });

    it('should load and render with all placeholders replaced', () => {
      const nonce = getNonce();
      const csp = generateCSP(mockWebview, nonce);
      
      const html = loadHtmlTemplate('syncOpsView.html', {
        CSP: csp,
        NONCE: nonce,
        BANNER: '<div class="banner">Test banner</div>',
        DISABLED: '',
        REPO_PATH: '/test/repo/path',
        PROMPTS_SUBDIR: 'prompts',
        WRITE_STRATEGY: 'direct',
      });
      
      // Verify HTML structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
      
      // Verify CSP was inserted
      expect(html).toContain('Content-Security-Policy');
      expect(html).toContain(`'nonce-${nonce}'`);
      
      // Verify no unreplaced placeholders remain
      expect(html).not.toContain('{{CSP}}');
      expect(html).not.toContain('{{NONCE}}');
      expect(html).not.toContain('{{BANNER}}');
      expect(html).not.toContain('{{REPO_PATH}}');
      expect(html).not.toContain('{{PROMPTS_SUBDIR}}');
      expect(html).not.toContain('{{WRITE_STRATEGY}}');
      
      // Verify dynamic content was inserted
      expect(html).toContain('Test banner');
      expect(html).toContain('/test/repo/path');
      expect(html).toContain('prompts');
      expect(html).toContain('direct');
      
      // Verify key UI elements exist
      expect(html).toContain('id="pullSync"');
      expect(html).toContain('id="syncDirectCommitBtn"');
      expect(html).toContain('id="syncBranchPRBtn"');
      expect(html).toContain('id="log"');
    });

    it('should handle empty banner', () => {
      const nonce = getNonce();
      const csp = generateCSP(mockWebview, nonce);
      
      const html = loadHtmlTemplate('syncOpsView.html', {
        CSP: csp,
        NONCE: nonce,
        BANNER: '',
        DISABLED: 'disabled',
        REPO_PATH: '(not set)',
        PROMPTS_SUBDIR: 'prompts',
        WRITE_STRATEGY: 'branchPR',
      });
      
      // Should not contain banner div when empty
      expect(html).not.toContain('class="banner"');
      
      // Should contain disabled attribute
      expect(html).toContain('disabled');
      
      // Should show "(not set)" for repo path
      expect(html).toContain('(not set)');
    });
  });

  describe('Template consistency', () => {
    it('both templates should use the same nonce in CSP and script tags', () => {
      const nonce = getNonce();
      const csp = generateCSP(mockWebview, nonce);
      
      const templates = [
        loadHtmlTemplate('promptLibraryView.html', { CSP: csp, NONCE: nonce }),
        loadHtmlTemplate('syncOpsView.html', {
          CSP: csp,
          NONCE: nonce,
          BANNER: '',
          DISABLED: '',
          REPO_PATH: 'test',
          PROMPTS_SUBDIR: 'test',
          WRITE_STRATEGY: 'test',
        }),
      ];
      
      templates.forEach((html) => {
        // Count nonce occurrences
        const nonceMatches = html.match(new RegExp(nonce, 'g'));
        expect(nonceMatches).toBeTruthy();
        expect(nonceMatches!.length).toBeGreaterThan(1); // Should appear in CSP and script tag
      });
    });
  });
});

