import { IProcedureResponse } from 'auria-clerk';

export interface IPgSQLModelProcedureResponse extends IProcedureResponse {
  sql: string;
  bindParams: any[];
}