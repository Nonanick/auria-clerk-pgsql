import { IEntityProcedureRequest, IEntityProcedureResponse, } from 'clerk';

export interface IPgSQLEntityProcedureResponse extends IEntityProcedureResponse {
  success: boolean;
  request: IEntityProcedureRequest;
  sql: string;
  bindedParams: any[];
}