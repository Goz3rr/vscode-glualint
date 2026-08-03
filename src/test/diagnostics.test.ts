import * as assert from 'assert';
import * as vscode from 'vscode';
import LintProcess from '../LintProcess';

suite('Diagnostic Parsing Test Suite', () => {
    test('correctly parses errors, warnings, and diagnostic tags', () => {
        const sampleOutput = [
            'stdin: [Error] line 5, column 10 - line 5, column 15: Undefined variable foo',
            'stdin: [Warning] line 10, column 1 - line 10, column 5: Unused variable bar',
            'stdin: [Warning] line 12, column 1 - line 12, column 5: Redundant parenthesis',
            'stdin: [Warning] line 14, column 1 - line 14, column 5: Unnecessary semicolon',
            'stdin: [Warning] line 16, column 1 - line 16, column 5: Double negation used',
            'stdin: [Warning] line 20, column 1 - line 20, column 10: Function surface.CreateFont2 is deprecated'
        ].join('\n');

        const parsed = LintProcess.parseDiagnostics(sampleOutput);
        assert.ok(parsed['stdin'], 'Should parse stdin output key');
        assert.strictEqual(parsed['stdin'].length, 6);

        // Error diagnostic
        assert.strictEqual(parsed['stdin'][0].message, 'Undefined variable foo');
        assert.strictEqual(parsed['stdin'][0].severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(parsed['stdin'][0].tags, undefined);

        // Unnecessary tags
        assert.ok(parsed['stdin'][1].tags?.includes(vscode.DiagnosticTag.Unnecessary), 'Unused variable should have Unnecessary tag');
        assert.ok(parsed['stdin'][2].tags?.includes(vscode.DiagnosticTag.Unnecessary), 'Redundant parenthesis should have Unnecessary tag');
        assert.ok(parsed['stdin'][3].tags?.includes(vscode.DiagnosticTag.Unnecessary), 'Unnecessary semicolon should have Unnecessary tag');
        assert.ok(parsed['stdin'][4].tags?.includes(vscode.DiagnosticTag.Unnecessary), 'Double negation should have Unnecessary tag');

        // Deprecated tag
        assert.strictEqual(parsed['stdin'][5].message, 'Function surface.CreateFont2 is deprecated');
        assert.ok(parsed['stdin'][5].tags?.includes(vscode.DiagnosticTag.Deprecated), 'Deprecated function should have Deprecated tag');
    });

    test('handles empty or malformed output cleanly', () => {
        assert.deepStrictEqual(LintProcess.parseDiagnostics(''), {});
        assert.deepStrictEqual(LintProcess.parseDiagnostics('Random error text without format'), {});
    });
});
