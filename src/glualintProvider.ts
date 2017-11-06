'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

const OUTPUT_REGEXP = /^(.+?): \[(Error|Warning)\] line (\d+), column (\d+)(?: - line (\d+), column (\d+))?: (.+)/gm

export default class GLuaLintingProvider implements vscode.Disposable {

    private diagnosticCollection: vscode.DiagnosticCollection;

    public activate(subscriptions: vscode.Disposable[]) {
        subscriptions.push(this);

        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('glua');

        vscode.workspace.onDidOpenTextDocument(this.lintDocument, this, subscriptions);
        vscode.workspace.onDidCloseTextDocument(doc => {
            this.diagnosticCollection.delete(doc.uri);
        }, null, subscriptions);

        vscode.workspace.onDidChangeTextDocument(event => this.lintDocument(event.document));
        vscode.workspace.onDidSaveTextDocument(this.lintDocument, this);
        vscode.workspace.textDocuments.forEach(this.lintDocument, this);
    }

    public dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }

    private lintDocument(doc: vscode.TextDocument) {
        if (doc.languageId !== 'glua' && doc.languageId !== 'lua') {
            return;
        }

        let args = ['--stdin'];
        let options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;
        var lintProcess: ChildProcess = spawn('glualint', args, options);

        lintProcess.on('error', error => {
            vscode.window.showErrorMessage('glualint error: ' + error);
        });

        if (lintProcess.pid) {
            let data = ''

            lintProcess.stdout.on('data', buffer => {
                data += buffer;
            });

            lintProcess.stderr.on('data', buffer => {
                data += buffer;
            });

            lintProcess.on('exit', (code, signal) => {
                let diagnostics: vscode.Diagnostic[] = [];

                let match: RegExpExecArray;
                while ((match = OUTPUT_REGEXP.exec(data)) !== null) {
                    //let file = match[1];
                    let type = match[2];
                    let line = parseInt(match[3]) - 1;
                    let col = parseInt(match[4]) - 1;
                    let endLine = match[5] !== undefined ? parseInt(match[5]) - 1 : line;
                    let endCol = match[6] !== undefined ? parseInt(match[6]) - 1 : col + 1;
                    let text = match[7];

                    var range = new vscode.Range(line, col, endLine, endCol);
                    diagnostics.push(new vscode.Diagnostic(range, text, type == "Warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error));
                }

                if (diagnostics.length == 0) {
                    this.diagnosticCollection.clear();
                } else {
                    this.diagnosticCollection.set(doc.uri, diagnostics);
                }
            });

            lintProcess.stdin.end(new Buffer(doc.getText()));
        }
    }
}