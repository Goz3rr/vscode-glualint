import * as vscode from 'vscode';
import * as constants from './constants';

export function fullDocumentRange(doc: vscode.TextDocument): vscode.Range {
    const lastLine = doc.lineCount - 1;
    return new vscode.Range(0, 0, lastLine, doc.lineAt(lastLine).text.length);
}

export function getCustomConfigArgs(uri?: vscode.Uri): string[] {
    const config = vscode.workspace.getConfiguration(constants.CONFIG_SECTION, uri);
    const customConfig = config.get<string>(constants.CONFIG_CONFIG);
    if (customConfig) {
        return ['--config', customConfig];
    }
    return [];
}

export function getActiveLanguages(uri?: vscode.Uri): string[] {
    const config = vscode.workspace.getConfiguration(constants.CONFIG_SECTION, uri);
    return config.get<string[]>(constants.CONFIG_ACTIVE_LANGUAGES) ?? ['glua', 'lua'];
}

export function getRunMode(uri?: vscode.Uri): string {
    const config = vscode.workspace.getConfiguration(constants.CONFIG_SECTION, uri);
    return config.get<string>(constants.CONFIG_RUN) ?? 'onType';
}

