import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import CryptoJS from "crypto-js";
import crypto from "crypto";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // JSON parsing middleware
  app.use(express.json());

  let proxyIPs: string[] = [];
  let lastFetch = 0;

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
  
  loadProxyIPs();

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
          // Auto switch IP on limit
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

  app.get('/api/proxies', async (req, res) => {
    await loadProxyIPs();
    return res.json({ success: true, data: proxyIPs });
  });

  app.get('/api/offline-key', (req, res) => {
    const prefix = req.query.prefix as string;
    const providedKey = req.query.key as string;
    
    if (!prefix && !providedKey) return res.status(400).send("No prefix");
    
    if (providedKey && providedKey.length > 0) {
       // if api ever provides the raw key
       const keyBuf = Buffer.from(providedKey, 'hex'); // Assuming hex, or can be base64. 
       res.setHeader('Content-Type', 'application/octet-stream');
       res.setHeader('Access-Control-Allow-Origin', '*');
       return res.send(keyBuf.length === 16 ? keyBuf : Buffer.alloc(16));
    }

    const crypto = require('crypto');
    // Generate an MD5 hash of the prefix as a dummy fallback (won't decrypt properly without the real algorithm)
    const key = crypto.createHash('md5').update(prefix || '').digest();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(key));
  });

  app.get('/api/hls-proxy', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("No URL provided");

    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
          "Referer": "https://drama.sansekai.my.id/"
        }
      });
      
      if (!response.ok) {
        return res.status(response.status).send(response.statusText);
      }
      
      const contentType = response.headers.get('content-type') || '';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
         const urlObj = new URL(targetUrl);
         const searchParams = urlObj.search; // Returns something like ?auth_key=...
         const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
         const text = await response.text();
         
         const lines = text.split('\n');
         const proxiedLines = lines.map(line => {
             const trimmedLine = line.trim();
             if (trimmedLine.startsWith('#')) {
                 if (trimmedLine.includes('URI="')) {
                     return line.replace(/URI="([^"]+)"/, (_, uri) => {
                         if (uri.startsWith('local://offline-key')) {
                           const urlParams = new URLSearchParams(uri.split('?')[1] || uri.split('/offline-key/')[1]);
                           const prefix = urlParams.get('prefix');
                           if (prefix) {
                               return `URI="/api/offline-key?prefix=${prefix}"`;
                           }
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
         
         return res.send(proxiedLines.join('\n'));
      } else {
         const buffer = await response.arrayBuffer();
         return res.send(Buffer.from(buffer));
      }
    } catch(err) {
       console.error("Proxy error:", err);
       return res.status(500).send("Proxy error");
    }
  });

  // API routing
  app.get(["/api/:provider/foryou", "/api/:provider/homepage", "/api/:provider/search"], async (req, res) => {
    try {
      const provider = req.params.provider;
      if (provider === "shortmax") return res.status(404).json({ success: false, message: "Shortmax removed" });
      
      const secretKey = "Sansekai-SekaiDrama";
      const userIp = req.headers['x-user-ip'] as string;
      
      // Determine what endpoint to hit on sansekai
      // If the path hit was "/api/:provider/homepage", we could use "homepage". But let's use what works.
      let endpoint = "foryou";
      if (req.path.includes("/homepage")) endpoint = "homepage";
      if (req.path.includes("/search")) endpoint = `search?query=${encodeURIComponent((req.query.q || req.query.keyword || 'love') as string)}`;
      
      if (endpoint === "foryou" && provider === "dramabox") {
        endpoint = "foryou?page=1";
      } else if (endpoint === "foryou" && provider === "pinedrama") {
        endpoint = "trending";
      } else if (endpoint === "foryou" && provider === "dramanova") {
        endpoint = "home";
      }

      const url = `https://api.sansekai.my.id/api/${provider}/${endpoint}`;
      const apiRes = await safeFetch(url, userIp);

      if (!apiRes.ok) {
         let errorDetail = "";
         try { const errorJson = await apiRes.json(); errorDetail = JSON.stringify(errorJson) } catch (e) {}
         return res.status(apiRes.status).json({ success: false, message: `Failed to fetch from ${provider} (status: ${apiRes.status}). Detail: ${errorDetail}` });
      }

      const result = await apiRes.json();
      console.log(`[DEBUG feed] From ${url} with IP: ${userIp} | Status: ${apiRes.status} | Content:`, JSON.stringify(result).substring(0, 500));
      let rawData: any = [];

      if (Array.isArray(result)) {
        rawData = result;
      } else if (result.contentInfos && Array.isArray(result.contentInfos)) {
        rawData = result.contentInfos; // netshort
      } else if (result.data?.items && Array.isArray(result.data.items)) {
        rawData = result.data.items; // freereels
      } else if (result.rows && Array.isArray(result.rows)) {
        rawData = result.rows; // dramanova
      } else if (result.success && result.data?.lists) {
        rawData = result.data.lists; // reelshort
      } else if (result.data && typeof result.data === 'string') {
        try {
          const bytes = CryptoJS.AES.decrypt(result.data, secretKey);
          rawData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
          if (rawData.collections) rawData = rawData.collections; // pinedrama unwrap
        } catch(e) {
          console.error("Decryption failed", e);
        }
      } else if (result.results && Array.isArray(result.results)) {
        rawData = result.results; // shortmax
      } else if (result.list && Array.isArray(result.list)) {
        rawData = result.list;
      } else if (result.collections && Array.isArray(result.collections)) {
        rawData = result.collections;
      } else if (result.data) {
        rawData = Array.isArray(result.data) ? result.data : (result.data.lists || result.data.collections || [result.data]);
      }

      if (!Array.isArray(rawData)) { // fallback
         rawData = [];
      }

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

      return res.json({
        success: true,
        total: cleanData.length,
        data: cleanData
      });

    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  // Global Search API
  app.get("/api/searchAll", async (req, res) => {
    try {
       const userIp = req.headers['x-user-ip'] as string;
       const q = req.query.q as string;
       if (!q) return res.json({ success: true, total: 0, data: [] });
       
       const query = encodeURIComponent(q);
       const providers = ['reelshort', 'netshort', 'dramanova', 'pinedrama', 'dramabox'];
       const secretKey = "Sansekai-SekaiDrama";
       
       const promises = providers.map(async (provider) => {
          let endpoint = `search?query=${query}`;
          
          const url = `https://api.sansekai.my.id/api/${provider}/${endpoint}`;
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
       
       return res.json({
         success: true,
         total: allResults.length,
         data: allResults
       });
    } catch(err: any) {
       return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Backward compatibility alias (if any frontend component still uses it)
  app.get("/api/latest", async (req, res) => {
    return res.json({ success: true, total: 0, data: [] });
  });

  app.get('/api/proxy-video', async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).send('URL is required');
    }

    try {
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://drama.sansekai.my.id/",
        "Accept": "*/*",
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const response = await fetch(url, {
        headers,
      });

      res.status(response.status);
      response.headers.forEach((val, key) => {
        // Exclude some headers that shouldn't be proxied back directly if needed
        res.setHeader(key, val);
      });

      if (response.body) {
        const { Readable } = await import('stream');
        const nodeStream = Readable.fromWeb(response.body as any);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).end();
    }
  });

  app.get('/api/:provider/detail', async (req, res) => {
    const provider = req.params.provider;
    const id = req.query.id as string;
    const secretKey = "Sansekai-SekaiDrama";
    const userIp = req.headers['x-user-ip'] as string;
    
    if (provider === "freereels") {
       return res.json({
          success: false,
          message: "FreeReels tidak didukung."
       });
    }

    // Different providers have different endpoints for getting full series info.
    let endpoint = "detail";
    if (provider === "netshort") {
      endpoint = "allepisode";
    }

    let url = `https://api.sansekai.my.id/api/${provider}/${endpoint}?id=${id}&bookId=${id}&collection_id=${id}&shortPlayId=${id}&dramaId=${id}&key=${id}`;

    try {
      const response = await safeFetch(url, userIp);
      
      if (!response.ok) {
        return res.json({
          success: true,
          data: {
             id: id,
             title: "Unknown",
             desc: "",
             total_episodes: 100, // mock so the UI doesn't break
             cover: ""
          }
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

      res.json({
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
      res.status(200).json({ success: false, message: e.message });
    }
  });

  app.get('/api/:provider/episode', async (req, res) => {
    const provider = req.params.provider;
    const id = req.query.id as string;
    const ep = req.query.ep as string;
    const secretKey = "Sansekai-SekaiDrama";
    const userIp = req.headers['x-user-ip'] as string;
    
    let url = `https://api.sansekai.my.id/api/${provider}/episode?id=${id}&bookId=${id}&collection_id=${id}&shortPlayId=${id}&dramaId=${id}&key=${id}&episodeNumber=${ep}`;
    if (provider === "freereels") {
       return res.status(200).json({ 
          success: false, 
          message: "Provider FreeReels saat ini tidak didukung untuk pemutaran episode karena API tidak tersedia." 
       });
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
        return res.status(200).json({ 
            success: false, 
            message: `Endpoint tidak didukung oleh penyedia (status: ${response.status}). URL: ${url}` 
        });
      }

      try {
        result = JSON.parse(responseText);
      } catch (parseError: any) {
        return res.status(200).json({ 
          success: false, 
          message: "Upstream API error: Format tidak valid", 
          debug: responseText.slice(0, 100) 
        });
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

      // Generic parsing logic since data shapes differ
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
             if (dnData?.Result?.PlayInfoList && dnData.Result.PlayInfoList.length > 0) {
                 videoUrl = dnData.Result.PlayInfoList[0].MainPlayUrl || "";
                 quality = dnData.Result.PlayInfoList[0].Definition || "HD";
             }
           } catch(e) {
             console.error("Dramanova video fetch error", e);
           }
        }
      } else if (provider === 'shortmax' && decryptedData.episode) {
        title = decryptedData.shortPlayName ? `${decryptedData.shortPlayName} - Episode ${ep}` : `Episode ${ep}`;
        const epUrls = decryptedData.episode.videoUrl || {};
        videoUrl = epUrls.video_1080 || epUrls.video_720 || epUrls.video_480 || epUrls.video_url || "";
        if (epUrls.video_1080) quality = "1080p";
        else if (epUrls.video_720) quality = "720p";
        
        if (decryptedData.episode.needDecrypt || videoUrl.includes("hls-encrypted")) {
            return res.status(200).json({
                success: false,
                message: "Video untuk ShortMax dilindungi DRM (Enkripsi tingkat tinggi) dan saat ini belum didukung oleh Sansekai API. Silakan kembali dan tonton drama dari provider lain seperti PineDrama/ReelShort/DramaBox."
            });
        }
      } else if (decryptedData.videoList && decryptedData.videoList.length > 0) {
        title = decryptedData.title || decryptedData.name || `Episode ${ep}`;
        const video = decryptedData.videoList.find((v: any) => v.encode === 'H264') || decryptedData.videoList[0];
        videoUrl = video.url || video.videoPath || video.playUrl || "";
        quality = video.quality ? video.quality + 'p' : 'HD';
      } else if (decryptedData.best_url || (decryptedData.main && decryptedData.main.indo_hd_cdn_urls)) {
        title = decryptedData.title || `Episode ${ep}`;
        quality = decryptedData.quality || 'HD';
        videoUrl = decryptedData.best_url || (decryptedData.main && decryptedData.main.indo_hd_cdn_urls && decryptedData.main.indo_hd_cdn_urls[0]) || "";
      } else if (decryptedData.playUrl || decryptedData.videoUrl || decryptedData.url) {
        title = decryptedData.title || decryptedData.chapterName || `Episode ${ep}`;
        videoUrl = decryptedData.playUrl || decryptedData.videoUrl || decryptedData.url || "";
      }

      if (!videoUrl) {
        return res.status(200).json({ success: false, message: "URL video tidak ditemukan untuk provider ini di episode yang diminta." });
      }

      const rawUrl = videoUrl;
      const needsProxy = provider === 'freereels' || provider === 'pinedrama' || videoUrl.includes('.m3u8');
      
      if (needsProxy && provider !== 'reelshort' && !videoUrl.includes('.mp4')) {
         videoUrl = `/api/hls-proxy?url=${encodeURIComponent(videoUrl)}`;
      }

      return res.json({
        success: true,
        title: title,
        videoUrl: videoUrl,
        rawUrl: rawUrl,
        quality: quality
      });

    } catch (error: any) {
      return res.status(200).json({ success: false, error: "Gagal memproses video. " + error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Fallback to index.html for SPA router
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
