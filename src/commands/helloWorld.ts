import * as vscode from 'vscode';

export function registerHelloWorldCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('comrade.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World from Comrade!');
  });

  context.subscriptions.push(disposable);
}
