import orm from '../entity/orm';
import email from '../entity/email';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import { Resend } from 'resend';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n'
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";
import { att } from '../entity/att';
import telegramService from './telegram-service';
import {sleep} from "../utils/time-utils";
import cryptoUtils from '../utils/crypto-utils';
import fileUtils from '../utils/file-utils';
import constant from '../const/constant';

const emailService = {

	async list(c, params, userId) {

		let { emailId, type, accountId, size, timeSort, allReceive } = params;

		size = Number(size);
		emailId = Number(emailId);
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		allReceive = Number(allReceive);

		if (size > 50) {
			size = 50;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		if (isNaN(allReceive)) {
			if (accountId === 0) {
				// 全部邮件虚拟账户
				allReceive = 1;
			} else {
				let accountRow = await accountService.selectById(c, accountId);
				allReceive = accountRow.allReceive;
			}
		}

		const query = orm(c)
			.select({
				...email,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			).leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.userId, userId),
					timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId),
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL)
				)
			);

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();

		const totalQuery = orm(c).select({ total: count() }).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.userId, userId),
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL)
				)
		).get();

		const latestEmailQuery = orm(c).select().from(email).where(
			and(
				allReceive ? eq(1,1) : eq(email.accountId, accountId),
				eq(email.userId, userId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		list = list.map(item => ({
			...item,
			isStar: item.starId != null ? 1 : 0
		}));


		await this.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow.total, latestEmail };
	},

	async delete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		await orm(c).update(email).set({ isDel: isDel.DELETE }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain)
		return orm(c).insert(email).values({ ...params }).returning().get();
	},

	//邮件发送
	async send(c, params, userId) {

		let {
			accountId, //发送账号id
			name, //发件人名字
			sendType, //发件类型
			emailId, //邮件id，如果是回复邮件会带
			receiveEmail, //收件人邮箱
			text, //邮件纯文本
			content, //邮件内容
			subject, //邮件标题
			attachments, //附件
			manyType //分开发送类型
		} = params;

		const { resendTokens, r2Domain, send, domainList } = await settingService.query(c);

		let { imageDataList, html } = await attService.toImageUrlHtml(c, content);

		//判断是否关闭发件功能
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		//判断接收方是不是全部为站内邮箱
		const allInternal = receiveEmail.every(email => {
			const domain = '@' + emailUtils.getDomain(email);
			return domainList.includes(domain);
		});

		if (c.env.admin !== userRow.email) {

			//发件被禁用
			if (roleRow.sendType === 'ban') {
				throw new BizError(t('bannedSend'), 403);
			}

			//发件被禁用
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		//如果不是管理员，权限设置了发送次数
		if (c.env.admin !== userRow.email && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + receiveEmail.length > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}

		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		if (c.env.admin !== userRow.email) {
			//用户没有这个域名的使用权限
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		
		// 检查哪些收件人在系统中（内部账户）
		const recipientAccounts = await orm(c).select().from(account)
			.where(and(
				inArray(account.email, receiveEmail),
				eq(account.isDel, isDel.NORMAL)
			)).all();
		
		const internalRecipients = new Set(recipientAccounts.map(acc => acc.email));
		const externalRecipients = receiveEmail.filter(email => !internalRecipients.has(email));
		
		
		// 获取联邦邮局列表
		let siteList = await settingService.getSiteList(c);
		
		// 确保 siteList 是数组
		if (!Array.isArray(siteList)) {
			console.warn('siteList 不是数组，使用空数组:', siteList);
			siteList = [];
		}
		
		// 分离联邦邮局收件人和普通外部收件人
		const federationRecipients = [];
		const normalExternalRecipients = [];
		
		externalRecipients.forEach(email => {
			const recipientDomain = emailUtils.getDomain(email);
			const federationSite = siteList.find(site => site.domain === recipientDomain);
			
			if (federationSite) {
				// 联邦邮局收件人
				console.log(`识别为联邦邮局收件人: ${email}, 站点:`, federationSite);
				federationRecipients.push(email);
			} else {
				// 普通外部邮箱
				console.log(`识别为普通外部收件人: ${email}`);
				normalExternalRecipients.push(email);
			}
		});
		
		console.log(`联邦邮局收件人列表:`, federationRecipients);
		console.log(`普通外部收件人列表:`, normalExternalRecipients);
		
		// 只有存在普通外部收件人时才需要 Resend Token
		let resendToken = resendTokens[domain];
		if (normalExternalRecipients.length > 0 && !resendToken) {
			throw new BizError(t('noResendToken'));
		}

		//没有发件人名字自动截取
		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		//如果是回复邮件
		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		let resendResult = {};

		//存在站外时邮箱全部由resend发送
		if (!allInternal) {

			// 重新组织联邦邮局收件人数据结构（按域名分组）
			const federationRecipientsByDomain = {};
			federationRecipients.forEach(email => {
				const recipientDomain = emailUtils.getDomain(email);
				const federationSite = siteList.find(site => site.domain === recipientDomain);
				
				if (federationSite) {
					if (!federationRecipientsByDomain[recipientDomain]) {
						federationRecipientsByDomain[recipientDomain] = {
							key: federationSite.key,
							api: federationSite.api || recipientDomain, // 使用配置的api域名，如果没有则使用邮箱域名
							recipients: []
						};
					}
					federationRecipientsByDomain[recipientDomain].recipients.push(email);
				}
			});

			// 发送到联邦邮局的邮件
			for (const [domain, siteInfo] of Object.entries(federationRecipientsByDomain)) {
				try {
					await this.sendToFederation(c, {
						recipients: siteInfo.recipients,
						siteKey: siteInfo.key,
						domain: domain,
						apiDomain: siteInfo.api,
						sendEmail: accountRow.email,
						name: name,
						subject: subject,
						text: text,
						html: html,
						attachments: attachments,
						imageDataList: imageDataList
					});
				} catch (e) {
					console.error(`发送到联邦邮局 ${domain} 失败:`, e);
					// 继续发送其他收件人的邮件
				}
			}

			// 只有存在普通外部收件人才需要调用 Resend API
			if (normalExternalRecipients.length > 0) {
				const resend = new Resend(resendToken);
				
				//如果是分开发送
				if (manyType === 'divide') {

					let sendFormList = [];

					normalExternalRecipients.forEach(email => {
						const sendForm = {
							from: `${name} <${accountRow.email}>`,
							to: [email],
							subject: subject,
							text: text,
							html: html
						};

						if (sendType === 'reply') {
							sendForm.headers = {
								'in-reply-to': emailRow.messageId,
								'references': emailRow.messageId
							};
						}

						sendFormList.push(sendForm);
					});

					resendResult = await resend.batch.send(sendFormList);

				} else {

					const sendForm = {
						from: `${name} <${accountRow.email}>`,
						to: [...normalExternalRecipients],
						subject: subject,
						text: text,
						html: html,
						attachments: [...imageDataList, ...attachments]
					};

					if (sendType === 'reply') {
						sendForm.headers = {
							'in-reply-to': emailRow.messageId,
							'references': emailRow.messageId
						};
					}

					resendResult = await resend.emails.send(sendForm);

				}
			} else if (federationRecipients.length > 0) {
				// 如果只有联邦邮局收件人，无需 Resend
				resendResult = {
					data: {
						id: `federation-${Date.now()}`
					},
					error: null
				};
					
				if (manyType === 'divide') {
					resendResult.data.data = federationRecipients.map(() => ({ id: `federation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` }));
				}
			} else {
				// 如果只有内部收件人，生成虚拟的 messageId
				resendResult = {
					data: {
						id: `internal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
					},
					error: null
				};
			}
		}


		const { data, error } = resendResult;


		if (error) {
			throw new BizError(error.message);
		}

		imageDataList = imageDataList.map(item => ({...item, contentId: `<${item.contentId}>`}))

		//把图片标签cid标签切换会通用url
		html = this.imgReplace(html, imageDataList, r2Domain);

		//封装数据保存到数据库
		const emailData = {};
		emailData.sendEmail = accountRow.email;
		emailData.name = name;
		emailData.subject = subject;
		emailData.content = html;
		emailData.text = text;
		emailData.accountId = accountId;
		emailData.status = emailConst.status.SENT;
		emailData.type = emailConst.type.SEND;
		emailData.userId = userId;
		emailData.resendEmailId = data?.id;

		const recipient = [];

		receiveEmail.forEach(item => {
			recipient.push({ address: item, name: '' });
		});

		emailData.recipient = JSON.stringify(recipient);

		if (sendType === 'reply') {
			emailData.inReplyTo = emailRow.messageId;
			emailData.relation = emailRow.messageId;
		}

		//如果权限有发送次数增加用户发送次数
		if (roleRow.sendCount && roleRow.sendType !== 'internal') {
			await userService.incrUserSendCount(c, receiveEmail.length, userId);
		}

		//保存到数据库并返回结果
		const emailResult = await orm(c).insert(email).values(emailData).returning().get();

		//保存内嵌附件
		if (imageDataList.length > 0) {
			if (imageDataList.length > 10) {
				throw new BizError(t('imageAttLimit'));
			}
			await attService.saveArticleAtt(c, imageDataList, userId, accountId, emailResult.emailId);
		}

		//保存普通附件
		if (attachments?.length > 0) {
			if (attachments.length > 10) {
				throw new BizError(t('attLimit'));
			}
			await attService.saveSendAtt(c, attachments, userId, accountId, emailResult.emailId);
		}

		const attList = await attService.selectByEmailIds(c, [emailResult.emailId]);
		emailResult.attList = attList;

		//如果全是站内接收方，直接写入数据库
		if (allInternal) {
			await this.HandleOnSiteEmail(c, receiveEmail, emailResult, attList);
		}

		const dateStr = dayjs().format('YYYY-MM-DD');
		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		//记录每天发件次数统计
		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(receiveEmail.length), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + receiveEmail.length
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return [ emailResult ];
	},

	//处理站内邮件发送
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList) {

		const { noRecipient  } = await settingService.query(c);

		//查询所有收件人账号信息
		let accountList = await orm(c).select().from(account).where(inArray(account.email, receiveEmail)).all();

		//查询所有收件人权限身份
		const userIds = accountList.map(accountRow => accountRow.userId);
		let roleList = await roleService.selectByUserIds(c, userIds);

		//封装数据库准备保存到数据库
		const emailDataList = [];

		for (const email of receiveEmail) {

			//把发件人邮件改成收件
			const emailValues = {...sendEmailData}
			emailValues.status = emailConst.status.RECEIVE;
			emailValues.type = emailConst.type.RECEIVE;
			emailValues.toEmail = email;
			emailValues.toName = emailUtils.getName(email);
			emailValues.emailId = null;

			const accountRow = accountList.find(accountRow => accountRow.email === email);

			//如果收件人存在就把邮件信息改成收件人的
			if (accountRow) {

				//设置给收件人保存
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.RECEIVE;

				const roleRow = roleList.find(roleRow => roleRow.userId === accountRow.userId);

				let { banEmail, availDomain } = roleRow;

				//如果收件人没有这个域名的使用权限和有邮件拦截，就把邮件改为拒收状态
				if (email !== c.env.admin) {

					if (!roleService.hasAvailDomainPerm(availDomain, email)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is not authorized to use this domain.`;
					} else if(roleService.isBanEmail(banEmail, sendEmailData.sendEmail)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is disabled from receiving emails.`;
					}

				}

				emailDataList.push(emailValues);

			} else {

				//设置无收件人邮件信息
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.NOONE;

				//如果无人收件关闭改为拒收
				if (noRecipient === settingConst.noRecipient.CLOSE) {
					emailValues.status = emailConst.status.BOUNCED;
					emailValues.message = `Recipient not found: <${email}>`;
				}

				emailDataList.push(emailValues);

			}

		}

		//保存邮件
		const receiveEmailList = emailDataList.filter(emailRow => emailRow.status === emailConst.status.RECEIVE || emailRow.status === emailConst.status.NOONE);

		for (const emailData of receiveEmailList) {

			const emailRow = await orm(c).insert(email).values(emailData).returning().get();

			//设置附件保存
			for (const attRow of attList) {
				const attValues = {...attRow};
				attValues.emailId = emailRow.emailId;
				attValues.accountId = emailRow.accountId;
				attValues.userId = emailRow.userId;
				attValues.attId = null;
				await orm(c).insert(att).values(attValues).run();
			}

		}

		const bouncedEmail = emailDataList.find(emailRow => emailRow.status === emailConst.status.BOUNCED);


		let status = emailConst.status.DELIVERED;
		let message = ''
		//如果有拒收邮件，就把发件人的邮件改成拒收
		if (bouncedEmail) {
			const messageJson = { message: bouncedEmail.message };
			message = JSON.stringify(messageJson);
			status = emailConst.status.BOUNCED;
		}

		await orm(c).update(email).set({ status, message: message }).where(eq(email.emailId, sendEmailData.emailId)).run();

	},

	async sendToFederation(c, params) {
		const { recipients, siteKey, domain, apiDomain, sendEmail, name, subject, text, html, attachments = [], imageDataList = [] } = params;

		if (!siteKey || !domain) {
			throw new Error('缺少联邦邮局密钥或域名');
		}

		// 使用API域名，如果没有提供则使用邮箱域名
		const targetDomain = apiDomain || domain;
		
		console.log(`[联邦邮局] 开始发送到 ${targetDomain} (邮箱域名: ${domain}), 收件人:`, recipients);
		console.log(`[联邦邮局] 发件人: ${sendEmail}, 主题: ${subject}`);

		// 准备附件元数据（不包含二进制内容）
		const attachmentMetadata = [];
		
		// 处理普通附件
		if (attachments && attachments.length > 0) {
			for (const att of attachments) {
				// 为没有 key 的附件生成 key
				let key = att.key;
				let size = att.size;
				
				if (!key && att.content) {
					// 如果还没有生成 key，从 content 生成
					const buff = fileUtils.base64ToUint8Array(att.content);
					key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(att.filename);
					// 计算实际大小
					if (!size) {
						size = buff.length;
					}
				} else if (!key && att.buff) {
					key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(att.buff) + fileUtils.getExtFileName(att.filename);
					if (!size) {
						size = att.buff.length;
					}
				}
				
				attachmentMetadata.push({
					filename: att.filename,
					mimeType: att.type,
					size: size,
					key: key,
					type: 'attachment'
				});
			}
		}
		
		// 处理内嵌图片附件
		if (imageDataList && imageDataList.length > 0) {
			for (const img of imageDataList) {
				attachmentMetadata.push({
					filename: img.filename,
					mimeType: img.mimeType,
					size: img.size,
					key: img.key,
					contentId: img.contentId,
					type: 'embedded'
				});
			}
		}

		// 为每个收件人准备邮件数据
		const emailPayloads = recipients.map(recipient => ({
			toEmail: recipient,
			sendEmail: sendEmail,
			name: name,
			subject: subject,
			text: text,
			content: html,
			attachments: attachmentMetadata,
			timestamp: Date.now()
		}));

		// 加密邮件数据（使用对称密钥）
		console.log(`联邦邮局发送: 加密前数据`, emailPayloads);
		const encryptedData = await cryptoUtils.encryptWithKey(
			JSON.stringify(emailPayloads),
			siteKey
		);
		console.log(`联邦邮局发送: 加密完成，数据长度: ${encryptedData.length}`);

		// 获取本站对称密钥（从数据库设置中获取）
		const setting = await settingService.query(c);
		const symmetricKey = setting.federationSymmetricKey;
		if (!symmetricKey) {
			throw new Error('请先在系统设置中设置本站对称密钥');
		}

		// 为每个收件人单独发送请求
		const senderDomain = emailUtils.getDomain(sendEmail);
		const errors = [];
		
		// 准备附件内容（仅用于发送到联邦邮局）
		const attachmentContents = {};
		if (attachments && attachments.length > 0) {
			for (const att of attachments) {
				// 保存 base64 内容供传输
				attachmentContents[att.filename] = att.content;
			}
		}

		for (const recipient of recipients) {
			try {
				// 构建请求体
				const requestBody = {
					encryptedData: encryptedData,
					senderDomain: senderDomain,
					toEmail: recipient,
					attachmentContents: attachmentContents
				};

				console.log(`联邦邮局发送: 发送请求到 ${targetDomain}，收件人: ${recipient}`, requestBody);
				
				// 发送到联邦邮局
				const federationUrl = `https://${targetDomain}/api/federation/receive`;
				
				let response;
				
				try {
					// 首先尝试直接发送请求
					console.log(`尝试直接发送请求到联邦邮局 ${targetDomain} (邮箱域名: ${domain})`);
					response = await fetch(federationUrl, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify(requestBody)
					});
					
					// 检查响应状态码
					if (!response.ok) {
						let errorText = '';
						try {
							errorText = await response.text();
						} catch (textError) {
							errorText = `无法读取错误响应体: ${textError.message}`;
						}
						console.error(`联邦邮局 ${targetDomain} (邮箱域名: ${domain}) 返回错误 ${response.status} (收件人: ${recipient}):`, errorText);
						errors.push(`收件人 ${recipient}: ${response.status} - ${errorText}`);
						continue; // 继续下一个收件人
					}
					
					// 检查响应内容
					let result;
					try {
						result = await response.json();
					} catch (jsonError) {
						console.error(`联邦邮局 ${targetDomain} (邮箱域名: ${domain}) 响应JSON解析失败:`, jsonError);
						errors.push(`收件人 ${recipient}: 响应解析失败 - ${jsonError.message}`);
						continue;
					}
					
					if (result.code !== 200) {
						console.error(`联邦邮局 ${targetDomain} (邮箱域名: ${domain}) 返回错误代码:`, result);
						errors.push(`收件人 ${recipient}: ${result.msg || result.message || '未知错误'}`);
					} else {
						console.log(`联邦邮件发送成功 (直接) 到 ${recipient}`);
					}
					
				} catch (directError) {
					// 直接请求失败
					console.error(`直接请求失败 (收件人: ${recipient}):`, directError);
					errors.push(`收件人 ${recipient}: 请求失败 - ${directError.message}`);
				}
			} catch (e) {
				console.error(`发送到联邦邮局 ${targetDomain} (邮箱域名: ${domain}) (收件人: ${recipient}) 失败:`, e);
				errors.push(`收件人 ${recipient}: 处理失败 - ${e.message}`);
			}
		}
		
		if (errors.length > 0) {
			throw new Error(`发送到联邦邮局 ${targetDomain} (邮箱域名: ${domain}) 部分失败: ${errors.join('; ')}`);
		}

		console.log(`成功发送 ${recipients.length} 封邮件到联邦邮局 ${targetDomain} (邮箱域名: ${domain})`);
	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	selectById(c, emailId) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	async latest(c, params, userId) {
		let { emailId, accountId, allReceive } = params;
		allReceive = Number(allReceive);

		if (isNaN(allReceive)) {
			if (accountId === 0) {
				// 全部邮件虚拟账户
				allReceive = 1;
			} else {
				let accountRow = await accountService.selectById(c, accountId);
				allReceive = accountRow.allReceive;
			}
		}

		let list = await orm(c).select({...email}).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.type, emailConst.type.RECEIVE)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);

		return list;
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	updateEmailStatus(c, params) {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort } = params;

		size = Number(size);

		emailId = Number(emailId);
		timeSort = Number(timeSort);

		if (size > 50) {
			size = 50;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		const conditions = [];

		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		}

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		if (userEmail) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${'%'+ userEmail + '%'}`);
		}

		if (accountEmail) {
			conditions.push(
				or(
					sql`${email.toEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
				)
			)
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${'%'+ name + '%'}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${'%'+ subject + '%'}`);
		}

		conditions.push(ne(email.status, emailConst.status.SAVING));

		const countConditions = [...conditions];

		if (timeSort) {
			conditions.unshift(gt(email.emailId, emailId));
		} else {
			conditions.unshift(lt(email.emailId, emailId));
		}

		const query = orm(c).select({ ...email, userEmail: user.email })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...conditions));

		const queryCount = orm(c).select({ total: count() })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...countConditions));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = await query.limit(size).all();
		const totalQuery = await queryCount.get();
		const latestEmailQuery = await orm(c).select().from(email)
			.where(and(
				eq(email.type, emailConst.type.RECEIVE),
				ne(email.status, emailConst.status.SAVING)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		await this.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			}
		}

		return { list: list, total: totalRow.total, latestEmail };
	},

	async allEmailLatest(c, params) {

		const { emailId } = params;

		let list = await orm(c).select({...email, userEmail: user.email}).from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.type, emailConst.type.RECEIVE),
					ne(email.status, emailConst.status.SAVING)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);

		return list;
	},

	async emailAddAtt(c, list) {

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attList.filter(attRow => attRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
		}
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
	},

	async completeReceive(c, status, emailId) {
		return await orm(c).update(email).set({
			isDel: isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	async completeReceiveAll(c) {
		await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.RECEIVE} WHERE status = ${emailConst.status.SAVING} AND EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
		await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.NOONE} WHERE status = ${emailConst.status.SAVING} AND NOT EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		let right = type === 'left' || type === 'include'
		let left = type === 'include'

		const conditions = []

		if (sendName) {
			conditions.push(like(email.name,`${left ? '%' : ''}${sendName}${right ? '%' : ''}`))
		}

		if (subject) {
			conditions.push(like(email.subject,`${left ? '%' : ''}${subject}${right ? '%' : ''}`))
		}

		if (sendEmail) {
			conditions.push(like(email.sendEmail,`${left ? '%' : ''}${sendEmail}${right ? '%' : ''}`))
		}

		if (toEmail) {
			conditions.push(like(email.toEmail,`${left ? '%' : ''}${toEmail}${right ? '%' : ''}`))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		await attService.removeByEmailIds(c, emailIds);

		await orm(c).delete(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).run();
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params, userId) {
		const { emailIds } = params;
		await orm(c).update(email).set({ unread: emailConst.unread.READ }).where(and(eq(email.userId, userId), inArray(email.emailId, emailIds)));
	}
};

export default emailService;
