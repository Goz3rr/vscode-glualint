import * as assert from 'assert';
import * as vscode from 'vscode';
import LintProcess from '../LintProcess';
import * as utils from '../utils';

suite('Utils & Range Formatting Test Suite', () => {
    test('utils.fullDocumentRange computes accurate range for single and multi-line documents', async () => {
        const singleLineDoc = await vscode.workspace.openTextDocument({
            content: 'local x = 10',
            language: 'lua'
        });
        const singleRange = utils.fullDocumentRange(singleLineDoc);
        assert.strictEqual(singleRange.start.line, 0);
        assert.strictEqual(singleRange.start.character, 0);
        assert.strictEqual(singleRange.end.line, 0);
        assert.strictEqual(singleRange.end.character, 12);

        const multiLineDoc = await vscode.workspace.openTextDocument({
            content: 'local x = 10\nlocal y = 20\nreturn x + y',
            language: 'lua'
        });
        const multiRange = utils.fullDocumentRange(multiLineDoc);
        assert.strictEqual(multiRange.start.line, 0);
        assert.strictEqual(multiRange.start.character, 0);
        assert.strictEqual(multiRange.end.line, 2);
        assert.strictEqual(multiRange.end.character, 12);
    });

    test('range fallback correctly resolves fullDocumentRange when range is undefined', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'print("hello")',
            language: 'lua'
        });
        const range: vscode.Range | undefined = undefined;
        const targetRange = range ?? utils.fullDocumentRange(doc);
        assert.ok(targetRange instanceof vscode.Range);
        assert.strictEqual(targetRange.start.line, 0);
        assert.strictEqual(targetRange.start.character, 0);
        assert.strictEqual(targetRange.end.line, 0);
        assert.strictEqual(targetRange.end.character, 14);
    });

    test('LintProcess.getVersion returns undefined for non-existent executable', async () => {
        const version = await LintProcess.getVersion('non_existent_glualint_binary_xyz');
        assert.strictEqual(version, undefined);
    });

    test('utils.getActiveLanguages returns fallback array', () => {
        const langs = utils.getActiveLanguages();
        assert.ok(Array.isArray(langs));
        assert.ok(langs.includes('glua') || langs.includes('lua'));
    });

    test('utils.getRunMode returns string mode', () => {
        const mode = utils.getRunMode();
        assert.ok(['onType', 'onSave', 'manual'].includes(mode));
    });
});
