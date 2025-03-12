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
exports.GetFileType = GetFileType;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const UCSFileTypes = [
    { FileTypeName: "None", Extension: "", IconName: "" },
    { FileTypeName: "Divider", Extension: "", IconName: "Divider.png" },
    { FileTypeName: "UCSJS", Extension: "js", IconName: "UCSJS.png" },
    { FileTypeName: "UCSM", Extension: "ucsm", IconName: "UCSM.png" },
    { FileTypeName: "UCSJS-Disabled", Extension: "js", IconName: "UCSJS-disabled.png" },
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
    label;
    FileType;
    Code;
    constructor(UCSID, label, FileType, Code, collapsibleState, context // Pass context to access extension path
    ) {
        super(label, collapsibleState);
        this.UCSID = UCSID;
        this.label = label;
        this.FileType = FileType;
        this.Code = Code;
        // Optional: Add a tooltip or description
        this.tooltip = Code.split("\n")[0]; //`Type: ${this.extensionType}`;
        this.description = Code.split("\n")[0]; // Displays next to the label
        // Set custom icon path
        this.iconPath = this.getCustomIconPath(FileType.IconName, context);
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
    constructor(context) {
        this.context = context;
    }
    // updateResults(newResults: { label: string; extensionType: string }[]) {
    //   this.results = newResults;
    //   this._onDidChangeTreeData.fire();
    // }
    clearItems() {
        this.results = []; // Reset the data to an empty array
        this._onDidChangeTreeData.fire(); // Notify VS Code of the change
    }
    updateResults(newResults) {
        this.results = newResults;
        this._onDidChangeTreeData.fire(); // Refresh the tree
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.results.map(result => {
            const treeItem = new CustomTreeItem(result.UCSID, result.label, result.FileType, result.Code, vscode.TreeItemCollapsibleState.None, this.context);
            treeItem.command = {
                command: 'cvucsedit.onUCSItemClick',
                title: 'Item Clicked',
                arguments: [treeItem]
            };
            return treeItem;
        }));
    }
    getTreeItemByDocumentUri(uri) {
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