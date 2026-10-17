/**
 * 愛瓜TV FongMi JS0 接口源 (極速穩定版)
 * 兼顧最佳搜尋命中率、分類片單篩選、超快線路優先
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
 * 首頁分類與完整篩選器配置
 */
async function home(filter) {
    const classes = [
        { type_id: '2', type_name: '電視劇' },
        { type_id: '1', type_name: '電影' },
        { type_id: '3', type_name: '綜藝' },
        { type_id: '4', type_name: '動漫' },
        { type_id: '32', type_name: '紀錄片' }
    ];

    const commonYears = [
        { n: '全部', v: '0' },
        { n: '2025', v: '131' }, { n: '2024', v: '130' }, { n: '2023', v: '129' },
        { n: '2022', v: '21' }, { n: '2021', v: '22' }, { n: '2020', v: '23' },
        { n: '2019', v: '24' }, { n: '2018', v: '25' }, { n: '2017', v: '26' },
        { n: '2016', v: '27' }, { n: '2015', v: '28' }, { n: '2014', v: '29' },
        { n: '2013', v: '30' }, { n: '2012', v: '31' }, { n: '2011', v: '32' },
        { n: '2010', v: '33' }, { n: '2009', v: '34' }, { n: '2008', v: '35' },
        { n: '更早', v: '127' }
    ];

    const commonAreas = [
        { n: '全部', v: '0' }, { n: '大陸', v: '18' }, { n: '日本', v: '24' },
        { n: '香港', v: '20' }, { n: '韓國', v: '21' }, { n: '台灣', v: '23' },
        { n: '英國', v: '22' }, { n: '東南亞', v: '29' }, { n: '歐美', v: '19' },
        { n: '其它', v: '30' }
    ];

    const commonStatuses = [
        { n: '全部', v: '0' }, { n: '完結', v: '1' }, { n: '更新中', v: '2' }
    ];

    const commonSorts = [
        { n: '添加時間', v: 'new' }, { n: '人氣高低', v: 'hot' }, { n: '評分高低', v: 'score' }
    ];

    const filters = {
        '1': [
            {
                name: '劇情', key: 'class', value: [
                    { n: '全部', v: '0' }, { n: '魔幻', v: '179' }, { n: '動作', v: '154' },
                    { n: '科幻', v: '159' }, { n: '驚悚', v: '156' }, { n: '犯罪', v: '157' },
                    { n: '劇情', v: '161' }, { n: '懸疑', v: '160' }, { n: '奇幻', v: '226' },
                    { n: '愛情', v: '155' }, { n: '戰爭', v: '164' }, { n: '恐怖', v: '169' },
                    { n: '喜劇', v: '153' }, { n: '冒險', v: '280' }, { n: '災難', v: '281' },
                    { n: '歌舞', v: '282' }, { n: '動畫', v: '283' }, { n: '經典', v: '284' },
                    { n: '同性', v: '285' }, { n: '網絡電影', v: '286' }, { n: '其他', v: '178' }
                ]
            },
            { name: '地區', key: 'area', value: commonAreas },
            { name: '年份', key: 'year', value: commonYears },
            { name: '狀態', key: 'status', value: commonStatuses },
            { name: '排序', key: 'by', value: commonSorts }
        ],
        '2': [
            {
                name: '劇情', key: 'class', value: [
                    { n: '全部', v: '0' }, { n: '短劇', v: '364' }, { n: '偶像', v: '251' },
                    { n: '愛情', v: '252' }, { n: '言情', v: '253' }, { n: '古裝', v: '254' },
                    { n: '歷史', v: '255' }, { n: '玄幻', v: '256' }, { n: '諜戰', v: '257' },
                    { n: '歷險', v: '258' }, { n: '都市', v: '259' }, { n: '科幻', v: '260' },
                    { n: '軍旅', v: '261' }, { n: '喜劇', v: '262' }, { n: '武俠', v: '263' },
                    { n: '江湖', v: '264' }, { n: '罪案', v: '265' }, { n: '青春', v: '266' },
                    { n: '家庭', v: '267' }, { n: '戰爭', v: '268' }, { n: '懸疑', v: '269' },
                    { n: '穿越', v: '270' }, { n: '宮廷', v: '271' }, { n: '神話', v: '272' },
                    { n: '商戰', v: '273' }, { n: '警匪', v: '274' }, { n: '動作', v: '275' },
                    { n: '驚悚', v: '276' }, { n: '劇情', v: '277' }, { n: '同性', v: '278' },
                    { n: '奇幻', v: '279' }, { n: '其他', v: '231' }
                ]
            },
            { name: '地區', key: 'area', value: commonAreas },
            { name: '年份', key: 'year', value: commonYears },
            { name: '狀態', key: 'status', value: commonStatuses },
            { name: '排序', key: 'by', value: commonSorts }
        ],
        '3': [
            {
                name: '類型', key: 'class', value: [
                    { n: '全部', v: '0' }, { n: '生活', v: '229' }, { n: '脫口秀', v: '228' },
                    { n: '真人秀', v: '227' }, { n: '訪談', v: '168' }, { n: '選秀', v: '287' },
                    { n: '網綜', v: '288' }, { n: '搞笑', v: '289' }, { n: '競技', v: '290' },
                    { n: '情感', v: '291' }, { n: '演唱會', v: '292' }, { n: '晚會', v: '293' },
                    { n: '其他', v: '232' }
                ]
            },
            { name: '地區', key: 'area', value: commonAreas },
            { name: '年份', key: 'year', value: commonYears },
            { name: '狀態', key: 'status', value: commonStatuses },
            { name: '排序', key: 'by', value: commonSorts }
        ],
        '4': [
            {
                name: '類型', key: 'class', value: [
                    { n: '全部', v: '0' }, { n: '兒童', v: '363' }, { n: '格鬥', v: '167' },
                    { n: '熱血', v: '165' }, { n: '機戰', v: '166' }, { n: '少女', v: '294' },
                    { n: '競技', v: '295' }, { n: '科幻', v: '296' }, { n: '爆笑', v: '297' },
                    { n: '推理', v: '298' }, { n: '魔幻', v: '299' }, { n: '冒險', v: '300' },
                    { n: '戀愛', v: '301' }, { n: '校園', v: '302' }, { n: '治癒', v: '303' },
                    { n: '泡麵', v: '304' }, { n: '穿越', v: '305' }, { n: '靈異', v: '306' },
                    { n: '耽美', v: '307' }, { n: '劇場版', v: '308' }, { n: '其他', v: '170' }
                ]
            },
            { name: '地區', key: 'area', value: commonAreas },
            { name: '年份', key: 'year', value: commonYears },
            { name: '狀態', key: 'status', value: commonStatuses },
            { name: '排序', key: 'by', value: commonSorts }
        ],
        '32': [
            { name: '類型', key: 'class', value: [{ n: '全部', v: '0' }] },
            { name: '地區', key: 'area', value: [{ n: '全部', v: '0' }] },
            { name: '年份', key: 'year', value: commonYears },
            { name: '狀態', key: 'status', value: commonStatuses },
            { name: '排序', key: 'by', value: commonSorts }
        ]
    };

    return JSON.stringify({ class: classes, filters: filters });
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
 * 分類列表
 */
async function category(tid, pg, filter, extend = {}) {
    const page = pg || 1;
    const tag = extend.class || '0';
    const area = extend.area || '0';
    const year = extend.year || '0';
    const status = extend.status || '0';
    const by = extend.by || 'new';

    const url = `${HOST}/video/refresh-cate?channel_id=${tid}&page_num=${page}&page_size=28&sorttype=desc&tag=${tag}&area=${area}&year=${year}&status=${status}&sort=${by}`;

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
 * 詳情頁 (乾淨純片名，確保播放與詳情資訊穩定)
 */
async function detail(id) {
    const url = `${HOST}/video/detail?video_id=${id}`;
    
    try {
        const res = await req(url, { headers });
        const html = res.content || '';

        // 標題解析：保持乾淨的純片名
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
        let descMatch = html.match(/class="(?:yp_context|desc|detail-info)"[^>]*>([\s\S]*?)<\/div>/i) ||
                       html.match(/<div[^>]+class="[^"]*intro[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        let desc = descMatch ? cleanText(descMatch[1]) : '';

        // 更新狀態 / 備註
        let remarkMatch = html.match(/(?:更新至|全)\s*\d+\s*(?:集|話)?/i) || html.match(/class="[^"]*status[^"]*"[^>]*>([\s\S]*?)<\//i);
        let remark = remarkMatch ? cleanText(remarkMatch[1] || remarkMatch[0]) : '';

        // 年份、地區、演員、導演解析
        let yearMatch = html.match(/年份[：:]\s*<[^>]+>([^<]+)</i) || html.match(/年份[：:]\s*([^<]+)</i);
        let year = yearMatch ? cleanText(yearMatch[1]) : '';

        let areaMatch = html.match(/地區[：:]\s*<[^>]+>([^<]+)</i) || html.match(/地区[：:]\s*([^<]+)</i);
        let area = areaMatch ? cleanText(areaMatch[1]) : '';

        let actorMatch = html.match(/主演[：:]\s*([\s\S]*?)<\/(?:div|p|span)>?/i) || html.match(/演员[：:]\s*([\s\S]*?)<\/(?:div|p|span)>?/i);
        let actor = actorMatch ? cleanText(actorMatch[1]) : '';

        let directorMatch = html.match(/導演[：:]\s*([\s\S]*?)<\/(?:div|p|span)>?/i) || html.match(/导演[：:]\s*([\s\S]*?)<\/(?:div|p|span)>?/i);
        let director = directorMatch ? cleanText(directorMatch[1]) : '';

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
                { source_id: '21', name: '超快線路' },
                { source_id: '1', name: '普快線路' }
            ];
        }

        // 調整線路順序：將「超快線路」強制排在最前面
        lines.sort((a, b) => {
            if (a.name.includes('超快')) return -1;
            if (b.name.includes('超快')) return 1;
            return 0;
        });

        // 劇集/選集解析
        let episodes = [];
        let epMap = new Map();
        const trashKeywords = ['客戶端', '客户端', 'app', '下載', '下载', '掃碼', '关注', 'vip', '客服', 'iphone', 'android', 'tv'];

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

        if (episodes.length === 0) {
            episodes.push({ chapter_id: id, title: '正片' });
        }

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
            vod_year: year,
            vod_area: area,
            vod_actor: actor,
            vod_director: director,
            vod_content: desc,
            vod_play_from: playFromArr.join('$$$'), vod_play_url: playUrlArr.join('$$$')
        };

        return JSON.stringify({ list: [vod] });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

/**
 * 搜尋 (高效穩定，只抓取標準片名與類型備註)
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
                let picMatch = box.match(/(?:data-original|originalsrc|src)="([^"]+)"/i);

                if (idMatch) {
                    let vid = idMatch[1];
                    if (!seenIds.has(vid)) {
                        seenIds.add(vid);

                        // 回歸最乾淨的標準片名抓取，確保搜尋完全不失靈
                        let nameMatch = box.match(/class="SSjgTitle"[^>]*>([\s\S]*?)<\/div>/i) || 
                                         box.match(/alt="([^"]+)"/i) ||
                                         box.match(/title="([^"]+)"/i);
                        let vName = nameMatch ? cleanText(nameMatch[1]).split('-')[0].trim() : '';

                        let remarkMatch = box.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
                        let vRemark = remarkMatch ? cleanText(remarkMatch[1]) : '';

                        let vPic = picMatch ? fixUrl(picMatch[1]) : '';

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
 * 播放解析
 */
async function play(flag, id, flags) {
    try {
        const parts = id.split('@');
        const videoId = parts[0];
        const chapterId = parts[1];
        const sourceId = parts[2] || '21';

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