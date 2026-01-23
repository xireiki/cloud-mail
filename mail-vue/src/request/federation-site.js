import http from '@/axios/index.js'

// 获取联邦邮局站点列表
export function federationSiteList(params) {
    return http.get('/federation-site/list', { params })
}

// 获取单个联邦邮局站点详情
export function federationSiteGet(id) {
    return http.get('/federation-site/get', { params: { id } })
}

// 添加联邦邮局站点
export function federationSiteAdd(data) {
    return http.post('/federation-site/add', data)
}

// 更新联邦邮局站点
export function federationSiteUpdate(data) {
    return http.put('/federation-site/update', data)
}

// 删除联邦邮局站点
export function federationSiteDelete(id) {
    return http.delete('/federation-site/delete', { params: { id } })
}

// 生成对称密钥
export function federationSiteGenerateKey() {
    return http.get('/federation-site/generate-key')
}

// 验证对称密钥
export function federationSiteValidateKey(symmetricKey) {
    return http.post('/federation-site/validate-key', { symmetricKey })
}

export const federationSiteApi = {
    list: federationSiteList,
    get: federationSiteGet,
    add: federationSiteAdd,
    update: federationSiteUpdate,
    delete: federationSiteDelete,
    generateKey: federationSiteGenerateKey,
    validateKey: federationSiteValidateKey
}