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
exports.DtsGenerator = void 0;
const fs = __importStar(require("fs"));
const vscode = __importStar(require("vscode"));
const CONSTANTS = __importStar(require("./constants"));
/**
 * Turns the static Cabinet Vision API description in ucsjs_system.json, plus the live database
 * values, into an ambient `cv-api.d.ts`.
 *
 * This is what lets VS Code's own TypeScript service provide completion, hover, signature help,
 * go to definition and rename for UCS:JS, replacing the hand rolled equivalents that used to live
 * in referenceParser.ts and ucsjsLanguageHandler.ts.
 *
 * The emitted file must contain no top level import or export: that keeps it a *script*, so every
 * declaration lands in the global scope where mirrored UCS files can see it.
 */
class DtsGenerator {
    data;
    unmappedReturnTypes = new Set();
    constructor() {
        this.data = JSON.parse(fs.readFileSync(CONSTANTS.UCSJSSYSTEMJSONPATH, 'utf8'));
    }
    // ------------------------------------------------------------------ type mapping
    /**
     * `returnType` in the JSON is free form prose rather than a type, e.g.
     * "System::Collections::Generic::List - array of CVAsmManaged child objects". There are only a
     * couple of dozen distinct values, so a small set of ordered rules covers all of them; anything
     * unrecognised degrades to `any` and is reported rather than silently mistyped.
     */
    mapReturnType(raw) {
        const text = (raw ?? '').trim();
        if (!text)
            return 'void';
        // Cabinet Vision exposes a .NET API, so anything it describes as a collection comes back as
        // a System.Collections.Generic.List and *not* a JavaScript array: it counts with `Count`,
        // and none of the array methods are on it. `CVList<T>`, emitted by `build`, is that shape.
        if (/\bList\b/.test(text)) {
            const element = /CVShapeManaged/.test(text) ? 'CVShapeManaged'
                : /CVAsmManaged/.test(text) ? 'CVAsmManaged'
                    : 'any';
            return `CVList<${element}>`;
        }
        if (/CVShapeManaged/.test(text))
            return 'CVShapeManaged | null';
        if (/CVAsmManaged/.test(text)) {
            return /\bnull\b/.test(text) ? 'CVAsmManaged | null' : 'CVAsmManaged';
        }
        if (/Object side type/i.test(text))
            return 'ShapeSideType';
        const head = text.split(/[\s\-]/)[0].toLowerCase();
        switch (head) {
            case 'void': return 'void';
            case 'bool': return 'boolean';
            case 'string': return 'string';
            case 'double':
            case 'float':
            case 'long':
            case 'int': return 'number';
            case 'variant': return 'any';
        }
        this.unmappedReturnTypes.add(text);
        return 'any';
    }
    /**
     * Property `Type` is a Cabinet Vision VAL_* constant name, a raw C++ type, or - for the CAD
     * entities, whose properties are set from a documented constant group - a `constants.<group>`
     * reference, exactly as `parameterDef[].DataType` uses.
     */
    mapPropertyType(raw) {
        const text = (raw ?? '').trim();
        if (text.startsWith('constants.')) {
            return text.slice('constants.'.length);
        }
        switch (text) {
            case 'VAL_TEXT':
            case 'string': return 'string';
            case 'VAL_BOOL':
            case 'bool': return 'boolean';
            case 'VAL_INTEGER':
            case 'VAL_MEASUREMENT':
            case 'VAL_DEGREES':
            case 'int':
            case 'double':
            // A Windows RGB colour, written in UCS:JS as a plain number literal (0xff00).
            case 'COLORREF': return 'number';
            default: return 'any';
        }
    }
    /**
     * The C++ style type names that appear inside `definition`, used only when `parameterDef` is
     * missing. Distinct from the `DataType` vocabulary below.
     */
    mapDeclaredType(raw) {
        switch (raw.trim().toLowerCase()) {
            case 'string': return 'string';
            case 'bool': return 'boolean';
            case 'double':
            case 'float':
            case 'int':
            case 'long':
            case 'word': return 'number';
            default: return 'any';
        }
    }
    /**
     * Recover parameters from the `definition` signature. Several entries - the `_cvMath` comparison
     * helpers in particular - document their parameters in `definition` but ship an empty
     * `parameterDef`, and emitting a no argument signature for those would reject valid calls.
     */
    paramsFromDefinition(definition) {
        const inner = (definition ?? '').match(/\(([^)]*)\)/)?.[1]?.trim();
        if (!inner)
            return [];
        return inner.split(',').map((part, index) => {
            const tokens = part.trim().split(/\s+/).filter(Boolean);
            const declared = tokens.length > 1 ? tokens[0] : '';
            const info = this.paramInfo(part, index);
            return { name: info.name, type: this.mapDeclaredType(declared) };
        }).filter(p => p.name.length > 0);
    }
    /**
     * `parameterDef[].DataType` is a closed vocabulary of 14 values, optionally several of them
     * separated by `|` when the parameter genuinely accepts more than one - `ModifyParameter`'s
     * `Object value` is a description string, a parameter type constant or a parameter style
     * constant depending on the preceding argument, and typing it as any one of those rejects the
     * other two.
     */
    mapParamType(raw) {
        const text = (raw ?? '').trim();
        if (text.includes('|')) {
            const mapped = text.split('|').map(part => this.mapParamType(part));
            return [...new Set(mapped)].join(' | ');
        }
        if (text.startsWith('constants.')) {
            return text.slice('constants.'.length);
        }
        switch (text) {
            case 'string': return 'string';
            case 'double':
            case 'int': return 'number';
            case 'bool': return 'boolean';
            case 'CVShapeManaged': return 'CVShapeManaged';
            case 'cadObject': return 'CVCadObject';
            case 'materials': return 'MaterialName';
            // A UCS:M expression inside a JavaScript string. Still a string to TypeScript; the
            // language server is what supplies UCS:M completion and validation inside it.
            case 'ucsmSyntax': return 'string';
            default: return 'any';
        }
    }
    // ------------------------------------------------------------------ helpers
    /** `parentObject` is a string[] for methods but occasionally a bare string for properties. */
    parents(entry) {
        const parent = entry.parentObject;
        if (!parent)
            return [];
        return Array.isArray(parent) ? parent : [parent];
    }
    jsDoc(indent, parts) {
        const lines = parts
            .filter((part) => !!part && part.trim().length > 0)
            .join('\n')
            .replace(/\*\//g, '*⁄')
            .split('\n');
        if (!lines.length)
            return '';
        return `${indent}/**\n` + lines.map(l => `${indent} * ${l}`).join('\n') + `\n${indent} */\n`;
    }
    /**
     * `ParamName` carries the C++ style declaration plus, sometimes, an optionality marker:
     *   "string message"                        -> message
     *   "string description[optional]"          -> description, optional
     *   "bool case (optional, default = false)" -> case, optional
     * The identifier is the second token, not the last: the first token is the type, and anything
     * after it is an annotation.
     */
    paramInfo(raw, index) {
        const text = (raw ?? '').trim();
        const optional = /\[optional\]|\(\s*optional/i.test(text);
        const declaration = text
            .replace(/\[optional\]/ig, '')
            .replace(/\([^)]*\)?/g, '')
            .trim();
        const tokens = declaration.split(/\s+/).filter(Boolean);
        const word = tokens.length > 1 ? tokens[1] : (tokens[0] ?? '');
        let name = word.replace(/[^A-Za-z0-9_$]/g, '');
        if (!name || /^[0-9]/.test(name)) {
            name = `arg${index + 1}`;
        }
        if (DtsGenerator.RESERVED.has(name)) {
            name = `${name}Arg`;
        }
        return { name, optional };
    }
    static RESERVED = new Set([
        'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
        'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
        'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw',
        'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static'
    ]);
    /**
     * The shared prefix of a constant group - `VAL_`, `OBJ_`, `PARMOD_` - or undefined when the
     * group has none (`ShapeSideType` spans ASM_SIDE_, DOOR_SIDE_ and TOP_SIDE_).
     *
     * Used as the *parameter name* for arguments of that group, because VS Code builds the
     * completion snippet by calling `appendPlaceholder` with the parameter name verbatim. Naming
     * the parameter after the prefix is the only way to reproduce the `${2:PARMOD_}` hint the old
     * hand written `method.value` snippets carried.
     */
    constantPrefix(group) {
        const names = this.data.constants[group];
        if (!Array.isArray(names) || names.length < 2)
            return undefined;
        let prefix = names[0];
        for (const name of names) {
            while (prefix.length && !name.startsWith(prefix))
                prefix = prefix.slice(0, -1);
        }
        // Only a prefix that lands on an underscore boundary is a usable hint; half a word is worse
        // than none.
        const cut = prefix.lastIndexOf('_');
        return cut > 0 ? prefix.slice(0, cut + 1) : undefined;
    }
    parameters(method) {
        const defs = method.parameterDef ?? [];
        if (!defs.length) {
            return this.paramsFromDefinition(method.definition).map(p => ({ ...p, optional: false }));
        }
        const used = new Set();
        let seenOptional = false;
        return defs.map((param, index) => {
            const info = this.paramInfo(param.ParamName ?? '', index);
            // The completion hint follows the first constant group listed, so a union still gets a
            // `PARSTYLE_` style parameter name rather than the declared `value`.
            const group = (param.DataType ?? '')
                .split('|')
                .map(t => t.trim())
                .find(t => t.startsWith('constants.'))
                ?.slice('constants.'.length);
            let name = (group && this.constantPrefix(group)) || info.name;
            while (used.has(name))
                name = `${name}_`;
            used.add(name);
            // A required parameter may not follow an optional one, so once one is optional the
            // rest are too.
            seenOptional = seenOptional || info.optional;
            return { name, type: this.mapParamType(param.DataType), optional: seenOptional };
        });
    }
    /**
     * One or two overloads per method.
     *
     * `javascript.suggest.completeFunctionCalls` builds its snippet from the *first* overload and
     * deliberately omits every optional parameter, so on its own it would never offer the trailing
     * Cabinet Vision constant that the old hand written snippets always did (`, VAL_[optional]`,
     * `, PARSTYLE_`, `, 'description[optional]'` and so on). Emitting an all required overload first
     * puts those arguments back in the inserted snippet; the real signature that follows still
     * accepts the shorter calls, so nothing that used to compile stops compiling.
     */
    signatures(method) {
        if (method.factory)
            return this.factorySignatures(method);
        const params = this.parameters(method);
        const returns = this.mapReturnType(method.returnType);
        const render = (allRequired) => `${method.name}(${params
            .map(p => `${p.name}${!allRequired && p.optional ? '?' : ''}: ${p.type}`)
            .join(', ')}): ${returns};`;
        return params.some(p => p.optional) ? [render(true), render(false)] : [render(false)];
    }
    /**
     * `_cvSystem.CreateObject` returns a different class for each string it is handed, which the
     * `returnType` prose cannot express - one overload per `classes` entry does. The trailing
     * `string` overload keeps calls with a computed or not yet documented class name compiling.
     */
    factorySignatures(method) {
        const name = this.parameters(method)[0]?.name ?? 'className';
        return [
            ...this.data.classes.map(c => `${method.name}(${name}: '${c.createName}'): ${c.name} | null;`),
            `${method.name}(${name}: string): any;`
        ];
    }
    memberDoc(entry) {
        const method = entry;
        // @param names have to match the emitted signature or the doc silently detaches.
        const named = method.parameterDef?.length ? this.parameters(method) : [];
        return [
            entry.description,
            method.definition ? `\n\`${method.definition}\`` : undefined,
            ...(method.parameterDef ?? []).map((p, i) => `@param ${named[i]?.name ?? `arg${i + 1}`} ${p.ParamValue ?? ''}`),
            method.example ? `\n@example\n${method.example}` : undefined
        ];
    }
    members(methods, properties, indent, readonlyProps) {
        const out = [];
        for (const prop of properties) {
            out.push(this.jsDoc(indent, [prop.description]) +
                `${indent}${readonlyProps ? 'readonly ' : ''}${prop.name}: ${this.mapPropertyType(prop.Type)};`);
        }
        for (const method of methods) {
            // The doc is repeated on each overload so signature help carries it whichever one the
            // argument count selects.
            const doc = this.jsDoc(indent, this.memberDoc(method));
            for (const signature of this.signatures(method)) {
                out.push(doc + `${indent}${signature}`);
            }
        }
        return out.join('\n');
    }
    /** Members of a named Cabinet Vision object type such as CVAsmManaged or CVShapeManaged. */
    forObjectType(objectType) {
        return {
            methods: this.data.methods.filter(m => m.objectType === objectType),
            properties: this.data.properties.filter(p => p.objectType === objectType)
        };
    }
    /** Members hanging off a global such as `_this`, `_cvMath`. Entries with an objectType belong there instead. */
    forParent(parent) {
        return {
            methods: this.data.methods.filter(m => !m.objectType && this.parents(m).includes(parent)),
            properties: this.data.properties.filter(p => !p.objectType && this.parents(p).includes(parent))
        };
    }
    /** Every caller reaches this through an optional chain, so an absent list has to widen to string. */
    unionOf(names) {
        const unique = [...new Set((names ?? []).filter((n) => !!n && n.trim().length > 0))].sort();
        if (!unique.length)
            return 'string';
        return unique.map(n => `'${n.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(' | ');
    }
    // ------------------------------------------------------------------ emit
    /**
     * The .NET collection types, emitted verbatim.
     *
     * Cabinet Vision exposes a .NET API, so a method documented as returning a collection returns a
     * real `System.Collections.Generic.List` and the script host bridges its members through as
     * they are: `Count` rather than `length`, `ForEach` rather than `forEach`, `Item(i)` alongside
     * `[i]`. Typing that as `T[]` offered the JavaScript array surface instead, none of which is
     * there - and `length`, the one an author reaches for first, is `undefined` rather than an
     * error, so the counted loop written against it silently never runs.
     *
     * The member list is the one CV's own debugger reports for a live list, so it is what the
     * runtime really exposes rather than what `List<T>` has on paper.
     */
    static COLLECTIONS = [
        '/**',
        ' * A .NET delegate parameter - an `Action<T>`, `Predicate<T>` or `Comparison<T>`.',
        ' *',
        ' * **Cabinet Vision cannot build one from a JavaScript function**, so every member declared',
        ' * as taking one exists on the object but cannot be called from UCS:JS. Doing so fails at',
        ' * runtime with *"The best overloaded method match for ... has some invalid arguments"*.',
        ' *',
        ' * Walk the list yourself instead:',
        ' *',
        ' * @example',
        ' * for (var i = 0; i < children.Count; i++) {',
        ' *     var child = children[i];',
        ' * }',
        ' */',
        'type CVDelegate<TSignature> = TSignature & {',
        '    readonly __cvDelegate: \'Cabinet Vision cannot build a .NET delegate from a JavaScript function\';',
        '};',
        '',
        '/**',
        ' * A .NET `System.Collections.Generic.List` returned by Cabinet Vision - **not** a JavaScript',
        ' * array. It is counted with `Count`, not `length`, and the methods on it are .NET methods:',
        ' * capitalised, and behaving as .NET does. There is no `map`, `filter`, `push` or `slice`,',
        ' * and the members that take a callback - `ForEach`, `Find`, `Sort` - cannot be called from',
        ' * UCS:JS at all, because the callback is a .NET delegate. See `CVDelegate`.',
        ' *',
        ' * Indexing works, and a counted `for` is the usual way to walk one:',
        ' *',
        ' * @example',
        ' * var children = _this.GetChildren(\'Door*\');',
        ' * for (var i = 0; i < children.Count; i++) {',
        ' *     var child = children[i];',
        ' * }',
        ' *',
        ' * The list is a snapshot handed to the script: adding to it or removing from it changes the',
        ' * list alone, and adds or deletes nothing in the Cabinet Vision model.',
        ' */',
        'interface CVList<T> {',
        '    /** Number of items. The .NET name - `length` is undefined on this object. */',
        '    readonly Count: number;',
        '    readonly [index: number]: T;',
        '    /** The item at `index`; the same as `list[index]`. */',
        '    Item(index: number): T;',
        '    /** Allocated capacity, not the number of items. `Count` is almost always what you want. */',
        '    Capacity: number;',
        '',
        '    /** True if `item` is in the list. */',
        '    Contains(item: T): boolean;',
        '    /** Position of the first matching item, or -1 when it is not present. */',
        '    IndexOf(item: T): number;',
        '    /** Position of the last matching item, or -1 when it is not present. */',
        '    LastIndexOf(item: T): number;',
        '    /** A copy as a .NET array - counted with `Length`, and still not a JavaScript array. */',
        '    ToArray(): CVArray<T>;',
        '    /** A new list of `count` items starting at `index`. */',
        '    GetRange(index: number, count: number): CVList<T>;',
        '    /** A read only view of this list; the mutating members throw on what it returns. */',
        '    AsReadOnly(): CVList<T>;',
        '    CopyTo(array: CVArray<T>, arrayIndex?: number): void;',
        '    /** Enumerator, for when a counted `for` will not do. */',
        '    GetEnumerator(): CVEnumerator<T>;',
        '    /** Position of `item` in a list already sorted, else a negative number. */',
        '    BinarySearch(item: T): number;',
        '',
        '    // Every member below takes a .NET delegate, which Cabinet Vision cannot build from a',
        '    // JavaScript function - see `CVDelegate`. Declared so that they carry that answer, and',
        '    // marked deprecated so the editor strikes them out rather than recommending them.',
        '',
        '    /**',
        '     * Calls a .NET `Action<T>` for each item. This is not `Array.forEach`.',
        '     *',
        '     * @deprecated Not callable from UCS:JS - Cabinet Vision cannot build a .NET delegate',
        '     * from a JavaScript function. Use `for (var i = 0; i < list.Count; i++)`.',
        '     */',
        '    ForEach(action: CVDelegate<(item: T) => void>): void;',
        '    /**',
        '     * The first item matching a .NET `Predicate<T>`, else null.',
        '     *',
        '     * @deprecated Not callable from UCS:JS - see `CVDelegate`. Walk the list with a counted',
        '     * `for` and keep the first item your own test accepts.',
        '     */',
        '    Find(match: CVDelegate<(item: T) => boolean>): T | null;',
        '    /** @deprecated Not callable from UCS:JS - see `CVDelegate`. */',
        '    FindLast(match: CVDelegate<(item: T) => boolean>): T | null;',
        '    /** @deprecated Not callable from UCS:JS - see `CVDelegate`. */',
        '    FindAll(match: CVDelegate<(item: T) => boolean>): CVList<T>;',
        '    /** @deprecated Not callable from UCS:JS - see `CVDelegate`. */',
        '    FindIndex(match: CVDelegate<(item: T) => boolean>): number;',
        '    /** @deprecated Not callable from UCS:JS - see `CVDelegate`. */',
        '    FindLastIndex(match: CVDelegate<(item: T) => boolean>): number;',
        '    /** @deprecated Not callable from UCS:JS - see `CVDelegate`. */',
        '    Exists(match: CVDelegate<(item: T) => boolean>): boolean;',
        '    /** @deprecated Not callable from UCS:JS - see `CVDelegate`. */',
        '    TrueForAll(match: CVDelegate<(item: T) => boolean>): boolean;',
        '    /** @deprecated Not callable from UCS:JS - see `CVDelegate`. */',
        '    ConvertAll(converter: CVDelegate<(item: T) => any>): CVList<any>;',
        '',
        '    // Mutating members. These change this list only - never the Cabinet Vision model.',
        '',
        '    Add(item: T): void;',
        '    AddRange(items: CVList<T> | CVArray<T>): void;',
        '    Insert(index: number, item: T): void;',
        '    InsertRange(index: number, items: CVList<T> | CVArray<T>): void;',
        '    /** Removes the first matching item, and reports whether one was found. */',
        '    Remove(item: T): boolean;',
        '    RemoveAt(index: number): void;',
        '    RemoveRange(index: number, count: number): void;',
        '    Clear(): void;',
        '    Reverse(): void;',
        '    TrimExcess(): void;',
        '    /** @deprecated Not callable from UCS:JS - see `CVDelegate`. */',
        '    RemoveAll(match: CVDelegate<(item: T) => boolean>): number;',
        '    /**',
        '     * Sorts in place. The no argument form works only where .NET can compare the items',
        '     * itself - numbers and strings - and throws on objects, which need a comparison that',
        '     * cannot be passed from UCS:JS.',
        '     *',
        '     * @deprecated for a list of objects - see `CVDelegate`.',
        '     */',
        '    Sort(): void;',
        '',
        '    Equals(other: any): boolean;',
        '    GetHashCode(): number;',
        '    GetType(): any;',
        '    ToString(): string;',
        '}',
        '',
        '/**',
        ' * A .NET array, as returned by `ToArray`. Counted with `Length` - the capital is not a typo,',
        ' * and lower case `length` is undefined here too.',
        ' */',
        'interface CVArray<T> {',
        '    readonly Length: number;',
        '    readonly [index: number]: T;',
        '    GetValue(index: number): T;',
        '}',
        '',
        '/**',
        ' * A .NET enumerator. `MoveNext` must be called before the first read of `Current`, so the',
        ' * loop is `while (e.MoveNext()) { … e.Current … }`.',
        ' */',
        'interface CVEnumerator<T> {',
        '    MoveNext(): boolean;',
        '    readonly Current: T;',
        '    Reset(): void;',
        '}',
        ''
    ];
    build(dynamicData) {
        this.unmappedReturnTypes.clear();
        const out = [];
        out.push('// Cabinet Vision UCS:JS API surface.');
        out.push('// GENERATED by the Cabinet Vision UCS Editor extension - do not edit, your changes will be lost.');
        out.push('// Regenerated on activation and whenever a UCS list is refreshed.');
        out.push('');
        out.push('// No import or export below: this file must stay a script so that everything it');
        out.push('// declares is visible as a global to every mirrored UCS.');
        out.push('');
        // --- constant groups -------------------------------------------------
        out.push('// ---------------------------------------------------------------- constants');
        out.push('');
        const constants = this.data.constants;
        for (const [group, names] of Object.entries(constants)) {
            if (!Array.isArray(names))
                continue;
            // Branded so a parameter declared as this group only accepts members of it, while the
            // constants themselves stay usable as plain numbers.
            out.push(`type ${group} = number & { readonly __cvConstant: '${group}' };`);
            for (const name of names) {
                out.push(`declare const ${name}: ${group};`);
            }
            out.push('');
        }
        // --- database driven values ------------------------------------------
        out.push('// ---------------------------------------------------------------- database values');
        out.push('');
        out.push('/** Material names read from this Cabinet Vision database. */');
        out.push(`type MaterialName = ${this.unionOf(dynamicData.materials?.map(m => m.name))};`);
        out.push('/** Construction names read from this Cabinet Vision database. */');
        out.push(`type ConstructionName = ${this.unionOf(dynamicData.constructions?.map(c => c.name))};`);
        out.push('/** Schedule names read from this Cabinet Vision database. */');
        out.push(`type ScheduleName = ${this.unionOf(dynamicData.schedules?.map(s => s.name))};`);
        out.push('/** Door names read from this Cabinet Vision database. */');
        out.push(`type DoorName = ${this.unionOf(dynamicData.doors?.map(d => d.name))};`);
        out.push('/** Connection names read from this Cabinet Vision database. */');
        out.push(`type ConnectionName = ${this.unionOf(dynamicData.connections?.map(c => c.name))};`);
        out.push('');
        // --- object types ----------------------------------------------------
        out.push('// ---------------------------------------------------------------- object types');
        out.push('');
        for (const cls of this.data.classes) {
            const own = this.forObjectType(cls.name);
            out.push(this.jsDoc('', [
                cls.description,
                `\n\`_cvSystem.CreateObject('${cls.createName}')\``,
                cls.example ? `\n@example\n${cls.example}` : undefined
            ]).trimEnd());
            out.push(`interface ${cls.name} {`);
            out.push(this.members(own.methods, own.properties, '    ', false));
            out.push('}');
            out.push('');
        }
        // Everything AddCAD accepts, so a stray shape or a plain object is rejected there.
        const cad = this.data.classes.filter(c => c.cad).map(c => c.name);
        out.push('/** Any of the 2D CAD entities that can be added to an object with AddCAD. */');
        out.push(`type CVCadObject = ${cad.length ? cad.join(' | ') : 'never'};`);
        out.push('');
        // _this and _cab are both CVAsmManaged, and the JSON describes their members once against
        // both parents, so collect against either.
        const asmMethods = this.data.methods.filter(m => !m.objectType && (this.parents(m).includes('_this') || this.parents(m).includes('_cab')));
        const asmProperties = this.data.properties.filter(p => !p.objectType && (this.parents(p).includes('_this') || this.parents(p).includes('_cab')));
        // Cabinet Vision hands back .NET collections. Typing those as `T[]` put every array method
        // in the completion list and `length` on the object, none of which exist at runtime.
        out.push(...DtsGenerator.COLLECTIONS);
        out.push('/** An assembly, part or other object in the Cabinet Vision model. */');
        out.push('interface CVAsmManaged {');
        out.push(this.members(asmMethods, asmProperties, '    ', false));
        out.push('}');
        out.push('');
        // --- globals ---------------------------------------------------------
        out.push('// ---------------------------------------------------------------- globals');
        out.push('');
        for (const object of this.data.objects) {
            // The JSON uses a lowercase `type` key here while everything else uses `Type`.
            const declaredType = object.type
                ?? object.Type;
            if (declaredType === 'CVAsmManaged') {
                const doc = object.name === '_cab'
                    ? 'The cabinet or assembly that owns the object this UCS is running against.'
                    : 'The object this UCS is running against.';
                out.push(`/** ${doc} */`);
                out.push(`declare const ${object.name}: CVAsmManaged;`);
                out.push('');
                continue;
            }
            const own = this.forParent(object.name);
            out.push(`declare const ${object.name}: {`);
            out.push(this.members(own.methods, own.properties, '    ', true));
            out.push('};');
            out.push('');
        }
        for (const fn of this.data.functions) {
            out.push(this.jsDoc('', [fn.description, fn.definition ? `\n\`${fn.definition}\`` : undefined,
                fn.example ? `\n@example\n${fn.example}` : undefined]).trimEnd());
            out.push(`declare function ${fn.name}(value: number): number;`);
            out.push('');
        }
        if (this.unmappedReturnTypes.size) {
            console.warn('cv-api.d.ts: unrecognised returnType values fell back to any:', [...this.unmappedReturnTypes]);
        }
        return out.join('\r\n');
    }
    buildJsConfig() {
        return this.jsConfig(['**/*.js', 'cv-api.d.ts']);
    }
    /**
     * The jsconfig for Cabinet Vision's debug folder.
     *
     * A flat `*.js` rather than a recursive glob: Cabinet Vision writes its debug copies directly in
     * the folder, and a mirror left in there by an earlier version would otherwise be pulled in as a
     * second copy of every UCS - every library global declared twice. The libraries do have to come
     * in, from the mirror, or the `_<Library>.Method()` calls in the debug copies resolve to nothing.
     */
    buildDebugJsConfig(libraryInclude) {
        const include = ['*.js', 'cv-api.d.ts'];
        if (libraryInclude) {
            include.push(libraryInclude);
        }
        return this.jsConfig(include);
    }
    jsConfig(include) {
        const checkJs = vscode.workspace.getConfiguration('cvucsedit').get('CheckJs', false);
        return JSON.stringify({
            _comment: 'GENERATED by the Cabinet Vision UCS Editor extension - do not edit.',
            compilerOptions: {
                target: 'ES2017',
                // No DOM: the Cabinet Vision script engine is not a browser, so window, document and
                // alert must not appear in completions.
                lib: ['ES2017'],
                // Nothing in the mirror is a module any more - each UCS is a script wrapped in a
                // function, each library a script declaring one global - but moduleResolution needs
                // a module setting of es2015 or later to be legal.
                module: 'ES2020',
                moduleResolution: 'bundler',
                checkJs,
                strict: false,
                noEmit: true,
                maxNodeModuleJsDepth: 0
            },
            include
        }, null, 2);
    }
}
exports.DtsGenerator = DtsGenerator;
//# sourceMappingURL=dtsGenerator.js.map