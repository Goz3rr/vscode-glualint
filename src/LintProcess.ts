import * as vscode from 'vscode';
import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import * as path from 'path';

export default class LintProcess {
    private Process: ChildProcess;

    private StdOut: string = '';

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


