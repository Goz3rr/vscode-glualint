'use strict';

import * as vscode from 'vscode';
import * as utils from './utils';
import LintProcess from './LintProcess';

export default class GLuaLintFormatter implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
    public activate(subscriptions: vscode.Disposable[]) {
        const activeLanguages = utils.getActiveLanguages();

        activeLanguages.forEach(lang => {
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
        return this.formatDocument(document, options, token);
    }

    public provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        return this.formatDocument(document, options, token, range);
    }

    private formatDocument(doc: vscode.TextDocument, formatOptions: vscode.FormattingOptions, token: vscode.CancellationToken, range?: vscode.Range): Promise<vscode.TextEdit[]> {
        if (range === undefined) {
            // Format entire document.
            range = utils.fullDocumentRange(doc);
        } else {
            // If range is empty or the selected text is nothing but whitespaces skip formatting.
            if (range.isEmpty || doc.getText(range).trim() === '') {
                return Promise.resolve([]);
            }
        }

        const targetRange = range;
        const indentation = formatOptions.insertSpaces ? ' '.repeat(formatOptions.tabSize) : '\t';
        const args = ['pretty-print', '--stdin', `--indentation=${indentation}`, ...utils.getCustomConfigArgs(doc.uri)];
        const lintProcess: LintProcess = new LintProcess(doc.uri, args);

        if (!lintProcess.isValid()) {
            return Promise.resolve([]);
        }

        return new Promise<vscode.TextEdit[]>(resolve => {
            token.onCancellationRequested(() => {
                resolve([]);
            });

            lintProcess.onExit((_url, stdOut, code) => {
                if (token.isCancellationRequested) {
                    resolve([]);
                    return;
                }

                // Check for empty StdOut because < glualint 1.17.2 does not set exit code
                if (code > 0 || stdOut === '') {
                    vscode.window.showErrorMessage('Failed to pretty print code, most likely due to syntax errors.');
                    resolve([]);
                    return;
                }

                resolve([vscode.TextEdit.replace(targetRange, stdOut)]);
            });

            lintProcess.write(Buffer.from(doc.getText(targetRange)));
        });
    }
}


