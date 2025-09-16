import * as vscode from 'vscode';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  time: string; // ISO
  level: LogLevel;
  message: string;
}

export class PromptLibraryLog {
  private _entries: LogEntry[] = [];
  private _emitter = new vscode.EventEmitter<void>();
  private _max = 300;

  get onDidChange() { return this._emitter.event; }
  get entries(): LogEntry[] { return this._entries.slice(); }

  clear() {
    this._entries = [];
    this._emitter.fire();
  }

  private push(level: LogLevel, message: string) {
    const entry: LogEntry = { time: new Date().toISOString(), level, message };
    this._entries.push(entry);
    if (this._entries.length > this._max) {
      this._entries.splice(0, this._entries.length - this._max);
    }
    this._emitter.fire();
  }

  info(msg: string) { this.push('info', msg); }
  warn(msg: string) { this.push('warn', msg); }
  error(msg: string) { this.push('error', msg); }
}

export const log = new PromptLibraryLog();

