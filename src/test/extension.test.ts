import * as assert from 'assert';
import * as vscode from 'vscode';
import { GLuaLintDownloader } from '../glualintDownloader';

suite('GLuaLint Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start glualint extension tests.');

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('goz3rr.vscode-glualint');
        assert.ok(extension, 'Extension goz3rr.vscode-glualint should be present');
    });

    test('Glualint commands should be registered', async () => {
        // Stub out disk/network check for deterministic activation test
        const originalEnsure = GLuaLintDownloader.ensureGlualintAvailable;
        GLuaLintDownloader.ensureGlualintAvailable = async () => {};

        try {
            const extension = vscode.extensions.getExtension('goz3rr.vscode-glualint');
            assert.ok(extension, 'Extension goz3rr.vscode-glualint should be present');
            if (!extension.isActive) {
                await extension.activate();
            }
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('glualint.lint'), 'glualint.lint command should be registered');
        } finally {
            GLuaLintDownloader.ensureGlualintAvailable = originalEnsure;
        }
    });
});
