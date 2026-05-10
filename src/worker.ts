import { Hono } from 'hono';
import { cors } from 'hono/cors';
import CryptoJS from 'crypto-js';

type Env = {
  vpsai?: any; // R2 Bucket binding
  SETTINGS?: any; // KV Namespace binding
};

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());

let proxyIPs: string[] = [];
let lastFetch = 0;

// Admin states
let memoryConfig = {
  popupText: "Silakan scan QR Code ini untuk melanjutkan.",
  blocklist: [] as { ip: string, ua: string }[],
  adminPassword: "admin",
  limitPerUser: 0,
  qrCodeUrl: "",
  registeredUsers: {} as Record<string, { ip: string, ua: string, forcePopup: boolean, views: number, createdAt: number, lastSeen: number, limit?: number }>
};

let activeUsers = new Map<string, { ip: string, ua: string, name: string, lastSeen: number, views: number }>();
let memoryQr: { buffer: ArrayBuffer, type: string } | null = null;

const getConfig = async (c: any) => {
  if (c.env?.SETTINGS) {
    try {
       const val = await c.env.SETTINGS.get("appConfig", "json");
       if (val) return { ...memoryConfig, ...val };
    } catch(e) {}
  }
  return memoryConfig;
};

const saveConfig = async (c: any, newConfig: any) => {
  const current = await getConfig(c);
  memoryConfig = { ...current, ...newConfig };
  if (c.env?.SETTINGS) {
    try {
      await c.env.SETTINGS.put("appConfig", JSON.stringify(memoryConfig));
    } catch(e) {}
  }
};

// Activity tracking & Blocklist middleware
app.use('*', async (c, next) => {
  const isApi = c.req.path.startsWith('/api/');
  if (!isApi) return next();

  const ip = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
  const ua = c.req.header('user-agent') || 'Unknown';
  const name = c.req.header('x-user-name') || 'Anonymous';
  
  // Track user
  const now = Date.now();
  const existing = activeUsers.get(ip);
  activeUsers.set(ip, { 
    ip, 
    ua, 
    name: name !== 'Anonymous' ? name : (existing?.name || 'Anonymous'),
    lastSeen: now, 
    views: existing ? existing.views : 0 
  });
  
  const config = await getConfig(c);
  let configChanged = false;
  if (name !== 'Anonymous') {
     if (!config.registeredUsers) config.registeredUsers = {};
     if (!config.registeredUsers[name]) {
         config.registeredUsers[name] = { ip, ua, forcePopup: false, views: 0, createdAt: now, lastSeen: now };
         configChanged = true;
     } else {
         config.registeredUsers[name].lastSeen = now; 
     }
  }
  
  if (configChanged) {
      await saveConfig(c, config);
  }

  // Clean old users (12 hours)
  for (const [key, val] of activeUsers.entries()) {
    if (now - val.lastSeen > 12 * 60 * 60 * 1000) {
      activeUsers.delete(key);
    }
  }

  // Block check
  const isBlocked = config.blocklist.some((b: any) => 
     (b.ip && ip.includes(b.ip)) || (b.ua && ua.toLowerCase().includes(b.ua.toLowerCase()))
  );
  
  if (isBlocked && !c.req.path.startsWith('/api/admin')) {
    return c.json({ success: false, message: 'Access Denied: Banned' }, 403);
  }

  await next();
});

// Admin auth middleware
app.use('/api/admin/*', async (c, next) => {
  if (c.req.path === '/api/admin/login') return next();
  const token = c.req.header('authorization');
  const config = await getConfig(c);
  if (token !== config.adminPassword) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }
  await next();
});

app.post('/api/admin/login', async (c) => {
  const body = await c.req.json();
  const config = await getConfig(c);
  if (body.password === config.adminPassword) {
    return c.json({ success: true, token: config.adminPassword });
  }
  return c.json({ success: false });
});

app.get('/api/admin/status', async (c) => {
  const config = await getConfig(c);
  const now = Date.now();
  const onlineThreshold = 5 * 60 * 1000; // 5 mins
  
  const regUsers = config.registeredUsers || {};
  const activeArr = Array.from(activeUsers.values());

  const users = Object.entries(regUsers).map(([uName, data]: any) => {
     const memUser = activeArr.find(a => a.name === uName);
     const isOnline = memUser ? (now - memUser.lastSeen < onlineThreshold) : false;
     return {
        name: uName,
        ...data,
        isOnline,
        views: Math.max(data.views || 0, memUser?.views || 0),
        lastSeen: memUser?.lastSeen || data.lastSeen || data.createdAt
     };
  });
  
  // Sort by online first, then by lastSeen
  users.sort((a, b) => {
      if (a.isOnline === b.isOnline) return b.lastSeen - a.lastSeen;
      return a.isOnline ? -1 : 1;
  });

  return c.json({
    success: true,
    users,
    onlineCount: users.filter((u: any) => u.isOnline).length,
    config: {
      popupText: config.popupText,
      limitPerUser: config.limitPerUser,
      blocklist: config.blocklist
    }
  });
});

app.post('/api/admin/users/:name/popup', async (c) => {
  const name = c.req.param('name');
  const body = await c.req.json();
  const config = await getConfig(c);
  if (!config.registeredUsers) config.registeredUsers = {};
  if (config.registeredUsers[name]) {
     config.registeredUsers[name].forcePopup = !!body.forcePopup;
     await saveConfig(c, config);
  }
  return c.json({ success: true });
});

app.delete('/api/admin/users/:name', async (c) => {
  const name = c.req.param('name');
  const config = await getConfig(c);
  if (config.registeredUsers && config.registeredUsers[name]) {
     delete config.registeredUsers[name];
     await saveConfig(c, config);
  }
  return c.json({ success: true });
});

app.post('/api/admin/config', async (c) => {
  const body = await c.req.json();
  const newConfig: any = {};
  if (body.popupText !== undefined) newConfig.popupText = body.popupText;
  if (body.limitPerUser !== undefined) newConfig.limitPerUser = parseInt(body.limitPerUser);
  if (body.adminPassword) newConfig.adminPassword = body.adminPassword;
  
  // Blocklist
  if (body.blockIp !== undefined) {
    const config = await getConfig(c);
    const bl = [...config.blocklist, { ip: body.blockIp, ua: body.blockUa || '' }];
    newConfig.blocklist = bl;
  }
  if (body.unblockIndex !== undefined) {
    const config = await getConfig(c);
    const bl = config.blocklist.filter((_: any, i: number) => i !== body.unblockIndex);
    newConfig.blocklist = bl;
  }

  await saveConfig(c, newConfig);
  return c.json({ success: true });
});

app.post('/api/admin/upload-qr', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (file && file instanceof File) {
       const buffer = await file.arrayBuffer();
       if (c.env?.vpsai) {
          await c.env.vpsai.put('qr.png', buffer, { httpMetadata: { contentType: file.type } });
       } else {
          memoryQr = { buffer, type: file.type };
       }
       await saveConfig(c, { qrCodeUrl: '/api/qr-image?t=' + Date.now() });
       return c.json({ success: true, url: '/api/qr-image?t=' + Date.now() });
    }
    return c.json({ success: false, message: 'No file' });
  } catch(e: any) {
    return c.json({ success: false, message: e.message });
  }
});

app.get('/api/qr-image', async (c) => {
  if (c.env?.vpsai) {
    const object = await c.env.vpsai.get('qr.png');
    if (object) {
      c.header('Content-Type', object.httpMetadata?.contentType || 'image/png');
      return c.body(object.body);
    }
  } else if (memoryQr) {
    c.header('Content-Type', memoryQr.type);
    return c.body(memoryQr.buffer);
  }
  return c.notFound();
});

app.get('/api/app-config', async (c) => {
  const name = c.req.header('x-user-name') || 'Anonymous';
  const config = await getConfig(c);
  const forcePopup = name !== 'Anonymous' && config.registeredUsers?.[name]?.forcePopup;
  const userLimit = (name !== 'Anonymous' && config.registeredUsers?.[name]?.limit !== undefined) 
      ? config.registeredUsers[name].limit 
      : config.limitPerUser;
  
  return c.json({
    success: true,
    data: {
      popupText: config.popupText,
      qrCodeUrl: config.qrCodeUrl,
      limitPerUser: userLimit,
      forcePopup: !!forcePopup
    }
  });
});

app.post('/api/admin/users/:name/limit', async (c) => {
  const name = c.req.param('name');
  const body = await c.req.json();
  const config = await getConfig(c);
  if (!config.registeredUsers) config.registeredUsers = {};
  if (config.registeredUsers[name]) {
     if (body.limit === '' || body.limit === null || body.limit === undefined) {
        delete config.registeredUsers[name].limit;
     } else {
        config.registeredUsers[name].limit = parseInt(body.limit);
     }
     await saveConfig(c, config);
  }
  return c.json({ success: true });
});

app.post('/api/track-view', async (c) => {
  const ip = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
  const name = c.req.header('x-user-name') || 'Anonymous';
  
  const config = await getConfig(c);
  const existing = activeUsers.get(ip);
  let activeViews = 0;
  if (existing) {
    existing.views += 1;
    activeViews = existing.views;
    activeUsers.set(ip, existing);
  }
  
  let views = activeViews;
  let forcePopup = false;
  if (name !== 'Anonymous' && config.registeredUsers?.[name]) {
     config.registeredUsers[name].views = Math.max((config.registeredUsers[name].views || 0) + 1, activeViews);
     views = config.registeredUsers[name].views;
     forcePopup = !!config.registeredUsers[name].forcePopup;
     // Fire and forget save
     saveConfig(c, config).catch(() => {});
  }
  
  return c.json({ success: true, views, forcePopup });
});

const loadProxyIPs = async () => {
  try {
    if (Date.now() - lastFetch > 1000 * 60 * 60) {
      const response = await fetch('https://raw.githubusercontent.com/FoolVPN-ID/Nautica/main/proxyList.txt');
      const text = await response.text();
      const ips = text.split('\n')
        .map(line => line.split(',')[0].trim())
        .filter(ip => /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(ip));
      if (ips.length > 0) {
        proxyIPs = Array.from(new Set(ips));
        lastFetch = Date.now();
      }
    }
  } catch (e) {
    console.error('Failed to load proxy IPs:', e);
  }
};

const getFakeIP = () => {
  if (proxyIPs.length > 0) {
    return proxyIPs[Math.floor(Math.random() * proxyIPs.length)];
  }
  const r = () => Math.floor(Math.random() * 255) + 1;
  return `${r()}.${r()}.${r()}.${r()}`;
};

const getHeaders = (reqIp?: string) => {
  let fakeIP = reqIp === "Auto" || !reqIp ? getFakeIP() : reqIp;
  if (!fakeIP) fakeIP = getFakeIP();
  return {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
    "Referer": "https://drama.sansekai.my.id/",
    "Accept": "application/json",
    "X-Forwarded-For": fakeIP,
    "X-Real-IP": fakeIP,
    "Client-IP": fakeIP
  };
};

const safeFetch = async (url: string, userIp?: string) => {
  let attempt = 0;
  let currentIp = userIp;
  const maxAttempts = 10;
  while (attempt < maxAttempts) {
    const headers = getHeaders(currentIp);
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504 || res.status === 403) {
        attempt++;
        currentIp = "Auto";
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      return res;
    } catch (e) {
      attempt++;
      currentIp = "Auto";
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return await fetch(url, { headers: getHeaders(currentIp) });
};

// API routes
app.get('/api/proxies', async (c) => {
  await loadProxyIPs();
  return c.json({ success: true, data: proxyIPs });
});

app.get('/api/offline-key', async (c) => {
  const prefix = c.req.query('prefix');
  const providedKey = c.req.query('key');
  
  if (!prefix && !providedKey) return c.text("No prefix", 400);
  
  if (providedKey && providedKey.length > 0) {
     const bytes = new Uint8Array(Math.ceil(providedKey.length / 2));
     for (let i = 0; i < bytes.length; i++) {
       bytes[i] = parseInt(providedKey.substring(i * 2, i * 2 + 2), 16);
     }
     c.header('Content-Type', 'application/octet-stream');
     return c.body(bytes.buffer as ArrayBuffer);
  }

  // MD5 using CryptoJS instead of Node's crypto
  const hashWords = CryptoJS.MD5(prefix || '').words;
  const hashBytes = new Uint8Array(16);
  for(let i=0; i<4; i++) {
    hashBytes[i*4] = (hashWords[i] >> 24) & 0xff;
    hashBytes[i*4+1] = (hashWords[i] >> 16) & 0xff;
    hashBytes[i*4+2] = (hashWords[i] >> 8) & 0xff;
    hashBytes[i*4+3] = hashWords[i] & 0xff;
  }
  
  c.header('Content-Type', 'application/octet-stream');
  return c.body(hashBytes.buffer as ArrayBuffer);
});

app.get('/api/hls-proxy', async (c) => {
  const targetUrl = c.req.query('url');
  if (!targetUrl) return c.text("No URL provided", 400);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
        "Referer": "https://drama.sansekai.my.id/"
      }
    });
    
    if (!response.ok) {
      return c.text(response.statusText, response.status as any);
    }
    
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
       const urlObj = new URL(targetUrl);
       const searchParams = urlObj.search;
       const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
       const text = await response.text();
       
       const lines = text.split('\n');
       const proxiedLines = lines.map(line => {
           const trimmedLine = line.trim();
           if (trimmedLine.startsWith('#')) {
               if (trimmedLine.includes('URI="')) {
                   return line.replace(/URI="([^"]+)"/, (_, uri) => {
                       if (uri.startsWith('local://offline-key')) {
                         let prefix = '';
                         if (uri.includes('prefix=')) {
                             prefix = uri.split('prefix=')[1].split('&')[0];
                         }
                         if (prefix) return `URI="/api/offline-key?prefix=${prefix}"`;
                       }
                       const absoluteUri = uri.startsWith('http') ? uri : basePath + uri + searchParams;
                       return `URI="/api/hls-proxy?url=${encodeURIComponent(absoluteUri)}"`;
                   });
               }
               return line;
           } else if (trimmedLine !== '') {
               const absoluteUri = trimmedLine.startsWith('http') ? trimmedLine : basePath + trimmedLine + searchParams;
               return `/api/hls-proxy?url=${encodeURIComponent(absoluteUri)}`;
           }
           return line;
       });
       
       c.header('Content-Type', contentType);
       return c.text(proxiedLines.join('\n'));
    } else {
       c.header('Content-Type', contentType);
       return c.body(response.body); // streaming directly via fetch body!
    }
  } catch(err: any) {
     console.error("Proxy error:", err);
     return c.text("Proxy error: " + err.message, 500);
  }
});

app.get('/api/proxy-video', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.text('URL is required', 400);

  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://drama.sansekai.my.id/",
      "Accept": "*/*",
    };

    const range = c.req.header('range');
    if (range) headers['Range'] = range;

    const response = await fetch(url, { headers });

    // Copy response headers
    response.headers.forEach((val, key) => {
      c.header(key, val);
    });

    c.status(response.status as any);
    return c.body(response.body);
  } catch (error: any) {
    console.error("Proxy error:", error);
    return c.text("Proxy error", 500);
  }
});

// All fetch/discovery logic
app.get('/api/searchAll', async (c) => {
  try {
     const userIp = c.req.header('x-user-ip') || '';
     const q = c.req.query('q');
     if (!q) return c.json({ success: true, total: 0, data: [] });
     
     const query = encodeURIComponent(q);
     const providers = ['reelshort', 'netshort', 'dramanova', 'pinedrama', 'dramabox'];
     const secretKey = "Sansekai-SekaiDrama";
     
     const promises = providers.map(async (provider) => {
        const url = `https://api.sansekai.my.id/api/${provider}/search?query=${query}`;
        try {
           const apiRes = await safeFetch(url, userIp);
           if (!apiRes.ok) return [];
           
           const result = await apiRes.json();
           let rawData: any = [];

           if (Array.isArray(result)) {
             rawData = result;
           } else if (result.contentInfos && Array.isArray(result.contentInfos)) {
             rawData = result.contentInfos;
           } else if (result.data?.items && Array.isArray(result.data.items)) {
             rawData = result.data.items;
           } else if (result.rows && Array.isArray(result.rows)) {
             rawData = result.rows; 
           } else if (result.success && result.data?.lists) {
             rawData = result.data.lists; 
           } else if (result.data && typeof result.data === 'string') {
             try {
               const bytes = CryptoJS.AES.decrypt(result.data, secretKey);
               rawData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
               if (rawData.collections) rawData = rawData.collections; 
             } catch(e) {}
           } else if (result.results && Array.isArray(result.results)) {
             rawData = result.results; 
           } else if (result.list && Array.isArray(result.list)) {
             rawData = result.list;
           } else if (result.collections && Array.isArray(result.collections)) {
             rawData = result.collections;
           } else if (result.data) {
             rawData = Array.isArray(result.data) ? result.data : (result.data.lists || result.data.collections || result.data.list || [result.data]);
           }
           if (!Array.isArray(rawData)) rawData = [];
           
           return rawData.map((item: any) => ({
              id: item.bookId || item.book_id || item.collection_id || item.id || item.shortPlayId || item.dramaId || item.key || item.playId,
              title: item.bookName || item.book_title || item.title || item.name || item.shortPlayName || item.contentName || "Unknown",
              cover: item.coverWap || item.book_pic || (item.cover_urls ? item.cover_urls[0] : null) || item.cover || item.img || item.shortPlayCover || item.posterImg || item.vCover || "",
              episodes: item.chapterCount || item.chapter_count || item.totalEpisodes || item.total_episodes || item.episodes || item.episode_count || 0,
              desc: item.introduction || item.special_desc || item.description || item.categories || item.desc || item.synopsis || item.shortPlayLabels || "",
              views: item.rankVo?.hotCode || item.read_count || item.views || item.playCount || item.viewCount || item.heatScoreShow || item.follow_count || '',
              tags: item.tags || item.theme || (item.tag_list ? item.tag_list.map((t:any)=>t.tag_name) : []) || (item.categories && typeof item.categories === 'string' ? item.categories.split(',').map((t: string) => t.trim()) : []) || item.labelArray || item.categoryNames || item.series_tag || [],
              provider: provider
           }));
        } catch(e) {
           return [];
        }
     });

     const resultsArrays = await Promise.all(promises);
     const allResults = resultsArrays.flat().filter(item => item.id && item.title !== "Unknown" && item.cover);
     
     return c.json({
       success: true,
       total: allResults.length,
       data: allResults
     });
  } catch(err: any) {
     return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/latest', async (c) => c.json({ success: true, total: 0, data: [] }));

app.get('/api/:provider/detail', async (c) => {
  const provider = c.req.param('provider');
  const id = c.req.query('id');
  const secretKey = "Sansekai-SekaiDrama";
  const userIp = c.req.header('x-user-ip');
  
  if (provider === "freereels") {
     return c.json({ success: false, message: "FreeReels tidak didukung." });
  }

  let endpoint = "detail";
  if (provider === "netshort") endpoint = "foryou";
  else if (provider === "dramanova") endpoint = "detail";
  else if (provider === "reelshort") endpoint = "foryou";
  else if (provider === "pinedrama") endpoint = "detail";
  else if (provider === "dramabox") endpoint = "allepisode";

  let url = `https://api.sansekai.my.id/api/${provider}/${endpoint}?id=${id}&bookId=${id}&collection_id=${id}&shortPlayId=${id}&dramaId=${id}&key=${id}`;

  try {
    const response = await safeFetch(url, userIp);
    if (!response.ok) {
      return c.json({
        success: true,
        data: { id, title: "Unknown", desc: "", total_episodes: 100, cover: "" }
      });
    }

    const result = await response.json();
    let rawData;
    if (result.data && typeof result.data === 'string') {
      try {
        const bytes = CryptoJS.AES.decrypt(result.data, secretKey);
        rawData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      } catch(e) {
        rawData = result.data;
      }
    } else {
      rawData = result.data || result;
    }

    return c.json({
      success: true,
      data: {
        id: id,
        title: rawData.title || rawData.bookName || rawData.name || rawData.book_title || rawData.shortPlayName || "Unknown",
        desc: rawData.description || rawData.introduction || rawData.special_desc || rawData.desc || rawData.shotIntroduce || "",
        total_episodes: rawData.totalEpisodes || rawData.chapterCount || rawData.total_episodes || rawData.chapter_count || rawData.episodes || rawData.totalEpisode || 0,
        cover: rawData.cover || rawData.coverWap || rawData.book_pic || (rawData.cover_urls?.[0] || '') || rawData.img || rawData.shortPlayCover || rawData.posterImg || "",
      }
    });
  } catch (e: any) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.get('/api/:provider/episode', async (c) => {
  const provider = c.req.param('provider');
  const id = c.req.query('id');
  const ep = c.req.query('ep') || '1';
  const secretKey = "Sansekai-SekaiDrama";
  const userIp = c.req.header('x-user-ip');
  
  let url = `https://api.sansekai.my.id/api/${provider}/episode?id=${id}&bookId=${id}&collection_id=${id}&shortPlayId=${id}&dramaId=${id}&key=${id}&episodeNumber=${ep}`;
  if (provider === "freereels") {
     return c.json({ success: false, message: "Provider FreeReels saat ini tidak didukung." });
  }
  if (provider === "dramabox" || provider === "netshort") {
    url = `https://api.sansekai.my.id/api/${provider}/allepisode?bookId=${id}&id=${id}&shortPlayId=${id}&dramaId=${id}&key=${id}`;
  } else if (provider === "dramanova") { 
    url = `https://api.sansekai.my.id/api/dramanova/detail?dramaId=${id}&id=${id}`;
  }

  try {
    const response = await safeFetch(url, userIp);
    const responseText = await response.text();
    let result;

    if (!response.ok) {
      return c.json({ success: false, message: `Endpoint tidak didukung oleh penyedia (status: ${response.status}). URL: ${url}` });
    }

    try {
      result = JSON.parse(responseText);
    } catch (parseError: any) {
      return c.json({ success: false, message: "Upstream API error: Format tidak valid", debug: responseText.slice(0, 100) });
    }
    
    let decryptedData: any = result;
    if (result.data && typeof result.data === 'string') {
      try {
        const bytes = CryptoJS.AES.decrypt(result.data, secretKey);
        decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      } catch(e) {
        decryptedData = result.data;
      }
    } else if (result.data) {
      decryptedData = result.data;
    }

    let videoUrl = "";
    let title = "";
    let quality = "HD";

    if (Array.isArray(decryptedData) && provider === 'dramabox') {
      const epIndex = parseInt(ep) - 1;
      const episodeData = decryptedData[epIndex] || decryptedData[0];
      title = episodeData?.chapterName || `Episode ${ep}`;
      if (episodeData && episodeData.cdnList && episodeData.cdnList.length > 0) {
        const cdn = episodeData.cdnList.find((c: any) => c.isDefault === 1) || episodeData.cdnList[0];
        if (cdn && cdn.videoPathList && cdn.videoPathList.length > 0) {
          const video = cdn.videoPathList.find((v: any) => v.isDefault === 1) || cdn.videoPathList[0];
          videoUrl = video.videoPath;
          quality = video.quality + "p";
        }
      }
    } else if (provider === 'netshort' && decryptedData.shortPlayEpisodeInfos && Array.isArray(decryptedData.shortPlayEpisodeInfos)) {
      const epIndex = parseInt(ep) - 1;
      const episodeData = decryptedData.shortPlayEpisodeInfos[epIndex] || decryptedData.shortPlayEpisodeInfos[0];
      title = episodeData?.episodeName || `Episode ${ep}`;
      videoUrl = episodeData?.playVoucher || episodeData?.playUrl || episodeData?.url || episodeData?.videoUrl || "";
    } else if (provider === 'freereels' && decryptedData.items && Array.isArray(decryptedData.items)) {
      const epIndex = parseInt(ep) - 1;
      const episodeData = decryptedData.items[epIndex]?.episode_info || decryptedData.items[0]?.episode_info;
      title = episodeData?.name || `Episode ${ep}`;
      videoUrl = episodeData?.external_audio_h264_m3u8 || episodeData?.m3u8_url || episodeData?.video_url || "";
    } else if (provider === 'dramanova' && decryptedData.episodes && Array.isArray(decryptedData.episodes)) {
      const epIndex = parseInt(ep) - 1;
      const episodeData = decryptedData.episodes[epIndex] || decryptedData.episodes[0];
      title = episodeData?.title || `Episode ${ep}`;
      videoUrl = episodeData?.playUrl || episodeData?.url || episodeData?.videoUrl || "";
      if (!videoUrl && episodeData?.fileId) {
         try {
           const dnRes = await fetch(`https://api.sansekai.my.id/api/dramanova/getVideo?fileId=${episodeData.fileId}`, { headers: getHeaders(userIp) });
           const dnData = await dnRes.json();
           if (dnData?.Result?.PlayInfoList?.[0]) {
               videoUrl = dnData.Result.PlayInfoList[0].MainPlayUrl || "";
               quality = dnData.Result.PlayInfoList[0].Definition || "HD";
           }
         } catch(e) {}
      }
    } else if (provider === 'shortmax' && decryptedData.episode) {
      title = decryptedData.shortPlayName ? `${decryptedData.shortPlayName} - Episode ${ep}` : `Episode ${ep}`;
      const epUrls = decryptedData.episode.videoUrl || {};
      videoUrl = epUrls.video_1080 || epUrls.video_720 || epUrls.video_480 || epUrls.video_url || "";
      if (epUrls.video_1080) quality = "1080p";
      else if (epUrls.video_720) quality = "720p";
      if (decryptedData.episode.needDecrypt || videoUrl.includes("hls-encrypted")) {
          return c.json({ success: false, message: "Video untuk ShortMax dilindungi DRM. Belum didukung." });
      }
    } else if (decryptedData.videoList && decryptedData.videoList.length > 0) {
      title = decryptedData.title || decryptedData.name || `Episode ${ep}`;
      const video = decryptedData.videoList.find((v: any) => v.encode === 'H264') || decryptedData.videoList[0];
      videoUrl = video.url || video.videoPath || video.playUrl || "";
      quality = video.quality ? video.quality + 'p' : 'HD';
    } else if (decryptedData.best_url || (decryptedData.main && decryptedData.main.indo_hd_cdn_urls)) {
      title = decryptedData.title || `Episode ${ep}`;
      quality = decryptedData.quality || 'HD';
      videoUrl = decryptedData.best_url || (decryptedData.main?.indo_hd_cdn_urls?.[0]) || "";
    } else if (decryptedData.playUrl || decryptedData.videoUrl || decryptedData.url) {
      title = decryptedData.title || decryptedData.chapterName || `Episode ${ep}`;
      videoUrl = decryptedData.playUrl || decryptedData.videoUrl || decryptedData.url || "";
    }

    if (!videoUrl) {
      return c.json({ success: false, message: "URL video tidak ditemukan untuk provider ini di episode yang diminta." });
    }

    const rawUrl = videoUrl;
    const needsProxy = provider === 'freereels' || provider === 'pinedrama' || videoUrl.includes('.m3u8');
    if (needsProxy && provider !== 'reelshort' && !videoUrl.includes('.mp4')) {
       videoUrl = `/api/hls-proxy?url=${encodeURIComponent(videoUrl)}`;
    }

    return c.json({ success: true, title, videoUrl, rawUrl, quality });
  } catch (error: any) {
    return c.json({ success: false, error: "Gagal memproses video. " + error.message });
  }
});

app.get('/api/:provider/foryou', async (c) => {
  try {
    const provider = c.req.param('provider');
    if (provider === "shortmax") return c.json({ success: false, message: "Shortmax removed" }, 404);
    
    const secretKey = "Sansekai-SekaiDrama";
    const userIp = c.req.header('x-user-ip') || '';
    
    let endpoint = "foryou";
    if (provider === "dramabox") endpoint = "foryou?page=1";
    if (provider === "pinedrama") endpoint = "trending";
    if (provider === "dramanova") endpoint = "home";

    const url = `https://api.sansekai.my.id/api/${provider}/${endpoint}`;
    const apiRes = await safeFetch(url, userIp);

    if (!apiRes.ok) {
       return c.json({ success: false, message: `Failed to fetch from ${provider} (status: ${apiRes.status})` }, apiRes.status as any);
    }

    const result = await apiRes.json();
    let rawData: any = [];

    if (Array.isArray(result)) {
      rawData = result;
    } else if (result.contentInfos && Array.isArray(result.contentInfos)) {
      rawData = result.contentInfos; 
    } else if (result.data?.items && Array.isArray(result.data.items)) {
      rawData = result.data.items; 
    } else if (result.rows && Array.isArray(result.rows)) {
      rawData = result.rows; 
    } else if (result.success && result.data?.lists) {
      rawData = result.data.lists; 
    } else if (result.data && typeof result.data === 'string') {
      try {
        const bytes = CryptoJS.AES.decrypt(result.data, secretKey);
        rawData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        if (rawData.collections) rawData = rawData.collections; 
      } catch(e) {}
    } else if (result.results && Array.isArray(result.results)) {
      rawData = result.results;
    } else if (result.list && Array.isArray(result.list)) {
      rawData = result.list;
    } else if (result.collections && Array.isArray(result.collections)) {
      rawData = result.collections;
    } else if (result.data) {
      rawData = Array.isArray(result.data) ? result.data : (result.data.lists || result.data.collections || [result.data]);
    }

    if (!Array.isArray(rawData)) rawData = [];

    const cleanData = rawData.map((item: any) => ({
      id: item.bookId || item.book_id || item.collection_id || item.id || item.shortPlayId || item.dramaId || item.key || item.playId,
      title: item.bookName || item.book_title || item.title || item.name || item.shortPlayName || item.contentName || "Unknown",
      cover: item.coverWap || item.book_pic || (item.cover_urls ? item.cover_urls[0] : null) || item.cover || item.img || item.shortPlayCover || item.posterImg || item.vCover || "",
      episodes: item.chapterCount || item.chapter_count || item.totalEpisodes || item.total_episodes || item.episodes || item.episode_count || 0,
      desc: item.introduction || item.special_desc || item.description || item.categories || item.desc || item.synopsis || item.shortPlayLabels || "",
      views: item.rankVo?.hotCode || item.read_count || item.views || item.playCount || item.viewCount || item.heatScoreShow || item.follow_count || '',
      tags: item.tags || item.theme || (item.tag_list ? item.tag_list.map((t:any)=>t.tag_name) : []) || (item.categories && typeof item.categories === 'string' ? item.categories.split(',').map((t: string) => t.trim()) : []) || item.labelArray || item.categoryNames || item.series_tag || [],
      provider: provider
    }));

    return c.json({ success: true, total: cleanData.length, data: cleanData });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.get('/api/:provider/homepage', async (c) => {
   // Redirect homepage to foryou for simplicity handling
   const provider = c.req.param('provider');
   return c.redirect(`/api/${provider}/foryou`);
});

app.get('*', async (c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.notFound();
  }
  // Fallback for SPA routing to serve index.html
  try {
    const url = new URL(c.req.url);
    url.pathname = '/';
    // @ts-ignore
    return await c.env?.ASSETS?.fetch(new Request(url, c.req.raw));
  } catch (e) {
    return c.text('Not found', 404);
  }
});

export default app;
