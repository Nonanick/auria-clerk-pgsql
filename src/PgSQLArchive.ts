import {
  ComparableValues,
  Archive,
  MaybePromise,
  Procedure,
  QueryRequest
} from 'auria-clerk';
import { IEntityProcedureRequest } from 'auria-clerk/dist/procedure/entity/IEntityProcedureRequest';
import { IEntityProcedureResponse } from 'auria-clerk/dist/procedure/entity/IEntityProcedureResponse';
import { IModelProcedureRequest } from 'auria-clerk/dist/procedure/model/IModelProcedureRequest';
import { IModelProcedureResponse } from 'auria-clerk/dist/procedure/model/IModelProcedureResponse';
import { QueryResponse } from 'auria-clerk/dist/query/QueryResponse';
import { Pool, PoolClient } from 'pg';
import { ConnectionInfo } from './connection/ConnectionInfo';
import { QueryParser } from './query/QueryParser';
import { Transaction } from './transaction/Transaction';


export class PgSQLArchive extends Archive {

  protected _connectionInfo: ConnectionInfo;

  protected _pgConn?: Pool;
  protected _client?: PoolClient;

  constructor(connectionInfo: ConnectionInfo) {
    super();
    this._connectionInfo = connectionInfo;
  }

  async connect() {
    this._pgConn = new Pool(this._connectionInfo);
    return this._pgConn;
  }

  async connection(): Promise<Pool> {

    if (this._pgConn == null) {
      await this.connect();
    }

    return this._pgConn!;

  }

  async poolClient(): Promise<PoolClient> {
    if (this._pgConn == null) {
      await this.connect();
    }

    return await this._pgConn!.connect();
  }

  async query<T = any>(request: QueryRequest<T>): MaybePromise<QueryResponse<T>> {

    let query = new QueryParser(request);
    let sql = query.parse();

    let conn = await this.connection();
    let response = new QueryResponse<T>(request);

    try {
      let values = await conn.query(
        sql.query,
        sql.params
      );

      if (Array.isArray(values.rows)) {
        response.addRows(...values.rows);
      }
    } catch (err) {
      response.addErrors(err);
    } finally {
      return response;
    }

  }

  transaction(): Transaction {
    let trx = new Transaction(this);
    return trx;
  }

  async lastInsertedId(): MaybePromise<any> {
    return await this.execute('SELECT last_inserted_id();');
  }

  async execute(query: string, params: ComparableValues[] = []) {
    return (await this.connection()).query(query, params);
  }

}

export type GeneratedQuerySQL = {
  query: string;
  params: any[];
};