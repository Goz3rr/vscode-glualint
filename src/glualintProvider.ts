'use strict';

import * as vscode from 'vscode';
import LintProcess from './LintProcess';
import * as path from 'path';

const OUTPUT_REGEXP = /^(.+?): \[(Error|Warning)\] line (\d+), column (\d+)(?: - line (\d+), column (\d+))?: (.+)/gm;
const MAX_CONCURRENT_LINTS = 50;

export default class GLuaLintingProvider implements vscode.Disposable {
    private diagnosticCollection: vscode.DiagnosticCollection;

    public activate(subscriptions: vscode.Disposable[]) {
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
        vscode.workspace.onDidChangeConfiguration(this.onConfigurationChanged, this, subscriptions);

        this.lintOpenAndAllDocuments();
    }

    private async lintOpenAndAllDocuments() {
        this.diagnosticCollection.clear();

        const config = vscode.workspace.getConfiguration('glualint');

        // First all files
        const allFiles = config.get<boolean>('allFiles');
        if (allFiles) {
            // HACK: bypasses activeLanguages setting!
            const allFiles = await vscode.workspace.findFiles('**/*.lua');
            console.log('vscode-glualint: Linting ' + allFiles.length + ' file(s)...');

            // Group all files by the directories they are in
            const groups: {[id: string]: vscode.Uri[];} = {};
            const virtualFiles: vscode.Uri[] = [];
            for (const file of allFiles) {
                if (file.scheme !== "file") {
                    virtualFiles.push(file);
                    continue;
                }

                const fullPath = path.dirname(file.fsPath);
                if (!groups[fullPath]) groups[fullPath] = [];
                groups[fullPath].push(file);
            }

            // Lint by directory
            for (const [group, files] of Object.entries(groups)) {
                this.lintFolder(group, files);
            }
            for (const file of virtualFiles) {
                this.lintUri(file);
            }
        }

        // Then (ideally) any open ediots, which may be edited
        const runOn = config.get<string>('run');
        if (runOn !== 'manual') {
            for (const grp of vscode.window.tabGroups.all) {
                for (const tab of grp.tabs) {
                    if (tab.input instanceof vscode.TabInputText) {
                        // HACK: bypasses activeLanguages setting!
                        if (!tab.input.uri.fsPath.endsWith('.lua')) continue;

                        this.lintUri(tab.input.uri);
                    }
                }
            }
        }
    }

    private onConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
        if (event.affectsConfiguration('glualint.allFiles') || event.affectsConfiguration('glualint.run')) {
            this.lintOpenAndAllDocuments();
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
        const config = vscode.workspace.getConfiguration('glualint');
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

    private lintFolder(folder: string, uris: vscode.Uri[]) {
        let args = ['lint'];
        for (const file of uris) {
            args.push(file.fsPath.substring(folder.length + 1));
        }

        const lintProcess: LintProcess = new LintProcess(uris[0], args);
        if (!lintProcess.isValid()) {
            vscode.window.showErrorMessage('Failed to create linter process.');
            return;
        }

        lintProcess.onExit((url, stdOut, code) => {
            this.onReceiveDiagnostics(uris, stdOut, code);
        });
    }

    private queuedLints: vscode.Uri[] = [];
    private activeLints: number = 0;
    private processQueue() {
        while (this.activeLints < MAX_CONCURRENT_LINTS && this.queuedLints.length > 0) {
            const promise = this.lintUriQueued(this.queuedLints.pop());
            this.activeLints++;
            promise.finally(() => {
                this.activeLints--;
                this.processQueue();
            });
        }
    }

    private lintUri(docUri: vscode.Uri, text?: string) {
        if (text === undefined) {
            this.queuedLints.push(docUri);
            this.processQueue();
        } else {
            // Skip the queue if we are coming from lintDocument()
            // This will not happen as often to warrant a queue
            // and I don't want to deal with the extra args/lint types
            this.lintUriQueued(docUri, text);
        }
    }

    private async lintUriQueued(docUri: vscode.Uri, text?: string) {
        // First get the text..
        let textBuf: any = null;
        if (text === undefined) {
            try {
                textBuf = await vscode.workspace.fs.readFile(docUri);
            } catch(e) {
                if (e instanceof vscode.FileSystemError) {
                    const fse = e as vscode.FileSystemError;

                    // Do not even print FileNotFound errors
                    if (fse.code == 'FileNotFound') {
                        return;
                    }
                }

                console.warn('vscode-glualint: Failed to lint', e);
                return;
            }
        } else {
            textBuf = Buffer.from(text);
        }

        // Perform the actual linting
        const args = ['lint', '--stdin'];
        const lintProcess: LintProcess = new LintProcess(docUri, args);
        if (!lintProcess.isValid()) {
            vscode.window.showErrorMessage('Failed to create linter process.');
            return;
        }

        lintProcess.onExit((url, stdOut, code) => {
            this.onReceiveDiagnostics([url], stdOut, code);
        });
        lintProcess.write(textBuf);

        // Allows us to track when the linter is done via the promise returned by this function
        await lintProcess.waitForProcessExit();
    }

    private async onReceiveDiagnostics(docUris: vscode.Uri[], stdOut: string, exitCode: number) {
        const diagnostics: {[id: string]: vscode.Diagnostic[];} = {};

        let match: RegExpExecArray;
        // tslint:disable-next-line:no-conditional-assignment
        while ((match = OUTPUT_REGEXP.exec(stdOut)) !== null) {
            const file = match[1];
            const type = match[2];
            const line = parseInt(match[3], 10) - 1;
            const col = parseInt(match[4], 10) - 1;
            const endLine = match[5] !== undefined ? parseInt(match[5], 10) - 1 : line;
            const endCol = match[6] !== undefined ? parseInt(match[6], 10) - 1 : col + 1;
            const text = match[7];

            const range = new vscode.Range(line, col, endLine, endCol);
            const diagnostic = new vscode.Diagnostic(range, text, type === 'Warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error);

            if (!diagnostics[file]) diagnostics[file] = [];
            diagnostics[file].push(diagnostic);
        }

        // Special case for lintUri
        if (diagnostics['stdin']) {
            const fileName = path.basename(docUris[0].fsPath);
            diagnostics[fileName] = diagnostics['stdin'];
            delete diagnostics['stdin'];
        }

        for (const file of docUris) {
            const fileName = path.basename(file.fsPath);
            const fileDiagnostics = diagnostics[fileName];
            if (!fileDiagnostics || fileDiagnostics.length === 0) {
                this.diagnosticCollection.delete(file);
            } else {
                this.diagnosticCollection.set(file, fileDiagnostics);
            }
            delete diagnostics[fileName];
        }

        if (Object.keys(diagnostics).length > 0) {
            vscode.window.showErrorMessage('This should never happen: Got extra data when linting folders.');
        }
    }
}
