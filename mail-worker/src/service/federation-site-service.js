import orm from '../entity/orm';
import { federationSite } from '../entity/federation-site';
import { eq, and, desc, asc, like, isNull } from 'drizzle-orm';
import { isDel } from '../const/entity-const';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import cryptoUtils from '../utils/crypto-utils';

const federationSiteService = {

	// 生成对称密钥
	async generateSymmetricKey() {
		return cryptoUtils.generateSymmetricKeySync();
	},

	// 验证对称密钥格式
	validateSymmetricKey(key) {
		return cryptoUtils.validateSymmetricKey(key);
	},

	// 添加联邦邮局站点
	async add(c, params) {
		const { domain, name = '', symmetricKey, apiDomain = '', status = 1, sort = 0 } = params;

		// 验证参数
		if (!domain) {
			throw new BizError(t('federationDomainRequired'));
		}

		if (!symmetricKey) {
			throw new BizError(t('federationKeyRequired'));
		}

		// 验证密钥格式
		if (!this.validateSymmetricKey(symmetricKey)) {
			throw new BizError(t('federationKeyInvalid'));
		}

		// 检查域名是否已存在
		const existingSite = await orm(c).select()
			.from(federationSite)
			.where(and(
				eq(federationSite.domain, domain),
				eq(federationSite.isDel, isDel.NORMAL)
			))
			.get();

		if (existingSite) {
			throw new BizError(t('federationDomainExists'));
		}

		// 插入新站点
		const now = Math.floor(Date.now() / 1000);
		const newSite = {
			domain,
			name,
			symmetricKey,
			apiDomain: apiDomain || null,
			status,
			sort,
			createdAt: now,
			updatedAt: now,
			isDel: isDel.NORMAL
		};

		const result = await orm(c).insert(federationSite).values(newSite).run();
		return { id: result.lastInsertRowid, ...newSite };
	},

	// 更新联邦邮局站点
	async update(c, params) {
		const { id, domain, name, symmetricKey, apiDomain, status, sort } = params;

		if (!id) {
			throw new BizError(t('federationIdRequired'));
		}

		// 检查站点是否存在
		const existingSite = await orm(c).select()
			.from(federationSite)
			.where(and(
				eq(federationSite.id, id),
				eq(federationSite.isDel, isDel.NORMAL)
			))
			.get();

		if (!existingSite) {
			throw new BizError(t('federationNotFound'));
		}

		// 构建更新数据
		const updateData = { updatedAt: Math.floor(Date.now() / 1000) };

		if (domain !== undefined) {
			// 如果更新域名，检查是否与其他站点冲突
			if (domain !== existingSite.domain) {
				const conflictSite = await orm(c).select()
					.from(federationSite)
					.where(and(
						eq(federationSite.domain, domain),
						eq(federationSite.isDel, isDel.NORMAL),
						eq(federationSite.id, id)
					))
					.get();

				if (conflictSite) {
					throw new BizError(t('federationDomainExists'));
				}
			}
			updateData.domain = domain;
		}

		if (name !== undefined) updateData.name = name;
		if (symmetricKey !== undefined) {
			// 验证密钥格式
			if (!this.validateSymmetricKey(symmetricKey)) {
				throw new BizError(t('federationKeyInvalid'));
			}
			updateData.symmetricKey = symmetricKey;
		}
		if (apiDomain !== undefined) updateData.apiDomain = apiDomain || null;
		if (status !== undefined) updateData.status = status;
		if (sort !== undefined) updateData.sort = sort;

		// 执行更新
		await orm(c).update(federationSite)
			.set(updateData)
			.where(and(
				eq(federationSite.id, id),
				eq(federationSite.isDel, isDel.NORMAL)
			))
			.run();

		return { id, ...updateData };
	},

	// 删除联邦邮局站点（软删除）
	async delete(c, id) {
		if (!id) {
			throw new BizError(t('federationIdRequired'));
		}

		const result = await orm(c).update(federationSite)
			.set({
				isDel: isDel.DELETE,
				updatedAt: Math.floor(Date.now() / 1000)
			})
			.where(and(
				eq(federationSite.id, id),
				eq(federationSite.isDel, isDel.NORMAL)
			))
			.run();

		if (result.rowsAffected === 0) {
			throw new BizError(t('federationNotFound'));
		}

		return { success: true };
	},

	// 获取联邦邮局站点列表
	async list(c, params = {}) {
		const { page = 1, size = 20, status, keyword } = params;
		const offset = (page - 1) * size;

		// 构建查询条件
		const conditions = [eq(federationSite.isDel, isDel.NORMAL)];

		if (status !== undefined) {
			conditions.push(eq(federationSite.status, status));
		}

		if (keyword) {
			conditions.push(
				like(federationSite.domain, `%${keyword}%`)
			);
		}

		// 查询数据
		const sites = await orm(c).select()
			.from(federationSite)
			.where(and(...conditions))
			.orderBy(asc(federationSite.sort), desc(federationSite.createdAt))
			.limit(size)
			.offset(offset)
			.all();

		// 查询总数
		const totalResult = await orm(c).select({ count: federationSite.id })
			.from(federationSite)
			.where(and(...conditions))
			.all();

		const total = totalResult.length;

		return {
			list: sites,
			total,
			page,
			size,
			totalPages: Math.ceil(total / size)
		};
	},

	// 获取单个联邦邮局站点详情
	async get(c, id) {
		if (!id) {
			throw new BizError(t('federationIdRequired'));
		}

		const site = await orm(c).select()
			.from(federationSite)
			.where(and(
				eq(federationSite.id, id),
				eq(federationSite.isDel, isDel.NORMAL)
			))
			.get();

		if (!site) {
			throw new BizError(t('federationNotFound'));
		}

		return site;
	},

	// 获取所有启用的联邦邮局站点（用于邮件发送）
	async getActiveSites(c) {
		const sites = await orm(c).select({
			domain: federationSite.domain,
			symmetricKey: federationSite.symmetricKey,
			apiDomain: federationSite.apiDomain
		})
			.from(federationSite)
			.where(and(
				eq(federationSite.status, 1),
				eq(federationSite.isDel, isDel.NORMAL)
			))
			.orderBy(asc(federationSite.sort))
			.all();

		return sites.map(site => ({
			domain: site.domain,
			key: site.symmetricKey,
			api: site.apiDomain || site.domain
		}));
	},

	// 根据域名获取站点信息
	async getSiteByDomain(c, domain) {
		const site = await orm(c).select()
			.from(federationSite)
			.where(and(
				eq(federationSite.domain, domain),
				eq(federationSite.status, 1),
				eq(federationSite.isDel, isDel.NORMAL)
			))
			.get();

		return site;
	}
};

export default federationSiteService;