import type { Collection } from 'mongodb';
import type { Course } from '@qlicker/shared';
export declare function getCourses(): Collection<Course>;
export declare function initCourses(): Promise<Collection<Course>>;
