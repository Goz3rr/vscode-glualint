import * as assert from 'assert';
import * as vscode from 'vscode';

suite('GLuaLint Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start glualint extension tests.');

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('goz3rr.vscode-glualint');
        assert.ok(extension, 'Extension goz3rr.vscode-glualint should be present');
    });

    test('Glualint commands should be registered', async () => {
        const extension = vscode.extensions.getExtension('goz3rr.vscode-glualint');
        assert.ok(extension, 'Extension goz3rr.vscode-glualint should be present');
        if (!extension.isActive) {
            await extension.activate();
        }
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('glualint.lint'), 'glualint.lint command should be registered');
    });
});
