import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, client } from './index.js';

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Database migrations applied successfully.');
} finally {
  await client.end();
}
