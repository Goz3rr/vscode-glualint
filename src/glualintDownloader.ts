import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import * as constants from './constants';
import LintProcess from './LintProcess';

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
        if (await this.checkGlualintRunnable(context)) {
            this.checkForUpdates(context).catch(err => console.warn('glualint update check failed:', err));
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

    public static async downloadLatestGlualint(context: vscode.ExtensionContext, isUpdate = false, targetRelease?: GitHubRelease): Promise<boolean> {
        const title = isUpdate ? 'Updating glualint...' : 'Downloading glualint...';

        return vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title, cancellable: false },
            async (progress) => {
                try {
                    let release = targetRelease;
                    if (!release) {
                        progress.report({ message: 'Fetching release information...' });
                        const res = await this.fetchLatestRelease(context, false);
                        release = res.release;
                    }

                    if (!release) {
                        console.error('glualint: GitHub API returned no release object');
                        vscode.window.showErrorMessage('Failed to fetch glualint release information from GitHub.');
                        return false;
                    }

                    const asset = this.selectAssetForPlatform(release.assets);
                    if (!asset) {
                        vscode.window.showErrorMessage(`No compatible glualint binary found for platform ${process.platform} (${process.arch}). Check console logs for available assets.`);
                        return false;
                    }

                    await this.installReleaseAsset(context, asset, progress);

                    const binaryPath = this.getManagedBinaryPath(context);
                    const config = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);
                    await config.update(constants.CONFIG_LINTER, binaryPath, vscode.ConfigurationTarget.Global);

                    vscode.window.showInformationMessage(`glualint (v${release.tag_name}) ${isUpdate ? 'updated' : 'installed'} successfully!`);
                    return true;
                } catch (error: any) {
                    const action = isUpdate ? 'update' : 'download';
                    console.error(`glualint: Failed to ${action} glualint:`, error);
                    vscode.window.showErrorMessage(`Failed to ${action} glualint: ${error?.message || error}`);
                    return false;
                }
            }
        );
    }

    public static async checkForUpdates(context: vscode.ExtensionContext, isManual = false): Promise<void> {
        const config = vscode.workspace.getConfiguration(constants.CONFIG_SECTION);
        if (!isManual && !config.get<boolean>(constants.CONFIG_CHECK_FOR_UPDATES, true)) {
            return;
        }

        const executable = config.get<string>(constants.CONFIG_LINTER) || 'glualint';
        const installedVersion = await LintProcess.getVersion(executable);
        if (!installedVersion) {
            if (isManual) {
                vscode.window.showWarningMessage(`Could not check for updates: glualint executable '${executable}' was not found.`);
            }
            return;
        }

        try {
            const { release } = await this.fetchLatestRelease(context);
            if (!release) {
                if (isManual) {
                    vscode.window.showInformationMessage(`glualint is up to date (v${installedVersion}).`);
                }
                return;
            }

            const latestVersion = release.tag_name.replace(/^v/, '');
            if (!this.isNewerVersion(latestVersion, installedVersion)) {
                if (isManual) {
                    vscode.window.showInformationMessage(`glualint is up to date (v${installedVersion}).`);
                }
                return;
            }

            const isManaged = path.resolve(executable).startsWith(path.resolve(context.globalStorageUri.fsPath));
            const message = isManaged
                ? `A new version of glualint (v${latestVersion}) is available. (Installed: v${installedVersion})`
                : `A new version of glualint (v${latestVersion}) is available. (Currently using '${executable}' v${installedVersion}). Updating will download a new managed copy of glualint.`;

            const choice = await vscode.window.showInformationMessage(message, 'Update Now', "Don't ask again");
            if (choice === 'Update Now') {
                await this.downloadLatestGlualint(context, true, release);
            } else if (choice === "Don't ask again") {
                await config.update(constants.CONFIG_CHECK_FOR_UPDATES, false, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage("Update notifications muted. You can re-enable 'glualint.checkForUpdates' in settings anytime.");
            }
        } catch (e) {
            console.warn('glualint update check error:', e);
            if (isManual) {
                vscode.window.showErrorMessage(`Failed to check for glualint updates: ${e instanceof Error ? e.message : e}`);
            }
        }
    }

    private static async checkGlualintRunnable(context: vscode.ExtensionContext): Promise<boolean> {
        if (await LintProcess.getVersion()) {
            return true;
        }

        const autoInstalledPath = this.getManagedBinaryPath(context);
        if (fs.existsSync(autoInstalledPath) && await LintProcess.getVersion(autoInstalledPath)) {
            await vscode.workspace.getConfiguration(constants.CONFIG_SECTION)
                .update(constants.CONFIG_LINTER, autoInstalledPath, vscode.ConfigurationTarget.Global);
            return true;
        }

        return false;
    }

    private static fetchLatestRelease(context?: vscode.ExtensionContext, useEtag = true): Promise<{ release?: GitHubRelease; notModified: boolean }> {
        return new Promise((resolve, reject) => {
            const etag = useEtag ? context?.globalState.get<string>('releaseETag') : undefined;
            const options: https.RequestOptions = {
                headers: {
                    'User-Agent': USER_AGENT,
                    ...(etag ? { 'If-None-Match': etag } : {})
                }
            };

            https.get(REPO_RELEASES_URL, options, (res) => {
                if (res.statusCode === 304) {
                    const cachedRelease = context?.globalState.get<GitHubRelease>('cachedRelease');
                    if (!cachedRelease && useEtag && context) {
                        context.globalState.update('releaseETag', undefined);
                        res.resume();
                        this.fetchLatestRelease(context, false).then(resolve).catch(reject);
                        return;
                    }
                    resolve({ release: cachedRelease, notModified: true });
                    res.resume();
                    return;
                }

                if (res.statusCode !== 200) {
                    const err = new Error(`GitHub API returned status ${res.statusCode}`);
                    console.error('glualint: GitHub release request failed', res.statusCode, res.statusMessage);
                    reject(err);
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
                        const releasePayload: GitHubRelease = JSON.parse(data);
                        if (context) {
                            context.globalState.update('cachedRelease', releasePayload);
                        }
                        resolve({ release: releasePayload, notModified: false });
                    } catch (e) {
                        console.error('glualint: Failed to parse GitHub API release JSON response', e);
                        reject(e);
                    }
                });
            }).on('error', err => {
                console.error('glualint: Network error fetching GitHub release', err);
                reject(err);
            });
        });
    }

    private static async installReleaseAsset(
        context: vscode.ExtensionContext,
        asset: GitHubReleaseAsset,
        progress: vscode.Progress<{ message?: string }>
    ): Promise<void> {
        const binDir = path.join(context.globalStorageUri.fsPath, 'bin');
        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        }

        const archivePath = path.join(binDir, asset.name);
        progress.report({ message: `Downloading ${asset.name}...` });
        await this.downloadFile(asset.browser_download_url, archivePath);

        progress.report({ message: 'Extracting binary...' });
        await this.extractArchive(archivePath, binDir);

        if (fs.existsSync(archivePath)) {
            fs.unlinkSync(archivePath);
        }

        const binaryPath = this.findAndPromoteBinary(binDir, EXE_NAME) || path.join(binDir, EXE_NAME);
        if (process.platform !== 'win32' && fs.existsSync(binaryPath)) {
            try {
                fs.chmodSync(binaryPath, 0o755);
            } catch (e) {
                console.warn('Failed to chmod glualint binary:', e);
            }
        }
    }

    private static getManagedBinaryPath(context: vscode.ExtensionContext): string {
        return path.join(context.globalStorageUri.fsPath, 'bin', EXE_NAME);
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
                const options = { headers: { 'User-Agent': USER_AGENT } };
                https.get(currentUrl, options, response => {
                    if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                        if (response.headers.location) {
                            request(response.headers.location);
                            return;
                        }
                    }

                    if (response.statusCode !== 200) {
                        const err = new Error(`Download failed with status code ${response.statusCode}`);
                        console.error('glualint: Asset download failed:', err);
                        reject(err);
                        return;
                    }

                    const fileStream = fs.createWriteStream(destPath);
                    response.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close();
                        resolve();
                    });
                    fileStream.on('error', err => {
                        console.error('glualint: File stream write error during download:', err);
                        fs.unlink(destPath, () => reject(err));
                    });
                }).on('error', err => {
                    console.error('glualint: HTTP request error during asset download:', err);
                    reject(err);
                });
            };

            request(url);
        });
    }

    private static isSupportedArchive(filename: string): boolean {
        const lower = filename.toLowerCase();
        return lower.endsWith('.zip') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz');
    }

    public static selectAssetForPlatform(assets: GitHubReleaseAsset[]): GitHubReleaseAsset | undefined {
        const archiveAssets = assets.filter(a => this.isSupportedArchive(a.name));
        const platform = process.platform;
        const arch = process.arch;

        if (platform === 'win32') {
            return archiveAssets.find(a => a.name.toLowerCase().includes('windows'));
        } else if (platform === 'darwin') {
            return archiveAssets.find(a => {
                const lower = a.name.toLowerCase();
                return lower.includes('osx') || lower.includes('darwin') || lower.includes('mac');
            });
        } else if (platform === 'linux') {
            const targetArch = arch === 'arm64' ? 'aarch64-linux' : 'x86_64-linux';
            return archiveAssets.find(a => a.name.includes(targetArch));
        }

        const assetNames = assets.map(a => a.name).join(', ');
        console.error(`glualint: No compatible binary found for platform '${platform}' (${arch}). Available release assets: [${assetNames}]`);
        return undefined;
    }

    private static async extractArchive(archivePath: string, destDir: string): Promise<void> {
        if (archivePath.endsWith('.zip')) {
            const zip = new AdmZip(archivePath);
            zip.extractAllTo(destDir, true);
        } else if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
            await tar.x({
                file: archivePath,
                cwd: destDir,
            });
        }
    }

    public static isNewerVersion(latest: string, current: string): boolean {
        const cleanLatest = latest.replace(/^v/, '');
        const cleanCurrent = current.replace(/^v/, '');
        return cleanLatest.localeCompare(cleanCurrent, undefined, { numeric: true, sensitivity: 'base' }) > 0;
    }
}
