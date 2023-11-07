import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export default class LintProcess {
    public Process: ChildProcess;

    public StdOut: string = '';
    public StdErr: string = '';

    constructor(docUri: vscode.Uri, args: string[] = []) {
        const config = vscode.workspace.getConfiguration('glualint');
        const executable = config.get<string>('linter');
        const options = {};

        // uri.fsPath is only valid for the file scheme
        if (docUri.scheme === 'file') {
            options['cwd'] = path.dirname(docUri.fsPath);
        }

        this.Process = spawn(executable, args, options);

        this.Process.on('error', (error: any) => {
            if (error.code === 'ENOENT') {
                vscode.window.showErrorMessage(`Failed to find '${executable}'. Are you sure it's in your path?`);
            } else {
                vscode.window.showErrorMessage(`${executable} error: ${error}`);
            }
        });

        this.Process.stdout.on('data', buffer => {
            this.StdOut += buffer;
        });

        this.Process.stderr.on('data', buffer => {
            this.StdErr += buffer;
        });
    }
}
