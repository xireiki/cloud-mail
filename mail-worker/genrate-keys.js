#!/usr/bin/env node

/**
 * 对称密钥生成工具
 * 生成64个字符的十六进制对称密钥（32字节）
 * 用于联邦邮局之间的加密通信
 */

// 生成随机对称密钥
function generateSymmetricKey() {
	const keyBytes = new Uint8Array(32);
	crypto.getRandomValues(keyBytes);
	return Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 验证密钥格式
function validateKey(key) {
	if (!key || typeof key !== 'string') {
		return false;
	}
	
	// 必须是64个字符的十六进制字符串
	if (key.length !== 64) {
		return false;
	}
	
	// 必须是有效的十六进制
	return /^[0-9a-fA-F]{64}$/.test(key);
}

// 主函数
async function main() {
	console.log('=== 对称密钥生成工具 ===\n');
	
	// 生成新密钥
	const symmetricKey = generateSymmetricKey();
	console.log('对称密钥 (symmetric_key):');
	console.log(symmetricKey);
	console.log('');
	
	// 验证密钥
	console.log('密钥验证:');
	console.log(`长度: ${symmetricKey.length} 字符`);
	console.log(`格式: ${validateKey(symmetricKey) ? '有效' : '无效'}`);
	console.log('');
	
	// 使用说明
	console.log('使用说明:');
	console.log('1. 将此密钥配置到 wrangler.toml 中的 symmetric_key 变量');
	console.log('2. 与其他联邦邮局共享此密钥（需要双向配置）');
	console.log('3. 每个联邦邮局需要配置对方的域名和相同的密钥');
	console.log('');
	
	console.log('配置示例 (wrangler.toml):');
	console.log('[vars]');
	console.log('symmetric_key = "' + symmetricKey + '"');
	console.log('site_list = [');
	console.log('  {domain = "other-site.com", key = "' + symmetricKey + '"}');
	console.log(']');
	console.log('');
	
	console.log('注意: 对称密钥需要在所有联邦邮局之间保持一致才能正常通信。');
}

// 运行主函数
main().catch(console.error);