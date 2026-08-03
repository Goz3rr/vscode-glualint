'use strict';

import * as vscode from 'vscode';
import LintProcess from './LintProcess';
import * as path from 'path';
import * as utils from './utils';

const MAX_CONCURRENT_LINTS = 50;

export default class GLuaLintingProvider implements vscode.Disposable {
    private diagnosticCollection!: vscode.DiagnosticCollection;

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
            const files = await vscode.workspace.findFiles('**/*.lua');
            console.log('vscode-glualint: Linting ' + files.length + ' file(s)...');

            // Group all files by the directories they are in
            const groups: { [id: string]: vscode.Uri[] } = {};
            const virtualFiles: vscode.Uri[] = [];
            for (const file of files) {
                if (file.scheme !== 'file') {
                    virtualFiles.push(file);
                    continue;
                }

                const fullPath = path.dirname(file.fsPath);
                if (!groups[fullPath]) { groups[fullPath] = []; }
                groups[fullPath].push(file);
            }

            // Lint by directory
            for (const [group, groupFiles] of Object.entries(groups)) {
                this.lintFolder(group, groupFiles);
            }
            for (const file of virtualFiles) {
                this.lintUri(file);
            }
        }

        // Then (ideally) any open editors, which may be edited
        const runOn = config.get<string>('run');
        if (runOn !== 'manual') {
            for (const grp of vscode.window.tabGroups.all) {
                for (const tab of grp.tabs) {
                    if (tab.input instanceof vscode.TabInputText) {
                        // HACK: bypasses activeLanguages setting!
                        if (!tab.input.uri.fsPath.endsWith('.lua')) { continue; }

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

    private documentTimers = new Map<string, NodeJS.Timeout>();

    private onCloseTextDocument(doc: vscode.TextDocument) {
        const uriKey = doc.uri.toString();
        const existingTimer = this.documentTimers.get(uriKey);
        if (existingTimer) {
            clearTimeout(existingTimer);
            this.documentTimers.delete(uriKey);
        }

        const config = vscode.workspace.getConfiguration('glualint');
        const allFiles = config.get<boolean>('allFiles');

        if (!allFiles) {
            this.diagnosticCollection.delete(doc.uri);
        }
    }

    private onChangeActiveTexteditor(editor: vscode.TextEditor | undefined) {
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
            const uriKey = event.document.uri.toString();
            const existingTimer = this.documentTimers.get(uriKey);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            const newTimer = setTimeout(() => {
                this.documentTimers.delete(uriKey);
                this.lintDocument(event.document);
            }, 500);

            this.documentTimers.set(uriKey, newTimer);
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
        for (const timer of this.documentTimers.values()) {
            clearTimeout(timer);
        }
        this.documentTimers.clear();

        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }

    private lintDocument(doc: vscode.TextDocument) {
        const activeLanguages = utils.getActiveLanguages(doc.uri);

        if (!activeLanguages.includes(doc.languageId)) {
            return;
        }

        this.lintUri(doc.uri, doc.getText());
    }

    private lintFolder(folder: string, uris: vscode.Uri[]) {
        const args = ['lint', ...utils.getCustomConfigArgs(uris[0])];
        for (const file of uris) {
            args.push(file.fsPath.substring(folder.length + 1));
        }

        const lintProcess: LintProcess = new LintProcess(uris[0], args);
        if (!lintProcess.isValid()) {
            vscode.window.showErrorMessage('Failed to create linter process.');
            return;
        }

        lintProcess.onExit((_url, stdOut, code) => {
            this.onReceiveDiagnostics(uris, stdOut, code);
        });
    }

    private queuedLints: vscode.Uri[] = [];
    private activeLints: number = 0;
    private processQueue() {
        while (this.activeLints < MAX_CONCURRENT_LINTS && this.queuedLints.length > 0) {
            const docUri = this.queuedLints.pop();
            if (docUri) {
                const promise = this.lintUriQueued(docUri);
                this.activeLints++;
                promise.finally(() => {
                    this.activeLints--;
                    this.processQueue();
                });
            }
        }
    }

    private lintUri(docUri: vscode.Uri, text?: string) {
        if (text === undefined) {
            this.queuedLints.push(docUri);
            this.processQueue();
        } else {
            // Skip the queue if we are coming from lintDocument()
            this.lintUriQueued(docUri, text);
        }
    }

    private async lintUriQueued(docUri: vscode.Uri, text?: string) {
        let textBuf: Uint8Array | null = null;
        if (text === undefined) {
            try {
                textBuf = await vscode.workspace.fs.readFile(docUri);
            } catch (e) {
                if (e instanceof vscode.FileSystemError) {
                    if (e.code === 'FileNotFound') {
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
        const args = ['lint', '--stdin', ...utils.getCustomConfigArgs(docUri)];

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

    private onReceiveDiagnostics(docUris: vscode.Uri[], stdOut: string, _exitCode: number) {
        const diagnostics = LintProcess.parseDiagnostics(stdOut);

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


