"use strict";

import * as path from "path";
import * as vscode from "vscode";
import {spawn, ChildProcess} from "child_process";

const OUTPUT_REGEXP = /(.+?): \[(Error|Warning)\] line (\d+?), column (\d+?) - line (\d+?), column (\d+?): (.*)/g

let diagnosticCollection: vscode.DiagnosticCollection;

function parseDocumentDiagnostics(document: vscode.TextDocument, glualintOutput: string) : vscode.Diagnostic[] {
    let diagnostics: vscode.Diagnostic[] = [];
    let matches;
    while((matches = OUTPUT_REGEXP.exec(glualintOutput)) !== null) {
        if (!matches) {
            continue;
        }

        const message = {
            file: matches[1],
            type: matches[2],
            fromLine: parseInt(matches[3]),
            fromColumn: parseInt(matches[4]),
            toLine: parseInt(matches[5]),
            toColumn: parseInt(matches[6]),
            text: matches[7]
        }

        if (!message.fromLine) {
            return;
        }

        var rangeStart = new vscode.Position(message.fromLine - 1, message.fromColumn - 1);
        var rangeEnd = new vscode.Position(message.toLine - 1, message.toColumn - 1);
        var range = new vscode.Range(rangeStart, rangeEnd);
        diagnostics.push(new vscode.Diagnostic(range, message.text, message.type == "Warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error));
    }

    return diagnostics;
}

function lintDocument(document: vscode.TextDocument, warnOnError: Boolean = false) {
    //let glualinterConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('glualinter');
    //if (!glualinterConfig.get("enable")) {
    //    return;
    //}

    console.log("linting");

    if (document.languageId !== "glua") {
        console.log("not glua: " + document.languageId);
        return;
    }
    let diagnostics: vscode.Diagnostic[] = [];
    
    var lintProcess: ChildProcess = spawn("glualint", [ path.dirname(document.fileName) ]);
    console.log(lintProcess);
    lintProcess.stdout.setEncoding("utf8");
    lintProcess.stdout.on("data", (data: Buffer) => {
        console.log("data: " + data);
        if (data.length == 0) {
            return;
        }
        diagnostics = diagnostics.concat(parseDocumentDiagnostics(document, data.toString()));
    });
    lintProcess.stdout.on("error", error => {
        console.error("error: " + error);
        vscode.window.showErrorMessage("glualint error: " + error);
    });
    // Pass current file contents to lua's stdin
    lintProcess.stdin.end(new Buffer(document.getText()));
    lintProcess.on("exit", (code: number, signal: string) => {
        console.log("exit");
        if (diagnostics.length == 0) {
            diagnosticCollection.clear();
        } else {
            diagnosticCollection.set(document.uri, diagnostics);

            // Optionally show warning message
            //if (warnOnError && glualinterConfig.get<boolean>("warnOnSave")) {
            //    vscode.window.showWarningMessage("Current file contains an error: '${currentDiagnostic.message}' at line ${currentDiagnostic.range.start.line}");
            //}
        }
    });
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('loaded glua-linter');

    /*
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.sayHello', () => {
        // The code you place here will be executed every time your command is executed

        // Display a message box to the user
        vscode.window.showInformationMessage('Hello World!');
    });

    context.subscriptions.push(disposable);
    */

    diagnosticCollection = vscode.languages.createDiagnosticCollection('glua');
    context.subscriptions.push(diagnosticCollection);

    vscode.workspace.onDidSaveTextDocument(document => lintDocument(document));
    vscode.workspace.onDidChangeTextDocument(event => lintDocument(event.document));
    vscode.workspace.onDidOpenTextDocument(document => lintDocument(document));
    vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor) => lintDocument(editor.document));

    vscode.workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri));

    vscode.workspace.textDocuments.forEach(doc => lintDocument(doc));
}

// this method is called when your extension is deactivated
export function deactivate() {
}