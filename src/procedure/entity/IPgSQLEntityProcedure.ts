
import { IArchive, MaybePromise, Procedure } from 'auria-clerk';
import { IPgSQLEntityProcedureResponse } from './IPgSQLEntityProcedureResponse';

export interface IPgSQLEntityProcedure<
  Context extends Procedure.OfEntity.IContext = Procedure.OfEntity.IContext>
  extends Procedure.OfEntity.IProcedure<Context> {
  execute: (
    archive: IArchive,
    request: Procedure.OfEntity.IRequest
  ) => MaybePromise<IPgSQLEntityProcedureResponse>;
}