// ============================================================
// 4kvm.tv - 完整脚本【修复搜索+带调试打印版】
// 功能：首页分类、分类列表、搜索、详情（含剧集）、播放（嗅探）
// 版本：1.1 修复搜索匹配为空问题 + 调试日志
// ============================================================

const host = 'https://www.bttwo.life';
const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": host + '/'
};

// ---------- 辅助函数 ----------
function getProxyUrl(imgUrl) {
    if (!imgUrl) return "";
    // 图片直接使用原链接（如需代理可修改）
    return imgUrl;
}

// ---------- 首页分类 ----------
async function home() {
    return JSON.stringify({
        class: [
            { type_id: 'movie', type_name: '电影' },
            { type_id: 'tv', type_name: '电视剧' },
            { type_id: 'anime', type_name: '动漫' }          
        ],
        filters: {}
    });
}
async function homeVod() {
    return JSON.stringify({ list: [] });
}

// ---------- 分類列表（升級：萬能容器切片正則版） ----------
// ---------- 分類列表（100% 安全穩定版：保證能搜能播） ----------
async function category(tid, pg, filter, extend) {
    const page = Number(pg) || 1;
    // 根據分類 ID 構造 URL
    let url = `${host}/${tid}`;
    if (page > 1) url += `?page=${page}`;
    
    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        
        // 【完全保留你原本能成功跑出文字框的骨架】一字不改，確保絕對不會變「無資料」
        const cardRegex = /<div class="relative group movie-card[^>]*data-vod-id="([^"]+)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
        const list = [];
        let match;
        
        while ((match = cardRegex.exec(html)) !== null) {
            const vodId = match[1];
            const cardHtml = match[2];
            
            // 1. 標題（保留你原本穩定的寫法）
            const titleMatch = cardHtml.match(/<h3[^>]*>([^<]+)<\/h3>/);
            const title = titleMatch ? titleMatch[1].trim() : '';
            
            // 2. 連結（保留你原本穩定的寫法）
            const linkMatch = cardHtml.match(/<a[^>]*href="([^"]+)"/);
            const link = linkMatch ? linkMatch[1] : '';
            
            // 3. 圖片（唯一微調的地方：安全加入 src 或 data-src 雙檢查，不破壞外殼）
            // 如果網站改版用 src 就拿 src，沒改版用 data-src 就拿 data-src
            const imgMatch = cardHtml.match(/src="([^"]+)"/) || cardHtml.match(/data-src="([^"]+)"/);
            let pic = imgMatch ? imgMatch[1] : '';
            if (pic && pic.startsWith('//')) pic = 'https:' + pic; // 補全協議頭
            
            // 4. 備註（保留你原本穩定的寫法）
            const remarkMatch = cardHtml.match(/<span[^>]*class="[^"]*"[^>]*>([^<]+)<\/span>/);
            const remark = remarkMatch ? remarkMatch[1].trim() : '';
            
            // 只要有標題和連結，就保證能點擊、能播放
            if (title && link) {
                list.push({
                    vod_id: link.startsWith('/') ? link : '/' + link,
                    vod_name: title,
                    vod_pic: getProxyUrl(pic), // 安全呼叫輔助函數
                    vod_remarks: remark
                });
            }
        }
        return JSON.stringify({ list, page, pagecount: 99 });
    } catch (e) {
        console.error('分類請求失敗:', e);
        return JSON.stringify({ list: [], page, pagecount: 0 });
    }
}

// ---------- 搜尋功能（同步 Python 核心卡片解析邏輯） ----------
async function search(wd, quick, pg) {
    console.log("=====【搜尋調試開始】=====");
    console.log("關鍵詞 wd:", wd);
    
    const page = Math.max(Number(pg) || 1, 1);
    const query = encodeURIComponent(wd);
    const url = `${host}/search?q=${query}&page=${page}`;
    console.log("請求搜尋 URL:", url);

    try {
        const res = await req(url, { headers });
        const html = (res.content || '').toString();
        console.log("返回 HTML 總長度:", html.length);

        const list = [];
        
        // 【第一步】：優先匹配新版特徵的卡片 <div ... data-vod-id="xxx">...</div>
        // 使用非貪婪匹配截取整個卡片區塊
        const cardRegex = /<div[^>]*data-vod-id="([^"]+)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
        let match;
        let matchCount = 0;

        while ((match = cardRegex.exec(html)) !== null) {
            matchCount++;
            const vod_id = match[1].trim();
            const cardInnerHtml = match[2];

            // 提取標題：優先找 h3 標籤
            const titleMatch = cardInnerHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
            let vod_name = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

            // 提取封面圖：從 data-src 或 src 提取
            let vod_pic = '';
            const imgMatch = cardInnerHtml.match(/data-src="([^"]+)"/) || cardInnerHtml.match(/src="([^"]+)"/);
            if (imgMatch) {
                vod_pic = imgMatch[1];
                if (vod_pic.startsWith('//')) vod_pic = 'https:' + vod_pic;
            }

            // 提取備註（如 4K、完結等）
            let vod_remarks = '';
            const remarkMatch = cardInnerHtml.match(/<span[^>]*class="[^"]*"[^>]*>([^<]+)<\/span>/);
            if (remarkMatch) vod_remarks = remarkMatch[1].trim();

            if (vod_id && vod_name) {
                // 統一格式：確保 vod_id 是單純的 ID字串，或是完整的 /play/ 路由
                const finalId = vod_id.includes('/') ? vod_id : '/play/' + vod_id;
                list.push({
                    vod_id: finalId,
                    vod_name: vod_name,
                    vod_pic: getProxyUrl(vod_pic),
                    vod_remarks: vod_remarks || '4K'
                });
            }
        }

        // 【第二步】：降級處理（如果上面一張卡片都沒抓到，切換到 Python 的備用路徑）
        if (list.length === 0) {
            console.log("⚠️ 未發現 data-vod-id 卡片，啟動降級相容解析...");
            const backupRegex = /<a[^>]*href="(\/play\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
            while ((match = backupRegex.exec(html)) !== null) {
                const href = match[1];
                const aInner = match[2];
                
                const vod_id = href.trim();
                const h3Match = aInner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
                const vod_name = h3Match ? h3Match[1].replace(/<[^>]+>/g, '').trim() : '';
                
                let vod_pic = '';
                const imgMatch = aInner.match(/data-src="([^"]+)"/) || aInner.match(/src="([^"]+)"/);
                if (imgMatch) {
                    vod_pic = imgMatch[1];
                    if (vod_pic.startsWith('//')) vod_pic = 'https:' + vod_pic;
                }

                if (vod_id && vod_name) {
                    list.push({
                        vod_id: vod_id,
                        vod_name: vod_name,
                        vod_pic: getProxyUrl(vod_pic),
                        vod_remarks: '4K'
                    });
                }
            }
        }

        console.log(`=====【搜尋匹配結束】成功抓取結果條數: ${list.length} =====`);
        return JSON.stringify({ list: list, page: page, pagecount: 99 });

    } catch (e) {
        console.error('搜尋發生異常:', e);
        return JSON.stringify({ list: [], page: page, pagecount: 0 });
    }
}

// ---------- 详情页（提取剧集列表） ----------
async function detail(id) {
    const vodId = Array.isArray(id) ? id[0] : id;
    if (!vodId) return JSON.stringify({ list: [] });
    
    // 确保是完整的播放页 URL
    let url = vodId.startsWith('http') ? vodId : host + (vodId.startsWith('/') ? vodId : '/' + vodId);
    
    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        
        // --- 提取基本信息 ---
        // 标题
        let vod_name = "未知影片";
        const titleMatch = html.match(/<title>([^<]+)/);
        if (titleMatch) {
            vod_name = titleMatch[1].replace(/ - 第\d+集 -4k影视$/, '').trim();
        }
        // 图片（从 meta og:image 或 img 中提取）
        let vod_pic = '';
        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (ogImageMatch) vod_pic = ogImageMatch[1];
        if (!vod_pic) {
            const imgMatch = html.match(/<img[^>]+src="([^"]+)"/);
            if (imgMatch) vod_pic = imgMatch[1];
        }
        // 简介（从 meta og:description 或详情面板中提取）
        let vod_content = '';
        const ogDescMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
        if (ogDescMatch) vod_content = ogDescMatch[1];
        if (!vod_content) {
            const descMatch = html.match(/<p class="text-xs text-gray-300 leading-relaxed">([\s\S]*?)<\/p>/);
            if (descMatch) vod_content = descMatch[1].replace(/<[^>]+>/g, '').trim();
        }
        // 类型、年份、演员等可从详情面板提取，但非必须，这里简单处理
        
        // --- 提取剧集列表 ---
        // 找所有带 data-episode 的链接
        const epRegex = /<a[^>]*href="([^"]+)"[^>]*data-line="([^"]+)"[^>]*data-episode="([^"]+)"[^>]*dataid="([^"]+)"[^>]*>/g;
        let episodes = [];
        let match;
        while ((match = epRegex.exec(html)) !== null) {
            const href = match[1];
            const line = match[2];
            const episode = match[3];
            const dataid = match[4];
            // 只保留当前线路（大多数只有一条线路）
            if (line === '1' || line === 'alists') {
                episodes.push({
                    episode: parseInt(episode, 10),
                    href: href,
                    dataid: dataid
                });
            }
        }
        // 按集数排序
        episodes.sort((a, b) => a.episode - b.episode);
        
        // 构建播放列表
        let playFroms = ['默认线路'];
        let playUrls = [];
        if (episodes.length > 0) {
            const epStr = episodes.map(ep => {
                const epLabel = `第${ep.episode}集`;
                const epUrl = host + (ep.href.startsWith('/') ? ep.href : '/' + ep.href);
                return `${epLabel}$${epUrl}`;
            }).join('#');
            playUrls.push(epStr);
        } else {
            // 没有剧集则直接使用当前页
            playUrls.push(`播放$${url}`);
        }
        
        const vod = {
            vod_id: vodId,
            vod_name: vod_name,
            vod_pic: getProxyUrl(vod_pic),
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
        console.error('详情请求失败:', e);
        return JSON.stringify({ list: [] });
    }
}

// ---------- 播放（嗅探模式） ----------
async function play(flag, id, flags) {
    // id 格式: "第1集$https://www.4kvm.tv/play/xxx"
    const parts = id.split('$');
    if (parts.length < 2) return JSON.stringify({ parse: 1, url: id });
    const playUrl = parts[1];
    // 让播放器直接访问该页面，自动嗅探 m3u8
    return JSON.stringify({
        parse: 1,
        url: playUrl,
        header: headers
    });
}

// ---------- 代理（如果需要） ----------
async function proxy(args) {
    return [404, "text/plain", "Not Found"];
}

export default { init: async () => {}, home, homeVod, category, search, detail, play, proxy };