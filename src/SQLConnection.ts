import * as vscode from 'vscode';
import * as mssql from 'mssql';

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

function GetConfig() : vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('cvucsedit');
}

async function writeConfig(key: string, value: string): Promise<void> {
    const config = GetConfig();
    try {
        // Update the configuration (e.g., globally)
        await config.update(key, value, vscode.ConfigurationTarget.Global);
        console.log(`Updated ${key} to ${value}`);
    } catch (error) {
        console.error(`Failed to update ${key}: ${error}`);
        vscode.window.showErrorMessage(`Failed to update ${key}: ${error}`);
    }
}

function getDbConfig(): mssql.config {
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

interface SQLParams {
    Name: string;
    Value: any;
}

interface StatementResult {
    recordset?: mssql.IRecordSet<any>; // For SELECT queries
    rowsAffected?: number; // For INSERT, UPDATE, DELETE
}

export class SQLConnection {
    private ConnPool: mssql.ConnectionPool | undefined;

    async getPool(): Promise<mssql.ConnectionPool | undefined> {
            let tryCount = 0;
            let errorMessage = '';
            while (!this.ConnPool && tryCount < 3) {

                try {
                    this.ConnPool = await new mssql.ConnectionPool(getDbConfig()).connect();
                    errorMessage = '';
                  } catch (error: unknown) {
                      errorMessage = 'An unknown error occurred';
                      if (error instanceof Error) {
                          errorMessage = error.message; // Safe to access if error is an Error
                      }
                      

                      const config = GetConfig();
                      const origServer = config.get('Server', '') ;
                      const origDatabase = config.get('Database', '');
                      const newServer = await vscode.window.showInputBox({ prompt: 'Enter Cabinet Vision SQL Server Name', value: origServer}) || origServer;
                      const newDatabase = await vscode.window.showInputBox({ prompt: 'Enter Cabinet Vision SQL Database Name', value: origDatabase }) || origDatabase;
      
                      await writeConfig('Server',newServer);
                      await writeConfig('Database',newDatabase);
                  }

                
                // const orig1Server = config.get('Server', '') ;
                // const orig1Database = config.get('Database', '');
                tryCount++;
            }

            if (errorMessage != '')
                vscode.window.showErrorMessage(errorMessage);

        return this.ConnPool;
    }

    async OpenPool(): Promise<void> {
        if (this.ConnPool) {
          await this.ConnPool.connect();
        }
    }

    async closePool(): Promise<void> {
        if (this.ConnPool) {
          await this.ConnPool.close();
          //this.ConnPool = undefined;
        }
    }

    GetParamType(value: any) {
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

    async ExecuteStatment(QueryText: string,Params: SQLParams[]) : Promise<StatementResult> {
        const pool = await this.getPool();
        const ps = new mssql.PreparedStatement(pool);
        const ExParams: { [key: string]: any } = {};

        //Add Parameters
        Params.forEach(param => {
            ps.input(param.Name, this.GetParamType(param.Value));
            ExParams[param.Name] = param.Value; // Map name to value
        });

        try {
            await ps.prepare(QueryText);
            const result = await ps.execute(ExParams);

            // Return a unified result object
            const statementResult: StatementResult = {};

            // If there's a recordset (e.g., from SELECT), include it
            if (result.recordset && result.recordset.length > 0) {
                statementResult.recordset = result.recordset;
            }

            // If rowsAffected is present (e.g., from INSERT/UPDATE/DELETE), include it
            if (result.rowsAffected && result.rowsAffected.length > 0) {
                statementResult.rowsAffected = result.rowsAffected[0]; // Usually a single number
            }

            return statementResult;
        } finally {
            // Ensure unprepare is called even if there's an error
            await ps.unprepare();
        }
    }
}