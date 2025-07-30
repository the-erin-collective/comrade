// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { registerHelloWorldCommand } from './commands/helloWorld';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
    console.log('Comrade extension is now active!');

    // Register commands
    registerHelloWorldCommand(context);

    // TODO: Initialize core components
    // - Agent Registry
    // - Session Manager
    // - Sidebar Provider
    // - Configuration System
}

// This method is called when your extension is deactivated
export function deactivate() { }
