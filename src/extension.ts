import * as vscode from 'vscode';
import GLuaLintingProvider from './glualintProvider';
import GLuaLintFormatter from './glualintFormatter';
import { GLuaLintDownloader } from './glualintDownloader';

export async function activate(context: vscode.ExtensionContext) {
    try {
        await GLuaLintDownloader.ensureGlualintAvailable(context);
    } catch (err: any) {
        vscode.window.showErrorMessage(`GLuaLint initialization error: ${err?.message || err}`);
    }

    const linter = new GLuaLintingProvider();
    linter.activate(context.subscriptions);

    const formatter = new GLuaLintFormatter();
    formatter.activate(context.subscriptions);
}
