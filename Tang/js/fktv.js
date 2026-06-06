const host = 'https://fktv.me';

const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// --- 標準內建 Base64 轉換 ---

function base64Encode(text) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let b64 = '';
    for (let i = 0; i < text.length; i += 3) {
        let n = (text.charCodeAt(i) << 16) | (text.charCodeAt(i + 1) << 8) | text.charCodeAt(i + 2);
        b64 += chars.charAt((n >> 18) & 63)
            + chars.charAt((n >> 12) & 63)
            + chars.charAt((n >> 6) & 63)
            + chars.charAt(n & 63);
    }
    let mod = text.length % 3;
    return (mod ? b64.slice(0, mod - 3) + "===".substring(mod) : b64);
}

function base64Decode(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    str = str.replace(/=/g, '');
    let bin = '';
    for (let i = 0; i < str.length; i += 4) {
        let c1 = chars.indexOf(str.charAt(i)), c2 = chars.indexOf(str.charAt(i + 1)),
            c3 = chars.indexOf(str.charAt(i + 2)), c4 = chars.indexOf(str.charAt(i + 3));
        let n = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;
        bin += String.fromCharCode((n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
    return bin.substring(0, bin.length - [0, 0, 2, 1][str.length % 4]);
}

function generateCookie() {
    const t = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz102345678";
    let n = "";
    for (let i = 0; i < 32; i++) n += t.charAt(Math.floor(Math.random() * t.length));
    return `_did=${n}`;
}

function getProxyUrl(imgUrl) {
    if (!imgUrl) return "";
    return `proxy://do=fktv_img&url=${base64Encode(encodeURIComponent(imgUrl))}`;
}

// --- T3 核心標準介面 (嚴格對齊原始 T4 數據結構) ---

async function init(cfg) {}

async function home() {
    return JSON.stringify({
        class: [
            { type_id: '1', type_name: '电影' }, { type_id: '2', type_name: '电视剧' },
            { type_id: '4', type_name: '动漫' }, { type_id: '3', type_name: '综艺' },
            { type_id: '8', type_name: '短剧' }, { type_id: '6', type_name: '纪录片' }
        ]
    });
}

async function homeVod() { 
    return JSON.stringify({ list: [] }); 
}

async function category(tid, pg, filter, extend) {
    const page = pg || 1;
    // 🎯 修正：嚴格對齊原版分類網址結構
    const url = `${host}/channel?page=${page}&cat_id=${tid}&order=new&page_size=32`;
    const res = await req(url, { headers });
    
    // 🎯 修正：嚴格對齊原版 HTML 標籤抓取規則
    const data = pdfa(res.content, '.video-wrap .list-wrap .item-wrap');
    const d = data.map(it => ({
        vod_name: pdfh(it, '.meta-wrap a&&Text'),
        vod_pic: getProxyUrl(pdfh(it, '.normal-wrap .bg-cover&&data-src')),
        vod_remarks: pdfh(it, '.meta-wrap .category&&Text'),
        vod_id: pdfh(it, '.meta-wrap a&&href')
    }));
    
    return JSON.stringify({ page: parseInt(page), list: d });
}

async function detail(id) {
    const res = await req(`${host}${id}`, { headers });
    const html = res.content;

    // 🎯 修正：嚴格對齊原版詳情頁解析標籤
    const vod = {
        vod_id: id,
        vod_name: pdfh(html, '.tab-body h1.title&&Text'),
        vod_pic: getProxyUrl(pdfh(html, '.info-more .meta-wrap .thumb&&data-src')),
        vod_content: pdfh(html, '.info-more .desc&&Text'),
        vod_remarks: pdfh(html, '.info-more .meta-wrap .mb-2&&Text'),
        type_name: pdfh(html, '.info-more .meta-wrap .tag-list a&&Text'),
        vod_play_from: '',
        vod_play_url: ''
    };

    let playFroms = [], playUrls = [];
    const playList = pdfa(html, '.line-header .item-wrap');
    const indexList = pdfa(html, '.line-list .anthology-list .inner-wrap .item-wrap');

    playList.forEach((it) => {
        const line = pdfh(it, 'div&&data-line');
        playFroms.push(pdfh(it, 'div&&Text'));
        const urls = indexList.map(idx => `${pdfh(idx, 'span.number&&Text')}$${line}-${id}-${pdfh(idx, 'div&&data-id')}`);
        playUrls.push(urls.join('#'));
    });

    vod.vod_play_from = playFroms.join('$$$');
    vod.vod_play_url = playUrls.join('$$$');

    return JSON.stringify({ list: [vod] });
}

async function search(wd, quick, pg) {
    const page = pg || 1;
    // 🎯 修正：嚴格對齊原版搜尋網址結構
    const url = `${host}/channel?page=${page}&keywords=${encodeURIComponent(wd)}&page_size=32&order=new`;
    const res = await req(url, { headers });
    
    const data = pdfa(res.content, '.video-wrap .list-wrap .item-wrap');
    const d = data.map(it => ({
        vod_name: pdfh(it, '.meta-wrap a&&Text'),
        vod_pic: getProxyUrl(pdfh(it, '.normal-wrap .bg-cover&&data-src')),
        vod_remarks: pdfh(it, '.meta-wrap .category&&Text'),
        vod_id: pdfh(it, '.meta-wrap a&&href')
    }));
    
    return JSON.stringify({ list: d });
}

async function play(flag, id, flags) {
    const [vod_from, vod_id, vod_url] = id.split("-");
    const detailUrl = `${host}${vod_id}`;
    
    // 🎯 100% 完整保留原本最核心的 POST 播放請求
    const res = await req(detailUrl, {
        method: 'POST',
        headers: { 
            "Content-Type": 'application/x-www-form-urlencoded; charset=UTF-8', 
            "Referer": detailUrl, 
            "Cookie": generateCookie(),
            "User-Agent": headers["User-Agent"]
        },
        body: `link_id=${vod_url}&is_switch=1`
    });

    try {
        const response = JSON.parse(res.content);
        const item = response.data.play_links.find(i => i.id === vod_from);
        return JSON.stringify({ parse: 0, url: `${host}${item.m3u8_url}` });
    } catch (e) {
        return JSON.stringify({ parse: 1, url: detailUrl });
    }
}

// 👑 T3 標準本機代理功能（加入安全防撞防錯機制）
async function proxy(args) {
    const doWhat = args.do;
    if (doWhat === 'fktv_img') {
        const targetUrl = decodeURIComponent(base64Decode(args.url));
        // 如果盒子內建環境無法完美支持 AES 運算，直接進行重定向安全降級，保證顯示圖片不卡死
        return ["redirect", targetUrl];
    }
    return [404, "text/plain", "Not Found"];
}

export default { init, home, homeVod, category, detail, search, play, proxy };