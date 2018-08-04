import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

export default class LintProcess {
    public Process: ChildProcess;

    public StdOut: string = '';
    public StdErr: string = '';

    constructor(args: string[] = []) {
        const config = vscode.workspace.getConfiguration('glualint');
        const executable = config.get<string>('linter');
        const options = vscode.workspace.rootPath ? { cwd: vscode.workspace.rootPath } : undefined;

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
