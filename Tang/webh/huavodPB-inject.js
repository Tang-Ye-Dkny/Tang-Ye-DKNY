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

        // ----- 🧹 新增：廣告清理函數 -----
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
                    '.love-row-wrap',           // 详情页底部广告行
                    '.love-item',               // 赞助链接
                    '#player-vip',              // 播放页VIP广告横幅
                    '.ucl-final-banner',        // 直播广告横幅
                    '.player-news',             // 顶部的警告条（非广告但可隐藏）
                    '.switch-box .item img[src*="okokserver"]' // 播放页右侧GIF广告
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

                console.log('[华视] 廣告已清理');
            } catch(e) { /* 靜默 */ }
        }

        // ===== 新增：左上角返回鍵 =====
        function addBackButton() {
            // 避免重复添加
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

            // 悬停效果（移动端忽略）
            btn.onmouseover = function() { this.style.background = 'rgba(0,0,0,0.75)'; };
            btn.onmouseout = function() { this.style.background = 'rgba(0,0,0,0.55)'; };

            // 点击返回上一页
            btn.onclick = function() {
                try {
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        window.close();
                    }
                } catch(e) {
                    console.warn('[fm-ext] 返回操作失败:', e);
                }
            };

            document.body.appendChild(btn);
            console.log('[fm-ext] 返回键已添加');
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

        // 判斷是否為播放頁（URL包含/play/或/vodplay/，或存在video标签）
        function isPlayPage() {
            var path = window.location.pathname;
            if (path.includes('/play/') || path.includes('/vodplay/')) return true;
            if (document.querySelector('video')) return true;
            return false;
        }

        // 初始化監聽器
        function init() {
            // 首次清理廣告
            removeAds();

            // 仅在播放页添加返回键
            if (isPlayPage()) {
                addBackButton();
            }

            // 使用標準 MutationObserver + schedule 防抖調度
            var mo = new MutationObserver(function() {
                schedule.run(scan);
                // 每次 DOM 變化後重新清理廣告（延遲執行避免反覆觸發）
                schedule.run(removeAds);
            });
            mo.observe(document.documentElement, { childList: true, subtree: true });
            
            // 首次全量掃描
            scan();
            console.log('✅ [fm-ext] 華視優化版工業級注入器已啟動 (含廣告清理 + 條件返回鍵)');
        }

        // DOM 確保加載完成後啟動
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
            init();
        }
    });
})();