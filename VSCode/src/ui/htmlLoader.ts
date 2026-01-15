import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Loads an HTML template file and replaces placeholders with provided values
 */
export function loadHtmlTemplate(
  templateName: string,
  replacements: Record<string, string>
): string {
  const templatePath = path.join(__dirname, '..', 'ui', templateName);
  let html = fs.readFileSync(templatePath, 'utf8');
  
  // Replace all placeholders in the format {{KEY}}
  for (const [key, value] of Object.entries(replacements)) {
    const placeholder = `{{${key}}}`;
    html = html.replace(new RegExp(placeholder, 'g'), value);
  }
  
  return html;
}

/**
 * Generates a nonce for CSP
 */
export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates CSP meta tag for a webview
 */
export function generateCSP(webview: vscode.Webview, nonce: string): string {
  return `<meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} https: data:;
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';">`;
}

