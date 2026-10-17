# -*- coding: utf-8 -*-
import sys
import re
import json
import requests
from urllib.parse import quote, unquote
from bs4 import BeautifulSoup

sys.path.append('..')
try:
    from base.spider import Spider as BaseSpider
except Exception:
    BaseSpider = object

class Spider(BaseSpider):
    def getName(self):
        return "可可影视"

    def init(self, extend=""):
        self.host = "https://www.kkys19.com"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; HD1900 Build/QKQ1.190716.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/154.0.8037.106 Mobile Safari/537.36",
            "Referer": self.host
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)

    def _fetch_html(self, url):
        try:
            r = self.session.get(url, timeout=15)
            r.encoding = 'utf-8'
            return r.text
        except Exception as e:
            print(f"[可可] 请求失败: {url}, 错误: {e}")
            return ""

    # ================= 强力片名清洗与备注提取 =================
    def _clean_name(self, raw_name):
        if not raw_name:
            return "", ""
        raw_name = re.sub(r'可可影视[-\s]*kekys\.com', '', raw_name, flags=re.IGNORECASE)
        raw_name = re.sub(r'可可影视', '', raw_name)
        raw_name = re.sub(r'kekys\.com', '', raw_name, flags=re.IGNORECASE)
        raw_name = re.sub(r'[-\s]*可可影视.*$', '', raw_name)
        raw_name = re.sub(r'[-\s]*kekys.*$', '', raw_name, flags=re.IGNORECASE)
        
        remarks = ""
        match = re.match(r'^(HD[\u4e00-\u9fa5a-zA-Z0-9\|]*|正片|完结|已完结|全\d+集|TC|Ts抢先|抢先版|更新至[\d第集期]+|更新第\d+集|第\d+集完结|第\d+期|更新至\d+年\d+月\d+日|更新至\d+[（\(]?期?[）\)]?|豆瓣:[\d\.]+分)', raw_name)
        if match:
            remarks = match.group(1)
            raw_name = raw_name[len(remarks):].strip()
        
        raw_name = re.sub(r'^[\|/\|\-_]+', '', raw_name).strip()
        remarks = remarks.strip()
        
        if not raw_name:
            raw_name = "未知影片"
            
        return raw_name, remarks

    def homeContent(self, filter):
        result = {
            "class": [
                {"type_id": "1", "type_name": "电影"},
                {"type_id": "2", "type_name": "连续剧"},
                {"type_id": "3", "type_name": "动漫"},
                {"type_id": "4", "type_name": "综艺纪录"},
                {"type_id": "6", "type_name": "短剧"}
            ],
            "list": []
        }
        html = self._fetch_html(self.host + "/")
        if html:
            result['list'] = self._parse_video_list(html)
        return result

    def categoryContent(self, tid, pg, filter, extend):
        page = int(pg) if pg else 1
        url = f"{self.host}/channel/{tid}.html" if page == 1 else f"{self.host}/channel/{tid}-{page}.html"
        html = self._fetch_html(url)
        result = {
            "list": self._parse_video_list(html) if html else [],
            "page": page,
            "pagecount": 9999,
            "limit": 20,
            "total": 9999
        }
        return result

    def searchContent(self, key, quick, pg="1"):
        t_val = ""
        try:
            search_home = self._fetch_html(self.host + "/search")
            if search_home:
                soup = BeautifulSoup(search_home, 'html.parser')
                t_input = soup.select_one('input[name="t"]')
                if t_input:
                    t_val = t_input.get('value', '')
        except Exception as e:
            print(f"[可可搜索] 获取 Token 失败: {e}")

        if t_val:
            url = f"{self.host}/search?t={quote(t_val)}&k={quote(key)}"
        else:
            url = f"{self.host}/search?k={quote(key)}"

        if int(pg) > 1:
            url += f"&page={pg}"

        html = self._fetch_html(url)
        return {
            "list": self._parse_video_list(html) if html else [],
            "page": int(pg),
            "pagecount": 99,
            "limit": 20,
            "total": 9999
        }

    def _parse_video_list(self, html):
        soup = BeautifulSoup(html, 'html.parser')
        videos = []
        for a in soup.select('a[href*="/detail/"]'):
            href = a.get('href', '')
            vod_id_match = re.search(r'/detail/(\d+)\.html', href)
            if not vod_id_match:
                continue
            vod_id = vod_id_match.group(1)
            
            raw_name = ""
            if a.has_attr('title'):
                raw_name = a['title'].strip()
            
            if not raw_name:
                title_tag = a.select_one('h3') or a.select_one('.title') or a.select_one('.name')
                raw_name = title_tag.get_text(strip=True) if title_tag else a.get_text(strip=True)
            
            vod_name, parsed_remarks = self._clean_name(raw_name)
            
            img_tag = a.select_one('img')
            vod_pic = ""
            if img_tag:
                vod_pic = img_tag.get('data-src') or img_tag.get('src') or ""
                if vod_pic.startswith('//'):
                    vod_pic = 'https:' + vod_pic
                elif vod_pic.startswith('/'):
                    vod_pic = self.host + vod_pic
                    
            remark_tag = a.select_one('.note') or a.select_one('.remarks') or a.select_one('.text-green-500')
            vod_remarks = remark_tag.get_text(strip=True) if remark_tag else ""
            if not vod_remarks:
                vod_remarks = parsed_remarks
            else:
                vod_remarks = re.sub(r'^(HD国语|HD中字|正片|完结|已完结|更新至\d+集?|更新第\d+集?|第\d+集?|全\d+集|豆瓣:[\d\.]+分|TC|Ts抢先|抢先版)\s*', '', vod_remarks)

            if vod_id and vod_name:
                videos.append({
                    "vod_id": vod_id,
                    "vod_name": vod_name,
                    "vod_pic": vod_pic,
                    "vod_remarks": vod_remarks
                })
        return videos

    def detailContent(self, ids):
        vod_id = ids[0] if isinstance(ids, list) else ids
        url = f"{self.host}/detail/{vod_id}.html"
        html = self._fetch_html(url)
        if not html:
            return {"list": []}

        soup = BeautifulSoup(html, 'html.parser')
        
        vod_name = ""
        if soup.title:
            raw_title = soup.title.get_text(strip=True)
            vod_name = re.split(r'[-_|]', raw_title)[0].strip()
        
        if not vod_name or 'kkys' in vod_name.lower():
            h1_tag = soup.select_one('h1')
            if h1_tag:
                vod_name = h1_tag.get_text(strip=True)
                vod_name = re.sub(r'kkys\d*\.com', '', vod_name).strip()
                vod_name = re.sub(r'^[\-\s]+', '', vod_name)

        vod_name, _ = self._clean_name(vod_name)

        # === 优化：全量抓取所有线路与对应剧集（支援超过10条以上线路） ===
        line_map = {}

        # 抓取所有包含 /play/ 的播放連結，並建立完整對應[cite: 20]
        all_episodes = soup.select('a[href*="/play/"]')
        for ep in all_episodes:
            href = ep.get('href', '')
            match = re.search(r'/play/\d+-(\d+)-(\d+)\.html', href)
            if match:
                line_id = match.group(1)
                ep_name = ep.get_text(strip=True)
                ep_name = re.sub(r'[^\u4e00-\u9fa5a-zA-Z0-9]', '', ep_name)
                if not ep_name:
                    ep_name = f"第{len(line_map.get(line_id, [])) + 1}集"
                
                if line_id not in line_map:
                    line_map[line_id] = []
                
                item_str = f"{ep_name}${self.host}{href}"
                if item_str not in line_map[line_id]:
                    line_map[line_id].append(item_str)
        
        play_from_list = []
        play_url_list = []
        for line_id, eps in line_map.items():
            # 智能過濾頂部 banner 的「立即播放」按鈕重複項，保留正常集數
            has_other_eps = len([e for e in eps if not e.startswith("立即播放") and not e.startswith("播放")]) > 0
            cleaned_eps = []
            for ep_str in eps:
                name, url_path = ep_str.split('$', 1)
                if name in ["立即播放", "播放"]:
                    if has_other_eps:
                        continue  # 若已有正常集數，直接跳過重複的立即播放按鈕
                    else:
                        name = "正片"  # 若為單集電影無其他集數，則轉正為正片
                cleaned_eps.append(f"{name}${url_path}")
            
            if cleaned_eps:
                line_name = f"线路{line_id}"
                play_from_list.append(line_name)
                play_url_list.append("#".join(cleaned_eps))

        if not play_from_list:
            play_from_list.append("默认线路")
            play_url_list.append(f"播放${self.host}/play/{vod_id}.html")

        vod = {
            "vod_id": vod_id,
            "vod_name": vod_name,
            "vod_pic": "",
            "vod_content": "",
            "vod_play_from": "$$$".join(play_from_list),
            "vod_play_url": "$$$".join(play_url_list)
        }
        return {"list": [vod]}

    def playerContent(self, flag, id, vipFlags):
        url = id if id.startswith('http') else self.host + id
        html = self._fetch_html(url)
        if not html:
            return {"parse": 0, "url": "", "header": ""}

        m3u8_match = re.search(r'(https?://[^\s"\'<>]+\.m3u8[^\s"\'<>]*)', html)
        if m3u8_match:
            m3u8_url = m3u8_match.group(1).replace(r'\/', '/')
            return {
                "parse": 0,
                "url": m3u8_url,
                "header": json.dumps(self.headers)
            }
        
        return {"parse": 1, "url": url, "header": json.dumps(self.headers)}

    def localProxy(self, params):
        return [404, "text/plain", "Not Found"]