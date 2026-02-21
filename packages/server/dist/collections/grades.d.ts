import type { Collection } from 'mongodb';
import type { Grade } from '@qlicker/shared';
export declare function getGrades(): Collection<Grade>;
export declare function initGrades(): Promise<Collection<Grade>>;
