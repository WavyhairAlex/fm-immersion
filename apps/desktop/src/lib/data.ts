import { db } from './db';
import { fmRepo } from './fm';
import { savesRepo } from './saves';

export const savesData = savesRepo(db);
export const fmData = fmRepo(db);
