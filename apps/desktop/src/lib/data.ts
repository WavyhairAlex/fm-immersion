import { db } from './db';
import { savesRepo } from './saves';

export const savesData = savesRepo(db);
