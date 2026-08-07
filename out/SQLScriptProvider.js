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
exports.SQLScriptProvider = void 0;
const vscode = __importStar(require("vscode"));
const CLT = __importStar(require("./CustomLookupTree"));
const SQLConnection_1 = require("./SQLConnection");
const MirrorFileStore_1 = require("./MirrorFileStore");
const dtsGenerator_1 = require("./dtsGenerator");
const agentDocs_1 = require("./agentDocs");
class SQLScriptProvider {
    context;
    DBVersion = 0;
    UCSListlookupProvider;
    UCSLibListlookupProvider;
    SQLConn = new SQLConnection_1.SQLConnection();
    USCMDynamicData = {
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
    };
    mirror;
    constructor(context) {
        this.context = context;
        this.UCSListlookupProvider = new CLT.LookupTreeDataProvider(this.context);
        vscode.window.registerTreeDataProvider('CVUCSList', this.UCSListlookupProvider);
        this.UCSLibListlookupProvider = new CLT.LookupTreeDataProvider(this.context);
        vscode.window.registerTreeDataProvider('CVUCSLibList', this.UCSLibListlookupProvider);
        this.mirror = new MirrorFileStore_1.MirrorFileStore(this.SQLConn);
        this.mirror.globalStorage = this.context.globalStorageUri;
        // Keep the tree's cached code in step when an external edit is pushed to the database.
        this.mirror.onCodePushed = (ucsId, code) => this.updateTreeItemCode(ucsId, code);
        this.context.subscriptions.push(this.mirror);
        this.setupSentinelGuard();
    }
    updateTreeItemCode(ucsId, code) {
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
    setupSentinelGuard() {
        this.context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
            if (!event.contentChanges.length)
                return;
            const item = this.findTreeItemByUri(event.document.uri.toString());
            if (!item)
                return;
            const kind = CLT.GetSentinelKind(item.FileType, item.isJSLibrary);
            const doc = event.document;
            // Which lines are guarded comes from whether each sentinel returns a value, not from
            // the kind: UCS:M has no wrapper but does carry the generated header, so a `kind`
            // test here would leave those lines unprotected.
            const expectedFirst = (0, MirrorFileStore_1.leadingSentinel)(kind, item.UCSName);
            const expectedLast = (0, MirrorFileStore_1.trailingSentinel)(kind);
            const leadRange = this.leadingRange(doc, expectedFirst);
            const guarded = [];
            if (leadRange) {
                guarded.push(leadRange);
            }
            if (expectedLast) {
                guarded.push(doc.lineAt(doc.lineCount - 1).range);
            }
            const touched = event.contentChanges.some(change => guarded.some(range => change.range.intersection(range)));
            if (!touched)
                return;
            const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
            if (!editor)
                return;
            void editor.edit(builder => {
                if (expectedFirst && leadRange && doc.getText(leadRange) !== expectedFirst) {
                    builder.replace(leadRange, expectedFirst);
                }
                const last = doc.lineCount - 1;
                if (expectedLast && doc.lineAt(last).text !== expectedLast) {
                    builder.replace(doc.lineAt(last).range, expectedLast);
                }
            }, { undoStopBefore: false, undoStopAfter: false });
        }));
    }
    /**
     * The document range covered by the leading sentinel, which is a block rather than a line since
     * the generated header was added. Clamped to the document: a file truncated by something outside
     * the editor must not throw here.
     */
    leadingRange(doc, leading) {
        if (!leading) {
            return undefined;
        }
        const lastLine = Math.min(leading.split('\n').length, doc.lineCount) - 1;
        return new vscode.Range(0, 0, lastLine, doc.lineAt(lastLine).text.length);
    }
    /** Decorate the sentinel lines so it is obvious they are not part of the UCS. */
    applySentinelDecoration(editor, item) {
        const kind = CLT.GetSentinelKind(item.FileType, item.isJSLibrary);
        const doc = editor.document;
        const ranges = [];
        const leadRange = this.leadingRange(doc, (0, MirrorFileStore_1.leadingSentinel)(kind, item.UCSName));
        if (leadRange) {
            ranges.push(leadRange);
        }
        if ((0, MirrorFileStore_1.trailingSentinel)(kind)) {
            ranges.push(doc.lineAt(doc.lineCount - 1).range);
        }
        editor.setDecorations(this.sentinelDecoration, ranges);
    }
    sentinelDecoration = vscode.window.createTextEditorDecorationType({
        opacity: '0.35',
        isWholeLine: true
    });
    async GetDBVersion() {
        const result = await this.SQLConn.ExecuteStatment('Select Version From DbInfo', []);
        if (result.recordset) {
            return result.recordset[0]['Version'];
        }
        return 0;
    }
    async filterUCSList(IsLibraryList) {
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
    async clearFilterUCSList(IsLibraryList) {
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
        const generator = new dtsGenerator_1.DtsGenerator();
        await this.mirror.writeProjectFiles(generator.build(this.USCMDynamicData), generator.buildJsConfig());
        // The mirror is reachable by AI agents, so it has to carry its own instructions. `cv-api.d.ts`
        // covers the UCS:JS API and nothing else: not the sync rules, and not UCS:M at all.
        const config = vscode.workspace.getConfiguration('cvucsedit');
        const docs = new agentDocs_1.AgentDocsGenerator();
        await this.mirror.writeAgentDocs({
            'AGENTS.md': docs.buildAgentsMd(config.get('Database', 'CVData'), config.get('Server', '(unknown server)'), this.mirror.rootLabel),
            'CLAUDE.md': docs.buildClaudeMd(),
            'ucsjs-reference.md': docs.buildUcsjsReference(),
            'ucsm-reference.md': docs.buildUcsmReference()
        });
        // ...and a pointer at the workspace root, which is the only place most agent tools look.
        await this.mirror.writeRootPointer(docs.buildRootPointer(this.mirror.rootLabel), agentDocs_1.AgentDocsGenerator.mergeRootPointer, () => this.announceRootPointer());
    }
    /**
     * Say so, once ever, the first time we touch a file at the root of someone's project. Silently
     * editing a repository's own AGENTS.md would be a nasty surprise however useful it is.
     */
    announceRootPointer() {
        if (this.context.globalState.get('cvucsedit.announcedRootPointer')) {
            return;
        }
        void this.context.globalState.update('cvucsedit.announcedRootPointer', true);
        void vscode.window.showInformationMessage('Added a Cabinet Vision UCS section to AGENTS.md and CLAUDE.md in your workspace root, ' +
            'so AI agents find the mirrored UCS folder. Only the marked block is ever rewritten.', 'Undo and disable').then(choice => {
            if (choice) {
                void vscode.workspace.getConfiguration('cvucsedit')
                    .update('WriteRootAgentFiles', false, vscode.ConfigurationTarget.Global);
                void this.removeRootPointer();
            }
        });
    }
    /** Take the block back out again, leaving anything the user wrote around it untouched. */
    async removeRootPointer() {
        const root = this.mirror.workspaceRoot;
        if (!root) {
            return;
        }
        for (const name of ['AGENTS.md', 'CLAUDE.md']) {
            const uri = vscode.Uri.joinPath(root, name);
            try {
                const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
                const begin = text.indexOf(agentDocs_1.AgentDocsGenerator.BLOCK_BEGIN);
                const end = text.indexOf(agentDocs_1.AgentDocsGenerator.BLOCK_END);
                if (begin === -1 || end < begin) {
                    continue;
                }
                const rest = (text.slice(0, begin) + text.slice(end + agentDocs_1.AgentDocsGenerator.BLOCK_END.length)).trim();
                // A file that was nothing but our block is ours to remove; anything else is the user's.
                if (rest) {
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(`${rest}\n`, 'utf8'));
                }
                else {
                    await vscode.workspace.fs.delete(uri);
                }
            }
            catch {
                // Not there, or not writable. Nothing to undo.
            }
        }
    }
    /** UCS:M has no `Divider` code to mirror, so those rows stay in the tree but get no file. */
    hasCode(FileType) {
        return FileType.FileTypeName !== 'Divider' && FileType.FileTypeName !== 'None';
    }
    async loadUCSListSideBarMenu() {
        let SQLText;
        if (this.DBVersion >= 2024) {
            /*Load UCS List which includes both UCSM & UCSJS*/
            SQLText = 'SELECT ID,Name, Code, MacroType, UCSLibrary, UCSTypeID,Disabled FROM UCS Where UCSLibrary = 0 Order By Ordinal';
            await this.loadSideBarMenu(this.UCSListlookupProvider, SQLText, false);
        }
        else {
            /*Load UCS List for legacy versions which only have UCSM*/
            SQLText = 'SELECT ID,Name, Code,0 as MacroType,0 as UCSLibrary, UCSTypeID,Disabled FROM UCS Order By Ordinal';
            await this.loadSideBarMenu(this.UCSListlookupProvider, SQLText, false);
        }
    }
    async loadUCSLibraryListSideBarMenu() {
        let SQLText;
        if (this.DBVersion >= 2024) {
            /*Load JS Libraries */
            SQLText = 'SELECT ID,Name, Code, MacroType, UCSLibrary, UCSTypeID,Disabled FROM UCS Where UCSLibrary = 1 Order By Ordinal';
            await this.loadSideBarMenu(this.UCSLibListlookupProvider, SQLText, true);
        }
    }
    async loadSideBarMenu(lookupProvider, SQLText, isJSLibrary) {
        await this.mirror.initialize();
        lookupProvider.clearItems();
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (!result.recordset)
            return;
        const records = result.recordset.map((ucsrecord) => ({
            ...ucsrecord,
            FileType: CLT.GetFileType(ucsrecord.UCSTypeID, ucsrecord.MacroType, ucsrecord.Disabled)
        }));
        // Dividers carry no code, so they get a tree entry but no file.
        const mirrorRows = records
            .filter(rec => this.hasCode(rec.FileType))
            .map(rec => ({
            ucsId: rec.ID,
            ucsName: rec.Name,
            code: rec.Code ?? '',
            kind: CLT.GetSentinelKind(rec.FileType, isJSLibrary),
            isLibrary: isJSLibrary
        }));
        const placed = this.mirror.planPaths(mirrorRows);
        const placedById = new Map(placed.map(row => [row.ucsId, row]));
        const List = records.map(rec => new CLT.CustomTreeItem(rec.ID, rec.Name, placedById.get(rec.ID)?.uri ?? vscode.Uri.parse(`cvucs-divider:/${rec.ID}`), rec.Name, rec.FileType, isJSLibrary, rec.Code, -1, vscode.TreeItemCollapsibleState.Expanded, this.context));
        lookupProvider.updateResults(List);
        await this.mirror.syncFromDb(placed, isJSLibrary ? 'lib' : 'ucs');
    }
    findTreeItemByUri(uri) {
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
    async openUCS(UCSContex, highlightRange) {
        const item = this.findTreeItemByUri(UCSContex.uri.toString());
        if (!item)
            return;
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
        const lineOffset = (0, MirrorFileStore_1.leadingSentinelLines)(CLT.GetSentinelKind(item.FileType, item.isJSLibrary), item.UCSName);
        if (UCSContex.searchCodeLine > -1) {
            const lineNumber = UCSContex.searchCodeLine + lineOffset;
            const startChar = UCSContex.contextValue?.indexOf(UCSContex.searchText) || 0;
            const startPos = new vscode.Position(lineNumber, startChar);
            const endPos = new vscode.Position(lineNumber, startChar + UCSContex.searchText.length);
            editor.selection = new vscode.Selection(startPos, endPos);
            editor.revealRange(new vscode.Range(startPos, endPos));
        }
        if (highlightRange) {
            const shifted = new vscode.Range(highlightRange.start.translate(lineOffset), highlightRange.end.translate(lineOffset));
            editor.selection = new vscode.Selection(shifted.start, shifted.start);
            editor.revealRange(shifted);
        }
    }
    async loadDBVariables() {
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
            const List = result.recordset.map((ucsrecord) => ({
                partName: ucsrecord.PartName,
                description: ucsrecord.Description,
                className: ucsrecord.ClassName,
                subClassName: ucsrecord.SubClassName
            }));
            this.USCMDynamicData.partDefs = List;
        }
    }
    async loadMaterialParameters() {
        let SQLText = "Select MaterialParameter.Name as ParamName,MaterialParameter.Description as ParamDesc,refParameterType.Name as ParamTypeName\n";
        SQLText += "From (MaterialParameter Inner Join Material ON MaterialID = Material.ID) Inner Join refParameterType ON ParameterTypeID = refParameterType.ID\n";
        SQLText += "Where Material.Deleted = 0\n";
        SQLText += "Group By MaterialParameter.Name,MaterialParameter.Description,refParameterType.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
            const List = result.recordset.map((ucsrecord) => ({
                paramName: ucsrecord.ParamName,
                paramDesc: ucsrecord.ParamDesc,
                paramTypeName: ucsrecord.ParamTypeName,
            }));
            this.USCMDynamicData.materialParams = List;
        }
    }
    async loadConstructionParameters() {
        let SQLText = "Select ConstructionParameter.Name as ParamName,ConstructionParameter.Description as ParamDesc,refParameterType.Name as ParamTypeName\n";
        SQLText += "From (ConstructionParameter Inner Join Construction ON ConstructionID = Construction.ID) Inner Join refParameterType ON ParameterTypeID = refParameterType.ID\n";
        SQLText += "Group By ConstructionParameter.Name,ConstructionParameter.Description,refParameterType.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
            const List = result.recordset.map((ucsrecord) => ({
                paramName: ucsrecord.ParamName,
                paramDesc: ucsrecord.ParamDesc,
                paramTypeName: ucsrecord.ParamTypeName,
            }));
            this.USCMDynamicData.constructionParams = List;
        }
    }
    async loadScheduleParameters() {
        let SQLText = "Select ScheduleParameter.Name as ParamName,ScheduleParameter.Description as ParamDesc,refParameterType.Name as ParamTypeName\n";
        SQLText += "From (ScheduleParameter Inner Join Schedule ON ScheduleID = Schedule.ID) Inner Join refParameterType ON ParameterTypeID = refParameterType.ID\n";
        SQLText += "Where Schedule.Deleted = 0\n";
        SQLText += "Group By ScheduleParameter.Name,ScheduleParameter.Description,refParameterType.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
            const List = result.recordset.map((ucsrecord) => ({
                paramName: ucsrecord.ParamName,
                paramDesc: ucsrecord.ParamDesc,
                paramTypeName: ucsrecord.ParamTypeName,
            }));
            this.USCMDynamicData.scheduleParams = List;
        }
    }
    async loadCaseStandards() {
        let SQLText = "Select refCaseStandard.Name as StdName,refCaseStandard.ID as StdID,refCaseStandard.Description as StdDesc,refParameterType.Name as ParamName\n";
        SQLText += "From refCaseStandard Left Join refParameterType ON ParameterTypeID = refParameterType.ID\n";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
            const List = result.recordset.map((ucsrecord) => ({
                name: ucsrecord.StdName,
                id: ucsrecord.StdID,
                description: ucsrecord.StdDesc,
                typeName: ucsrecord.ParamName
            }));
            this.USCMDynamicData.caseStandards = List;
        }
    }
    async loadMaterials() {
        let SQLText = "Select Material.Name as MatName,Material.ID as MatID,refMaterialType.Name as MatType,MaterialTypeID,Description\n";
        SQLText += "From Material Inner join refMaterialType ON refMaterialType.ID = MaterialTypeID\n";
        SQLText += "Where System = 0 and Deleted = 0\n";
        SQLText += "Order By Material.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
            const List = result.recordset.map((ucsrecord) => ({
                name: ucsrecord.MatName,
                id: ucsrecord.MatID,
                description: ucsrecord.Description,
                typeName: ucsrecord.MatType,
                typeID: ucsrecord.MaterialTypeID
            }));
            this.USCMDynamicData.materials = List;
        }
    }
    async loadConstructions() {
        let SQLText = "Select Construction.Name as ConstName,Construction.ID as ConstID,Construction.Description,refConstructionType.Name as ConstType,ConstructionTypeID\n";
        SQLText += "From Construction inner Join refConstructionType ON refConstructionType.ID = ConstructionTypeID\n";
        SQLText += "Where Construction.System = 0\n";
        SQLText += "Order By Construction.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
            const List = result.recordset.map((ucsrecord) => ({
                name: ucsrecord.ConstName,
                id: ucsrecord.ConstID,
                description: ucsrecord.Description,
                typeName: ucsrecord.ConstType,
                typeID: ucsrecord.ConstructionTypeID
            }));
            this.USCMDynamicData.constructions = List;
        }
    }
    async loadSchedules() {
        let SQLText = "Select Schedule.Name as SchedName,Schedule.ID as SchedID,Schedule.Description,refPartClass.Name as PartClassName,PartClassID\n";
        SQLText += "From Schedule inner Join refPartClass ON PartClassID = refPartClass.ID\n";
        SQLText += "Where Schedule.Deleted = 0 and Schedule.System = 0\n";
        SQLText += "Order By Schedule.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
            const List = result.recordset.map((ucsrecord) => ({
                name: ucsrecord.SchedName,
                id: ucsrecord.SchedID,
                description: ucsrecord.Description,
                typeName: ucsrecord.PartClassName,
                typeID: ucsrecord.PartClassID
            }));
            this.USCMDynamicData.schedules = List;
        }
    }
    async loadDoors() {
        let SQLText = "Select Door.Name as DoorName,Door.ID as DoorID,Door.Description,DoorCatalog.Name as DoorCatName,Door.Notes,Door.Tags\n";
        SQLText += "From Door Inner Join DoorCatalog ON DoorCatalogID = DoorCatalog.ID\n";
        SQLText += "Order By Door.Name";
        const result = await this.SQLConn.ExecuteStatment(SQLText, []);
        if (result.recordset) {
            const List = result.recordset.map((ucsrecord) => ({
                name: ucsrecord.DoorName,
                id: ucsrecord.DoorID,
                description: ucsrecord.Description,
                CatName: ucsrecord.DoorCatName,
                Notes: ucsrecord.Notes,
                Tags: ucsrecord.Tags,
            }));
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
            const List = result.recordset.map((ucsrecord) => ({
                name: ucsrecord.ConnName,
                id: ucsrecord.ConnID,
                description: ucsrecord.Description,
                typeName: ucsrecord.ConnTypeName,
                typeID: ucsrecord.ConnectionTypeID
            }));
            this.USCMDynamicData.connections = List;
        }
    }
}
exports.SQLScriptProvider = SQLScriptProvider;
//# sourceMappingURL=SQLScriptProvider.js.map