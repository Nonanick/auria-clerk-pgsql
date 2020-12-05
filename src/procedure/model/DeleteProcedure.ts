import { IModelProcedure } from 'auria-clerk';
import { PgSQLArchive } from "../../PgSQLArchive";
import { IPgSQLModelProcedureResponse } from './IPgSQLModelProcedureResponse';

export const DeleteProcedure: IModelProcedure<
  IPgSQLModelProcedureResponse
> = {
  name: 'delete',
  async execute(archive, request, context) {

    if (!(archive instanceof PgSQLArchive)) {
      return new Error('Create procedure expects an PgSQL!');
    }

    const model = request.model;
    let deleteSQL = `DELETE FROM "${request.entity.source}" `;

    // Filter by identifier
    deleteSQL += ` WHERE "${request.entity.identifier.name}" = $1`;

    try {
      let queryResponse = await archive.execute(
        deleteSQL,
        [await model.$id()]
      );

      return {
        procedure: request.procedure,
        request,
        model: request.model,
        success: true,
        sql: deleteSQL,
        bindParams: [await model.$id()]
      };

    } catch (err) {
      console.error('FAILED to delete model using SQL query ', deleteSQL);
      return {
        procedure: request.procedure,
        request,
        model: request.model,
        success: false,
        sql: deleteSQL,
        bindParams: [await model.$id()]
      };
    }

  }
};
