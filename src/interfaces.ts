import { Position } from 'vscode';
import { Range, CompletionItemKind } from 'vscode-languageserver/node';

// Define an interface for the language configuration
export interface LanguageConfig {
  languageId: string;
  systemJsonPath: string;
  syntaxJsonPath: string;
  controlStructuresJsonPath: string;
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

export interface UCSJSSystemFunction {
    name: string;
    definition: string;
    value: string;
    description: string;
    example: string;
}

export interface UCSJSSystemPropertie {
    name: string;
    parentObject: string[],
    value: string;
    description: string;
    Type: string;
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
}

export interface UCSJSSystemData {
    objects: string[];
    constants: UCSJSSystemConstants;
    properties: UCSJSSystemPropertie[];
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

  export interface ElementParam {
    name: string;
    optional?: boolean | null;
  }

  export interface ClassReference {
    elementName: string;
    uri: string;
    range: Range;
  }

  export interface classElement {
    name: string;
    compKind: CompletionItemKind;
    params?: ElementParam[] | undefined;
    type: string;
    range: Range;
}

  export interface docClassRef {
      name: string;
      uri: string;
      classElements: classElement[];
      elementReferences: ClassReference[];
      classReferences: ClassReference[];
      isEnabled: boolean;
  }

  export interface CVAsmManaged {
    variableName: string;
    objectName: string;
    uri: string;
    range: Range;
  }

  export interface docReferences {
    classRefs : docClassRef[];
    CVAsmManagedRefs : CVAsmManaged[];
  }

