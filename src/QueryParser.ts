import { ComparableValues, FilterComparison, IFilterQuery, implementsFilterComparison, IQueryRequest, isFilterComparisonArray, QueryRequest } from "auria-clerk";
import { PropertyComparison } from "auria-clerk/dist/property/comparison/PropertyComparison";
import { GeneratedQuerySQL } from "./PgSQLArchive";

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

    let parsedQuery = this.parseNamedAttributes(builtSQL, this._parameterValues);

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

    let sqlFilter = '';
    let filters: string[] = [];

    for (let filterName in this._request.filters) {
      let filter = this._request.filters[filterName]!;
      let partialFilter = this.parseFilter(filter);

      if (Array.isArray(partialFilter)) {
        filters.push(...partialFilter);
      } else {
        filters.push(partialFilter);
      }
    }
    let filterString = filters.map(f => `(${f})`).join(' AND ');

    if (filterString.length > 0) {
      sqlFilter += ` WHERE ${filterString} `;
    }

    return sqlFilter;
  }

  parseFilter(filter: FilterComparison[]): string[];
  parseFilter(filter: IFilterQuery | FilterComparison): string;
  parseFilter(filter: IFilterQuery | FilterComparison | FilterComparison[]): string | string[];
  parseFilter(filter: IFilterQuery | FilterComparison | FilterComparison[]): string | string[] {

    if (Array.isArray(filter) && !isFilterComparisonArray(filter)) {
      return filter.map(f => this.parseFilter(f));
    }

    // Handle FilterComparison
    if (implementsFilterComparison(filter)) {
      return this.parseFilterComparison(filter);
    }

    // Handle IFilterQuery
    return this.parseIFilterQuery(filter);

  }

  parseFilterComparison(filter: FilterComparison) {
    // Transform array into object
    if (Array.isArray(filter)) {
      filter = {
        property: filter[0],
        comparison: filter[1],
        value: filter[2]
      };
    }

    // Source
    let filterSource = filter.source != null

      ? '"' + filter.source + '".'
      : '';

    let filterValue: string;

    // Handle value as array differently
    if (Array.isArray(filter.value)) {
      let nonce = 0;
      let paramName = `${filter.source != null ? String(filter.source) : ''}${filter.property}`;
      while (this._parameterValues[paramName + nonce] != null) {
        nonce++;
      }
      const values: string[] = [];
      for (let val of filter.value) {
        this._parameterValues[paramName + nonce] = val;
        values.push(` :[${paramName + nonce}] `);
        nonce++;
      }
      filterValue = '( ' + values.join(',') + ' )';
    } else {
      let nonce = 0;
      let paramName = `${filter.source != null ? String(filter.source) : ''}${filter.property}`;
      while (this._parameterValues[paramName + nonce] != null) {
        nonce++;
      }
      this._parameterValues[paramName + nonce] = filter.value;
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

  parseIFilterQuery(filter: IFilterQuery) {
    let filters: string[] = [];

    for (let name in filter) {

      let f = filter[name]!;
      let filtered: string | string[] = this.parseFilter(f);

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


}