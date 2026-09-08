(function () {
  'use strict';

  // 避免重複注入
  if (window.__FKTV_INJECTED_V4__) return;
  window.__FKTV_INJECTED_V4__ = true;

  // 1. 標題清洗演算法
  function getCleanTitle() {
    try {
      var h1 = document.querySelector('h1, h2');
      if (h1 && h1.textContent.trim()) {
        return h1.textContent.trim().replace(/\s+/g, ' ');
      }
      if (document.title) {
        return document.title.split('-')[0].split('_')[0].trim();
      }
    } catch (e) {}
    return '凡客影視';
  }

  // 2. 嚴格媒體 URL 驗證（排除 .key / .ts / .bnc 等解密與分片檔）
  function isValidMediaUrl(url) {
    if (!url || typeof url !== 'string') return false;

    // 強制排除分片(.ts)、解密金鑰(.key)、加密塊(.bnc)、圖片、字型與分析 API
    if (
      /\.(ts|key|bnc|png|jpg|jpeg|gif|webp|svg|css|js|ico|vtt|srt|json)(\?|$)/i.test(url) ||
      /cloudflareinsights|google-analytics|hm\.baidu|eventTracking|doHistory/i.test(url)
    ) {
      return false;
    }

    // 只允許結尾或路徑純粹為 .m3u8 / .mp4 的主串流地址
    var cleanPath = url.split('?')[0].toLowerCase();
    if (cleanPath.endsWith('.m3u8') || cleanPath.endsWith('.mp4')) {
      return true;
    }

    return false;
  }

  // 3. 核心調度機制
  function triggerNativePlay(rawUrl) {
    if (!rawUrl) return;
    var fullUrl = rawUrl;
    try {
      fullUrl = new URL(rawUrl, location.href).href;
    } catch (e) {}

    // 防重複觸發
    if (window.__lastPlayedUrl === fullUrl) return;
    window.__lastPlayedUrl = fullUrl;

    console.log('🔥 [FKTV Inject] 成功捕獲 M3U8 主播放地址:', fullUrl);

    var retryCount = 0;
    function executePlay() {
      var title = getCleanTitle();
      if (window.fm && typeof window.fm.play === 'function') {
        console.log('✅ [FKTV Inject] 正在調用 fm.play');
        window.fm.play(fullUrl, title, {
          headers: { Referer: location.href },
          credentials: 'include'
        });
      } else if (window.AndroidJS && typeof window.AndroidJS.onMediaFound === 'function') {
        window.AndroidJS.onMediaFound(fullUrl);
      } else {
        if (retryCount < 50) {
          retryCount++;
          setTimeout(executePlay, 100);
        }
      }
    }

    executePlay();
  }

  // 4. 解析文本中的 .m3u8 (嚴格濾除 .key)
  function checkTextForM3u8(text) {
    if (!text || typeof text !== 'string') return;
    var match = text.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
    if (match && match[0] && isValidMediaUrl(match[0])) {
      triggerNativePlay(match[0]);
    }
  }

  // 5. 頂層網絡攔截
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    if (isValidMediaUrl(url)) {
      triggerNativePlay(url);
    }
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        if (this.responseText) {
          checkTextForM3u8(this.responseText);
        }
      } catch (e) {}
    });
    return origSend.apply(this, arguments);
  };

  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    if (isValidMediaUrl(url)) {
      triggerNativePlay(url);
    }

    return origFetch.apply(this, arguments).then(function (response) {
      try {
        var clone = response.clone();
        clone.text().then(function (text) {
          checkTextForM3u8(text);
        });
      } catch (e) {}
      return response;
    });
  };

  var origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    var src = this.currentSrc || this.src;
    if (isValidMediaUrl(src)) {
      triggerNativePlay(src);
    }
    return origPlay.apply(this, arguments);
  };

  function sniffVideo() {
    try {
      var videos = document.querySelectorAll('video');
      videos.forEach(function (v) {
        var src = v.currentSrc || v.src;
        if (isValidMediaUrl(src)) {
          triggerNativePlay(src);
        }
      });
    } catch (e) {}
  }

  var observer = new MutationObserver(sniffVideo);
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  setInterval(sniffVideo, 500);
  sniffVideo();

  console.log('✅ [FKTV Inject V4] 已啟動 (加強過濾 .key 解密檔與分片資源)');
})();