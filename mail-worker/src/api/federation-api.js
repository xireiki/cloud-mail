import app from '../hono/hono';
import result from '../model/result';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import cryptoUtils from '../utils/crypto-utils';
import userService from '../service/user-service';
import settingService from '../service/setting-service';
import { isDel, emailConst, attConst } from '../const/entity-const';
import orm from '../entity/orm';
import email from '../entity/email';
import account from '../entity/account';
import { att } from '../entity/att';
import r2Service from '../service/r2-service';
import fileUtils from '../utils/file-utils';
import constant from '../const/constant';
import { eq, and } from 'drizzle-orm';

// 联邦邮件接收 API
// POST /federation/receive
// 用于接收来自其他同源码邮局的邮件
app.post('/federation/receive', async (c) => {
	try {
		const env = c.env;
		const payload = await c.req.json();
		
		console.log('[联邦邮局接收] 收到请求:', JSON.stringify(payload, null, 2));
		
		const { encryptedData, senderDomain, toEmail, attachmentContents } = payload;
		
		if (!encryptedData || !senderDomain || !toEmail) {
			console.error('[联邦邮局接收] 缺少必要参数');
			return c.json(result.fail('缺少必要参数'));
		}

		// 检查收件人是否在本站
		const recipientAccount = await orm(c).select().from(account)
			.where(and(
				eq(account.email, toEmail),
				eq(account.isDel, isDel.NORMAL)
			)).get();

		if (!recipientAccount) {
			console.warn(`联邦邮件接收: 收件人 ${toEmail} 不存在，来自 ${senderDomain}`);
			return c.json(result.fail('收件人不存在'));
		}

		// 获取对称密钥进行解密
		const setting = await settingService.query(c);
		const symmetricKey = setting.federationSymmetricKey;
		if (!symmetricKey) {
			console.error('联邦邮件接收: 未设置本站对称密钥');
			return c.json(result.fail('请先在系统设置中设置本站对称密钥'));
		}

		// 解密邮件数据
		let emailData;
		try {
			const decrypted = await cryptoUtils.decryptWithKey(encryptedData, symmetricKey);
			if (!decrypted) {
				console.warn(`联邦邮件接收: 解密失败，来自 ${senderDomain}`);
				return c.json(result.fail('解密失败'));
			}
			emailData = JSON.parse(decrypted);
		} catch (e) {
			console.error(`联邦邮件接收: 解密或解析失败 - ${e.message}，来自 ${senderDomain}`);
			return c.json(result.fail('解密或解析失败'));
		}

		// 如果是批量邮件（数组），逐个处理
		const emailDataArray = Array.isArray(emailData) ? emailData : [emailData];
		
		console.log(`联邦邮件接收: 解析到 ${emailDataArray.length} 封邮件，来自 ${senderDomain}`);
		
		for (const emailItem of emailDataArray) {
			// 验证邮件数据结构
			const { subject, content, text, sendEmail, name, toEmail: itemToEmail, attachments: attachmentList = [] } = emailItem;
			const finalToEmail = itemToEmail || toEmail;
			
			console.log(`联邦邮件接收: 处理邮件 - 发件人: ${sendEmail}, 收件人: ${finalToEmail}, 主题: ${subject}`);
			
			if (!subject || !content || !sendEmail) {
				console.warn(`联邦邮件接收: 邮件数据不完整，来自 ${senderDomain}`, emailItem);
				continue;
			}

			// 创建接收邮件记录
			const receiveEmailData = {
				sendEmail: sendEmail,
				name: name || sendEmail,
				subject: subject,
				content: content,
				text: text || '',
				toEmail: finalToEmail,
				accountId: recipientAccount.accountId,
				type: emailConst.type.RECEIVE,
				userId: recipientAccount.userId,
				status: emailConst.status.RECEIVE,
				isDel: isDel.NORMAL,
				messageId: `federation-${senderDomain}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				recipient: JSON.stringify([{ address: finalToEmail, name: '' }]),
				resendEmailId: `federation-${senderDomain}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				createTime: new Date().toISOString()
			};

			console.log(`联邦邮件接收: 插入邮件数据`, receiveEmailData);
			
			try {
				const receivedEmail = await orm(c).insert(email).values(receiveEmailData).returning().get();
				console.log(`联邦邮件接收成功: 从 ${sendEmail}(${senderDomain}) 到 ${finalToEmail}, emailId=${receivedEmail.emailId}, accountId=${recipientAccount.accountId}, userId=${recipientAccount.userId}`);
				
				// 处理附件
				if (attachmentList && attachmentList.length > 0) {
					const attValues = [];
					for (const attItem of attachmentList) {
						// 如果有附件内容，保存到 R2
						let finalKey = attItem.key;
						if (attachmentContents && attachmentContents[attItem.filename]) {
							// 从发送方接收到的文件内容（base64 编码）
							const buff = fileUtils.base64ToUint8Array(attachmentContents[attItem.filename]);
							// 生成本地的 key
							finalKey = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(attItem.filename);
							
							// 上传到本地 R2
							try {
								await r2Service.putObj(c, finalKey, buff, {
									contentType: attItem.mimeType,
									contentDisposition: `attachment;filename=${attItem.filename}`
								});
								console.log(`联邦邮件接收: 已上传附件到 R2, e=${finalKey}`);
							} catch (r2Error) {
								console.error(`联邦邮件接收: 上传附件到 R2 失败 - ${r2Error.message}`);
								// 继续处理，即使 R2 上传失败
							}
						}
						
						const attData = {
							userId: recipientAccount.userId,
							accountId: recipientAccount.accountId,
							emailId: receivedEmail.emailId,
							filename: attItem.filename,
							size: attItem.size,
							mimeType: attItem.mimeType,
							key: finalKey,
							type: attItem.type === 'embedded' ? attConst.type.EMBED : attConst.type.ATT
						};
						
						// 如果是内嵌图片，添加 contentId
						if (attItem.contentId) {
							attData.contentId = attItem.contentId;
						}
						
						attValues.push(attData);
					}
					
					if (attValues.length > 0) {
						await orm(c).insert(att).values(attValues).run();
						console.log(`联邦邮件接收: 保存 ${attValues.length} 个附件, emailId=${receivedEmail.emailId}`);
					}
				}
				
			} catch (insertError) {
				console.error(`联邦邮件接收: 插入邮件失败 - ${insertError.message}`, insertError);
				throw insertError;
			}
		}

		return c.json(result.ok({ message: '邮件接收成功' }));
	} catch (e) {
		console.error('联邦邮件接收异常:', e);
		return c.json(result.fail('服务器错误'));
	}
});

export default app;
