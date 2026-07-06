(function() {
    'use strict';

    function whenFm() {
        if (window.fm) return Promise.resolve(window.fm);
        return new Promise(function(resolve) {
            window.addEventListener('fmsdk', function() { resolve(window.fm); }, { once: true });
        });
    }

    whenFm().then(function(fm) {
        const BASE = 'https://www.4kcz.com';

        // ========== 2. 解析 iframe src 中的 url 参数 ==========
        function extractUrlFromPlayPage(html) {
            const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (!iframeMatch) return null;
            let src = iframeMatch[1];
            if (src.startsWith('/')) src = BASE + src;
            // 提取 url 参数
            const urlParam = src.match(/[?&]url=([^&]+)/);
            if (urlParam) {
                return {
                    raw: src,                     // 完整的 iframe src
                    param: decodeURIComponent(urlParam[1])  // url 参数的值
                };
            }
            // 如果没有 url 参数，可能 iframe 本身就是视频地址
            if (src.includes('.m3u8') || src.includes('.mp4')) {
                return { raw: src, param: src };
            }
            return null;
        }

        // ========== 3. 从 py.php 响应中提取真实视频地址 ==========
        async function fetchRealVideoFromPy(iframeUrl) {
            try {
                const response = await fm.req(iframeUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': BASE + '/'
                    },
                    responseType: 'text',
                    timeout: 15,
                    credentials: 'include'
                });

                // 1. 检查重定向
                if (response.headers && response.headers.Location) {
                    const location = response.headers.Location;
                    if (location.startsWith('/')) {
                        const baseUrl = new URL(iframeUrl);
                        return baseUrl.origin + location;
                    }
                    return location;
                }

                // 2. 从响应体中提取视频链接
                const body = response.body || '';
                // 匹配 .mp4 或 .m3u8 链接（排除广告域名）
                const match = body.match(/(https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8)[^"'\s<>]*)/i);
                if (match) {
                    const url = match[1];
                    if (!url.includes('gimg0.baidu.com') && !url.includes('meituan.net')) {
                        return url;
                    }
                }
                return null;
            } catch (e) {
                console.warn('[py.php 请求失败]', e);
                return null;
            }
        }

        // ========== 4. 播放逻辑（支持二次请求） ==========
        async function playEpisode(episodeUrl, title) {
            try {
                // 第一步：获取播放页 HTML
                const response = await fm.req(episodeUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': BASE + '/'
                    },
                    responseType: 'text',
                    timeout: 15
                });
                if (!response.ok) {
                    console.warn('请求播放页失败，切换嗅探');
                    await fm.play('push://' + episodeUrl, title || '4kcz 视频');
                    return;
                }

                const result = extractUrlFromPlayPage(response.body);
                if (!result) {
                    console.warn('未找到 iframe 或 url 参数，切换嗅探');
                    await fm.play('push://' + episodeUrl, title || '4kcz 视频');
                    return;
                }

                let videoUrl = null;

                // 检查 param 是否直接是视频地址
                if (result.param && (result.param.includes('.m3u8') || result.param.includes('.mp4'))) {
                    videoUrl = result.param;
                } else {
                    // 否则，请求 iframe 的完整 src (py.php) 来获取真实地址
                    console.log('🔍 加密链接，尝试解析 py.php...');
                    videoUrl = await fetchRealVideoFromPy(result.raw);
                }

                if (!videoUrl) {
                    console.warn('未能解析出视频地址，切换嗅探');
                    await fm.play('push://' + episodeUrl, title || '4kcz 视频');
                    return;
                }

                console.log('✅ 捕获到视频地址:', videoUrl);
                await fm.play(videoUrl, title || '4kcz 视频', {
                    headers: {
                        'Referer': BASE + '/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    credentials: 'include'
                });

            } catch (error) {
                console.error('播放失败:', error);
                await fm.play('push://' + episodeUrl, title || '4kcz 视频');
            }
        }

        // ========== 5. 拦截点击（不变） ==========
        function interceptClicks() {
            document.addEventListener('click', function(e) {
                const link = e.target.closest('a[href*="/v_play/"]');
                if (!link) return;
                e.preventDefault();
                e.stopPropagation();
                const href = link.getAttribute('href');
                const episodeUrl = href.startsWith('http') ? href : BASE + href;
                const title = document.querySelector('h1.entry-title, h1.pagetitle, .play-title')?.textContent?.trim() || '4kcz 视频';
                console.log('拦截剧集点击:', episodeUrl);
                playEpisode(episodeUrl, title);
            }, true);
        }

        // ========== 6. 广告清理（不变） ==========
        function removeAds() {
            try {
                const adSelectors = [
                    '.ad', '.ads', '.footerad', '.module-adslist', '.ads_w',
                    '.right-ad', '.top_hdp .swiper-slide a[target="_blank"]'
                ];
                adSelectors.forEach(function(sel) {
                    document.querySelectorAll(sel).forEach(function(el) {
                        const img = el.querySelector('img');
                        const src = img ? img.src || img.getAttribute('data-original') : '';
                        if (src && (src.includes('meituan.net') || src.includes('img.czzy66.com') || src.includes('gimg0.baidu.com'))) {
                            el.style.display = 'none';
                        }
                        if (el.classList.contains('ad') || el.classList.contains('module-adslist')) {
                            el.style.display = 'none';
                        }
                    });
                });
                document.querySelectorAll('img').forEach(function(img) {
                    const src = img.src || img.getAttribute('data-original') || '';
                    if (src.includes('meituan.net') || src.includes('gimg0.baidu.com/img/app')) {
                        const parent = img.closest('.ad, .ads, .footerad, .module-adslist, .right-ad, .top_hdp');
                        if (!parent) {
                            img.style.display = 'none';
                        }
                    }
                });
                document.querySelectorAll('.top_hdp .swiper-slide a[target="_blank"]').forEach(function(a) {
                    const img = a.querySelector('img');
                    if (img && (img.src || '').includes('meituan.net')) {
                        a.style.display = 'none';
                    }
                });
            } catch (e) {}
        }

        function watchAds() {
            const observer = new MutationObserver(function() {
                removeAds();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        // ========== 7. 启动 ==========
        setTimeout(removeAds, 500);
        setTimeout(removeAds, 1500);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                interceptClicks();
                watchAds();
            });
        } else {
            interceptClicks();
            watchAds();
        }

        console.log('✅ 4kcz 终极版注入脚本已启动（支持加密 py.php 解析）');
    });
})();