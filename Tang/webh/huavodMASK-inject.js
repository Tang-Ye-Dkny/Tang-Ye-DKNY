(function() {
    'use strict';

    // 1. 確保 fm 對象就緒的 Promise 核心
    function whenFm() {
        if (window.fm) return Promise.resolve(window.fm);
        return new Promise(function(resolve) {
            window.addEventListener('fmsdk', function() { resolve(window.fm); }, { once: true });
        });
    }

    // 2. 高性能防抖調度器 (Debounce)
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

                    // ----- 廣告遮罩方案（不暫停、不快進） -----
                    var adOverlay = null;
                    var adCheckInterval = null;
                    var lastTriggeredUrl = '';

                    function showAdOverlay() {
                        if (adOverlay) return;
                        adOverlay = document.createElement('div');
                        adOverlay.style.cssText = [
                            'position:fixed',
                            'top:0',
                            'left:0',
                            'width:100%',
                            'height:100%',
                            'background:rgba(0,0,0,0.85)', // 提高不透明度至85%
                            'z-index:99998',
                            'display:flex',
                            'flex-direction:column',
                            'align-items:center',
                            'justify-content:center',
                            'color:#fff',
                            'font-family:sans-serif',
                            'pointer-events:none',
                            'user-select:none'
                        ].join(';');

                        var text = document.createElement('div');
                        text.textContent = '广告播放中，请稍候...';
                        text.style.cssText = 'font-size:28px;font-weight:300;margin-bottom:16px;text-shadow:0 2px 8px rgba(0,0,0,0.8);';

                        var sub = document.createElement('div');
                        sub.textContent = '即将开始正片';
                        sub.style.cssText = 'font-size:18px;opacity:0.6;';

                        adOverlay.appendChild(text);
                        adOverlay.appendChild(sub);
                        document.body.appendChild(adOverlay);
                        console.log('[fm-ext] 广告遮罩已显示');
                    }

                    function removeAdOverlay() {
                        if (adOverlay) {
                            document.body.removeChild(adOverlay);
                            adOverlay = null;
                            console.log('[fm-ext] 广告遮罩已移除');
                        }
                        if (adCheckInterval) {
                            clearInterval(adCheckInterval);
                            adCheckInterval = null;
                        }
                    }

                    function checkAdVideo() {
                        try {
                            var video = document.querySelector('video');
                            if (!video) return;
                            var src = video.currentSrc || video.src || '';
                            // 判断是否为广告（关键词或短时长）
                            var isAd = src.includes('preroll') || src.includes('taobao') || src.includes('/ad/') || src.includes('ads') || (video.duration && video.duration < 60);

                            if (isAd) {
                                // 广告：静音并显示遮罩
                                video.muted = true;
                                if (!adOverlay) {
                                    showAdOverlay();
                                }
                                // 监听广告结束（轮询）
                                if (!adCheckInterval) {
                                    adCheckInterval = setInterval(function() {
                                        if (video.ended || (video.currentTime && video.duration && video.currentTime >= video.duration - 0.5)) {
                                            // 广告结束，移除遮罩
                                            removeAdOverlay();
                                            video.muted = false;
                                            // 广告结束后，页面可能自动切换到正片，但我们需要捕获正片地址
                                            // 此时视频的 src 会变化，我们会在下一次检测中捕获
                                        }
                                    }, 500);
                                }
                            } else {
                                // 非广告：如果遮罩存在则移除，并尝试捕获正片地址
                                if (adOverlay) {
                                    removeAdOverlay();
                                    video.muted = false;
                                }
                                // 如果是正片地址，且未被触发过，则调用 triggerNativePlay
                                var finalSrc = video.currentSrc || video.src || '';
                                if (finalSrc && finalSrc.includes('.m3u8') && !finalSrc.includes('taobao') && finalSrc !== lastTriggeredUrl) {
                                    lastTriggeredUrl = finalSrc;
                                    // 延迟一小段时间确保视频准备就绪
                                    setTimeout(function() {
                                        triggerNativePlay(finalSrc);
                                    }, 200);
                                }
                            }
                        } catch(e) {}
                    }

                    // 每500ms检测一次视频状态
                    setInterval(checkAdVideo, 500);

                    // 网络层拦截（保持原有）
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

        // ----- 廣告清理函數 -----
        function removeAds() {
            try {
                document.querySelectorAll('img[src*="static.okokserver.com/img/"]').forEach(function(img) {
                    var container = img.closest('a, div[class*="ad"], div[class*="banner"], .love-item, .player-right .switch-box, .check, .plist-body');
                    if (container) {
                        container.style.display = 'none';
                    } else {
                        img.style.display = 'none';
                    }
                });

                var adSelectors = [
                    '.love-row-wrap',
                    '.love-item',
                    '#player-vip',
                    '.ucl-final-banner',
                    '.player-news',
                    '.switch-box .item img[src*="okokserver"]'
                ];
                adSelectors.forEach(function(sel) {
                    document.querySelectorAll(sel).forEach(function(el) {
                        el.style.display = 'none';
                    });
                });

                document.querySelectorAll('img[src$=".gif"]').forEach(function(img) {
                    var container = img.closest('a, div');
                    if (container) container.style.display = 'none';
                });

                console.log('[华视] 廣告已清理');
            } catch(e) { /* 靜默 */ }
        }

        // ===== 左上角返回鍵（僅播放頁顯示） =====
        function addBackButton() {
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

        // 判斷是否為播放頁
        function isPlayPage() {
            var path = window.location.pathname;
            if (path.includes('/play/') || path.includes('/vodplay/')) return true;
            if (document.querySelector('video')) return true;
            return false;
        }

        // 掃描 iframe
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

        // 初始化
        function init() {
            removeAds();

            if (isPlayPage()) {
                addBackButton();
            }

            var mo = new MutationObserver(function() {
                schedule.run(scan);
                schedule.run(removeAds);
            });
            mo.observe(document.documentElement, { childList: true, subtree: true });
            
            scan();
            console.log('✅ [fm-ext] 華視優化版注入器已啟動 (遮罩廣告 + 返回鍵)');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
            init();
        }
    });
})();