'use strict';

import * as vscode from 'vscode';
import LintProcess from './LintProcess';

const OUTPUT_REGEXP = /^(.+?): \[(Error|Warning)\] line (\d+), column (\d+)(?: - line (\d+), column (\d+))?: (.+)/gm;

export default class GLuaLintingProvider implements vscode.Disposable {
    private diagnosticCollection: vscode.DiagnosticCollection;

    public async activate(subscriptions: vscode.Disposable[]) {
        subscriptions.push(this);

        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('glua');

        subscriptions.push(vscode.commands.registerTextEditorCommand('glualint.lint', textEditor => {
            this.lintDocument(textEditor.document);
        }));

        vscode.workspace.onDidOpenTextDocument(this.onOpenTextDocument, this, subscriptions);
        vscode.workspace.onDidCloseTextDocument(this.onCloseTextDocument, this, subscriptions);
        vscode.window.onDidChangeActiveTextEditor(this.onChangeActiveTexteditor, this, subscriptions);
        vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument, this, subscriptions);
        vscode.workspace.onDidSaveTextDocument(this.onSaveTextDocument, this, subscriptions);

        const config = vscode.workspace.getConfiguration('glualint', null);
        const runOn = config.get<string>('run');

        if (runOn !== 'manual') {
            for (let grp of vscode.window.tabGroups.all) {
                for (let tab of grp.tabs) {
                    if (tab.input instanceof vscode.TabInputText) {
                        // HACK: bypasses activeLanguages setting!
                        if (!tab.input.uri.fsPath.endsWith(".lua")) continue;

                        this.lintUri(tab.input.uri);
                    }
                }
            }
        }

        const allFiles = config.get<boolean>('allFiles');
        if (allFiles) {
            // HACK: bypasses activeLanguages setting!
            let files = await vscode.workspace.findFiles("**/*.lua")
            files.forEach((fileUri) => this.lintUri(fileUri));
        }
    }

    private onOpenTextDocument(doc: vscode.TextDocument) {
        const config = vscode.workspace.getConfiguration('glualint', doc.uri);
        const runOn = config.get<string>('run');

        if (runOn !== 'manual') {
            this.lintDocument(doc);
        }
    }

    private onCloseTextDocument(doc: vscode.TextDocument) {
        const config = vscode.workspace.getConfiguration('glualint', null);
        const allFiles = config.get<boolean>('allFiles');

        if (!allFiles) {
            this.diagnosticCollection.delete(doc.uri);
        }
    }

    private onChangeActiveTexteditor(editor: vscode.TextEditor) {
        // onDidChangeActiveTextEditor can be called with no editor, we can't do anything then
        if (editor === undefined) {
            return;
        }

        const config = vscode.workspace.getConfiguration('glualint', editor.document.uri);
        const runOn = config.get<string>('run');

        if (runOn !== 'manual') {
            this.lintDocument(editor.document);
        }
    }

    private onChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
        const config = vscode.workspace.getConfiguration('glualint', event.document.uri);
        const runOn = config.get<string>('run');

        if (runOn === 'onType') {
            this.lintDocument(event.document);
        }
    }

    private onSaveTextDocument(doc: vscode.TextDocument) {
        const config = vscode.workspace.getConfiguration('glualint', doc.uri);
        const runOn = config.get<string>('run');

        if (runOn === 'onSave') {
            this.lintDocument(doc);
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

        this.lintUri(doc.uri, doc.getText());
    }

    // TODO: Rate limit this function? Reuse the linter process?
    private async lintUri(docUri: vscode.Uri, text: string = null) {
        const args = ['lint', '--stdin'];
        const lintProcess: LintProcess = new LintProcess(docUri, args);

        if (lintProcess.Process.pid) {
            lintProcess.Process.on('exit', () => {
                const diagnostics: vscode.Diagnostic[] = [];

                let match: RegExpExecArray;
                // tslint:disable-next-line:no-conditional-assignment
                while ((match = OUTPUT_REGEXP.exec(lintProcess.StdOut)) !== null) {
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
                    this.diagnosticCollection.delete(docUri);
                } else {
                    this.diagnosticCollection.set(docUri, diagnostics);
                }
            });

            if (text == null) {
                let fileContents = await vscode.workspace.fs.readFile(docUri);
                lintProcess.Process.stdin.end(fileContents);
            } else {
                lintProcess.Process.stdin.end(Buffer.from(text));
            }
        }
    }
}
