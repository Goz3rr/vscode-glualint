'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

const OUTPUT_REGEXP = /^(.+?): \[(Error|Warning)\] line (\d+), column (\d+)(?: - line (\d+), column (\d+))?: (.+)/gm;

export default class GLuaLintingProvider implements vscode.Disposable {

    private diagnosticCollection: vscode.DiagnosticCollection;

    public activate(subscriptions: vscode.Disposable[]) {
        subscriptions.push(this);

        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('glua');

        const config = vscode.workspace.getConfiguration('glualint');

        if (config.get<string>('run') !== 'manual') {
            vscode.workspace.onDidOpenTextDocument(this.lintDocument, this, subscriptions);
            vscode.workspace.onDidCloseTextDocument(doc => {
                this.diagnosticCollection.delete(doc.uri);
            }, null, subscriptions);

            vscode.window.onDidChangeActiveTextEditor(editor => this.lintDocument(editor.document), subscriptions);

            if (config.get<string>('run') === 'onType') {
                vscode.workspace.onDidChangeTextDocument(event => this.lintDocument(event.document), subscriptions);
            } else {
                vscode.workspace.onDidSaveTextDocument(this.lintDocument, this, subscriptions);
            }

            vscode.workspace.textDocuments.forEach(this.lintDocument, this);
        }
    }

    public dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }

    private lintDocument(doc: vscode.TextDocument) {
        const config = vscode.workspace.getConfiguration('glualint');

        if (config.get<string[]>('activeLanguages').indexOf(doc.languageId) === -1) {
            return;
        }

        const executable = config.get<string>('linter');
        const args = ['--stdin'];
        const options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;
        const lintProcess: ChildProcess = spawn(executable, args, options);

        lintProcess.on('error', (error: any) => {
            if (error.code === 'ENOENT') {
                vscode.window.showErrorMessage(`Failed to find '${executable}'. Are you sure it's in your path?`);
            } else {
                vscode.window.showErrorMessage(`${executable} error: ${error}`);
            }
        });

        if (lintProcess.pid) {
            let data = '';

            lintProcess.stdout.on('data', buffer => {
                data += buffer;
            });

            lintProcess.stderr.on('data', buffer => {
                data += buffer;
            });

            lintProcess.on('exit', (code, signal) => {
                const diagnostics: vscode.Diagnostic[] = [];

                let match: RegExpExecArray;
                // tslint:disable-next-line:no-conditional-assignment
                while ((match = OUTPUT_REGEXP.exec(data)) !== null) {
                    // let file = match[1];
                    const type = match[2];
                    const line = parseInt(match[3], 10) - 1;
                    const col = parseInt(match[4], 10) - 1;
                    const endLine = match[5] !== undefined ? parseInt(match[5], 10) - 1 : line;
                    const endCol = match[6] !== undefined ? parseInt(match[6], 10) - 1 : col + 1;
                    const text = match[7];

                    const range = new vscode.Range(line, col, endLine, endCol);
                    diagnostics.push(new vscode.Diagnostic(range, text, type === 'Warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error));
                }

                if (diagnostics.length === 0) {
                    this.diagnosticCollection.clear();
                } else {
                    this.diagnosticCollection.set(doc.uri, diagnostics);
                }
            });

            lintProcess.stdin.end(new Buffer(doc.getText()));
        }
    }
}
