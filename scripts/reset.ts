/**
 * Deletes the local database so the app starts again from the setup screen.
 *
 *   npm run reset
 */

import fs from "node:fs";
import path from "node:path";

const dbPath = path.resolve(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "family.db"));

let removed = 0;
for (const suffix of ["", "-wal", "-shm"]) {
  const file = `${dbPath}${suffix}`;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    removed += 1;
  }
}

console.log(removed > 0 ? `Removed ${dbPath} (${removed} file(s)).` : `Nothing to remove at ${dbPath}.`);
