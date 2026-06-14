# -*- coding: utf-8 -*-
import requests
import re
import random
from typing import Dict, List, Optional
import sys

sys.path.append('..')
from base.spider import Spider


class Spider(Spider):
    """凡客影视 Python 爬虫 - 完整重写版（严格遵循JS逻辑）"""

    def __init__(self):
        super().__init__()
        self.session = None
        self._init_config()

    def _init_config(self):
        """初始化配置"""
        self.home_url = 'https://fktv.me'
        self.timeout = 15
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": self.home_url + '/'
        }

    # ----------------------------------------------
    # 辅助函数
    # ----------------------------------------------

    def _generate_cookie(self) -> str:
        """生成随机 _did Cookie（32位字符串）"""
        chars = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz102345678"
        return ''.join(random.choice(chars) for _ in range(32))

    def _get_placeholder_pic(self, name: str) -> str:
        """生成占位图片URL"""
        return f"https://via.placeholder.com/300x450/333/fff?text={name}"

    def _make_request(self, url: str, method: str = 'GET', **kwargs) -> Optional[requests.Response]:
        """统一请求方法（带Referer和异常处理）"""
        try:
            if method.upper() == 'GET':
                resp = self.session.get(url, timeout=self.timeout, **kwargs)
            else:
                resp = self.session.post(url, timeout=self.timeout, **kwargs)
            resp.raise_for_status()
            return resp
        except Exception as e:
            print(f"请求失败: {url} | 错误: {str(e)}")
            return None

    # ----------------------------------------------
    # 核心逻辑（线路&集数提取）
    # ----------------------------------------------

    def _extract_lines_and_episodes(self, html: str, vod_id: str) -> Dict[str, str]:
        """
        完全复刻JS版 extractLinesAndEpisodes 逻辑
        返回: {
            'vod_play_from': '线路1$$$线路2',
            'vod_play_url': '1$line1-vodId-epId#2$line1...$$$1$line2...'
        }
        """
        # 1. 提取线路（优先data-line，次选play-source）
        lines = []
        line_pattern = r'<div[^>]*data-line="([^"]+)"[^>]*>([^<]+)</div>'
        for m in re.finditer(line_pattern, html):
            lines.append({'id': m.group(1), 'name': m.group(2).strip()})
        
        if not lines:
            alt_line_pattern = r'<div[^>]*class="[^"]*play-source[^"]*"[^>]*>([^<]+)</div>'
            for idx, name in enumerate(re.findall(alt_line_pattern, html), 1):
                lines.append({'id': f'line{idx}', 'name': name.strip()})

        # 2. 提取集数（优先data-id，次选a标签）
        episodes = []
        ep_pattern = r'<div[^>]*data-id="([^"]+)"[^>]*>.*?<span[^>]*class="[^"]*number[^"]*"[^>]*>([^<]+)</span>'
        for m in re.finditer(ep_pattern, html, re.DOTALL):
            episodes.append({'id': m.group(1), 'name': m.group(2).strip()})
        
        if not episodes:
            alt_ep_pattern = r'<a[^>]*data-id="([^"]+)"[^>]*>.*?<span[^>]*class="[^"]*number[^"]*"[^>]*>([^<]+)</span>'
            for m in re.finditer(alt_ep_pattern, html, re.DOTALL):
                episodes.append({'id': m.group(1), 'name': m.group(2).strip()})

        # 3. 组装数据结构
        play_froms, play_urls = [], []
        for line in lines:
            if not episodes: 
                continue
            play_froms.append(line['name'])
            ep_list = [f"{ep['name']}${line['id']}-{vod_id}-{ep['id']}" for ep in episodes]
            play_urls.append('#'.join(ep_list))
        
        # 4. 兜底逻辑（无线路时用默认线路）
        if not play_froms and episodes:
            play_froms.append('默认线路')
            ep_list = [f"{ep['name']}${vod_id}-{ep['id']}" for ep in episodes]
            play_urls.append('#'.join(ep_list))

        return {
            'vod_play_from': '$$$'.join(play_froms),
            'vod_play_url': '$$$'.join(play_urls)
        }

    # ----------------------------------------------
    # 公共接口实现
    # ----------------------------------------------

    def init(self, cfg):
        """初始化会话"""
        self.session = requests.Session()
        self.session.headers.update(self.headers)

    def homeContent(self, filter):
        """首页分类数据"""
        return {
            'class': [
                {'type_id': '1', 'type_name': '电影'},
                {'type_id': '2', 'type_name': '电视剧'},
                {'type_id': '4', 'type_name': '动漫'},
                {'type_id': '3', 'type_name': '综艺'},
                {'type_id': '8', 'type_name': '短剧'},
                {'type_id': '6', 'type_name': '纪录片'}
            ],
            'filters': {}
        }

    def homeVideoContent(self):
        """首页视频（空实现）"""
        return {'list': []}

    def categoryContent(self, tid, pg, filter, ext):
        """分类页数据抓取"""
        page = max(1, int(pg or 1))
        url = f"{self.home_url}/channel?page={page}&cat_id={tid}&order=new&page_size=32"
        resp = self._make_request(url, headers=self.headers)
        if not resp: 
            return {'list': [], 'page': page, 'pagecount': 0}
        
        items = re.findall(r'<div class="item-wrap[\s\S]*?</div>\s*</div>', resp.text)
        video_list = []
        
        for item in items:
            # 标题 & ID
            title = re.search(r'<a[^>]*title="([^"]+)"', item)
            href = re.search(r'<a[^>]*href="(/movie/detail/[^"]+)"', item)  # 严格过滤路径
            if not (title and href): 
                continue
            
            # 封面图
            pic = re.search(r'data-src="([^"]+)"', item)
            pic_url = pic.group(1) if pic else self._get_placeholder_pic(title.group(1))
            
            # 备注
            remark = re.search(r'<div class="category[^>]*>([^<]+)</div>', item)
            
            video_list.append({
                'vod_id': href.group(1),
                'vod_name': title.group(1),
                'vod_pic': pic_url,
                'vod_remarks': remark.group(1).strip() if remark else ''
            })
        
        return {'list': video_list, 'page': page, 'pagecount': 99}  # 模拟分页上限

    def detailContent(self, did):
        """详情页数据抓取"""
        vod_id = did[0] if isinstance(did, list) else did
        if not vod_id or not vod_id.startswith('/movie/detail/'):
            return {'list': []}
        
        url = f"{self.home_url}{vod_id}"
        resp = self._make_request(url, headers=self.headers)
        if not resp: 
            return {'list': []}
        
        html = resp.text
        # 标题
        name = re.search(r'<h1 class="title[^>]*>([^<]+)</h1>', html)
        name = name.group(1).strip() if name else '未知影片'
        
        # 封面图
        pic = re.search(r'class="thumb[^>]*data-src="([^"]+)"', html)
        pic_url = pic.group(1) if pic else self._get_placeholder_pic(name)
        
        # 简介
        desc = re.search(r'<div class="desc[^>]*>([\s\S]*?)</div>', html)
        content = re.sub(r'<[^>]+>', '', desc.group(1)).strip() if desc else ''
        
        # 类型
        type_name = re.search(r'类型：<a[^>]*>([^<]+)</a>', html)
        type_name = type_name.group(1).strip() if type_name else ''
        
        # 线路&集数
        play_data = self._extract_lines_and_episodes(html, vod_id)
        
        return {'list': [{
            'vod_id': vod_id,
            'vod_name': name,
            'vod_pic': pic_url,
            'vod_content': content,
            'type_name': type_name,
            'vod_play_from': play_data['vod_play_from'],
            'vod_play_url': play_data['vod_play_url'],
            'vod_remarks': '',  # 备注在分类页已用，详情页留空
            'vod_year': '',
            'vod_actor': '',
            'vod_director': ''
        }]}

    def searchContent(self, key, quick, pg):
        """搜索功能（同分类逻辑）"""
        page = int(pg) if pg else 1
        url = f"{self.home_url}/channel?page={page}&keywords={key}&page_size=32&order=new"
        resp = self._make_request(url)
        if not resp:
            return {'list': []}
        html = resp.text

        items = re.findall(r'<div class="item-wrap[\s\S]*?</div>\s*</div>', html)
        video_list = []
        for item_html in items:
            title_match = re.search(r'<a[^>]*title="([^"]+)"', item_html)
            href_match = re.search(r'<a[^>]*href="([^"]+)"', item_html)
            if not title_match or not href_match:
                continue
            name = title_match.group(1)
            vid = href_match.group(1)
            if not vid.startswith('/movie/detail/') or '://' in vid:
                continue

            pic = ''
            pic_match = re.search(r'data-src="([^"]+)"', item_html)
            if pic_match:
                pic = pic_match.group(1)
            if not pic:
                pic = self._get_placeholder_pic(name)

            remark = ''
            remark_match = re.search(r'<div class="category[^>]*>([^<]+)</div>', item_html)
            if remark_match:
                remark = remark_match.group(1).strip()

            video_list.append({
                'vod_id': vid,
                'vod_name': name,
                'vod_pic': pic,
                'vod_remarks': remark
            })

        return {'list': video_list, 'page': page, 'pagecount': 99}

    def playerContent(self, flag, pid, vipFlags):
        """
        播放器核心逻辑
        pid格式: lineId-vodId-epId 或 vodId-epId
        """
        # 1. 解析pid
        parts = pid.split('-')
        if len(parts) >= 3:
            line_id, vod_id, ep_id = parts[0], parts[1], parts[2]
        elif len(parts) == 2:
            line_id, vod_id, ep_id = 'default', parts[0], parts[1]
        else:
            # 无法解析时，返回一个错误状态，而不是抛出异常
            return {'parse': 1, 'url': f"{self.home_url}/error", 'header': self.headers}

        # 2. 构造请求
        detail_url = f"{self.home_url}{vod_id}"
        cookies = {'_did': self._generate_cookie()}
        data = {'link_id': ep_id, 'is_switch': '1'}
        
        try:
            resp = self.session.post(
                detail_url,
                data=data,
                cookies=cookies,
                headers=self.headers,
                timeout=self.timeout
            )
            resp.raise_for_status()
            json_data = resp.json()
            
            # 3. 提取m3u8
            play_links = json_data.get('data', {}).get('play_links', [])
            m3u8_url = None
            
            if line_id == 'default' and play_links:
                m3u8_url = play_links[0].get('m3u8_url')
            else:
                for link in play_links:
                    if str(link.get('id')) == line_id:
                        m3u8_url = link.get('m3u8_url')
                        break
            
            # 4. 修正URL
            if m3u8_url:
                # 核心修复：如果是相对路径，确保它以 / 开头，然后与 home_url 拼接
                if not m3u8_url.startswith('http'):
                    if not m3u8_url.startswith('/'):
                        m3u8_url = '/' + m3u8_url
                    full_url = self.home_url + m3u8_url
                else:
                    full_url = m3u8_url
                return {
                    'parse': 0,
                    'url': full_url,
                    'header': self.headers
                }
            else:
                # 没拿到m3u8，尝试嗅探
                return {'parse': 1, 'url': detail_url, 'header': self.headers}
                
        except Exception as e:
            print(f"播放器错误: {str(e)}")
            # 出错时也返回一个有效的字典，让播放器去试试嗅探
            return {'parse': 1, 'url': detail_url, 'header': self.headers}

    def destroy(self):
        """资源清理"""
        if self.session:
            self.session.close()
            self.session = None
