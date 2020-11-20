import { ComparableValues, QueryRequest } from "auria-clerk";
import { FilterParser } from "./FilterParser";

export class QueryParser {

  protected _parameterValues: {
    [name: string]: ComparableValues;
  } = {};

  protected _paramNonce: {
    [name: string]: number;
  } = {};

  constructor(protected _request: QueryRequest) {

  }

  parse() {

    let builtSQL: string = `SELECT `;

    // Columns
    builtSQL += this.parseColumns();

    // Source
    builtSQL += this.parseSource();

    // Filters ?
    if (this._request.hasFilter()) {
      builtSQL += this.parseFilters();
    }

    // Order By
    if (this._request.hasOrder()) {
      builtSQL += this.parseOrder();
    }

    // Limiter + pagination ?
    if (this._request.hasLimiter()) {
      builtSQL += ` LIMIT ${this._request.limit.amount}`;
      builtSQL += this._request.limit.offset != null ? ' OFFSET ' + this._request.limit.offset : '';
    }

    let parsedQuery = FilterParser.ParseNamedAttributes(builtSQL, this._parameterValues);

    return parsedQuery;

  }

  parseSource() {
    let entityName = this._request.source;
    return ` FROM "${entityName}" `;
  }

  parseColumns() {

    let parsedColumns = '';
    let entityName = this._request.source;

    // Properties specified ?
    if (this._request.properties.length > 0) {

      parsedColumns += this._request.properties
        .map(p => `"${entityName}\"."${p}"`)
        .join(' , ');

    }
    // by default, only fetch non-private properties
    else {
      let allProps: string[] = [];
      for (let prop in this._request.entity.properties) {
        let p = this._request.entity.properties[prop];
        if (p.isPrivate() !== true) {
          allProps.push(prop);
        }
      }
      // if no property exists use '*'
      parsedColumns += allProps.length === 0
        ? '*'
        : allProps
          .map(p => `"${entityName}"."${p}"`)
          .join(',');
    }

    return parsedColumns;
  }

  parseFilters() {

    return FilterParser.ParseAll(this._request.filters, this._parameterValues);
  }



  parseOrder() {

    let orderingSQL = '';

    let orderSQL: string[] = [];
    for (let order of this._request.ordering) {

      if (this._request.entity.properties[order.property] == null) {
        console.error('Unknown property ' + order.property + ' in ORDER clause!');
        continue;
      }

      orderSQL.push(
        order.property
        + (order.direction === 'desc' ? 'DESC' : '')
      );

    }

    if (orderSQL.length > 0) {
      orderingSQL += ' ORDER BY ' + orderSQL.join(' , ');
    }

    return orderingSQL;
  }


}