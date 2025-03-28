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
exports.generateSystemJson = generateSystemJson;
exports.initializeSystemJson = initializeSystemJson;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const specialObjectsJsonPath = path.join(__dirname, '../Languages/ucsm/data/special_objects.json');
const parsedData = JSON.parse(fs.readFileSync(specialObjectsJsonPath, 'utf8'));
const specialObjectsData = parsedData.specialObjects;
function isSpecObjectMethod(VarName) {
    try {
        for (const spObj of specialObjectsData) {
            if (VarName.startsWith(spObj.prefix)) {
                return spObj.prefix;
            }
        }
    }
    catch (error) {
        console.log(error);
    }
    return null;
}
function generateSystemVariables(documentText) {
    const lines = documentText.split('\n').map(line => line.trim());
    const variables = [];
    let currentVariable = {};
    let currentField = null;
    function NextFieldIsRemark(CurrentIndex) {
        for (let index = CurrentIndex + 1; index < lines.length; index++) {
            const line = lines[index];
            if (line == '')
                continue;
            if (line.trim() === 'Type:')
                return false;
            if (line.trim() === 'Remarks:' || line.trim() === 'Example:')
                return true;
        }
        return false;
    }
    for (let index = 0; index < lines.length; index++) {
        //for (const line of lines) {
        // Skip blank lines
        const line = lines[index];
        if (!line)
            continue;
        // Check if the line starts a new variable (typically starts with underscore or uppercase letter)
        if ((line.startsWith('_') || /^[A-Z]/.test(line)) && !currentField) {
            // If we have a partially built variable with at least a name, reset and start new
            if (currentVariable.name) {
                variables.push(currentVariable);
            }
            currentVariable = { name: line };
            currentField = 'description';
            const specObj = isSpecObjectMethod(line);
            if (specObj) {
                currentVariable.name = currentVariable.name?.replace(specObj, '');
                currentVariable.parentObject = specObj;
            }
            continue;
        }
        // Handle field headers and their values
        if (line === 'Type:') {
            currentField = 'type';
        }
        else if (line === 'Valid Range:') {
            currentField = 'validRange';
        }
        else if (line === 'Applies To:') {
            currentField = 'appliesTo';
        }
        else if (line === 'Values:') {
            currentField = 'values';
        }
        else if (line === 'Visibility:') {
            currentField = 'visibility';
        }
        else if (line === 'Remarks:' || line === 'Example:') {
            currentField = 'Remarks';
        }
        else if (currentField) {
            // Append the line to the current field (multi-line support)
            if (currentField in currentVariable) {
                currentVariable[currentField] += `\n${line}`;
            }
            else {
                currentVariable[currentField] = line;
            }
        }
        // Reset after collecting Visibility (7th field)
        if (currentField === 'visibility' && currentVariable.visibility || currentField === 'Remarks' && currentVariable.Remarks) {
            if (!NextFieldIsRemark(index) || currentField === 'Remarks') {
                variables.push(currentVariable);
                currentVariable = {};
                currentField = null;
            }
        }
    }
    // Add the last variable if it’s complete
    if (currentVariable.name && currentVariable.visibility) {
        variables.push(currentVariable);
    }
    return variables;
}
function generateSystemJson(documentText, outputPath) {
    const variables = generateSystemVariables(documentText);
    // Define the full system.json structure
    const systemJson = {
        keywords: [
            'If', 'Then', 'Else', 'End', 'While', 'Do', 'Exit', 'Delete', 'For', 'Each',
            'Dim', 'as', 'New', 'this', 'null'
        ],
        variables,
        functions: [
            { name: 'ABS', value: 'ABS(${1:X})', returnType: "number", inputType: "number", description: 'Returns the absolute value of a number, which is a number without its sign.' },
            { name: 'ACOS', value: 'ACOS(${1:X})', returnType: "number", inputType: "number", description: 'Returns the arccosine of a number, in degrees. The arccosine is the angle whose cosine is Number.' },
            { name: 'ASIN', value: 'ASIN(${1:X})', returnType: "number", inputType: "number", description: 'Returns the arcsine of a number in degrees.' },
            { name: 'ATAN', value: 'ATAN(${1:X})', returnType: "number", inputType: "number", description: 'Returns the arctangent of a number in degrees.' },
            { name: 'COS', value: 'COS(${1:X})', returnType: "number", inputType: "number", description: 'Returns the cosine of an angle.' },
            { name: 'COSH', value: 'COSH(${1:X})', returnType: "number", inputType: "number", description: 'Returns the hyperbolic cosine of a number.' },
            { name: 'EXP', value: 'EXP(${1:X})', returnType: "number", inputType: "number", description: 'Returns e raised to the power of a given number.' },
            { name: 'IMP', value: 'Imp(${1:X})', returnType: "number", inputType: "number", description: 'Conversion for MM to Imperial. To use any of these functions for Metric... ABS(Imp(100))' },
            { name: 'in', value: '${1:X}in', returnType: "number", inputType: "number", description: 'Establishes the value you are typing is an Imperial Measurement... 12in' },
            { name: 'LOG', value: 'LOG(${1:X})', returnType: "number", inputType: "number", description: 'Returns the logarithm of a number to the base e. e is a constant whose value is approximately 2.718282.' },
            { name: 'LOG10', value: 'LOG10(${1:X})', returnType: "number", inputType: "number", description: 'Returns the base-10 logarithm of a number.' },
            { name: 'mm', value: '${1:X}mm', returnType: "number", inputType: "number", description: 'Establishes the value you are typing is a Metric Measurement... 300mm' },
            { name: 'ROUND', value: 'ROUND(${1:X})', returnType: "number", inputType: "number", description: 'Rounds a number to the nearest whole number using standard rounding rules.' },
            { name: 'RPREC', value: 'RPREC(${1:X})', returnType: "number", inputType: "number", description: 'Returns rounded value of argument rounded as per the unit precision system setting.' },
            { name: 'SIN', value: 'SIN(${1:X})', returnType: "number", inputType: "number", description: 'Returns the sine of an angle.' },
            { name: 'SINH', value: 'SINH(${1:X})', returnType: "number", inputType: "number", description: 'Returns the hyperbolic sine of a number.' },
            { name: 'SQR', value: 'SQR(${1:X})', returnType: "number", inputType: "number", description: 'Returns a square of a number.' },
            { name: 'SQRT', value: 'SQRT(${1:X})', returnType: "number", inputType: "number", description: 'Returns a square root of a number.' },
            { name: 'TAN', value: 'TAN(${1:X})', returnType: "number", inputType: "number", description: 'Returns the tangent of an angle.' },
            { name: 'TANH', value: 'TANH(${1:X})', returnType: "number", inputType: "number", description: 'Returns the hyperbolic tangent of a number.' },
            { name: 'TRUNC', value: 'TRUNC(${1:X})', returnType: "number", inputType: "number", description: 'Truncates a number to an integer by removing the decimal, or fractional, part of the number.' },
            { name: 'MaterialID', value: "MaterialID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'TopConstID', value: "TopConstID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'DoorStyleID', value: "DoorStyleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'AsmConstID', value: "AsmConstID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'DrawerConstID', value: "DrawerConstID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'RollOutConstID', value: "RollOutConstID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'IJointID', value: "IJointID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'AsmScheduleID', value: "AsmScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'SlideRailScheduleID', value: "SlideRailScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'TopScheduleID', value: "TopScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'DrawerScheduleID', value: "DrawerScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'RollOutScheduleID', value: "RollOutScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'ColorScheduleID', value: "ColorScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'RoomScheduleID', value: "RoomScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'DoorScheduleID', value: "DoorScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'PullScheduleID', value: "PullScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'HingeScheduleID', value: "HingeScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'GuideScheduleID', value: "GuideScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'MoldingScheduleID', value: "MoldingScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'WireBasketScheduleID', value: "WireBasketScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'ClosetRodScheduleID', value: "ClosetRodScheduleID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'FinishID', value: "FinishID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
            { name: 'TextureID', value: "TextureID('$1')", returnType: "number", inputType: "text", description: 'Moniker' },
        ],
        types: [
            { name: 'Currency', value: '<crncy>', description: 'A system of money in general use in a particular country' },
            { name: 'Measurement', value: '<meas>', description: 'The size, length, or amount of something, as established by measuring. Note: This is the default type used when no type is defined. When Measurement is the type the value will be converted between Imperial and Metric based on the current active unit of measurement.' },
            { name: 'Degrees', value: '<deg>', description: 'A unit of measurement of angles, one three-hundred-and-sixtieth of the circumference of a circle.' },
            { name: 'Integer', value: '<int>', description: 'A number that is not a fraction; a whole number.' },
            { name: 'Boolean', value: '<bool>', description: 'A Boolean data type is a fundamental data type in computer science that represents two possible values: true (1) or false (0).' },
            { name: 'Decimal', value: '<dec>', description: 'Defines exact numeric values.' },
            { name: 'Text', value: '<text>', description: 'You can also build strings of Text in CABINET VISION from the results of existing Parameters or AutoText Values. Such as the three examples below: NAME = w{DX}h{DY}d{DZ}, PARTMAT = {material}, COMMENT = {name} ({job.name})' },
            { name: 'Style', value: '<style>', description: 'There are three possible settings for the <style> value: 0 = Value (Values act as previous Parameter definitions, only displayed in the Object Tree and hard set by the UCS), 1 = Attribute (Attributes act as triggers that can be user prompted from the sidebar for the Object or via Job/Room Parameters tabs. Use <desc> to set the prompt description), 2 = Note (Notes are a user defined Note which will be displayed on the Notes pages for the Object and available as CAD text look-ups. The text entered for Notes are default values which can be edited from the prompt. Use <desc> to set the prompt description)' },
            { name: 'Description', value: '<desc>', description: 'Description allows you to display a user prompt for Attribute and Note Parameters.' }
        ],
        specialObjects: [
            {
                "prefix": "_M:",
                "propertyPattern": "[A-Za-z0-9_]*",
                "allowsSubProperties": false,
                "description": "Material Parameters"
            },
            {
                "prefix": "_CS:",
                "propertyPattern": "[A-Za-z0-9_]*",
                "allowsSubProperties": false,
                "description": "Construction Method Parameters"
            },
            {
                "prefix": "_MS:",
                "propertyPattern": "[A-Za-z0-9_]*",
                "allowsSubProperties": false,
                "description": "Material Schedule Parameters"
            },
            {
                "prefix": "_CV:",
                "propertyPattern": "\\d+",
                "allowsSubProperties": true,
                "description": "Derives the value/measurement entered for a standard in the Construction Method"
            },
            {
                "prefix": "_CB:",
                "propertyPattern": "\\d+",
                "allowsSubProperties": true,
                "description": "Derives the button/choice selected for a standard in a Construction Method"
            },
            {
                "prefix": "_CBM:",
                "propertyPattern": "\\d+",
                "allowsSubProperties": true,
                "description": "Derives the banding Material ID from the Construction Method"
            },
            {
                "prefix": "_CBN:",
                "propertyPattern": "\\d+",
                "allowsSubProperties": true,
                "description": "Derives the banding number from the Construction Method"
            }
        ],
        objectClass: [
            "ASM_CLASS_BASE",
            "ASM_CLASS_UPPER",
            "ASM_CLASS_TALL",
            "ASM_CLASS_VANITY",
            "ASM_CLASS_APPL",
            "ASM_CLASS_ACSRY",
            "ASM_CLASS_DECORATIVE",
            "ASM_CLASS_TOP",
            "ASM_CLASS_MOLDING",
            "ASM_CLASS_WALL",
            "ASM_CLASS_WALLFACE",
            "ASM_CLASS_FLOOR",
            "ASM_CLASS_CEILING",
            "ASM_CLASS_DOOR",
            "ASM_CLASS_NG_ACSRY",
            "ASM_CLASS_SPLASH",
            "ASM_CLASS_USER_LIGHT",
            "ASM_CLASS_FIXTURE",
            "ASM_CLASS_BATH",
            "ASM_CLASS_CLOSET",
            "ASM_CLASS_CLOSETBASE",
            "ASM_CLASS_CLOSETUPPER"
        ],
        objectTypes: [
            "ASM_TYPE_STANDARD",
            "ASM_TYPE_BLINDR",
            "ASM_TYPE_BLINDL",
            "ASM_TYPE_CORNER45",
            "ASM_TYPE_CORNER90",
            "ASM_TYPE_FILLER",
            "ASM_TYPE_DESK",
            "ASM_TYPE_HOOD",
            "ASM_TYPE_REFER",
            "ASM_TYPE_VALANCE",
            "ASM_TYPE_UCVALANCE",
            "ASM_TYPE_APPLGARAGE",
            "ASM_TYPE_DISHWASHER",
            "ASM_TYPE_TRASHCOMP",
            "ASM_TYPE_RANGE",
            "ASM_TYPE_COOKTOP",
            "ASM_TYPE_SINK",
            "ASM_TYPE_MICRO",
            "ASM_TYPE_WINDOW",
            "ASM_TYPE_EDOOR",
            "ASM_TYPE_PICTURE",
            "ASM_TYPE_TOEASSEMBLY",
            "ASM_TYPE_MISC",
            "ASM_TYPE_CLOSET",
            "ASM_TYPE_PART",
            "ASM_TYPE_OPENING",
            "ASM_TYPE_TWALL",
            "ASM_TYPE_CONTAINER",
            "ASM_TYPE_ELECTRICAL",
            "ASM_TYPE_PLUMBING",
            "ASM_TYPE_OVEN",
            "ASM_TYPE_WASHDRY",
            "ASM_TYPE_TUB",
            "ASM_TYPE_SHOWER",
            "ASM_TYPE_TOILET",
            "ASM_TYPE_BATHSINK",
            "ASM_TYPE_SPLASH",
            "ASM_TYPE_TOP",
            "ASM_TYPE_CLOSET_VERT",
            "ASM_TYPE_CLOSET_HORZ",
            "ASM_TYPE_CLOSET_DOOR_DWR"
        ]
    };
    // Optionally write to a file if outputPath is provided
    if (outputPath) {
        try {
            fs.writeFileSync(outputPath, JSON.stringify(systemJson, null, 2), 'utf8');
            console.log(`Generated system.json at ${outputPath}`);
        }
        catch (error) {
            console.error(`Failed to write system.json: ${error}`);
        }
    }
    return systemJson;
}
// Example usage within your extension
function initializeSystemJson() {
    // Replace this with the actual path to your text file or read it dynamically
    const documentPath = path.join(__dirname, '../CVDoc/CV System Parameters.txt');
    const outputPath = path.join(__dirname, '../Languages/data/system.json');
    // Read the document text (assuming it’s stored as a file)
    try {
        const documentText = fs.readFileSync(documentPath, 'utf8');
        const systemJson = generateSystemJson(documentText, outputPath);
        console.log('System JSON generated successfully:', systemJson.variables.length, 'variables found');
        return systemJson;
    }
    catch (error) {
        console.error(`Failed to read document text: ${error}`);
        return null;
    }
}
//# sourceMappingURL=jsonDocCreator.js.map