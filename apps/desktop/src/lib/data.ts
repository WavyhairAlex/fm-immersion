import { db } from './db';
import { fmRepo } from './fm';
import { pz2Repo } from './pz2';
import { savesRepo } from './saves';
import { tf3Repo } from './tf3';

export const savesData = savesRepo(db);
export const fmData = fmRepo(db);
export const pz2Data = pz2Repo(db);
export const tf3Data = tf3Repo(db);
