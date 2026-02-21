import type { Collection } from 'mongodb';
import type { Settings } from '@qlicker/shared';
export declare function getSettings(): Collection<Settings>;
export declare function initSettings(): Promise<Collection<Settings>>;
