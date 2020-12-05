import { IEntityProcedureRequest, IEntityProcedureResponse, } from 'auria-clerk';

export interface IPgSQLEntityProcedureResponse extends IEntityProcedureResponse {
  success: boolean;
  request: IEntityProcedureRequest;
  sql: string;
  bindedParams: any[];
}