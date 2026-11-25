import { SaveDb } from "./schema";

// One shared connection per JS context (main thread and the sim worker each get one).
export const db = new SaveDb();
export * from "./schema";
