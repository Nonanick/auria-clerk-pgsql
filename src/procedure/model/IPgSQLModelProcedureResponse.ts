import { IProcedureResponse } from 'clerk';

export interface IPgSQLModelProcedureResponse extends IProcedureResponse {
  sql: string;
  bindParams: any[];
}