// 定义基础配置
const BASE_RELEASE_PAGE = 'https://91qkw.cc'; // 发布页地址
const BACKUP_DOMAINS = [
    'https://www.qkw1.com',     // 優先使用
    'https://888.91qkw.cc',    // 穩定備用
    'https://wap.91qkw.com',   // 處理跳轉的備用
    'https://novip.qkwaa.com'
];

// 初始化默认兜底域名（解决Fongmi抢先调用导致HOST为空）
let HOST = BACKUP_DOMAINS[0];
let HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36",
    "Referer": HOST + "/"
};

/**
 * 初始化函数：兼容Fongmi异步执行逻辑
 */
async function init(cfg) {
    try {
        let releaseHtml = await req(BASE_RELEASE_PAGE);
        if (releaseHtml && releaseHtml.content) {
            let matches = releaseHtml.content.match(/https:\/\/[^\s"']+?(qkw|kkt)[^\s"']*/g);
            if (matches && matches.length > 0) {
                for (let url of matches) {
                    url = url.replace(/[.,;!?]$/, "");
                    if (!url.includes('87kkt') && !url.includes('91qkw')) {
                        HOST = url;
                        HEADERS.Referer = HOST + "/";
                        console.log("✅ 成功从发布页获取域名: " + HOST);
                        break;
                    }
                }
            }
        }
    } catch (e) {
        console.log("⚠️ 发布页获取失败，使用备用域名");
    }
}

/**
 * 首页分类 - Fongmi严格要求固定结构
 */
async function home(filter) {
    return JSON.stringify({
        class: [          
            {"type_id":"tv","type_name":"电视剧"},
            {"type_id":"dy","type_name":"电影"},
            {"type_id":"dm","type_name":"动漫"},
            {"type_id":"zy","type_name":"综艺"},
            {"type_id":"duanju","type_name":"短剧"}
        ]
    });
}

/**
 * 首页视频列表
 */
async function homeVod() {
    try {
        let resp = await req(HOST, { headers: HEADERS });
        return JSON.stringify({ list: getList(resp.content || "") });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

/**
 * 分类列表
 */
async function category(tid, pg, filter, extend) {
    let p = Number(pg) || 1;
    let url = `${HOST}/qkwshow/${tid}--------${p}---.html`;

    try {
        let resp = await req(url, { headers: HEADERS });
        let html = resp.content || "";
        let list = [];

        // 直接用正则匹配视频列表项，避免Fongmi的pdfa解析问题
        let items = html.match(/<li class="stui-vodlist__item[\s\S]*?<\/li>/g) || 
                    html.match(/<div class="stui-vodlist__item[\s\S]*?<\/div>/g);

        if (items && items.length > 0) {
            items.forEach(itHtml => {
                let hrefMatch = itHtml.match(/href="([^"]+)"/);
                let titleMatch = itHtml.match(/title="([^"]+)"/);
                let picMatch = itHtml.match(/data-original="([^"]+)"/) || itHtml.match(/src="([^"]+\.(jpg|png))"/);
                let remarksMatch = itHtml.match(/class="pic-text[^>]*>([^<]+)</);

                if (hrefMatch && titleMatch) {
                    let href = hrefMatch[1];
                    let title = titleMatch[1];
                    let pic = picMatch ? picMatch[1] : "";
                    let remarks = remarksMatch ? remarksMatch[1].trim() : "";

                    // 统一转为相对路径
                    if (href.startsWith(HOST)) href = href.replace(HOST, "");
                    if (pic && !pic.startsWith("http")) pic = HOST + pic;

                    list.push({
                        vod_id: href,
                        vod_name: title,
                        vod_pic: pic,
                        vod_remarks: remarks
                    });
                }
            });
        } else {
            list = getList(html);
        }

        return JSON.stringify({
            list: list,
            page: p,
            pagecount: list.length > 0 ? 99 : 0,
            limit: 20
        });
    } catch (e) {
        return JSON.stringify({ list: [], page: 1, pagecount: 0 });
    }
}

/**
 * 搜索功能
 */
async function search(wd, quick, pg) {
    let p = Number(pg) || 1;
    let url = `${HOST}/index.php/ajax/suggest?mid=1&wd=${encodeURIComponent(wd)}&page=${p}`;
    let list = [];

    try {
        let resp = await req(url, { headers: HEADERS });
        let res = JSON.parse(resp.content || "{}");
        if (res.list && Array.isArray(res.list)) {
            res.list.forEach(item => {
                let vod_id = "";
                if (item.url) {
                    vod_id = item.url.replace(HOST, "");
                } else if (item.id) {
                    vod_id = `/qkwtv/${item.id}.html`;
                }

                let vod_pic = item.pic || "";
                if (vod_pic && !vod_pic.startsWith("http")) {
                    vod_pic = HOST + vod_pic;
                }

                list.push({
                    vod_id: vod_id,
                    vod_name: item.name || "",
                    vod_pic: vod_pic,
                    vod_remarks: ""
                });
            });
        }
    } catch (e) {}

    return JSON.stringify({
        list: list,
        page: p,
        pagecount: list.length > 0 ? 99 : 0
    });
}

/**
 * 【重点修复】多线路解析 - 适配该网站的线路结构
 */
async function detail(id) {
    // 1. 处理URL，确保是完整地址
    let url = id.startsWith('http') ? id : HOST + (id.startsWith('/') ? id : '/' + id);

    try {
        let resp = await req(url, { headers: { ...HEADERS, Referer: url } });
        let html = resp.content || "";
        if (!html) return JSON.stringify({ list: [] });

        // 2. 提取影片名称
        let vod_name = "未知影片";
        let titleMatch = html.match(/<h1 class="title[^>]*>([^<]+)<\/h1>/) || 
                         html.match(/<title>(.*?)<\/title>/);
        if (titleMatch) {
            vod_name = titleMatch[1].trim();
            if (vod_name.includes('《')) {
                let nameMatch = vod_name.match(/《(.*?)》/);
                if (nameMatch) vod_name = nameMatch[1];
            } else {
                vod_name = vod_name.split(/[_\-]/)[0].trim();
            }
        }

        // 3. 提取图片地址
        let vod_pic = "";
        let picMatch = html.match(/class="stui-content__thumb[^>]*>[\s\S]*?src="([^"]+)"/) || 
                       html.match(/class="stui-content__thumb[^>]*>[\s\S]*?data-original="([^"]+)"/);
        if (picMatch) {
            vod_pic = picMatch[1];
            if (!vod_pic.startsWith("http")) vod_pic = HOST + vod_pic;
        }

        // 4. 提取简介
        let vod_content = "";
        let contentMatch = html.match(/class="detail-content[^>]*>([\s\S]*?)<\/div>/);
        if (contentMatch) {
            vod_content = contentMatch[1].replace(/<[^>]+>/g, '').trim();
        }

        // --------------------------
        // 5. 【核心修复】多线路解析
        // --------------------------
        let playFrom = [];
        let playUrlList = [];

        // 匹配线路标题（适配该网站的结构，比如樱樱秒播、JP超清等）
        // 先匹配所有线路标题的外层结构
        let fromBlocks = html.match(/<div class="stui-pannel__head[^>]*>[\s\S]*?<\/div>/g);
        if (fromBlocks && fromBlocks.length > 0) {
            // 从每个线路块中提取标题
            fromBlocks.forEach((block, index) => {
                let fromName = block.replace(/<[^>]+>/g, '').trim();
                if (fromName) {
                    playFrom.push(fromName);
                } else {
                    playFrom.push(`线路${index+1}`);
                }
            });
        }

        // 匹配所有播放列表（和线路一一对应）
        let listBlocks = html.match(/<ul class="stui-content__playlist[^>]*>[\s\S]*?<\/ul>/g);
        if (listBlocks && listBlocks.length > 0) {
            listBlocks.forEach(listHtml => {
                let episodes = [];
                let epMatches = listHtml.match(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g);
                if (epMatches) {
                    epMatches.forEach(ep => {
                        let epMatch = ep.match(/href="([^"]+)"[^>]*>([^<]+)<\/a>/);
                        if (epMatch) {
                            let epUrl = epMatch[1];
                            let epName = epMatch[2].trim();
                            // 转相对路径
                            if (epUrl.startsWith(HOST)) epUrl = epUrl.replace(HOST, "");
                            episodes.push(`${epName}$${epUrl}`);
                        }
                    });
                }
                playUrlList.push(episodes.join('#'));
            });
        }

        // 兜底处理：如果线路数和播放列表数不一致，强制对齐
        if (playFrom.length !== playUrlList.length) {
            if (playFrom.length === 0) playFrom = ["默认线路"];
            if (playUrlList.length === 0) playUrlList = [""];
            // 用较短的一方长度为准，补全另一方
            let minLen = Math.min(playFrom.length, playUrlList.length);
            playFrom = playFrom.slice(0, minLen);
            playUrlList = playUrlList.slice(0, minLen);
        }

        return JSON.stringify({
            list: [{
                vod_id: id,
                vod_name: vod_name,
                vod_pic: vod_pic,
                vod_content: vod_content,
                vod_play_from: playFrom.join('$$$'),
                vod_play_url: playUrlList.join('$$$')
            }]
        });
    } catch (e) {
        console.log("❌ Detail Error: " + e);
        return JSON.stringify({ list: [] });
    }
}

/**
 * 播放解析
 */
async function play(flag, id, flags) {
    let url = id.startsWith('http') ? id : HOST + (id.startsWith('/') ? id : '/' + id);

    try {
        let resp = await req(url, { headers: HEADERS });
        let html = resp.content || "";

        // 提取 player_aaaa 真实播放地址
        let jsonMatch = html.match(/player_aaaa\s*=\s*({[^}]+})/);
        if (jsonMatch) {
            try {
                let playerObj = JSON.parse(jsonMatch[1]);
                if (playerObj.url) {
                    return JSON.stringify({
                        parse: 0,
                        url: playerObj.url,
                        header: HEADERS
                    });
                }
            } catch (e) {}
        }

        // 嗅探法
        return JSON.stringify({
            parse: 1,
            url: url,
            header: HEADERS
        });
    } catch (e) {
        return JSON.stringify({ parse: 0, url: "" });
    }
}

/**
 * 列表解析工具函数
 */
function getList(html) {
    let videos = [];
    if (!html) return videos;

    let items = pdfa(html, 'ul.stui-vodlist li');
    if (items.length === 0) {
        items = pdfa(html, 'div.stui-vodlist__item');
    }

    items.forEach(it => {
        let href = pdfh(it, 'a&&href') || "";
        let title = pdfh(it, 'a&&title') || "";
        if (!href || !title) return;

        if (href.startsWith(HOST)) href = href.replace(HOST, "");

        let pic = pdfh(it, 'a&&data-original') || pdfh(it, 'img&&src') || "";
        if (pic && !pic.startsWith('http')) pic = HOST + pic;

        let remarks = pdfh(it, '.pic-text&&Text') || "";

        videos.push({
            vod_id: href,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: remarks
        });
    });
    return videos;
}

// Fongmi 标准导出格式
export default { init, home, homeVod, category, detail, search, play };