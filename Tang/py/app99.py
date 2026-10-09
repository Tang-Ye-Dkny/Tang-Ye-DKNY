# coding=utf-8
import base64
import hashlib
import json
import random
import re
import time
import uuid
import zlib
import requests

try:
    from base.spider import Spider as _BaseSpider
except Exception:
    _BaseSpider = object

try:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import pad, unpad
except Exception:
    AES = None


class Spider(_BaseSpider):
    def getName(self):
        return "半日"

    def init(self, extend=""):
        self.host = ""
        self.token = ""
        self.uuid = ""
        self.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
        self.version = ""
        self.name = ""
        self.package = ""
        self.build_number = ""
        self.build_signature = ""
        self.login_path = "/app/userInfo"
        self.g = {}
        self.session = requests.Session()
        self.init_error = ""

        try:
            cfg = json.loads(extend) if isinstance(extend, str) else extend
            if isinstance(cfg, dict):
                self.host = cfg.get("host", "").rstrip("/")
                self.name = cfg.get("name", "")
                self.build_signature = cfg.get("buildSignature", "")
                self.build_number = cfg.get("buildNumber", "")
                self.version = cfg.get("versionName", cfg.get("version", ""))
                self.package = cfg.get("package", "")
                self.ua = cfg.get("ua", self.ua)
                self.login_path = cfg.get("LoginPath", "/app/userInfo")
                self.uuid = cfg.get("uuid", str(uuid.uuid4()))
        except Exception as e:
            self.init_error = f"配置解析失敗: {e}"
            return

        if not self.host:
            self.init_error = "HOST 為空"
            return

        try:
            self._system_init()
            self._user_init()
        except Exception as e:
            self.init_error = f"初始化異常: {e}"

    def isVideoFormat(self, url):
        return False

    def manualVideoCheck(self):
        return False

    def destroy(self):
        try:
            self.session.close()
        except Exception:
            pass

    # ================= 加密與輔助方法 =================

    def _aes_encrypt(self, text, key):
        if AES is None:
            raise RuntimeError("缺少 pycryptodome")
        key_bytes = key.replace("-", "").encode("utf-8")
        cipher = AES.new(key_bytes, AES.MODE_CBC)
        ct_bytes = cipher.encrypt(pad(text.encode("utf-8"), AES.block_size))
        return base64.b64encode(cipher.iv + ct_bytes).decode("utf-8")

    def _aes_decrypt(self, b64_text, key):
        if AES is None:
            raise RuntimeError("缺少 pycryptodome")
        try:
            b64_text = b64_text.strip().strip('"')
            key_bytes = key.replace("-", "").encode("utf-8")
            raw = base64.b64decode(b64_text)
            if len(raw) < 16:
                return ""
            iv = raw[:16]
            ct = raw[16:]
            cipher = AES.new(key_bytes, AES.MODE_CBC, iv)
            decrypted = unpad(cipher.decrypt(ct), AES.block_size)

            # 1. 優先嘗試標準 zlib 解壓 (對應 Java 預設 new Inflater())
            try:
                return zlib.decompress(decrypted).decode("utf-8")
            except Exception:
                pass

            # 2. 備用 Raw Deflate 解壓 (-15)
            try:
                return zlib.decompress(decrypted, -15).decode("utf-8")
            except Exception:
                pass

            # 3. 備用 Gzip/zlib 自動標頭檢測
            try:
                return zlib.decompress(decrypted, 15 + 32).decode("utf-8")
            except Exception:
                pass

            # 4. 若未進行 zlib 壓縮，直接回傳 UTF-8 文字
            return decrypted.decode("utf-8", "ignore")
        except Exception:
            return ""

    def _gen_nonce(self):
        return base64.b64encode(bytes(random.randint(0, 255) for _ in range(16))).decode("utf-8")

    def _gen_sign(self, nonce, timestamp, body):
        sign_str = f"{body}:{timestamp}:{nonce}:{self.token}"
        return hashlib.sha256(sign_str.encode("utf-8")).hexdigest()

    def _get_headers(self, nonce, timestamp, body):
        sign = self._gen_sign(nonce, timestamp, body)
        return {
            "User-Agent": self.ua,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "client_type": "android",
            "uuid": self.uuid,
            "timestamp": timestamp,
            "sign": sign,
            "nonce": nonce,
            "version": self.version,
            "api_version": "v1",
        }

    def _post(self, path, data_dict):
        url = self.host + path
        try:
            nonce = self._gen_nonce()
            timestamp = str(int(time.time() * 1000))

            # 確保 Payload 內的 nonce/timestamp 與 Header 絕對一致
            data_dict["nonce"] = nonce
            data_dict["timestamp"] = timestamp
            if "token" not in data_dict:
                data_dict["token"] = self.token

            body_json = json.dumps(data_dict, separators=(",", ":"))
            encrypted_body = self._aes_encrypt(body_json, self.uuid)
            headers = self._get_headers(nonce, timestamp, encrypted_body)

            r = self.session.post(url, data=encrypted_body.encode("utf-8"), headers=headers, timeout=15)
            if r.status_code == 200:
                resp_text = r.content.decode("utf-8", "ignore").strip()
                dec = self._aes_decrypt(resp_text, self.uuid)
                return dec
            else:
                return '{"error":"http_' + str(r.status_code) + '"}'
        except Exception as e:
            return '{"error":"exception", "msg":"' + str(e) + '"}'

    # ================= 初始化 =================

    def _system_init(self):
        data = {
            "v": self.version,
            "n": self.name,
            "s": self.build_signature,
            "pl": "1",
            "apiVersion": "v2",
            "token": "",
        }
        res = self._post("/app/systemInit", data)
        if not res:
            self.init_error = "systemInit 返回空"
            return
        try:
            obj = json.loads(res)
            if "error" in obj:
                self.init_error = f"systemInit 失敗: {obj.get('error')}"
                return
            if "player" in obj:
                self.g["player"] = obj["player"]
            if "parser_api" in obj:
                self.g["parses"] = obj["parser_api"]
            if "categorys" in obj and isinstance(obj["categorys"], dict) and "data" in obj["categorys"]:
                self.g["categories"] = obj["categorys"]["data"]
        except Exception as e:
            self.init_error = f"systemInit 解析失敗: {e}"

    def _user_init(self):
        if self.token:
            return
        try:
            current_time = int(time.time() * 1000)
            device_id = str(uuid.uuid4())

            device_info = {
                "os": "android",
                "name": "xiaomi",
                "version": "15",
                "sdkInt": 32,
                "device": "xiaomi",
                "brand": "xiaomi",
                "manufacturer": "xiaomi",
                "product": "b0q",
                "hardware": "xiaomi",
                "isPhysicalDevice": True,
                "androidId": "V417IR",
                "bootloader": "unknown",
                "display": "V417IR release-keys",
                "host": "a11-gz01-test",
                "tags": "release-keys",
                "type": "user",
                "finger": "xiaomi/b0q/b0q:15/V619IR/613:user/release-keys",
                "app": {
                    "version": self.version,
                    "name": self.name,
                    "package": self.package,
                    "buildNumber": self.build_number,
                    "buildSignature": self.build_signature,
                    "install": current_time,
                    "update": current_time,
                },
                "did": device_id,
                "apiVersion": "v2",
                "channel": "",
                "token": "",
            }

            res = self._post(self.login_path, device_info)
            if res:
                obj = json.loads(res)
                if "userInfo" in obj and "user_token" in obj["userInfo"]:
                    self.token = obj["userInfo"]["user_token"]
        except Exception:
            pass

    # ================= 數據解析工具 =================

    def _parse_video_list(self, arr):
        videos = []
        for item in arr:
            if not isinstance(item, dict):
                continue
            videos.append({
                "vod_id": str(item.get("id", "")),
                "vod_name": str(item.get("name", "")),
                "vod_pic": str(item.get("pic", "")),
                "vod_remarks": str(item.get("remarks", "")),
                "vod_year": str(item.get("year", "")),
                "vod_content": str(item.get("blurb", "")),
                "type_name": str(item.get("class", "")),
                "vod_area": str(item.get("area", "")),
                "vod_actor": str(item.get("actor", "")),
                "vod_director": str(item.get("director", "")),
            })
        return videos

    # ================= 核心業務 =================

    def homeContent(self, filter=False):
        if not self.g.get("categories"):
            self._system_init()
            self._user_init()

        classes = []
        filters = {}

        if not self.g.get("categories"):
            err = self.init_error or "未知錯誤"
            return {"class": [{"type_id": "err", "type_name": f"初始化失敗: {err}"}], "list": [], "filters": {}}

        try:
            for cat in self.g["categories"]:
                cid = str(cat.get("id", ""))
                cname = str(cat.get("name", ""))
                classes.append({"type_id": cid, "type_name": cname})
                ext = cat.get("type_extend", {})
                if ext and isinstance(ext, dict):
                    cat_filters = []
                    if "class" in ext and ext["class"]:
                        cat_filters.append({"key": "class", "name": "類型", "value": [{"n": str(x), "v": str(x)} for x in ext["class"]]})
                    if "areas" in ext and ext["areas"]:
                        cat_filters.append({"key": "area", "name": "地區", "value": [{"n": str(x), "v": str(x)} for x in ext["areas"]]})
                    if "lang" in ext and ext["lang"]:
                        cat_filters.append({"key": "lang", "name": "語言", "value": [{"n": str(x), "v": str(x)} for x in ext["lang"]]})
                    if "years" in ext and ext["years"]:
                        cat_filters.append({"key": "year", "name": "年份", "value": [{"n": str(x), "v": str(x)} for x in ext["years"]]})
                    if cat_filters:
                        filters[cid] = cat_filters
        except Exception as e:
            return {"class": [{"type_id": "err", "type_name": f"分類解析失敗: {e}"}], "list": [], "filters": {}}

        videos = []
        data = {
            "kw": "",
            "page": "1",
            "limit": 21,
            "pid": "1",
            "orderBy": "time",
            "isCategory": 1,
            "token": self.token,
        }
        res = self._post("/vod/search", data)
        if res:
            try:
                obj = json.loads(res)
                if "data" in obj and isinstance(obj["data"], list):
                    videos = self._parse_video_list(obj["data"])
            except Exception:
                pass

        return {"class": classes, "list": videos, "filters": filters}

    def homeVideoContent(self):
        return {"list": self.homeContent(False).get("list", [])}

    def categoryContent(self, tid, pg, filter, extend):
        page = int(pg) if str(pg).isdigit() else 1
        data = {
            "kw": "",
            "page": str(page),
            "limit": 21,
            "pid": str(tid),
            "orderBy": "time",
            "isCategory": 1,
            "token": self.token,
        }
        if isinstance(extend, dict):
            for k in ["class", "area", "lang", "year"]:
                if extend.get(k):
                    data[k] = extend[k]

        res = self._post("/vod/search", data)
        videos = []
        page_count = page + 1
        if res:
            try:
                obj = json.loads(res)
                if "data" in obj and isinstance(obj["data"], list):
                    videos = self._parse_video_list(obj["data"])
                if "page_count" in obj:
                    page_count = obj["page_count"]
            except Exception:
                pass
        return {"list": videos, "page": page, "pagecount": page_count, "limit": 21, "total": 999999}

    def searchContent(self, key, quick=False, pg="1"):
        page = int(pg) if str(pg).isdigit() else 1
        data = {
            "kw": str(key),
            "page": str(page),
            "limit": 21,
            "orderBy": "vod_hits_month",
            "sort": "desc",
            "token": self.token,
        }
        res = self._post("/vod/search", data)
        videos = []
        if res:
            try:
                obj = json.loads(res)
                if "data" in obj and isinstance(obj["data"], list):
                    videos = self._parse_video_list(obj["data"])
            except Exception:
                pass
        return {"list": videos, "page": page, "pagecount": 1}

    def detailContent(self, ids):
        vod_id = str(ids[0])
        data = {
            "id": vod_id,
            "eps": "1",
            "v": "2.0.0",
            "pl": 1,
            "token": self.token,
        }
        res = self._post("/vod/detail", data)
        if not res:
            return {"list": []}

        try:
            obj = json.loads(res)
            if "data" not in obj or not isinstance(obj["data"], dict):
                return {"list": []}

            d = obj["data"]
            vod_name = str(d.get("name", ""))
            vod = {
                "vod_id": vod_id,
                "vod_name": vod_name,
                "vod_pic": str(d.get("pic", "")),
                "vod_remarks": str(d.get("remarks", "")),
                "vod_year": str(d.get("year", "")),
                "vod_area": str(d.get("area", "")),
                "vod_actor": str(d.get("actor", "")),
                "vod_director": str(d.get("director", "")),
                "vod_content": str(d.get("content", "")),
                "type_name": str(d.get("class", "")),
            }

            play_from = str(d.get("play_from", ""))
            play_url = str(d.get("play_url", ""))

            from_list = play_from.split("$$$") if play_from else []
            url_list = play_url.split("$$$") if play_url else []

            player_map = {}
            if "player" in self.g and isinstance(self.g["player"], dict):
                for k, v in self.g["player"].items():
                    if isinstance(v, dict):
                        code = str(v.get("code", "")).strip()
                        pname = str(v.get("name", "")).strip()
                        if code:
                            player_map[code] = pname

            all_lines = []
            min_len = min(len(from_list), len(url_list))
            for i in range(min_len):
                raw_from = from_list[i]
                display_name = player_map.get(raw_from, raw_from)
                all_lines.append((display_name, raw_from, url_list[i]))

            # 依據 Java 邏輯進行排序：4K 優先，藍光次之，其餘靠後
            sorted_lines = []
            for name, raw_from, url in all_lines:
                if "4K" in name:
                    sorted_lines.append((name, raw_from, url))
            for name, raw_from, url in all_lines:
                if "蓝光" in name and "4K" not in name:
                    sorted_lines.append((name, raw_from, url))
            for name, raw_from, url in all_lines:
                if "4K" not in name and "蓝光" not in name:
                    sorted_lines.append((name, raw_from, url))

            play_from_res = []
            play_url_res = []

            for name, raw_from, url_str in sorted_lines:
                eps = url_str.split("#")
                ep_strs = []
                for ep in eps:
                    parts = ep.split("$")
                    if len(parts) >= 2:
                        ep_name = parts[0]
                        ep_url = parts[1]
                        digits = re.sub(r"\D+", "", ep_name)
                        ep_index = digits if digits else "1"
                        token = f"{ep_url}@{raw_from}@{vod_name}@{ep_index}"
                        ep_strs.append(f"{ep_name}${token}")
                if ep_strs:
                    play_from_res.append(name)
                    play_url_res.append("#".join(ep_strs))

            vod["vod_play_from"] = "$$$".join(play_from_res)
            vod["vod_play_url"] = "$$$".join(play_url_res)
            return {"list": [vod]}
        except Exception:
            return {"list": []}

    def playerContent(self, flag, pid, vipFlags):
        try:
            parts = pid.split("@")
            if len(parts) < 4:
                return {"parse": 1, "url": pid, "header": {}}

            real_url = parts[0]
            from_code = parts[1]
            vod_name = parts[2]
            vod_index = parts[3]

            danmaku = f"http://127.0.0.1:9978/proxy?do=appdanmu&vodName={vod_name}&vodIndex={vod_index}"

            if "player" in self.g and isinstance(self.g["player"], dict) and from_code in self.g["player"]:
                player_info = self.g["player"][from_code]
                if player_info.get("type", 0) != 0 and "parses" in self.g and isinstance(self.g["parses"], list):
                    parse_url_str = player_info.get("parseUrl", "")
                    parse_ids = [x.strip() for x in parse_url_str.split(",") if x.strip()] if parse_url_str else []

                    for parser in self.g["parses"]:
                        if not isinstance(parser, dict):
                            continue
                        parser_id = str(parser.get("id", ""))
                        if parse_ids and parser_id not in parse_ids:
                            continue

                        req_data = {
                            "id": parser.get("id"),
                            "url": real_url,
                            "token": self.token,
                        }
                        res = self._post("/app/vodParser", req_data)
                        if res:
                            try:
                                obj = json.loads(res)
                                parsed_url = obj.get("data", "")
                                if parsed_url and str(parsed_url).startswith("http"):
                                    real_url = parsed_url
                                    break
                            except Exception:
                                pass

            return {
                "parse": 0,
                "url": real_url,
                "header": {"User-Agent": self.ua},
                "danmaku": danmaku,
            }
        except Exception:
            return {"parse": 1, "url": pid, "header": {}}

    def localProxy(self, param):
        return None