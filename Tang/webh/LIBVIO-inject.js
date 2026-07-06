(function() {
    'use strict';

    // 1. 確保 fm SDK 就緒
    function whenFm() {
        if (window.fm) return Promise.resolve(window.fm);
        return new Promise(function(resolve) {
            window.addEventListener('fmsdk', function() { resolve(window.fm); }, { once: true });
        });
    }

    // 2. 高性能防抖調度器
    var schedule = {
        timer: null,
        run: function(fn) {
            clearTimeout(this.timer);
            this.timer = setTimeout(fn, 120);
        }
    };

    whenFm().then(function(fm) {
        const BASE = 'https://www.libvios.com';

        // 清理與驗證直連網址
        function cleanVideoUrl(url) {
            if (!url || typeof url !== 'string') return url;
            return url.replace(/\\\//g, '/');
        }

        function isValidVideoUrl(url) {
            if (!url || typeof url !== 'string') return false;
            const cleaned = cleanVideoUrl(url);
            return /^https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8|mov|flv)/i.test(cleaned) || cleaned.includes('cloudcube');
        }

        function tryDecodeBase64(str) {
            try {
                if (!/^[A-Za-z0-9+/=]+$/.test(str)) return null;
                const decoded = atob(str);
                if (isValidVideoUrl(decoded)) return decoded;
                return null;
            } catch(e) { return null; }
        }

        // 靜態 HTML 提取明文直連 (策略 1)
        function extractVideoUrl(html) {
            const playerMatch = html.match(/var\s+player_aaaa\s*=\s*\{[^}]*"url"\s*:\s*"([^"]+)"/i);
            if (playerMatch) {
                const cleaned = cleanVideoUrl(playerMatch[1]);
                if (isValidVideoUrl(cleaned)) return cleaned;
                const base64Decoded = tryDecodeBase64(cleaned);
                if (base64Decoded && isValidVideoUrl(base64Decoded)) return base64Decoded;
            }
            const anyMatch = html.match(/(https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)/i);
            if (anyMatch) {
                const cleaned = cleanVideoUrl(anyMatch[1]);
                if (isValidVideoUrl(cleaned)) return cleaned;
            }
            return null;
        }

        // 點擊劇集時的非同步處理
        async function playEpisode(episodeUrl, title) {
            try {
                const response = await fm.req(episodeUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': navigator.userAgent,
                        'Referer': BASE + '/'
                    },
                    responseType: 'text',
                    timeout: 10
                });

                if (response.ok) {
                    let videoUrl = extractVideoUrl(response.body);
                    if (videoUrl && isValidVideoUrl(videoUrl)) {
                        console.log('✅ [fm-ext] 靜態命中明文直連網址:', videoUrl);
                        await fm.play(videoUrl, title || 'LIBVIO 視頻', {
                            headers: { 'Referer': BASE + '/', 'User-Agent': navigator.userAgent }
                        });
                        return;
                    }
                }

                console.log('🔄 [fm-ext] 靜態未命中直連，引導網頁載入以觸發動態解密...');
                window.location.href = episodeUrl;

            } catch (error) {
                console.error('[fm-ext] 請求異常，執行常規跳轉:', error);
                window.location.href = episodeUrl;
            }
        }

        // 核心穿透技術：從同網域的 Iframe 內部強行收割真實視訊流
        function harvestUrlsFromIframe(iframe) {
            try {
                const iframeWindow = iframe.contentWindow;
                const iframeDoc = iframe.contentDocument || iframeWindow?.document;
                if (!iframeWindow || !iframeDoc) return null;

                const video = iframeDoc.querySelector('video');
                if (video && video.src && /^https?:/i.test(video.src) && !video.src.includes('blob:')) {
                    return video.src;
                }
                const source = iframeDoc.querySelector('video source');
                if (source && source.src && /^https?:/i.test(source.src)) {
                    return source.src;
                }

                if (iframeWindow.performance && typeof iframeWindow.performance.getEntriesByType === 'function') {
                    const entries = iframeWindow.performance.getEntriesByType('resource');
                    for (let i = 0; i < entries.length; i++) {
                        const resUrl = entries[i].name;
                        if (isValidVideoUrl(resUrl)) {
                            return resUrl;
                        }
                    }
                }

                if (iframeWindow.urls && typeof iframeWindow.urls === 'string' && isValidVideoUrl(iframeWindow.urls)) {
                    return iframeWindow.urls;
                }
                if (iframeWindow.config && iframeWindow.config.url && isValidVideoUrl(iframeWindow.config.url)) {
                    return iframeWindow.config.url;
                }
            } catch (e) {
                console.log('[fm-ext] 同網域穿透嘗試中...', e.message);
            }
            return null;
        }

        // 輪詢監聽器：牢牢盯住畫面上的副線路播放器
        function monitorActiveIframe(iframe) {
            if (iframe.dataset.fmMonitored) return;
            iframe.dataset.fmMonitored = '1';

            console.log('🎯 [fm-ext] 偵測到副線路組件，開啟同網域深度動態監控...');

            let attempts = 0;
            const maxAttempts = 40;
            
            const intervalId = setInterval(function() {
                attempts++;
                const finalVideoUrl = harvestUrlsFromIframe(iframe);
                
                if (finalVideoUrl) {
                    clearInterval(intervalId);
                    console.log('🎉 [fm-ext] 成功穿透防盜鏈！斬獲副線路真實直連:', finalVideoUrl);

                    try {
                        const v = iframe.contentDocument.querySelector('video');
                        if (v) v.pause();
                    } catch(e){}

                    iframe.style.setProperty('display', 'none', 'important');

                    const title = document.querySelector('h1.title')?.textContent?.trim() || document.title.split('-')[0].trim();
                    fm.play(finalVideoUrl, title, {
                        headers: {
                            'Referer': BASE + '/',
                            'User-Agent': navigator.userAgent
                        }
                    });
                    return;
                }

                if (attempts >= maxAttempts) {
                    clearInterval(intervalId);
                    console.log('❌ [fm-ext] 副線路動態解析超時，未找到有效 MP4/M3U8 串流');
                }
            }, 300);
        }

        // 【新增】強效去廣告與發佈頁清理函數
        function cleanAds() {
            // 1. 強制移除中央發佈頁通知彈窗
            const notePopup = document.getElementById('note');
            if (notePopup) {
                notePopup.style.setProperty('display', 'none', 'important');
                if (typeof notePopup.remove === 'function') notePopup.remove();
            }

            // 2. 移除橫幅廣告及其帶有隨機隨機 ID 的外層包裹容器
            const adIndicators = document.querySelectorAll('.t-img-box, .a_ms, .x-box');
            adIndicators.forEach(function(el) {
                let targetNode = el;
                // 向上追溯包裹層，直到最外層的動態 ID Div（不破壞主結構 container 即可）
                if (targetNode && targetNode.parentElement && 
                    targetNode.parentElement.tagName !== 'BODY' && 
                    !targetNode.parentElement.classList.contains('container') &&
                    !targetNode.parentElement.classList.contains('row')) {
                    targetNode = targetNode.parentElement;
                }
                if (targetNode) {
                    targetNode.style.setProperty('display', 'none', 'important');
                    targetNode.style.setProperty('height', '0', 'important');
                    targetNode.style.setProperty('margin', '0', 'important');
                    targetNode.style.setProperty('padding', '0', 'important');
                    if (typeof targetNode.remove === 'function') targetNode.remove();
                }
            });
        }

        // 掃描當前頁面的有效副線路播放器與廣告大掃除
        function scanPagePlayers() {
            // 每次 DOM 變化時，同步執行廣告大掃除
            cleanAds();

            if (window.self !== window.top) return;

            if (window.player_aaaa && (window.player_aaaa.from === 'kuake' || window.player_aaaa.from === 'uc')) {
                return;
            }

            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(function(iframe) {
                const src = iframe.src;
                if (src && (src.includes('/vid/ty4.php') || src.includes('/vid/plyr/') || src.includes('/vid/parse.php'))) {
                    monitorActiveIframe(iframe);
                }
            });
        }

        // 靜態與動態點擊攔截
        function interceptClicks() {
            document.addEventListener('click', function(e) {
                let link = e.target.closest('a[href*="/w/"]');
                if (!link) {
                    const playBtn = e.target.closest('.play-btn, .btn-play, [onclick*="play"], [onclick*="location.href"]');
                    if (playBtn) {
                        let url = playBtn.getAttribute('data-href') || playBtn.getAttribute('data-url');
                        if (!url) {
                            const onclick = playBtn.getAttribute('onclick');
                            if (onclick) {
                                const match = onclick.match(/['"]([^'"]+\.html)['"]/);
                                if (match) url = match[1];
                            }
                        }
                        if (url) {
                            e.preventDefault();
                            e.stopPropagation();
                            const episodeUrl = url.startsWith('http') ? url : BASE + url;
                            const title = document.querySelector('h1.title')?.textContent?.trim() || 'LIBVIO 視頻';
                            playEpisode(episodeUrl, title);
                            return;
                        }
                    }
                    return;
                }

                const href = link.getAttribute('href');
                if (!href || !/\/w\/\d+-\d+-\d+\.html/.test(href)) return;

                e.preventDefault();
                e.stopPropagation();

                const episodeUrl = href.startsWith('http') ? href : BASE + href;
                const title = document.querySelector('h1.title')?.textContent?.trim() || 'LIBVIO 視頻';
                playEpisode(episodeUrl, title);
            }, true);
        }

        // 【新增】毫秒級 CSS 阻斷（防止廣告加載時閃爍出現）
        function injectAdBlockStyle() {
            const style = document.createElement('style');
            style.textContent = `
                #note, .popup, .t-img-box, .a_ms, .x-box, .urgent-banner {
                    display: none !important;
                    visibility: hidden !important;
                    height: 0 !important;
                    opacity: 0 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    overflow: hidden !important;
                    pointer-events: none !important;
                }
            `;
            (document.head || document.documentElement).appendChild(style);
        }

        // 初始化
        function init() {
            // 1. 率先注入 CSS 實現零閃爍視覺隱藏
            injectAdBlockStyle();

            // 2. 攔截劇集點擊行為
            interceptClicks();

            // 3. 註冊全自動 DOM 監聽器（確保動態載入的廣告與副線路無處遁形）
            var observer = new MutationObserver(function() {
                schedule.run(scanPagePlayers);
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });

            // 4. 首次進入全量掃描
            scanPagePlayers();
            console.log('🎉 [fm-ext] LIBVIO 終極穿透 + 全能淨化去廣告版部署成功！');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
            init();
        }
    });
})();