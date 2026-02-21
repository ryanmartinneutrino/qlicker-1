import type { Collection } from 'mongodb';
import type { Image } from '@qlicker/shared';
export declare function getImages(): Collection<Image>;
export declare function initImages(): Promise<Collection<Image>>;
