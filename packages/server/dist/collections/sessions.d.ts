import type { Collection } from 'mongodb';
import type { Session } from '@qlicker/shared';
export declare function getSessions(): Collection<Session>;
export declare function initSessions(): Promise<Collection<Session>>;
