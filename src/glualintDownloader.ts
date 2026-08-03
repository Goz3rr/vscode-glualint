import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as constants from './constants';
import LintProcess from './LintProcess';

const execAsync = promisify(exec);

const REPO_RELEASES_URL = 'https://api.github.com/repos/FPtje/GLuaFixer/releases/latest';
const USER_AGENT = 'vscode-glualint-extension';
const EXE_NAME = process.platform === 'win32' ? 'glualint.exe' : 'glualint';

interface GitHubReleaseAsset {
    name: string;
    browser_download_url: string;
}

interface GitHubRelease {
    tag_name: string;
    assets: GitHubReleaseAsset[];
}

export class GLuaLintDownloader {
    public static async ensureGlualintAvailable(context: vscode.ExtensionContext): Promise<void> {
        const isAvailable = await this.checkGlualintRunnable(context);
        if (isAvailable) {
            this.checkForUpdates(context)
                .catch(err => console.warn('glualint update check failed:', err));

            return;
        }

        const choice = await vscode.window.showWarningMessage(
            "glualint executable could not be found. Would you like to download it automatically or configure the path?",
            'Download Automatically',
            'Configure Path'
        );

        if (choice === 'Download Automatically') {
            await this.downloadLatestGlualint(context);
        } else if (choice === 'Configure Path') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'glualint.linter');
        }
    }

    public static async downloadLatestGlualint(context: vscode.ExtensionContext, isUpdate = false): Promise<boolean> {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: isUpdate ? 'Updating glualint...' : 'Downloading glualint...',
                cancellable: false
            },
            async (progress) => {
                try {
                    progress.report({ message: 'Fetching release information...' });
                    const { release } = await this.fetchLatestRelease(context);
                    if (!release) {
                        vscode.window.showErrorMessage('Failed to fetch glualint release information from GitHub.');
                        return false;
                    }

                    const asset = this.selectAssetForPlatform(release.assets);
                    if (!asset) {
                        vscode.window.showErrorMessage(`No compatible glualint binary found for platform ${process.platform} (${process.arch}).`);
                        return false;
                    }

                    const storageDir = context.globalStorageUri.fsPath;
                    const binDir = path.join(storageDir, 'bin');
                    if (!fs.existsSync(binDir)) {
                        fs.mkdirSync(binDir, { recursive: true });
                    }

                    const archivePath = path.join(binDir, asset.name);
                    progress.report({ message: `Downloading ${asset.name}...` });
                    await this.downloadFile(asset.browser_download_url, archivePath);

                    progress.report({ message: 'Extracting binary...' });
                    const binaryPath = this.findAndPromoteBinary(binDir, EXE_NAME) || path.join(binDir, EXE_NAME);

                    await this.extractArchive(archivePath, binDir);

                    if (fs.existsSync(archivePath)) {
                        fs.unlinkSync(archivePath);
                    }

                    if (process.platform !== 'win32') {
                        try {
                            fs.chmodSync(binaryPath, 0o755);
                        } catch (e) {
                            console.warn('Failed to chmod glualint binary:', e);
                        }
                    }

                    const config = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);
                    await config.update(constants.CONFIG_LINTER, binaryPath, vscode.ConfigurationTarget.Global);

                    vscode.window.showInformationMessage(`glualint (v${release.tag_name}) ${isUpdate ? 'updated' : 'installed'} successfully!`);
                    return true;
                } catch (error: any) {
                    const action = isUpdate ? 'update' : 'download';
                    vscode.window.showErrorMessage(`Failed to ${action} glualint: ${error?.message || error}`);
                    return false;
                }
            }
        );
    }

    public static async checkForUpdates(context: vscode.ExtensionContext): Promise<void> {
        const config = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);
        const checkForUpdates = config.get<boolean>(constants.CONFIG_CHECK_FOR_UPDATES, true);
        if (!checkForUpdates) {
            return;
        }

        const executable = config.get<string>(constants.CONFIG_LINTER) || 'glualint';
        const installedVersion = await LintProcess.getVersion(executable);
        if (!installedVersion) {
            return;
        }

        try {
            const { release, notModified } = await this.fetchLatestRelease(context);
            if (notModified || !release) {
                return;
            }
            const latestVersion = release.tag_name.replace(/^v/, '');

            if (this.isNewerVersion(latestVersion, installedVersion)) {
                const isManaged = path.resolve(executable).startsWith(path.resolve(context.globalStorageUri.fsPath));

                const message = isManaged
                    ? `A new version of glualint (v${latestVersion}) is available. (Installed: v${installedVersion})`
                    : `A new version of glualint (v${latestVersion}) is available. (Currently using '${executable}' v${installedVersion}). Updating will download a new managed copy of glualint.`;

                const choice = await vscode.window.showInformationMessage(
                    message,
                    'Update Now',
                    "Don't ask again"
                );

                if (choice === 'Update Now') {
                    await this.downloadLatestGlualint(context, true);
                } else if (choice === "Don't ask again") {
                    await config.update(constants.CONFIG_CHECK_FOR_UPDATES, false, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage("Update notifications muted. You can re-enable 'glualint.checkForUpdates' in settings anytime.");
                }
            }
        } catch (e) {
            console.warn('glualint update check error:', e);
        }
    }

    private static async checkGlualintRunnable(context: vscode.ExtensionContext): Promise<boolean> {
        const version = await LintProcess.getVersion();
        if (version) {
            return true;
        }

        const autoInstalledPath = path.join(context.globalStorageUri.fsPath, 'bin', EXE_NAME);
        if (fs.existsSync(autoInstalledPath)) {
            const autoVersion = await LintProcess.getVersion(autoInstalledPath);
            if (autoVersion) {
                await vscode.workspace.getConfiguration(constants.CONFIG_SECTION).update(constants.CONFIG_LINTER, autoInstalledPath, vscode.ConfigurationTarget.Global);
                return true;
            }
        }
        return false;
    }

    private static fetchLatestRelease(context?: vscode.ExtensionContext): Promise<{ release?: GitHubRelease; notModified: boolean }> {
        return new Promise((resolve, reject) => {
            const etag = context?.globalState.get<string>('releaseETag');
            const options: https.RequestOptions = {
                headers: {
                    'User-Agent': USER_AGENT,
                    ...(etag ? { 'If-None-Match': etag } : {})
                }
            };

            https.get(REPO_RELEASES_URL, options, (res) => {
                if (res.statusCode === 304) {
                    resolve({ notModified: true });
                    res.resume();
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`GitHub API returned status ${res.statusCode}`));
                    res.resume();
                    return;
                }

                const newEtag = res.headers.etag;
                if (newEtag && context) {
                    context.globalState.update('releaseETag', newEtag);
                }

                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve({ release: JSON.parse(data), notModified: false });
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    private static findAndPromoteBinary(dir: string, exeName: string): string | undefined {
        const target = path.join(dir, exeName);
        if (fs.existsSync(target)) {
            return target;
        }

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const subPath = path.join(dir, entry.name, exeName);
                    if (fs.existsSync(subPath)) {
                        fs.renameSync(subPath, target);
                        return target;
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to scan extracted archive subfolders:', e);
        }

        return undefined;
    }

    private static downloadFile(url: string, destPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = (currentUrl: string) => {
                const options = { headers: { 'User-Agent': 'vscode-glualint-extension' } };
                https.get(currentUrl, options, response => {
                    if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                        if (response.headers.location) {
                            request(response.headers.location);
                            return;
                        }
                    }

                    if (response.statusCode !== 200) {
                        reject(new Error(`Download failed with status code ${response.statusCode}`));
                        return;
                    }

                    const fileStream = fs.createWriteStream(destPath);
                    response.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close();
                        resolve();
                    });
                    fileStream.on('error', err => {
                        fs.unlink(destPath, () => reject(err));
                    });
                }).on('error', reject);
            };

            request(url);
        });
    }

    public static selectAssetForPlatform(assets: GitHubReleaseAsset[]): GitHubReleaseAsset | undefined {
        const platform = process.platform;
        const arch = process.arch;

        if (platform === 'win32') {
            return assets.find(a => a.name.toLowerCase().includes('windows') && a.name.endsWith('.zip'));
        } else if (platform === 'darwin') {
            return assets.find(a => (a.name.toLowerCase().includes('osx') || a.name.toLowerCase().includes('darwin') || a.name.toLowerCase().includes('mac')) && (a.name.endsWith('.tar.gz') || a.name.endsWith('.zip')));
        } else if (platform === 'linux') {
            if (arch === 'arm64') {
                return assets.find(a => a.name.includes('aarch64-linux') && a.name.endsWith('.zip'));
            }
            return assets.find(a => a.name.includes('x86_64-linux') && a.name.endsWith('.zip'));
        }

        return undefined;
    }

    private static async extractArchive(archivePath: string, destDir: string): Promise<void> {
        if (archivePath.endsWith('.zip')) {
            if (process.platform === 'win32') {
                await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`);
            } else {
                await execAsync(`unzip -o "${archivePath}" -d "${destDir}"`);
            }
        } else if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
            await execAsync(`tar -xzf "${archivePath}" -C "${destDir}"`);
        }
    }

    public static isNewerVersion(latest: string, current: string): boolean {
        const cleanLatest = latest.replace(/^v/, '');
        const cleanCurrent = current.replace(/^v/, '');
        return cleanLatest.localeCompare(cleanCurrent, undefined, { numeric: true, sensitivity: 'base' }) > 0;
    }
}
