import * as vscode from 'vscode';

export function fullDocumentRange(doc: vscode.TextDocument): vscode.Range {
    const lastLine = doc.lineCount - 1;
    return new vscode.Range(0, 0, lastLine, doc.lineAt(lastLine).text.length);
}

export function getCustomConfigArgs(uri?: vscode.Uri): string[] {
    const config = vscode.workspace.getConfiguration('glualint', uri);
    const customConfig = config.get<string>('config');
    if (customConfig) {
        return ['--config', customConfig];
    }
    return [];
}

export function getActiveLanguages(uri?: vscode.Uri): string[] {
    const config = vscode.workspace.getConfiguration('glualint', uri);
    return config.get<string[]>('activeLanguages') ?? ['glua', 'lua'];
}
