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
exports.LookupTreeDataProvider = exports.CustomTreeItem = void 0;
exports.GetFileTypeByName = GetFileTypeByName;
exports.GetFileType = GetFileType;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const UCSFileTypes = [
    { FileTypeName: "None", Extension: "", IconName: "" },
    { FileTypeName: "Divider", Extension: "", IconName: "Divider.png" },
    { FileTypeName: "UCSJS", Extension: "ucsjs", IconName: "UCSJS.png" },
    { FileTypeName: "UCSM", Extension: "ucsm", IconName: "UCSM.png" },
    { FileTypeName: "UCSJS-Disabled", Extension: "ucsjs", IconName: "UCSJS-disabled.png" },
    { FileTypeName: "UCSM-Disabled", Extension: "ucsm", IconName: "UCSM-disabled.png" }
];
function GetFileTypeByName(FileTypeName) {
    const FileType = UCSFileTypes.find(filetype => filetype.FileTypeName === FileTypeName);
    return FileType ? FileType : UCSFileTypes[0];
}
function GetFileType(UCSTypeID, MacroType, Disabled) {
    if (UCSTypeID == 4)
        return GetFileTypeByName('Divider');
    else {
        if (Disabled) {
            switch (MacroType) {
                case 1:
                    return GetFileTypeByName('UCSJS-Disabled');
                default:
                    return GetFileTypeByName('UCSM-Disabled');
            }
        }
        else {
            switch (MacroType) {
                case 1:
                    return GetFileTypeByName('UCSJS');
                default:
                    return GetFileTypeByName('UCSM');
            }
        }
    }
}
class CustomTreeItem extends vscode.TreeItem {
    UCSID;
    UCSName;
    label;
    FileType;
    isJSLibrary;
    Code;
    searchCodeLine;
    docURI;
    constructor(UCSID, UCSName, label, FileType, isJSLibrary, Code, searchCodeLine, collapsibleState, context // Pass context to access extension path
    ) {
        super(label, collapsibleState);
        this.UCSID = UCSID;
        this.UCSName = UCSName;
        this.label = label;
        this.FileType = FileType;
        this.isJSLibrary = isJSLibrary;
        this.Code = Code;
        this.searchCodeLine = searchCodeLine;
        // Optional: Add a tooltip or description
        this.docURI = vscode.Uri.parse(`cvucs:/${UCSName}.${FileType.Extension}`);
        if (this.searchCodeLine == -1) {
            this.tooltip = Code.split("\n")[0]; //`Type: ${this.extensionType}`;
            this.description = Code.split("\n")[0]; // Displays next to the label
            // Set custom icon path
            this.iconPath = this.getCustomIconPath(FileType.IconName, context);
        }
    }
    getCustomIconPath(IconName, context) {
        const iconFolder = path.join(context.extensionPath, 'icons');
        return vscode.Uri.file(path.join(iconFolder, IconName));
    }
}
exports.CustomTreeItem = CustomTreeItem;
class LookupTreeDataProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    //private results: { label: string; extensionType: string }[] = [];
    results = [];
    context;
    documentToTreeItem = new Map();
    searchTerm = ''; // Store the current search term
    filteredResults = []; // Store filtered items
    constructor(context) {
        this.context = context;
    }
    // updateResults(newResults: { label: string; extensionType: string }[]) {
    //   this.results = newResults;
    //   this._onDidChangeTreeData.fire();
    // }
    clearItems() {
        this.results = []; // Reset the data to an empty array
        this.filteredResults = [];
        this.searchTerm = '';
        this._onDidChangeTreeData.fire(); // Notify VS Code of the change
    }
    clearFilter() {
        this.filter('');
        this.refresh;
    }
    updateResults(newResults) {
        this.results = newResults;
        this.filteredResults = newResults; // Initially, no filter applied
        this._onDidChangeTreeData.fire(); // Refresh the tree
    }
    // New filter method
    filter(searchTerm) {
        this.searchTerm = searchTerm.toLowerCase();
        if (!this.searchTerm) {
            this.filteredResults = [...this.results]; // Reset to all items if search is cleared
        }
        else {
            this.filteredResults = this.results.filter(item => {
                const matchesLabel = item.label.toLowerCase().includes(this.searchTerm);
                const matchesCode = item.Code.toLowerCase().includes(this.searchTerm);
                return matchesLabel || matchesCode;
            });
        }
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            // Root level: return filtered items
            return Promise.resolve(this.filteredResults.map(result => {
                const treeItem = new CustomTreeItem(result.UCSID, result.label, result.label, result.FileType, result.isJSLibrary, result.Code, -1, this.searchTerm && result.Code.toLowerCase().includes(this.searchTerm)
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.None, this.context);
                const UCSContext = { uri: treeItem.docURI, searchCodeLine: -1, contextValue: '', searchText: '' };
                treeItem.command = {
                    command: 'cvucsedit.onUCSItemClick',
                    title: 'Item Clicked',
                    arguments: [UCSContext],
                };
                return treeItem;
            }));
        }
        else {
            // Child level: return matching code lines with clickable behavior
            if (this.searchTerm && element.Code.toLowerCase().includes(this.searchTerm)) {
                const codeLines = element.Code.split('\n');
                const childItems = codeLines.map((line, index) => {
                    if (line.toLowerCase().includes(this.searchTerm)) {
                        const childItem = new CustomTreeItem(element.UCSID, // Unique ID
                        element.label, line.trim(), element.FileType, element.isJSLibrary, element.Code, // Pass the full code so it can be opened
                        index, vscode.TreeItemCollapsibleState.None, this.context);
                        // Store the line number in contextValue or another property
                        childItem.contextValue = line;
                        const UCSContext = { uri: childItem.docURI, searchCodeLine: index, contextValue: line.toLowerCase(), searchText: this.searchTerm.toLowerCase() };
                        childItem.command = {
                            command: 'cvucsedit.onUCSItemClick',
                            title: 'Open Line',
                            arguments: [UCSContext],
                        };
                        //element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;  
                        return childItem;
                    }
                    return null;
                }).filter(line => line !== null);
                return Promise.resolve(childItems);
            }
            return Promise.resolve([]);
        }
    }
    getTreeItemByDocumentUri(uri) {
        return this.results.find(item => item.docURI.toString() == uri);
        return this.documentToTreeItem.get(uri);
    }
    // Method to store the mapping
    storeTreeItem(documentUri, treeItem) {
        this.documentToTreeItem.set(documentUri, treeItem);
    }
    // Method to refresh the Tree View
    refresh() {
        this._onDidChangeTreeData.fire();
    }
}
exports.LookupTreeDataProvider = LookupTreeDataProvider;
//# sourceMappingURL=CustomLookupTree.js.map