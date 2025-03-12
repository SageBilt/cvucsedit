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
exports.SQLConnection = void 0;
const vscode = __importStar(require("vscode"));
const mssql = __importStar(require("mssql"));
// var config : mssql.config = {
//     user: 'CV_MSSQL_User',
//     password: '{B4237C01-2658-4390-BE94-15BB0E840F1E}',  
//     server: 'SAGEPC01\\CV24', 
//     database: 'CVData' , 
//     options: {
//         trustedConnection: true,
//         trustServerCertificate: true
//     }
// };
function GetConfig() {
    return vscode.workspace.getConfiguration('cvucsedit');
}
async function writeConfig(key, value) {
    const config = GetConfig();
    try {
        // Update the configuration (e.g., globally)
        await config.update(key, value, vscode.ConfigurationTarget.Global);
        console.log(`Updated ${key} to ${value}`);
    }
    catch (error) {
        console.error(`Failed to update ${key}: ${error}`);
        vscode.window.showErrorMessage(`Failed to update ${key}: ${error}`);
    }
}
function getDbConfig() {
    const config = GetConfig();
    return {
        user: 'CV_MSSQL_User',
        password: '{B4237C01-2658-4390-BE94-15BB0E840F1E}',
        server: config.get('Server', ''),
        database: config.get('Database', ''),
        options: {
            trustedConnection: true,
            trustServerCertificate: true
        }
    };
}
class SQLConnection {
    ConnPool;
    async getPool() {
        if (!this.ConnPool) {
            try {
                this.ConnPool = await new mssql.ConnectionPool(getDbConfig()).connect();
            }
            catch (error) {
                //vscode.window.showErrorMessage(error);
                const config = GetConfig();
                const origServer = config.get('Server', '');
                const origDatabase = config.get('Database', '');
                const newServer = await vscode.window.showInputBox({ prompt: 'Enter Cabinet Vision SQL Server Name', value: origServer }) || origServer;
                const newDatabase = await vscode.window.showInputBox({ prompt: 'Enter Cabinet Vision SQL Database Name', value: origDatabase }) || origDatabase;
                await writeConfig('Server', newServer);
                await writeConfig('Database', newDatabase);
                const orig1Server = config.get('Server', '');
                const orig1Database = config.get('Database', '');
                this.ConnPool = await new mssql.ConnectionPool(getDbConfig()).connect();
            }
        }
        return this.ConnPool;
    }
    async closePool() {
        if (this.ConnPool) {
            await this.ConnPool.close();
            this.ConnPool = undefined;
        }
    }
    GetParamType(value) {
        switch (typeof value) {
            case 'string':
                return mssql.NVarChar; // or sql.VarChar depending on your needs
            case 'number':
                return Number.isInteger(value) ? mssql.Int : mssql.Float;
            case 'boolean':
                return mssql.Bit;
            case 'object':
                if (value instanceof Date) {
                    return mssql.DateTime;
                }
                if (Array.isArray(value)) {
                    throw new Error('Arrays are not directly supported in PreparedStatement parameters');
                }
                return mssql.NVarChar; // Fallback: serialize objects to JSON string
            default:
                throw new Error(`Unsupported type for value: ${value}`);
        }
    }
    async ExecuteStatment(QueryText, Params) {
        const pool = await this.getPool();
        const ps = new mssql.PreparedStatement(pool);
        const ExParams = {};
        //Add Parameters
        Params.forEach(param => {
            ps.input(param.Name, this.GetParamType(param.Value));
            ExParams[param.Name] = param.Value; // Map name to value
        });
        try {
            await ps.prepare(QueryText);
            const result = await ps.execute(ExParams);
            // Return a unified result object
            const statementResult = {};
            // If there's a recordset (e.g., from SELECT), include it
            if (result.recordset && result.recordset.length > 0) {
                statementResult.recordset = result.recordset;
            }
            // If rowsAffected is present (e.g., from INSERT/UPDATE/DELETE), include it
            if (result.rowsAffected && result.rowsAffected.length > 0) {
                statementResult.rowsAffected = result.rowsAffected[0]; // Usually a single number
            }
            return statementResult;
        }
        finally {
            // Ensure unprepare is called even if there's an error
            await ps.unprepare();
        }
    }
}
exports.SQLConnection = SQLConnection;
//# sourceMappingURL=SQLConnection.js.map