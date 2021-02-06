import { AppException, ComparableValues, MaybePromise } from 'clerk';
import { PoolClient } from 'pg';
import { PgSQLArchive } from '../PgSQLArchive';

export class Transaction {

  protected _trxConn?: PoolClient;
  protected _ended: boolean = false;

  protected _trxTimeout = 2 * 60 * 1000;
  private timeoutId?: NodeJS.Timer;

  constructor(protected _conn: PgSQLArchive) {
  }

  protected async getConnection() {
    if (this._ended) {
      throw new AppException('Mysql Transaction already finished!');
    }

    if (this._trxConn == null) {
      this._trxConn = await (await this._conn.poolClient());
      await this._trxConn.query("BEGIN");
      this.timeoutId = setTimeout(() => {
        this._trxConn?.release();
      }, this._trxTimeout);
    }

    return this._trxConn;
  }


  async execute(
    query: string,
    params: ComparableValues[] = []
  ) {
    if (this._ended) {
      throw new AppException('Mysql Transaction already finished!');
    }

    let poolConn = await this.getConnection();

    try {
      let ret = await poolConn.query(query, params);
      return ret;
    } catch (err) {
      await this.rollback();
      throw err;
    }
  }

  async lastInsertedId(): MaybePromise<any> {
    return await this.execute('SELECT last_inserted_id();');
  }

  async commit() {
    if (this._ended) {
      throw new AppException('PgSQL Transaction already finished!');
    }
    this._ended = true;
    try {
      await this._trxConn!.query("COMMIT");
    } catch (err) {
      await this._trxConn!.query("ROLLBACK");
      throw err;
    } finally {
      this.release();
    }
  }

  async release() {
    await this._trxConn?.release();
    delete this._trxConn;
    this._ended = true;
    if (this.timeoutId != null)
      clearTimeout(this.timeoutId!);
  }

  async rollback() {
    if (this._ended) {
      throw new AppException('Mysql Transaction already finished!');
    }
    this._ended = true;

    try {
      await this._trxConn!.query("ROLLBACK");
    } catch (err) {
      console.error('Failed to rollback pgsql transaction! ', err);
    } finally {
      this.release();
    }
  }

}