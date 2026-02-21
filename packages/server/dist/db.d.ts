import { MongoClient, Db } from 'mongodb';
export declare function connectDB(mongoUrl: string): Promise<Db>;
export declare function getDB(): Db;
export declare function getClient(): MongoClient;
