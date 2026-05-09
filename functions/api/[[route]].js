import CryptoJS from "crypto-js";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
    "Referer": "https://drama.sansekai.my.id/",
    "Accept": "application/json"
  };

  const secretKey = "Sansekai-SekaiDrama";
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. LATEST endpoint
    if (path === '/api/latest') {
      const [pineRes, dramaRes] = await Promise.all([
        fetch('https://drama.sansekai.my.id/api/pinedrama/trending', { headers }),
        fetch('https://drama.sansekai.my.id/api/dramabox/latest', { headers })
      ]);

      let cleanData = [];

      if (pineRes.ok) {
        const pineResult = await pineRes.json();
        if (pineResult.data) {
          const pineBytes = CryptoJS.AES.decrypt(pineResult.data, secretKey);
          const pineData = JSON.parse(pineBytes.toString(CryptoJS.enc.Utf8));
          const pineFormatted = (pineData.collections || []).map(item => ({
            id: item.collection_id,
            title: item.title,
            cover: item.cover_urls?.[0] || item.cover || '',
            episodes: item.total_episodes,
            desc: item.description || item.categories,
            views: item.views,
            tags: item.categories ? item.categories.split(',').map(t => t.trim()) : [],
            provider: 'pinedrama'
          }));
          cleanData = [...cleanData, ...pineFormatted];
        }
      }

      if (dramaRes.ok) {
        const dramaResult = await dramaRes.json();
        if (dramaResult.data) {
          const dramaBytes = CryptoJS.AES.decrypt(dramaResult.data, secretKey);
          const dramaData = JSON.parse(dramaBytes.toString(CryptoJS.enc.Utf8));
          const dramaFormatted = (Array.isArray(dramaData) ? dramaData : []).map(item => ({
            id: item.bookId,
            title: item.bookName,
            cover: item.coverWap,
            episodes: item.chapterCount,
            desc: item.introduction,
            views: item.rankVo?.hotCode || '',
            tags: item.tags || [],
            provider: 'dramabox'
          }));
          cleanData = [...cleanData, ...dramaFormatted];
        }
      }

      return new Response(JSON.stringify({
        success: true,
        total: cleanData.length,
        data: cleanData.sort(() => Math.random() - 0.5)
      }), { headers: corsHeaders });
    }

    // 2. DETAILS endpoint
    const detailsMatch = path.match(/^\/api\/details\/([^/]+)\/([^/]+)$/);
    if (detailsMatch) {
      const provider = detailsMatch[1];
      const id = detailsMatch[2];
      
      let upstream = provider === "dramabox" 
        ? `https://drama.sansekai.my.id/api/dramabox/detail?bookId=${id}`
        : `https://drama.sansekai.my.id/api/pinedrama/detail?collection_id=${id}`;

      const response = await fetch(upstream, { headers });
      if (response.status !== 200) {
        return new Response(JSON.stringify({ success: false, message: "Penyedia tidak mengembalikan detail." }), { status: response.status, headers: corsHeaders });
      }

      const result = await response.json();
      if (!result.data) {
         return new Response(JSON.stringify({ success: false, message: "Response invalid." }), { headers: corsHeaders });
      }

      const bytes = CryptoJS.AES.decrypt(result.data, secretKey);
      const rawData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

      return new Response(JSON.stringify({
        success: true,
        data: {
          id: id,
          title: provider === "dramabox" ? rawData.bookName : rawData.title,
          desc: provider === "dramabox" ? rawData.introduction : rawData.description,
          total_episodes: provider === "dramabox" ? rawData.chapterCount : rawData.total_episodes,
          cover: provider === "dramabox" ? rawData.coverWap : (rawData.cover_urls?.[0] || ''),
        }
      }), { headers: corsHeaders });
    }

    // 3. PLAY endpoint
    const playMatch = path.match(/^\/api\/play\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (playMatch) {
      const provider = playMatch[1];
      const id = playMatch[2];
      const ep = playMatch[3];
      
      let upstream = provider === "dramabox"
        ? `https://drama.sansekai.my.id/api/dramabox/episode?bookId=${id}&episodeNumber=${ep}`
        : `https://drama.sansekai.my.id/api/pinedrama/episode?collection_id=${id}&episodeNumber=${ep}`;

      const response = await fetch(upstream, { headers });
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        return new Response(JSON.stringify({ success: false, message: "Upstream API error: Format tidak valid", debug: responseText.slice(0, 100) }), { status: 500, headers: corsHeaders });
      }

      if (!result.data) {
        return new Response(JSON.stringify({ success: false, message: "Data tidak ditemukan." }), { status: 404, headers: corsHeaders });
      }

      const bytes = CryptoJS.AES.decrypt(result.data, secretKey);
      const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
      
      let decryptedData;
      try {
        decryptedData = JSON.parse(decryptedText);
      } catch (decryptErr) {
        return new Response(JSON.stringify({ success: false, message: "Gagal mendekripsi video." }), { status: 500, headers: corsHeaders });
      }

      const videoUrl = decryptedData.best_url || (decryptedData.main && decryptedData.main.indo_hd_cdn_urls && decryptedData.main.indo_hd_cdn_urls[0]) || decryptedData.videoUrl || decryptedData.url;

      if (!videoUrl) {
         return new Response(JSON.stringify({ success: false, message: "URL video tidak ditemukan di data." }), { status: 404, headers: corsHeaders });
      }

      return new Response(JSON.stringify({
        success: true,
        title: decryptedData.title || decryptedData.bookName || '',
        videoUrl: videoUrl,
        rawUrl: videoUrl,
        quality: decryptedData.quality || 'HD'
      }), { headers: corsHeaders });
    }

    // Proxy video endpoint (though not strictly needed if we fetch direct URL on browser)
    if (path === '/api/proxy-video') {
       const videoUrl = url.searchParams.get('url');
       if (!videoUrl) return new Response('URL is required', { status: 400 });
       
       const proxyReq = new Request(videoUrl, request);
       return fetch(proxyReq);
    }

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: corsHeaders });
  }

  // Fallback for unmatched routes inside /api/
  return new Response("Not Found", { status: 404 });
}
