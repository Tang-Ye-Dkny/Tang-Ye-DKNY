// 全局配置
var host = 'https://fktv.me';
var headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// --- 工具函数区 ---

function base64Encode(text) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var b64 = '';
    for (var i = 0; i < text.length; i += 3) {
        var n = (text.charCodeAt(i) << 16) | (text.charCodeAt(i + 1) << 8) | text.charCodeAt(i + 2);
        b64 += chars.charAt((n >> 18) & 63)
            + chars.charAt((n >> 12) & 63)
            + chars.charAt((n >> 6) & 63)
            + chars.charAt(n & 63);
    }
    var mod = text.length % 3;
    return (mod ? b64.slice(0, mod - 3) + "===".substring(mod) : b64);
}

function base64Decode(str) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    str = str.replace(/=/g, '');
    var bin = '';
    for (var i = 0; i < str.length; i += 4) {
        var c1 = chars.indexOf(str.charAt(i)), c2 = chars.indexOf(str.charAt(i + 1)),
            c3 = chars.indexOf(str.charAt(i + 2)), c4 = chars.indexOf(str.charAt(i + 3));
        var n = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;
        bin += String.fromCharCode((n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
    return bin.substring(0, bin.length - [0, 0, 2, 1][str.length % 4]);
}

function generateCookie() {
    var t = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz102345678";
    var n = "";
    for (var i = 0; i < 32; i++) n += t.charAt(Math.floor(Math.random() * t.length));
    return "_did=" + n;
}

// 生成代理链接
function getProxyUrl(imgUrl) {
    if (!imgUrl) return "";
    // T3 标准代理协议: proxy://do=方法名&url=参数
    return "proxy://do=fktv_img&url=" + base64Encode(encodeURIComponent(imgUrl));
}

// --- 核心接口 ---

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
    var page = pg || 1;
    var url = host + '/channel?page=' + page + '&cat_id=' + tid + '&order=new&page_size=32';
    try {
        var res = await req(url, { headers: headers });
        var data = pdfa(res.content, '.video-wrap .list-wrap .item-wrap');
        var d = data.map(function(it) {
            return {
                vod_name: pdfh(it, '.meta-wrap a&&Text'),
                vod_pic: getProxyUrl(pdfh(it, '.normal-wrap .bg-cover&&data-src')),
                vod_remarks: pdfh(it, '.meta-wrap .category&&Text'),
                vod_id: pdfh(it, '.meta-wrap a&&href')
            };
        });
        return JSON.stringify({ page: parseInt(page), list: d });
    } catch (e) {
        console.log("Category Error: " + e);
        return JSON.stringify({ list: [] });
    }
}

async function detail(id) {
    // 兼容数组或字符串 ID
    var vodId = Array.isArray(id) ? id[0] : id;
    try {
        var res = await req(host + vodId, { headers: headers });
        var html = res.content;

        var vod = {
            vod_id: vodId,
            vod_name: pdfh(html, '.tab-body h1.title&&Text'),
            vod_pic: getProxyUrl(pdfh(html, '.info-more .meta-wrap .thumb&&data-src')),
            vod_content: pdfh(html, '.info-more .desc&&Text'),
            vod_remarks: pdfh(html, '.info-more .meta-wrap .mb-2&&Text'),
            type_name: pdfh(html, '.info-more .meta-wrap .tag-list a&&Text'),
            vod_play_from: '',
            vod_play_url: ''
        };

        var playFroms = [];
        var playUrls = [];
        var playList = pdfa(html, '.line-header .item-wrap');
        var indexList = pdfa(html, '.line-list .anthology-list .inner-wrap .item-wrap');

        playList.forEach(function(it) {
            var line = pdfh(it, 'div&&data-line');
            playFroms.push(pdfh(it, 'div&&Text'));

            // 构建播放列表 ID: 线路ID-VodID-剧集ID
            var urls = indexList.map(function(idx) {
                var epName = pdfh(idx, 'span.number&&Text').trim();
                var epId = pdfh(idx, 'div&&data-id');
                return epName + "$" + line + "-" + vodId + "-" + epId;
            });
            playUrls.push(urls.join('#'));
        });

        vod.vod_play_from = playFroms.join('$$$');
        vod.vod_play_url = playUrls.join('$$$');

        return JSON.stringify({ list: [vod] });
    } catch (e) {
        console.log("Detail Error: " + e);
        return JSON.stringify({ list: [] });
    }
}

async function search(wd, quick, pg) {
    var page = pg || 1;
    var url = host + '/channel?page=' + page + '&keywords=' + encodeURIComponent(wd) + '&page_size=32&order=new';
    try {
        var res = await req(url, { headers: headers });
        var data = pdfa(res.content, '.video-wrap .list-wrap .item-wrap');
        var d = data.map(function(it) {
            return {
                vod_name: pdfh(it, '.meta-wrap a&&Text'),
                vod_pic: getProxyUrl(pdfh(it, '.normal-wrap .bg-cover&&data-src')),
                vod_remarks: pdfh(it, '.meta-wrap .category&&Text'),
                vod_id: pdfh(it, '.meta-wrap a&&href')
            };
        });
        return JSON.stringify({ list: d });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

async function play(flag, id, flags) {
    // 使用正则提取 ID，避免 split("-") 导致的 URL 截断问题
    // 格式: line-vodId-epId
    // 注意：vodId 是 /detail/xxx 这种格式，包含横杠，所以不能简单 split
    // 我们已知最后一部分是纯数字(epId)，第一部分是 line，中间全是 vodId
    
    var parts = id.split("-");
    var vod_from = parts[0]; // 线路ID
    var vod_url = parts[parts.length - 1]; // 剧集ID (最后一部分)
    
    // 中间的部分重新拼接回 vodId (因为 vodId 本身可能含有横杠)
    // 去掉第一个和最后一个，剩下的拼起来
    var vod_id_parts = parts.slice(1, parts.length - 1);
    var vod_id = vod_id_parts.join("-"); 

    var detailUrl = host + vod_id;
    
    try {
        var res = await req(detailUrl, {
            method: 'POST',
            headers: { 
                "Content-Type": 'application/x-www-form-urlencoded; charset=UTF-8', 
                "Referer": detailUrl, 
                "Cookie": generateCookie(),
                "User-Agent": headers["User-Agent"]
            },
            body: "link_id=" + vod_url + "&is_switch=1"
        });

        var response = JSON.parse(res.content);
        if (response.data && response.data.play_links) {
            var item = response.data.play_links.find(function(i) { return i.id == vod_from; });
            if (item && item.m3u8_url) {
                return JSON.stringify({ parse: 0, url: host + item.m3u8_url });
            }
        }
    } catch (e) {
        console.log("Play Error: " + e);
    }
    
    // 失败回退
    return JSON.stringify({ parse: 1, url: detailUrl });
}

// T3 代理函数
async function proxy(params) {
    var doWhat = params.do;
    if (doWhat === 'fktv_img') {
        try {
            var targetUrl = decodeURIComponent(base64Decode(params.url));
            
            // 获取加密图片数据
            var imgRes = await req(targetUrl, { 
                buffer: 2, // 请求二进制数据 (T3 特有参数，如果是 Ok 影视可能需要调整)
                headers: { "Referer": host } 
            });
            
            // 尝试解密
            // 注意：T3 环境下 CryptoJS 的使用方式可能与 Node 不同
            // 这里假设 T3 环境有标准的 CryptoJS 对象
            var lkey = CryptoJS.enc.Utf8.parse("525202f9149e0616");
            
            // 将二进制数据转为 Base64 字符串供 CryptoJS 处理
            // 这里的 imgRes.content 应该是 ArrayBuffer 或 byte[]
            var wordArray = CryptoJS.lib.WordArray.create(imgRes.content);
            var base64Str = CryptoJS.enc.Base64.stringify(wordArray);

            var decrypted = CryptoJS.AES.decrypt(base64Str, lkey, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7
            });
            
            // 返回解密后的图片 Base64
            var finalBase64 = decrypted.toString(CryptoJS.enc.Base64);
            
            return [200, "image/png", "data:image/png;base64," + finalBase64];
            
        } catch (e) {
            console.log("Proxy Decrypt Error: " + e);
            // 如果解密失败，尝试直接返回原图（防止白屏）
            return [302, null, targetUrl]; 
        }
    }
    return [404, "text/plain", "Not Found"];
}

// 导出接口
export default { home, homeVod, category, detail, search, play, proxy };
