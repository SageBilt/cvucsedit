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
exports.AGENTDOCSDIR = exports.UCSJSSNIPPETSJSONPATH = exports.UCSJSSYSTEMJSONPATH = exports.UCSMCONTROLSTRUCTURESJSONPATH = exports.UCSMSYNTAXJSONPATH = exports.UCSMSYSTEMJSONPATH = void 0;
exports.agentDocPath = agentDocPath;
const path = __importStar(require("path"));
exports.UCSMSYSTEMJSONPATH = path.join(__dirname, '../Languages/data/system.json');
exports.UCSMSYNTAXJSONPATH = path.join(__dirname, '../Languages/ucsm/data/ucsm_syntax.json');
exports.UCSMCONTROLSTRUCTURESJSONPATH = path.join(__dirname, '../Languages/ucsm/data/control_structures.json');
exports.UCSJSSYSTEMJSONPATH = path.join(__dirname, '../Languages/ucsjs/data/ucsjs_system.json');
exports.UCSJSSNIPPETSJSONPATH = path.join(__dirname, '../Languages/ucsjs/ucsjs.snippets.json');
/**
 * Markdown sources for the documentation written into the mirror folder for AI agents. Kept as
 * files rather than string literals for the same reason the language data is: they are content,
 * not code, and editing them should not need a recompile.
 */
exports.AGENTDOCSDIR = path.join(__dirname, '../Languages/agent');
function agentDocPath(name) {
    return path.join(exports.AGENTDOCSDIR, name);
}
//# sourceMappingURL=constants.js.map