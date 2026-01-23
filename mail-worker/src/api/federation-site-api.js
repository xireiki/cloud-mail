import app from '../hono/hono';
import result from '../model/result';
import federationSiteService from '../service/federation-site-service';

// 获取联邦邮局站点列表
app.get('/federation-site/list', async (c) => {
	try {
		const params = c.req.query();
		const data = await federationSiteService.list(c, {
			page: params.page ? parseInt(params.page) : 1,
			size: params.size ? parseInt(params.size) : 20,
			status: params.status ? parseInt(params.status) : undefined,
			keyword: params.keyword
		});
		return c.json(result.ok(data));
	} catch (e) {
		console.error('获取联邦邮局站点列表失败:', e);
		return c.json(result.fail(e.message));
	}
});

// 获取单个联邦邮局站点详情
app.get('/federation-site/get', async (c) => {
	try {
		const { id } = c.req.query();
		if (!id) {
			return c.json(result.fail('缺少站点ID'));
		}
		
		const data = await federationSiteService.get(c, parseInt(id));
		return c.json(result.ok(data));
	} catch (e) {
		console.error('获取联邦邮局站点详情失败:', e);
		return c.json(result.fail(e.message));
	}
});

// 添加联邦邮局站点
app.post('/federation-site/add', async (c) => {
	try {
		const params = await c.req.json();
		const data = await federationSiteService.add(c, params);
		return c.json(result.ok(data, '添加成功'));
	} catch (e) {
		console.error('添加联邦邮局站点失败:', e);
		return c.json(result.fail(e.message));
	}
});

// 更新联邦邮局站点
app.put('/federation-site/update', async (c) => {
	try {
		const params = await c.req.json();
		const data = await federationSiteService.update(c, params);
		return c.json(result.ok(data, '更新成功'));
	} catch (e) {
		console.error('更新联邦邮局站点失败:', e);
		return c.json(result.fail(e.message));
	}
});

// 删除联邦邮局站点
app.delete('/federation-site/delete', async (c) => {
	try {
		const { id } = c.req.query();
		if (!id) {
			return c.json(result.fail('缺少站点ID'));
		}
		
		const data = await federationSiteService.delete(c, parseInt(id));
		return c.json(result.ok(data, '删除成功'));
	} catch (e) {
		console.error('删除联邦邮局站点失败:', e);
		return c.json(result.fail(e.message));
	}
});

// 生成对称密钥
app.get('/federation-site/generate-key', async (c) => {
	try {
		const key = await federationSiteService.generateSymmetricKey();
		return c.json(result.ok({ symmetricKey: key }));
	} catch (e) {
		console.error('生成对称密钥失败:', e);
		return c.json(result.fail(e.message));
	}
});

// 验证对称密钥
app.post('/federation-site/validate-key', async (c) => {
	try {
		const { symmetricKey } = await c.req.json();
		if (!symmetricKey) {
			return c.json(result.fail('缺少对称密钥'));
		}
		
		const isValid = federationSiteService.validateSymmetricKey(symmetricKey);
		return c.json(result.ok({ isValid }));
	} catch (e) {
		console.error('验证对称密钥失败:', e);
		return c.json(result.fail(e.message));
	}
});

export default app;