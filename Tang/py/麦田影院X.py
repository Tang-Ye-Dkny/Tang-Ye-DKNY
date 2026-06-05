# -*- coding: utf-8 -*-
# 麦田影院 - 精简优化版
import re
import sys
import json
from urllib.parse import quote, unquote, urljoin
from pyquery import PyQuery as pq
from xml.etree import ElementTree as ET
sys.path.append('..')
from base.spider import Spider

class Spider(Spider):
    def init(self, extend=""):
        # 預設一個絕對安全的健康網址，作為基地台炸毀時的兜底方案
        self.host = "https://www.mtyy2.cc" 
        
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 11; MI 11) AppleWebKit/537.36 TVBox/1.0',
            'Accept': 'text/html,application/xml;q=0.9,*/*;q=0.8',
            'Connection': 'keep-alive'
        }

        print("⚡️ [麥田影院] 啟動總基地(mtyy.tv)動態域名嗅探...")
        import requests
        import time
        import re
        
        # 禁用 SSL 警告
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        alive_urls = []
        try:
            # 1. 直接突襲發佈頁總基地，設定 1.5 秒超時防止卡死
            base_rsp = requests.get("https://mtyy.tv/", headers=self.headers, timeout=1.5, verify=False)
            if base_rsp.status_code == 200:
                base_rsp.encoding = 'utf-8'
                # 2. 暴力抓取網頁上所有帶有 mtyy 關鍵字的網址（站長無論換成 .cc/.top/.club 都能抓到）
                found_urls = re.findall(r'https?://www\.mtyy\d+\.[a-zA-Z0-9]+', base_rsp.text)
                # 去除重複網址
                alive_urls = list(set(found_urls))
        except Exception as e:
            print(f"❌ 總基地連線失敗，啟用本地硬編碼備用線路。原因: {str(e)}")

        # 如果發佈頁打不開，自動啟用 1~9 號本地備用清單
        if not alive_urls:
            alive_urls = [f"https://www.mtyy{i}.cc" for i in range(1, 10)]

        print(f"🔍 掃描到待測速線路共 {len(alive_urls)} 條，開始執行高精度毫秒測速...")
        
        best_host = self.host
        fastest_time = 999.0

        # 3. 帶著標準瀏覽器偽裝（Headers）去挨個測速
        for url in alive_urls:
            try:
                start_time = time.time()
                # 模擬人類點擊，帶上偽裝，超時卡在 0.8 秒（快速輪詢）
                response = requests.get(url, headers=self.headers, timeout=0.8, verify=False)
                if response.status_code == 200:
                    elapsed_time = time.time() - start_time
                    # 誰回應的毫秒數最短，誰就是今天的首選線路
                    if elapsed_time < fastest_time:
                        fastest_time = elapsed_time
                        best_host = url
            except:
                continue

        # 4. 鎖定本次最快主機
        self.host = best_host
        self.headers['Referer'] = self.host # 動態同步 Referer 防盜鏈
        
        print(f"🏆 測速決賽冠軍：[{self.host}] 耗時：{int(fastest_time * 1000)}ms，已成功鎖定為主體通道！")

        # 以下保留你原本的源映射與預設圖片設定
        self.source_map = {
            "toutiao": "BD源",
            "xigua": "BD源",
            "xg": "BD源",
            "NBY": "高清NB源", 
            "1080zyk": "超清YZ源", 
            "ffm3u8": "极速FF源", 
            "lzm3u8": "稳定LZ源", 
            "yzzy": "YZ源"
        }
        self.DEFAULT_PIC = "https://pic.rmb.bdstatic.com/bjh/1d0b02d0f57f0a4212da8865de018520.jpeg"

    def getName(self):
        return "麦田影院"

    # 合并工具方法：编码修复+文本清理
    def clean_text(self, text):
        if not text: return ""
        try:
            if isinstance(text, bytes):
                text = text.decode('utf-8', errors='ignore') if 'utf-8' in str(text) else text.decode('gbk', errors='ignore')
            if '\\u' in text: text = text.encode('utf-8').decode('unicode_escape', errors='ignore')
            return re.sub(r'[\x00-\x1f\x7f]', '', text).strip()
        except:
            return str(text)

    # 简化请求方法
    def fetch_page(self, url, headers=None):
        try:
            resp = self.fetch(url, headers=headers or self.headers, timeout=15)
            resp.encoding = 'utf-8'
            if resp.status_code != 200: raise Exception(f"HTTP {resp.status_code}")
            return resp.text
        except Exception as e:
            self.log(f"Fetch err: {str(e)}")
            return ""

    # 首页内容
    def homeContent(self, filter):
        html = self.fetch_page(self.host)
        doc = pq(html) if html else pq('')
        result = {'class': [], 'list': []}

        # 提取分类
        for a in doc('div.head-nav a[href*="/vodtype/"]').items():
            if (cid := re.search(r'/vodtype/(\d+)\.html', a.attr('href'))):
                result['class'].append({'type_name': self.clean_text(a.text()), 'type_id': cid.group(1)})

        # 提取首页影片
        for box in doc('.public-list-box.public-pic-b').items():
            if (link := box.find('a.public-list-exp')) and (vid := re.search(r'/voddetail/(\d+)\.html', link.attr('href'))):
                img = link.find('img')
                result['list'].append({
                    'vod_id': vid.group(1),
                    'vod_name': self.clean_text(link.attr('title') or img.attr('alt')),
                    'vod_pic': urljoin(self.host, img.attr('data-src') or img.attr('src') or ""),
                    'vod_remarks': self.clean_text(box.find('.public-prt').text())
                })
        return result

    # 分类内容
    def categoryContent(self, tid, pg, filter, extend):
        url = f"{self.host}/vodtype/{tid}-{pg}.html" if int(pg) > 1 else f"{self.host}/vodtype/{tid}.html"
        html = self.fetch_page(url)
        doc = pq(html) if html else pq('')
        videos = []

        for box in doc('.public-list-box.public-pic-b').items():
            if (link := box.find('a')) and (vid := re.search(r'/voddetail/(\d+)\.html', link.attr('href'))):
                img = link.find('img')
                videos.append({
                    'vod_id': vid.group(1),
                    'vod_name': self.clean_text(link.attr('title') or img.attr('alt')),
                    'vod_pic': urljoin(self.host, img.attr('data-src') or img.attr('src') or ""),
                    'vod_remarks': self.clean_text(box.find('.public-prt').text())
                })
        return {'list': videos, 'page': pg, 'pagecount': 999, 'limit': 20, 'total': 9999}

    # 影片详情
    def detailContent(self, ids):
        if not ids: return {"list": []}
        vid = ids[0]
        html = self.fetch_page(f"{self.host}/voddetail/{vid}.html")
        doc = pq(html) if html else pq('')
        vod_info = {
            "vod_id": vid,
            "vod_name": self.clean_text(doc('h1.player-title-link').text()),
            "vod_pic": urljoin(self.host, doc('.role-card img').attr('data-src') or ""),
            "vod_content": self.clean_text(doc('.card-text').text()),
            "vod_play_from": "",
            "vod_play_url": ""
        }

        # 解析播放源
        play_url = urljoin(self.host, doc('.anthology-list-play a:first').attr('href') or f"/vodplay/{vid}-1-1.html")
        play_html = self.fetch_page(play_url)
        play_doc = pq(play_html) if play_html else pq('')
        sources = {}

        for tab in play_doc('a.vod-playerUrl[data-form]').items():
            form = tab.attr('data-form')
            sname = self.source_map.get(form, self.clean_text(tab.text()))
            idx = list(play_doc('a.vod-playerUrl[data-form]')).index(tab[0])
            eps = [f"{self.clean_text(e.text())}${urljoin(self.host, e.attr('href'))}" 
                   for e in play_doc('.anthology-list-box').eq(idx).find('a').items() if e.text() and e.attr('href')]
            if eps: sources[sname] = '#'.join(eps)

        # 🌟 終極萬能排序邏輯
        final_from, final_url = [], []
        
        # 1. 遍歷目前抓到的所有播放源名字，只要名字裡面包含 "BD" 兩個字（不論是BD源24、BD播放地址還是BD高清）
        bd_keys = [k for k in sources.keys() if "BD" in k]
        for k in bd_keys:
            final_from.append(k)
            final_url.append(sources.pop(k)) # 抓出來塞進線路 1 並從名單移除
            
        # 2. 接著處理原本的高清NB源，順延變成線路 2
        nb_keys = [k for k in sources.keys() if "NB" in k]
        for k in nb_keys:
            final_from.append(k)
            final_url.append(sources.pop(k))
            
        # 3. 剩下的其他所有線路，依序排在後面
        final_from.extend(sources.keys())
        final_url.extend(sources.values())
        
        vod_info["vod_play_from"] = "$$$".join(final_from)
        vod_info["vod_play_url"] = "$$$".join(final_url)
        return {"list": [vod_info]}

    # 搜索功能（XML解析+网页兜底）
    def searchContent(self, key, quick, pg="1"):
        # 1. RSS搜索
        try:
            rss_url = f"{self.host}/rss.xml?wd={quote(key)}"
            if (html := self.fetch_page(rss_url, headers={**self.headers, 'Accept': 'application/xml'})):
                root = ET.fromstring(html)
                videos = []
                seen = set()
                for item in root.findall('.//item'):
                    if (link := self.clean_text(item.findtext('link'))) and (vid := re.search(r'/voddetail/(\d+)\.html', link)):
                        if vid.group(1) in seen: continue
                        seen.add(vid.group(1))
                        title = self.clean_text(item.findtext('title'))
                        if title:
                            videos.append({
                                "vod_id": vid.group(1),
                                "vod_name": title,
                                "vod_pic": self.DEFAULT_PIC,
                                "vod_remarks": f"主演: {self.clean_text(item.findtext('author'))[:15]}..." if item.findtext('author') else ""
                            })
                if videos: return {"list": videos, "page": int(pg)}
        except Exception as e:
            self.log(f"RSS err: {str(e)}")

        # 2. 网页兜底搜索
        try:
            search_url = f"{self.host}/vodsearch/{quote(key)}---{pg}---.html"
            html = self.fetch_page(search_url)
            doc = pq(html) if html else pq('')
            videos = []
            seen = set()
            for box in doc('.public-list-box.public-pic-b').items():
                if (link := box.find('a')) and (vid := re.search(r'/voddetail/(\d+)\.html', link.attr('href'))):
                    if vid.group(1) in seen: continue
                    seen.add(vid.group(1))
                    img = link.find('img')
                    videos.append({
                        "vod_id": vid.group(1),
                        "vod_name": self.clean_text(link.attr('title') or img.attr('alt')),
                        "vod_pic": urljoin(self.host, img.attr('data-src') or img.attr('src') or self.DEFAULT_PIC),
                        "vod_remarks": self.clean_text(box.find('.public-prt').text())
                    })
            return {"list": videos, "page": int(pg)}
        except Exception as e:
            self.log(f"Web search err: {str(e)}")
            return {"list": [], "page": int(pg)}

    # 播放解析
    def isVideoUrl(self, url):
        return any(ext in url.lower() for ext in ['.mp4', '.m3u8', '.flv'])

    def playerContent(self, flag, id, vipFlags):
        play_url = urljoin(self.host, id)
        if not play_url.startswith(('http', 'https')):
            return {"parse": 1, "url": play_url, "header": self.headers}

        if (html := self.fetch_page(play_url)) and (match := re.search(r'var player_aaaa=({[^}]+?url:[^}]+})', html, re.DOTALL)):
            try:
                data = json.loads(re.sub(r',\s*([}\]])', r'\1', match.group(1)))
                main = unquote(data.get('url', '')).strip()
                backup = unquote(data.get('url_next', '')).strip()
                play_addr = main if self.isVideoUrl(main) else backup if self.isVideoUrl(backup) else play_url
                return {
                    "parse": 0 if self.isVideoUrl(play_addr) else 1,
                    "url": play_addr,
                    "header": {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": play_url}
                }
            except Exception as e:
                self.log(f"Player parse err: {str(e)}")
        return {"parse": 1, "url": play_url, "header": self.headers}
