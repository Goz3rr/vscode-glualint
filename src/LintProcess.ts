import * as vscode from 'vscode';
import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import * as path from 'path';
import * as constants from './constants';

const OUTPUT_REGEXP = /^(.+?): \[(Error|Warning)\] line (\d+), column (\d+)(?: - line (\d+), column (\d+))?: (.+)/gm;

export default class LintProcess {
    private Process: ChildProcess;

    public StdOut: string = '';
    public readonly executable: string;

    private ExitFunc?: (doc: vscode.Uri, stdOut: string, exitCode: number) => void;
    private ErrorFunc?: (error: any) => void;
    private PromiseFunc?: () => void;
    private document: vscode.Uri;

    constructor(docUri: vscode.Uri, args: string[] = []) {
        this.document = docUri;

        const config = vscode.workspace.getConfiguration(constants.CONFIG_SECTION, docUri);
        this.executable = config.get<string>(constants.CONFIG_LINTER) || 'glualint';
        const workingDirectoryMode = config.get<string>(constants.CONFIG_WORKING_DIRECTORY) ?? 'file';
        const options: SpawnOptions = {
            // Use shell so that PATH entries are resolved correctly
            shell: true,
        };

        if (workingDirectoryMode === 'workspace') {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(docUri) ?? vscode.workspace.workspaceFolders?.[0];
            // uri.fsPath is only valid for the file scheme
            if (workspaceFolder && workspaceFolder.uri.scheme === 'file') {
                options.cwd = workspaceFolder.uri.fsPath;
            }
        }

        // uri.fsPath is only valid for the file scheme
        if (!options.cwd && docUri.scheme === 'file') {
            options.cwd = path.dirname(docUri.fsPath);
        }

        this.Process = spawn(this.executable, args, options);

        this.Process.on('error', (error: any) => {
            if (this.ErrorFunc) {
                this.ErrorFunc(error);
            } else if (error && error.code === 'ENOENT') {
                vscode.window.showErrorMessage(`Failed to find '${this.executable}'. Are you sure it's in your path?`);
            } else {
                vscode.window.showErrorMessage(`${this.executable} error: ${error?.message || error}`);
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

    onError(func: (error: any) => void) {
        this.ErrorFunc = func;
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

            const lowerText = text.toLowerCase();
            const tags: vscode.DiagnosticTag[] = [];

            if (lowerText.includes('unused') || lowerText.includes('never used') || lowerText.includes('unreachable') || lowerText.includes('redundant') || lowerText.includes('unnecessary') || lowerText.includes('double negation')) {
                tags.push(vscode.DiagnosticTag.Unnecessary);
            }

            if (lowerText.includes('deprecated')) {
                tags.push(vscode.DiagnosticTag.Deprecated);
            }

            if (tags.length > 0) {
                diagnostic.tags = tags;
            }

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

    public static async getVersion(executable?: string): Promise<string | undefined> {
        const targetExecutable = executable || vscode.workspace.getConfiguration(constants.CONFIG_SECTION).get<string>(constants.CONFIG_LINTER) || 'glualint';
        return new Promise<string | undefined>((resolve) => {
            try {
                const proc = spawn(targetExecutable, ['--version'], { shell: true });
                let stdout = '';
                proc.stdout?.on('data', data => { stdout += data.toString(); });
                proc.on('error', () => resolve(undefined));
                proc.on('exit', code => {
                    if (code === 0) {
                        const match = stdout.match(/(\d+\.\d+\.\d+)/);
                        resolve(match ? match[1] : undefined);
                    } else {
                        resolve(undefined);
                    }
                });
            } catch {
                resolve(undefined);
            }
        });
    }
}
