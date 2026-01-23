import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import federationSiteService from './federation-site-service';

const settingService = {

	async refresh(c) {
		const settingRow = await orm(c).select().from(setting).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
		c.set('setting', settingRow);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
	},

	async query(c) {

		if (c.get?.('setting')) {
			return c.get('setting')
		}

		const setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });

		if (!setting) {
			throw new BizError('数据库未初始化 Database not initialized.');
		}

		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList)
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map(item => '@' + item);
		setting.domainList = domainList;


		let linuxdoSwitch = c.env.linuxdo_switch;

		if (typeof linuxdoSwitch === 'string' && linuxdoSwitch === 'true') {
			linuxdoSwitch = true
		} else if (linuxdoSwitch === true) {
			linuxdoSwitch = true
		} else {
			linuxdoSwitch = false
		}

		setting.linuxdoClientId = c.env.linuxdo_client_id;
		setting.linuxdoCallbackUrl = c.env.linuxdo_callback_url;
		setting.linuxdoSwitch = linuxdoSwitch;

		setting.emailPrefixFilter = setting.emailPrefixFilter.split(",").filter(Boolean);

		c.set?.('setting', setting);
		return setting;
	},

	async get(c, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.hasR2 = !!c.env.r2

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, params) {
		const settingData = await this.query(c);
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		params.resendTokens = JSON.stringify(resendTokens);
		await orm(c).update(setting).set({ ...params }).returning().get();
		await this.refresh(c);
	},

	async deleteBackground(c) {

		const { background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		let { background } = params

		await this.deleteBackground(c);

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);


			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="${file.name}"`
			});

		}

		await orm(c).update(setting).set({ background }).run();
		await this.refresh(c);
		return background;
	},

	async websiteConfig(c) {

		const settingRow = await this.get(c, true);

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			federationSymmetricKey: settingRow.federationSymmetricKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			domainList: settingRow.domainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoCallbackUrl: settingRow.linuxdoCallbackUrl,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			minEmailPrefix: settingRow.minEmailPrefix
		};
	},

	async getSiteList(c) {
		// 从数据库获取联邦邮局站点列表
		try {
			const sites = await federationSiteService.getActiveSites(c);
			// 确保返回的是数组
			if (Array.isArray(sites)) {
				console.log(`从数据库获取到 ${sites.length} 个联邦邮局站点`);
				return sites;
			} else {
				console.warn('getActiveSites 返回的不是数组:', sites);
				return [];
			}
		} catch (e) {
			console.error('获取联邦邮局站点列表失败，检查数据库表是否存在:', e.message);
			
			// 尝试直接查询数据库表
			try {
				const result = await c.env.db.prepare(`
					SELECT domain, symmetric_key as symmetricKey, api_domain as apiDomain 
					FROM federation_site 
					WHERE status = 1 AND is_del = 0 
					ORDER BY sort ASC
				`).all();
				
				if (result && result.results) {
					const sites = result.results.map(site => ({
						domain: site.domain,
						key: site.symmetricKey,
						api: site.apiDomain || site.domain
					}));
					console.log(`直接查询获取到 ${sites.length} 个联邦邮局站点`);
					return sites;
				}
			} catch (dbError) {
				console.error('直接查询数据库失败:', dbError.message);
			}
			
			// 如果数据库表不存在，回退到环境变量（兼容旧版本）
			const siteList = c.env.site_list || [];
			
			// 如果 site_list 是 JSON 字符串，则解析它
			if (typeof siteList === 'string') {
				try {
					const parsed = JSON.parse(siteList);
					return Array.isArray(parsed) ? parsed : [];
				} catch (parseError) {
					console.error('解析 site_list 失败:', parseError);
					return [];
				}
			}
			
			return Array.isArray(siteList) ? siteList : [];
		}
	}
};

export default settingService;
