import { Crypto, _ } from 'assets://js/lib/cat.js';

const API_HOST = 'https://api.aiyifan.tv';
const UA = 'Mozilla/5.0 (Linux; Android 10; HD1900 Build/QKQ1.190716.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/151.0.7922.200 Mobile Safari/537.36';
const SALT = '5569958*1';

const CHANNELS = [
    { tid: 'movie',   name: '电影' },
    { tid: 'drama',   name: '电视剧' },
    { tid: 'variety', name: '综艺' },
    { tid: 'anime',   name: '动漫' },
    { tid: 'short',   name: '短剧' }
];

let deviceId = '';
function getDeviceId() {
    if (!deviceId) {
        let s = '';
        for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
        deviceId = s;
    }
    return deviceId;
}

function md5(s) { return Crypto.MD5(s).toString().toLowerCase(); }

function qsStringify(obj) {
    const parts = [];
    for (const k in obj) {
        if (obj[k] === null || obj[k] === undefined || obj[k] === '') continue;
        parts.push(k + '=' + obj[k]);
    }
    return parts.join('&');
}

function buildUrl(path, bizParams, urlQuery) {
    const pub = Math.floor(Date.now() / 1000).toString();
    const all = {};
    for (const k in (bizParams || {})) {
        const v = bizParams[k];
        if (v !== null && v !== undefined && v !== '') all[k] = v;
    }
    all.System = 'h5';
    all.AppVersion = '1.0';
    all.SystemVersion = 'h5';
    all.version = 'H3';
    all.v = 1;
    all.DeviceId = getDeviceId();
    all.i18n = 0;
    all.pub = pub;

    const h = qsStringify(all).toLowerCase();
    const g = (urlQuery || '').toLowerCase();
    all.vv = md5([pub, g, h, SALT].filter(x => !!x).join('&'));

    const parts = [];
    for (const k in all) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(all[k])));
    }
    return API_HOST + path + '?' + parts.join('&');
}

async function apiGet(path, bizParams) {
    const url = buildUrl(path, bizParams);
    console.log('[AiYiFan] GET:', url);
    const res = await req(url, {
        method: 'GET',
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        timeout: 15000
    });
    try { return JSON.parse(res.content); }
    catch (e) {
        console.error('[AiYiFan] Parse fail:', (res.content || '').slice(0, 200));
        return {};
    }
}

// 遞迴尋找影片陣列
function findVideoArray(obj) {
    if (!obj) return null;
    if (Array.isArray(obj)) {
        if (obj.length === 0) return null;
        const f = obj[0];
        if (f && typeof f === 'object' &&
            (f.mediaKey || f.videoId || f.video_id || f.title || f.videoName || f.name || f.video_name || f.key)) return obj;
        return null;
    }
    if (typeof obj === 'object') {
        for (const k of ['list', 'data', 'items', 'results', 'videos', 'records', 'rows', 'searchData']) {
            if (obj[k] !== undefined) {
                const r = findVideoArray(obj[k]);
                if (r) return r;
            }
        }
        for (const k in obj) {
            const r = findVideoArray(obj[k]);
            if (r) return r;
        }
    }
    return null;
}

function toVod(v) {
    const key = v.mediaKey || v.videoId || v.video_id || v.id || v.media_key || v.key || '';
    const title = v.videoName || v.title || v.name || v.video_name || v.video_title || '';
    const cover = v.cover || v.coverUrl || v.poster || v.image || v.pic || v.cover_url || v.logo || '';
    const remark = v.remark || v.subtitle || v.tag || v.videoRemark || v.update_info || (v.filmCount ? v.filmCount + '部' : '') || '';
    const videoType = v.videoType || v.video_type || 1;
    if (!key || !title) return null;
    return {
        vod_id: String(key) + '@' + videoType,
        vod_name: String(title),
        vod_pic: String(cover),
        vod_remarks: String(remark)
    };
}

// ========== 核心修復：精準提取純數字集數標題 ==========
function getCleanEpTitle(ep, index, mainTitle = '') {
    if (!ep) return String(index);

    // 1. 優先採用接口明確給出的集數數值欄位（如 episodeNumber: 1, sort: 1）
    const directNum = ep.episodeNumber ?? ep.episode_number ?? ep.sort ?? ep.num ?? ep.episode;
    if (directNum !== undefined && directNum !== null && directNum !== '') {
        const num = parseInt(directNum, 10);
        if (!isNaN(num) && num > 0) return String(num);
    }

    // 2. 優先讀取專屬於集數名稱的欄位（避開 ep.videoName 和 ep.title，因為通常是劇集總名稱）
    let raw = String(ep.episodeName || ep.episode_name || ep.episodeTitle || ep.episode_title || ep.name || '').trim();

    // 3. 若專屬欄位為空，才備用 ep.title 或 ep.videoName，但需確認其不等於主劇名
    if (!raw) {
        const candidate = String(ep.title || ep.videoName || '').trim();
        if (candidate && candidate !== mainTitle.trim()) {
            raw = candidate;
        }
    }

    if (!raw) return String(index);

    // 4. 抹除主劇名乾擾（避免抓取主標題末尾的季數數字，例如《小富即安2》中的數字 2）
    if (mainTitle) {
        raw = raw.replace(mainTitle, '').trim();
        const cleanMain = mainTitle.replace(/\d+/g, '').trim();
        if (cleanMain.length > 1) {
            raw = raw.replace(cleanMain, '').trim();
        }
    }

    // 5. 若包含連字號 '-' (如 "2-1", "下-41")
    if (raw.includes('-')) {
        const parts = raw.split('-');
        const last = parts[parts.length - 1].trim();
        const m = last.match(/\d+/);
        if (m) return String(parseInt(m[0], 10));
    }

    // 6. 若包含冒號 ':' 或 '：' (如 "2:1")
    if (raw.includes(':') || raw.includes('：')) {
        const parts = raw.split(/[:：]/);
        const last = parts[parts.length - 1].trim();
        const m = last.match(/\d+/);
        if (m) return String(parseInt(m[0], 10));
    }

    // 7. 匹配剩餘字串中的所有數字
    const matches = raw.match(/\d+/g);
    if (matches && matches.length > 0) {
        return String(parseInt(matches[matches.length - 1], 10));
    }

    // 8. 無法解析出任何數字時，預設使用陣列索引
    return String(index);
}

// ========== 首頁 ==========
async function home(filter) {
    const classes = CHANNELS.map(c => ({ type_id: c.tid, type_name: c.name }));
    const videos = [];
    try {
        const data = await apiGet('/api/home/getrelativevideos', { titleid: 8, page: 1 });
        const arr = findVideoArray(data);
        if (arr) for (const v of arr) { const o = toVod(v); if (o) videos.push(o); }
    } catch (e) { console.error('home err', e); }
    return JSON.stringify({ class: classes, list: videos });
}

// ========== 分類 ==========
async function category(tid, pg, filter, extend) {
    const list = [];
    try {
        const ids = [
            (extend && extend.class) || '0',
            (extend && extend.area) || '0',
            (extend && extend.lang) || '0',
            (extend && extend.year) || '0',
            (extend && extend.status) || '0'
        ].join(',');

        const data = await apiGet('/api/list/getconditionfilterdata', {
            titleid: tid,
            ids: ids,
            page: parseInt(pg) || 1,
            size: 21
        });
        const arr = findVideoArray(data);
        if (arr) for (const v of arr) { const o = toVod(v); if (o) list.push(o); }
    } catch (e) { console.error('category err', e); }

    return JSON.stringify({
        page: parseInt(pg) || 1,
        pagecount: 999,
        limit: 21,
        total: list.length,
        list: list
    });
}

// ========== 詳情 ==========
async function detail(ids) {
    const id = Array.isArray(ids) ? ids[0] : ids;
    const parts = String(id).split('@');
    const mediaKey = parts[0];
    const videoType = parts[1] || '1';

    try {
        const data = await apiGet('/api/video/videodetails', { mediaKey: mediaKey });
        const info = data.data || data;
        const d = info.videoInfo || info.detail || info.info || info;

        const vodName = d.videoName || d.title || d.name || d.video_name || info.videoName || info.title || info.name || '';
        const vodPic = d.cover || d.coverUrl || d.poster || d.image || d.cover_url || info.coverUrl || info.cover || '';
        const vodContent = d.description || d.intro || d.summary || d.brief || info.description || info.intro || '';

        const gather = await apiGet('/api/video/videochoosegather', { mediaKey: mediaKey });

        let eps = [];
        const gd = gather.data || gather;
        const arr = findVideoArray(gd) || gd.episodes || gd.list || [];
        if (Array.isArray(arr) && arr.length > 0) {
            for (let i = 0; i < arr.length; i++) {
                const ep = arr[i];
                const k = ep.episodeKey || ep.episode_key || ep.key || ep.id || '';
                if (k) {
                    const cleanTitle = getCleanEpTitle(ep, i + 1, vodName);
                    eps.push({ title: cleanTitle, key: k });
                }
            }
        }
        if (eps.length === 0 && (d.videoList || d.episodes)) {
            const list = d.videoList || d.episodes;
            for (let i = 0; i < list.length; i++) {
                const ep = list[i];
                const k = ep.episodeKey || ep.id || '';
                if (k) {
                    const cleanTitle = getCleanEpTitle(ep, i + 1, vodName);
                    eps.push({ title: cleanTitle, key: k });
                }
            }
        }

        // ========== 防呆機制：若抓取到的選集名稱存在重複（例如全解析為 "2"），強制重新重置為遞增數字 ==========
        if (eps.length > 0) {
            const uniqueTitles = new Set(eps.map(e => e.title));
            if (uniqueTitles.size < eps.length) {
                eps.forEach((e, idx) => {
                    e.title = String(idx + 1);
                });
            }
        }

        const epStr = eps.map(e => e.title + '$' + mediaKey + '@@' + videoType + '@@' + e.key).join('#');

        return JSON.stringify({
            list: [{
                vod_id: mediaKey,
                vod_name: vodName,
                vod_pic: vodPic,
                vod_content: vodContent,
                vod_play_from: '爱壹帆',
                vod_play_url: epStr
            }]
        });
    } catch (e) {
        console.error('detail err', e);
        return JSON.stringify({ list: [] });
    }
}

// ========== 播放 ==========
async function play(flag, id, flags) {
    const parts = String(id).split('@@');
    const mediaKey = parts[0] || '';
    const videoType = parts[1] || '1';
    const episodeKey = parts[2] || '';

    try {
        const data = await apiGet('/api/video/getplaydata', {
            mediaKey: mediaKey, episodeKey: episodeKey, videoType: videoType
        });

        let url = '';
        const info = data.data || data;
        let stack = [info];
        while (stack.length && !url) {
            const cur = stack.pop();
            if (!cur || typeof cur !== 'object') continue;
            for (const k in cur) {
                const v = cur[k];
                if (typeof v === 'string' && (v.includes('.m3u8') || v.includes('.mp4'))) {
                    url = v; break;
                }
                if (typeof v === 'object') stack.push(v);
            }
        }

        return JSON.stringify({
            parse: 0,
            url: url,
            header: { 'User-Agent': UA }
        });
    } catch (e) {
        console.error('play err', e);
        return JSON.stringify({ parse: 0, url: '', header: {} });
    }
}

// ========== 搜尋 ==========
async function search(wd, quick, pg = 1) {
    const list = [];
    try {
        const currentPage = parseInt(pg) || 1;

        const dataMain = await apiGet('/api/list/gettitlegetdata', {
            SearchCriteria: wd,
            page: currentPage,
            size: 20
        });
        const arrMain = findVideoArray(dataMain);
        if (arrMain) {
            for (const v of arrMain) {
                const o = toVod(v);
                if (o) list.push(o);
            }
        }

        if (list.length === 0 || currentPage === 1) {
            const dataSmall = await apiGet('/api/list/getsmallvideo', {
                SearchCriteria: wd,
                videoType: 3,
                page: currentPage,
                size: 20
            });
            const arrSmall = findVideoArray(dataSmall);
            if (arrSmall) {
                for (const v of arrSmall) {
                    const o = toVod(v);
                    if (o && !list.some(item => item.vod_id === o.vod_id)) {
                        list.push(o);
                    }
                }
            }
        }
    } catch (e) { 
        console.error('search err', e); 
    }
    return JSON.stringify({ list: list, page: parseInt(pg) || 1, pagecount: 1 });
}

export function __jsEvalReturn() {
    return {
        init: function (cfg) { getDeviceId(); },
        home: home,
        homeVod: function () { return JSON.stringify({ list: [] }); },
        category: category,
        search: search,
        detail: detail,
        play: play
    };
}