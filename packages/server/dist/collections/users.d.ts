import type { Collection } from 'mongodb';
import type { User } from '@qlicker/shared';
export declare function getUsers(): Collection<User>;
export declare function initUsers(): Promise<Collection<User>>;
