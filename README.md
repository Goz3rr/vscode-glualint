# vscode-glualint
glualint for vscode

![Screenshot](https://i.imgur.com/c3PxJaT.png)

## Installing
1. Install this extension
2. Download [glualint](https://github.com/FPtje/GLuaFixer) and follow the installation instructions
3. Optionally install an extension that provides glua syntax highlighting like [aStonedPenguin's](https://marketplace.visualstudio.com/items?itemName=aStonedPenguin.glua)

The linter should now be active for any lua and glua files

## Configuration
`glualint.linter`: Points to the glualint executable, defaults to `glualint`  
`glualint.activeLanguages`: Languages IDs to activate the linter for (`lua` and `glua` are supported, defaults to both)  
`glualint.run`: When to run the linter executable (`onSave`, `onType` or `manual`, defaults to `onType`)

Also see [configuring glualint](https://github.com/FPtje/GLuaFixer/blob/master/README.md#configuring-glualint)

## Formatter
This extension also integrates glualint's pretty printing functionality.  
To format your code simply use vscode's built in format document or format selection actions.