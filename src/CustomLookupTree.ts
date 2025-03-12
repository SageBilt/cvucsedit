import * as vscode from 'vscode';
import * as path from 'path';

interface UCSFileType {
  FileTypeName: string,
  Extension: string,
  IconName : string 
}

const UCSFileTypes: UCSFileType[] = [
  {FileTypeName: "None",Extension: "",IconName: ""},
  {FileTypeName: "Divider",Extension: "",IconName: "Divider.png"},
  {FileTypeName: "UCSJS",Extension: "js",IconName: "UCSJS.png"},
  {FileTypeName: "UCSM",Extension: "ucsm",IconName: "UCSM.png"},
  {FileTypeName: "UCSJS-Disabled",Extension: "js",IconName: "UCSJS-disabled.png"},
  {FileTypeName: "UCSM-Disabled",Extension: "ucsm",IconName: "UCSM-disabled.png"}

]

function GetFileTypeByName(FileTypeName: String): UCSFileType {
  const FileType = UCSFileTypes.find(filetype => filetype.FileTypeName === FileTypeName);
  return FileType ? FileType : UCSFileTypes[0];
}

export function GetFileType(UCSTypeID: number, MacroType: number, Disabled: boolean): UCSFileType {
  if (UCSTypeID == 4) return GetFileTypeByName('Divider');
  else {
    if (Disabled) {
      switch (MacroType) {
        case 1:
          return GetFileTypeByName('UCSJS-Disabled');
        default:
          return GetFileTypeByName('UCSM-Disabled');
      }
    } else {
      switch (MacroType) {
        case 1:
          return GetFileTypeByName('UCSJS');
        default:
          return GetFileTypeByName('UCSM');
      }
    }
  }
}

export class CustomTreeItem extends vscode.TreeItem {
    constructor(
      public readonly UCSID: number,
      public readonly label: string,
      public readonly FileType: UCSFileType,
      public Code: string,
      collapsibleState: vscode.TreeItemCollapsibleState,
      context: vscode.ExtensionContext // Pass context to access extension path
    ) {
      super(label, collapsibleState);
      // Optional: Add a tooltip or description
      this.tooltip = Code.split("\n")[0];//`Type: ${this.extensionType}`;
      this.description = Code.split("\n")[0]; // Displays next to the label

      // Set custom icon path
      this.iconPath = this.getCustomIconPath(FileType.IconName, context);
    }

    private getCustomIconPath(IconName: string, context: vscode.ExtensionContext): vscode.Uri | undefined {
      const iconFolder = path.join(context.extensionPath, 'icons');
      return vscode.Uri.file(path.join(iconFolder, IconName));
    }
  }

export class LookupTreeDataProvider implements vscode.TreeDataProvider<CustomTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<CustomTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  //private results: { label: string; extensionType: string }[] = [];
  private results: CustomTreeItem[] = [];
  private context: vscode.ExtensionContext;
  private documentToTreeItem = new Map<string, CustomTreeItem>();

  constructor(context: vscode.ExtensionContext) {
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

  updateResults(newResults: CustomTreeItem[]) {
    this.results = newResults;
    this._onDidChangeTreeData.fire(); // Refresh the tree
  }

  getTreeItem(element: CustomTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CustomTreeItem): Thenable<CustomTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      this.results.map(result => {
        const treeItem = new CustomTreeItem(
          result.UCSID,
          result.label,
          result.FileType,
          result.Code,
          vscode.TreeItemCollapsibleState.None,
          this.context
        );
        treeItem.command = {
          command: 'cvucsedit.onUCSItemClick',
          title: 'Item Clicked',
          arguments: [treeItem]
        };
        return treeItem;
      })
    );
  }

  getTreeItemByDocumentUri(uri: string): CustomTreeItem | undefined {
    return this.documentToTreeItem.get(uri);
  }

  // Method to store the mapping
  storeTreeItem(documentUri: string, treeItem: CustomTreeItem) {
    this.documentToTreeItem.set(documentUri, treeItem);
  }

  // Method to refresh the Tree View
  refresh() {
    this._onDidChangeTreeData.fire();
  }
}
