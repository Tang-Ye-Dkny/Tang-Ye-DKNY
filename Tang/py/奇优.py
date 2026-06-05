# coding=utf-8
#!/usr/bin/env python3
# 奇优影视完整定制版 (從XBPQ升級純Py版)
import re
import sys
import urllib.parse
import requests
from bs4 import BeautifulSoup

# 禁用SSL证书验证警告
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.path.append('..')
from base.spider import Spider

class Spider(Spider):
    def getName(self):
        return "奇优影视"
    
    def init(self, extend=""):
        self.host = "http://www.qiyoudy2.com"
        # 配合原本XBPQ設定的"请求头": "手机"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
            'Referer': self.host
        }
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update(self.headers)

    def fetch(self, url, timeout=30, method="GET", data=None):
        try:
            if method == "POST":
                response = self.session.post(url, data=data, timeout=timeout, verify=False)
            else:
                response = self.session.get(url, timeout=timeout, verify=False)
            response.encoding = 'UTF-8'
            return response
        except:
            return None

    def homeContent(self, filter):
        # 保留完整分類邏輯：电影$1#电视剧$2#动漫$3#综艺$4
        result = {
            "class": [
                {'type_id': '1', 'type_name': '电影'},
                {'type_id': '2', 'type_name': '电视剧'},
                {'type_id': '3', 'type_name': '动漫'},
                {'type_id': '4', 'type_name': '综艺'}
            ],
            "list": []
        }
        rsp = self.fetch(self.host)
        if rsp and rsp.status_code == 200:
            result['list'] = self._extract_videos(rsp.text)
        return result

    def categoryContent(self, tid, pg, filter, extend):
        result = {"list": [], "page": int(pg), "pagecount": 99, "limit": 20, "total": 1980}
        # 依照原始分類配置：/list/{cateId}_{catePg}.html
        url = f"{self.host}/list/{tid}_{pg}.html"
        rsp = self.fetch(url)
        if rsp and rsp.status_code == 200:
            result['list'] = self._extract_videos(rsp.text)
        return result

    def searchContent(self, key, quick, pg=1):
        result = {"list": []}
        # 依照原始搜尋配置：/search.php;post;searchword={wd}
        url = f"{self.host}/search.php"
        data = {"searchword": key}
        rsp = self.fetch(url, method="POST", data=data)
        if rsp and rsp.status_code == 200:
            result['list'] = self._extract_search_results(rsp.text)
        return result

    def detailContent(self, ids):
        result = {"list": []}
        vid = ids[0]
        # 支援可能傳入完整相對路徑或純ID
        url = vid if vid.startswith('http') else f"{self.host}{vid}"
        if '/view/' not in url and not url.endswith('.html'):
            url = f"{self.host}/view/{vid}.html"
            
        rsp = self.fetch(url)
        if not rsp or rsp.status_code != 200:
            return result
            
        html = rsp.text
        play_from, play_url = self._extract_play_info(html)
        
        if play_from:
            result['list'] = [{
                'vod_id': vid,
                'vod_name': self._extract_title(html),
                'vod_pic': self._extract_pic(html),
                'vod_content': self._extract_desc(html),
                'vod_remarks': self._extract_remarks(html),
                'vod_play_from': "$$$".join(play_from),
                'vod_play_url': "$$$".join(play_url)
            }]
        return result

    def playerContent(self, flag, id, vipFlags):
        result = {"parse": 1, "playUrl": "", "url": ""}
        url = id if id.startswith('http') else f"{self.host}{id}"
        
        rsp = self.fetch(url)
        if not rsp or rsp.status_code != 200:
            return result
            
        # 核心解析部分：從網頁內提取真實播放流（通常包含m3u8等參數）
        real_url_match = re.search(r'var player_aaaa=.*?"url":"([^"]+)"', rsp.text, re.S | re.I)
        if real_url_match:
            real_url = real_url_match.group(1).replace(r'\u002F', '/').replace(r'\/', '/')
            if real_url.startswith('http'):
                result["parse"] = 0
                result["url"] = real_url
                return result
                
        # 若無法直解，則交給FongMi內建核心去跑核心解析
        result["url"] = url
        return result

    # --- 內部解析核心方法 ---

    def _extract_videos(self, html):
        videos = []
        # 對應原始數組配置: <div class="stui-vodlist__box">&&</a>
        soup = BeautifulSoup(html, 'html.parser')
        items = soup.select('.stui-vodlist__box')
        for item in items:
            link_elem = item.select_one('a')
            if not link_elem:
                continue
            title = link_elem.get('title', '').strip()
            href = link_elem.get('href', '').strip()
            pic = link_elem.get('data-original', '').strip()
            
            remark_elem = item.select_one('.text-right')
            remark = remark_elem.get_text(strip=True) if remark_elem else ""
            
            videos.append({
                'vod_id': href,
                'vod_name': title,
                'vod_pic': pic,
                'vod_remarks': remark
            })
        return videos

    def _extract_search_results(self, html):
        videos = []
        # 對應原始搜尋數組: v-thumb stui-vodlist__thumb&&</a>
        soup = BeautifulSoup(html, 'html.parser')
        items = soup.select('.v-thumb.stui-vodlist__thumb')
        for item in items:
            title = item.get('title', '').strip()
            href = item.get('href', '').strip()
            pic = item.get('data-original', '').strip()
            
            remark_elem = item.select_one('.text-right')
            remark = remark_elem.get_text(strip=True) if remark_elem else ""
            
            videos.append({
                'vod_id': href,
                'vod_name': title,
                'vod_pic': pic,
                'vod_remarks': remark
            })
        return videos

    def _extract_play_info(self, html):
        play_from, play_url = [], []
        soup = BeautifulSoup(html, 'html.parser')
        
        # 1. 抓取線路標籤
        tab_items = soup.select('ul.nav-tabs li a[data-toggle="tab"]')
        
        # 2. 抓取對應的選集播放區塊
        playlist_containers = soup.select('.stui-content__playlist')
        
        for idx, tab in enumerate(tab_items):
            # 原始網頁文字可能是無意義的"播放源1"，這裡利用 Python 聰明地做網址特徵嗅探
            raw_line_name = tab.get_text(strip=True)
            
            if idx < len(playlist_containers):
                ep_links = playlist_containers[idx].select('li a')
                if not ep_links:
                    continue
                
                # 拿該線路第一集的網址來做「線路特徵分析」
                sample_href = ep_links[0].get('href', '')
                
                # 🧠 破法：網址特徵精準鎖定線路代號！
                # 網址格式範例: /play/45928-1-1.html
                line_flag = "線路"
                route_match = re.search(r'/play/\d+-(\d+)-\d+\.html', sample_href)
                if route_match:
                    route_num = route_match.group(1)
                    line_flag = f"⚡️奇优專線-{route_num}號"
                else:
                    line_flag = f"🎬{raw_line_name}"

                play_from.append(line_flag)
                
                # 組合該線路底下的所有集數
                eps = []
                for ep in ep_links:
                    ep_name = ep.get_text(strip=True)
                    ep_href = ep.get('href', '').strip()
                    eps.append(f"{ep_name}${ep_href}")
                    
                play_url.append("#".join(eps))
                
        return play_from, play_url

    def _extract_title(self, html):
        soup = BeautifulSoup(html, 'html.parser')
        # 1. 嘗試原來的標籤
        title_elem = soup.select_one('.stui-content__detail .title') or soup.select_one('.stui-content__detail h1') or soup.select_one('.stui-player__detail h1')
        if title_elem:
            return title_elem.get_text(strip=True)
        
        # 2. 嘗試從網頁的 <title> 標籤裡面摳出電影名字
        title_tag = soup.select_one('title')
        if title_tag:
            page_title = title_tag.get_text(strip=True)
            match = re.search(r'《(.*?)》', page_title)
            if match:
                return match.group(1).strip()
            # 如果沒有書名號，直接拿前面的字
            return page_title.split('_')[0].split('-')[0].strip()
            
        # 3. 嘗試原來的 meta
        meta_title = re.search(r'<meta property="og:title" content="([^"]+)"', html, re.S | re.I)
        if meta_title:
            name = meta_title.group(1)
            # 簡化清除小尾巴的邏輯
            for suffix in ["高清版", "手机在线", "免费观看", "奇优影院", "手机版", "_"]:
                name = name.replace(suffix, "")
            return name.strip()
            
        return "未知影片"

    def _extract_pic(self, html):
        meta_pic = re.search(r'<meta property="og:image" content="([^"]+)"', html, re.S | re.I)
        return meta_pic.group(1).strip() if meta_pic else ""

    def _extract_desc(self, html):
        soup = BeautifulSoup(html, 'html.parser')
        desc_elem = soup.select_one('.stui-content__detail .detail-content')
        if desc_elem:
            return desc_elem.get_text(strip=True)
        return "暂无简介"

    def _extract_remarks(self, html):
        soup = BeautifulSoup(html, 'html.parser')
        data_elems = soup.select('.stui-content__detail .data')
        remarks = []
        for elem in data_elems[:3]: # 抓取類型、年份、地區等元數據
            text = elem.get_text(strip=True).replace("\xa0", " ")
            if text:
                remarks.append(text)
        return " | ".join(remarks) if remarks else "奇优高清"

# 本地調試測試
if __name__ == "__main__":
    spider = Spider()
    spider.init()
    # 測試分類首頁
    print("--- 測試首頁加載 ---")
    print(spider.homeContent(False))