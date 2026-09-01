/**
 * Drizzle schema — an ordinary drizzle-orm SQLite schema.
 *
 * A SolidActions workspace database is libSQL/SQLite, so nothing here is
 * SolidActions-specific: this is the same file you would write for any Turso or
 * local SQLite project. `drizzle-kit generate` reads it to produce migration
 * SQL under ./drizzle.
 */
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  customer: text('customer').notNull(),
  totalCents: integer('total_cents').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
