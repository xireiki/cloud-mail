import { defineStore } from 'pinia'
import {loginUserInfo} from "@/request/my.js";

export const useUserStore = defineStore('user', {
    state: () => {
        // 从 localStorage 读取设置，如果没有则使用默认值
        const savedSettings = localStorage.getItem('userSettings')
        const defaultSettings = {
            showAllEmails: true, // 默认显示全部邮件
        }
        
        return {
            user: {},
            refreshList: 0,
            settings: savedSettings ? JSON.parse(savedSettings) : defaultSettings,
        }
    },
    actions: {
        refreshUserList() {
            loginUserInfo().then(user => {
                this.refreshList ++
            })
        },
        refreshUserInfo() {
            loginUserInfo().then(user => {
                this.user = user
            })
        },
        toggleShowAllEmails() {
            this.settings.showAllEmails = !this.settings.showAllEmails
            this.saveSettingsToLocalStorage()
        },
        saveSettingsToLocalStorage() {
            localStorage.setItem('userSettings', JSON.stringify(this.settings))
        }
    }
})