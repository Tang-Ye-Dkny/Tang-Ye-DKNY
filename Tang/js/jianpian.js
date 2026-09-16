/**
 * 荐片 (JianPian) 完整 JS 插件脚本
 * 兼容 FongMi (TVBox JS0) 与 WebHTV
 */

let host = '';
let imghost = '';
const UA = 'Mozilla/5.0 (Linux; Android 7.1.2; V2049A Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/81.0.4044.117 Mobile Safari/537.36;webank/h5face;webank/1.0;netType:NETWORK_WIFI;appVersion:422;packageName:com.jp3.xg3';

/**
 * 生成随机字符串
 */
function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * 域名格式化
 */
function formatHost(str) {
    if (str.startsWith('http://') || str.startsWith('https://')) return str;
    return `https://${generateRandomString(6)}.${str}`;
}

/**
 * 补全图片 Host 路径
 */
function fixPic(path) {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) return `https://${imghost}${path}`;
    return path;
}

/**
 * 初始化配置与域名探测
 */
async function init(cfg) {
    try {
        let dnsUrl = 'https://dns.alidns.com/resolve?name=swrdsfeiujo25sw.cc&type=TXT';
        let dnsRes = await req(dnsUrl, { headers: { 'User-Agent': UA } });
        let dnsData = JSON.parse(dnsRes.content);
        let domains = dnsData.Answer[0].data.replace(/^"|"$/g, '').split(',');

        for (let domain of domains) {
            let targetHost = formatHost(domain);
            try {
                let res = await req(targetHost, { headers: { 'User-Agent': UA }, timeout: 3000 });
                if (res.code === 200 || res.status === 200) {
                    host = targetHost;
                    break;
                }
            } catch (e) {}
        }

        if (!host && domains.length > 0) {
            host = formatHost(domains[0]);
        }

        let cfgUrl = `${host}/api/v2/settings/resourceDomainConfig`;
        let cfgRes = await req(cfgUrl, { headers: { 'User-Agent': UA } });
        let cfgData = JSON.parse(cfgRes.content);
        let imgDomains = cfgData.data.imgDomain.split(',');
        imghost = imgDomains.length > 1 ? imgDomains[1] : imgDomains[0];
    } catch (e) {
        console.log('JianPian init error: ' + e);
    }
}

/**
 * 首页分类与筛选配置
 */
async function home(filter) {
    let classes = [
        { type_id: '1', type_name: '电影' },
        { type_id: '2', type_name: '电视剧' },
        { type_id: '3', type_name: '动漫' },
        { type_id: '4', type_name: '综艺' },
        { type_id: '67', type_name: '短剧' }
    ];

    const filterItem = [
        { key: 'area', name: '地区', value: [{ n: '全部', v: '' }, { n: '国产', v: '1' }, { n: '中国香港', v: '3' }, { n: '中国台湾', v: '6' }, { n: '美国', v: '5' }, { n: '韩国', v: '18' }, { n: '日本', v: '2' }] },
        { key: 'year', name: '年份', value: [{ n: '全部', v: '' }, { n: '2026', v: '162' }, { n: '2025', v: '107' }, { n: '2024', v: '119' }, { n: '2023', v: '153' }, { n: '2022', v: '101' }, { n: '2021', v: '118' }, { n: '2020', v: '16' }, { n: '2019', v: '7' }, { n: '2018', v: '2' }, { n: '2017', v: '3' }, { n: '2016', v: '22' }] },
        { key: 'sort', name: '排序', value: [{ n: '热门', v: 'hot' }, { n: '更新', v: 'update' }, { n: '评分', v: 'rating' }] }
    ];

    const shortFilterItem = [
        { key: 'category_id', name: '类型', value: [{ n: '全部', v: '' }, { n: '言情', v: '70' }, { n: '爱情', v: '71' }, { n: '战神', v: '72' }, { n: '古代', v: '73' }, { n: '萌娃', v: '74' }, { n: '神医', v: '75' }, { n: '玄幻', v: '76' }, { n: '重生', v: '77' }, { n: '激情', v: '79' }, { n: '穿越', v: '80' }, { n: '闪婚', v: '112' }] }
    ];

    let filterObj = {
        '1': filterItem,
        '2': filterItem,
        '3': filterItem,
        '4': filterItem,
        '67': shortFilterItem
    };

    return JSON.stringify({
        class: classes,
        filters: filterObj
    });
}

/**
 * 首页推荐视频列表
 */
async function homeVod() {
    try {
        let url = `${host}/api/dyTag/list?category_id=88`;
        let res = await req(url, { headers: { 'User-Agent': UA, 'Referer': host } });
        let json = JSON.parse(res.content);
        let videos = [];
        
        if (json.data && Array.isArray(json.data)) {
            for (let tag of json.data) {
                if (tag.dataList && Array.isArray(tag.dataList)) {
                    for (let item of tag.dataList) {
                        let pic = fixPic(item.path);
                        videos.push({
                            vod_id: `${item.id}$$$${item.title}$$$${pic}$$$1`,
                            vod_name: item.title,
                            vod_pic: pic,
                            vod_remarks: item.mask || ''
                        });
                    }
                }
            }
        }
        return JSON.stringify({ list: videos });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

/**
 * 分类列表查询
 */
async function category(tid, pg, filter, extend) {
    try {
        let url = '';
        if (tid === '67') {
            url = `${host}/api/crumb/shortList?fcate_pid=67&category_id=${extend.category_id || ''}&sort=update&page=${pg}`;
        } else {
            url = `${host}/api/crumb/list?fcate_pid=${tid}&category_id=${extend.category_id || ''}&area=${extend.area || ''}&year=${extend.year || ''}&type=${extend.type || ''}&sort=${extend.sort || ''}&page=${pg}`;
        }

        let res = await req(url, { headers: { 'User-Agent': UA, 'Referer': host } });
        let json = JSON.parse(res.content);
        let videos = [];

        if (json.data && Array.isArray(json.data)) {
            videos = json.data.map(item => {
                let pic = tid === '67' ? fixPic(item.cover_image) : fixPic(item.path);
                let remarks = item.mask || item.score || '';
                return {
                    vod_id: `${item.id}$$$${item.title}$$$${pic}$$$${tid}`,
                    vod_name: item.title,
                    vod_pic: pic,
                    vod_remarks: remarks
                };
            });
        }

        return JSON.stringify({
            page: parseInt(pg),
            pagecount: 9999,
            limit: videos.length,
            total: 9999,
            list: videos
        });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

/**
 * 影片详情页处理
 */
async function detail(id) {
    try {
        let split = id.split('$$$');
        let realId = split[0];
        let title = split[1] || '';
        let pic = fixPic(split[2] || '');
        let tid = split[3] || '1';

        let playFromList = [];
        let playUrlList = [];
        let vod = {
            vod_id: id,
            vod_name: title,
            vod_pic: pic
        };

        if (tid === '67') {
            let url = `${host}/api/detail?vid=${realId}`;
            let res = await req(url, { headers: { 'User-Agent': UA, 'Referer': host } });
            let data = JSON.parse(res.content).data;

            vod.vod_content = data.description || '';
            if (data.playlist && Array.isArray(data.playlist)) {
                let subUrls = data.playlist
                    .filter(item => item.url)
                    .map(item => `${item.title || '正片'}$${item.url}`);
                if (subUrls.length > 0) {
                    playFromList.push('常规线路');
                    playUrlList.push(subUrls.join('#'));
                }
            }
        } else {
            let url = `${host}/api/video/detailv2?id=${realId}`;
            let res = await req(url, { headers: { 'User-Agent': UA, 'Referer': host } });
            let data = JSON.parse(res.content).data;

            vod.vod_year = data.year || '';
            vod.vod_area = data.area || '';
            vod.vod_content = data.description || '';
            if (data.actors && Array.isArray(data.actors)) {
                vod.vod_actor = data.actors.map(a => a.name).join(', ');
            }

            if (data.source_list_source && Array.isArray(data.source_list_source)) {
                for (let source of data.source_list_source) {
                    let sourceName = source.name || '播放源';
                    let subUrls = [];
                    if (source.source_list && Array.isArray(source.source_list)) {
                        for (let item of source.source_list) {
                            let playUrl = item.url || '';
                            if (playUrl) {
                                if (playUrl.startsWith('ftp')) {
                                    playUrl = `tvbox-xg:${playUrl}`;
                                }
                                subUrls.push(`${item.source_name || '播放'}$${playUrl}`);
                            }
                        }
                    }
                    if (subUrls.length > 0) {
                        playFromList.push(sourceName);
                        playUrlList.push(subUrls.join('#'));
                    }
                }
            }
        }

        vod.vod_play_from = playFromList.join('$$$');
        vod.vod_play_url = playUrlList.join('$$$');

        return JSON.stringify({ list: [vod] });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

/**
 * 搜索功能
 */
async function search(wd, quick) {
    try {
        let url = `${host}/api/v2/search/videoV2?key=${encodeURIComponent(wd)}&category_id=88&page=1&pageSize=20`;
        let res = await req(url, { headers: { 'User-Agent': UA, 'Referer': host } });
        let json = JSON.parse(res.content);
        let videos = [];

        if (json.data && Array.isArray(json.data)) {
            videos = json.data.map(item => {
                let pic = fixPic(item.thumbnail);
                let topCateId = item.top_category ? item.top_category.id : '1';
                return {
                    vod_id: `${item.id}$$$${item.title}$$$${pic}$$$${topCateId}`,
                    vod_name: item.title,
                    vod_pic: pic,
                    vod_remarks: item.mask || ''
                };
            });
        }

        return JSON.stringify({ list: videos });
    } catch (e) {
        return JSON.stringify({ list: [] });
    }
}

/**
 * 播放链接解析
 */
async function play(flag, id, flags) {
    try {
        if (id.startsWith('http')) {
            return JSON.stringify({
                parse: 1,
                jx: '1',
                url: id
            });
        }
        return JSON.stringify({
            parse: 0,
            url: id
        });
    } catch (e) {
        return JSON.stringify({ parse: 0, url: id });
    }
}

export default {
    init,
    home,
    homeVod,
    category,
    detail,
    search,
    play
};