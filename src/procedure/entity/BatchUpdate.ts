import { ComparableValues, IEntityProcedure, IEntityProcedureContext, IFilterQuery, MaybePromise, } from 'auria-clerk';
import { PgSQLArchive } from '../../PgSQLArchive';
import { FilterParser } from '../../query/FilterParser';
import { IPgSQLEntityProcedureResponse } from './IPgSQLEntityProcedureResponse';

export const BatchUpdate: IEntityProcedure = {
  name: 'batch-update',
  async execute(archive, request) {

    if (!(archive instanceof PgSQLArchive)) {
      return new Error('Batch Update expects an PgSQL archive!');
    }

    let updateSQL = `UPDATE \`${request.entity.source}\` `;

    const bindParams: any[] = [];
    const updateProperties: string[] = [];
    for (let propName in request.context.values) {
      let value = request.context.values[propName];
      updateProperties.push('`' + request.entity.source + '`.`' + propName + '` = ?');
      bindParams.push(value);
    }
    updateSQL += ' SET ' + updateProperties.join(' , ');

    let whereParams: { [name: string]: ComparableValues; } = {};
    let whereQuery = FilterParser.ParseAll(request.context.filter, whereParams);
    let parsedWhere = FilterParser.ParseNamedAttributes(whereQuery, whereParams);
    updateSQL += ' WHERE ' + parsedWhere.query;
    bindParams.push(...parsedWhere.params);

    let batchUpdateResponse = await archive.execute(updateSQL, bindParams);

    let result = batchUpdateResponse;

    return {
      procedure: this.name,
      bondedParams: bindParams,
      sql: updateSQL,
      success: result.rowCount > 0,
      request: request,
    };
  }
};


export interface BatchUpdateContext extends IEntityProcedureContext {
  values: any;
  filter: IFilterQuery;
};

declare module 'auria-clerk' {
  interface Entity {
    execute(procedure: 'batch-update', context: BatchUpdateContext): MaybePromise<IPgSQLEntityProcedureResponse>;
  }
}