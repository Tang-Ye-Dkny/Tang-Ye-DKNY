# -*- coding: utf-8 -*-
# @Author  : Doubebly
# @Time    : 2025/1/21 23:07

import hashlib
import re
import sys
import time
import requests
sys.path.append('..')
from base.spider import Spider


class Spider(Spider):
    def getName(self):
        return "JieYingShi"

    def init(self, extend):
        self.home_url = 'https://yvyeigh.com'
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        }

    def getDependence(self):
        return []

    def isVideoFormat(self, url):
        pass

    def manualVideoCheck(self):
        pass

    def homeContent(self, filter):
        return {'class': [
            {'type_id': '1', 'type_name': '电影'},
            {'type_id': '2', 'type_name': '电视剧'},
            {'type_id': '4', 'type_name': '动漫'},
            {'type_id': '3', 'type_name': '综艺'}
        ]}

    def homeVideoContent(self):
        a = self.get_data(self.home_url)
        return {'list': a, 'parse': 0, 'jx': 0}

    def categoryContent(self, cid, page, filter, ext):
        url = self.home_url + f'/vod/show/id/{cid}/page/{page}'
        data = self.get_data(url)
        return {'list': data, 'parse': 0, 'jx': 0}

    def detailContent(self, did):
        ids = did[0]
        data = self.get_detail_data(ids)
        return {"list": data, 'parse': 0, 'jx': 0}

    def searchContent(self, key, quick, page='1'):
        if int(page) > 1:
            return {'list': [], 'parse': 0, 'jx': 0}
        url = self.home_url + f'/vod/search/{key}'
        data = self.get_data(url)
        return {'list': data, 'parse': 0, 'jx': 0}

    def playerContent(self, flag, pid, vipFlags):
        url = self.get_play_data(pid)
        # 保持直解直配 (parse=0)，並夾帶標準 headers 越過部分 CDN 的基礎防禦
        return {"url": url, "header": self.headers, "parse": 0, "jx": 0}

    def localProxy(self, params):
        pass

    def destroy(self):
        return '正在Destroy'

    def get_data(self, url):
        data = []
        try:
            res = requests.get(url, headers=self.headers, timeout=10)
            if res.status_code != 200:
                return data

            vod_id_s = re.findall(r'vodId\\*"\s*:\s*(\d+)', res.text)
            vod_name_s = re.findall(r'vodName\\*"\s*:\s*\\*"(.*?)\\*"', res.text)
            vod_pic_s = re.findall(r'vodPic\\*"\s*:\s*\\*"(.*?)\\*"', res.text)
            vod_remarks_s = re.findall(r'vodRemarks\\*"\s*:\s*\\*"(.*?)\\*"', res.text)

            if vod_id_s and vod_name_s:
                seen_ids = set()
                for i in range(min(len(vod_id_s), len(vod_name_s))):
                    v_id = vod_id_s[i]
                    if v_id in seen_ids:
                        continue
                    seen_ids.add(v_id)

                    vod_name = vod_name_s[i].replace('\\', '')
                    vod_pic = vod_pic_s[i].replace('\\', '') if i < len(vod_pic_s) else ''
                    vod_remarks = vod_remarks_s[i].replace('\\', '') if i < len(vod_remarks_s) else ''

                    data.append({
                        'vod_id': v_id,
                        'vod_name': vod_name,
                        'vod_pic': vod_pic,
                        'vod_remarks': vod_remarks,
                    })
                return data

        except requests.RequestException as e:
            print(e)
        return data

    def get_detail_data(self, ids):
        url = self.home_url + f'/api/mw-movie/anonymous/v2/video/detail?id={ids}'
        t = str(int(time.time() * 1000))
        headers = self.get_headers(t, f'id={ids}&key=cb808529bae6b6be45ecfab29a4889bc&t={t}')
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code != 200:
                url = self.home_url + f'/api/mw-movie/anonymous/video/detail?id={ids}'
                res = requests.get(url, headers=headers, timeout=10)
            
            res_json = res.json()
            i = res_json.get('data', {})
            if not i:
                return []

            urls = []
            episode_list_list = i.get('episodeListList', [])
            if episode_list_list:
                # 抓取第一條主要線路的選集列表
                track = episode_list_list[0]
                for item in track.get('episodeList', []):
                    name = item.get('name', '')
                    nid = item.get('nid', '')
                    urls.append(f'{name}${ids}-{nid}')
            else:
                # 兼容 fallback 到舊版普通列表
                episode_list = i.get('episodeList', [])
                for ii in episode_list:
                    name = ii.get('name', '')
                    nid = ii.get('nid', '')
                    urls.append(f'{name}${ids}-{nid}')

            data = {
                'type_name': i.get('vodClass', ''),
                'vod_id': i.get('vodId', ''),
                'vod_name': i.get('vodName', ''),
                'vod_remarks': i.get('vodRemarks', ''),
                'vod_year': str(i.get('vodYear', ''))[:4],
                'vod_area': i.get('vodArea', ''),
                'vod_actor': i.get('vodActor', ''),
                'vod_director': i.get('vodDirector', ''),
                'vod_content': i.get('vodContent', ''),
                # 依要求：直接將線路按鈕名稱固定顯示為「蓝光」
                'vod_play_from': '蓝光',
                'vod_play_url': '#'.join(urls),
            }
            return [data]

        except Exception as e:
            print(f"詳情頁解析異常: {e}")
        return []

    def get_play_data(self, play):
        info = play.split('-')
        _id = info[0]
        _pid = info[1]
        url = self.home_url + f'/api/mw-movie/anonymous/v2/video/episode/url?id={_id}&nid={_pid}'
        t = str(int(time.time() * 1000))
        headers = self.get_headers(t, f'id={_id}&nid={_pid}&key=cb808529bae6b6be45ecfab29a4889bc&t={t}')
        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code != 200:
                return ""
            
            data_list = res.json().get('data', {}).get('list', [])
            if not data_list:
                return ""

            play_url = ""
            # 優先篩選出 "resolutionName" 為 "蓝光" 的播放網址
            for item in data_list:
                if item.get('resolutionName') == '蓝光':
                    play_url = item.get('url', '')
                    break
            
            # 安全機制：如果該影片完全沒有提供藍光流，則自動採用回傳列表的第一個替代網址
            if not play_url:
                play_url = data_list[0].get('url', '')

            if play_url and not play_url.startswith('http'):
                play_url = self.home_url + play_url
            return play_url
        except Exception as e:
            print(e)
        return ""

    @staticmethod
    def get_headers(t, e):
        sign = hashlib.sha1(hashlib.md5(e.encode()).hexdigest().encode()).hexdigest()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'sign': sign,
            'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            't': t,
            'referer': 'https://www.hkybqufgh.com/',
        }
        return headers


if __name__ == '__main__':
    pass