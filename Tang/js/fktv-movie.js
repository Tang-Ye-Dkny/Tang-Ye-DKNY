const host = 'https://m.fktv.me';  // 移动端域名

const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Referer": host
};

// ==================== 工具函数 ====================
function base64Encode(text) {
    try { return btoa(unescape(encodeURIComponent(text))); } catch (e) { return ""; }
}
function base64Decode(str) {
    try { return decodeURIComponent(escape(atob(str))); } catch (e) { return ""; }
}
function getProxyUrl(imgUrl) {
    if (!imgUrl) return "";
    const enc = base64Encode(encodeURIComponent(imgUrl));
    return `proxy://do=fktv_img&url=${enc}`;
}

// ==================== 分类/搜索解析 ====================
function parseMobileList(html) {
    const items = html.match(/<li class="movieCover[^"]*"[^>]*>([\s\S]*?)<\/li>/g) || [];
    return items.map(itemHtml => {
        let name = '';
        const titleMatch = itemHtml.match(/<h2[^>]*>([^<]+)<\/h2>/);
        if (titleMatch) name = titleMatch[1].trim();
        
        let pic = '';
        const dataSrc = itemHtml.match(/<img[^>]*data-src="([^"]+)"/);
        if (dataSrc) pic = dataSrc[1];
        else {
            const src = itemHtml.match(/<img[^>]*src="([^"]+)"/);
            if (src && !src[1].includes('placeholder')) pic = src[1];
        }
        if (pic) pic = getProxyUrl(pic);
        
        let remark = '';
        const remarkMatch = itemHtml.match(/<div class="subtitle[^"]*"[^>]*>([^<]+)<\/div>/);
        if (remarkMatch) remark = remarkMatch[1].trim();
        
        let id = '';
        const linkMatch = itemHtml.match(/<a[^>]*href="([^"]+)"/);
        if (linkMatch) id = linkMatch[1];
        
        return { vod_name: name, vod_pic: pic, vod_remarks: remark, vod_id: id };
    }).filter(item => item.vod_name && item.vod_id);
}

// ==================== 标准接口 ====================
async function init(cfg) {}

async function home() {
    return JSON.stringify({
        class: [
            { type_id: '6', type_name: '电影' },
            { type_id: '5', type_name: '电视剧' },
            { type_id: '7', type_name: '动漫' },
            { type_id: '4', type_name: '综艺' },
            { type_id: '9', type_name: '短剧' },
            { type_id: '10', type_name: '纪录片' },
            { type_id: '8', type_name: '解说' }
        ]
    });
}

async function homeVod() {
    return JSON.stringify({ list: [], page: 1, pagecount: 0 });
}

async function category(tid, pg, filter, extend) {
    const page = Number(pg) || 1;
    const url = `${host}/channel?page=${page}&cat_id=${tid}&order=new&page_size=32`;
    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        return JSON.stringify({ page, pagecount: 99, list: parseMobileList(html) });
    } catch (e) {
        return JSON.stringify({ page: 1, pagecount: 0, list: [] });
    }
}

async function search(wd, quick, pg) {
    const page = Number(pg) || 1;
    const url = `${host}/channel?page=${page}&keywords=${encodeURIComponent(wd)}&page_size=32&order=new`;
    try {
        const res = await req(url, { headers });
        const html = res.content || '';
        return JSON.stringify({ page, pagecount: 99, list: parseMobileList(html) });
    } catch (e) {
        return JSON.stringify({ page: 1, pagecount: 0, list: [] });
    }
}

// ==================== 详情 ====================
function getPureId(vodId) {
    if (!vodId) return '';
    let id = vodId.replace(/^\/movie\/detail\//, '').replace(/^\/movie\//, '');
    return id.split('/')[0] || id;
}

async function detail(id) {
    const vodId = Array.isArray(id) ? id[0] : id;
    if (!vodId) return JSON.stringify({ list: [] });

    try {
        const pureId = getPureId(vodId);
        if (!pureId) return JSON.stringify({ list: [] });
        
        const url = `${host}/movie/detail/${pureId}`;
        const res = await req(url, { headers });
        const html = res.content || '';
        
        let vod_name = "凡客影视";
        const titleMatch = html.match(/<title>([^<\-_|]+)/);
        if (titleMatch) vod_name = titleMatch[1].trim();

        let vod_pic = "";
        const ogPic = html.match(/property="og:image"\s+content="([^"]+)"/);
        if (ogPic) vod_pic = getProxyUrl(ogPic[1]);

        let vod_content = "暂无剧情简介";
        const metaDesc = html.match(/name="description"\s+content="([^"]+)"/);
        if (metaDesc) vod_content = metaDesc[1].trim();

        let maxEp = 1;
        let isSeries = html.includes("剧") || html.includes("集") || html.includes("动漫") || html.includes("综艺") || html.includes("选集") || html.includes("更新");
        
        const epCountMatch = html.match(/(?:共|全|更新至|更新到)\s*(\d+)\s*集/);
        if (epCountMatch) {
            maxEp = parseInt(epCountMatch[1], 10);
            isSeries = true;
        } else if (isSeries) {
            const allNums = html.match(/>\s*(\d+)\s*</g);
            if (allNums) {
                let maxNum = 0;
                allNums.forEach(n => {
                    let numMatch = n.match(/\d+/);
                    if (numMatch) {
                        let num = parseInt(numMatch[0], 10);
                        if (num > maxNum && num <= 200) maxNum = num;
                    }
                });
                if (maxNum > 0) maxEp = maxNum;
                else maxEp = 45;
            } else {
                maxEp = 45;
            }
        }

        let episodes = [];
        if (isSeries && maxEp > 1) {
            for (let i = 1; i <= maxEp; i++) {
                episodes.push({ name: `${i}`, id: `${i}` });
            }
        } else {
            episodes.push({ name: "正片", id: "1" });
        }

        const playFroms = ["高速线路", "备份线路"];
        const playUrls = playFroms.map(lineKey => {
            let lineId = lineKey === "高速线路" ? "line1" : "line2";
            return episodes.map(ep => {
                const epLabel = isSeries ? `第${ep.name}集` : ep.name;
                return `${epLabel}$${lineId}___${pureId}___${ep.id}`;
            }).join('#');
        });

        return JSON.stringify({
            list: [{
                vod_id: vodId,
                vod_name: vod_name,
                vod_pic: vod_pic,
                vod_content: vod_content,
                vod_play_from: playFroms.join('$$$'),
                vod_play_url: playUrls.join('$$$')
            }]
        });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

// ==================== 播放（🎯 核心突破：全域網絡與核心組件攔截閘門） ====================
async function play(flag, id, flags) {
    let lineId = 'line1';
    let pureId = id;
    let epNum = '1';
    
    if (id.includes('___')) {
        const parts = id.split('___');
        lineId = parts[0];
        pureId = parts[1];
        epNum = parts[2];
    }

    pureId = getPureId(pureId) || pureId;
    let playUrl = `${host}/movie/detail/${pureId}`;

    // 💡【神級注入】：全面劫持 XHR、Fetch 與 Video 物件，完美解決 TVBox 秒播第1集的問題
    const lineScript = `
        (function() {
            var targetEp = parseInt("${epNum}", 10);
            // 如果剛好就是要看第1集，直接綠燈放行，不啟動封鎖閘門
            window._isGateUnlocked = (targetEp === 1); 

            console.log("=== 終極流量閘門已啟動，目標集數: " + targetEp + " ===");

            // 🛑 1. 劫持 XMLHttpRequest (阻斷傳統 API 與 m3u8 請求)
            var oldOpen = XMLHttpRequest.prototype.open;
            var oldSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function(method, url) {
                this._url = url;
                return oldOpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function() {
                if (!window._isGateUnlocked && this._url) {
                    var u = this._url.toLowerCase();
                    if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('play') || u.includes('encrypt') || u.includes('/vod/')) {
                        console.log("【閘門拦截】成功阻止 XHR 第1集請求傳輸: " + this._url);
                        return; // 直接攔截，不發送網路請求！
                    }
                }
                return oldSend.apply(this, arguments);
            };

            // 🛑 2. 劫持 window.fetch (阻斷 Next.js 現代非同步路由請求)
            var oldFetch = window.fetch;
            window.fetch = function(input, init) {
                var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
                if (!window._isGateUnlocked && url) {
                    var u = url.toLowerCase();
                    if (u.includes('.m3u8') || u.includes('.mp4') || u.includes('play') || u.includes('encrypt') || u.includes('/vod/')) {
                        console.log("【閘門拦截】成功阻止 Fetch 第1集請求傳輸: " + url);
                        return new Promise(function(res, rej) {
                            rej(new Error("Gatekeeper blocked premature stream."));
                        });
                    }
                }
                return oldFetch.apply(this, arguments);
            };

            // 🛑 3. 劫持 HTML5 Video DOM（雙重保險，防止多媒體標籤直接載入視訊）
            try {
                var orgSrc = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'src');
                Object.defineProperty(HTMLVideoElement.prototype, 'src', {
                    set: function(val) {
                        if (!window._isGateUnlocked) {
                            console.log("【閘門拦截】阻止 Video.src 賦值: " + val);
                            return;
                        }
                        orgSrc.set.call(this, val);
                    },
                    get: function() { return orgSrc.get.call(this); }
                });

                var orgSetAttr = HTMLVideoElement.prototype.setAttribute;
                HTMLVideoElement.prototype.setAttribute = function(name, val) {
                    if (name === 'src' && !window._isGateUnlocked) {
                        console.log("【閘門拦截】阻止 setAttribute src 賦值");
                        return;
                    }
                    orgSetAttr.call(this, name, val);
                };
            } catch(e) {}

            // 🛠️ 物理模擬全光譜事件觸發器
            function forceTriggerClick(el) {
                var events = ['touchstart', 'touchend', 'mousedown', 'mouseup', 'click'];
                events.forEach(function(evtName) {
                    try {
                        var ev = document.createEvent('MouseEvents');
                        ev.initEvent(evtName, true, true);
                        el.dispatchEvent(ev);
                    } catch(e){}
                });
                if (typeof el.click === 'function') {
                    try { el.click(); } catch(e){}
                }
            }

            // 🕒 4. 自動化巡檢計時器：尋找並引爆目標按鈕
            var count = 0;
            var lineDone = "${lineId}" === "line1";

            var timer = setInterval(function() {
                count++;
                
                if (window._isGateUnlocked) {
                    if (count > 20) clearInterval(timer);
                    return;
                }

                // A. 如果是線路2，優先切換線路
                if (!lineDone) {
                    var els = document.querySelectorAll('button, div, span, a');
                    for (var i = 0; i < els.length; i++) {
                        var txt = els[i].textContent;
                        if (txt.includes('线路2') || txt.includes('备用') || txt.includes('备份')) {
                            forceTriggerClick(els[i]);
                            lineDone = true;
                            break;
                        }
                    }
                    return;
                }

                // B. 遍歷節點，尋找符合集數的精準按鈕
                var els = document.querySelectorAll('button, div, span, a, li, p');
                var foundBtn = null;

                for (var i = 0; i < els.length; i++) {
                    var el = els[i];
                    if (el.children.length > 1) continue; // 只鎖定最小純文字節點
                    
                    var txt = el.textContent.trim().replace(/\\s+/g, '');
                    if (txt === targetEp.toString() || 
                        txt === '0' + targetEp || 
                        txt === '第' + targetEp + '集' || 
                        txt === '第0' + targetEp + '集') {
                        foundBtn = el;
                        break;
                    }
                }

                // C. 找到目標按鈕，瞬間「解除閘門」並「引爆點擊」！
                if (foundBtn) {
                    console.log("🎯 成功鎖定目標集數按鈕！開啟閘門，引爆點擊！");
                    window._isGateUnlocked = true; // 🔓 解鎖全域管道
                    forceTriggerClick(foundBtn);   // 觸發 Next.js 真正解密
                    clearInterval(timer);
                } else {
                    // 備用方案：如果遍歷不到，說明手機版「選集彈窗」尚未展開，強制戳開它
                    if (count > 3 && count % 2 === 0) {
                        var allEls = document.querySelectorAll('button, div, span, a');
                        for (var j = 0; j < allEls.length; j++) {
                            var t = allEls[j].textContent;
                            if (t.includes('选集') || t.includes('剧集') || t.includes('展开') || t.includes('更新至')) {
                                forceTriggerClick(allEls[j]);
                            }
                        }
                    }
                }

                if (count > 40) clearInterval(timer);
            }, 300);
        })();
    `.replace(/\s+/g, ' ');

    return JSON.stringify({
        parse: 1,
        url: playUrl,
        script: lineScript,
        header: {
            "User-Agent": headers["User-Agent"],
            "Referer": host
        }
    });
}

// ==================== 图片代理 ====================
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