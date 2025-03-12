"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = __importStar(require("vscode"));
class CustomTreeItem extends vscode.TreeItem {
    label;
    extensionType;
    Code;
    constructor(label, extensionType, Code, collapsibleState) {
        super(label, collapsibleState);
        this.label = label;
        this.extensionType = extensionType;
        this.Code = Code;
        // Optional: Add a tooltip or description
        this.tooltip = `Type: ${this.extensionType}`;
        this.description = Code.substring(0, 50); // Displays next to the label
    }
}
class LookupTreeDataProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    results = [];
    updateResults(newResults) {
        this.results = newResults;
        this._onDidChangeTreeData.fire(); // Refresh the tree
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]); // No children for leaf nodes
        }
        // Return top-level items (lookup results) with commands
        return Promise.resolve(this.results.map(result => {
            const treeItem = new vscode.TreeItem(result, vscode.TreeItemCollapsibleState.None);
            treeItem.command = {
                command: 'cvucsedit.onUCSItemClick', // Command to run on click
                title: 'Item Clicked',
                arguments: [result] // Pass the result label to the command
            };
            return treeItem;
        }));
    }
}
//# sourceMappingURL=LookupTreeDataProvider.js.map