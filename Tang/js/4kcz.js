// ============================================================
// 4kcz.com (厂长资源) - 静态解析爬虫插件（纯正则版）
// 版本: 1.1
// 说明: 不依赖 DOMParser，完全使用正则解析
// ============================================================

var host = 'https://www.4kcz.com';
var headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": host + '/'
};

// ---------- 工具函数 ----------
function abs(url) {
    if (!url) return '';
    try {
        if (url.startsWith('//')) url = 'https:' + url;
        if (/^https?:\/\//i.test(url)) return url;
        return host + (url.startsWith('/') ? url : '/' + url);
    } catch(e) { return url; }
}

function clean(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
}

function imgUrl(url) {
    if (!url) return '';
    url = abs(url);
    if (url.startsWith('//')) url = 'https:' + url;
    return url;
}

// ---------- 从 HTML 中提取所有卡片（纯正则） ----------
function extractCards(html, keyword) {
    var list = [];
    var seen = {};

    // 匹配每个 <li> 块
    var liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    var liMatch;
    while ((liMatch = liRegex.exec(html)) !== null) {
        var liHtml = liMatch[1];

        // 跳过广告/无关 li
        if (/ad|banner|slide|popup|footer/i.test(liHtml)) continue;

        // 提取链接
        var hrefMatch = liHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
        if (!hrefMatch) continue;
        var href = abs(hrefMatch[1]);
        if (!href || !href.includes('/movie/')) continue;

        // 提取图片
        var imgMatch = liHtml.match(/<img[^>]+(?:data-original|data-src|src)=["']([^"']+)["']/i);
        var image = imgMatch ? imgMatch[1] : '';

        // 提取标题
        var titleMatch = liHtml.match(/<h3[^>]*class=["'][^"']*dytit[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([^<]*)<\/a>/i);
        if (!titleMatch) {
            titleMatch = liHtml.match(/<h3[^>]*>([^<]*)<\/h3>/i);
        }
        var title = titleMatch ? clean(titleMatch[1]) : '';

        // 如果没有标题，尝试从图片 alt 取
        if (!title && imgMatch) {
            var altMatch = liHtml.match(/alt=["']([^"']+)["']/i);
            if (altMatch) title = clean(altMatch[1]);
        }

        // 提取备注
        var remark = '';
        var remarkMatch = liHtml.match(/<span[^>]*class=["'][^"']*jidi[^"']*["'][^>]*>([^<]*)<\/span>/i);
        if (!remarkMatch) {
            remarkMatch = liHtml.match(/<span[^>]*class=["'][^"']*furk[^"']*["'][^>]*>([^<]*)<\/span>/i);
        }
        if (!remarkMatch) {
            remarkMatch = liHtml.match(/<span[^>]*class=["'][^"']*hdinfo[^"']*["'][^>]*>([^<]*)<\/span>/i);
        }
        if (remarkMatch) remark = clean(remarkMatch[1]);

        // 跳过无效卡片
        if (!title) continue;

        // 关键词过滤（搜索时）
        if (keyword && keyword.length > 1) {
            var lowerTitle = title.toLowerCase();
            var lowerKw = keyword.toLowerCase();
            if (lowerTitle.indexOf(lowerKw) === -1 && remark.toLowerCase().indexOf(lowerKw) === -1) {
                continue;
            }
        }

        var key = href + title;
        if (seen[key]) continue;
        seen[key] = true;

        list.push({
            vod_id: href,
            vod_name: title,
            vod_pic: imgUrl(image),
            vod_remarks: remark || ''
        });
    }

    return list;
}

// ---------- 从详情 HTML 提取集数 ----------
function extractEpisodes(html) {
    var eps = [];
    // 匹配 .paly_list_btn 中的 a 标签
    var containerMatch = html.match(/<div[^>]*class=["'][^"']*paly_list_btn[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (!containerMatch) return eps;

    var container = containerMatch[1];
    var aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    var aMatch;
    while ((aMatch = aRegex.exec(container)) !== null) {
        var href = abs(aMatch[1]);
        var title = clean(aMatch[2]) || '播放';
        if (href) eps.push({ title: title, href: href });
    }
    return eps;
}

// ---------- 提取播放地址 ----------
function extractVideoUrl(html) {
    // 辅助：解码 HTML 实体
    function decodeHtml(str) {
        return str.replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .replace(/&#(\d+);/g, function(m, dec) { return String.fromCharCode(dec); });
    }

    // 1. 从 player_aaaa 中提取 url
    var match = html.match(/var\s+player_aaaa\s*=\s*\{[^}]*"url"\s*:\s*"([^"]+)"/i);
    if (match) {
        var url = match[1].replace(/\\\//g, '/');
        url = decodeHtml(url);   // 处理 &amp; 等

        // 尝试提取 url= 参数（无论是否 php）
        var paramMatch = url.match(/[?&]url=([^&]+)/);
        if (paramMatch) {
            var paramValue = decodeURIComponent(paramMatch[1]);
            // 如果参数值是视频地址，直接返回
            if (/^https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)/i.test(paramValue)) {
                return paramValue;
            }
        }

        // 如果本身是视频地址
        if (/^https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)/i.test(url)) {
            return url;
        }

        // 尝试 Base64 解码
        try {
            var decoded = atob(url);
            decoded = decodeHtml(decoded);
            if (/^https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)/i.test(decoded)) return decoded;
        } catch(e) {}
    }

    // 2. 直接匹配页面中的 .mp4/.m3u8 链接（含参数）
    var directMatch = html.match(/(https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)/i);
    if (directMatch) {
        var direct = decodeHtml(directMatch[1]);
        var paramMatch2 = direct.match(/[?&]url=([^&]+)/);
        if (paramMatch2) {
            var paramValue2 = decodeURIComponent(paramMatch2[1]);
            if (/^https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)/i.test(paramValue2)) {
                return paramValue2;
            }
        }
        return direct;
    }

    // 3. iframe 中的 url 参数
    var iframeMatch = html.match(/<iframe[^>]+src=["'][^"']*[?&]url=([^&"']+)/i);
    if (iframeMatch) {
        try {
            var iframeUrl = decodeURIComponent(iframeMatch[1]);
            iframeUrl = decodeHtml(iframeUrl);
            if (/^https?:\/\//i.test(iframeUrl) && /\.(?:mp4|m3u8)/i.test(iframeUrl)) {
                return iframeUrl;
            }
        } catch(e) {}
    }

    return null;
}

// ---------- 提取详情页信息 ----------
function extractDetail(html) {
    var title = '';
    var titleMatch = html.match(/<h3[^>]*class=["'][^"']*dy_tit_big[^"']*["'][^>]*>([^<]*)<var>/i);
    if (titleMatch) {
        title = clean(titleMatch[1]);
    } else {
        titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) title = clean(titleMatch[1].replace(/ - 厂长资源.*$/, ''));
    }
    if (!title) title = '未知影片';

    // 海报
    var pic = '';
    var picMatch = html.match(/<div[^>]*class=["'][^"']*dyimg[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
    if (picMatch) pic = picMatch[1];

    // 简介
    var desc = '';
    var descMatch = html.match(/<div[^>]*class=["'][^"']*yp_context[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) {
        desc = clean(descMatch[1].replace(/<[^>]+>/g, '')).replace(/更多电影$/, '');
    }
    if (!desc) desc = '暂无简介';
    if (desc.length > 500) desc = desc.slice(0, 500) + '…';

    // 字段
    var fields = [];
    var liRegex = /<li>([\s\S]*?)<\/li>/gi;
    var liMatch;
    while ((liMatch = liRegex.exec(html)) !== null) {
        var text = clean(liMatch[1].replace(/<[^>]+>/g, ''));
        if (text) fields.push(text);
    }

    // 集数
    var eps = extractEpisodes(html);

    return {
        title: title,
        pic: imgUrl(pic),
        desc: desc,
        fields: fields,
        eps: eps
    };
}

// ============================================================
// FongMi 标准接口
// ============================================================

async function init(extend) {}

async function home(filter) {
    var classes = [
        { type_id: 'dbtop250', type_name: '豆瓣Top250' },
        { type_id: 'zuixindianying', type_name: '最新电影' },
        { type_id: 'dongmanjuchangban', type_name: '剧场版' },
        { type_id: 'gcj', type_name: '国产剧' },
        { type_id: 'meijutt', type_name: '美剧' },
        { type_id: 'hanjutv', type_name: '韩剧' },
        { type_id: 'fanju', type_name: '番剧' }
    ];
    return JSON.stringify({ class: classes });
}

async function homeVod() {
    try {
        var resp = await req(host + '/', { headers: headers });
        var html = (resp.content || resp.body || resp || '').toString();
        var list = extractCards(html);
        if (list.length > 20) list = list.slice(0, 20);
        return JSON.stringify({ list: list });
    } catch(e) {
        return JSON.stringify({ list: [] });
    }
}

async function category(tid, pg, filter, extend) {
    try {
        var page = parseInt(pg) || 1;
        var url = host + '/' + tid;
        if (page > 1) url += '/page/' + page;

        var resp = await req(url, { headers: headers });
        var html = (resp.content || resp.body || resp || '').toString();
        var list = extractCards(html);

        // 提取总页数（从分页中）
        var pageCount = page;
        var pageMatch = html.match(/class=["'][^"']*page-link[^"']*["'][^>]*>(\d+)<\/a>\s*<a[^>]*class=["'][^"']*page-link[^"']*["'][^>]*>/i);
        if (pageMatch) {
            var pages = parseInt(pageMatch[1]);
            if (pages > pageCount) pageCount = pages;
        }
        // 尝试从"尾页"提取
        var lastMatch = html.match(/尾页<\/a>\s*<a[^>]*href=["'][^"']*\/page\/(\d+)/i);
        if (lastMatch) {
            var lastPage = parseInt(lastMatch[1]);
            if (lastPage > pageCount) pageCount = lastPage;
        }

        return JSON.stringify({ list: list, page: page, pagecount: pageCount });
    } catch(e) {
        return JSON.stringify({ list: [], page: parseInt(pg)||1, pagecount: 1 });
    }
}

async function detail(id) {
    try {
        var url = abs(id);
        var resp = await req(url, { headers: headers });
        var html = (resp.content || resp.body || resp || '').toString();

        var info = extractDetail(html);

        var vod = {
            vod_id: url,
            vod_name: info.title,
            vod_pic: info.pic,
            vod_content: info.desc,
            vod_play_from: '厂长资源',
            vod_play_url: info.eps.map(function(ep) {
                return ep.title + '$' + ep.href;
            }).join('#'),
            vod_remarks: info.fields.join(' | ') || ''
        };
        return JSON.stringify({ list: [vod] });
    } catch(e) {
        return JSON.stringify({ list: [] });
    }
}

async function search(wd, quick, pg) {
    try {
        var page = parseInt(pg) || 1;
        var url = host + '/boss1O1?q=' + encodeURIComponent(wd);
        // 搜索可能没有分页，但保留
        if (page > 1) url += '&page=' + page;

        var resp = await req(url, { headers: headers });
        var html = (resp.content || resp.body || resp || '').toString();
        var list = extractCards(html, wd);

        return JSON.stringify({ list: list, page: page, pagecount: 99 });
    } catch(e) {
        return JSON.stringify({ list: [], page: parseInt(pg)||1, pagecount: 1 });
    }
}

async function play(flag, id, flags) {
    try {
        var playUrl = abs(id);
        var resp = await req(playUrl, { headers: headers });
        var html = (resp.content || resp.body || resp || '').toString();

        var videoUrl = extractVideoUrl(html);
        if (videoUrl) {
            return JSON.stringify({
                parse: 0,
                url: videoUrl,
                header: headers
            });
        }

        // 尝试 iframe 递归
        var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            var iframeSrc = iframeMatch[1];
            if (iframeSrc.startsWith('/')) {
                var base = new java.net.URL(playUrl);
                iframeSrc = base.getProtocol() + '://' + base.getHost() + iframeSrc;
            }
            var iframeResp = await req(iframeSrc, { headers: headers });
            var iframeHtml = (iframeResp.content || iframeResp.body || iframeResp || '').toString();
            var iframeUrl = extractVideoUrl(iframeHtml);
            if (iframeUrl) {
                return JSON.stringify({
                    parse: 0,
                    url: iframeUrl,
                    header: headers
                });
            }
        }

        // 降级：让 App 内置嗅探处理
        return JSON.stringify({
            parse: 1,
            url: playUrl,
            header: headers
        });
    } catch(e) {
        return JSON.stringify({
            parse: 1,
            url: playUrl || '',
            header: headers
        });
    }
}

async function proxy(args) {
    return [404, 'text/plain', 'Not Found'];
}

export default { init, home, homeVod, category, detail, search, play, proxy };