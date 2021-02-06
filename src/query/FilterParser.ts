import { ComparableValues, FilterComparison, IFilterQuery, implementsFilterComparison, isFilterComparisonArray, PropertyComparison } from "clerk";
import { GeneratedQuerySQL } from "../PgSQLArchive";

type FilterParams = {
  [name: string]: ComparableValues;
};

function ResolveComparison(comparison: PropertyComparison): string {
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

function ParseAll(mainFilter: IFilterQuery, params: FilterParams
) {

  let sqlFilter = '';
  let filters: string[] = [];

  for (let filterName in mainFilter) {
    let filter = mainFilter[filterName]!;
    let partialFilter = ParseOne(filter, params);

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

function ParseOne(filter: FilterComparison[], params: FilterParams): string[];
function ParseOne(filter: IFilterQuery | FilterComparison, params: FilterParams): string;
function ParseOne(filter: IFilterQuery | FilterComparison | FilterComparison[], params: FilterParams): string | string[];
function ParseOne(filter: IFilterQuery | FilterComparison | FilterComparison[], params: FilterParams): string | string[] {

  if (Array.isArray(filter) && !isFilterComparisonArray(filter)) {
    return filter.map(f => ParseOne(f, params));
  }

  // Handle FilterComparison
  if (implementsFilterComparison(filter)) {
    return FilterComparison(filter, params);
  }

  // Handle IFilterQuery
  return IFilterQuery(filter, params);

}

function FilterComparison(filter: FilterComparison, params: FilterParams) {
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

  let cmp = ResolveComparison(filter.comparison);

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

function IFilterQuery(filter: IFilterQuery, params: FilterParams) {
  let filters: string[] = [];

  for (let name in filter) {

    let f = filter[name]!;
    let filtered: string | string[] = ParseOne(f, params);

    if (name === '$or') {
      filters.push(
        '( ' + (filtered as unknown as string[])
          .map(f => `(${f})`)
          .join(' OR ') + ' )'
      );
    } else if (name === '$not') {
      filters.push(
        ' NOT (' +
        (filtered as unknown as string[])
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

function ParseNamedAttributes(query: string, namedParams: { [name: string]: ComparableValues; }): GeneratedQuerySQL {
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

export const FilterParser = {
  ParseAll,
  ParseNamedAttributes,
  IFilterQuery,
  ParseFilterComparison: FilterComparison,
  ParseOne,
  ResolveComparison

};
