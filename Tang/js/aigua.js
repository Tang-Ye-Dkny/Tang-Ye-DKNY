/**
 * 愛瓜TV FongMi JS0 接口源 (電影播放修復版)
 * 适配 FongMi TVBox 最新 JS 規範
 */

const HOST = 'https://aigua8.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const headers = {
    'User-Agent': UA,
    'Referer': `${HOST}/`,
    'Accept-Language': 'zh-CN,zh;q=0.9'
};

// 絕對路徑補全
function fixUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    return HOST + (url.startsWith('/') ? '' : '/') + url;
}

// 標籤清理與文字淨化
function cleanText(str) {
    return (str || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();
}

/**
 * 初始化
 */
async function init(cfg) {
    return true;
}

/**
 * 首頁分類
 */
async function home(filter) {
    const classes = [
        { type_id: '1', type_name: '電影' },
        { type_id: '2', type_name: '電視劇' },
        { type_id: '3', type_name: '綜藝' },
        { type_id: '4', type_name: '動漫' },
        { type_id: '32', type_name: '紀錄片' }
    ];
    return JSON.stringify({ class: classes });
}

/**
 * 首頁推薦 (走 API)
 */
async function homeVod() {
    try {
        const url = `${HOST}/video/refresh-cate?channel_id=2&page_num=1&page_size=28&sorttype=desc&tag=0&area=0&year=0&status=0&sort=new`;
        const res = await req(url, { headers });
        const json = JSON.parse(res.content);
        const list = (json.data && json.data.list) || [];

        const videos = list.map(item => ({
            vod_id: item.video_id,
            vod_name: item.video_name,
            vod_pic: fixUrl(item.cover),
            vod_remarks: item.flag || ''
        }));

        return JSON.stringify({ list: videos });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

/**
 * 分類列表 (走 API)
 */
async function category(tid, pg, filter, extend = {}) {
    const page = pg || 1;
    const url = `${HOST}/video/refresh-cate?channel_id=${tid}&page_num=${page}&page_size=28&sorttype=desc&tag=0&area=0&year=0&status=0&sort=new`;

    try {
        const res = await req(url, { headers });
        const json = JSON.parse(res.content);
        const list = (json.data && json.data.list) || [];

        const videos = list.map(item => ({
            vod_id: item.video_id,
            vod_name: item.video_name,
            vod_pic: fixUrl(item.cover),
            vod_remarks: item.flag || ''
        }));

        return JSON.stringify({
            page: parseInt(page),
            pagecount: 9999,
            limit: 28,
            total: 99999,
            list: videos
        });
    } catch (e) {
        return JSON.stringify({ page: parseInt(page), list: [] });
    }
}

/**
 * 詳情頁 (含電影與連續劇的多層級劇集 ID 提取)
 */
async function detail(id) {
    const url = `${HOST}/video/detail?video_id=${id}`;
    
    try {
        const res = await req(url, { headers });
        const html = res.content || '';

        // 標題解析
        let titleMatch = html.match(/<h1>(.*?)<\/h1>/i) || html.match(/<title>(.*?)<\/title>/i);
        let name = '未知影片';
        if (titleMatch) {
            name = cleanText(titleMatch[1]).split('-')[0].split('|')[0].trim();
        }

        // 封面解析
        let picMatch = html.match(/class="dyimg"[^>]*>\s*<img[^>]+src="([^"]+)"/i) || 
                       html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                       html.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*cover[^"]*"/i);
        let pic = picMatch ? fixUrl(picMatch[1]) : '';

        // 簡介解析
        let descMatch = html.match(/class="(?:yp_context|desc|detail-info)"[^>]*>([\s\S]*?)<\/div>/i);
        let desc = descMatch ? cleanText(descMatch[1]) : '';

        // 更新狀態
        let remarkMatch = html.match(/(?:更新至|全)\s*\d+\s*(?:集|話)?/i);
        let remark = remarkMatch ? cleanText(remarkMatch[0]) : '';

        // 播放線路解析
        let lines = [];
        let lineMap = new Map();

        const lineReg = /<span[^>]*class="[^"]*next-source[^"]*"[^>]*data-source-id="([^"]+)"[^>]*>([\s\S]*?)<\/span>/gi;
        let lineMatch;
        while ((lineMatch = lineReg.exec(html)) !== null) {
            let sId = lineMatch[1];
            let sName = cleanText(lineMatch[2]);
            
            if (sId && sName && !/^\d+$/.test(sName) && !sName.includes('下載') && !sName.includes('APP')) {
                if (!lineMap.has(sId)) {
                    lineMap.set(sId, sName);
                    lines.push({ source_id: sId, name: sName });
                }
            }
        }

        if (lines.length === 0) {
            lines = [
                { source_id: '1', name: '普快線路' },
                { source_id: '21', name: '超快線路' }
            ];
        }

        // 劇集/選集解析 (三重提取機制)
        let episodes = [];
        let epMap = new Map();
        const trashKeywords = ['客戶端', '客户端', 'app', '下載', '下载', '掃碼', '关注', 'vip', '客服', 'iphone', 'android', 'tv'];

        // 第一重：標準 HTML DOM 標籤 (連續劇常用)
        const epReg = /(?:data-chapter-id=["']?|chapter_id=)([a-zA-Z0-9_-]+)["']?[^>]*>([\s\S]*?)<\/(?:a|li|span|div|button)>/gi;
        let epMatch;

        while ((epMatch = epReg.exec(html)) !== null) {
            let chapterId = epMatch[1];
            let epName = cleanText(epMatch[2]);
            let lowerName = epName.toLowerCase();

            let isTrash = trashKeywords.some(kw => lowerName.includes(kw));

            if (chapterId && epName && !isTrash && !epMap.has(chapterId)) {
                epMap.set(chapterId, epName);
                episodes.push({ chapter_id: chapterId, title: epName });
            }
        }

        // 第二重：全頁 JS/JSON 變數掃描 (電影或單頁渲染常用)
        if (episodes.length === 0) {
            const chapterIdReg = /(?:chapter_id|chapterId)["']?\s*[:=]\s*["']?([a-zA-Z0-9_-]+)["']?/gi;
            let cMatch;
            while ((cMatch = chapterIdReg.exec(html)) !== null) {
                let chapterId = cMatch[1];
                if (chapterId && chapterId !== '0' && chapterId !== '1' && chapterId !== 'undefined' && !epMap.has(chapterId)) {
                    epMap.set(chapterId, '正片');
                    episodes.push({ chapter_id: chapterId, title: '正片' });
                }
            }
        }

        // 第三重保底：若仍未抓到任何集數 ID，以影片本身的 id (video_id) 作為 chapter_id
        if (episodes.length === 0) {
            episodes.push({ chapter_id: id, title: '正片' });
        }

        // 組合多線路播放選集
        let playFromArr = [];
        let playUrlArr = [];

        lines.forEach(line => {
            playFromArr.push(line.name);
            let epUrls = episodes.map(ep => {
                return `${ep.title}$${id}@${ep.chapter_id}@${line.source_id}`;
            });
            playUrlArr.push(epUrls.join('#'));
        });

        const vod = {
            vod_id: id,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: remark,
            vod_content: desc,
            vod_play_from: playFromArr.join('$$$'),
            vod_play_url: playUrlArr.join('$$$')
        };

        return JSON.stringify({ list: [vod] });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

/**
 * 搜尋 (區塊拆解解析)
 */
async function search(wd, quick, pg = 1) {
    const page = pg || 1;
    const url = `${HOST}/video/refresh-video?keyword=${encodeURIComponent(wd)}&page_num=${page}&page_size=28&sorttype=desc&sort=new`;
    
    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        const list = [];
        const seenIds = new Set();

        if (html.includes('SSbox')) {
            const boxes = html.split(/class="SSbox"/i);
            for (let i = 1; i < boxes.length; i++) {
                const box = boxes[i];
                
                let idMatch = box.match(/video_id=([^"&'\s]+)/i) || box.match(/href="\/video\/(?:detail|play)\?video_id=([^"&'\s]+)/i);
                let nameMatch = box.match(/class="SSjgTitle"[^>]*>([\s\S]*?)<\/div>/i) || 
                                 box.match(/alt="([^"]+)"/i) ||
                                 box.match(/title="([^"]+)"/i);
                let picMatch = box.match(/(?:data-original|originalsrc|src)="([^"]+)"/i);
                let remarkMatch = box.match(/<span[^>]*>([\s\S]*?)<\/span>/i);

                if (idMatch) {
                    let vid = idMatch[1];
                    if (!seenIds.has(vid)) {
                        seenIds.add(vid);
                        let vName = nameMatch ? cleanText(nameMatch[1]) : '';
                        let vPic = picMatch ? fixUrl(picMatch[1]) : '';
                        let vRemark = remarkMatch ? cleanText(remarkMatch[1]) : '';

                        if (vid && vName) {
                            list.push({
                                vod_id: vid,
                                vod_name: vName,
                                vod_pic: vPic,
                                vod_remarks: vRemark
                            });
                        }
                    }
                }
            }
        }

        if (list.length === 0) {
            const globalReg = /video_id=([^"&]+)"[^>]*>[\s\S]*?<img[^>]+(?:src|data-original|originalsrc)="([^"]+)"[\s\S]*?alt="([^"]+)"/gi;
            let gMatch;
            while ((gMatch = globalReg.exec(html)) !== null) {
                let vid = gMatch[1];
                if (!seenIds.has(vid)) {
                    seenIds.add(vid);
                    list.push({
                        vod_id: vid,
                        vod_name: cleanText(gMatch[3]),
                        vod_pic: fixUrl(gMatch[2]),
                        vod_remarks: ''
                    });
                }
            }
        }

        return JSON.stringify({ page: parseInt(page), list: list });
    } catch (e) {
        return JSON.stringify({ page: parseInt(page), list: [] });
    }
}

/**
 * 播放解析 (走 API)
 */
async function play(flag, id, flags) {
    try {
        const parts = id.split('@');
        const videoId = parts[0];
        const chapterId = parts[1];
        const sourceId = parts[2] || '1';

        const apiUrl = `${HOST}/video/play-url?videoId=${videoId}&chapterId=${chapterId}&sourceId=0&citycode=HKG`;
        const res = await req(apiUrl, { headers });
        const json = JSON.parse(res.content);

        let playUrl = '';
        const resourceUrl = json.data && json.data.urlinfo && json.data.urlinfo.resource_url;

        if (resourceUrl) {
            if (resourceUrl[sourceId]) {
                playUrl = resourceUrl[sourceId];
            } else {
                const keys = Object.keys(resourceUrl);
                if (keys.length > 0) playUrl = resourceUrl[keys[0]];
            }
        }

        return JSON.stringify({
            parse: 0,
            url: playUrl,
            header: {
                'User-Agent': UA,
                'Referer': `${HOST}/`
            }
        });
    } catch (e) {
        return JSON.stringify({ parse: 0, url: '' });
    }
}

export default {
    init,
    home,
    homeVod,
    category,
    detail,
    search,
    play
};