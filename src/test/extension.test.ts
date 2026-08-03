import * as assert from 'assert';
import * as vscode from 'vscode';
import LintProcess from '../LintProcess';

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

    test('LintProcess.parseDiagnostics should correctly parse glualint output and attach diagnostic tags', () => {
        const sampleOutput = [
            'stdin: [Error] line 5, column 10 - line 5, column 15: Undefined variable foo',
            'stdin: [Warning] line 10, column 1 - line 10, column 5: Unused variable bar',
            'stdin: [Warning] line 20, column 1 - line 20, column 10: Function surface.CreateFont2 is deprecated'
        ].join('\n');

        const parsed = LintProcess.parseDiagnostics(sampleOutput);
        assert.ok(parsed['stdin'], 'Should parse stdin output key');
        assert.strictEqual(parsed['stdin'].length, 3);

        // Standard diagnostic
        assert.strictEqual(parsed['stdin'][0].message, 'Undefined variable foo');
        assert.strictEqual(parsed['stdin'][0].severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(parsed['stdin'][0].tags, undefined);

        // Unnecessary tag
        assert.strictEqual(parsed['stdin'][1].message, 'Unused variable bar');
        assert.ok(parsed['stdin'][1].tags?.includes(vscode.DiagnosticTag.Unnecessary));

        // Deprecated tag
        assert.strictEqual(parsed['stdin'][2].message, 'Function surface.CreateFont2 is deprecated');
        assert.ok(parsed['stdin'][2].tags?.includes(vscode.DiagnosticTag.Deprecated));
    });
});



