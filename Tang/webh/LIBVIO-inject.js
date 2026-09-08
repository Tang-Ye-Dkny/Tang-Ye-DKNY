(function() {
    'use strict';

    // 1. 確保 fm SDK 就緒（加入 1.5 秒超時降級，防止非 WebHTV/FongMi 環境下全域卡死）
    function whenFm() {
        if (window.fm) return Promise.resolve(window.fm);
        return new Promise(function(resolve) {
            window.addEventListener('fmsdk', function() { resolve(window.fm); }, { once: true });
            setTimeout(function() { resolve(window.fm || null); }, 1500);
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
        const BASE = 'https://libvio.host';

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
                let decoded = atob(str);
                if (isValidVideoUrl(decoded)) return decoded;
                try {
                    let unescaped = unescape(decoded);
                    if (isValidVideoUrl(unescaped)) return unescaped;
                } catch(e){}
                try {
                    let uriDecoded = decodeURIComponent(decoded);
                    if (isValidVideoUrl(uriDecoded)) return uriDecoded;
                } catch(e){}
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

        // 劇集點擊播放與靜態解析
        async function playEpisode(episodeUrl, title) {
            try {
                if (window.fm && typeof fm.req === 'function') {
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
                            if (window.fm && typeof fm.play === 'function') {
                                await fm.play(videoUrl, title || 'LIBVIO 視頻', {
                                    headers: { 'Referer': BASE + '/', 'User-Agent': navigator.userAgent }
                                });
                                return;
                            }
                        }
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

                // 1. DOM Video 標籤檢測
                const video = iframeDoc.querySelector('video');
                if (video && video.src && /^https?:/i.test(video.src) && !video.src.includes('blob:')) {
                    return video.src;
                }
                const source = iframeDoc.querySelector('video source');
                if (source && source.src && /^https?:/i.test(source.src)) {
                    return source.src;
                }

                // 2. 常見播放器物件變數探查 (DPlayer, ArtPlayer, Xgplayer 等)
                if (iframeWindow.dp && iframeWindow.dp.video && iframeWindow.dp.video.src && isValidVideoUrl(iframeWindow.dp.video.src)) {
                    return iframeWindow.dp.video.src;
                }
                if (iframeWindow.art && iframeWindow.art.url && isValidVideoUrl(iframeWindow.art.url)) {
                    return iframeWindow.art.url;
                }

                // 3. Performance API 網路請求攔截探查
                if (iframeWindow.performance && typeof iframeWindow.performance.getEntriesByType === 'function') {
                    const entries = iframeWindow.performance.getEntriesByType('resource');
                    for (let i = 0; i < entries.length; i++) {
                        const resUrl = entries[i].name;
                        if (isValidVideoUrl(resUrl)) {
                            return resUrl;
                        }
                    }
                }

                // 4. 全域變數探查
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
                    if (window.fm && typeof fm.play === 'function') {
                        fm.play(finalVideoUrl, title, {
                            headers: {
                                'Referer': BASE + '/',
                                'User-Agent': navigator.userAgent
                            }
                        });
                    }
                    return;
                }

                if (attempts >= maxAttempts) {
                    clearInterval(intervalId);
                    console.log('❌ [fm-ext] 副線路動態解析超時，未找到有效 MP4/M3U8 串流');
                }
            }, 300);
        }

        // 強效去廣告與發佈頁清理函數
        function cleanAds() {
            const notePopup = document.getElementById('note');
            if (notePopup) {
                notePopup.style.setProperty('display', 'none', 'important');
                if (typeof notePopup.remove === 'function') notePopup.remove();
            }

            const adIndicators = document.querySelectorAll('.t-img-box, .a_ms, .x-box');
            adIndicators.forEach(function(el) {
                let targetNode = el;
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

        // 毫秒級 CSS 阻斷（防止廣告加載時閃爍出現）
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
            injectAdBlockStyle();
            interceptClicks();

            var observer = new MutationObserver(function() {
                schedule.run(scanPagePlayers);
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });

            scanPagePlayers();
            console.log('🎉 [fm-ext] LIBVIO 終極穿透 + 全能淨化去廣告版部署成功！');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
            init();
        }
    });

    // ===== 獨立返回按鈕模組 =====
    (function() {
        if (window.location.hostname.indexOf('libvio.host') === -1) return;
        if (document.getElementById('fmBackButton')) return;

        function getReturnUrl() {
            var stored = sessionStorage.getItem('libvio_return_url');
            if (stored) return stored;

            var urlParams = new URLSearchParams(window.location.search);
            var paramUrl = urlParams.get('return_url');
            if (paramUrl) return paramUrl;

            var hash = window.location.hash;
            if (hash && hash.startsWith('#return_url=')) {
                try {
                    return decodeURIComponent(hash.substring('#return_url='.length));
                } catch(e) {}
            }

            if (document.referrer && document.referrer.indexOf(window.location.hostname) === -1) {
                var ref = document.referrer;
                if (ref.indexOf('mode=') === -1) {
                    ref += (ref.indexOf('?') === -1 ? '?' : '&') + 'mode=html';
                }
                return ref;
            }

            return null;
        }

        var returnUrl = getReturnUrl();
        if (!returnUrl) return;

        sessionStorage.setItem('libvio_return_url', returnUrl);

        function addButton() {
            if (!document.body) {
                setTimeout(addButton, 50);
                return;
            }
            if (document.getElementById('fmBackButton')) return;

            var btn = document.createElement('div');
            btn.id = 'fmBackButton';
            btn.innerHTML = '‹ 返回';
            btn.style.cssText = [
                'position:fixed',
                'top:16px',
                'left:16px',
                'z-index:99999',
                'background:rgba(0,0,0,0.55)',
                'backdrop-filter:blur(6px)',
                'color:#fff',
                'font-size:18px',
                'font-weight:500',
                'padding:10px 18px',
                'border-radius:30px',
                'border:1px solid rgba(255,255,255,0.2)',
                'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
                'cursor:pointer',
                'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
                'user-select:none',
                'transition:background 0.2s'
            ].join(';');

            btn.onmouseover = function() { this.style.background = 'rgba(0,0,0,0.75)'; };
            btn.onmouseout = function() { this.style.background = 'rgba(0,0,0,0.55)'; };
            btn.onclick = function() {
                window.location.href = returnUrl;
            };

            document.body.appendChild(btn);
        }

        if (document.body) {
            addButton();
        } else {
            document.addEventListener('DOMContentLoaded', addButton);
        }
    })();
})();