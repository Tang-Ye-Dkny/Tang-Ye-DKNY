# -*- coding: utf-8 -*-
import hashlib
import json
import random
import time
import requests

try:
    from base.spider import Spider as _BaseSpider
except Exception:
    _BaseSpider = object


class Spider(_BaseSpider):
    DEFAULT_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36")

    def __init__(self):
        super().__init__()
        self.host = ""
        self.api_base = ""
        self.finger = ""
        self.aid = "com.web.player"
        self.sk = ""
        self.sign = ""
        self.client = ""
        self.ua = self.DEFAULT_UA
        self.session = None

    def getName(self):
        return "云朵duo"

    def init(self, extend=""):
        try:
            if isinstance(extend, dict):
                cfg = extend
            elif isinstance(extend, str) and extend.strip():
                cfg = json.loads(extend)
            else:
                cfg = {}
        except Exception:
            cfg = {}

        self.host = str(cfg.get("host", "")).rstrip("/")
        self.finger = str(cfg.get("finger") or cfg.get("id") or "")
        self.aid = str(cfg.get("aid") or cfg.get("dev") or "com.web.player")
        self.sk = str(cfg.get("sk", ""))
        self.sign = str(cfg.get("sign") or cfg.get("web_sign") or "")
        self.client = str(cfg.get("client") or cfg.get("x_client") or "")
        self.ua = str(cfg.get("ua") or self.DEFAULT_UA)
        self.api_base = (self.host + "/api.php/web") if self.host else ""

        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": self.ua,
            "X-Client": self.client,
            "web-sign": self.sign,
        })
        return None

    def isVideoFormat(self, url):
        return False

    def manualVideoCheck(self):
        return False

    def destroy(self):
        try:
            if self.session:
                self.session.close()
        except Exception:
            pass

    # ---------- protobuf 编解码 ----------

    @staticmethod
    def _varint(n):
        out = bytearray()
        while True:
            b = n & 0x7F
            n >>= 7
            out.append(b | (0x80 if n else 0))
            if not n:
                return bytes(out)

    @classmethod
    def _pb_bytes(cls, field, value):
        if isinstance(value, str):
            value = value.encode("utf-8")
        return cls._varint((field << 3) | 2) + cls._varint(len(value)) + value

    @classmethod
    def _pb_int(cls, field, value):
        return cls._varint((field << 3) | 0) + cls._varint(int(value))

    @staticmethod
    def _read_varint(data, pos):
        value = 0
        shift = 0
        while pos < len(data):
            b = data[pos]
            pos += 1
            value |= (b & 0x7F) << shift
            if not (b & 0x80):
                return value, pos
            shift += 7
            if shift > 70:
                raise ValueError("bad varint")
        raise ValueError("truncated varint")

    @classmethod
    def _pb_decode(cls, data):
        out = []
        pos = 0
        n = len(data)
        while pos < n:
            try:
                key, pos = cls._read_varint(data, pos)
            except Exception:
                break
            field = key >> 3
            wire = key & 7
            if wire == 0:
                try:
                    val, pos = cls._read_varint(data, pos)
                except Exception:
                    break
                out.append((field, wire, val))
            elif wire == 2:
                try:
                    ln, pos = cls._read_varint(data, pos)
                except Exception:
                    break
                if pos + ln > n:
                    break
                out.append((field, wire, data[pos:pos + ln]))
                pos += ln
            elif wire == 1:
                out.append((field, wire, data[pos:pos + 8]))
                pos += 8
            elif wire == 5:
                out.append((field, wire, data[pos:pos + 4]))
                pos += 4
            else:
                break
        return out

    # ---------- 请求工具 ----------

    @staticmethod
    def _sha256_upper(text):
        return hashlib.sha256(text.encode("utf-8")).hexdigest().upper()

    @staticmethod
    def _gen_nonce():
        return "".join("%02x" % random.randint(0, 255) for _ in range(16))

    def _headers_json(self):
        return {
            "User-Agent": self.ua,
            "X-Client": self.client,
            "web-sign": self.sign,
            "Accept": "application/json",
        }

    def _headers_proto(self):
        return {
            "User-Agent": self.ua,
            "X-Client": self.client,
            "web-sign": self.sign,
            "Content-Type": "application/x-protobuf",
            "Accept": "application/x-protobuf",
            "Origin": self.host,
            "Referer": self.host + "/",
        }

    def _get_json(self, path):
        try:
            r = self.session.get(self.host + path, headers=self._headers_json(), timeout=15)
            if r.status_code == 200 and r.text:
                return r.json()
        except Exception:
            pass
        return None

    # ---------- /decode/url（核心） ----------

    def _decode_url(self, token, source):
        """POST /api.php/web/decode/url，发送 protobuf 二进制，解析返回的 URL"""
        if not self.api_base or not self.finger or not self.sk:
            return ""

        for attempt in range(3):
            try:
                time_ms = int(time.time() * 1000)
                nonce = self._gen_nonce()
                sign_str = "finger=%s&id=%s&nonce=%s&sk=%s&time=%d&v=1" % (
                    self.finger, self.aid, nonce, self.sk, time_ms
                )
                sign = self._sha256_upper(sign_str)
                if not sign:
                    return ""

                body = (
                    self._pb_bytes(1, token) +
                    self._pb_bytes(2, source or "") +
                    self._pb_int(3, time_ms) +
                    self._pb_bytes(4, nonce) +
                    self._pb_bytes(5, sign) +
                    self._pb_bytes(6, self.aid) +
                    self._pb_int(7, 1)
                )

                r = self.session.post(
                    self.api_base + "/decode/url",
                    data=body,  # bytes → requests 直接发原始字节
                    headers=self._headers_proto(),
                    timeout=15,
                )

                if r.status_code == 200:
                    raw = r.content
                    if raw:
                        for field, wire, val in self._pb_decode(raw):
                            if field == 3 and wire == 2:
                                s = val.decode("utf-8", "ignore")
                                if s.startswith("http"):
                                    return s
                time.sleep(0.5)
            except Exception:
                time.sleep(0.5)

        return ""

    # ---------- 首页 ----------

    def homeContent(self, filter=False):
        if not self.host:
            return {"class": [], "list": []}
        try:
            obj = self._get_json("/api.php/web/index/home")
            if not obj:
                return {"class": [], "list": []}
            classes, videos, seen = [], [], set()
            if obj.get("code") == 200 and obj.get("data"):
                for cat in obj["data"].get("categories") or []:
                    name = cat.get("type_name") or ""
                    if name:
                        classes.append({"type_id": name, "type_name": name})
                    for v in cat.get("videos") or []:
                        vid = str(v.get("vod_id") or "")
                        if vid and vid not in seen:
                            seen.add(vid)
                            videos.append({
                                "vod_id": vid,
                                "vod_name": v.get("vod_name") or "",
                                "vod_pic": self._fix_pic(v.get("vod_pic") or ""),
                                "vod_remarks": v.get("vod_remarks") or "",
                            })
            return {"class": classes, "list": videos}
        except Exception:
            return {"class": [], "list": []}

    def homeVideoContent(self):
        data = self.homeContent(False)
        return {"list": data.get("list") or []}

    # ---------- 分类 ----------

    def categoryContent(self, tid, pg, filter, extend):
        if not self.host:
            return {"list": [], "page": 1, "pagecount": 1, "limit": 24, "total": 0}
        try:
            page = int(pg) if str(pg).isdigit() else 1
            url = (self.api_base + "/filter/vod?type_name=" + self._q(tid) +
                   "&page=" + str(page) + "&sort=hits")
            if isinstance(extend, dict):
                for k, v in extend.items():
                    if v and v != "全部":
                        url += "&" + k + "=" + self._q(v)
            r = self.session.get(url, headers=self._headers_json(), timeout=15)
            if r.status_code != 200 or not r.text:
                raise Exception("empty")
            obj = r.json()
            videos = []
            page_count = page + 1
            if obj.get("code") == 200 and obj.get("data"):
                for v in obj["data"]:
                    videos.append({
                        "vod_id": str(v.get("vod_id") or ""),
                        "vod_name": v.get("vod_name") or "",
                        "vod_pic": self._fix_pic(v.get("vod_pic") or ""),
                        "vod_remarks": v.get("vod_remarks") or "",
                    })
                if obj.get("pageCount"):
                    page_count = int(obj["pageCount"])
            return {"list": videos, "page": page, "pagecount": page_count,
                    "limit": 24, "total": 999999}
        except Exception:
            return {"list": [], "page": 1, "pagecount": 1, "limit": 24, "total": 0}

    # ---------- 详情 ----------

    # ---------- 详情（增强版：加入网页端聚合线路） ----------

    def detailContent(self, ids):
        if not self.host:
            return {"list": []}
        try:
            vod_id = str(ids[0]) if isinstance(ids, (list, tuple)) else str(ids)
            
            # 1. 獲取基礎詳情 (APP端原有線路)
            r = self.session.get(
                self.api_base + "/vod/get_detail?vod_id=" + vod_id,
                headers=self._headers_json(), timeout=15)
            if r.status_code != 200 or not r.text:
                return {"list": []}
            obj = r.json()
            if obj.get("code") != 200 or not obj.get("data"):
                return {"list": []}
            data = obj["data"]
            if isinstance(data, list):
                data = data[0] if data else None
            if not data:
                return {"list": []}

            from_str = data.get("vod_play_from") or ""
            url_str = data.get("vod_play_url") or ""

            line_map = {}
            for p in obj.get("vodplayer") or []:
                if p.get("from"):
                    line_map[p["from"]] = p.get("show") or p["from"]

            # 使用字典來收集線路，方便後續合併去重（線路名稱 -> 劇集列表字串）
            play_dict = {}

            # 解析基礎線路
            if from_str and url_str:
                from_arr = from_str.split("$$$")
                url_arr = url_str.split("$$$")
                for i in range(min(len(from_arr), len(url_arr))):
                    raw_from = from_arr[i]
                    line_name = line_map.get(raw_from, raw_from)
                    eps = []
                    for ep in url_arr[i].split("#"):
                        parts = ep.split("$")
                        if len(parts) == 2 and parts[1]:
                            token = "token@" + parts[1] + "@" + raw_from
                            eps.append(parts[0] + "$" + token)
                    if eps:
                        play_dict[line_name] = "#".join(eps)

            # 2. 獲取網頁端聚合線路 (優酷、騰訊、CO藍光等)
            try:
                # 偽裝成網頁端的請求頭，並攜帶 Referer
                web_headers = self._headers_json()
                web_headers["User-Agent"] = self.DEFAULT_UA
                web_headers["Referer"] = self.host + "/play/" + vod_id
                
                r_agg = self.session.get(
                    self.api_base + "/internal/search_aggregate?vod_id=" + vod_id,
                    headers=web_headers, timeout=15)
                
                if r_agg.status_code == 200 and r_agg.text:
                    agg_obj = r_agg.json()
                    if agg_obj.get("code") == 200 and agg_obj.get("data"):
                        agg_data = agg_obj["data"]
                        # 兼容返回結構：可能是 {"list": [...]} 或直接就是 [...]
                        agg_list = agg_data if isinstance(agg_data, list) else agg_data.get("list", [])
                        
                        for item in agg_list:
                            # 根據常見結構提取 from 和 url
                            raw_from = item.get("vod_play_from") or item.get("from") or ""
                            raw_url = item.get("vod_play_url") or item.get("url") or ""
                            
                            if raw_from and raw_url:
                                # 如果有多個來源用 $$$ 分割
                                f_arr = raw_from.split("$$$")
                                u_arr = raw_url.split("$$$")
                                for j in range(min(len(f_arr), len(u_arr))):
                                    agg_line_name = f_arr[j]
                                    # 解析聚合線路的劇集
                                    agg_eps = []
                                    for ep in u_arr[j].split("#"):
                                        parts = ep.split("$")
                                        if len(parts) == 2 and parts[1]:
                                            token = "token@" + parts[1] + "@" + agg_line_name
                                            agg_eps.append(parts[0] + "$" + token)
                                    if agg_eps:
                                        # 避免覆蓋 APP 端已有的同名線路（例如 CO藍光），可以加個後綴或直接去重
                                        if agg_line_name not in play_dict:
                                            play_dict[agg_line_name] = "#".join(agg_eps)
            except Exception as e:
                # 聚合接口失敗不影響基礎線路播放
                pass

            # 將字典轉換回列表格式
            play_from_list = list(play_dict.keys())
            play_url_list = list(play_dict.values())

            # 3. 兜底：detail_v2 (如果前面都沒拿到任何線路)
            if not play_from_list:
                try:
                    r2 = self.session.get(
                        self.api_base + "/vod/detail_v2?vod_id=" + vod_id,
                        headers=self._headers_json(), timeout=15)
                    obj2 = r2.json()
                    if obj2.get("code") == 200 and obj2.get("data"):
                        playback = obj2["data"].get("playback") or {}
                        for idx, src in enumerate(playback.get("sources") or []):
                            line_name = src.get("display_name") or src.get("from") or ("线路%d" % idx)
                            eps = []
                            for ep_idx, ep in enumerate(src.get("episodes") or []):
                                title = ep.get("title") or ("第%d集" % (ep_idx + 1))
                                eps.append(title + "$v2@" + vod_id + "@" + str(ep_idx + 1) + "@" + str(idx))
                            if eps:
                                play_from_list.append(line_name)
                                play_url_list.append("#".join(eps))
                except Exception:
                    pass

            vod = {
                "vod_id": str(data.get("vod_id") or vod_id),
                "vod_name": data.get("vod_name") or "",
                "vod_pic": self._fix_pic(data.get("vod_pic") or ""),
                "vod_content": self._strip_html(data.get("vod_content") or ""),
                "vod_remarks": data.get("vod_remarks") or "",
                "vod_year": data.get("vod_year") or "",
                "vod_area": data.get("vod_area") or "",
                "vod_actor": data.get("vod_actor") or "",
                "vod_director": data.get("vod_director") or "",
                "vod_play_from": "$$$".join(play_from_list),
                "vod_play_url": "$$$".join(play_url_list),
            }
            return {"list": [vod]}
        except Exception:
            return {"list": []}

    # ---------- 搜索 ----------

    def searchContent(self, key, quick=False, pg="1"):
        if not self.host:
            return {"list": [], "page": 1, "pagecount": 1}
        try:
            page = int(pg) if str(pg).isdigit() else 1
            url = self.api_base + "/search/index?wd=" + self._q(key) + "&pg=" + str(page)
            r = self.session.get(url, headers=self._headers_json(), timeout=15)
            if r.status_code != 200 or not r.text:
                return {"list": [], "page": page, "pagecount": 1}
            obj = r.json()
            videos = []
            if obj.get("code") == 200 and obj.get("data"):
                for v in obj["data"]:
                    name = (v.get("vod_name") or "").strip()
                    vid = str(v.get("vod_id") or "")
                    if vid and name and "http" not in name and ".com" not in name:
                        videos.append({
                            "vod_id": vid,
                            "vod_name": name,
                            "vod_pic": self._fix_pic(v.get("vod_pic") or ""),
                            "vod_remarks": v.get("vod_remarks") or "",
                        })
            return {"list": videos, "page": page, "pagecount": 1}
        except Exception:
            return {"list": [], "page": 1, "pagecount": 1}

    # ---------- 播放 ----------

    def playerContent(self, flag, pid, vipFlags):
        if not pid:
            return {"parse": 0, "url": "", "header": {"User-Agent": self.ua}}

        if pid.startswith("token@"):
            parts = pid.split("@")
            real_token = parts[1] if len(parts) > 1 else ""
            source = parts[2] if len(parts) > 2 else ""
            real_url = self._decode_url(real_token, source)
            if real_url:
                # Referer 取真实 URL 的 origin
                referer = self.host
                try:
                    i = real_url.find("/", real_url.find("://") + 3)
                    if i > 0:
                        referer = real_url[:i]
                except Exception:
                    pass
                return {
                    "parse": 0,
                    "url": real_url,
                    "header": {"User-Agent": self.ua, "Referer": referer},
                }
            # 失败：返回一个明确的诊断 URL
            return {
                "parse": 1,
                "url": self.host + "/play/unknown?source=" + self._q(source),
                "header": {"User-Agent": self.ua, "Referer": self.host},
            }

        if pid.startswith("v2@"):
            return {"parse": 1, "url": pid, "header": {"User-Agent": self.ua}}

        if pid.startswith("http"):
            return {"parse": 0, "url": pid,
                    "header": {"User-Agent": self.ua, "Referer": self.host}}

        return {"parse": 1, "url": pid, "header": {"User-Agent": self.ua}}

    def localProxy(self, param):
        return None

    # ---------- 工具 ----------

    @staticmethod
    def _fix_pic(pic):
        if not pic:
            return ""
        return pic.replace("http://", "https://", 1) if pic.startswith("http://") else pic

    @staticmethod
    def _strip_html(text):
        import re
        return re.sub(r"<[^>]+>", "", text or "").strip()

    @staticmethod
    def _q(text):
        from urllib.parse import quote
        return quote(str(text), safe="")