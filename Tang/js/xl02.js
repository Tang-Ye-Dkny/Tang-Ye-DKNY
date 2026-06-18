// ============================================================
// 雪落影视 (xl02.com.de) - 嗅探模式（带高级分类导航菜单版）
// 功能：分类（支持类型/地区/年份/排序）、搜索、详情、播放（嗅探）
// ============================================================

const host = 'https://xl02.com.de';
const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": host + '/',
    "Cookie": "JSESSIONID=08462C624718E8197AEACE7CB5AD34CA; gg_iscookie=1; gg_show_number6197=1"
};

function getProxyUrl(imgUrl) {
    if (!imgUrl) return "";
    return imgUrl;
}

async function home() {
    // 1. 从抓包数据中提取并整理的完整“影视类型”映射表
    const classes = [
        { n: "不限", v: "all" }, { n: "动作", v: "dongzuo" }, { n: "爱情", v: "aiqing" }, { n: "喜剧", v: "xiju" },
        { n: "科幻", v: "kehuan" }, { n: "恐怖", v: "kongbu" }, { n: "战争", v: "zhanzheng" }, { n: "武侠", v: "wuxia" },
        { n: "魔幻", v: "mohuan" }, { n: "剧情", v: "juqing" }, { n: "动画", v: "donghua" }, { n: "惊悚", v: "jingsong" },
        { n: "3D", v: "3D" }, { n: "灾难", v: "zainan" }, { n: "悬疑", v: "xuanyi" }, { n: "警匪", v: "jingfei" },
        { n: "文艺", v: "wenyi" }, { n: "青春", v: "qingchun" }, { n: "冒险", v: "maoxian" }, { n: "犯罪", v: "fanzui" },
        { n: "纪录", v: "jilu" }, { n: "古装", v: "guzhuang" }, { n: "奇幻", v: "qihuan" }, { n: "国语", v: "guoyu" },
        { n: "综艺", v: "zongyi" }, { n: "历史", v: "lishi" }, { n: "运动", v: "yundong" }, { n: "原创压制", v: "yuanchuang" },
        { n: "美剧", v: "meiju" }, { n: "韩剧", v: "hanju" }, { n: "国产电视剧", v: "guoju" }, { n: "日剧", v: "riju" },
        { n: "英剧", v: "yingju" }, { n: "德剧", v: "deju" }, { n: "俄剧", v: "eju" }, { n: "巴剧", v: "baju" },
        { n: "加剧", v: "jiaju" }, { n: "西剧", v: "spanish" }, { n: "意大利剧", v: "yidaliju" }, { n: "泰剧", v: "taiju" },
        { n: "港台剧", v: "gangtaiju" }, { n: "法剧", v: "faju" }, { n: "澳剧", v: "aoju" }, { n: "短剧", v: "duanju" }
    ];

    // 2. 从抓包数据中整理的“制片地区”
    const areaList = ["不限", "中国大陆", "中国香港", "中国台湾", "美国", "英国", "日本", "韩国", "法国", "印度", "德国", "西班牙", "意大利", "澳大利亚", "比利时", "瑞典", "荷兰", "丹麦", "加拿大", "俄罗斯"];
    const areas = areaList.map(a => ({ n: a, v: a === "不限" ? "" : a }));

    // 3. 动态生成从 2026 到 2002 的“上映时间”
    const years = [{ n: "不限", v: "" }];
    for (let y = 2026; y >= 2002; y--) {
        years.push({ n: y.toString(), v: y.toString() });
    }

    // 4. 从抓包数据中整理的“影视排序”
    const orders = [
        { n: "更新时间", v: "0" },
        { n: "豆瓣评分", v: "1" }
    ];

    // 组合成符合 TVBox/Fongmi 规范的过滤器数组
    const filterTemplate = [
        { key: "class", name: "类型", value: classes },
        { key: "area", name: "地区", value: areas },
        { key: "year", name: "年份", value: years },
        { key: "order", name: "排序", value: orders }
    ];

    return JSON.stringify({
        class: [
            { type_id: '0', type_name: '电影' },
            { type_id: '1', type_name: '剧集' }
        ],
        filters: {
            "0": filterTemplate,
            "1": filterTemplate
        }
    });
}

async function homeVod() {
    return JSON.stringify({ list: [] });
}

// ---------- 分类（重构后：全面支持高级筛选导航） ----------
async function category(tid, pg, filter, extend) {
    const page = Number(pg) || 1;
    
    // 获取用户在界面中选中的筛选值，如果未选则使用默认值
    const typePath = (extend && extend.class) ? extend.class : 'all';
    
    // 基础 URL 结构：主域名 + /s/类型路径 + ?type=分类ID + &page=页码
    let url = `${host}/s/${typePath}?type=${tid}&page=${page}`;
    
    // 动态拼接其他筛选参数
    if (extend) {
        if (extend.area) url += `&area=${encodeURIComponent(extend.area)}`;
        if (extend.year) url += `&year=${extend.year}`;
        if (extend.order) url += `&order=${extend.order}`;
    }

    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        const cardRegex = /<div class="movie-card">([\s\S]*?)<\/div>\s*<\/div>/g;
        const list = [];
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            const cardHtml = match[1];
            const titleMatch = cardHtml.match(/title="([^"]+)"/);
            const hrefMatch = cardHtml.match(/href="([^"]+)"/);
            const imgMatch = cardHtml.match(/data-src="([^"]+)"/);
            const badgeMatch = cardHtml.match(/<div class="episode-badge">([^<]+)<\/div>/);
            if (titleMatch && hrefMatch) {
                let title = titleMatch[1];
                const nameMatch = title.match(/《([^》]+)》/);
                if (nameMatch) title = nameMatch[1];
                let href = hrefMatch[1];
                if (!href.startsWith('http')) href = host + href;
                let pic = imgMatch ? imgMatch[1] : '';
                let remarks = badgeMatch ? badgeMatch[1] : '';
                list.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: getProxyUrl(pic),
                    vod_remarks: remarks
                });
            }
        }
        return JSON.stringify({ list, page, pagecount: 99 });
    } catch (e) {
        console.error('分类请求失败:', e);
        return JSON.stringify({ list: [], page, pagecount: 0 });
    }
}

// ---------- 搜索 ----------
async function search(wd, quick, pg) {
    const page = Number(pg) || 1;
    const url = `${host}/s/all?keyword=${encodeURIComponent(wd)}&page=${page}`;
    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        const cardRegex = /<div class="movie-card">([\s\S]*?)<\/div>\s*<\/div>/g;
        const list = [];
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            const cardHtml = match[1];
            const titleMatch = cardHtml.match(/title="([^"]+)"/);
            const hrefMatch = cardHtml.match(/href="([^"]+)"/);
            const imgMatch = cardHtml.match(/data-src="([^"]+)"/);
            const badgeMatch = cardHtml.match(/<div class="episode-badge">([^<]+)<\/div>/);
            if (titleMatch && hrefMatch) {
                let title = titleMatch[1];
                const nameMatch = title.match(/《([^》]+)》/);
                if (nameMatch) title = nameMatch[1];
                let href = hrefMatch[1];
                if (!href.startsWith('http')) href = host + href;
                let pic = imgMatch ? imgMatch[1] : '';
                let remarks = badgeMatch ? badgeMatch[1] : '';
                list.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: getProxyUrl(pic),
                    vod_remarks: remarks
                });
            }
        }
        return JSON.stringify({ list, page, pagecount: 99 });
    } catch (e) {
        return JSON.stringify({ list: [], page, pagecount: 0 });
    }
}

// ========== detail 函数 ==========
async function detail(id) {
    const vodId = Array.isArray(id) ? id[0] : id;
    if (!vodId) return JSON.stringify({ list: [] });

    let url = vodId.startsWith('http') ? vodId : host + (vodId.startsWith('/') ? vodId : '/' + vodId);

    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        if (!html) return JSON.stringify({ list: [] });

        let vod_name = '';
        const titleMatch = html.match(/<h1[^>]*class="[^"]*movie-title[^"]*"[^>]*>([^<]+)<\/h1>/);
        if (titleMatch) {
            vod_name = titleMatch[1].replace(/\s*\([^)]*\)\s*$/, '').trim(); 
        }
        if (!vod_name) {
            const titleTagMatch = html.match(/<title>(.*?)<\/title>/);
            if (titleTagMatch) {
                let fullTitle = titleTagMatch[1];
                fullTitle = fullTitle.replace(/\s*[-|]\s*雪落影视.*$/, '').trim();
                const showMatch = fullTitle.match(/《([^》]+)》/);
                if (showMatch) {
                    vod_name = showMatch[1];
                } else {
                    vod_name = fullTitle.replace(/\s*第[0-9]+集.*$/, '').trim();
                }
            }
        }
        if (!vod_name) {
            const idNumMatch = vodId.match(/(\d+)/);
            vod_name = idNumMatch ? `影片 ${idNumMatch[1]}` : '未知影片';
        }

        let vod_pic = '';
        const picMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
        if (picMatch) vod_pic = picMatch[1];
        if (!vod_pic) {
            const imgMatch = html.match(/<img[^>]*class="[^"]*movie-poster[^"]*"[^>]*src="([^"]+)"/);
            if (imgMatch) vod_pic = imgMatch[1];
        }
        if (vod_pic && !vod_pic.startsWith('http')) vod_pic = host + vod_pic;

        let vod_content = '';
        const descMatch = html.match(/<div[^>]*class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        if (descMatch) vod_content = descMatch[1].replace(/<[^>]+>/g, '').trim();

        let episodes = [];
        const listContainer = html.match(/<div[^>]*class="[^"]*play-wrapper[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*play-list[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        if (listContainer) {
            const aRegex = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
            let match;
            while ((match = aRegex.exec(listContainer[1])) !== null) {
                let href = match[1];
                let title = match[2].trim();
                if (!href.startsWith('http')) href = host + href;
                episodes.push({ title, href });
            }
        }

        if (episodes.length === 0) {
            const allLinks = html.match(/<a[^>]*href="([^"]*\/play\/[^"]+)"[^>]*>([^<]+)<\/a>/g);
            if (allLinks) {
                allLinks.forEach(link => {
                    const hrefMatch = link.match(/href="([^"]+)"/);
                    const textMatch = link.match(/>([^<]+)</);
                    if (hrefMatch && textMatch) {
                        let href = hrefMatch[1];
                        let title = textMatch[1].trim();
                        if (!href.startsWith('http')) href = host + href;
                        episodes.push({ title, href });
                    }
                });
            }
        }

        if (episodes.length === 0) {
            episodes.push({ title: '第1集', href: url });
        }

        const playFroms = ['默认线路'];
        const episodeUrls = episodes.map(ep => `${ep.title}$${ep.href}`).join('#');
        const playUrls = [episodeUrls];

        const vod = {
            vod_id: vodId,
            vod_name: vod_name,
            vod_pic: vod_pic,
            vod_content: vod_content,
            vod_play_from: playFroms.join('$$$'),
            vod_play_url: playUrls.join('$$$'),
            type_name: '',
            vod_year: '',
            vod_actor: '',
            vod_remarks: ''
        };

        return JSON.stringify({ list: [vod] });
    } catch (e) {
        console.error('Detail Error:', e);
        return JSON.stringify({ list: [] });
    }
}

// ---------- 播放（嗅探模式） ----------
async function play(flag, id, flags) {
    const parts = id.split('$');
    if (parts.length < 2) return JSON.stringify({ parse: 1, url: id });
    const playUrl = parts[1];
    
    // 默认给播放器一套干净的移动端 Header，专门对付网盘和 CDN
    let playHeader = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 11; TVBox) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
        "Accept": "*/*",
        "Connection": "keep-alive"
    };

    // 如果发现是网站自己的自建源（非外链），则带上原站 Referer 规避检测
    if (playUrl.includes('xl02.com.de') && !playUrl.includes('url=')) {
        playHeader["Referer"] = host + '/';
    }

    return JSON.stringify({
        parse: 1,
        url: playUrl,
        header: playHeader
    });
}

async function proxy(args) {
    return [404, "text/plain", "Not Found"];
}

export default { init: async () => {}, home, homeVod, category, search, detail, play, proxy };