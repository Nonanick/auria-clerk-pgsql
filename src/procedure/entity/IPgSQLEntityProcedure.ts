
import { IArchive, MaybePromise, Procedure } from 'auria-clerk';
import { IPgSQLEntityProcedureResponse } from './IPgSQLEntityProcedureResponse';

export interface IPgSQLEntityProcedure
  extends Procedure.OfEntity.IProcedure {
  execute: (
    archive: IArchive,
    request: Procedure.OfEntity.IRequest
  ) => MaybePromise<IPgSQLEntityProcedureResponse>;
}