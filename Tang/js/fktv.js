const host = 'https://fktv.me';

const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// ========== 替换为系统原生标准 Base64（双平台100%兼容） ==========
function base64Encode(text) {
    try {
        return btoa(unescape(encodeURIComponent(text)));
    } catch (e) {
        return "";
    }
}

function base64Decode(str) {
    try {
        return decodeURIComponent(escape(atob(str)));
    } catch (e) {
        return "";
    }
}

function generateCookie() {
    const t = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz102345678";
    let n = "";
    for (let i = 0; i < 32; i++) {
        n += t.charAt(Math.floor(Math.random() * t.length));
    }
    return `_did=${n}`;
}

function getProxyUrl(imgUrl) {
    if (!imgUrl) return "";
    const enc = base64Encode(encodeURIComponent(imgUrl));
    return `proxy://do=fktv_img&url=${enc}`;
}

// ========== 标准接口（Fongmi 严格兼容版） ==========
async function init(cfg) {}

async function home() {
    return JSON.stringify({
        class: [
            { type_id: '1', type_name: '电影' },
            { type_id: '2', type_name: '电视剧' },
            { type_id: '4', type_name: '动漫' },
            { type_id: '3', type_name: '综艺' },
            { type_id: '8', type_name: '短剧' },
            { type_id: '6', type_name: '纪录片' }
        ]
    });
}

async function homeVod() {
    return JSON.stringify({ list: [], page: 1, pagecount: 0 });
}

// ========== 【重点修复】分类列表（纯正则解析，绕开Fongmi解析器） ==========
async function category(tid, pg, filter, extend) {
    const page = Number(pg) || 1;
    const url = `${host}/channel?page=${page}&cat_id=${tid}&order=new&page_size=32`;
    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        let list = [];

        // 用纯正则匹配所有 item-wrap，彻底绕开 pdfa 解析器
        const items = html.match(/<div class="item-wrap[\s\S]*?<\/div>\s*<\/div>/g);
        if (items && items.length > 0) {
            list = items.map(itHtml => {
                // 提取名称
                let nameMatch = itHtml.match(/<a[^>]*title="([^"]+)"/);
                let name = nameMatch ? nameMatch[1] : "";
                
                // 提取图片地址
                let picMatch = itHtml.match(/data-src="([^"]+)"/);
                let pic = picMatch ? getProxyUrl(picMatch[1]) : "";

                // 提取备注
                let remarkMatch = itHtml.match(/<div class="category[^>]*>([^<]+)<\/div>/);
                let remark = remarkMatch ? remarkMatch[1].trim() : "";

                // 提取 vod_id
                let idMatch = itHtml.match(/<a[^>]*href="([^"]+)"/);
                let id = idMatch ? idMatch[1] : "";

                // 【关键兜底】如果代理图片失效，用占位图，保证列表项能渲染出来
                if (!pic) {
                    pic = `https://via.placeholder.com/300x450/333/fff?text=${encodeURIComponent(name || "无图")}`;
                }

                return {
                    vod_name: name,
                    vod_pic: pic,
                    vod_remarks: remark,
                    vod_id: id
                };
            }).filter(item => item.vod_name && item.vod_id);
        }

        return JSON.stringify({
            page: page,
            pagecount: 99,
            list: list
        });
    } catch (e) {
        return JSON.stringify({ page: 1, pagecount: 0, list: [] });
    }
}

function extractLinesAndEpisodes(html, vodId) {
    // 提取线路名：匹配 data-line 属性对应的 div 内容
    const lineRegex = /<div[^>]*data-line="([^"]+)"[^>]*>([^<]+)<\/div>/g;
    let lines = [];
    let match;
    while ((match = lineRegex.exec(html)) !== null) {
        lines.push({ id: match[1], name: match[2].trim() });
    }
    // 如果没有 data-line，尝试匹配 .play-source
    if (lines.length === 0) {
        const altLineRegex = /<div[^>]*class="[^"]*play-source[^"]*"[^>]*>([^<]+)<\/div>/g;
        while ((match = altLineRegex.exec(html)) !== null) {
            lines.push({ id: `line${lines.length+1}`, name: match[1].trim() });
        }
    }

    // 提取所有集数：匹配 data-id 和集数名称
    const epRegex = /<div[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*number[^"]*"[^>]*>([^<]+)<\/span>/g;
    let episodes = [];
    while ((match = epRegex.exec(html)) !== null) {
        episodes.push({ id: match[1], name: match[2].trim() });
    }

    // 如果集数没匹配到，尝试更宽松的匹配
    if (episodes.length === 0) {
        const altEpRegex = /<a[^>]*href="javascript:;"[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g;
        while ((match = altEpRegex.exec(html)) !== null) {
            episodes.push({ id: match[1], name: match[2].trim() });
        }
    }

    // 构建线路和集数字符串
    let playFroms = [];
    let playUrls = [];
    for (let line of lines) {
        playFroms.push(line.name);
        let epStr = episodes.map(ep => `${ep.name}$${line.id}-${vodId}-${ep.id}`).join('#');
        playUrls.push(epStr);
    }
    // 如果没有任何线路，至少给一个默认
    if (playFroms.length === 0 && episodes.length > 0) {
        playFroms.push('默认线路');
        let epStr = episodes.map(ep => `${ep.name}$${vodId}-${ep.id}`).join('#');
        playUrls.push(epStr);
    }

    return {
        vod_play_from: playFroms.join('$$$'),
        vod_play_url: playUrls.join('$$$')
    };
}

// ========== 【精准提取版】Detail 函数 ==========
async function detail(id) {
    const vodId = Array.isArray(id) ? id[0] : id;
    if (!vodId) return JSON.stringify({ list: [] });

    try {
        let url = vodId.startsWith('http') ? vodId : `${host}${vodId}`;
        const res = await req(url, { headers: headers, timeout: 10000 });
        const html = res.content || '';

        // --- 1. 提取基础信息 ---
        let vod_name = "未知影片";
        const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        if (nameMatch) vod_name = nameMatch[1].trim();

        let vod_pic = "";
        const picMatch = html.match(/data-src="([^"]+)"/) || html.match(/poster="([^"]+)"/);
        if (picMatch) vod_pic = getProxyUrl(picMatch[1]);
        else vod_pic = `https://via.placeholder.com/300x450/333/fff?text=${encodeURIComponent(vod_name)}`;

        let vod_content = "";
        const contentMatch = html.match(/class="desc"[^>]*>([\s\S]*?)<\/div>/);
        if (contentMatch) vod_content = contentMatch[1].replace(/<[^>]+>/g, '').trim();

        // --- 2. 调用核心解析函数（线路+集数）---
        const { vod_play_from, vod_play_url } = extractLinesAndEpisodes(html, vodId);

        // --- 3. 返回结果 ---
        return JSON.stringify({
            list: [{
                vod_id: vodId,
                vod_name: vod_name,
                vod_pic: vod_pic,
                vod_content: vod_content,
                vod_play_from: vod_play_from,
                vod_play_url: vod_play_url
            }]
        });

    } catch (err) {
        console.error("Detail Error:", err);
        return JSON.stringify({ list: [] });
    }
}

// ========== 【最终修复版】主动请求API获取m3u8地址 ==========
async function play(flag, id, flags) {
    // 重要：这里的 id 正是你在 detail 函数里构造的格式（例如 "line1-/movie/detail/xxx-6c5ad..."）
    // 第一步：解析出我们需要的关键信息
    let lineId, vodId, epId;
    const parts = id.split('$');
    // 你目前的 detail 函数构造的 id 可能没有 '$'，所以这里提供两种解析方式，确保兼容
    let identifier = parts.length > 1 ? parts[1] : id;
    const dashParts = identifier.split('-');
    
    if (dashParts.length >= 3) {
        // 标准格式：lineId-vodId-epId
        lineId = dashParts[0];
        vodId = dashParts[1];
        epId = dashParts[2];
    } else if (dashParts.length === 2) {
        // 备选格式：vodId-epId
        lineId = 'default';
        vodId = dashParts[0];
        epId = dashParts[1];
    } else {
        // 降级处理
        vodId = identifier;
        epId = '1';
        lineId = 'default';
    }

    // 第二步：请求播放详情页，获取真实的播放地址
    const detailUrl = `${host}${vodId}`;
    const body = `link_id=${epId}&is_switch=1`;

    try {
        // 用 POST 方法，带着正确的 Cookie 和 Referer 去请求
        const res = await req(detailUrl, {
            method: 'POST',
            headers: {
                "Content-Type": 'application/x-www-form-urlencoded; charset=UTF-8',
                "Referer": detailUrl,
                "Cookie": generateCookie(), // 别忘了你的Cookie生成函数
                "User-Agent": headers["User-Agent"]
            },
            body: body
        });
        
        const response = JSON.parse(res.content);
        let m3u8Url = null;
        
        // 第三步：从返回的 JSON 数据里提取 m3u8 地址
        if (response.data && response.data.play_links) {
            if (lineId !== 'default') {
                const link = response.data.play_links.find(i => i.id == lineId);
                if (link) m3u8Url = link.m3u8_url;
            } else if (response.data.play_links.length > 0) {
                m3u8Url = response.data.play_links[0].m3u8_url;
            }
        }
        
        // 第四步：成功拿到地址，直接返回给播放器
        if (m3u8Url) {
            const fullUrl = m3u8Url.startsWith('http') ? m3u8Url : `${host}${m3u8Url}`;
            return JSON.stringify({ parse: 0, url: fullUrl });
        } else {
            // 如果没拿到，退一步让播放器自己去页面上嗅探
            return JSON.stringify({ parse: 1, url: detailUrl });
        }
    } catch (e) {
        // 报错时也尝试用嗅探兜底
        return JSON.stringify({ parse: 1, url: detailUrl });
    }
}


// ========== 【重点修复】搜索函数（和分类一样改用纯正则） ==========
async function search(wd, quick, pg) {
    const page = Number(pg) || 1;
    const url = `${host}/channel?page=${page}&keywords=${encodeURIComponent(wd)}&page_size=32&order=new`;
    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        let list = [];

        const items = html.match(/<div class="item-wrap[\s\S]*?<\/div>\s*<\/div>/g);
        if (items && items.length > 0) {
            list = items.map(itHtml => {
                let nameMatch = itHtml.match(/<a[^>]*title="([^"]+)"/);
                let name = nameMatch ? nameMatch[1] : "";
                
                let picMatch = itHtml.match(/data-src="([^"]+)"/);
                let pic = picMatch ? getProxyUrl(picMatch[1]) : "";

                let remarkMatch = itHtml.match(/<div class="category[^>]*>([^<]+)<\/div>/);
                let remark = remarkMatch ? remarkMatch[1].trim() : "";

                let idMatch = itHtml.match(/<a[^>]*href="([^"]+)"/);
                let id = idMatch ? idMatch[1] : "";

                if (!pic) {
                    pic = `https://via.placeholder.com/300x450/333/fff?text=${encodeURIComponent(name || "无图")}`;
                }

                return {
                    vod_name: name,
                    vod_pic: pic,
                    vod_remarks: remark,
                    vod_id: id
                };
            }).filter(item => item.vod_name && item.vod_id);
        }

        return JSON.stringify({
            page: page,
            pagecount: 99,
            list: list
        });
    } catch (e) {
        return JSON.stringify({ page: 1, pagecount: 0, list: [] });
    }
}

async function proxy(args) {
    const doWhat = args.do || "";
    if (doWhat === 'fktv_img') {
        const encUrl = args.url || "";
        const targetUrl = base64Decode(encUrl);
        if (targetUrl) {
            return ["redirect", targetUrl];
        }
    }
    return [404, "text/plain", "Not Found"];
}

export default { init, home, homeVod, category, detail, search, play, proxy };