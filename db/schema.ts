import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const jobs = sqliteTable('jobs', {
 id: text('id').primaryKey(), owner: text('owner').notNull(),
 createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
 completedAt: integer('completed_at'), status: text('status').notNull(),
 prompt: text('prompt').notNull(), model: text('model').notNull(),
 imageSize: text('image_size').notNull(), aspectRatio: text('aspect_ratio').notNull(),
 parentId: text('parent_id'), refKey: text('ref_key'), refMime: text('ref_mime'),
 imageKey: text('image_key'), imageMime: text('image_mime'),
 width: integer('width'), height: integer('height'), bytes: integer('bytes').notNull().default(0),
 requestId: text('request_id'), errorCode: text('error_code'), errorMessage: text('error_message')
}, t => [index('jobs_owner_created').on(t.owner,t.createdAt),
 index('jobs_expiry').on(t.expiresAt),
 index('jobs_owner_status').on(t.owner,t.status)]);

export const assets = sqliteTable('assets', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),createdAt:integer('created_at').notNull(),
 mime:text('mime').notNull(),width:integer('width').notNull(),height:integer('height').notNull(),
 sha256:text('sha256').notNull().default(''),metadata:text('metadata').notNull().default('{}'),
 legacyTaskId:text('legacy_task_id'),thumbBytes:integer('thumb_bytes').notNull().default(0)
},t=>[index('assets_owner').on(t.owner),index('assets_legacy').on(t.legacyTaskId)]);
export const workspaces = sqliteTable('workspaces',{
 owner:text('owner').primaryKey(),revision:integer('revision').notNull().default(0),
 state:text('state').notNull(),googleClientId:text('google_client_id').notNull().default('')
});
