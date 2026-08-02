import * as vscode from 'vscode';
import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import * as path from 'path';

const OUTPUT_REGEXP = /^(.+?): \[(Error|Warning)\] line (\d+), column (\d+)(?: - line (\d+), column (\d+))?: (.+)/gm;

export default class LintProcess {
    private Process: ChildProcess;

    public StdOut: string = '';

    private ExitFunc?: (doc: vscode.Uri, stdOut: string, exitCode: number) => void;
    private PromiseFunc?: () => void;
    private document: vscode.Uri;

    constructor(docUri: vscode.Uri, args: string[] = []) {
        this.document = docUri;

        const config = vscode.workspace.getConfiguration('glualint');
        const executable = config.get<string>('linter') || 'glualint';
        const options: SpawnOptions = {};

        // uri.fsPath is only valid for the file scheme
        if (docUri.scheme === 'file') {
            options.cwd = path.dirname(docUri.fsPath);
        }

        this.Process = spawn(executable, args, options);

        this.Process.on('error', (error: any) => {
            if (error && error.code === 'ENOENT') {
                vscode.window.showErrorMessage(`Failed to find '${executable}'. Are you sure it's in your path?`);
            } else {
                vscode.window.showErrorMessage(`${executable} error: ${error?.message || error}`);
            }
        });

        this.Process.stdout?.on('data', buffer => {
            this.StdOut += buffer.toString();
        });

        this.Process.on('exit', code => {
            if (this.ExitFunc) {
                this.ExitFunc(this.document, this.StdOut, code ?? 0);
            }
            if (this.PromiseFunc) {
                this.PromiseFunc();
            }
        });
    }

    static parseDiagnostics(stdOut: string): Record<string, vscode.Diagnostic[]> {
        const diagnostics: Record<string, vscode.Diagnostic[]> = {};
        OUTPUT_REGEXP.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = OUTPUT_REGEXP.exec(stdOut)) !== null) {
            const file = match[1];
            const type = match[2];
            const line = parseInt(match[3], 10) - 1;
            const col = parseInt(match[4], 10) - 1;
            const endLine = match[5] !== undefined ? parseInt(match[5], 10) - 1 : line;
            const endCol = match[6] !== undefined ? parseInt(match[6], 10) - 1 : col + 1;
            const text = match[7];

            const range = new vscode.Range(line, col, endLine, endCol);
            const diagnostic = new vscode.Diagnostic(
                range,
                text,
                type === 'Warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
            );

            if (!diagnostics[file]) {
                diagnostics[file] = [];
            }
            diagnostics[file].push(diagnostic);
        }

        return diagnostics;
    }

    getDiagnostics(): Record<string, vscode.Diagnostic[]> {
        return LintProcess.parseDiagnostics(this.StdOut);
    }

    async waitForProcessExit() {
        return new Promise<void>((res) => {
            this.PromiseFunc = res;
        });
    }

    onExit(func: (doc: vscode.Uri, stdOut: string, exitCode: number) => void) {
        this.ExitFunc = func;
    }

    write(data: any) {
        if (this.Process.stdin) {
            this.Process.stdin.on('error', () => {
                // Suppress pipe errors if glualint closes early
            });
            this.Process.stdin.end(data);
        }
    }

    isValid(): boolean {
        return (this.Process.pid ?? 0) > 0;
    }
}
