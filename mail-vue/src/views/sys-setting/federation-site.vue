<template>
  <div class="federation-site-management">
    <div class="management-header">
      <h3>{{ $t('federationSiteManagement') }}</h3>
      <el-button type="primary" @click="handleAdd">
        <Icon icon="ion:add-outline" width="16" height="16" style="margin-right: 4px" />
        {{ $t('addFederationSite') }}
      </el-button>
    </div>

    <!-- 本站密钥显示 -->
    <div class="my-site-key-card">
      <div class="card-title">
        <Icon icon="material-symbols:key-outline" width="18" height="18" style="margin-right: 8px" />
        {{ $t('mySiteKey') }}
      </div>
      <div class="card-content">
        <div class="key-display-row">
          <div class="key-value">
            <span class="key-display">{{ mySiteKeyDisplay }}</span>
            <el-button
                type="text"
                size="small"
                @click="handleCopyMySiteKey"
                :title="$t('copyKey')"
                v-if="mySiteKey"
            >
              <Icon icon="fluent:copy-24-regular" width="16" height="16" />
            </el-button>
            <el-button
                type="text"
                size="small"
                @click="showEditMySiteKeyDialog"
                :title="$t('edit')"
            >
              <Icon icon="lsicon:edit-outline" width="14" height="14" />
            </el-button>
          </div>
        </div>
        <div class="key-tips">
          {{ $t('mySiteKeyTips') }}
        </div>
      </div>
    </div>

    <!-- 搜索和筛选 -->
    <div class="filter-bar">
      <el-input
          v-model="filter.keyword"
          :placeholder="$t('searchDomain')"
          class="search-input"
          clearable
          @clear="handleSearch"
          @keyup.enter="handleSearch"
      >
        <template #prefix>
          <Icon icon="ion:search" width="16" height="16" />
        </template>
      </el-input>
      
      <el-select
          v-model="filter.status"
          :placeholder="$t('selectStatus')"
          class="status-select"
          clearable
          @change="handleSearch"
      >
        <el-option :label="$t('enabled')" :value="1" />
        <el-option :label="$t('disabled')" :value="0" />
      </el-select>
      
      <el-button type="primary" @click="handleSearch">
        {{ $t('search') }}
      </el-button>
      
      <el-button @click="handleReset">
        {{ $t('reset') }}
      </el-button>
    </div>

    <!-- 数据表格 -->
    <el-table
        :data="siteList"
        v-loading="loading"
        class="site-table"
        :empty-text="$t('noData')"
    >
      <el-table-column prop="domain" :label="$t('domain')" min-width="150" />
      <el-table-column prop="name" :label="$t('siteName')" min-width="120" />
      <el-table-column :label="$t('symmetricKey')" min-width="200">
        <template #default="{ row }">
          <span class="key-display">{{ maskKey(row.symmetricKey) }}</span>
          <el-button
              type="text"
              size="small"
              @click="handleCopyKey(row.symmetricKey)"
              :title="$t('copyKey')"
          >
            <Icon icon="fluent:copy-24-regular" width="16" height="16" />
          </el-button>
        </template>
      </el-table-column>
      <el-table-column prop="apiDomain" :label="$t('apiDomain')" min-width="150">
        <template #default="{ row }">
          {{ row.apiDomain || row.domain }}
        </template>
      </el-table-column>
      <el-table-column :label="$t('status')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'">
            {{ row.status === 1 ? $t('enabled') : $t('disabled') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sort" :label="$t('sort')" width="80" />
      <el-table-column prop="createdAt" :label="$t('createdAt')" width="180">
        <template #default="{ row }">
          {{ formatDetailDate(row.createdAt * 1000) }}
        </template>
      </el-table-column>
      <el-table-column :label="$t('operations')" width="200" fixed="right">
        <template #default="{ row }">
          <el-button
              type="primary"
              size="small"
              @click="handleEdit(row)"
          >
            <Icon icon="lsicon:edit-outline" width="14" height="14" style="margin-right: 2px" />
            {{ $t('edit') }}
          </el-button>
          <el-button
              type="danger"
              size="small"
              @click="handleDelete(row)"
          >
            <Icon icon="material-symbols:delete-outline-rounded" width="14" height="14" style="margin-right: 2px" />
            {{ $t('delete') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-container">
      <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.size"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
      />
    </div>

    <!-- 添加/编辑对话框 -->
    <el-dialog
        v-model="dialog.visible"
        :title="dialog.isEdit ? $t('editFederationSite') : $t('addFederationSite')"
        width="600px"
        :close-on-click-modal="false"
        @closed="handleDialogClosed"
    >
      <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-width="100px"
          label-position="top"
      >
        <el-form-item :label="$t('domain')" prop="domain">
          <el-input
              v-model="form.domain"
              :placeholder="$t('inputDomain')"
              :disabled="dialog.isEdit"
          />
        </el-form-item>
        
        <el-form-item :label="$t('siteName')" prop="name">
          <el-input
              v-model="form.name"
              :placeholder="$t('inputSiteName')"
          />
        </el-form-item>
        
        <el-form-item :label="$t('symmetricKey')" prop="symmetricKey" required>
          <el-input
              v-model="form.symmetricKey"
              :placeholder="$t('inputSymmetricKey')"
              type="password"
              show-password
              class="key-input-full"
              @input="handleKeyInput"
          />
          <div class="key-validation-message" :class="{ 'error': keyValidationError, 'success': keyValidationSuccess }">
            {{ keyValidationMessage }}
          </div>
          <div class="key-tips">
            {{ $t('symmetricKeyTips') }}
          </div>
        </el-form-item>
        
        <el-form-item :label="$t('apiDomain')" prop="apiDomain">
          <el-input
              v-model="form.apiDomain"
              :placeholder="$t('inputApiDomain')"
          />
          <div class="form-tips">
            {{ $t('apiDomainTips') }}
          </div>
        </el-form-item>
        
        <el-form-item :label="$t('status')" prop="status">
          <el-switch
              v-model="form.status"
              :active-value="1"
              :inactive-value="0"
              :active-text="t('enabled')"
              :inactive-text="t('disabled')"
          />
        </el-form-item>
        
        <el-form-item :label="$t('sort')" prop="sort">
          <el-input-number
              v-model="form.sort"
              :min="0"
              :max="999"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialog.visible = false">
            {{ $t('cancel') }}
          </el-button>
          <el-button
              type="primary"
              @click="handleSubmit"
              :loading="dialog.submitting"
          >
            {{ $t('confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 编辑本站密钥对话框 -->
    <el-dialog
        v-model="mySiteKeyDialog.visible"
        :title="$t('editMySiteKey')"
        width="500px"
        :close-on-click-modal="false"
        @closed="handleMySiteKeyDialogClosed"
    >
      <el-form
          ref="mySiteKeyFormRef"
          :model="mySiteKeyDialog"
          :rules="mySiteKeyRules"
          label-width="100px"
          label-position="top"
      >
        <el-form-item :label="$t('symmetricKey')" prop="symmetricKey" required>
          <el-input
              v-model="mySiteKeyDialog.symmetricKey"
              :placeholder="$t('inputSymmetricKey')"
              type="password"
              show-password
              class="key-input-full"
              @input="validateMySiteKey"
          />
          <div class="key-button-group">
            <el-button
                type="primary"
                @click="handleGenerateMySiteKey"
                class="key-button"
            >
              <Icon icon="ion:reload" width="14" height="14" style="margin-right: 4px" />
              {{ $t('generateKey') }}
            </el-button>
          </div>
          <div class="key-validation-message" :class="{ 'error': mySiteKeyDialog.validationError, 'success': mySiteKeyDialog.validationSuccess }">
            {{ mySiteKeyDialog.validationMessage }}
          </div>
          <div class="key-tips">
            {{ $t('symmetricKeyTips') }}
          </div>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="mySiteKeyDialog.visible = false">
            {{ $t('cancel') }}
          </el-button>
          <el-button
              type="primary"
              @click="handleSaveMySiteKey"
              :loading="mySiteKeyDialog.submitting"
          >
            {{ $t('save') }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { federationSiteApi } from '@/request/federation-site.js'
import { settingQuery, settingSet } from '@/request/setting.js'
import { formatDetailDate } from '@/utils/day.js'

const { t } = useI18n()

// 数据
const siteList = ref([])
const loading = ref(false)

// 筛选条件
const filter = reactive({
  keyword: '',
  status: ''
})

// 分页
const pagination = reactive({
  page: 1,
  size: 20,
  total: 0
})

// 对话框
const dialog = reactive({
  visible: false,
  isEdit: false,
  submitting: false
})

// 表单
const form = reactive({
  id: '',
  domain: '',
  name: '',
  symmetricKey: '',
  apiDomain: '',
  status: 1,
  sort: 0
})

// 表单引用
const formRef = ref()

// 本站密钥相关
const mySiteKey = ref('')
const mySiteKeyDialog = reactive({
  visible: false,
  symmetricKey: '',
  submitting: false,
  validationError: false,
  validationSuccess: false,
  validationMessage: ''
})
const mySiteKeyFormRef = ref()

// 密钥实时验证
const keyValidationError = ref(false)
const keyValidationSuccess = ref(false)
const keyValidationMessage = ref('')

// 表单验证规则
const rules = {
  domain: [
    { required: true, message: t('domainRequired'), trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/, message: t('domainInvalid'), trigger: 'blur' }
  ],
  symmetricKey: [
    { required: true, message: t('symmetricKeyRequired'), trigger: 'blur' },
    { pattern: /^[0-9a-fA-F]{64}$/, message: t('symmetricKeyInvalid'), trigger: 'blur' }
  ]
}

// 本站密钥验证规则
const mySiteKeyRules = {
  symmetricKey: [
    { required: true, message: t('symmetricKeyRequired'), trigger: 'blur' },
    { pattern: /^[0-9a-fA-F]{64}$/, message: t('symmetricKeyInvalid'), trigger: 'blur' }
  ]
}

// 计算属性
const mySiteKeyDisplay = computed(() => {
  if (!mySiteKey.value) return t('notSet')
  return maskKey(mySiteKey.value)
})

// 密钥输入实时验证
const handleKeyInput = () => {
  const key = form.symmetricKey.trim()
  
  if (!key) {
    keyValidationError.value = false
    keyValidationSuccess.value = false
    keyValidationMessage.value = ''
    return
  }
  
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    keyValidationError.value = false
    keyValidationSuccess.value = true
    keyValidationMessage.value = t('keyValid')
  } else {
    keyValidationError.value = true
    keyValidationSuccess.value = false
    keyValidationMessage.value = t('keyInvalid')
  }
}

// 方法
const fetchSiteList = async () => {
  try {
    loading.value = true
    const params = {
      page: pagination.page,
      size: pagination.size,
      ...filter
    }
    
    // 移除空值参数
    Object.keys(params).forEach(key => {
      if (params[key] === '' || params[key] === null || params[key] === undefined) {
        delete params[key]
      }
    })
    
    const res = await federationSiteApi.list(params)
    // 列表API返回的是 { list: [...], total: ... } 对象
    // 直接使用 res.list 和 res.total 而不是 res.data.list 和 res.data.total
    if (res && res.list) {
      siteList.value = res.list
      pagination.total = res.total || 0
    } else {
      ElMessage.error(t('fetchFailed'))
    }
  } catch (error) {
    console.error('获取联邦邮局站点列表失败:', error)
    ElMessage.error(t('fetchFailed'))
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.page = 1
  fetchSiteList()
}

const handleReset = () => {
  filter.keyword = ''
  filter.status = ''
  pagination.page = 1
  fetchSiteList()
}

const handleSizeChange = (size) => {
  pagination.size = size
  pagination.page = 1
  fetchSiteList()
}

const handleCurrentChange = (page) => {
  pagination.page = page
  fetchSiteList()
}

// 获取本站密钥
const fetchMySiteKey = async () => {
  try {
    const res = await settingQuery(true)
    if (res) {
      mySiteKey.value = res.federationSymmetricKey || ''
    }
  } catch (error) {
    console.error('获取本站密钥失败:', error)
  }
}

const handleAdd = () => {
  dialog.visible = true
  dialog.isEdit = false
  resetForm()
}

const handleEdit = (row) => {
  dialog.visible = true
  dialog.isEdit = true
  Object.assign(form, {
    id: row.id,
    domain: row.domain,
    name: row.name,
    symmetricKey: row.symmetricKey,
    apiDomain: row.apiDomain || '',
    status: row.status,
    sort: row.sort
  })
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      t('confirmDeleteFederationSite', { domain: row.domain }),
      t('warning'),
      {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        type: 'warning'
      }
    )
    
    const res = await federationSiteApi.delete(row.id)
    ElMessage.success(t('deleteSuccess'))
    fetchSiteList()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除联邦邮局站点失败:', error)
      ElMessage.error(t('deleteFailed'))
    }
  }
}

const handleGenerateKey = async () => {
  try {
    const res = await federationSiteApi.generateKey()
    // 响应拦截器返回的是 data.data，所以 res 就是对称密钥对象
    // 直接使用 res.symmetricKey 而不是 res.data.symmetricKey
    if (res && res.symmetricKey) {
      form.symmetricKey = res.symmetricKey
      ElMessage.success(t('generateKeySuccess'))
    } else {
      ElMessage.error(t('generateKeyFailed'))
    }
  } catch (error) {
    console.error('生成对称密钥失败:', error)
    ElMessage.error(t('generateKeyFailed'))
  }
}



const handleCopyKey = async (key) => {
  try {
    await navigator.clipboard.writeText(key)
    ElMessage.success(t('copySuccess'))
  } catch (error) {
    console.error('复制失败:', error)
    // 降级方案：使用 document.execCommand
    const textArea = document.createElement('textarea')
    textArea.value = key
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      ElMessage.success(t('copySuccess'))
    } catch (err) {
      console.error('降级复制失败:', err)
      ElMessage.error('复制失败')
    }
    document.body.removeChild(textArea)
  }
}

// 复制本站密钥
const handleCopyMySiteKey = async () => {
  if (!mySiteKey.value) {
    ElMessage.warning(t('keyNotSet'))
    return
  }
  try {
    await navigator.clipboard.writeText(mySiteKey.value)
    ElMessage.success(t('copySuccess'))
  } catch (error) {
    console.error('复制本站密钥失败:', error)
    // 降级方案
    const textArea = document.createElement('textarea')
    textArea.value = mySiteKey.value
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      ElMessage.success(t('copySuccess'))
    } catch (err) {
      console.error('降级复制失败:', err)
      ElMessage.error('复制失败')
    }
    document.body.removeChild(textArea)
  }
}

// 显示编辑本站密钥对话框
const showEditMySiteKeyDialog = () => {
  mySiteKeyDialog.visible = true
  mySiteKeyDialog.symmetricKey = mySiteKey.value || ''
  validateMySiteKey()
}

// 验证本站密钥
const validateMySiteKey = () => {
  const key = mySiteKeyDialog.symmetricKey.trim()
  
  if (!key) {
    mySiteKeyDialog.validationError = false
    mySiteKeyDialog.validationSuccess = false
    mySiteKeyDialog.validationMessage = ''
    return
  }
  
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    mySiteKeyDialog.validationError = false
    mySiteKeyDialog.validationSuccess = true
    mySiteKeyDialog.validationMessage = t('keyValid')
  } else {
    mySiteKeyDialog.validationError = true
    mySiteKeyDialog.validationSuccess = false
    mySiteKeyDialog.validationMessage = t('keyInvalid')
  }
}

// 本站密钥输入监听
const handleMySiteKeyInput = () => {
  validateMySiteKey()
}

// 生成本站密钥
const handleGenerateMySiteKey = async () => {
  try {
    const res = await federationSiteApi.generateKey()
    if (res && res.symmetricKey) {
      mySiteKeyDialog.symmetricKey = res.symmetricKey
      mySiteKeyDialog.visible = true
    } else {
      ElMessage.error(t('generateKeyFailed'))
    }
  } catch (error) {
    console.error('生成本站密钥失败:', error)
    ElMessage.error(t('generateKeyFailed'))
  }
}

// 保存本站密钥
const handleSaveMySiteKey = async () => {
  try {
    await mySiteKeyFormRef.value.validate()
    
    mySiteKeyDialog.submitting = true
    
    // 更新系统设置中的 federationSymmetricKey
    const res = await settingSet({ federationSymmetricKey: mySiteKeyDialog.symmetricKey })
    
    // 更新本地数据
    mySiteKey.value = mySiteKeyDialog.symmetricKey
    mySiteKeyDialog.visible = false
    
    ElMessage.success(t('updateSuccess'))
  } catch (error) {
    console.error('保存本站密钥失败:', error)
    ElMessage.error(t('updateFailed'))
  } finally {
    mySiteKeyDialog.submitting = false
  }
}

// 关闭本站密钥对话框
const handleMySiteKeyDialogClosed = () => {
  mySiteKeyDialog.symmetricKey = ''
  mySiteKeyFormRef.value?.clearValidate()
}

const handleSubmit = async () => {
  try {
    await formRef.value.validate()
    
    dialog.submitting = true
    
    const api = dialog.isEdit ? federationSiteApi.update : federationSiteApi.add
    const res = await api(form)
    
    // 添加/更新API成功时，响应拦截器会返回 data.data
    // 如果API调用成功（没有抛出错误），就认为是操作成功
    ElMessage.success(dialog.isEdit ? t('updateSuccess') : t('addSuccess'))
    dialog.visible = false
    fetchSiteList()
  } catch (error) {
    if (error.name !== 'ElMessage') {
      console.error('提交表单失败:', error)
      ElMessage.error(dialog.isEdit ? t('updateFailed') : t('addFailed'))
    }
  } finally {
    dialog.submitting = false
  }
}

const handleDialogClosed = () => {
  resetForm()
  formRef.value?.clearValidate()
}

const resetForm = () => {
  Object.assign(form, {
    id: '',
    domain: '',
    name: '',
    symmetricKey: '',
    apiDomain: '',
    status: 1,
    sort: 0
  })
}

const maskKey = (key) => {
  if (!key || key.length < 12) return '***'
  return `${key.substring(0, 12)}******`
}

// 生命周期
onMounted(() => {
  fetchSiteList()
  fetchMySiteKey()
})
</script>

<style scoped>
.federation-site-management {
  /* 父容器.card-content已经有padding: 20px，这里不需要额外padding */
}

.management-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.management-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.my-site-key-card {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
  overflow: hidden;
}

@media (max-width: 768px) {
  .key-value {
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .key-display {
    width: 100%;
    margin-bottom: 8px;
  }
  
  .pagination-container {
    overflow-x: auto;
  }
  
  .pagination-container :deep(.el-pagination) {
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .pagination-container :deep(.el-pagination__total) {
    margin-bottom: 8px;
    width: 100%;
    text-align: center;
  }
}

/* 针对中等宽度屏幕的优化 */
@media (max-width: 1024px) and (min-width: 769px) {
  .pagination-container :deep(.el-pagination) {
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .pagination-container :deep(.el-pagination__total) {
    margin-bottom: 4px;
  }
}

.card-title {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
}

.card-content {
  padding-left: 26px;
}

.key-display-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.key-value {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  max-width: 100%;
}

.key-value .el-button {
  flex-shrink: 0;
  margin: 0;
  padding: 4px;
}

.key-display {
  font-family: monospace;
  color: #666;
  background: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #e9ecef;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
}

.search-input {
  width: 200px;
}

.status-select {
  width: 120px;
}

.site-table {
  margin-bottom: 20px;
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  overflow: visible;
  width: 100%;
  min-width: 0; /* 允许收缩 */
}

.pagination-container :deep(.el-pagination) {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.pagination-container :deep(.el-pagination__total) {
  flex-shrink: 0;
  margin-right: 8px;
  min-width: 80px; /* 确保有足够空间显示"共x条" */
  overflow: visible;
  white-space: nowrap;
  max-width: 100%; /* 防止溢出 */
  box-sizing: border-box;
}

.key-input-full {
  width: 100%;
  margin-bottom: 8px;
}

.key-button-group {
  display: flex;
  gap: 10px;
  margin-bottom: 4px;
}

.key-button {
  flex-shrink: 0;
}

.key-tips {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.form-tips {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.key-validation-message {
  font-size: 12px;
  margin-top: 4px;
  min-height: 18px;
}

.key-validation-message.error {
  color: #f56c6c;
}

.key-validation-message.success {
  color: #67c23a;
}
</style>