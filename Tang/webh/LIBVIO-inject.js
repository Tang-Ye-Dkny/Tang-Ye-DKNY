(function() {
    'use strict';

    function whenFm() {
        if (window.fm) return Promise.resolve(window.fm);
        return new Promise(function(resolve) {
            window.addEventListener('fmsdk', function() { resolve(window.fm); }, { once: true });
        });
    }

    whenFm().then(function(fm) {
        const BASE = 'https://www.libvios.com';

        // 清理反斜杠转义符
        function cleanVideoUrl(url) {
            if (!url || typeof url !== 'string') return url;
            return url.replace(/\\\//g, '/');
        }

        // 验证是否为有效视频地址
        function isValidVideoUrl(url) {
            if (!url || typeof url !== 'string') return false;
            const cleaned = cleanVideoUrl(url);
            return /^https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)/i.test(cleaned);
        }

        // 尝试 Base64 解码
        function tryDecodeBase64(str) {
            try {
                if (!/^[A-Za-z0-9+/=]+$/.test(str)) return null;
                const decoded = atob(str);
                if (isValidVideoUrl(decoded)) return decoded;
                return null;
            } catch(e) {
                return null;
            }
        }

        // 提取视频地址
        function extractVideoUrl(html) {
            // 1. iframe
            const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframeMatch) {
                let src = iframeMatch[1];
                if (src.startsWith('/')) src = BASE + src;
                const urlParam = src.match(/[?&]url=([^&]+)/);
                if (urlParam) {
                    const decoded = decodeURIComponent(urlParam[1]);
                    const cleaned = cleanVideoUrl(decoded);
                    if (isValidVideoUrl(cleaned)) return cleaned;
                    const base64Decoded = tryDecodeBase64(cleaned);
                    if (base64Decoded && isValidVideoUrl(base64Decoded)) return base64Decoded;
                    return cleaned;
                }
                return cleanVideoUrl(src);
            }

            // 2. <video> 标签
            const videoMatch = html.match(/<video[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
            if (videoMatch) {
                const cleaned = cleanVideoUrl(videoMatch[1]);
                if (isValidVideoUrl(cleaned)) return cleaned;
            }

            // 3. player_aaaa
            const playerMatch = html.match(/var\s+player_aaaa\s*=\s*\{[^}]*"url"\s*:\s*"([^"]+)"/i);
            if (playerMatch) {
                const cleaned = cleanVideoUrl(playerMatch[1]);
                if (isValidVideoUrl(cleaned)) return cleaned;
                const base64Decoded = tryDecodeBase64(cleaned);
                if (base64Decoded && isValidVideoUrl(base64Decoded)) return base64Decoded;
                return cleaned;
            }

            // 4. 兜底匹配
            const anyMatch = html.match(/(https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)/i);
            if (anyMatch) {
                const cleaned = cleanVideoUrl(anyMatch[1]);
                if (isValidVideoUrl(cleaned)) return cleaned;
            }

            return null;
        }

        async function playEpisode(episodeUrl, title) {
            try {
                const response = await fm.req(episodeUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': BASE + '/'
                    },
                    responseType: 'text',
                    timeout: 15
                });

                if (response.ok) {
                    let videoUrl = extractVideoUrl(response.body);
                    if (videoUrl) {
                        // 清理转义符并验证
                        const cleaned = cleanVideoUrl(videoUrl);
                        if (isValidVideoUrl(cleaned)) {
                            videoUrl = cleaned;
                        } else {
                            // 尝试 Base64 解码
                            const base64Decoded = tryDecodeBase64(videoUrl);
                            if (base64Decoded && isValidVideoUrl(base64Decoded)) {
                                videoUrl = base64Decoded;
                            } else {
                                videoUrl = null;
                            }
                        }
                    }

                    if (videoUrl && isValidVideoUrl(videoUrl)) {
                        console.log('✅ 解析到视频地址:', videoUrl);
                        await fm.play(videoUrl, title || 'LIBVIO 视频', {
                            headers: {
                                'Referer': BASE + '/',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                            },
                            credentials: 'include'
                        });
                        return;
                    }
                }

                // 兜底：嗅探模式
                console.log('🔄 切换嗅探模式（push）');
                await fm.play('push://' + episodeUrl, title || 'LIBVIO 视频');

            } catch (error) {
                console.error('播放失败:', error);
                await fm.play('push://' + episodeUrl, title || 'LIBVIO 视频');
            }
        }

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
                            const title = document.querySelector('h1.title')?.textContent?.trim() || 'LIBVIO 视频';
                            console.log('拦截“立即播放”点击:', episodeUrl);
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
                const title = document.querySelector('h1.title')?.textContent?.trim() || 'LIBVIO 视频';
                console.log('拦截剧集点击:', episodeUrl);
                playEpisode(episodeUrl, title);
            }, true);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', interceptClicks);
        } else {
            interceptClicks();
        }

        console.log('✅ LIBVIO 增强版注入脚本已启动（含转义清理）');
    });
})();