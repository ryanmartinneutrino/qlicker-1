import type { Collection } from 'mongodb';
import type { Response } from '@qlicker/shared';
export declare function getResponses(): Collection<Response>;
export declare function initResponses(): Promise<Collection<Response>>;
