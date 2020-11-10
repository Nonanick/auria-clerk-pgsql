import { Procedure } from 'auria-clerk';
import { PgSQLArchive } from "../../PgSQLArchive";
import { IPgSQLModelProcedureResponse } from './IPgSQLModelProcedureResponse';

export const DeleteProcedure: Procedure.OfModel.IProcedure<
  Procedure.OfModel.IContext,
  IPgSQLModelProcedureResponse
> = {
  name: 'delete',
  async execute(archive, request) {

    if (!(archive instanceof PgSQLArchive)) {
      return new Error('Create procedure expects an PgSQL!');
    }

    const model = request.model;
    let deleteSQL = `DELETE FROM \`${request.entity.source}\` `;

    // Filter by identifier
    deleteSQL += ` WHERE \`${request.entity.identifier.name}\` = ?`;

    try {
      let queryResponse = await archive.execute(
        deleteSQL,
        [await model.$id()]
      );

      return {
        request,
        model: request.model,
        success: true,
        sql: deleteSQL,
        bindParams: [await model.$id()]
      };

    } catch (err) {
      console.error('FAILED to delete model using SQL query ', deleteSQL);
      return {
        request,
        model: request.model,
        success: false,
        sql: deleteSQL,
        bindParams: [await model.$id()]
      };
    }

  }
};
