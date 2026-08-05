(function() {
    'use strict';

    // 1. 確保 fm 對象就緒的 Promise 核心
    function whenFm() {
        if (window.fm) return Promise.resolve(window.fm);
        return new Promise(function(resolve) {
            window.addEventListener('fmsdk', function() { resolve(window.fm); }, { once: true });
        });
    }

    // 2. 高性能防抖調度器 (Debounce) - 限制 120ms 內絕不重複暴刷 DOM
    var schedule = {
        timer: null,
        run: function(fn) {
            clearTimeout(this.timer);
            this.timer = setTimeout(fn, 120);
        }
    };

    // 3. 標題洗淨與精準兜底提取
    function getCleanTitle() {
        try {
            var h1 = document.querySelector('h1, h2');
            if (h1 && h1.textContent.trim()) {
                return h1.textContent.trim().replace(/\s+/g, ' ');
            }
            if (document.title) {
                var rawTitle = document.title.split('-')[0].split('_')[0];
                return rawTitle.trim();
            }
        } catch(e) { console.error('[fm-ext] 標題提取出錯:', e); }
        return '視頻播放';
    }

    whenFm().then(function(fm) {
        
        // 核心播放調用
        function triggerNativePlay(url) {
            try {
                if (window.parent) {
                    if (window.parent.__lastPlayedUrl === url) return;
                    window.parent.__lastPlayedUrl = url;
                    
                    var finalTitle = getCleanTitle();
                    console.log('🔥 [fm-ext] 成功捕獲核心媒體源:', url);
                    
                    window.parent.fm.play(url, finalTitle, {
                        headers: { Referer: location.href },
                        credentials: 'include'
                    });
                }
            } catch (e) {
                console.error('[fm-ext] 呼叫 fm.play 失敗:', e);
            }
        }

        // 注入到 Player iframe 內部的核心攔截邏輯
        function injectIntoIframe(iframe) {
            try {
                var doc = iframe.contentDocument || iframe.contentWindow.document;
                if (!doc) return;
                
                var script = doc.createElement('script');
                script.textContent = '(' + function() {
                    
                    function triggerNativePlay(url) {
                        if (window.parent && window.parent.fm) {
                            if (window.parent.__lastPlayedUrl === url) return;
                            window.parent.__lastPlayedUrl = url;
                            window.parent.fm.play(url, document.title || '視頻', {
                                headers: { Referer: location.href },
                                credentials: 'include'
                            });
                        }
                    }

                    // 策略一：廣告高效靜音秒過
                    function autoSkipVideoAd() {
                        try {
                            var video = document.querySelector('video');
                            if (!video) return;
                            var src = video.currentSrc || video.src || '';
                            if (!src) return;

                            if (src.includes('.mp4') || src.includes('preroll') || src.includes('taobao') || src.includes('/ad/')) {
                                video.muted = true;
                                video.playbackRate = 16;
                                if (video.duration && !isNaN(video.duration)) {
                                    video.currentTime = video.duration - 0.1;
                                }
                            } else {
                                video.playbackRate = 1;
                                if ((src.includes('.m3u8') || src.includes('.mp4')) && !src.includes('baidu') && !src.includes('google')) {
                                    triggerNativePlay(src);
                                }
                            }
                        } catch(e) {}
                    }
                    setInterval(autoSkipVideoAd, 400);

                    // 策略二：網絡層攔截 (Fetch/XHR)
                    function isTrueMedia(url) {
                        if (typeof url !== 'string') return false;
                        return url.includes('.m3u8') && !url.includes('taobao');
                    }

                    var origFetch = window.fetch;
                    window.fetch = function() {
                        var url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url);
                        if (isTrueMedia(url)) triggerNativePlay(url);
                        return origFetch.apply(this, arguments);
                    };

                    var origOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url) {
                        if (isTrueMedia(url)) triggerNativePlay(url);
                        return origOpen.apply(this, arguments);
                    };

                }.toString() + ')();';
                
                doc.head.appendChild(script);
            } catch(e) { 
                console.warn('[fm-ext] 跨域或環境限制，注入 iframe 失敗:', e); 
            }
        }

        // ----- 🧹 廣告清理函數 -----
        function removeAds() {
            try {
                // 1. 隱藏所有來自 static.okokserver.com/img/ 的廣告圖片
                document.querySelectorAll('img[src*="static.okokserver.com/img/"]').forEach(function(img) {
                    var container = img.closest('a, div[class*="ad"], div[class*="banner"], .love-item, .player-right .switch-box, .check, .plist-body');
                    if (container) {
                        container.style.display = 'none';
                    } else {
                        img.style.display = 'none';
                    }
                });

                // 2. 隱藏已知的廣告容器
                var adSelectors = [
                    '.love-row-wrap',           // 詳情頁底部廣告行
                    '.love-item',               // 贊助連結
                    '#player-vip',              // 播放頁VIP廣告橫幅
                    '.ucl-final-banner',        // 直播廣告橫幅
                    '.player-news',             // 頂部的警告條（非廣告但可隱藏）
                    '.switch-box .item img[src*="okokserver"]' // 播放頁右側GIF廣告
                ];
                adSelectors.forEach(function(sel) {
                    document.querySelectorAll(sel).forEach(function(el) {
                        el.style.display = 'none';
                    });
                });

                // 3. 隱藏所有 .gif 動態廣告（播放頁右側）
                document.querySelectorAll('img[src$=".gif"]').forEach(function(img) {
                    var container = img.closest('a, div');
                    if (container) container.style.display = 'none';
                });

                console.log('[華視] 廣告已清理');
            } catch(e) { /* 靜默 */ }
        }

        // 掃描並標記處理過的節點 (符合 data-fm-* 規範)
        function scan() {
            try {
                var iframes = document.querySelectorAll('iframe');
                iframes.forEach(function(iframe) {
                    if (iframe.src && iframe.src.includes('/Player/')) {
                        if (iframe.dataset.fmInjected) return;
                        iframe.dataset.fmInjected = '1';
                        
                        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                            injectIntoIframe(iframe);
                        } else {
                            iframe.addEventListener('load', function() { injectIntoIframe(iframe); }, { once: true });
                        }
                    }
                });
            } catch (e) { console.error('[fm-ext] 執行掃描時崩潰:', e); }
        }

        // 初始化監聽器
        function init() {
            // 首次清理廣告
            removeAds();

            // 使用標準 MutationObserver + schedule 防抖調度
            var mo = new MutationObserver(function() {
                schedule.run(scan);
                // 每次 DOM 變化後重新清理廣告（延遲執行避免反覆觸發）
                schedule.run(removeAds);
            });
            mo.observe(document.documentElement, { childList: true, subtree: true });
            
            // 首次全量掃描
            scan();
            console.log('✅ [fm-ext] 華視優化版工業級注入器已啟動 (含廣告清理)');
        }

        // DOM 確保加載完成後啟動
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
            init();
        }
    });

    // ===== 獨立返回按鈕模組（優化增強版） =====
    (function() {
        // 只在 huavod.com 站內生效
        if (window.location.hostname.indexOf('huavod.com') === -1) return;
        if (document.getElementById('fmBackButton')) return;

        var STORAGE_KEY = 'huavod_global_return_url';

        // 取得並持久化儲存返回地址（解決跨域與站內跳轉後丟失問題）
        function getReturnUrl() {
            var hash = window.location.hash;
            var returnUrl = '';

            // 1. 優先從 Hash 解析 (最可靠)
            if (hash && hash.indexOf('return_url=') !== -1) {
                try {
                    var raw = hash.split('return_url=')[1];
                    returnUrl = decodeURIComponent(raw.split('&')[0]);
                } catch(e) {}
            }

            // 若從 Hash 拿到地址，立刻同步保存到本地持久化儲存
            if (returnUrl) {
                try {
                    localStorage.setItem(STORAGE_KEY, returnUrl);
                    sessionStorage.setItem(STORAGE_KEY, returnUrl);
                } catch(e) {}
                return returnUrl;
            }

            // 2. 其次從本地持久化儲存讀取 (避免換頁後丟失)
            try {
                var stored = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
                if (stored) return stored;
            } catch(e) {}

            // 3. 從 URL 查詢參數讀取
            try {
                var urlParams = new URLSearchParams(window.location.search);
                var paramUrl = urlParams.get('return_url');
                if (paramUrl) return paramUrl;
            } catch(e) {}

            // 4. 從 Referrer 讀取
            if (document.referrer && document.referrer.indexOf(window.location.hostname) === -1) {
                return document.referrer;
            }

            // 5. 兜底地址
            return 'http://127.0.0.1:9978/file/%E6%B8%AC%E8%A9%A6/html/huavod.html?mode=html';
        }

        var finalReturnUrl = getReturnUrl();

        // 渲染 UI 按鈕
        function addButton() {
            if (!document.body || document.getElementById('fmBackButton')) return;

            var btn = document.createElement('div');
            btn.id = 'fmBackButton';
            btn.innerHTML = '‹ 返回';
            btn.style.cssText = [
                'position:fixed',
                'top:16px',
                'left:16px',
                'z-index:999999',
                'background:rgba(0,0,0,0.65)',
                'backdrop-filter:blur(8px)',
                'color:#ffffff',
                'font-size:16px',
                'font-weight:bold',
                'padding:8px 18px',
                'border-radius:30px',
                'border:1px solid rgba(255,255,255,0.25)',
                'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
                'cursor:pointer',
                'user-select:none',
                'transition:all 0.2s'
            ].join(';');

            btn.onmouseover = function() { this.style.background = 'rgba(0,0,0,0.85)'; };
            btn.onmouseout = function() { this.style.background = 'rgba(0,0,0,0.65)'; };

            btn.onclick = function() {
                console.log('[返回鍵] 觸發返回，跳轉至:', finalReturnUrl);
                if (finalReturnUrl) {
                    // 使用 location.replace 避免留在原網頁的歷史紀錄中
                    window.location.replace(finalReturnUrl);
                } else {
                    history.back();
                }
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