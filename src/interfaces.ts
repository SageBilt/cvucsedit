import { Uri } from 'vscode';
import { Range } from 'vscode-languageserver/node';

// Define an interface for the language configuration
export interface LanguageConfig {
  languageId: string;
  systemJsonPath: string;
  syntaxJsonPath: string;
  controlStructuresJsonPath: string;
}

export interface UCSOpenContex {
  uri : Uri;
  searchCodeLine : number;
  contextValue : string;
  searchText : string;
}

export interface SymbolInfo {
  name: string;
  uri: string; // Document URI where it’s defined
  range: Range; // Location of the declaration
  dataType?: string;
  scope?: string; // Optional: e.g., "global", "functionName"
}

export interface UCSMSpecialObject {  
  prefix: string;
  propertyPattern: string;
  allowsSubProperties: boolean;
  description: string;
}

export interface UCSMVariableTypes {
    name: string;
    value: string;
    description: string;
}

export interface UCSMSystemFunctions {
    name: string;
    value: string;
    description: string;
    inputType?: string;
    returnType?: string;
}

export interface ControlStructure {
  openingKeyword: string;
  requiredSuffix: string | null;
  closingKeyword: string;
  supportsElse: boolean;
  customValidation?: string;
}
export interface ClosingPairs {
  opening: string;
  closing: string;
  name: string;
}

export interface UCSMSystemVariable {
  name: string;
  description: string;
  type: string;
  validRange: string;
  appliesTo: string;
  values: string;
  visibility: string;
  Remarks: string;
  parentObject: string;
}
export interface UCSMSystemData {
  keywords: string[];
  variables: UCSMSystemVariable[];
  functions: UCSMSystemFunctions[];
  types: UCSMVariableTypes[];
  specialObjects: UCSMSpecialObject[];
  objectClass: string[];
  objectTypes: string[];
}

export interface UCSMSyntaxData {
  valueTypes: string[];
  dimTypes: string[];
  forEachTypes: string[];
}

/*----------------- UCS JS -------------------*/

export interface UCSJSObject {
    name: string;
    Type?: string;
}

/**
 * A Cabinet Vision class that `_cvSystem.CreateObject` can hand back. `name` is the interface
 * emitted into cv-api.d.ts and the value that methods and properties reference through
 * `objectType`; `createName` is the string CreateObject is called with. `cad` marks the 2D CAD
 * entities, which are the classes `AddCAD` accepts.
 */
export interface UCSJSClass {
    name: string;
    createName: string;
    cad?: boolean;
    description: string;
    example?: string;
}

export interface UCSJSSystemFunction {
    name: string;
    definition: string;
    value: string;
    description: string;
    example: string;
}

export interface UCSJSSystemProperty {
    name: string;
    parentObject: string[],
    value: string;
    description: string;
    Type: string;
    objectType?:string;
}

export interface UCSJSParameterDef {
    ParamName: string;
    ParamValue: string;
    DataType: string;
}
export interface UCSJSSystemMethod {
    name: string;
    parentObject: string[],
    definition: string;
    value: string;
    description: string;
    example: string;
    returnType: string;
    parameterDef: UCSJSParameterDef[];
    objectType?:string;
    /** Emit one overload per entry in `classes`, keyed on the class name literal (CreateObject). */
    factory?: boolean;
}

export interface UCSJSSystemConstants {
    AssemblyTypes: string[];
    parameterModTypes: string[];
    parameterModStyles: string[];
    databaseIDTypes: string[];
    parameterTypes: string[];
    objectClass: string[];
    objectTypes: string[];
    assemblyEndTypes: string[];
    ShapeSideType: string[];
    ShapeAxis: string[];
    CADLineType: string[];
    CADLineWidth: string[];
    CADTextVAlign: string[];
    CADTextHAlign: string[];
    CADArrowType: string[];
    CADDimTextVPosition: string[];
    CADDimTextHPosition: string[];
}

/**
 * One entry of `Languages/ucsjs/ucsjs.snippets.json`, in VS Code's own snippet file shape. The file
 * is no longer contributed through `package.json`, because a `"language": "javascript"` snippet
 * contribution applies to every JavaScript document in the window; the server offers them instead,
 * where the document selector already scopes them to UCS:JS.
 */
export interface UCSJSSnippet {
    prefix: string;
    /** A snippet body is a string or an array of lines, as in a .code-snippets file. */
    body: string | string[];
    description?: string;
}

export interface UCSJSSnippets {
    [name: string]: UCSJSSnippet;
}

export interface UCSJSSystemData {
    objects: UCSJSObject[];
    classes: UCSJSClass[];
    constants: UCSJSSystemConstants;
    properties: UCSJSSystemProperty[];
    functions: UCSJSSystemFunction[];
    methods: UCSJSSystemMethod[];
  }

  //----------------- Dynamic data ------------------
  export interface PartDefs {
    partName: string;
    description: string;
    className: string;
    subClassName: string;
  }

  export interface Parameters {
    paramName: string;
    paramDesc: string;
    paramTypeName:string;
  }

  export interface CaseStandards {
    name : string;
    id : number;
    description : string;
    typeName : string;
  }

  export interface Materials {
    name : string;
    id : number;
    description : string;
    typeName : string;
    typeID : number;
  }

  export interface Construction {
    name : string;
    id : number;
    description : string;
    typeName : string;
    typeID : number;
  }

  export interface Schedules {
    name : string;
    id : number;
    description : string;
    typeName : string;
    typeID : number;
  }

  export interface Connections {
    name : string;
    id : number;
    description : string;
    typeName : string;
    typeID : number;
  }

  export interface Doors {
    name : string;
    id : number;
    description : string;
    CatName : string;
    Notes : string;
    Tags : string;
  }

  export interface DynamicData {
    partDefs : PartDefs[];
    materialParams: Parameters[];
    constructionParams: Parameters[];
    scheduleParams: Parameters[];
    materials : Materials[];
    constructions : Construction[];
    schedules: Schedules[];
    caseStandards: CaseStandards[];
    doors : Doors[];
    connections: Connections[];
  }

