import type { Collection } from 'mongodb';
import type { Question } from '@qlicker/shared';
export declare function getQuestions(): Collection<Question>;
export declare function initQuestions(): Promise<Collection<Question>>;
