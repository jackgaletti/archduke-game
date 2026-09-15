import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { State } from '../engine/model.js';
export type RecordData={state:State;sessions:Record<string,string>;admissions?:Record<string,string>;lastActive:number};
export interface Store{load():RecordData[];save(record:RecordData):void;remove(room:string):void;close():void;}
export class MemoryStore implements Store {load(){return [];}save(_r:RecordData){void _r;}remove(_r:string){void _r;}close(){}}
export class SQLiteStore implements Store{
 private db:DatabaseSync;
 constructor(dir:string){mkdirSync(dir,{recursive:true,mode:0o700});this.db=new DatabaseSync(join(dir,'archduke.sqlite'));this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, body TEXT NOT NULL)');}
 load(){return (this.db.prepare('SELECT body FROM rooms').all() as {body:string}[]).map(r=>JSON.parse(r.body) as RecordData);}
 save(r:RecordData){this.db.prepare('INSERT INTO rooms(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(r.state.room,JSON.stringify(r));}
 remove(room:string){this.db.prepare('DELETE FROM rooms WHERE id=?').run(room);}
 close(){this.db.close();}
}
