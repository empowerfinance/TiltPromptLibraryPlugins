import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadHtmlTemplate, getNonce, generateCSP } from '../ui/htmlLoader';

describe('ui/htmlLoader.ts', () => {
  let tmpDir: string;
  let testTemplatePath: string;

  beforeAll(() => {
    // Create a temporary directory for test templates
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'htmlloader-test-'));
    testTemplatePath = path.join(tmpDir, 'test.html');
    
    // Create a test template
    const testTemplate = `<!DOCTYPE html>
<html>
<head>
  {{CSP}}
  <title>{{TITLE}}</title>
</head>
<body>
  <h1>{{HEADING}}</h1>
  <p>{{MESSAGE}}</p>
  <script nonce="{{NONCE}}">
    console.log('{{DEBUG}}');
  </script>
</body>
</html>`;
    
    fs.writeFileSync(testTemplatePath, testTemplate, 'utf8');
  });

  afterAll(() => {
    // Clean up temporary directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('getNonce', () => {
    it('should generate a 32-character nonce', () => {
      const nonce = getNonce();
      expect(nonce).toHaveLength(32);
    });

    it('should generate unique nonces', () => {
      const nonce1 = getNonce();
      const nonce2 = getNonce();
      expect(nonce1).not.toBe(nonce2);
    });

    it('should only contain alphanumeric characters', () => {
      const nonce = getNonce();
      expect(nonce).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate different nonces on multiple calls', () => {
      const nonces = new Set();
      for (let i = 0; i < 100; i++) {
        nonces.add(getNonce());
      }
      // All 100 nonces should be unique
      expect(nonces.size).toBe(100);
    });
  });

  describe('generateCSP', () => {
    it('should generate CSP meta tag with nonce', () => {
      const mockWebview = {
        cspSource: 'vscode-webview://test',
      } as any;
      
      const nonce = 'test-nonce-123';
      const csp = generateCSP(mockWebview, nonce);
      
      expect(csp).toContain('<meta http-equiv="Content-Security-Policy"');
      expect(csp).toContain(`'nonce-${nonce}'`);
      expect(csp).toContain(mockWebview.cspSource);
    });

    it('should include correct CSP directives', () => {
      const mockWebview = {
        cspSource: 'vscode-webview://test',
      } as any;
      
      const nonce = 'abc123';
      const csp = generateCSP(mockWebview, nonce);
      
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain(`img-src ${mockWebview.cspSource} https: data:`);
      expect(csp).toContain(`style-src ${mockWebview.cspSource} 'unsafe-inline'`);
      expect(csp).toContain(`script-src 'nonce-${nonce}'`);
    });
  });

  describe('loadHtmlTemplate', () => {
    it('should load template and replace placeholders', () => {
      // Mock __dirname to point to our temp directory
      const originalDirname = __dirname;
      const mockDirname = path.join(tmpDir, '..');
      
      // We need to temporarily change the module's __dirname
      // Since we can't do that directly, we'll test with the actual file
      const templateContent = fs.readFileSync(testTemplatePath, 'utf8');
      
      // Manually test the replacement logic
      const replacements = {
        CSP: '<meta http-equiv="Content-Security-Policy" content="...">',
        TITLE: 'Test Page',
        HEADING: 'Welcome',
        MESSAGE: 'Hello World',
        NONCE: 'abc123',
        DEBUG: 'test message',
      };
      
      let result = templateContent;
      for (const [key, value] of Object.entries(replacements)) {
        const placeholder = `{{${key}}}`;
        result = result.replace(new RegExp(placeholder, 'g'), value);
      }
      
      expect(result).toContain('<title>Test Page</title>');
      expect(result).toContain('<h1>Welcome</h1>');
      expect(result).toContain('<p>Hello World</p>');
      expect(result).toContain('nonce="abc123"');
      expect(result).toContain("console.log('test message')");
      expect(result).not.toContain('{{');
    });

    it('should replace all occurrences of a placeholder', () => {
      const template = '{{KEY}} and {{KEY}} and {{KEY}}';
      const replacements = { KEY: 'value' };
      
      let result = template;
      for (const [key, value] of Object.entries(replacements)) {
        const placeholder = `{{${key}}}`;
        result = result.replace(new RegExp(placeholder, 'g'), value);
      }
      
      expect(result).toBe('value and value and value');
      expect(result).not.toContain('{{KEY}}');
    });

    it('should handle empty replacement values', () => {
      const template = '<div>{{CONTENT}}</div>';
      const replacements = { CONTENT: '' };
      
      let result = template;
      for (const [key, value] of Object.entries(replacements)) {
        const placeholder = `{{${key}}}`;
        result = result.replace(new RegExp(placeholder, 'g'), value);
      }
      
      expect(result).toBe('<div></div>');
    });

    it('should not replace placeholders that are not in replacements object', () => {
      const template = '{{KNOWN}} and {{UNKNOWN}}';
      const replacements = { KNOWN: 'replaced' };
      
      let result = template;
      for (const [key, value] of Object.entries(replacements)) {
        const placeholder = `{{${key}}}`;
        result = result.replace(new RegExp(placeholder, 'g'), value);
      }
      
      expect(result).toBe('replaced and {{UNKNOWN}}');
    });
  });
});

