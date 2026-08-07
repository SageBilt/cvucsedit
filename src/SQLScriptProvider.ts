import * as vscode from 'vscode';
import * as CLT from './CustomLookupTree';
import { SQLConnection } from './SQLConnection';
import { DynamicData, UCSOpenContex } from './interfaces';
import { MirrorFileStore, MirrorRow, PlacedRow, leadingSentinelLines, leadingSentinel, trailingSentinel } from './MirrorFileStore';
import { DtsGenerator } from './dtsGenerator';

export class SQLScriptProvider {
    private DBVersion: number = 0;
    public UCSListlookupProvider: CLT.LookupTreeDataProvider;
    public UCSLibListlookupProvider: CLT.LookupTreeDataProvider;
    public SQLConn = new SQLConnection();
    public USCMDynamicData: DynamicData = {
        partDefs: [],
        materialParams: [], // Initialize with an empty array
        constructionParams: [],
        scheduleParams: [],
        materials: [],
        constructions: [],
        schedules: [],
        caseStandards: [],
        doors: [],
        connections: []
    } as DynamicData;
    public mirror: MirrorFileStore;

    constructor(public readonly context: vscode.ExtensionContext) {
        this.UCSListlookupProvider = new CLT.LookupTreeDataProvider(this.context);
        vscode.window.registerTreeDataProvider('CVUCSList', this.UCSListlookupProvider);
        this.UCSLibListlookupProvider = new CLT.LookupTreeDataProvider(this.context);
        vscode.window.registerTreeDataProvider('CVUCSLibList', this.UCSLibListlookupProvider);

        this.mirror = new MirrorFileStore(this.SQLConn);
        this.mirror.globalStorage = this.context.globalStorageUri;
        // Keep the tree's cached code in step when an external edit is pushed to the database.
        this.mirror.onCodePushed = (ucsId, code) => this.updateTreeItemCode(ucsId, code);
        this.context.subscriptions.push(this.mirror);

        this.setupSentinelGuard();
    }

    private updateTreeItemCode(ucsId: number, code: string) {
        for (const provider of [this.UCSListlookupProvider, this.UCSLibListlookupProvider]) {
            const item = provider.getTreeItemByUCSID(ucsId);
            if (item) {
                item.Code = code;
                return;
            }
        }
    }

    /**
     * Revert edits to the sentinel lines, which belong to the mirror rather than to the UCS.
     * Registered once, not once per open as it used to be. Edits that bypass the editor entirely are
     * harmless because stripSentinels tolerates a missing or malformed sentinel.
     */
    private setupSentinelGuard() {
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (!event.contentChanges.length) return;

                const item = this.findTreeItemByUri(event.document.uri.toString());
                if (!item) return;

                const kind = CLT.GetSentinelKind(item.FileType, item.isJSLibrary);
                if (kind === 'ucsm') return;

                const doc = event.document;
                const guarded: vscode.Range[] = [];
                if (kind === 'jsLibrary') {
                    guarded.push(doc.lineAt(0).rangeIncludingLineBreak);
                    guarded.push(doc.lineAt(doc.lineCount - 1).range);
                } else {
                    guarded.push(doc.lineAt(doc.lineCount - 1).range);
                }

                const touched = event.contentChanges.some(change =>
                    guarded.some(range => change.range.intersection(range))
                );
                if (!touched) return;

                const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
                if (!editor) return;

                const expectedFirst = leadingSentinel(kind, item.UCSName);
                const expectedLast = trailingSentinel(kind);

                void editor.edit(builder => {
                    if (expectedFirst && doc.lineAt(0).text !== expectedFirst) {
                        builder.replace(doc.lineAt(0).range, expectedFirst);
                    }
                    const last = doc.lineCount - 1;
                    if (expectedLast && doc.lineAt(last).text !== expectedLast) {
                        builder.replace(doc.lineAt(last).range, expectedLast);
                    }
                }, { undoStopBefore: false, undoStopAfter: false });
            })
        );
    }

    /** Decorate the sentinel lines so it is obvious they are not part of the UCS. */
    private applySentinelDecoration(editor: vscode.TextEditor, item: CLT.CustomTreeItem) {
        const kind = CLT.GetSentinelKind(item.FileType, item.isJSLibrary);
        if (kind === 'ucsm') return;

        const doc = editor.document;
        const ranges: vscode.Range[] = [doc.lineAt(doc.lineCount - 1).range];
        if (kind === 'jsLibrary') {
            ranges.unshift(doc.lineAt(0).range);
        }
        editor.setDecorations(this.sentinelDecoration, ranges);
    }

    private sentinelDecoration = vscode.window.createTextEditorDecorationType({
        opacity: '0.35',
        isWholeLine: true
    });

    async GetDBVersion(): Promise<number> {
        const result = await this.SQLConn.ExecuteStatment('Select Version From DbInfo', []);
        if (result.recordset) {
            return result.recordset[0]['Version'];
        }
        return 0;
    }

    async filterUCSList(IsLibraryList:boolean) {
        const searchTerm = await vscode.window.showInputBox({
        placeHolder: 'Search by name or code...',
        prompt: 'Enter a search term to filter the UCS list',
        });

        if (searchTerm !== undefined) {
            if (IsLibraryList)
                this.UCSLibListlookupProvider.filter(searchTerm);
            else
                this.UCSListlookupProvider.filter(searchTerm);
        }
    }

    async clearFilterUCSList(IsLibraryList:boolean) {
        if (IsLibraryList)
            this.UCSLibListlookupProvider.clearFilter();
        else
            this.UCSListlookupProvider.clearFilter();
    }




    async loadSideBarMenus() {
        this.DBVersion = await this.GetDBVersion();
        await this.loadUCSLibraryListSideBarMenu();
        await this.loadUCSListSideBarMenu();

    }

    /**
     * Regenerate cv-api.d.ts and jsconfig.json. Cheap and idempotent, so it runs both at activation
     * and after each list refresh, which keeps the database driven unions (material names and so on)
     * current without the window reload that initializationOptions would need.
     */
    async writeProjectFiles() {
        await this.mirror.initialize();
        const generator = new DtsGenerator();
        await this.mirror.writeProjectFiles(
            generator.build(this.USCMDynamicData),
            generator.buildJsConfig()
        );
    }

    /** UCS:M has no `Divider` code to mirror, so those rows stay in the tree but get no file. */
    private hasCode(FileType: { FileTypeName: string }): boolean {
        return FileType.FileTypeName !== 'Divider' && FileType.FileTypeName !== 'None';
    }

    async loadUCSListSideBarMenu() {
        let SQLText: string;

        if (this.DBVersion >= 2024) {
            /*Load UCS List which includes both UCSM & UCSJS*/
            SQLText = 'SELECT ID,Name, Code, MacroType, UCSLibrary, UCSTypeID,Disabled FROM UCS Where UCSLibrary = 0 Order By Ordinal';
            await this.loadSideBarMenu(this.UCSListlookupProvider, SQLText,false);
        } else {
            /*Load UCS List for legacy versions which only have UCSM*/
            SQLText = 'SELECT ID,Name, Code,0 as MacroType,0 as UCSLibrary, UCSTypeID,Disabled FROM UCS Order By Ordinal';
            await this.loadSideBarMenu(this.UCSListlookupProvider, SQLText,false);
        }    
    }

    async loadUCSLibraryListSideBarMenu() {
        let SQLText: string;

        if (this.DBVersion >= 2024) {
            /*Load JS Libraries */
            SQLText = 'SELECT ID,Name, Code, MacroType, UCSLibrary, UCSTypeID,Disabled FROM UCS Where UCSLibrary = 1 Order By Ordinal';
            await this.loadSideBarMenu(this.UCSLibListlookupProvider, SQLText,true);
        } 
    }

    private async loadSideBarMenu(lookupProvider: CLT.LookupTreeDataProvider, SQLText: string, isJSLibrary: boolean) {
        await this.mirror.initialize();
        lookupProvider.clearItems();

        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (!result.recordset) return;

        const records = result.recordset.map((ucsrecord: { ID: number; Name: string; Code: string; MacroType: number; UCSTypeID: number; Disabled: boolean; }) => ({
            ...ucsrecord,
            FileType: CLT.GetFileType(ucsrecord.UCSTypeID, ucsrecord.MacroType, ucsrecord.Disabled)
        }));

        // Dividers carry no code, so they get a tree entry but no file.
        const mirrorRows: MirrorRow[] = records
            .filter(rec => this.hasCode(rec.FileType))
            .map(rec => ({
                ucsId: rec.ID,
                ucsName: rec.Name,
                code: rec.Code ?? '',
                kind: CLT.GetSentinelKind(rec.FileType, isJSLibrary),
                isLibrary: isJSLibrary
            }));

        const placed = this.mirror.planPaths(mirrorRows);
        const placedById = new Map<number, PlacedRow>(placed.map(row => [row.ucsId, row]));

        const List = records.map(rec => new CLT.CustomTreeItem(
            rec.ID,
            rec.Name,
            placedById.get(rec.ID)?.uri ?? vscode.Uri.parse(`cvucs-divider:/${rec.ID}`),
            rec.Name,
            rec.FileType,
            isJSLibrary,
            rec.Code,
            -1,
            vscode.TreeItemCollapsibleState.Expanded,
            this.context
        ));
        lookupProvider.updateResults(List);

        await this.mirror.syncFromDb(placed, isJSLibrary ? 'lib' : 'ucs');
    }

    public findTreeItemByUri(uri: string): CLT.CustomTreeItem | undefined {
        let item = this.UCSListlookupProvider.getTreeItemByDocumentUri(uri);
        if (!item) {
            item = this.UCSLibListlookupProvider.getTreeItemByDocumentUri(uri);
        }
        return item;
    }

    // public openUCSByURI(uri:string,position:vscode.Range) {
    //     const treeItem = this.UCSListlookupProvider.getTreeItemByDocumentUri(uri);
    //     if (treeItem)
    //         this.openUCS(treeItem,position);
    // }

    // public openUCSByURI(uri:string,position:vscode.Range) {
    //     const treeItem = this.findTreeItemByUri(uri);
    //     if (treeItem)
    //         this.openUCS(treeItem.docURI,position);
    // }

    public async openUCS(UCSContex: UCSOpenContex,highlightRange?:vscode.Range) {

        const item = this.findTreeItemByUri(UCSContex.uri.toString());
        if (!item) return;

        if (item.FileType.FileTypeName === "Divider") {
            vscode.window.showWarningMessage('This is a divider. There is no code associated with this!');
            return;
        }

        const document = await vscode.workspace.openTextDocument(item.docURI);
        const editor = await vscode.window.showTextDocument(document, {
            preview: false
        });

        this.applySentinelDecoration(editor, item);

        // Tree line numbers are relative to the database code, the editor also shows the leading
        // sentinel, so shift by however many sentinel lines precede the code.
        const lineOffset = leadingSentinelLines(CLT.GetSentinelKind(item.FileType, item.isJSLibrary));

        if (UCSContex.searchCodeLine > -1) {
            const lineNumber = UCSContex.searchCodeLine + lineOffset;
            const startChar = UCSContex.contextValue?.indexOf(UCSContex.searchText) || 0;
            const startPos = new vscode.Position(lineNumber, startChar);
            const endPos = new vscode.Position(lineNumber, startChar + UCSContex.searchText.length);
            editor.selection = new vscode.Selection(startPos, endPos);
            editor.revealRange(new vscode.Range(startPos, endPos));
        }

        if (highlightRange) {
            const shifted = new vscode.Range(
                highlightRange.start.translate(lineOffset),
                highlightRange.end.translate(lineOffset)
            );
            editor.selection = new vscode.Selection(shifted.start, shifted.start);
            editor.revealRange(shifted);
        }
    }

    async loadDBVariables() : Promise<DynamicData> {
        await this.loadPartTypes();
        await this.loadMaterialParameters();
        await this.loadConstructionParameters();
        await this.loadScheduleParameters();
        await this.loadCaseStandards();
        await this.loadMaterials();
        await this.loadConstructions();
        await this.loadSchedules();
        await this.loadDoors();
        await this.loadConnections();

        return this.USCMDynamicData;
    }
    
    async loadPartTypes() {
        let SQLText = "Select Part.Name as PartName,Description,refPartClass.Name as ClassName,refPartSubClass.Name as SubClassName\n";
        SQLText += "From (Part Inner Join refPartClass ON refPartClass.ID = Part.PartClassID) Inner Join refPartSubClass ON refPartSubClass.ID = Part.PartSubClassID\n";
        SQLText += "Where Part.Deleted = 0";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
             

            const List = result.recordset.map((ucsrecord: { PartName: string; Description: string; ClassName: string; SubClassName: string}) => ({
                partName: ucsrecord.PartName,
                description: ucsrecord.Description,
                className: ucsrecord.ClassName,
                subClassName: ucsrecord.SubClassName
                })
            );
            this.USCMDynamicData.partDefs = List;
        }
    }

    async loadMaterialParameters() {
        let SQLText = "Select MaterialParameter.Name as ParamName,MaterialParameter.Description as ParamDesc,refParameterType.Name as ParamTypeName\n";
        SQLText += "From (MaterialParameter Inner Join Material ON MaterialID = Material.ID) Inner Join refParameterType ON ParameterTypeID = refParameterType.ID\n";
        SQLText += "Where Material.Deleted = 0\n"
        SQLText += "Group By MaterialParameter.Name,MaterialParameter.Description,refParameterType.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
             

            const List = result.recordset.map((ucsrecord: { ParamName: string; ParamDesc: string; ParamTypeName: string}) => ({
                paramName: ucsrecord.ParamName,
                paramDesc: ucsrecord.ParamDesc,
                paramTypeName: ucsrecord.ParamTypeName,
                })
            );
            this.USCMDynamicData.materialParams = List;
        }
    }

    async loadConstructionParameters() {
        let SQLText = "Select ConstructionParameter.Name as ParamName,ConstructionParameter.Description as ParamDesc,refParameterType.Name as ParamTypeName\n";
        SQLText += "From (ConstructionParameter Inner Join Construction ON ConstructionID = Construction.ID) Inner Join refParameterType ON ParameterTypeID = refParameterType.ID\n";
        SQLText += "Group By ConstructionParameter.Name,ConstructionParameter.Description,refParameterType.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
             

            const List = result.recordset.map((ucsrecord: { ParamName: string; ParamDesc: string; ParamTypeName: string}) => ({
                paramName: ucsrecord.ParamName,
                paramDesc: ucsrecord.ParamDesc,
                paramTypeName: ucsrecord.ParamTypeName,
                })
            );
            this.USCMDynamicData.constructionParams = List;
        }
    }

    async loadScheduleParameters() {
        let SQLText = "Select ScheduleParameter.Name as ParamName,ScheduleParameter.Description as ParamDesc,refParameterType.Name as ParamTypeName\n";
        SQLText += "From (ScheduleParameter Inner Join Schedule ON ScheduleID = Schedule.ID) Inner Join refParameterType ON ParameterTypeID = refParameterType.ID\n";
        SQLText += "Where Schedule.Deleted = 0\n"
        SQLText += "Group By ScheduleParameter.Name,ScheduleParameter.Description,refParameterType.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
             

            const List = result.recordset.map((ucsrecord: { ParamName: string; ParamDesc: string; ParamTypeName: string}) => ({
                paramName: ucsrecord.ParamName,
                paramDesc: ucsrecord.ParamDesc,
                paramTypeName: ucsrecord.ParamTypeName,
                })
            );
            this.USCMDynamicData.scheduleParams = List;
        }
    }

    async loadCaseStandards() {
        let SQLText = "Select refCaseStandard.Name as StdName,refCaseStandard.ID as StdID,refCaseStandard.Description as StdDesc,refParameterType.Name as ParamName\n";
        SQLText += "From refCaseStandard Left Join refParameterType ON ParameterTypeID = refParameterType.ID\n";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
             

            const List = result.recordset.map((ucsrecord: { StdName: string; StdID: number; StdDesc: string; ParamName: string}) => ({
                name: ucsrecord.StdName,
                id: ucsrecord.StdID,
                description: ucsrecord.StdDesc,
                typeName: ucsrecord.ParamName
                })
            );
            this.USCMDynamicData.caseStandards = List;
        }
    }  

    async loadMaterials() {
        let SQLText = "Select Material.Name as MatName,Material.ID as MatID,refMaterialType.Name as MatType,MaterialTypeID,Description\n";
        SQLText += "From Material Inner join refMaterialType ON refMaterialType.ID = MaterialTypeID\n";
        SQLText += "Where System = 0 and Deleted = 0\n"
        SQLText += "Order By Material.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
             

            const List = result.recordset.map((ucsrecord: { MatName: string; MatID: number; MatType: string; MaterialTypeID: number;Description: string}) => ({
                name: ucsrecord.MatName,
                id: ucsrecord.MatID,
                description: ucsrecord.Description,
                typeName: ucsrecord.MatType,
                typeID: ucsrecord.MaterialTypeID
                })
            );
            this.USCMDynamicData.materials = List;
        }
    }

    async loadConstructions() {
        let SQLText = "Select Construction.Name as ConstName,Construction.ID as ConstID,Construction.Description,refConstructionType.Name as ConstType,ConstructionTypeID\n";
        SQLText += "From Construction inner Join refConstructionType ON refConstructionType.ID = ConstructionTypeID\n";
        SQLText += "Where Construction.System = 0\n"
        SQLText += "Order By Construction.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
             

            const List = result.recordset.map((ucsrecord: { ConstName: string; ConstID: number; ConstType: string; ConstructionTypeID: number;Description: string}) => ({
                name: ucsrecord.ConstName,
                id: ucsrecord.ConstID,
                description: ucsrecord.Description,
                typeName: ucsrecord.ConstType,
                typeID: ucsrecord.ConstructionTypeID
                })
            );
            this.USCMDynamicData.constructions = List;
        }
    }

    async loadSchedules() {
        let SQLText = "Select Schedule.Name as SchedName,Schedule.ID as SchedID,Schedule.Description,refPartClass.Name as PartClassName,PartClassID\n";
        SQLText += "From Schedule inner Join refPartClass ON PartClassID = refPartClass.ID\n";
        SQLText += "Where Schedule.Deleted = 0 and Schedule.System = 0\n"
        SQLText += "Order By Schedule.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
             

            const List = result.recordset.map((ucsrecord: { SchedName: string; SchedID: number; PartClassName: string; PartClassID: number;Description: string}) => ({
                name: ucsrecord.SchedName,
                id: ucsrecord.SchedID,
                description: ucsrecord.Description,
                typeName: ucsrecord.PartClassName,
                typeID: ucsrecord.PartClassID
                })
            );
            this.USCMDynamicData.schedules = List;
        }
    }

    async loadDoors() {
        let SQLText = "Select Door.Name as DoorName,Door.ID as DoorID,Door.Description,DoorCatalog.Name as DoorCatName,Door.Notes,Door.Tags\n";
        SQLText += "From Door Inner Join DoorCatalog ON DoorCatalogID = DoorCatalog.ID\n";
        SQLText += "Order By Door.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
             

            const List = result.recordset.map((ucsrecord: { DoorName: string; DoorID: number; DoorCatName: string;Description: string;Notes: string;Tags: string}) => ({
                name: ucsrecord.DoorName,
                id: ucsrecord.DoorID,
                description: ucsrecord.Description,
                CatName: ucsrecord.DoorCatName,
                Notes: ucsrecord.Notes,
                Tags: ucsrecord.Tags,
                })
            );
            this.USCMDynamicData.doors = List;
        }
    }

    async loadConnections() {
        let SQLText = "Select Connection.Name as ConnName,Connection.ID as ConnID,Connection.Description,refConnectionType.Name as ConnTypeName,ConnectionTypeID\n";
        SQLText += "From Connection Inner Join refConnectionType ON ConnectionTypeID = refConnectionType.ID\n";
        SQLText += "Where System = 0\n";
        SQLText += "Order By Connection.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
             

            const List = result.recordset.map((ucsrecord: { ConnName: string; ConnID: number; ConnTypeName: string;Description: string; ConnectionTypeID: number}) => ({
                name: ucsrecord.ConnName,
                id: ucsrecord.ConnID,
                description: ucsrecord.Description,
                typeName: ucsrecord.ConnTypeName,
                typeID: ucsrecord.ConnectionTypeID
                })
            );
            this.USCMDynamicData.connections = List;
        }
    }



    // provideTextDocumentContent(uri: vscode.Uri): string {
    //     return this.UCS.get(uri.toString()) || '-- Script not found';
    // }
}
