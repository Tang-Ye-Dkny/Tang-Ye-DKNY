// 定义基础配置
const BASE_RELEASE_PAGE = 'https://91qkw.cc'; // 发布页地址
const BACKUP_DOMAINS = [
    'https://www.qkw1.com',
    'https://888.qkw1.cc',
    'https://888.qkw2.cc',
    'https://888.91qkw.cc'
]; // 备用域名列表，防止发布页也挂了

let HOST = ''; // 最终使用的域名
let HEADERS = {};

/**
 * 初始化函数：负责获取最新域名
 */
async function init(cfg) {
    try {
        // 1. 尝试访问发布页获取最新域名
        let releaseHtml = await req(BASE_RELEASE_PAGE);
        if (releaseHtml && releaseHtml.content) {
            // 正则匹配所有 https:// 开头的链接
            // 排除 87kkt (电脑专用) 和 91qkw (发布页本身)
            let matches = releaseHtml.content.match(/https:\/\/[^\s"']+?(qkw|kkt)[^\s"']*/g);

            if (matches && matches.length > 0) {
                // 遍历找到的链接，寻找可用的
                for (let url of matches) {
                    // 简单清洗一下可能存在的标点符号
                    url = url.replace(/[.,;!?]$/, "");
                    if (!url.includes('87kkt') && !url.includes('91qkw')) {
                        HOST = url;
                        console.log("✅ 成功从发布页获取域名: " + HOST);
                        break; // 找到第一个就跳出
                    }
                }
            }
        }
    } catch (e) {
        console.log("⚠️ 发布页获取失败，尝试使用备用域名...");
    }

    // 2. 如果发布页没拿到，或者拿到的域名无法访问（这里简化处理，直接用备用列表兜底）
    if (!HOST) {
        // 简单的轮询测试，看哪个能用（为了速度，这里直接取第一个备用，或者你可以写个循环测试连通性）
        HOST = BACKUP_DOMAINS[0];
        console.log("🔄 使用备用域名: " + HOST);
    }

    // 3. 设置全局请求头
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36",
        "Referer": HOST + "/"
    };
}

/**
 * 首页推荐
 */
async function home(filter) {
    return JSON.stringify({
        "class": [
            {"type_id":"duanju","type_name":"短剧"},
            {"type_id":"tv","type_name":"电视剧"},
            {"type_id":"dy","type_name":"电影"},
            {"type_id":"dm","type_name":"动漫"},
            {"type_id":"zy","type_name":"综艺"}
        ]
    });
}

/**
 * 首页视频列表
 */
async function homeVod() {
    let resp = await req(HOST, { headers: HEADERS });
    return JSON.stringify({ list: getList(resp.content) });
}

/**
 * 分类列表
 */
async function category(tid, pg, filter, extend) {
    let p = pg || 1;
    // 构造 URL: /qkwshow/{cateId}-{area}--{class}-----{catePg}---{year}.html
    // 这里的 tid 对应 type_id，例如 'tv'
    let url = `${HOST}/qkwshow/${tid}-----${p}---.html`;

    let resp = await req(url, { headers: HEADERS });
    return JSON.stringify({
        "list": getList(resp.content),
        "page": parseInt(p),
        "pagecount": 99 // 默认给大一点，xbpq通常不返回总页数
    });
}

/**
 * 搜索功能
 */
async function search(wd, quick, pg) {
    let p = pg || 1;
    // xbpq 配置里的搜索通常是 get 请求 ?wd=xxx
    let url = `${HOST}/qkwsearch/-------------.html?wd=${encodeURIComponent(wd)}`;

    let resp = await req(url, { headers: HEADERS });
    return JSON.stringify({ list: getList(resp.content) });
}

/**
 * 详情页解析（已修复标题提取逻辑）
 */
async function detail(id) {
    // id 可能是相对路径，也可能是完整的 http 链接
    let url = id.startsWith('http') ? id : HOST + id;

    try {
        let resp = await req(url, { headers: HEADERS });
        let html = resp.content;

        // 1. 【核心修复】多层级提取影片名称
        let vod_name = "未知影片"; // 默认值
        
        // 策略 A: 尝试提取页面上的常见标题元素
        // 覆盖了不同模板的结构差异
        let titleSelectors = [
            'h1.title', 
            '.stui-content__detail h1', 
            '.stui-content__detail .title',
            '.stui-player__detail h1'
        ];
        
        for (let selector of titleSelectors) {
            let name = pdfh(html, selector + '&&Text');
            if (name && name !== "未知影片") {
                vod_name = name.trim();
                break;
            }
        }
        
        // 策略 B: 如果 DOM 元素没找到，尝试解析 <title> 标签
        // 这是最稳定的后备方案
        if (vod_name === "未知影片") {
            let page_title = pdfh(html, 'title&&Text');
            if (page_title) {
                // 使用正则提取书名号《》内的内容
                let match = page_title.match(/《(.*?)》/);
                if (match && match[1]) {
                    vod_name = match[1].trim();
                } else {
                    // 如果没有书名号，尝试截取 - 前面的内容
                    vod_name = page_title.split('-')[0].split('_')[0].trim();
                }
            }
        }

        // 2. 提取其他基本信息 (保持不变)
        let vod_pic = pdfh(html, '.stui-content__thumb img&&data-original');
        let vod_content = pdfh(html, '.detail-content&&Text') || "";

        // 3. 提取播放线路名称 (vod_play_from)
        let playFromNodes = pdfa(html, '.stui-pannel__head h3');
        let playFrom = playFromNodes.map(node => pdfh(node, 'body&&Text').trim()).join('$$$');
        if (!playFrom) playFrom = "全网看播放源";

        // 4. 提取播放链接 (vod_play_url)
        let playlistNodes = pdfa(html, 'ul.stui-content__playlist');
        let playUrlList = [];
        
        playlistNodes.forEach(listNode => {
            let links = pdfa(listNode, 'li a');
            let urls = links.map(a => {
                let epName = pdfh(a, 'body&&Text');
                let epLink = pdfh(a, 'a&&href');
                if (epLink && !epLink.startsWith('http')) {
                    epLink = HOST + epLink;
                }
                return epName + '$' + epLink;
            });
            playUrlList.push(urls.join('#'));
        });

        let playUrl = playUrlList.join('$$$');

        return JSON.stringify({
            list: [{
                'vod_id': id,
                'vod_name': vod_name, // 使用修复后的名称
                'vod_pic': vod_pic,
                'vod_content': vod_content,
                'vod_play_from': playFrom,
                'vod_play_url': playUrl
            }]
        });
    } catch (e) {
        console.log("Detail Error: " + e);
        return JSON.stringify({ list: [] });
    }
}

/**
 * 播放解析
 */
async function play(flag, id, flags) {
    let url = id.startsWith('http') ? id : HOST + id;

    // 先请求播放页
    let resp = await req(url, { headers: HEADERS });
    let html = resp.content;

    // 1. 尝试直接提取 m3u8/mp4 链接
    // 很多站会把真实地址放在 js 变量里，如 var player_aaaa={"url":"..."}
    let jsonMatch = html.match(/player_aaaa=({[^}]+})/);
    if (jsonMatch) {
        try {
            let playerObj = JSON.parse(jsonMatch[1]);
            if (playerObj.url) {
                // 如果是加密的 url，可能需要解密，但大多数简单的站是直接地址或 base64
                // 这里假设是直接地址
                return JSON.stringify({
                    parse: 0,
                    url: playerObj.url,
                    header: HEADERS
                });
            }
        } catch(e) {}
    }

    // 2. 嗅探法 (Sniffing)
    // 如果上面没拿到，让播放器去嗅探 iframe 或 script 中的资源
    // 这里的 parse: 1 会调用 TVBox 内置的嗅探器
    return JSON.stringify({
        parse: 1,
        url: url,
        header: HEADERS
    });
}

// 辅助函数：列表解析
function getList(html) {
    let videos = [];
    // 匹配 xbpq 配置的数组规则: stui-vodlist__thumb lazyload
    let items = pdfa(html, 'a.stui-vodlist__thumb');

    items.forEach(it => {
        let href = pdfh(it, 'a&&href');
        let title = pdfh(it, 'a&&title');
        let pic = pdfh(it, 'a&&data-original');

        // 过滤掉空数据
        if (href && title) {
            videos.push({
                "vod_id": href,
                "vod_name": title,
                "vod_pic": pic.startsWith('/') ? HOST + pic : pic,
                "vod_remarks": "" // 列表页通常没有备注，除非额外解析
            });
        }
    });
    return videos;
}

export default { init, home, homeVod, category, detail, search, play };
