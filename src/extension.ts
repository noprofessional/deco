// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExecException } from 'child_process';
import { start } from 'repl';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "exdeco" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	// const disposable = vscode.commands.registerCommand('exdeco.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from exdeco!');
	// });
	// context.subscriptions.push(disposable);

	const decoData = new DecoData();

	const codeLensProvider = vscode.languages.registerCodeLensProvider(
		{ scheme: 'file', language: 'cpp' }, // You can adjust this to support other languages or all files
		new MyCodeLensProvider(decoData)
	);
	context.subscriptions.push(codeLensProvider);

	const disposable2 = vscode.commands.registerCommand('deco.addDecoComment', () => {
		vscode.window.showInputBox({
			placeHolder: "Enter a comment text",
			prompt: "Add Decorative Comment: "
		}).then((val) => {
			if (!val) {
				return;
			}

			if (val.length == 0) {
				return;
			}

			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return;
			}

			if (!vscode.workspace.workspaceFolders) {
				return;
			}

			const document = editor.document;
			const selection = editor.selection;
			const calrel = path.relative(vscode.workspace.workspaceFolders[0].uri.path, document.uri.fsPath);
			const line = selection.active.line

			var lineDatas = decoData.get().get(calrel)
			if (!lineDatas) {
				lineDatas = new Map<number, string>();
				decoData.get().set(calrel, lineDatas);
			}
			lineDatas.set(line, val);
		});
	});
	context.subscriptions.push(disposable2);


	var intervalId = setInterval(() => {
		decoData.save();
	}, 5000); 

	context.subscriptions.push({
        dispose: () => {
            if (intervalId) {
                clearInterval(intervalId);
                console.log('Repeating timer cleared!');
            }
        }
    });

	let disposable3 = vscode.workspace.onDidChangeTextDocument((event) => {
        // The event contains details about the changes
        const changes = event.contentChanges;

        changes.forEach(change => {
            const startLine = change.range.start.line;
            const endLine = change.range.end.line;
			const addlines = change.text.split('\n').length-1;
 			// console.log("===================================");
			// console.log(`Change line ${startLine}-${endLine}`);
			// console.log(`range offset ${change.rangeOffset}`);
			// console.log(`range length ${change.rangeLength}`);
			// console.log(`range str [${change.text}]`);

			if (!vscode.workspace.workspaceFolders) {
				return;
			}

			const calrel = path.relative(vscode.workspace.workspaceFolders[0].uri.path, event.document.uri.fsPath);
			decoData.update(calrel, startLine, endLine, addlines)
        });
    });

    context.subscriptions.push(disposable3);
}

class DecoData {
	private decoData: Map<string, Map<number, string>> = new Map<string, Map<number, string>>();
	constructor() {
		// Load the .deco file data when the extension activates
		this.loadDecoFileData();
	}

	private loadDecoFileData() {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath; // Get the workspace folder path
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('No workspace folder found!');
			return;
		}

		// Construct the path to the .coco file in the top-level directory
		const cocoFilePath = path.join(workspaceFolder, '.deco');

		// Check if the .coco file exists
		if (fs.existsSync(cocoFilePath)) {
			// Read the file asynchronously
			fs.readFile(cocoFilePath, 'utf-8', (err, data) => {
				if (err) {
					vscode.window.showErrorMessage(`Failed to read .deco file: ${err.message}`);
					return;
				}

				// Assuming the .coco file is a JSON file, parse it
				try {
					for(const val of Object.entries(JSON.parse(data))){
						if(val[1] instanceof Object){
							var innerMap = new Map<number,string>()
							for(const innerval of Object.entries(val[1])){
								innerMap.set(parseInt(innerval[0]),innerval[1])
							}
							this.decoData.set(val[0], innerMap)
						}
					}
					// console.log('Loaded .deco data:', this.decoData);
				} catch (parseError: any) {
					vscode.window.showErrorMessage(`Failed to parse .deco file: ${parseError.message}`);
				}
			});
		} else {
			vscode.window.showErrorMessage('.deco file not found in the workspace root.');
		}
	}

	get() {
		return this.decoData;
	}

	save(){
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath; // Get the workspace folder path
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('No workspace folder found!');
			return;
		}

		// Construct the path to the .coco file in the top-level directory
		const cocoFilePath = path.join(workspaceFolder, '.deco');
		var obj:{[key:string]:any} = {}
		for(const linedata of this.decoData){
			obj[linedata[0]] = Object.fromEntries(linedata[1])
		}

		const data = JSON.stringify(obj)
		fs.writeFileSync(cocoFilePath, data)
	}

	update(path:string, delBegLine:number, delEndLine:number, addLines:number){

		var lineDatas = this.decoData.get(path)
		if(!lineDatas){
			return;
		}

		var newLineDatas = new Map<number,string>()
		for(const [line, label] of lineDatas){
			var res = ""

			// no deletion happens
			if(delBegLine == delEndLine){
				if(line < delEndLine){
					newLineDatas.set(line, label)
					res = "keep"
				}else{
					res = "move"
					newLineDatas.set(line -(delEndLine - delBegLine) + addLines, label);
				}
			}else{
				if(line < delBegLine){
					newLineDatas.set(line, label)
					res = "keep"
				} else if(line < delEndLine){
					res = "delt"
				} else {
					res = "move"
					newLineDatas.set(line -(delEndLine - delBegLine) + addLines, label);
				}
			}
			// console.log(res + " " + line + "[" + delBegLine + "," + delEndLine+"]+" + addLines)
		}
		this.decoData.set(path, newLineDatas);
	}
}


// CodeLens provider class
class MyCodeLensProvider implements vscode.CodeLensProvider {
	private deco: DecoData | null = null;

	constructor(deco: DecoData) {
		this.deco = deco;
	}

	// Provide CodeLens for each line
	provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
		const codeLenses: vscode.CodeLens[] = [];

		if (!this.deco) {
			return codeLenses
		}

		if (this.deco.get().size == 0) {
			return codeLenses
		}

		// only support open folder
		if (!vscode.workspace.workspaceFolders) {
			return codeLenses;
		}

		const calrel = path.relative(vscode.workspace.workspaceFolders[0].uri.path, document.uri.fsPath);
		const ary = this.deco.get().get(calrel)
		if (!ary) {
			return codeLenses
		}

		for (const val of ary) {
			const line = val[0]
			const label = val[1]
			if (line >= document.lineCount) {
				break
			}

			const lineRange = new vscode.Range(line, 0, line, 0);

			const codeLens = new vscode.CodeLens(lineRange);
			codeLens.command = {
				title: label, // Display the label from .coco file
				command: '', // Command to be executed when clicked
				arguments: [line] // Pass the line number to the command
			};

			codeLenses.push(codeLens);
		}
		return codeLenses;
	}

	// Optionally, you can handle resolving the CodeLens (e.g., updating CodeLens dynamically)
	resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens | Thenable<vscode.CodeLens> {
		// For now, we just return the CodeLens as is, without any further resolution
		return codeLens;
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }
