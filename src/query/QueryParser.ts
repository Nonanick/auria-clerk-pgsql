import { ComparableValues, IPropertyRelation, QueryRequest } from "auria-clerk";
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

    // Include / Joins
    if (this._request.hasIncludes()) {
      builtSQL += (
        this._request.hasFilter()
          ? ' AND '
          : ' WHERE '
      ) + this.parseIncludeFilter();
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
    // console.debug('Parsed Query -> ', parsedQuery);

    return parsedQuery;

  }

  parseSource() {

    let entityName = `"${this._request.source}"`;

    // Will join any table?
    if (this._request.includes.length > 0) {
      for (let includedProp of this._request.includes) {
        let relation = this._request.entity.properties[includedProp].getRelation();
        if (relation == null) {
          continue;
        }

        // Only bring as join one-one or 'many-one' related data
        if (relation.type === 'one-to-one' || relation.type === 'many-to-one') {
          let source = relation.entity.source != null ? relation.entity.source : relation.entity.name;
          entityName += ` , "${source}"`;
        }
      }
    }

    return ` FROM ${entityName} `;
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
        ? '"' + entityName + '"."*"'
        : allProps
          .map(p => `"${entityName}"."${p}"`)
          .join(',');
    }

    // Will join any table?
    if (this._request.includes.length > 0) {
      for (let includedProp of this._request.includes) {
        let relation = this._request.entity.properties[includedProp].getRelation();
        if (relation == null) {
          continue;
        }

        // Only bring as join one-one or 'many-one' related data
        if (relation.type === 'one-to-one' || relation.type === 'many-to-one') {
          parsedColumns += ", " + this.parseRelationColumns(includedProp, relation);
        }
      }
    }

    return parsedColumns;
  }

  parseRelationColumns(property: string, relation: IPropertyRelation) {

    let entity = relation.entity;
    let source = entity.source != null ? entity.source : entity.name;

    // specified which columns to return?
    if (relation.returning != null && relation.returning.length > 0) {
      return relation.returning
        .map(propName => {
          return `"${source}"."${propName}" as "related_to_${property}_${propName}"`;
        }).join(' , ');
    }

    // if not specified get all public
    let publicProperties: string[] = [];
    for (let propName in entity.properties) {
      let prop = entity.properties[propName];
      if (prop.private !== true) {
        publicProperties.push(`"${source}"."${propName}"  as "related_to_${property}_${propName}"`);
      }
    }

    // if no public properties, return all?
    if (publicProperties.length > 0) {
      return publicProperties.join(' , ');
    } else {
      return `"${source}"."*"`;
    }

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

  parseIncludeFilter() {

    let includeFilters: string[] = [];

    for (let includedProp of this._request.includes) {

      let prop = this._request.entity.properties[includedProp]!;

      let relatedProp = prop.getRelation()?.property!;
      let relatedEnt = prop.getRelation()?.entity!;
      let relatedSource = relatedEnt?.source != null ? relatedEnt.source : relatedEnt.name;

      includeFilters.push(
        `"${this._request.entity.source}"."${includedProp}" = "${relatedSource}"."${relatedProp}"`
      );
    }

    return includeFilters.join(' AND ');

  }


}