import * as vscode from 'vscode';

export function fullDocumentRange(doc: vscode.TextDocument): vscode.Range {
    const lastLine = doc.lineCount - 1;
    return new vscode.Range(0, 0, lastLine, doc.lineAt(lastLine).text.length);
}
