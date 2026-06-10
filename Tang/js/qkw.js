var host = 'https://www.qkw1.com';
var headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36",
    "Referer": host + "/"
};

// 初始化入口
async function init(cfg) {}

/**
 * 通用列表解析函数
 * 对应 xbpq 中的数组: stui-vodlist__thumb lazyload&&</a>
 */
function getList(html) {
    let videos = [];
    // 使用 pdfa 提取所有包含 class="stui-vodlist__thumb" 的 a 标签
    let items = pdfa(html, 'a.stui-vodlist__thumb');

    items.forEach(it => {
        // 提取链接 (vod_id)
        let href = pdfh(it, 'a&&href');
        // 提取标题 (vod_name) - 优先取 title 属性，如果没有则取文本
        let name = pdfh(it, 'a&&title') || pdfh(it, 'a&&Text');
        // 提取图片 (vod_pic) - 懒加载通常使用 data-original
        let pic = pdfh(it, 'img&&data-original');

        if (href && name) {
            // 补全相对路径
            if (!href.startsWith('http')) {
                href = host + href;
            }
            if (pic && !pic.startsWith('http')) {
                pic = host + pic;
            }

            videos.push({
                "vod_id": href,
                "vod_name": name.replace(/<.*?>/g, ""), // 去除可能的HTML标签
                "vod_pic": pic || "",
                "vod_remarks": "" // 列表页暂无备注信息，留空
            });
        }
    });
    return videos;
}

/**
 * 首页分类数据
 * 对应 xbpq 中的分类: 短剧$duanju#电视剧$tv...
 */
async function home(filter) {
    return JSON.stringify({
        "class": [
            {"type_id":"duanju","type_name":"短剧"},
            {"type_id":"tv","type_name":"电视剧"},
            {"type_id":"dy","type_name":"电影"},
            {"type_id":"dm","type_name":"动漫"},
            {"type_id":"zy","type_name":"综艺"}
        ],
        "filters": {}
    });
}

/**
 * 首页推荐视频
 */
async function homeVod() {
    try {
        let resp = await req(host, { headers: headers });
        return JSON.stringify({ list: getList(resp.content) });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

/**
 * 分类列表页
 * 对应 xbpq 分类url: .../{cateId}-{area}--{class}-----{catePg}---{year}.html
 */
async function category(tid, pg, filter, extend) {
    let p = pg || 1;
    // 构建符合目标网站格式的 URL
    let url = `${host}/qkwshow/${tid}-----${p}---.html`;

    try {
        let resp = await req(url, { headers: headers });
        return JSON.stringify({
            "list": getList(resp.content),
            "page": parseInt(p),
            "pagecount": 99 // 默认给大一点，或者根据实际分页逻辑调整
        });
    } catch (e) {
        return JSON.stringify({ list: [], page: p, pagecount: 0 });
    }
}

/**
 * 详情页解析（核心修复部分）
 * 解决多线路和播放源提取问题
 */
async function detail(id) {
    // id 可能是完整的 http 链接，也可能是相对路径
    let url = id.startsWith('http') ? id : host + id;

    try {
        let resp = await req(url, { headers: headers });
        let html = resp.content;

        // 1. 提取基本信息
        let vod_name = pdfh(html, 'h1.title&&Text');
        let vod_pic = pdfh(html, '.stui-content__thumb img&&data-original');
        let vod_content = pdfh(html, '.detail-content&&Text'); // 简介

        // 2. 提取播放线路名称 (vod_play_from)
        // 假设线路标题在 .stui-pannel__head h3 中，如果结构不同需调整选择器
        // 这里尝试通用的线路名提取，如果失败则默认为“全网看”
        let playFromNodes = pdfa(html, '.stui-pannel__head h3');
        let playFrom = playFromNodes.map(node => pdfh(node, 'body&&Text').trim()).join('$$$');
        if (!playFrom) playFrom = "全网看播放源";

        // 3. 提取播放链接 (vod_play_url)
        // 关键逻辑：找到所有的播放列表容器 ul.stui-content__playlist
        let playlistNodes = pdfa(html, 'ul.stui-content__playlist');

        let playUrlList = [];
        playlistNodes.forEach(listNode => {
            // 获取该列表下的所有集数链接 a
            let links = pdfa(listNode, 'li a');
            let urls = links.map(a => {
                let epName = pdfh(a, 'body&&Text'); // 集数名称，如“第1集”
                let epLink = pdfh(a, 'a&&href');    // 播放页链接
                // 补全链接
                if (epLink && !epLink.startsWith('http')) {
                    epLink = host + epLink;
                }
                return epName + '$' + epLink;
            });
            // 用 # 连接同一线路下的集数
            playUrlList.push(urls.join('#'));
        });

        // 用 $$$ 连接不同线路
        let playUrl = playUrlList.join('$$$');

        return JSON.stringify({
            list: [{
                'vod_id': id,
                'vod_name': vod_name,
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
 * 搜索功能
 */
async function search(wd, quick, pg) {
    let p = pg || 1;
    // 根据截图推断的搜索接口，通常是 wd=关键词
    let url = `${host}/qkwsearch/-------------.html?wd=${encodeURIComponent(wd)}`;

    try {
        let resp = await req(url, { headers: headers });
        return JSON.stringify({ list: getList(resp.content) });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

/**
 * 播放解析（解决无法播放的关键）
 * 进入播放页 -> 嗅探真实 m3u8/mp4 地址 -> 返回给播放器
 */
async function play(flag, id, flags) {
    try {
        // 1. 请求播放页面
        let resp = await req(id, { headers: headers });
        let html = resp.content;

        // 2. 尝试直接匹配 m3u8 链接 (正则嗅探)
        // 很多网站会在 script 标签里生成 var player_aaaa={"url":"...m3u8..."}
        let m3u8Match = html.match(/"url":"(.*?\.m3u8[^"]*)"/);
        if (m3u8Match) {
            let realUrl = m3u8Match[1].replace(/\\/g, ""); // 去除转义符
            return JSON.stringify({
                parse: 0, // 0 表示直接播放，不需要再次解析
                url: realUrl,
                header: headers // 必须带上 Referer，否则会被防盗链拦截
            });
        }

        // 3. 如果没匹配到，尝试匹配 iframe src 或其他常见视频标签
        let iframeMatch = html.match(/src="(.*?player.*?\.php\?.*?)"/);
        if (iframeMatch) {
             // 如果有解析接口，可以在这里处理，或者直接返回原链接让播放器嗅探
             // 这里简单返回原链接，利用播放器的嗅探能力
             return JSON.stringify({
                parse: 1, // 1 表示交给播放器去嗅探
                url: id,
                header: headers
            });
        }

        // 4. 兜底方案：返回原链接，开启嗅探
        return JSON.stringify({
            parse: 1,
            url: id,
            header: headers
        });

    } catch (e) {
        return JSON.stringify({ parse: 0, url: '', msg: '播放解析出错' });
    }
}

export default { init, home, homeVod, category, detail, search, play };
