// 定义基础配置
const BASE_RELEASE_PAGE = 'https://91qkw.cc'; // 发布页地址
const BACKUP_DOMAINS = [
    'https://www.qkw1.com',     // 優先使用
    'https://888.91qkw.cc',    // 穩定備用
    'https://wap.91qkw.com',   // 處理跳轉的備用
    'https://novip.qkwaa.com'
];

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
    // 修正點：確保所有參數都帶上，即便為空也要補分隔符
    // 格式參考: {cateId}-{area}--{class}-----{catePg}---{year}.html
    let url = `${HOST}/qkwshow/${tid}--------${p}---.html`;
    
    console.log("🚀 正在請求分類頁: " + url);
    
    let resp = await req(url, { headers: HEADERS });
    return JSON.stringify({
        "list": getList(resp.content),
        "page": parseInt(p),
        "pagecount": 99
    });
}

/**
 * 搜索功能 (優化版：使用 API 接口)
 */
async function search(wd, quick, pg) {
    let p = pg || 1;
    let url = `${HOST}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(wd)}&page=${p}`;

    try {
        let resp = await req(url, { headers: HEADERS });
        let res = JSON.parse(resp.content);
        let list = [];
        
        if (res.list && res.list.length > 0) {
            res.list.forEach(item => {
                // 【核心修正】: 觀察 API 結構
                // 有些站點的 API 返回的是 item.id，或者需要拼接出 vod_id
                // 如果你的接口沒有 url 字段，請改用 item.id
                let vod_id = item.url || ('/qkwtv/' + item.id + '.html'); 
                
                list.push({
                    "vod_id": vod_id,
                    "vod_name": item.name,
                    "vod_pic": item.pic && !item.pic.startsWith('http') ? HOST + item.pic : item.pic,
                    "vod_remarks": ""
                });
            });
        }
        
        return JSON.stringify({
            "list": list,
            "page": parseInt(p),
            "pagecount": 99
        });
    } catch (e) {
        console.log("API 搜索失敗: " + e);
        return JSON.stringify({ list: [] });
    }
}

/**
 * 詳情頁解析（強化路徑修復）
 */
async function detail(id) {
    console.log("🔥 進入 detail 函數，傳入 ID 為: " + id); // 【最重要：確認這行有沒有出現在日誌裡】
    
    let url = id.startsWith('http') ? id : HOST + (id.startsWith('/') ? id : '/' + id);
    // ... 後續代碼
    
    console.log("🔍 正在嘗試進入詳情頁: " + url);

    try {
        // 使用詳情頁自身作為 Referer，解決防盜鏈問題
        let resp = await req(url, { 
            headers: { 
                ...HEADERS, 
                "Referer": url,
                "Host": url.split('/')[2] 
            } 
        });
        let html = resp.content;

        // 1. 提取影片名稱 (多策略)
        let vod_name = "未知影片";
        let titleSelectors = ['h1.title', '.stui-content__detail h1', '.stui-content__detail .title', '.stui-player__detail h1'];
        for (let selector of titleSelectors) {
            let name = pdfh(html, selector + '&&Text');
            if (name && name !== "未知影片") { vod_name = name.trim(); break; }
        }
        if (vod_name === "未知影片") {
            let page_title = pdfh(html, 'title&&Text');
            if (page_title) {
                let match = page_title.match(/《(.*?)》/);
                vod_name = match ? match[1].trim() : page_title.split('-')[0].split('_')[0].trim();
            }
        }

        // 2. 提取圖片與簡介
        let vod_pic = pdfh(html, '.stui-content__thumb img&&data-original') || pdfh(html, '.stui-content__thumb img&&src');
        let vod_content = pdfh(html, '.detail-content&&Text') || "";

        // 3. 提取播放線路
        let playFromNodes = pdfa(html, '.stui-pannel__head h3');
        let playFrom = playFromNodes.length > 0 ? playFromNodes.map(node => pdfh(node, 'body&&Text').trim()).join('$$$') : "全網看播放源";

        // 4. 提取播放列表
        let playlistNodes = pdfa(html, 'ul.stui-content__playlist');
        let playUrlList = playlistNodes.map(listNode => {
            let links = pdfa(listNode, 'li a');
            return links.map(a => {
                let epName = pdfh(a, 'body&&Text');
                let epLink = pdfh(a, 'a&&href');
                return epName + '$' + (epLink.startsWith('http') ? epLink : HOST + epLink);
            }).join('#');
        });

        return JSON.stringify({
            list: [{
                'vod_id': id,
                'vod_name': vod_name,
                'vod_pic': vod_pic && !vod_pic.startsWith('http') ? HOST + vod_pic : vod_pic,
                'vod_content': vod_content,
                'vod_play_from': playFrom,
                'vod_play_url': playUrlList.join('$$$')
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
    // 優先匹配 ul.stui-vodlist > li 結構 (分類頁最常見)
    let items = pdfa(html, 'ul.stui-vodlist li'); 
    
    // 如果上面抓不到，嘗試匹配 div.stui-vodlist__item (某些主題)
    if (items.length === 0) {
        items = pdfa(html, 'div.stui-vodlist__item');
    }

    items.forEach(it => {
        // 從 li 內部提取鏈接和圖片
        let href = pdfh(it, 'a&&href');
        let title = pdfh(it, 'a&&title');
        let pic = pdfh(it, 'a&&data-original') || pdfh(it, 'img&&src'); 

        if (href && title) {
            videos.push({
                "vod_id": href,
                "vod_name": title,
                "vod_pic": pic && !pic.startsWith('http') ? HOST + pic : pic,
                "vod_remarks": pdfh(it, '.pic-text&&Text') || ""
            });
        }
    });
    return videos;
}

export default { init, home, homeVod, category, detail, search, play };
