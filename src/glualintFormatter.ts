'use strict';

import * as vscode from 'vscode';
import * as utils from './utils';
import LintProcess from './LintProcess';

export default class GLuaLintFormatter implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
    public activate(subscriptions: vscode.Disposable[]) {
        const config = vscode.workspace.getConfiguration('glualint');

        config.get<string[]>('activeLanguages').forEach(lang => {
            subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider({
                scheme: '*',
                language: lang,
            }, this));

            subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider({
                scheme: '*',
                language: lang,
            }, this));
        });
    }

    public provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        const edits = this.formatDocument(document, options);
        return edits;
    }

    public provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        return this.formatDocument(document, options, range);
    }

    private formatDocument(doc: vscode.TextDocument, options: vscode.FormattingOptions, range?: vscode.Range): Promise<vscode.TextEdit[]> {
        if (range === undefined) {
            range = utils.fullDocumentRange(doc);
        }

        const indentation = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
        const args = ['--pretty-print', `--indentation='${indentation}'`];
        const lintProcess: LintProcess = new LintProcess(args);

        if (lintProcess.Process.pid) {
            return new Promise<vscode.TextEdit[]>(resolve => {
                lintProcess.Process.on('exit', () => {
                    resolve([vscode.TextEdit.replace(range, lintProcess.StdOut)]);
                });

                lintProcess.Process.stdin.end(new Buffer(doc.getText(range)));
            });
        }

        return Promise.resolve([]);
    }
}
