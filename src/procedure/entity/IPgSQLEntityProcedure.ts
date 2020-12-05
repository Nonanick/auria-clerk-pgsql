
import { IArchive, IEntityProcedure, IEntityProcedureRequest, MaybePromise } from 'auria-clerk';
import { IPgSQLEntityProcedureResponse } from './IPgSQLEntityProcedureResponse';

export interface IPgSQLEntityProcedure
  extends IEntityProcedure {
  execute: (
    archive: IArchive,
    request: IEntityProcedureRequest
  ) => MaybePromise<IPgSQLEntityProcedureResponse>;
}