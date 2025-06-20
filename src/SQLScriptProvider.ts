import * as vscode from 'vscode';
import * as CLT from './CustomLookupTree';
import { DatabaseFileSystemProvider } from './DatabaseFileSystemProvider';
import { SQLConnection } from './SQLConnection';
import { DynamicData, UCSOpenContex } from './interfaces';
import { referenceParser } from './referenceParser';
import { TextDocument } from 'vscode';

export class SQLScriptProvider {
    private UCS: Map<string, string> = new Map();
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
    public UCSJSLibRefParser = new referenceParser;
    public textProvider = new DatabaseFileSystemProvider();

    constructor(public readonly context: vscode.ExtensionContext) {
        this.UCSListlookupProvider = new CLT.LookupTreeDataProvider(this.context);
        vscode.window.registerTreeDataProvider('CVUCSList', this.UCSListlookupProvider);
        this.UCSLibListlookupProvider = new CLT.LookupTreeDataProvider(this.context);
        vscode.window.registerTreeDataProvider('CVUCSLibList', this.UCSLibListlookupProvider);
        vscode.workspace.registerFileSystemProvider('cvucs', this.textProvider, { isCaseSensitive: false });

        this.setupLanguageHandler();
    }

    private setupLanguageHandler() {
        this.context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(async (doc) => {
                if (doc.uri.scheme === 'cvucs') {
                    const treeItem = this.findTreeItemByUri(doc.uri.toString());
                    if (treeItem) {
                        const langId = ["UCSJS", "UCSJS-Disabled"].includes(treeItem.FileType.FileTypeName) ? 'javascript' : 'ucsm';
                        if (doc.languageId !== langId) {
                            console.log(`Setting language for ${doc.uri.toString()} to ${langId}`);
                            await vscode.languages.setTextDocumentLanguage(doc, langId);
                        }
                    }
                }
            })
        );
    }

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
        lookupProvider.clearItems();

        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
             
            const List = result.recordset.map((ucsrecord: { ID: number; Name: string; Code: string; MacroType: number; UCSTypeID: number; Disabled: boolean; }) => new CLT.CustomTreeItem(
                ucsrecord.ID,
                ucsrecord.Name,
                ucsrecord.Name,
                CLT.GetFileType(ucsrecord.UCSTypeID, ucsrecord.MacroType, ucsrecord.Disabled),
                isJSLibrary,
                ucsrecord.Code,
                -1,
                vscode.TreeItemCollapsibleState.Expanded,
                this.context
            )
            );
            lookupProvider.updateResults(List);

            this.createFilesInFileSystem(List)
            this.addClassRefs(List);
        }
    }

    private createFilesInFileSystem(list: CLT.CustomTreeItem[]) {
        list.forEach(item => {
            // Wrap JavaScript code in a class for UCSJS/UCSJS-Disabled
            const wrappedCode = item.isJSLibrary
            ? this.addClassDefToLibraryCode(item)
            : item.Code;
        
            this.textProvider.writeFile(item.docURI, Buffer.from(wrappedCode, 'utf8'), { create: true, overwrite: true });
        });
    }

    private addClassRefs(list: CLT.CustomTreeItem[]) {
        list.forEach(item => {
            const fType = item.FileType.FileTypeName;
            if (['UCSJS','UCSJS-Disabled'].includes(fType)) { //only pass enabled ones for now
                const docURI = this.parseURI(item);
                if (item.isJSLibrary) {
                    const wrappedCode = this.addClassDefToLibraryCode(item);
                    const docName = '_' + item.label;
                    this.UCSJSLibRefParser.updateClasses(docName,docURI.toString(),wrappedCode,fType != 'UCSJS-Disabled');
                } else {
                    this.UCSJSLibRefParser.updateReferences(item.label,docURI.toString(),item.Code);
                }
            }
        });
    }

    public updateClassRefsForDoc(document: TextDocument) {
        let treeItem = this.UCSLibListlookupProvider.getTreeItemByDocumentUri(document.uri.toString());
        if (!treeItem) treeItem = this.UCSListlookupProvider.getTreeItemByDocumentUri(document.uri.toString());
        if (treeItem) {
            const fType = treeItem.FileType.FileTypeName;
            const newCode = document.getText();
            const docName = document.fileName.split("\\")[1].split(".")[0] ;
            if (treeItem.isJSLibrary)
                this.UCSJSLibRefParser.updateClasses('_' + docName,document.uri.toString(),newCode, fType != 'UCSJS-Disabled');
            else
                this.UCSJSLibRefParser.updateReferences(docName,document.uri.toString(),newCode);
        }

    }

    private parseURI(item: CLT.CustomTreeItem) {
        return vscode.Uri.parse(`cvucs:/${item.label}.${item.FileType.Extension}`);
    }

    private addClassDefToLibraryCode(item: CLT.CustomTreeItem) : string {
        return `class _${item.label} {\r\n${item.Code}\r\n}`;   
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

        let item = this.UCSListlookupProvider.getTreeItemByDocumentUri(UCSContex.uri.toString());
        if (!item)
            item = this.UCSLibListlookupProvider.getTreeItemByDocumentUri(UCSContex.uri.toString());

        if (!item) return;

        if (item.FileType.FileTypeName === "Divider") {
            vscode.window.showWarningMessage('This is a divider. There is no code associated with this!');
            return;
        }

        const uri = item.docURI;// this.parseURI(item); 

        
        // // Wrap JavaScript code in a class for UCSJS/UCSJS-Disabled
        // const wrappedCode = item.isJSLibrary
        //     ? this.addClassDefToLibraryCode(item)
        //     : item.Code;
    
        // this.textProvider.writeFile(uri, Buffer.from(wrappedCode, 'utf8'), { create: true, overwrite: true });
    
        const document = await vscode.workspace.openTextDocument(uri);
        // const LangId = ["UCSJS", "UCSJS-Disabled"].includes(item.FileType.FileTypeName) ? 'javascript' : 'ucsm';
        // await vscode.languages.setTextDocumentLanguage(document, LangId);
        console.log('Opened document URI:', document.uri.toString());
    
        const editor = await vscode.window.showTextDocument(document, {
            preview: false
        });
    
        // Make first and last lines readonly for JavaScript files
        if (item.isJSLibrary) {
            const firstLineRange = new vscode.Range(0, 0, 0, 50);
            const lastLineRange = new vscode.Range(document.lineCount - 1, 0, document.lineCount, 0);
    
            const decorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(200, 200, 200, 0.3)',
                opacity: '0.3', // Makes text semi-transparent
                isWholeLine: true
            });
            editor.setDecorations(decorationType, [firstLineRange, lastLineRange]);
    
            let originalFirstLine = document.lineAt(0).text;
            let originalLastLine = document.lineAt(document.lineCount - 1).text;
    
            vscode.workspace.onDidChangeTextDocument(event => {
                const firstLineRange = new vscode.Range(0, 0, 0, 50);
                const lastLineRange = new vscode.Range(document.lineCount - 1, 0, document.lineCount, 0);

                if (event.document.uri.toString() === document.uri.toString()) {
                    let needsRevert = false;
                    for (const change of event.contentChanges) {
                        if (change.range.intersection(firstLineRange) || change.range.intersection(lastLineRange)) {
                            needsRevert = true;
                            break;
                        }
                    }
                    if (needsRevert) {
                        editor.edit(editBuilder => {
                            const currentFirstLine = document.lineAt(0).text;
                            const currentLastLine = document.lineAt(document.lineCount - 1).text;
                            if (currentFirstLine !== originalFirstLine) {
                                editBuilder.replace(firstLineRange, originalFirstLine);
                            }
                            if (currentLastLine !== originalLastLine) {
                                editBuilder.replace(lastLineRange, originalLastLine);
                            }
                        }).then(success => {
                            if (success) {
                                // Ensure cursor stays out of readonly areas
                                const selection = editor.selection;
                                if (selection.intersection(firstLineRange) || selection.intersection(lastLineRange)) {
                                    editor.selection = new vscode.Selection(
                                        new vscode.Position(1, 0),
                                        new vscode.Position(1, 0)
                                    );
                                    editor.setDecorations(decorationType, [firstLineRange, lastLineRange]);
                                }
                            }
                        });
                    }
                }
            });
        }
    
        //this.UCSListlookupProvider.storeTreeItem(document.uri.toString(), item);
    
        if (UCSContex.searchCodeLine > -1) {
            const lineNumber = UCSContex.searchCodeLine + (item.isJSLibrary ? 1 : 0); // Offset for class line
            const startChar = UCSContex.contextValue?.indexOf(UCSContex.searchText) || 0;
            const startPos = new vscode.Position(lineNumber, startChar);
            const endPos = new vscode.Position(lineNumber, startChar + UCSContex.searchText.length);
            editor.selection = new vscode.Selection(startPos, endPos);
            editor.revealRange(new vscode.Range(startPos, endPos));
        }

        if (highlightRange) {
            //const lineNumber = highlightRange.start.line
            //const startPos = item.isJSLibrary ? new vscode.Position(lineNumber, startChar); :  ;
            editor.selection = new vscode.Selection(highlightRange.start,highlightRange.start);
            editor.revealRange(highlightRange);
        }
    }

    private stripFirstLastLines(document: vscode.TextDocument) : string {
        const lineCount = document.lineCount;
        const start = new vscode.Position(1, 0); // Start of second line
        const end = new vscode.Position(lineCount - 1, 0); // Start of last line
        const contentRange = new vscode.Range(start, end);
        return document.getText(contentRange);
    }


    public saveUCS(document: vscode.TextDocument) {
        if (document.uri.scheme === 'cvucs') {
            const key = `treeItem:${document.uri.toString()}`;
            let treeItem = this.UCSListlookupProvider.getTreeItemByDocumentUri(document.uri.toString());
            if (!treeItem)
                treeItem = this.UCSLibListlookupProvider.getTreeItemByDocumentUri(document.uri.toString());

            if (treeItem) {
                const scriptId = treeItem.UCSID;
                const content = treeItem.isJSLibrary ? this.stripFirstLastLines(document) : document.getText();

                this.SQLConn.ExecuteStatment(`Update UCS Set Code = @Code Where ID = @ID`,[{"Name":"ID","Value": scriptId},{"Name":"Code","Value": content}]);
                treeItem.Code = content;
                //vscode.window.showInformationMessage(`Updated UCS ${treeItem.label} in Cabinet Vision SQL Server Database.`);
            }
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
