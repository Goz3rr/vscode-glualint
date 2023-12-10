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

    private formatDocument(doc: vscode.TextDocument, formatOptions: vscode.FormattingOptions, range?: vscode.Range): Promise<vscode.TextEdit[]> {
        if (range === undefined) {
            // Format entire document.
            range = utils.fullDocumentRange(doc);
        } else {
            // If range is empty or the selected text is nothing but whitespaces skip
            // formatting.
            if(range.isEmpty || doc.getText(range).trim() == "") {
                return;
            }
        }

        const indentation = formatOptions.insertSpaces ? ' '.repeat(formatOptions.tabSize) : '\t';
        const args = ['pretty-print', '--stdin', `--indentation=${indentation}`];
        const lintProcess: LintProcess = new LintProcess(doc, args);

        if (lintProcess.Process.pid) {
            return new Promise<vscode.TextEdit[]>(resolve => {
                lintProcess.Process.on('exit', (code) => {
                    // Check for empty StdOut because < glualint 1.17.2 does not set exit code
                    if (code > 0 || lintProcess.StdOut === '') {
                        vscode.window.showErrorMessage('Failed to pretty print code, most likely due to syntax errors.');
                        resolve([]);
                        return;
                    }

                    resolve([vscode.TextEdit.replace(range, lintProcess.StdOut)]);
                });

                lintProcess.Process.stdin.end(Buffer.from(doc.getText(range)));
            });
        }

        return Promise.resolve([]);
    }
}
