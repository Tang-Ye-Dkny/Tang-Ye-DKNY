// ============================================================
// olehdtv.com - 歐樂影院 專屬插件腳本 (純普清穩定版)
// 適用於 FongMi / WebHomeTV / CatBox 等 TVBox 生態
// ============================================================

let host = 'https://www.olehdtv.com';
const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": host + '/'
};

// ---------- 輔助函數 ----------
function getFullUrl(url) {
    if (!url) return "";
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return host + url;
    return host + '/' + url;
}

// ---------- 初始化 ----------
async function init(cfg) {
    if (cfg && cfg.ext && cfg.ext.host) {
        host = cfg.ext.host.replace(/\/$/, '');
        headers.Referer = host + '/';
    }
}

// ---------- 首頁分類 ----------
async function home(filter) {
    const classes = [
        { type_id: '1', type_name: '电影' },
        { type_id: '2', type_name: '连续剧' },
        { type_id: '3', type_name: '综艺' },
        { type_id: '4', type_name: '动漫' },
        { type_id: '14', type_name: '短剧' },
        { type_id: '5', type_name: '午夜影院' }
    ];
    return JSON.stringify({ class: classes });
}

async function homeVod() {
    return JSON.stringify({ list: [] });
}

// ---------- 分類列表 ----------
async function category(tid, pg, filter, extend) {
    const page = Number(pg) || 1;
    let url = `${host}/index.php/vod/type/id/${tid}.html`;
    if (page > 1) {
        url = `${host}/index.php/vod/type/id/${tid}/page/${page}.html`;
    }

    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        const list = [];

        const cardRegex = /<a class="vodlist_thumb lazyload"[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*data-original="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            const link = match[1];
            const title = match[2];
            const pic = match[3];
            const cardInner = match[4];

            let remark = '';
            const remarkMatch = cardInner.match(/<span class="pic_text text_right">([\s\S]*?)<\/span>/);
            if (remarkMatch) {
                remark = remarkMatch[1].replace(/<[^>]+>/g, '').trim();
            }

            const idMatch = link.match(/\/id\/(\d+)\.html/);
            const vodId = idMatch ? idMatch[1] : link;

            list.push({
                vod_id: vodId,
                vod_name: title,
                vod_pic: getFullUrl(pic),
                vod_remarks: remark
            });
        }

        return JSON.stringify({ list: list, page: page, pagecount: 999 });
    } catch (e) {
        console.error('分類請求失敗:', e);
        return JSON.stringify({ list: [], page: page, pagecount: 0 });
    }
}

// ---------- 搜索 ----------
async function search(wd, quick, pg = 1) {
    const query = encodeURIComponent(wd);
    const url = `${host}/index.php/vod/search.html?wd=${query}`;

    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        const list = [];

        const searchRegex = /<li class="searchlist_item">[\s\S]*?<a class="vodlist_thumb lazyload"[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*data-original="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let match;

        while ((match = searchRegex.exec(html)) !== null) {
            const link = match[1];
            const title = match[2];
            const pic = match[3];
            const cardInner = match[4];

            let remark = '';
            const remarkMatch = cardInner.match(/<span class="pic_text text_right">([\s\S]*?)<\/span>/);
            if (remarkMatch) {
                remark = remarkMatch[1].replace(/<[^>]+>/g, '').trim();
            }

            const idMatch = link.match(/\/id\/(\d+)\.html/);
            const vodId = idMatch ? idMatch[1] : link;

            list.push({
                vod_id: vodId,
                vod_name: title,
                vod_pic: getFullUrl(pic),
                vod_remarks: remark
            });
        }

        return JSON.stringify({ list: list, page: pg, pagecount: 99 });
    } catch (e) {
        console.error('搜索請求失敗:', e);
        return JSON.stringify({ list: [], page: pg, pagecount: 0 });
    }
}

// ---------- 詳情 (僅保留免費線路) ----------
async function detail(id) {
    const vodId = Array.isArray(id) ? id[0] : id;
    const url = `${host}/index.php/vod/detail/id/${vodId}.html`;

    try {
        const res = await req(url, { headers });
        const html = res.content || '';

        // 1. 修復標題亂碼：從 <title> 標籤提取，並按 _ 或 - 分割
        let vod_name = "未知影片";
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        if (titleMatch) {
            vod_name = titleMatch[1].split(/[_\-]/)[0].trim();
        }

        // 2. 提取圖片
        let vod_pic = '';
        const picMatch = html.match(/<a class="vodlist_thumb lazyload"[^>]*data-original="([^"]+)"/);
        if (picMatch) vod_pic = picMatch[1];

        // 3. 提取簡介
        let vod_content = '';
        const descMatch = html.match(/<div class="content_desc[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/);
        if (descMatch) {
            vod_content = descMatch[1].replace(/<[^>]+>/g, '').trim();
        }
        if (!vod_content) {
            const ogDescMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
            if (ogDescMatch) vod_content = ogDescMatch[1];
        }

        // 4. 僅提取普通播放線路（忽略包含 play_vip 的高清線路）
        const normalEps = [];
        const normalRegex = /<a href="\/index.php\/vod\/play\/id\/(\d+)\/sid\/(\d+)\/nid\/(\d+)\.html"[^>]*>([^<]+)<\/a>/g;
        let match;
        while ((match = normalRegex.exec(html)) !== null) {
            const sid = match[2];
            const nid = match[3];
            const epName = match[4].trim();
            const epUrl = `${host}/index.php/vod/play/id/${vodId}/sid/${sid}/nid/${nid}.html`;
            normalEps.push(`${epName}$${epUrl}`);
        }

        // 5. 組織播放數據
        let playFroms = [];
        let playUrls = [];

        if (normalEps.length > 0) {
            playFroms.push('普清');
            playUrls.push(normalEps.join('#'));
        }

        // 兜底（以防萬一連普清正則都沒抓到）
        if (playFroms.length === 0) {
            playFroms.push('默认');
            playUrls.push(`第01集$${host}/index.php/vod/play/id/${vodId}/sid/1/nid/1.html`);
        }

        const vod = {
            vod_id: vodId,
            vod_name: vod_name,
            vod_pic: getFullUrl(vod_pic),
            vod_content: vod_content,
            vod_play_from: playFroms.join('$$$'),             vod_play_url: playUrls.join('$$$'),
            type_name: '',
            vod_year: '',
            vod_actor: '',
            vod_remarks: ''
        };

        return JSON.stringify({ list: [vod] });
    } catch (e) {
        console.error('詳情請求失敗:', e);
        return JSON.stringify({ list: [] });
    }
}

// ---------- 播放解析 ----------
async function play(flag, id, flags) {
    const playPageUrl = id;

    try {
        const res = await req(playPageUrl, { headers });
        const html = res.content || '';

        // 提取 MacCMS 播放器 player_aaaa 變量
        const playerMatch = html.match(/var player_aaaa=({.*?});/);
        if (playerMatch) {
            try {
                let jsonStr = playerMatch[1];
                jsonStr = jsonStr.replace(/\\\//g, '/');
                const playerData = JSON.parse(jsonStr);
                
                if (playerData && playerData.url) {
                    return JSON.stringify({
                        parse: 0,
                        url: playerData.url,
                        header: {
                            "User-Agent": headers["User-Agent"],
                            "Referer": host + '/'
                        }
                    });
                }
            } catch (jsonErr) {
                console.error('解析 player_aaaa JSON 失敗:', jsonErr);
            }
        }

        // 兜底：返回頁面網址進行 Web 嗅探
        return JSON.stringify({
            parse: 1,
            url: playPageUrl,
            header: headers
        });

    } catch (e) {
        console.error('播放請求失敗:', e);
        return JSON.stringify({
            parse: 1,
            url: playPageUrl,
            header: headers
        });
    }
}

export default {
    init,
    home,
    homeVod,
    category,
    search,
    detail,
    play
};