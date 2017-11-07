'use strict';

import * as vscode from 'vscode';
import GLuaLintingProvider from './glualintProvider';

export function activate(context: vscode.ExtensionContext) {
    const linter = new GLuaLintingProvider();
    linter.activate(context.subscriptions);
}
