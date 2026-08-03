# vscode-glualint
glualint for vscode

![Screenshot](https://i.imgur.com/c3PxJaT.png)

## Installing
1. Install this extension
2. If `glualint` is not installed on your system, the extension will prompt you to download the latest prebuilt binary automatically from [GLuaFixer GitHub Releases](https://github.com/FPtje/GLuaFixer/releases). Alternatively, you can manually download [glualint](https://github.com/FPtje/GLuaFixer) and place it in your system PATH or configure `glualint.linter`.
3. Optionally install an extension that provides glua syntax highlighting like [aStonedPenguin's](https://marketplace.visualstudio.com/items?itemName=aStonedPenguin.glua)

The linter should now be active for any lua and glua files

## Features
- **Linter**: Real-time diagnostic error and warning reporting
- **Formatter**: Code formatting / pretty-printing via VS Code's native `Format Document` and `Format Selection` commands.
- **Automatic Downloads & Updates**: Automatically download glualint binary and checks for version updates on startup (can be disabled).

## Configuration
`glualint.linter`: Points to the glualint executable, defaults to `glualint`  
`glualint.activeLanguages`: Language IDs to activate the linter for (`lua` and `glua` are supported, defaults to both)  
`glualint.run`: When to run the linter executable (`onSave`, `onType` or `manual`, defaults to `onType`)
`glualint.allFiles`: Run the linter on all files in the workspace, even if they are closed. Bypasses `glualint.activeLanguages` setting.
`glualint.config`: Points to a custom configuration file path.
`glualint.workingDirectory`: Override how to set the working directory for the glualint process (`file` or `workspace`, defaults to `file`).
  - `file`: Uses the directory of the file being linted.
  - `workspace`: Uses the root workspace folder. Will not automatically discover nested glualint config files in subdirectories.
`glualint.checkForUpdates`: Automatically check for new versions of glualint on startup (defaults to `true`).

Also see [configuring glualint](https://github.com/FPtje/GLuaFixer/blob/master/README.md#configuring-glualint)