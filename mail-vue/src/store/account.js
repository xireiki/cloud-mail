import { defineStore } from 'pinia'

export const useAccountStore = defineStore('account', {
    state: () => ({
        currentAccountId: 0,
        currentAccount: {
            accountId: 0,
            email: '全部邮件',
            allReceive: 1,
            name: '全部邮件'
        },
        changeUserAccountName: ''
    })
})