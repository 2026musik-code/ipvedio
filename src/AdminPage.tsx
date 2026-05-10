import React, { useState, useEffect } from 'react';
import { Shield, Users, Save, Lock, UploadCloud, Ban, Search, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AdminPage() {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [data, setData] = useState<any>(null);

  // Form states
  const [popupText, setPopupText] = useState('');
  const [limitPerUser, setLimitPerUser] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  
  const [blockIp, setBlockIp] = useState('');
  const [blockUa, setBlockUa] = useState('');

  const [qrFile, setQrFile] = useState<File | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const result = await res.json();
      if (result.success) {
        setToken(result.token);
        localStorage.setItem('adminToken', result.token);
      } else {
        setErrorMsg('Password salah!');
      }
    } catch (e: any) {
      setErrorMsg('Gagal terhubung ke server');
    }
    setIsLoading(false);
  };

  const loadData = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/status', {
        headers: { 'Authorization': token }
      });
      if (res.status === 401) {
        setToken('');
        localStorage.removeItem('adminToken');
        return;
      }
      const result = await res.json();
      if (result.success) {
        setData(result);
        setPopupText(result.config.popupText);
        setLimitPerUser(result.config.limitPerUser.toString());
      }
    } catch(e) {}
    setIsLoading(false);
  };

  useEffect(() => {
    if (token) loadData();
  }, [token]);

  const handleSaveConfig = async () => {
    try {
      await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          popupText,
          limitPerUser,
          adminPassword: newAdminPassword || undefined
        })
      });
      if (newAdminPassword) {
        setToken(newAdminPassword);
        localStorage.setItem('adminToken', newAdminPassword);
        setNewAdminPassword('');
      }
      alert('Tersimpan!');
      loadData();
    } catch(e) {
      alert('Gagal menyimpan');
    }
  };

  const handleBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockIp, blockUa })
      });
      setBlockIp('');
      setBlockUa('');
      loadData();
    } catch(e) {}
  };

  const handleUnblock = async (index: number) => {
    try {
      await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ unblockIndex: index })
      });
      loadData();
    } catch(e) {}
  };

  const handleUploadQr = async () => {
    if (!qrFile) return;
    setUploadingQr(true);
    try {
      const formData = new FormData();
      formData.append('file', qrFile);
      const res = await fetch('/api/admin/upload-qr', {
        method: 'POST',
        headers: { 'Authorization': token },
        body: formData
      });
      const result = await res.json();
      if (result.success) {
        alert('QR Code berhasil diunggah!');
        setQrFile(null);
      } else {
        alert('Gagal mengunggah QR');
      }
    } catch(e) {
      alert('Gagal mengunggah QR');
    }
    setUploadingQr(false);
  };

  const handleTogglePopup = async (name: string, forcePopup: boolean) => {
    try {
      await fetch(`/api/admin/users/${encodeURIComponent(name)}/popup`, {
        method: 'POST',
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcePopup: !forcePopup })
      });
      loadData();
    } catch (e) {}
  };

  const handleDeleteUser = async (name: string) => {
    if (!window.confirm(`Yakin ingin menghapus user: ${name}?`)) return;
    try {
      await fetch(`/api/admin/users/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { 'Authorization': token }
      });
      loadData();
    } catch (e) {}
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-slate-900 border border-slate-800 p-6 rounded-xl w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <Shield size={48} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-center text-white mb-6">Admin Login</h2>
          {errorMsg && <div className="bg-red-500/10 text-red-500 p-3 rounded-lg mb-4 text-sm text-center">{errorMsg}</div>}
          <div className="space-y-4">
            <input
              type="password"
              placeholder="Admin Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-slate-700 text-white px-4 py-3 rounded-lg focus:border-red-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Masuk'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-center bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-3">
            <Shield size={32} className="text-red-500" />
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-emerald-400 text-sm font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                {data?.onlineCount || 0} Users Online
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={loadData} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
              <RefreshCw size={20} />
            </button>
            <button onClick={() => { setToken(''); localStorage.removeItem('adminToken'); }} className="bg-red-600/20 text-red-500 px-4 py-2 rounded-lg font-bold text-sm hover:bg-red-600/30 transition-colors">
              Logout
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Online Users List */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center gap-2">
                <Users size={20} className="text-blue-400" />
                <h2 className="font-bold">Active Users</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-950/50 text-slate-400">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">IP Address</th>
                      <th className="px-4 py-3">Views</th>
                      <th className="px-4 py-3">Last Seen</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Force QR</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {data?.users?.map((u: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-semibold text-white">{u.name || 'Anonymous'}</td>
                        <td className="px-4 py-3 font-mono text-slate-300 text-xs">{u.ip}</td>
                        <td className="px-4 py-3 text-red-400 font-bold">{u.views}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {new Date(u.lastSeen).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3">
                          {u.isOnline ? (
                            <span className="text-emerald-400 font-medium bg-emerald-400/10 px-2 py-1 rounded text-xs">Online</span>
                          ) : (
                            <span className="text-slate-500 font-medium bg-slate-800 px-2 py-1 rounded text-xs">Offline</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                           <button 
                             onClick={() => handleTogglePopup(u.name, u.forcePopup)}
                             className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${u.forcePopup ? 'bg-red-500' : 'bg-slate-700'}`}
                           >
                             <span className="sr-only">Toggle QR</span>
                             <span aria-hidden="true" className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${u.forcePopup ? 'translate-x-2' : '-translate-x-2'}`} />
                           </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                           <button 
                             onClick={() => handleDeleteUser(u.name)}
                             className="text-red-400 hover:text-red-300 text-xs font-medium px-3 py-1 bg-red-400/10 hover:bg-red-400/20 rounded transition-colors"
                           >
                             Hapus
                           </button>
                        </td>
                      </tr>
                    ))}
                    {(!data?.users || data.users.length === 0) && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Belum ada user.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* General Config */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h2 className="font-bold text-lg mb-6 flex items-center gap-2">
                <Save size={20} className="text-emerald-400" />
                Konfigurasi Utama
              </h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Pop-up Text Messages</label>
                  <textarea 
                    value={popupText}
                    onChange={e => setPopupText(e.target.value)}
                    className="w-full bg-black border border-slate-700 text-white px-4 py-3 rounded-lg focus:border-red-500 h-28"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Limit Video per User (0 = Selalu Tampil)</label>
                    <input 
                      type="number"
                      value={limitPerUser}
                      onChange={e => setLimitPerUser(e.target.value)}
                      className="w-full bg-black border border-slate-700 text-white px-4 py-2 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Ganti Password Admin</label>
                    <input 
                      type="password"
                      placeholder="Kosongkan jika tidak diganti"
                      value={newAdminPassword}
                      onChange={e => setNewAdminPassword(e.target.value)}
                      className="w-full bg-black border border-slate-700 text-white px-4 py-2 rounded-lg"
                    />
                  </div>
                </div>
                <button onClick={handleSaveConfig} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2 rounded-lg">
                  Simpan Konfigurasi
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Upload QR */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                <UploadCloud size={20} className="text-purple-400" />
                Upload QR Code (R2)
              </h2>
              <div className="space-y-4">
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={e => setQrFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600/20 file:text-purple-400 hover:file:bg-purple-600/30"
                />
                <button 
                  onClick={handleUploadQr}
                  disabled={!qrFile || uploadingQr}
                  className="w-full bg-purple-600 disabled:opacity-50 hover:bg-purple-700 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2"
                >
                  {uploadingQr ? <Loader2 className="animate-spin" size={18} /> : 'Upload'}
                </button>
              </div>
            </div>

            {/* Blocker */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-red-400">
                <Ban size={20} />
                Block IP / User Agent
              </h2>
              <form onSubmit={handleBlock} className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">IP Address (Optional)</label>
                  <input type="text" value={blockIp} onChange={e=>setBlockIp(e.target.value)} placeholder="Misal: 192.168.1.1" className="w-full bg-black border border-slate-700 px-3 py-2 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">User Agent (Optional keyword)</label>
                  <input type="text" value={blockUa} onChange={e=>setBlockUa(e.target.value)} placeholder="Misal: curl" className="w-full bg-black border border-slate-700 px-3 py-2 rounded-lg text-sm" />
                </div>
                <button type="submit" disabled={!blockIp && !blockUa} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-sm">
                  Tambahkan Blokir
                </button>
              </form>

              <div className="mt-6 space-y-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Daftar Aktif</h3>
                {data?.config?.blocklist?.length === 0 && <p className="text-xs text-slate-600">Kosong</p>}
                {data?.config?.blocklist?.map((b: any, i: number) => (
                  <div key={i} className="flex justify-between items-center bg-black p-2 rounded-lg border border-slate-800">
                    <div className="text-xs">
                      {b.ip && <span className="text-red-400 font-mono mr-2">IP: {b.ip}</span>}
                      {b.ua && <span className="text-orange-400 font-mono">UA: {b.ua}</span>}
                    </div>
                    <button onClick={() => handleUnblock(i)} className="text-slate-500 hover:text-white">x</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
