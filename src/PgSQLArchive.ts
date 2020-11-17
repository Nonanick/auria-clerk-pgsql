import {
  IArchive,
  MaybePromise,
  Procedure,
  QueryRequest,
  FilterComparison,
  ComparableValues,
  implementsFilterComparison,
  isFilterComparisonArray,
  IFilterQuery
} from 'auria-clerk';
import { PropertyComparison } from 'auria-clerk/dist/property/comparison/PropertyComparison';

import { QueryResponse } from 'auria-clerk/dist/query/QueryResponse';
import { Pool, PoolClient } from 'pg';
import { Transaction } from './transaction/Transaction';
import { ConnectionInfo } from './connection/ConnectionInfo';
import { QueryParser } from './QueryParser';

export class PgSQLArchive implements IArchive {

  protected _connectionInfo: ConnectionInfo;

  protected _pgConn?: Pool;
  protected _client?: PoolClient;

  protected _modelProcedures: {
    [name: string]: Procedure.OfModel.IProcedure;
  } = {};

  protected _entityProcedures: {
    [name: string]: Procedure.OfEntity.IProcedure;
  } = {};

  constructor(connectionInfo: ConnectionInfo) {
    this._connectionInfo = connectionInfo;
  }

  addModelProcedure(
    name: string,
    procedure: Procedure.OfModel.IProcedure
  ): void {
    let modifiedProcedure: Procedure.OfModel.IProcedure = {
      name: procedure.name,
      execute: procedure.execute.bind(this)
    };

    this._modelProcedures[name] = modifiedProcedure;
  }

  addEntityProcedure(
    name: string,
    procedure: Procedure.OfEntity.IProcedure
  ): void {
    let modifiedProcedure: Procedure.OfEntity.IProcedure = {
      name: procedure.name,
      execute: procedure.execute.bind(this)
    };

    this._entityProcedures[name] = modifiedProcedure;
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

  async query(request: QueryRequest): MaybePromise<QueryResponse> {

    let query = new QueryParser(request);
    let sql = query.parse();

    let conn = await this.connection();
    let response = new QueryResponse(request);

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

  requestToSQL(request: QueryRequest): GeneratedQuerySQL {

    let builtSQL: string = `SELECT `;
    let params: {
      [name: string]: ComparableValues;
    } = {};

    let entityName = request.source;

    // Properties specified ?
    if (request.properties.length > 0) {

      builtSQL += request.properties
        .map(p => `"${entityName}\"."${p}"`)
        .join(' , ');

    }
    // by default, only fetch non-private properties
    else {
      let allProps: string[] = [];
      for (let prop in request.entity.properties) {
        let p = request.entity.properties[prop];
        if (p.isPrivate() !== true) {
          allProps.push(prop);
        }
      }
      // if no property exists use '*'
      builtSQL += allProps.length === 0
        ? '*'
        : allProps
          .map(p => `"${entityName}"."${p}"`)
          .join(',');
    }

    // Source
    builtSQL += ` FROM "${entityName}" `;

    // Filters ?
    if (request.hasFilter()) {

      let filters: string[] = [];

      for (let filterName in request.filters) {
        let filter = request.filters[filterName]!;
        let partialFilter = this.sqlFromFilter(filter, params);

        if (Array.isArray(partialFilter)) {
          filters.push(...partialFilter);
        } else {
          filters.push(partialFilter);
        }
      }
      let filterString = filters.map(f => `(${f})`).join(' AND ');

      if (filterString.length > 0) {
        builtSQL += ` WHERE ${filterString} `;
      }
    }

    // Order By
    if (request.hasOrder()) {
      let orderSQL: string[] = [];
      for (let order of request.ordering) {
        orderSQL.push(
          order.property
          + (order.direction === 'desc' ? 'DESC' : '')
        );
      }

      if (orderSQL.length > 0) {
        builtSQL += ' ORDER BY ' + orderSQL.join(' , ');
      }
    }

    // Limiter + pagination ?
    if (request.hasLimiter()) {
      builtSQL += ` LIMIT ${request.limit.amount}`;
      builtSQL += request.limit.offset != null ? ' OFFSET ' + request.limit.offset : '';
    }

    let parsedQuery = this.parseNamedAttributes(builtSQL, params);
    return parsedQuery;

  }

  parseNamedAttributes(query: string, namedParams: { [name: string]: ComparableValues; }): GeneratedQuerySQL {
    let matches = query.match(/:\[.*?\]/g);
    if (matches != null) {
      let paramCount = 1;
      let params: ComparableValues[] = [];
      for (let p of matches) {
        let paramName = p.slice(2, -1);
        query = query.replace(p, '$' + paramCount);
        paramCount++;
        params.push(namedParams[paramName]);
      }
      return {
        query,
        params
      };
    } else {
      return {
        query,
        params: []
      };
    }
  }

  sqlFromFilter(
    filter: FilterComparison[],
    params: { [name: string]: ComparableValues; }
  ): string[];
  sqlFromFilter(
    filter: IFilterQuery | FilterComparison,
    params: { [name: string]: ComparableValues; }
  ): string;
  sqlFromFilter(
    filter: IFilterQuery | FilterComparison | FilterComparison[],
    params: { [name: string]: ComparableValues; }
  ): string | string[];
  sqlFromFilter(
    filter: IFilterQuery | FilterComparison | FilterComparison[],
    params: { [name: string]: ComparableValues; }
  ): string | string[] {
    if (Array.isArray(filter) && !isFilterComparisonArray(filter)) {
      return filter
        .map(f => this.sqlFromFilter(f, params));
    }

    // Handle FilterComparison
    if (implementsFilterComparison(filter)) {

      if (Array.isArray(filter)) {
        filter = {
          property: filter[0],
          comparison: filter[1],
          value: filter[2]
        };
      }

      let filterSource = filter.source != null
        // Source
        ? '"' + filter.source + '".'
        : '';

      let filterValue: string;


      // Handle value as array differently
      if (Array.isArray(filter.value)) {
        let nonce = 0;
        let paramName = `${filter.source != null ? String(filter.source) : ''}${filter.property}`;
        while (params[paramName + nonce] != null) {
          nonce++;
        }
        const values: string[] = [];
        for (let val of filter.value) {
          params[paramName + nonce] = val;
          values.push(` :[${paramName + nonce}] `);
          nonce++;
        }
        filterValue = '( ' + values.join(',') + ' )';
      } else {
        let nonce = 0;
        let paramName = `${filter.source != null ? String(filter.source) : ''}${filter.property}`;
        while (params[paramName + nonce] != null) {
          nonce++;
        }
        params[paramName + nonce] = filter.value;
        filterValue = ` :[${paramName + nonce}] `;
      }

      let cmp = this.resolveComparison(filter.comparison);

      return (
        filterSource
        // Property name
        + ' "' + filter.property + '" '
        // Comparator
        + (cmp === 'is' ? 'IS NULL' : cmp)

        // Value placeholder
        + (cmp === 'is' ? '' : filterValue)
      );
    }

    // Handle IFilterQuery
    let filters: string[] = [];

    for (let name in filter) {

      let f = filter[name]!;
      let filtered: string | string[] = this.sqlFromFilter(f, params);

      if (name === '$or') {
        filters.push(
          '( ' + (filtered as string[])
            .map(f => `(${f})`)
            .join(' OR ') + ' )'
        );
      } else if (name === '$not') {
        filters.push(
          ' NOT (' +
          (filtered as string[])
            .map(f => `(${f})`)
            .join(' AND ')
          + ') '
        );
      } else {
        if (Array.isArray(filtered)) {
          filters.push(
            (filtered as string[])
              .map(f => `(${f})`)
              .join(' AND ')
          );
        } else {
          filters.push(filtered);
        }
      }
    }

    return filters.map(f => `${f}`).join(' AND ');

  }

  resolveComparison(comparison: PropertyComparison): string {
    switch (comparison) {
      // equal
      case 'equal':
      case 'eq':
      case '=':
      case '==':
        return '=';
      case "is":
        return "is";
      // not equal
      case 'neq':
      case 'not equal':
      case '<>':
      case '!=':
        return '!=';

      // like
      case 'like':
      case '=~':
        return ' LIKE ';

      // not like
      case 'not like':
      case '!=~':
        return ' NOT LIKE ';

      // lesser than
      case '<':
      case 'lt':
      case 'lesser than':
        return '<';

      // greater than
      case '>':
      case 'gt':
      case 'greater than':
        return '>';

      // lesser than or equal to
      case '<=':
      case 'lte':
      case 'lesser than or equal to':
        return '<=';

      // greater than or equal to
      case '>=':
      case 'gte':
      case 'greater than or equal to':
        return '>=';

      // included
      case 'in':
      case 'included in':
      case 'contained in':
        return ' IN ';

      // not included
      case 'not in':
      case 'not included in':
      case 'not contained in':
        return ' NOT IN';
      default:
        return '=';
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