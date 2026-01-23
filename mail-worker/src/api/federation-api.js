import app from '../hono/hono';
import result from '../model/result';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import cryptoUtils from '../utils/crypto-utils';
import userService from '../service/user-service';
import settingService from '../service/setting-service';
import { isDel, emailConst } from '../const/entity-const';
import orm from '../entity/orm';
import email from '../entity/email';
import account from '../entity/account';
import { eq, and } from 'drizzle-orm';

// 联邦邮件接收 API
// POST /federation/receive
// 用于接收来自其他同源码邮局的邮件
app.post('/federation/receive', async (c) => {
	try {
		const env = c.env;
		const payload = await c.req.json();
		
		console.log('[联邦邮局接收] 收到请求:', JSON.stringify(payload, null, 2));
		
		const { encryptedData, senderDomain, toEmail } = payload;
		
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
			const { subject, content, text, sendEmail, name, toEmail: itemToEmail } = emailItem;
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
