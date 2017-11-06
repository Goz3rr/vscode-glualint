'use strict';

import * as vscode from 'vscode'; 
import GLuaLintingProvider from './glualintProvider';

export function activate(context: vscode.ExtensionContext) {
    let linter = new GLuaLintingProvider();	
    linter.activate(context.subscriptions);
}