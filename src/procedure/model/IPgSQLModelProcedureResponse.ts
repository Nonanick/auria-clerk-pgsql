import { Procedure } from 'auria-clerk';

export interface IPgSQLModelProcedureResponse extends Procedure.OfModel.IResponse {
  sql: string;
  bindParams: any[];
}