import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { isDel } from '../const/entity-const';

export const federationSite = sqliteTable('federation_site', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	domain: text('domain').notNull(), // 联邦邮局域名
	name: text('name').default('').notNull(), // 站点名称（可选）
	symmetricKey: text('symmetric_key').notNull(), // 对称密钥（64字符十六进制）
	apiDomain: text('api_domain'), // API域名（可选，如果不提供则使用domain）
	status: integer('status').default(1).notNull(), // 状态：0-禁用，1-启用
	sort: integer('sort').default(0).notNull(), // 排序
	createdAt: integer('created_at').default(() => Math.floor(Date.now() / 1000)).notNull(),
	updatedAt: integer('updated_at').default(() => Math.floor(Date.now() / 1000)).notNull(),
	isDel: integer('is_del').default(isDel.NORMAL).notNull()
});

// 创建索引
export const federationSiteIndexes = [
	{ columns: [federationSite.domain], unique: true },
	{ columns: [federationSite.status] },
	{ columns: [federationSite.isDel] }
];