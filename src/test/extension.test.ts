import * as assert from 'assert';
import * as vscode from 'vscode';

suite('GLuaLint Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start glualint extension tests.');

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('goz3rr.vscode-glualint');
        assert.ok(extension, 'Extension goz3rr.vscode-glualint should be present');
    });

    test('Glualint commands should be registered', async function () {
        this.timeout(10000);

        // Stub VS Code UI prompt so missing-binary toast resolves immediately in headless CI
        const originalShowWarning = vscode.window.showWarningMessage;
        (vscode.window as any).showWarningMessage = async () => undefined;

        try {
            const extension = vscode.extensions.getExtension('goz3rr.vscode-glualint');
            assert.ok(extension, 'Extension goz3rr.vscode-glualint should be present');
            if (!extension.isActive) {
                await extension.activate();
            }
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('glualint.lint'), 'glualint.lint command should be registered');
        } finally {
            (vscode.window as any).showWarningMessage = originalShowWarning;
        }
    });
});
