import * as vscode from 'vscode';
import * as path from 'path';

interface UCSFileType {
  FileTypeName: string,
  Extension: string,
  IconName : string, 
  //languageId : string
}

const UCSFileTypes: UCSFileType[] = [
  {FileTypeName: "None",Extension: "",IconName: ""},
  {FileTypeName: "Divider",Extension: "",IconName: "Divider.png"},
  {FileTypeName: "UCSJS",Extension: "ucsjs",IconName: "UCSJS.png"},
  {FileTypeName: "UCSM",Extension: "ucsm",IconName: "UCSM.png"},
  {FileTypeName: "UCSJS-Disabled",Extension: "ucsjs",IconName: "UCSJS-disabled.png"},
  {FileTypeName: "UCSM-Disabled",Extension: "ucsm",IconName: "UCSM-disabled.png"}

]

export function GetFileTypeByName(FileTypeName: String): UCSFileType {
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
    public docURI: vscode.Uri;
    constructor(
      public readonly UCSID: number,
      public readonly UCSName: string,
      public readonly label: string,
      public readonly FileType: UCSFileType,
      public readonly isJSLibrary: boolean,
      public Code: string,
      public searchCodeLine: number,
      collapsibleState: vscode.TreeItemCollapsibleState,
      context: vscode.ExtensionContext // Pass context to access extension path
    ) {
      super(label, collapsibleState);
      // Optional: Add a tooltip or description
      this.docURI = vscode.Uri.parse(`cvucs:/${UCSName}.${FileType.Extension}`);

  
      if (this.searchCodeLine == -1) {
        this.tooltip = Code.split("\n")[0];//`Type: ${this.extensionType}`;
        this.description = Code.split("\n")[0]; // Displays next to the label

        // Set custom icon path
        this.iconPath = this.getCustomIconPath(FileType.IconName, context);
      }
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
  private searchTerm: string = ''; // Store the current search term
  private filteredResults: CustomTreeItem[] = []; // Store filtered items

  constructor(context: vscode.ExtensionContext) {
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

  updateResults(newResults: CustomTreeItem[]) {
    this.results = newResults;
    this.filteredResults = newResults; // Initially, no filter applied
    this._onDidChangeTreeData.fire(); // Refresh the tree
  }

  // New filter method
  filter(searchTerm: string) {
    this.searchTerm = searchTerm.toLowerCase();
    if (!this.searchTerm) {
      this.filteredResults = [...this.results]; // Reset to all items if search is cleared
    } else {
      this.filteredResults = this.results.filter(item => {
        const matchesLabel = item.label.toLowerCase().includes(this.searchTerm);
        const matchesCode = item.Code.toLowerCase().includes(this.searchTerm);
        return matchesLabel || matchesCode;
      });
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CustomTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CustomTreeItem): Thenable<CustomTreeItem[]> {
    if (!element) {
      // Root level: return filtered items

      return Promise.resolve(
        this.filteredResults.map(result => {
          const treeItem = new CustomTreeItem(
            result.UCSID,
            result.label,
            result.label,
            result.FileType,
            result.isJSLibrary,
            result.Code,
            -1,
            this.searchTerm && result.Code.toLowerCase().includes(this.searchTerm)
              ? vscode.TreeItemCollapsibleState.Expanded
              : vscode.TreeItemCollapsibleState.None,
            this.context,
          );
          treeItem.command = {
            command: 'cvucsedit.onUCSItemClick',
            title: 'Item Clicked',
            arguments: [treeItem],
          };
          return treeItem;
        })
      );
    } else {
      // Child level: return matching code lines with clickable behavior

      if (this.searchTerm && element.Code.toLowerCase().includes(this.searchTerm)) {
        const codeLines = element.Code.split('\n');
        const childItems = codeLines.map((line, index) => {
          if (line.toLowerCase().includes(this.searchTerm)) {
            const childItem = new CustomTreeItem(
              element.UCSID, // Unique ID
              element.label,
              line.trim(),
              element.FileType,
              element.isJSLibrary,
              element.Code, // Pass the full code so it can be opened
              index,
              vscode.TreeItemCollapsibleState.None,
              this.context
            );
            // Store the line number in contextValue or another property
            childItem.contextValue = line;
            childItem.command = {
              command: 'cvucsedit.onUCSItemClick',
              title: 'Open Line',
              arguments: [childItem],
            };
            //element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;  

            return childItem;
          }
          return null;
        }).filter(line => line !== null) as CustomTreeItem[];
        return Promise.resolve(childItems);
      }
      return Promise.resolve([]);
    }
  }

  getTreeItemByDocumentUri(uri: string): CustomTreeItem | undefined {
    return this.results.find(item => item.docURI.toString() == uri);

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
