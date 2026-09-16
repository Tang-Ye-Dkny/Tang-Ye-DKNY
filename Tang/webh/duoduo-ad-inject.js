(function() {
    // =============================================================
    // 1. 環境偽裝與防跳轉 (防止跳轉至 app-download.html)
    // =============================================================
    try {
        Object.defineProperty(navigator, 'userAgent', {
            get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            configurable: true
        });
        Object.defineProperty(navigator, 'platform', {
            get: () => 'Win32',
            configurable: true
        });
        Object.defineProperty(navigator, 'maxTouchPoints', {
            get: () => 0,
            configurable: true
        });
    } catch (e) {}

    if (window.location.href.includes('app-download.html')) {
        window.history.back();
        return;
    }

    const blockRedirect = () => {
        document.addEventListener('click', function(e) {
            let target = e.target;
            while (target && target !== document) {
                if (target.href && target.href.includes('app-download.html')) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
                target = target.parentNode;
            }
        }, true);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', blockRedirect);
    } else {
        blockRedirect();
    }

    // =============================================================
    // 額外新增：單純精準去除 LOL 廣告圖 (kaiyun.png / dijia1.php)
    // =============================================================
    const cleanLolAd = () => {
        const adElements = document.querySelectorAll('img[src*="kaiyun"], a[href*="dijia"]');
        adElements.forEach(el => {
            // 只移除包含該廣告的 100% 寬度子容器，保留同層的 App 下載按鈕
            const container = el.closest('div[style*="flex-basis: 100%"]') || el;
            if (container && container.parentNode) {
                container.parentNode.removeChild(container);
            }
        });
    };

    // 注入 CSS 防止廣告加載時瞬間閃爍
    const style = document.createElement('style');
    style.innerHTML = 'img[src*="kaiyun"], a[href*="dijia"] { display: none !important; }';
    (document.head || document.documentElement).appendChild(style);

    // 實時觀察 DOM 變更，動態移除新生成的廣告節點
    const observer = new MutationObserver(cleanLolAd);
    if (document.documentElement) {
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    window.addEventListener('DOMContentLoaded', cleanLolAd);

    // =============================================================
    // 2. 原生播放器轉交與網頁播放器暫停
    // =============================================================
    let hasPlayed = false;
    const triggerNativePlay = (videoUrl) => {
        if (!videoUrl || hasPlayed) return;
        if (typeof fm !== 'undefined' && typeof fm.play === 'function') {
            hasPlayed = true;
            console.log('[WebHTV 攔截成功] 轉交 ExoPlayer 播放:', videoUrl);
            
            // 強制暫停網頁上所有的 video 標籤，避免雙重發聲
            document.querySelectorAll('video').forEach(v => {
                try { v.pause(); } catch(e){}
            });
            
            fm.play(videoUrl);
            
            // 3秒後解除鎖定（允許點擊下一集時再次觸發）
            setTimeout(() => { hasPlayed = false; }, 3000);
        }
    };

    // =============================================================
    // 3. 攔截 HTML5 <video> 標籤播放動作
    // =============================================================
    const origPlay = HTMLVideoElement.prototype.play;
    HTMLVideoElement.prototype.play = function() {
        const videoSrc = this.src || this.currentSrc;
        if (videoSrc && !videoSrc.startsWith('blob:')) {
            triggerNativePlay(videoSrc);
            this.pause();
            return Promise.reject("Handled by ExoPlayer");
        }
        return origPlay.apply(this, arguments);
    };

    // =============================================================
    // 4. 攔截 XHR 請求（依據 #EXTM3U 內文特徵與副檔名）
    // =============================================================
    const rawSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            try {
                const url = this.responseURL || '';
                const text = this.responseText || '';

                // 判斷方式 A: 回傳內容包含 M3U8 標頭 #EXTM3U
                if (text.trim().startsWith('#EXTM3U')) {
                    triggerNativePlay(url);
                    return;
                }

                // 判斷方式 B: 網址關鍵字或 JSON 內的 url
                if (url.includes('.m3u8') || url.includes('/decode/')) {
                    let realUrl = url;
                    try {
                        const res = JSON.parse(text);
                        realUrl = res.data || res.url || url;
                    } catch(e) {}
                    triggerNativePlay(realUrl);
                }
            } catch (e) {}
        });
        return rawSend.apply(this, arguments);
    };

    // =============================================================
    // 5. 攔截 Fetch 請求（依據 #EXTM3U 內文特徵）
    // =============================================================
    const rawFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await rawFetch.apply(this, args);
        const clone = response.clone();
        try {
            const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            const text = await clone.text();

            if (text.trim().startsWith('#EXTM3U')) {
                triggerNativePlay(reqUrl);
            } else if (reqUrl.includes('.m3u8') || reqUrl.includes('/decode/')) {
                triggerNativePlay(reqUrl);
            }
        } catch (e) {}
        return response;
    };
})();