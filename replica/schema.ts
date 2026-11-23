// The save-file schema now lives in the app: see src/db/schema.ts.
// It started as this file (replica-architect) and moved into the code at
// schema version 1. Every change since is a Dexie version with an upgrade().
export * from "../src/db/schema";
