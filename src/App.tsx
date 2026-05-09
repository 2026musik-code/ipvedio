import { BrowserRouter as Router, Routes, Route, useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { Home, Compass, Film, User, Play, ChevronLeft, MoreHorizontal, Heart, MessageCircle, Share2, Bookmark, Loader2, Download, List, Search } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import Hls from 'hls.js';

const API_BASE = '';

// MOCK DATA for Video Feed
const MOCK_VIDEOS = [
  {
    id: '1',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    title: 'Cinta Sang Miliarder - Eps 1',
    description: 'Awal pertemuan yang tidak terduga...',
    likes: '12K',
    comments: '458',
    series: 'Miliarder Sombong'
  },
  {
    id: '2',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
    title: 'Cinta Sang Miliarder - Eps 2',
    description: 'Kesalahpahaman dimulai.',
    likes: '8.5K',
    comments: '320',
    series: 'Miliarder Sombong'
  }
];

const MOCK_SERIES = [
  { id: '1', title: 'Istri Pengganti', image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80', eps: 99, views: '1.2M' },
  { id: '2', title: 'Cinta Tak Direstui', image: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=400&q=80', eps: 50, views: '800K' },
  { id: '3', title: 'Miliarder Menyamar', image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80', eps: 80, views: '3M' },
  { id: '4', title: 'Pembalasan Sang Mantan', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80', eps: 120, views: '500K' },
];

function BottomNav() {
  const location = useLocation();
  const path = location.pathname;

  return (
    <nav className="fixed bottom-0 w-full md:max-w-md bg-black/95 border-t border-slate-800 text-slate-400 z-50 px-6 py-2 flex justify-between items-center safe-area-bottom pb-4">
      <Link to="/" className={`flex flex-col items-center gap-1 transition-colors ${path === '/' ? 'text-white' : 'hover:text-white'}`}>
        <Home size={24} />
        <span className={`text-[10px] font-bold ${path === '/' ? 'text-white' : ''}`}>Home</span>
      </Link>
      <Link to="/discover" className={`flex flex-col items-center gap-1 transition-colors ${path === '/discover' ? 'text-white' : 'hover:text-white'}`}>
        <Compass size={24} />
        <span className={`text-[10px] font-bold ${path === '/discover' ? 'text-white' : ''}`}>Discover</span>
      </Link>
      <Link to="/watch/feed" className="flex items-center justify-center bg-white text-black w-11 h-8 rounded-lg font-bold">
        <Play size={20} className="" fill="black" />
      </Link>
      <Link to="/library" className={`flex flex-col items-center gap-1 transition-colors ${path === '/library' ? 'text-white' : 'hover:text-white'}`}>
        <Film size={24} />
        <span className={`text-[10px] font-bold ${path === '/library' ? 'text-white' : ''}`}>Library</span>
      </Link>
      <Link to="/profile" className={`flex flex-col items-center gap-1 transition-colors ${path === '/profile' ? 'text-white' : 'hover:text-white'}`}>
        <User size={24} />
        <span className={`text-[10px] font-bold ${path === '/profile' ? 'text-white' : ''}`}>Me</span>
      </Link>
    </nav>
  );
}

function Header({ pageTitle, onSearch }: { pageTitle: string, onSearch: (q: string) => void }) {
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
       onSearch(val);
    }, 600); // 600ms debounce
  };

  return (
    <header className="sticky top-0 bg-[#0f172a] border-b border-slate-800 z-40 px-4 py-2.5 flex items-center justify-between transition-all">
      {!isSearching ? (
        <>
          <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-rose-500">
            {pageTitle}
          </h1>
          <button onClick={() => setIsSearching(true)} className="text-slate-300 hover:text-white transition-colors p-1.5 -mr-1">
            <Search size={22} />
          </button>
        </>
      ) : (
        <div className="flex w-full items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
          <button onClick={() => { setIsSearching(false); setQuery(''); onSearch(''); }} className="text-slate-300 hover:text-white -ml-1">
            <ChevronLeft size={24} />
          </button>
          <input
            autoFocus
            type="text"
            placeholder="Cari drama..."
            className="flex-1 bg-slate-800/50 text-white placeholder-slate-400 border border-slate-700 rounded-full px-4 py-1.5 text-sm focus:outline-none focus:border-slate-500 transition-colors"
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      )}
    </header>
  );
}

function HomePage() {
  const [allSeries, setAllSeries] = useState<any[]>([]);
  const [series, setSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeProvider, setActiveProvider] = useState('reelshort');
  
  const providers = [
     { id: 'reelshort', label: 'ReelShort' },
     { id: 'netshort', label: 'NetShort' },
     { id: 'dramanova', label: 'DramaNova' },
     { id: 'pinedrama', label: 'PineDrama' },
     { id: 'dramabox', label: 'DramaBox' }
  ];

  const scrollRef = useRef<HTMLDivElement>(null);
  const routerLocation = useLocation();
  const location = routerLocation.pathname;

  let pageTitle = "DRAMA INDO";
  if (location === "/discover") pageTitle = "Discover";
  if (location === "/library") pageTitle = "Library";
  if (location === "/profile") pageTitle = "Profile";

  useEffect(() => {
    let retryCount = 0;
    const fetchLatest = () => {
      setLoading(true);
      setErrorMsg(null);
      const userIp = localStorage.getItem('selected_proxy_ip') || 'Auto';
      fetch(`${API_BASE}/api/${activeProvider}/foryou`, { headers: { 'x-user-ip': userIp } })
        .then(res => {
          if (!res.ok) {
            if ((res.status === 502 || res.status === 503 || res.status === 504 || res.status === 429) && retryCount < 3) {
              retryCount++;
              setTimeout(fetchLatest, 1500); // retry after 1.5s
              throw new Error("Temporary error, retrying...");
            }
            throw new Error(`API Route failed: ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          if (data && data.success) {
            setAllSeries(data.data);
            setSeries(data.data);
            setErrorMsg(null);
            if (data.data.length === 0) {
              setErrorMsg("Data kosong dari API (panjang 0)");
            }
          } else if (data) {
            setSeries([]);
            setErrorMsg(data.message || "Gagal memuat API");
          }
          setLoading(false);
        })
        .catch(err => {
          if (err.message === "Temporary error, retrying...") return;
          console.error(err);
          setSeries([]);
          setErrorMsg(err.message || "Terjadi kesalahan fetch");
          setLoading(false);
        });
    };
    fetchLatest();
  }, [activeProvider]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        const cardWidth = scrollRef.current.firstElementChild?.clientWidth || 120;
        
        if (scrollLeft + clientWidth >= scrollWidth - 10) {
          scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          scrollRef.current.scrollBy({ left: cardWidth + 12, behavior: 'smooth' });
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    filterData(activeCategory, q);
  };

  const handleCategorySelect = (category: string) => {
    const newCat = activeCategory === category ? null : category;
    setActiveCategory(newCat);
    filterData(newCat, searchQuery);
  };
  
  const filterData = async (cat: string | null, q: string) => {
    const query = q || cat; // Use category as search query if provided
    if (query) {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`${API_BASE}/api/searchAll?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setSeries(json.data);
        } else {
          setSeries([]);
        }
      } catch (err) {
        console.error("Search error", err);
        setSeries([]);
      }
      setLoading(false);
      return;
    }
    
    // Normal filter when no query is provided (reset)
    setSeries(allSeries);
  };

  // Combine predefined categories with dynamic ones
  const predefinedCategories = ["Romantis", "CEO", "Balas Dendam", "Pernikahan", "Tragedi", "Fantasi", "Keluarga"];
  const dynamicCategories = Array.from(new Set(allSeries.flatMap(s => s.tags || []))).filter(Boolean);
  const categories = Array.from(new Set([...predefinedCategories, ...dynamicCategories]));

  // Extract top items for different sections
  const featuredVideo = series.length > 0 ? series[0] : null;
  const rilisanTerbaru = series.slice(1, 20);

  return (
    <div className="pb-24 min-h-screen">
      <Header pageTitle={pageTitle} onSearch={handleSearch} />

      {location === "/discover" && categories.length > 0 && (
        <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
          {categories.slice(0, 15).map((cat: any, i) => (
            <button 
              key={i} 
              onClick={() => handleCategorySelect(cat)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors border ${activeCategory === cat ? 'bg-red-600 text-white border-red-600' : 'bg-slate-800/50 text-slate-300 border-slate-700 hover:bg-slate-700'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="animate-spin text-red-500" size={32} />
        </div>
      ) : errorMsg ? (
        <div className="flex flex-col justify-center items-center h-64 px-4 text-center">
          <p className="text-red-400 font-medium mb-2">Error: {errorMsg}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-slate-800 rounded-lg text-sm">Coba Lagi</button>
        </div>
      ) : location === "/profile" ? (
        <ProfileContent />
      ) : (
        <main className="px-3 mt-2">
          {searchQuery ? (
            <section className="pb-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">
                  Hasil Pencarian: "{searchQuery}"
                </h3>
              </div>
              {series.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {series.map((item, idx) => (
                    <Link key={`search-${item.id}-${idx}`} to={`/watch/feed?id=${item.id}&provider=${item.provider || 'reelshort'}`} className="group">
                      <div className="aspect-[3/4] rounded-lg overflow-hidden relative mb-2 shadow-md">
                        <img src={item.cover} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                        <div className="absolute top-0 right-0 bg-red-600/90 backdrop-blur-sm text-white text-[10px] uppercase px-2 py-0.5 rounded-bl font-bold">
                           {item.provider}
                        </div>
                        <div className="absolute bottom-0 right-0 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded-tl-lg font-medium">
                          {item.episodes} Eps
                        </div>
                      </div>
                      <h4 className="text-sm font-semibold text-white line-clamp-2 leading-snug mb-1">{item.title}</h4>
                      <p className="text-xs text-slate-400 font-medium capitalize">{item.provider}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500">
                  Tidak ditemukan video untuk "{searchQuery}".
                </div>
              )}
            </section>
          ) : (
            <>
              {/* Banner */}
          {series.length > 0 && (
            <section className="mb-0">
              <div className="w-full aspect-[4/5] sm:aspect-video bg-slate-800 rounded-t-2xl overflow-hidden relative group cursor-pointer">
                <img src={series[0].cover} alt="Featured" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-black/40 to-transparent flex flex-col justify-end p-4">
                  <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded w-fit mb-2">Baru Rilis</span>
                  <h2 className="text-2xl font-bold text-white mb-1 line-clamp-1">{series[0].title}</h2>
                  <p className="text-slate-300 text-sm line-clamp-2 mb-2">{series[0].desc}</p>
                  <Link to={`/watch/feed?id=${series[0].id}&provider=${series[0].provider || 'pinedrama'}`} className="bg-white text-black font-semibold py-2 px-4 rounded-full flex items-center justify-center gap-2 w-fit">
                    <Play size={16} fill="black" /> Tonton Sekarang
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* Provider Tabs */}
          <section className="mb-4">
            <div className={`flex bg-[#0f172a] p-1.5 ${series.length > 0 ? 'rounded-b-2xl' : 'rounded-2xl'} mb-4 overflow-x-auto no-scrollbar snap-x shadow-md`}>
               {providers.map(p => (
                 <button 
                  key={p.id}
                  onClick={() => setActiveProvider(p.id)}
                  className={`flex-none snap-start text-sm font-bold py-2.5 px-4 flex-1 rounded-xl transition-all whitespace-nowrap ${activeProvider === p.id ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                 >
                  {p.label}
                 </button>
               ))}
            </div>

            {rilisanTerbaru.length > 0 ? (
               <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide no-scrollbar -mx-3 px-3">
                 {rilisanTerbaru.map((item) => (
                   <Link key={item.id} to={`/watch/feed?id=${item.id}&provider=${item.provider || 'reelshort'}`} className="min-w-[140px] w-[140px] snap-start shrink-0 group">
                     <div className="aspect-[4/5] rounded-xl overflow-hidden relative mb-2 shadow-sm">
                       <img src={item.cover} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                       <div className="absolute bottom-0 right-0 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded-tl-lg font-medium">
                         {item.episodes} Eps
                       </div>
                     </div>
                     <h4 className="text-xs font-semibold text-white line-clamp-2 leading-tight">{item.title}</h4>
                   </Link>
                 ))}
               </div>
            ) : (
                <div className="py-6 text-center text-slate-500">Belum ada rilis baru untuk kategori ini</div>
            )}
          </section>

          {/* Pilihan Untukmu */}
          <section className="pb-8">

            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-white">Rekomendasi</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {series.slice(5).map((item, idx) => (
                <Link key={`fy-${item.id}-${idx}`} to={`/watch/feed?id=${item.id}&provider=${item.provider || 'pinedrama'}`} className="group">
                  <div className="aspect-[3/4] rounded-lg overflow-hidden relative mb-2 shadow-md">
                    <img src={item.cover} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                    <div className="absolute top-0 right-0 bg-red-600/90 backdrop-blur-sm text-white text-[11px] px-2 py-0.5 rounded-bl font-bold">
                       {item.provider === 'dramabox' ? 'CN' : 'ID'}
                    </div>
                  </div>
                  <h4 className="text-sm font-semibold text-white line-clamp-2 leading-snug mb-1">{item.title}</h4>
                  <p className="text-xs text-slate-400 font-medium">{item.episodes} Episode</p>
                </Link>
              ))}
            </div>
          </section>
            </>
          )}
        </main>
      )}
      <BottomNav />
    </div>
  );
}

function VideoFeedPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const collectionId = searchParams.get('id');
  const provider = searchParams.get('provider') || 'reelshort';
  
  const [videos, setVideos] = useState<any[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [showEps, setShowEps] = useState(false);
  const [totalEpisodes, setTotalEpisodes] = useState(0);

  // Auto pick random drama if no id is provided
  useEffect(() => {
    if (!collectionId) {
      const userIp = localStorage.getItem('selected_proxy_ip') || 'Auto';
      fetch(`${API_BASE}/api/reelshort/foryou`, { headers: { 'x-user-ip': userIp } })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data && data.data.length > 0) {
            const randomDrama = data.data[Math.floor(Math.random() * Math.min(10, data.data.length))];
            navigate(`/watch/feed?id=${randomDrama.id}&provider=reelshort`, { replace: true });
          } else {
            setErrorMsg("Tidak dapat memuat video acak");
            setLoading(false);
          }
        })
        .catch(err => {
          setErrorMsg("Gagal memuat video");
          setLoading(false);
        });
    }
  }, [collectionId, navigate]);
  
  // Fetch details to get total episodes
  useEffect(() => {
    if (!collectionId) return;
    const userIp = localStorage.getItem('selected_proxy_ip') || 'Auto';
    fetch(`${API_BASE}/api/${provider}/detail?id=${collectionId}`, { headers: { 'x-user-ip': userIp } })
      .then(res => {
        if (!res.ok) throw new Error("API Route failed: " + res.status);
        return res.json();
      })
      .then(data => {
        if (data.success && data.data) {
          setTotalEpisodes(data.data.total_episodes || 0);
          
          try {
            const history = JSON.parse(localStorage.getItem('watch_history') || '[]');
            // Try to extract title, cover from local parameters if data doesn't have it explicitly
            const title = data.data.title || `Drama ${collectionId}`;
            const cover = data.data.cover || '';
            const historyItem = { 
              ...data.data, 
              id: collectionId, 
              provider: provider, 
              title: title,
              cover: cover,
              lastWatched: Date.now() 
            };
            const updatedHistory = history.filter((h: any) => h.id !== collectionId);
            updatedHistory.unshift(historyItem);
            localStorage.setItem('watch_history', JSON.stringify(updatedHistory));
          } catch (e) {
            console.error('Failed to save to history', e);
          }
        }
      })
      .catch(console.error);
  }, [collectionId, provider]);

  useEffect(() => {
    if (!collectionId) return;
    setLoading(true);
    
    // Fetch episode currentEpisode
    const userIp = localStorage.getItem('selected_proxy_ip') || 'Auto';
    fetch(`${API_BASE}/api/${provider}/episode?id=${collectionId}&ep=${currentEpisode}`, { headers: { 'x-user-ip': userIp } })
      .then(res => {
        if (!res.ok) throw new Error("API Route failed: " + res.status);
        return res.json();
      })
      .then(data => {
        if (!data.success) {
          throw new Error(data.error || data.message || "Gagal memuat video");
        }
        return data;
      })
      .then(data => {
        if (data.videoUrl) {
          setVideos([{
            id: currentEpisode.toString(),
            url: data.videoUrl,
            rawUrl: data.rawUrl || data.videoUrl,
            title: data.title || `Episode ${currentEpisode}`,
            description: '',
            likes: '10K',
            comments: '120',
            series: provider.charAt(0).toUpperCase() + provider.slice(1)
          }]);
        }
        setLoading(false);
        setErrorMsg(null);
      })
      .catch(err => {
        console.error(err);
        setErrorMsg(err.message);
        setLoading(false);
      });
  }, [collectionId, provider, currentEpisode]);

  if (loading && videos.length === 0) {
    return (
      <div className="fixed inset-0 bg-black z-50 text-white flex justify-center items-center">
        <Loader2 className="animate-spin text-red-500" size={32} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 text-white">
      {/* Header Overlays */}
      <div className="absolute top-0 w-full z-50 bg-gradient-to-b from-black/60 to-transparent px-4 py-4 flex justify-between items-center pointer-events-none">
        <button onClick={() => navigate('/')} className="p-2 -ml-2 text-white/80 hover:text-white pointer-events-auto cursor-pointer">
          <ChevronLeft size={28} />
        </button>
        <div className="flex bg-black/40 backdrop-blur border border-white/10 rounded-full px-4 py-1 text-sm font-medium text-white/90 pointer-events-auto cursor-pointer" onClick={() => setShowEps(true)}>
          Eps {currentEpisode} {totalEpisodes > 0 && `/ ${totalEpisodes}`}
        </div>
        <button className="p-2 -mr-2 text-white/80 hover:text-white pointer-events-auto cursor-pointer" onClick={() => setShowEps(true)}>
          <List size={24} />
        </button>
      </div>

      {loading && videos.length > 0 && (
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
           <Loader2 className="animate-spin text-red-500" size={32} />
         </div>
      )}

      {/* Video */}
      <div className="w-full h-full relative">
        {videos.length > 0 && !errorMsg ? (
          <VideoItem 
            key={videos[0].id} 
            video={videos[0]} 
            isActive={true} 
            onEnded={() => {
              if (currentEpisode < (totalEpisodes || 1000)) {
                setCurrentEpisode(prev => prev + 1);
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col justify-center items-center gap-4 px-6 text-center">
            <p className="text-slate-400">{errorMsg || "Video tidak ditemukan."}</p>
            <button onClick={() => navigate(-1)} className="bg-red-600 px-6 py-2 rounded-full font-medium">Kembali</button>
          </div>
        )}
      </div>

      {/* Episodes Bottom Sheet */}
      {showEps && (
        <div className="absolute inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowEps(false)} />
          <div className="w-full h-3/5 bg-slate-900 rounded-t-2xl relative z-10 flex flex-col">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-lg">Pilih Episode</h3>
              <button onClick={() => setShowEps(false)} className="text-slate-400 p-2">Tutup</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-900 grid grid-cols-5 gap-3 content-start">
              {Array.from({ length: totalEpisodes || 10 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setCurrentEpisode(i + 1);
                    setShowEps(false);
                  }}
                  className={`aspect-square rounded-lg flex justify-center items-center font-bold text-lg transition-colors ${
                    currentEpisode === i + 1 ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoItem({ video, isActive, onEnded }: { video: any, isActive: boolean, key?: string, onEnded?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [videoError, setVideoError] = useState('');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return "00:00";
    const m = Math.floor(time / 60).toString().padStart(2, '0');
    const s = Math.floor(time % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    let hls: Hls | null = null;
    const videoElt = videoRef.current;
    
    if (videoElt && video.url) {
      if (video.url.includes('.m3u8')) {
        if (Hls.isSupported()) {
          hls = new Hls({ startPosition: -1, capLevelToPlayerSize: true });
          hls.loadSource(video.url);
          hls.attachMedia(videoElt);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
             if (isActive) {
               videoElt.play().catch(() => {});
             }
          });
          hls.on(Hls.Events.ERROR, function (event, data) {
            console.error("HLS error:", data);
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                console.log("fatal network error encountered, try to recover");
                hls?.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                console.log("fatal media error encountered, try to recover");
                hls?.recoverMediaError();
              } else {
                setVideoError("Video stream error.");
                hls?.destroy();
              }
            }
          });
        } else if (videoElt.canPlayType('application/vnd.apple.mpegurl')) {
          videoElt.src = video.url;
        }
      } else {
        videoElt.src = video.url;
      }
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [video.url, isActive]);

  useEffect(() => {
    if (isActive && videoRef.current) {
      setVideoError('');
      videoRef.current.playbackRate = playbackSpeed;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (error.name !== 'AbortError') {
            console.error("Play error:", error);
          }
        });
      }
      setIsPlaying(true);
    } else if (!isActive && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [isActive, video.url]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.playbackRate = playbackSpeed;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Manual play error:", error);
        });
      }
    }
    setIsPlaying(!isPlaying);
  };

  const handleSpeedToggle = () => {
    const nextSpeed = playbackSpeed === 1 ? 1.25 : playbackSpeed === 1.25 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    setPlaybackSpeed(nextSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title: video.title,
        text: video.description,
        url: window.location.href,
      });
    } catch (e) {
      console.log('Error sharing', e);
    }
  };

  return (
    <div className="w-full h-full snap-start relative bg-black flex items-center justify-center">
      {/* Actual Video Element */}
      {videoError ? (
        <div className="text-white text-center p-4">
          <p className="text-red-500 mb-2 font-bold">Error Memutar Video</p>
          <p className="text-sm text-slate-400">{videoError}</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          onClick={togglePlay}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            setIsBuffering(false);
            setVideoError('');
          }}
          onEnded={onEnded}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onError={(e) => {
            console.error("Video element error:", e);
            setVideoError("Video tidak tersedia atau bermasalah.");
            setIsBuffering(false);
          }}
        />
      )}
      
      {/* Play/Pause Overlay indicator */}
      {!isPlaying && !videoError && !isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-10">
          <div className="bg-black/40 p-4 rounded-full backdrop-blur-md">
            <Play size={40} className="text-white opacity-80" fill="white" />
          </div>
        </div>
      )}

      {isBuffering && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <Loader2 className="animate-spin text-white opacity-80" size={40} />
        </div>
      )}

      {/* Scrubber / Progress Bar */}
      {!videoError && duration > 0 && (
         <div className="absolute bottom-1 left-0 right-0 z-20 px-4">
           <div className="h-1 bg-white/20 rounded-full relative overflow-hidden">
             <div 
               className="absolute top-0 bottom-0 left-0 bg-red-500 transition-all duration-100"
               style={{ width: `${(currentTime / duration) * 100}%` }}
             />
           </div>
         </div>
      )}

      {/* Info Overlay (Bottom Left) */}
      <div className="absolute bottom-6 left-4 right-16 z-10 flex flex-col gap-2 drop-shadow-md pointer-events-none">
        <h3 className="font-bold text-lg">{video.series}</h3>
        <p className="text-sm text-white/90 font-medium">{video.title}</p>
        {!videoError && duration > 0 && (
          <p className="text-xs text-red-400 font-bold tracking-wider">
            {formatTime(currentTime)} / {formatTime(duration)}
          </p>
        )}
      </div>

      {/* Actions (Bottom Right) */}
      <div className="absolute bottom-6 right-4 z-10 flex flex-col items-center gap-6 drop-shadow-md">
        <div className="flex flex-col items-center gap-1" onClick={handleSpeedToggle}>
          <div className="bg-black/40 w-[44px] h-[44px] flex items-center justify-center rounded-full backdrop-blur-sm cursor-pointer hover:bg-black/60 transition-colors">
            <span className="text-white font-bold text-sm tracking-tighter">{playbackSpeed}x</span>
          </div>
          <span className="text-xs font-medium text-white/90">Speed</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div 
            className="bg-black/40 p-2.5 rounded-full backdrop-blur-sm cursor-pointer hover:bg-black/60 transition-colors"
            onClick={() => setLiked(!liked)}
          >
            <Heart size={24} className={liked ? "text-red-500" : "text-white"} fill={liked ? "currentColor" : "none"} />
          </div>
          <span className="text-xs font-medium text-white/90">{liked ? '10K' : video.likes}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="bg-black/40 p-2.5 rounded-full backdrop-blur-sm cursor-pointer hover:bg-black/60 transition-colors">
            <MessageCircle size={24} className="text-white" />
          </div>
          <span className="text-xs font-medium text-white/90">{video.comments}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div 
            className="bg-black/40 p-2.5 rounded-full backdrop-blur-sm cursor-pointer hover:bg-black/60 transition-colors"
            onClick={() => setSaved(!saved)}
          >
            <Bookmark size={24} className={saved ? "text-yellow-400" : "text-white"} fill={saved ? "currentColor" : "none"} />
          </div>
          <span className="text-xs font-medium text-white/90">Save</span>
        </div>
        <div className="flex flex-col items-center gap-1" onClick={handleShare}>
          <div className="bg-black/40 p-2.5 rounded-full backdrop-blur-sm cursor-pointer hover:bg-black/60 transition-colors">
            <Share2 size={24} className="text-white" />
          </div>
          <span className="text-xs font-medium text-white/90">Share</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <a
            href={video.rawUrl || video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-black/40 p-2.5 rounded-full backdrop-blur-sm cursor-pointer hover:bg-black/60 transition-colors flex items-center justify-center"
          >
            <Download size={24} className="text-white" />
          </a>
          <span className="text-xs font-medium text-white/90">Unduh</span>
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ size }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );
}

function ProfileContent() {
  const [proxies, setProxies] = useState<string[]>([]);
  const [selectedIP, setSelectedIP] = useState<string>(localStorage.getItem('selected_proxy_ip') || 'Auto');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/proxies')
      .then(res => res.json())
      .then(data => {
        if (data.success) setProxies(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSelectIP = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ip = e.target.value;
    setSelectedIP(ip);
    localStorage.setItem('selected_proxy_ip', ip);
  };

  return (
    <main className="px-4 py-6 space-y-6">
      <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
        <h2 className="text-xl font-bold mb-4 text-white">Proxy Settings</h2>
        <p className="text-sm text-slate-400 mb-4">Pilih IP proxy untuk menyembunyikan identitas atau mengatasi pembatasan IP (429).</p>
        
        {loading ? (
          <div className="flex justify-center my-4">
            <Loader2 className="animate-spin text-red-500" size={24} />
          </div>
        ) : (
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-300 block">Pilih IP:</label>
            <select
              value={selectedIP}
              onChange={handleSelectIP}
              className="w-full bg-black border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
            >
              <option value="Auto">Auto (Random & Rotate on Limit)</option>
              {proxies.map(ip => (
                <option key={ip} value={ip}>{ip}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </main>
  );
}

function LibraryPage() {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('watch_history') || '[]');
      setHistory(saved);
    } catch (e) {
      console.error(e);
    }
  }, []);

  return (
    <div className="pb-24 min-h-screen bg-black">
      <header className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-slate-800 z-40 px-4 py-3.5 flex items-center justify-between">
        <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-rose-500">
          Library
        </h1>
      </header>
      
      <main className="px-4 py-4 space-y-6">
        <section>
          <h2 className="text-white font-bold text-[16px] mb-3">Terkini Ditonton</h2>
          {history.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {history.map((item, idx) => (
                <Link key={item.id + '-' + idx} to={`/watch/feed?id=${item.id}&provider=${item.provider || 'pinedrama'}`} className="group">
                  <div className="aspect-[3/4] rounded-lg overflow-hidden relative mb-1.5 bg-slate-800">
                    {item.cover ? (
                      <img src={item.cover} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                        No Cover
                      </div>
                    )}
                    <div className="absolute top-0 right-0 bg-red-600/90 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-bl font-bold">
                       {item.provider === 'dramabox' ? 'CN' : 'ID'}
                    </div>
                  </div>
                  <h4 className="text-[12px] font-medium text-white line-clamp-2 leading-snug mb-0.5">{item.title}</h4>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-500 text-sm">
              <Film size={40} className="mx-auto mb-2 opacity-50" />
              <p>Belum ada history tontonan</p>
            </div>
          )}
        </section>
      </main>
      
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-black text-slate-100 font-sans md:max-w-md md:mx-auto md:border-x md:border-slate-800 shadow-2xl relative overflow-x-hidden">
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/discover" element={<HomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/profile" element={<HomePage />} />
          <Route path="/watch/feed" element={<VideoFeedPage />} />
        </Routes>
      </Router>
    </div>
  );
}

