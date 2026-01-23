import http from '@/axios/index.js';

export function settingSet(setting) {
    return http.put('/setting/set',setting)
}

export function settingQuery(showSiteKey = false) {
    return http.get('/setting/query', {
        params: { showSiteKey }
    })
}

export function websiteConfig() {
    return http.get('/setting/websiteConfig')
}

export function setBackground(background) {
    return http.put('/setting/setBackground',{background})
}

export function deleteBackground() {
    return http.delete('/setting/deleteBackground')
}
