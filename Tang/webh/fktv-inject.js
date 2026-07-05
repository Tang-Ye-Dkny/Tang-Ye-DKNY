(function() {
    'use strict';

    // 1. 確保 fm 原生對象就緒的核心 Promise
    function whenFm() {
        if (window.fm) return Promise.resolve(window.fm);
        return new Promise(function(resolve) {
            window.addEventListener('fmsdk', function() { resolve(window.fm); }, { once: true });
        });
    }

    // 2. 高性能防抖調度器 (Debounce) - 防止 DOM 頻繁變化時重刷 CPU
    var schedule = {
        timer: null,
        run: function(fn) {
            clearTimeout(this.timer);
            this.timer = setTimeout(fn, 150);
        }
    };

    // 3. 標題清洗演算法 - 專治長尾垃圾後綴，讓 App 歷史紀錄乾乾淨淨
    function getCleanTitle() {
        try {
            // 優先抓取詳情頁的影視名字 H1 或 H2
            var h1 = document.querySelector('h1, h2');
            if (h1 && h1.textContent.trim()) {
                return h1.textContent.trim().replace(/\s+/g, ' ');
            }
            // 次選洗淨後的 document.title (切除 "- 凡客影視" 等後綴)
            if (document.title) {
                var rawTitle = document.title.split('-')[0].split('_')[0];
                return rawTitle.trim();
            }
        } catch(e) { console.error('[fm-fktv] 標題提取出錯:', e); }
        return '凡客影視';
    }

    whenFm().then(function(fm) {
        
        // 核心播放調用（帶有防重入與錯誤防護）
        function triggerNativePlay(url) {
            try {
                if (window.__lastPlayedUrl === url) return;
                window.__lastPlayedUrl = url;
                
                var cleanTitle = getCleanTitle();
                console.log('🔥 [凡客-核心成功捕獲] 正在呼叫 Native 播放:', url);
                
                fm.play(url, cleanTitle, {
                    headers: { Referer: location.href },
                    credentials: 'include'
                });
            } catch(e) {
                console.error('[fm-fktv] 呼叫 fm.play 失敗:', e);
            }
        }

        // 精準媒體源過濾器 (正則優化版)
        function isValidMediaUrl(url) {
            if (!url || typeof url !== 'string') return false;
            // 一律排除廣告、追蹤統計、動態代理及純圖片資源
            if (/cloudflareinsights|google-analytics|proxy:\/\/|\.png|\.jpg|\.gif|favicon/i.test(url)) {
                return false;
            }
            // 精準捕獲主流的 m3u8 與 mp4 串流
            return url.includes('.m3u8') || url.includes('.mp4');
        }

        // --- 策略一：動態媒體標籤嗅探 (高性能優化) ---
        function sniffVideoTags() {
            try {
                var videos = document.querySelectorAll('video');
                videos.forEach(function(video) {
                    var src = video.currentSrc || video.src || '';
                    if (isValidMediaUrl(src)) {
                        triggerNativePlay(src);
                    }
                });
            } catch(e) { console.error('[fm-fktv] 標籤嗅探過程崩潰:', e); }
        }

        // 改造點：利用 MutationObserver + schedule 防抖聯動，替代原本高頻空轉的 300ms 定時器
        var observer = new MutationObserver(function() {
            schedule.run(sniffVideoTags);
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        // 兜底守衛：將定時器放寬至 500ms 降低開銷，專治某些只換 src 屬性而不改動 DOM 結構的極端播放器
        setInterval(sniffVideoTags, 500);


        // --- 策略二：強效網絡層攔截 (Fetch / XHR) ---
        try {
            // 監聽並攔截 Fetch 請求
            var origFetch = window.fetch;
            window.fetch = function() {
                try {
                    var url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url);
                    if (isValidMediaUrl(url)) {
                        console.log('[凡客攔截-Fetch] 成功截獲媒體鏈接:', url);
                        triggerNativePlay(url);
                    }
                } catch(e) {}
                return origFetch.apply(this, arguments);
            };

            // 監聽並攔截 XMLHttpRequest (XHR)
            var origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
                try {
                    if (isValidMediaUrl(url)) {
                        console.log('[凡客攔截-XHR] 成功截獲媒體鏈接:', url);
                        triggerNativePlay(url);
                    }
                } catch(e) {}
                return origOpen.apply(this, arguments);
            };
        } catch (e) {
            console.error('[fm-fktv] 網絡層攔截重寫失敗:', e);
        }

        // 頁面首次加載時主動對齊一次
        sniffVideoTags();
        console.log('✅ [fm-fktv] 凡客優化版工業級雙防線注入器已啟動');
    });
})();