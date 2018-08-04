'use strict';

import * as vscode from 'vscode';
import GLuaLintingProvider from './glualintProvider';
import GLuaLintFormatter from './glualintFormatter';

export function activate(context: vscode.ExtensionContext) {
    const linter = new GLuaLintingProvider();
    linter.activate(context.subscriptions);

    const formatter = new GLuaLintFormatter();
    formatter.activate(context.subscriptions);
}
