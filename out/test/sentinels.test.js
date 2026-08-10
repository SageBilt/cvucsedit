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
const assert = __importStar(require("assert"));
const MirrorFileStore_1 = require("../MirrorFileStore");
/**
 * The sentinel round trip, and the guard that stands behind it.
 *
 * These are here because a failure of either is not a wrong colour in an editor: the mirror's file
 * watcher is a direct `UPDATE UCS SET Code` against a live Cabinet Vision database, so text that
 * `stripSentinels` fails to recognise is written into the customer's standards as if the user had
 * typed it. That is what happened when 2.3.0 added the JSDoc block to the library wrapper - every
 * window still running 2.2 pushed the wrapper into every library at once, and Cabinet Vision refused
 * to compile any of them.
 */
const KINDS = ['jsLibrary', 'js', 'ucsm'];
/** Names that are not JavaScript identifiers are the interesting ones: `_cab shape` will not parse. */
const NAMES = ['MyLib', 'MyLibrary', '_priv', '9Lib', 'Cab Shape', 'lib-utils', 'Utils.Math', "Bob's Lib"];
const CODES = [
    'Method1() { return 1; }',
    '',
    '\r\n',
    'a() {}\r\n}', // a body whose own last line is a brace
    '/** doc */\r\nfoo() {}', // a JSDoc of the user's own, below the wrapper
    'foo() {}\r\n\r\n',
    '   ',
    'x() {\r\n  return "*/";\r\n}' // a `*/` inside the body
];
const canonical = (code) => code.replace(/\r\n/g, '\n');
const toCrlf = (code) => code.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
/** The on disk form, exactly as `writeRow` produces it. */
const onDisk = (code, kind, name) => toCrlf((0, MirrorFileStore_1.applySentinels)(code, kind, name));
suite('Sentinels', () => {
    test('applySentinels round trips through stripSentinels', () => {
        for (const kind of KINDS) {
            for (const name of NAMES) {
                for (const code of CODES) {
                    assert.strictEqual(canonical((0, MirrorFileStore_1.stripSentinels)(onDisk(code, kind, name), kind)), canonical(code), `${kind} "${name}" ${JSON.stringify(code)}`);
                }
            }
        }
    });
    test('a stripped file is never mistaken for a sentinel', () => {
        for (const kind of KINDS) {
            for (const name of NAMES) {
                for (const code of CODES) {
                    const stripped = canonical((0, MirrorFileStore_1.stripSentinels)(onDisk(code, kind, name), kind));
                    assert.strictEqual((0, MirrorFileStore_1.sentinelResidue)(stripped, kind), undefined, `${kind} "${name}" ${JSON.stringify(code)}`);
                }
            }
        }
    });
    test('the 2.2 form of the library wrapper still strips', () => {
        // Written by 2.0.0: a bare class declaration closed by a bare brace, and no banner.
        assert.strictEqual((0, MirrorFileStore_1.stripSentinels)('class _mylib {\r\nFoo() {}\r\n}', 'jsLibrary'), 'Foo() {}');
        // Written by 2.2: the instance wrapper and the banner, but no JSDoc.
        const banner = '//~ Cabinet Vision UCS - generated header (cvucsedit). Not part of this standard.';
        assert.strictEqual((0, MirrorFileStore_1.stripSentinels)(`${banner}\r\nconst _mylib = new class mylib {\r\nFoo() {}\r\n}();`, 'jsLibrary'), 'Foo() {}');
    });
    suite('sentinelResidue', () => {
        test('catches the wrapper a mismatched build failed to strip', () => {
            // Verbatim what a 2.2 window wrote into UCS.Code from a file 2.3 had mirrored.
            const pushedBy22 = [
                '/**',
                ' * **Cabinet Vision UCS:JS library** - `cabshape`',
                ' *',
                ' * Shared code, reached as `_cabshape` from every UCS. Its body is a class',
                ' * body: members are methods written without `function`, and they share state through `this`.',
                ' */',
                'const _cabshape = new class cabshapeLibrary {',
                '  Foo() { return 1; }',
                '}();'
            ].join('\n');
            assert.ok((0, MirrorFileStore_1.sentinelResidue)(pushedBy22, 'jsLibrary'));
        });
        test('catches a wrapper with no JSDoc above it', () => {
            assert.ok((0, MirrorFileStore_1.sentinelResidue)('const _x = new class xLibrary {\nFoo() {}\n}();', 'jsLibrary'));
            // The name that does not parse, and used not to match LIBRARY_OPEN either.
            assert.ok((0, MirrorFileStore_1.sentinelResidue)('const _cab shape = new class {\nFoo() {}\n}();', 'jsLibrary'));
        });
        test('catches the generated header, in both comment styles', () => {
            const line = 'Cabinet Vision UCS - generated header (cvucsedit). Not part of this standard.';
            assert.ok((0, MirrorFileStore_1.sentinelResidue)(`//~ ${line}\nvar a = 1;`, 'js'));
            assert.ok((0, MirrorFileStore_1.sentinelResidue)(`;~ ${line}\nValue: 100`, 'ucsm'));
        });
        test('catches the UCS wrapper', () => {
            assert.ok((0, MirrorFileStore_1.sentinelResidue)('(function () {\nreturn 1;\n})();', 'js'));
        });
        test('leaves code that merely resembles a wrapper alone', () => {
            // A UCS with an IIFE of its own further down. Blocking this would stop it ever saving.
            assert.strictEqual((0, MirrorFileStore_1.sentinelResidue)('var a = 1;\n(function () { f(); })();', 'js'), undefined);
            // A library member closing with a brace.
            assert.strictEqual((0, MirrorFileStore_1.sentinelResidue)('Foo() {\n  return 1;\n}', 'jsLibrary'), undefined);
            // The user's own header, which may well name Cabinet Vision.
            assert.strictEqual((0, MirrorFileStore_1.sentinelResidue)('/**\n * Cabinet Vision helper by David\n */\nFoo() {}', 'jsLibrary'), undefined);
            // A UCS:M comment of the user's own, in the prefix the banner uses.
            assert.strictEqual((0, MirrorFileStore_1.sentinelResidue)('Value: 100\n;~ my own note', 'ucsm'), undefined);
        });
    });
});
//# sourceMappingURL=sentinels.test.js.map