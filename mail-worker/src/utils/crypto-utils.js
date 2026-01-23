const encoder = new TextEncoder();
const decoder = new TextDecoder();

// 对称加密工具
const symmetricCryptoUtils = {
	
	// 生成随机密钥（32字节，64个十六进制字符）
	async generateKey() {
		const keyBytes = new Uint8Array(32);
		crypto.getRandomValues(keyBytes);
		return Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
	},
	
	// 从十六进制字符串导入密钥
	async importKey(hexKey) {
		if (!hexKey || hexKey.length !== 64) {
			throw new Error('密钥必须是64个字符的十六进制字符串（32字节）');
		}
		
		// 将十六进制字符串转换为字节数组
		const keyBytes = new Uint8Array(32);
		for (let i = 0; i < 32; i++) {
			keyBytes[i] = parseInt(hexKey.substr(i * 2, 2), 16);
		}
		
		// 导入为AES-GCM密钥
		return await crypto.subtle.importKey(
			'raw',
			keyBytes,
			{ name: 'AES-GCM' },
			false,
			['encrypt', 'decrypt']
		);
	},
	
	// 使用对称密钥加密
	async encryptWithKey(plaintext, hexKey) {
		try {
			const key = await this.importKey(hexKey);
			
			// 生成随机IV（12字节）
			const iv = crypto.getRandomValues(new Uint8Array(12));
			
			// 加密数据
			const encrypted = await crypto.subtle.encrypt(
				{
					name: 'AES-GCM',
					iv: iv
				},
				key,
				encoder.encode(plaintext)
			);
			
			// 将IV和加密数据组合并转换为base64
			const combined = new Uint8Array(iv.length + encrypted.byteLength);
			combined.set(iv);
			combined.set(new Uint8Array(encrypted), iv.length);
			
			// 转换为base64字符串
			return btoa(String.fromCharCode(...combined));
		} catch (e) {
			// 直接抛出原始错误
			throw e;
		}
	},
	
	// 使用对称密钥解密
	async decryptWithKey(ciphertextBase64, hexKey) {
		try {
			const key = await this.importKey(hexKey);
			
			// 从base64解码
			const combined = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
			
			// 提取IV（前12字节）和加密数据
			const iv = combined.slice(0, 12);
			const encrypted = combined.slice(12);
			
			// 解密数据
			const decrypted = await crypto.subtle.decrypt(
				{
					name: 'AES-GCM',
					iv: iv
				},
				key,
				encrypted
			);
			
			return decoder.decode(decrypted);
		} catch (e) {
			// 直接抛出原始错误，避免重复包装
			throw e;
		}
	}
};



const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},

	async hashPassword(password) {
		const salt = this.generateSalt();
		const hash = await this.genHashPassword(password, salt);
		return { salt, hash };
	},

	async genHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return btoa(String.fromCharCode(...hashArray));
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		const hash = await this.genHashPassword(inputPassword, salt);
		return hash === storedHash;
	},

	genRandomPwd(length = 8) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
	},

	/**
	 * 从十六进制字符串转换为 Uint8Array
	 */
	hexToUint8Array(hexString) {
		const bytes = [];
		for (let i = 0; i < hexString.length; i += 2) {
			bytes.push(parseInt(hexString.substr(i, 2), 16));
		}
		return new Uint8Array(bytes);
	},

	/**
	 * 从 Uint8Array 转换为十六进制字符串
	 */
	uint8ArrayToHex(arr) {
		return Array.from(arr)
			.map(x => x.toString(16).padStart(2, '0'))
			.join('');
	},

	/**
	 * 使用对称密钥加密消息
	 */
	async encryptWithKey(message, keyHex) {
		try {
			// 使用对称加密
			return await symmetricCryptoUtils.encryptWithKey(message, keyHex);
		} catch (e) {
			// 如果是密钥格式错误，提供更友好的错误信息
			if (e.message.includes('密钥必须是64个字符')) {
				throw new Error('加密失败：密钥格式不正确，必须是64个字符的十六进制字符串');
			}
			throw e;
		}
	},
	
	/**
	 * 使用对称密钥解密消息
	 */
	async decryptWithKey(ciphertextBase64, keyHex) {
		try {
			// 使用对称解密
			return await symmetricCryptoUtils.decryptWithKey(ciphertextBase64, keyHex);
		} catch (e) {
			// 如果是Web Crypto API的错误，提供更友好的错误信息
			if (e.name === 'OperationError' || e.message.includes('operation failed')) {
				throw new Error('解密失败：密钥不正确或数据已损坏');
			}
			throw e;
		}
	},
	
	/**
	 * 生成新的对称密钥
	 */
	async generateSymmetricKey() {
		return await symmetricCryptoUtils.generateKey();
	},

	/**
	 * 生成对称密钥（同步版本）
	 */
	generateSymmetricKeySync() {
		const keyBytes = new Uint8Array(32);
		crypto.getRandomValues(keyBytes);
		return Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
	},

	/**
	 * 验证对称密钥格式
	 * @param {string} key - 64字符十六进制密钥
	 * @returns {boolean} 是否有效
	 */
	validateSymmetricKey(key) {
		if (!key || typeof key !== 'string') return false;
		if (key.length !== 64) return false;
		
		// 验证是否为有效的十六进制字符串
		const hexRegex = /^[0-9a-fA-F]{64}$/;
		return hexRegex.test(key);
	}
};

export default saltHashUtils;
