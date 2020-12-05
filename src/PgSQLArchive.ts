import {
  ComparableValues,
  Archive,
  MaybePromise,
  QueryRequest,
  IOrderBy
} from 'auria-clerk';
import { QueryResponse } from 'auria-clerk/dist/query/QueryResponse';
import { Pool, PoolClient } from 'pg';
import { ConnectionInfo } from './connection/ConnectionInfo';
import { BatchUpdate } from './procedure/entity';
import { Create, Delete, Update } from './procedure/model';
import { QueryParser } from './query/QueryParser';
import { Transaction } from './transaction/Transaction';

export class PgSQLArchive extends Archive {

  protected _connectionInfo: ConnectionInfo;

  protected _pgConn?: Pool;
  protected _client?: PoolClient;

  constructor(connectionInfo: ConnectionInfo) {
    super();
    this._connectionInfo = connectionInfo;

    this.addModelProcedure(Create, Update, Delete);
    this.addEntityProcedure(BatchUpdate);
  }

  async connect() {
    this._pgConn = new Pool(this._connectionInfo);
    return this._pgConn;
  }

  async connection(): Promise<Pool> {

    if (this._pgConn == null) {
      await this.connect();
      this._pgConn!.on('error', (err, cl) => {
        console.error('Error on PgSQL!', err.name, err.message);
      });
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

        let rows: any[] = [];

        if (request.hasIncludes()) {
          rows = this.arrangeIncludedProperties(request, values.rows);
          rows = await this.fetchChildRows(request, rows);
        } else {
          rows = values.rows;
        }

        response.addRows(...rows);
      }
    } catch (err) {
      console.error('Failed to query PostgresSQL!', err);
      response.addErrors(err);
    } finally {
      return response;
    }

  }

  protected arrangeIncludedProperties(request: QueryRequest<any>, values: any[]) {

    for (let includedProp of request.includes) {

      let relation = request.entity.properties[includedProp]?.getRelation();
      if (relation!.type !== 'one-to-one' && relation!.type !== 'many-to-one') {
        continue;
      }

      let baseName = `related_to_${includedProp}_`;
      let newValues = values.map(row => {
        let newRow = { ...row };

        for (let rowPropertyName in row) {
          if (rowPropertyName.indexOf(baseName) === 0) {

            let newName = rowPropertyName.replace(baseName, '');
            let value = row[rowPropertyName];
            delete newRow[rowPropertyName];

            if (typeof newRow[includedProp] !== 'object') {
              newRow[includedProp] = {};
            }

            newRow[includedProp][newName] = value;
          }
        }

        return newRow;
      });

      values = newValues;
    }
    return values;
  }

  protected async fetchChildRows(request: QueryRequest<any>, values: any[]) {

    for (let includedProp of request.includes) {

      let relation = request.entity.properties[includedProp]?.getRelation();
      if (relation == null) {
        continue;
      }

      // Fetch child rows applies only for many-to-one relations
      if (relation.type !== 'many-to-one') {
        continue;
      }

      let store = request.entity.store();
      let childRequest = new QueryRequest(store.entity(relation.entity.name)!);
      let ordering: IOrderBy[] = [
        {
          property: relation?.property!,
          direction: 'asc'
        }
      ];

      if (relation.order != null) {
        if (Array.isArray(relation.order)) {
          ordering.push(...relation.order);
        } else {
          ordering.push(relation.order);
        }
      }

      // Query for children whose parent was queried in the main query
      childRequest.loadQueryRequest({
        properties: relation?.returning,
        order: ordering,
        filters: {
          ...relation?.filters ?? {},
          'included-in-previous': [relation?.property!, 'included in', values.map(m => {
            return m[includedProp];
          })]
        },
      });

      const childRows = await childRequest.fetch();
      if (childRows instanceof Error || childRows == null) {
        console.error('Failed to fetch associated child of property ', includedProp);
        return values;
      }

      const placeInRowAt: {
        [index: number]: any;
      } = {};

      // Associate children to parent index
      for (let index = 0; index <= childRows.length; index++) {
        let child = childRows[index];
        for (let row of values) {

          if (child[relation.property] === row[includedProp]) {
            // Initialize array
            if (!Array.isArray(placeInRowAt[index])) placeInRowAt[index] = [];

            placeInRowAt[index].push(row);
            // Found its parent? stop!
            break;
          }
        }
      }

      for (let index in placeInRowAt) {
        values[index][includedProp] = placeInRowAt[index];
      }

      console.log('Associated children: ', childRows);

    }

    return values;
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