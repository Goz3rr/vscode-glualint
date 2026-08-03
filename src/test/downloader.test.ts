import * as assert from 'assert';
import { GLuaLintDownloader } from '../glualintDownloader';

suite('Downloader Test Suite', () => {
    test('isNewerVersion correctly compares version numbers', () => {
        assert.strictEqual(GLuaLintDownloader.isNewerVersion('1.30.0', '1.29.0'), true, '1.30.0 > 1.29.0');
        assert.strictEqual(GLuaLintDownloader.isNewerVersion('v1.30.0', '1.29.0'), true, 'v1.30.0 > 1.29.0');
        assert.strictEqual(GLuaLintDownloader.isNewerVersion('1.29.1', '1.29.0'), true, '1.29.1 > 1.29.0');
        assert.strictEqual(GLuaLintDownloader.isNewerVersion('2.0.0', '1.29.0'), true, '2.0.0 > 1.29.0');

        assert.strictEqual(GLuaLintDownloader.isNewerVersion('1.29.0', '1.29.0'), false, 'Same version');
        assert.strictEqual(GLuaLintDownloader.isNewerVersion('1.28.0', '1.29.0'), false, 'Older version');
    });

    test('selectAssetForPlatform identifies platform asset', () => {
        const sampleAssets = [
            { name: 'glualint-1.29.0-Windows.zip', browser_download_url: 'https://example.com/win.zip' },
            { name: 'glualint-1.29.0-OSX-x86_64.tar.gz', browser_download_url: 'https://example.com/mac.tar.gz' },
            { name: 'glualint-1.29.0-x86_64-linux.zip', browser_download_url: 'https://example.com/linux.zip' }
        ];

        const asset = GLuaLintDownloader.selectAssetForPlatform(sampleAssets);
        if (process.platform === 'win32') {
            assert.strictEqual(asset?.name, 'glualint-1.29.0-Windows.zip');
        } else if (process.platform === 'darwin') {
            assert.strictEqual(asset?.name, 'glualint-1.29.0-OSX-x86_64.tar.gz');
        } else if (process.platform === 'linux') {
            assert.strictEqual(asset?.name, 'glualint-1.29.0-x86_64-linux.zip');
        }
    });
});
