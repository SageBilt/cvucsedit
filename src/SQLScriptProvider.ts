import * as vscode from 'vscode';
import * as CLT from './CustomLookupTree';
import { SQLConnection } from './SQLConnection';

export class SQLScriptProvider implements vscode.TextDocumentContentProvider {
    private UCS: Map<string, string> = new Map();
    private DBVersion: number = 0;
    public UCSListlookupProvider: CLT.LookupTreeDataProvider;
    public UCSLibListlookupProvider: CLT.LookupTreeDataProvider;

    constructor(public SQLConn: SQLConnection, public readonly context: vscode.ExtensionContext) {
        this.UCSListlookupProvider = new CLT.LookupTreeDataProvider(this.context);
        vscode.window.registerTreeDataProvider('CVUCSList', this.UCSListlookupProvider);
        this.UCSLibListlookupProvider = new CLT.LookupTreeDataProvider(this.context);
        vscode.window.registerTreeDataProvider('CVUCSLibList', this.UCSLibListlookupProvider);

    }

    // async loadScripts() {
    //     await sql.connect(config);
    //     const result = await sql.query('SELECT Name, Code, MacroType FROM UCS');
    //     result.recordset.forEach((ucsrecord: { Name: any; Code: string; MacroType: number; }) => {
    //         const FileExt = ucsrecord.MacroType == 1 ? 'js' : 'ucsm';
    //         const uri = vscode.Uri.parse(`cvucs:${ucsrecord.Name}.${FileExt}`);
    //         this.UCS.set(uri.toString(), ucsrecord.Code);
    //     });
    // }
    async GetDBVersion(): Promise<number> {
        const result = await this.SQLConn.ExecuteStatment('Select Version From DbInfo', []);
        if (result.recordset) {
            return result.recordset[0]['Version'];
        }
        return 0;
    }

    async loadSideBarMenus() {
        this.DBVersion = await this.GetDBVersion();
        let SQLText: string;

        if (this.DBVersion >= 2024) {
            /*Load UCS List which includes both UCSM & UCSJS*/
            SQLText = 'SELECT ID,Name, Code, MacroType, UCSLibrary, UCSTypeID,Disabled FROM UCS Where UCSLibrary = 0 Order By Ordinal';
            await this.loadSideBarMenu(this.UCSListlookupProvider, SQLText);
            /*Load JS Libraries */
            SQLText = 'SELECT ID,Name, Code, MacroType, UCSLibrary, UCSTypeID,Disabled FROM UCS Where UCSLibrary = 1 Order By Ordinal';
            await this.loadSideBarMenu(this.UCSLibListlookupProvider, SQLText);

        } else {
            /*Load UCS List for legacy versions which only have UCSM*/
            SQLText = 'SELECT ID,Name, Code,0 as MacroType,0 as UCSLibrary, UCSTypeID,Disabled FROM UCS Order By Ordinal';
            await this.loadSideBarMenu(this.UCSListlookupProvider, SQLText);
        }
    }

    private async loadSideBarMenu(lookupProvider: CLT.LookupTreeDataProvider, SQLText: string) {
        lookupProvider.clearItems();

        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
            //const result = await sql.query('SELECT ID,Name, Code, MacroType, UCSLibrary, UCSTypeID FROM UCS Order By Ordinal'); 
            const List = result.recordset.map((ucsrecord: { ID: number; Name: string; Code: string; MacroType: number; UCSTypeID: number; Disabled: boolean; }) => new CLT.CustomTreeItem(ucsrecord.ID,
                ucsrecord.Name,
                CLT.GetFileType(ucsrecord.UCSTypeID, ucsrecord.MacroType, ucsrecord.Disabled),
                ucsrecord.Code,
                vscode.TreeItemCollapsibleState.Expanded,
                this.context
            )
            );
            lookupProvider.updateResults(List);
        }
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.UCS.get(uri.toString()) || '-- Script not found';
    }
}
