import React, { useState } from 'react';
import { Download, FolderPlus, Hexagon, HardDrive, Play, Pause, RefreshCw, Terminal } from 'lucide-react';
import { downloadPackage, runOfflineInstall, initProject } from './lib/tauri-ipc';

type ProjectMode = 'node' | 'python';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type DownloadStatus = 'downloading' | 'paused' | 'done' | 'error' | 'installing' | 'installed';
type PkgType = 'npm' | 'pip';

interface DownloadInfo {
  p: number;
  d: number;
  t: number;
  status: DownloadStatus;
  type: PkgType;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'mirror' | 'activity'>('create');
  const [downloads, setDownloads] = useState<Record<string, DownloadInfo>>({});
  const [inputPkg, setInputPkg] = useState('');
  const [packageType, setPackageType] = useState<PkgType>('npm');
  const [error, setError] = useState('');

  const isValidPackageName = (name: string) => {
    // Basic validation for npm/pypi package names to prevent path traversal or injection
    return /^[a-zA-Z0-9\-_.]+$/.test(name) && !name.includes('..');
  };

  const handleAddPackage = () => {
    const pkg = inputPkg.trim();
    if (!pkg) return;
    
    if (!isValidPackageName(pkg)) {
      setError('Invalid package name. Please avoid special characters or spaces.');
      return;
    }

    setError('');
    handleStartRealDownload(pkg, packageType);
    setInputPkg('');
  };

  const handleInitProject = async (target: 'node' | 'python') => {
    if (!isTauri) {
      alert("This feature is only available in the compiled desktop app.\nTo test this logic, please download the Desktop release.");
      return;
    }
    try {
      const res = await initProject(target, '.');
      alert(`Success: \n${res}`);
    } catch (e: any) {
      alert(`Failed to initialize: ${e}`);
    }
  };

  const handleStartRealDownload = async (pkgName: string, type: PkgType) => {
    if (!isTauri) {
      setError("You are currently in the Browser Preview. Please use the Desktop app to process real downloads via Rust to bypass connectivity issues.");
      return;
    }
    setDownloads(prev => ({ ...prev, [pkgName]: { p: 0, d: 0, t: 0, status: 'downloading', type } }));
    
    try {
      let targetUrl = '';
      let ext = '';
      
      if (type === 'npm') {
        const res = await fetch(`https://registry.npmjs.org/${pkgName}`);
        if (!res.ok) throw new Error('Package not found on NPM registry');
        const data = await res.json();
        const latestInfo = data['dist-tags']?.latest;
        if (!latestInfo) throw new Error('No latest version found');
        targetUrl = data.versions[latestInfo].dist.tarball;
        ext = '.tgz';
      } else {
        const res = await fetch(`https://pypi.org/pypi/${pkgName}/json`);
        if (!res.ok) throw new Error('Package not found on PyPI registry');
        const data = await res.json();
        const wheel = data.urls?.find((u: any) => u.filename.endsWith('.whl'));
        if (!wheel) throw new Error('No compatible .whl file found');
        targetUrl = wheel.url;
        ext = '.whl';
      }

      const destPath = `./cache/${pkgName}${ext}`;
      
      await downloadPackage(
        pkgName, 
        targetUrl, 
        destPath,
        (percentage, downloaded, total) => {
          setDownloads(prev => ({
             ...prev, 
             [pkgName]: { p: percentage, d: downloaded, t: total, status: percentage >= 100 ? 'done' : 'downloading', type } 
          }));
        }
      );
    } catch (err: any) {
      setDownloads(prev => ({
         ...prev, 
         [pkgName]: { ...prev[pkgName], status: 'error' } 
      }));
      setError(err.message || 'Verification failed');
    }
  };

  const handleInjectPackage = async (pkgName: string, type: PkgType) => {
     if (!isTauri) {
       alert("Injection requires the Desktop App.");
       return;
     }
     setDownloads(prev => ({
        ...prev, 
        [pkgName]: { ...prev[pkgName], status: 'installing' } 
     }));

     const ext = type === 'npm' ? '.tgz' : '.whl';
     
     try {
       await runOfflineInstall(type === 'npm' ? 'pnpm' : 'pip', `./cache/${pkgName}${ext}`, '.');
       setDownloads(prev => ({
          ...prev, 
          [pkgName]: { ...prev[pkgName], status: 'installed' } 
       }));
     } catch (e: any) {
       setDownloads(prev => ({
          ...prev, 
          [pkgName]: { ...prev[pkgName], status: 'error' } 
       }));
       setError(String(e));
     }
  };

  return (
    <div className="flex h-screen w-full bg-[#0d1117] text-gray-200 font-sans">
      {/* Sidebar Navigation */}
      <div className="w-64 bg-[#161b22] border-r border-[#30363d] flex flex-col justify-between">
        <div>
          <div className="p-6 flex flex-col gap-1 border-b border-[#30363d]">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Hexagon className="w-6 h-6 text-emerald-400" />
              ResiliencePM
            </h1>
            <p className="text-xs text-gray-400">Cameroon Local-first</p>
          </div>
          
          <div className="p-4 flex flex-col gap-2">
            <button 
              onClick={() => setActiveTab('create')}
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'create' ? 'bg-[#21262d] text-white' : 'hover:bg-[#21262d] text-gray-400'}`}
            >
              <FolderPlus className="w-4 h-4" /> New Project
            </button>
            <button 
              onClick={() => setActiveTab('mirror')}
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'mirror' ? 'bg-[#21262d] text-white' : 'hover:bg-[#21262d] text-gray-400'}`}
            >
              <HardDrive className="w-4 h-4" /> Micro-Mirror Cache
            </button>
            <button 
              onClick={() => setActiveTab('activity')}
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${activeTab === 'activity' ? 'bg-[#21262d] text-white' : 'hover:bg-[#21262d] text-gray-400'}`}
            >
              <RefreshCw className="w-4 h-4" /> Queue Activity
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-[#30363d] flex items-center px-8 bg-[#0d1117]">
          <h2 className="text-lg font-medium">
            {activeTab === 'create' && 'Scaffold New Project'}
            {activeTab === 'mirror' && 'Micro-Mirror System'}
            {activeTab === 'activity' && 'Network Activity & Queue'}
          </h2>
        </header>

        <main className="flex-1 p-8 overflow-auto">
          {activeTab === 'create' && (
            <div className="max-w-4xl mx-auto flex flex-col gap-8">
              {/* Project Setup Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Node.js Card */}
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Terminal className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Node.js Project</h3>
                      <p className="text-sm text-gray-400">Initialize local package.json</p>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-400 mb-4">Forces `pnpm init` securely without attempting remote registry lookups.</p>
                  </div>
                  <button 
                    onClick={() => handleInitProject('node')}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded relative duration-150 transition-colors"
                  >
                    Initialize Node Environment
                  </button>
                </div>

                {/* Python Card */}
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Terminal className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Python Virtual Env</h3>
                      <p className="text-sm text-gray-400">Initialize python -m venv</p>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-400 mb-4">Automatically creates the sandbox and applies the virtual environment bash activation script to the embedded shell.</p>
                  </div>
                  <button 
                    onClick={() => handleInitProject('python')}
                    className="w-full py-2 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-white font-medium rounded relative duration-150 transition-colors"
                  >
                    Initialize Python Env
                  </button>
                </div>
              </div>
              
              {/* Manual Installation Override */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mt-4">
                <h3 className="font-semibold text-white mb-2">Resilient Package Injector</h3>
                <p className="text-sm text-gray-400 mb-6">Enter a package name. Rust will securely handle the chunked HTTPS stream and resume progress automatically if your connection drops.</p>
                
                <div className="flex gap-4">
                  <select 
                    value={packageType}
                    onChange={(e) => setPackageType(e.target.value as 'npm' | 'pip')}
                    className="bg-[#0d1117] border border-[#30363d] rounded-md px-4 py-2 text-white outline-none focus:border-emerald-500"
                  >
                    <option value="npm">NPM (Node)</option>
                    <option value="pip">PIP (Python)</option>
                  </select>
                  <input 
                    type="text"
                    value={inputPkg}
                    onChange={(e) => {
                      setInputPkg(e.target.value);
                      setError('');
                    }}
                    placeholder="e.g. express, or django"
                    className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-4 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <button 
                    onClick={handleAddPackage}
                    disabled={!inputPkg.trim()}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-md font-medium transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Add Package
                  </button>
                </div>
                {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
              </div>
            </div>
          )}

          {activeTab === 'mirror' && (
             <div className="max-w-4xl mx-auto flex flex-col gap-6">
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 text-center py-16">
                  <HardDrive className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-white mb-2">Micro-Mirror Configuration</h3>
                  <p className="text-gray-400 max-w-lg mx-auto">
                    Define large dependency bundles (e.g., standard React/Vite stack) to batch-download during night-data hours. Stored locally offline to inject instantly later.
                  </p>
                  <button className="mt-6 border border-[#30363d] hover:bg-[#30363d] px-6 py-2 rounded-md text-sm transition-colors">
                    Configure Bundle
                  </button>
                </div>
             </div>
          )}

          {/* Active Downloads UI showing Chunk architecture */}
          <div className="max-w-4xl mx-auto mt-12 mb-6 border-t border-[#30363d] pt-8">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
               Download Staging Cache
            </h3>
            <div className="flex flex-col gap-3">
              {Object.keys(downloads).length === 0 ? (
                <div className="p-6 border border-dashed border-[#30363d] rounded-xl text-center text-gray-500 text-sm">
                  No active package streams.
                </div>
              ) : (
                Object.entries(downloads).map(([pkg, info]: [string, DownloadInfo]) => {
                  const ext = info.type === 'npm' ? '.tgz' : '.whl';
                  const cmd = info.type === 'npm' ? `pnpm add ./cache/${pkg}${ext}` : `pip install ./cache/${pkg}${ext} --no-index`;
                  
                  return (
                  <div key={pkg} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                       <span className="font-mono text-sm font-medium">{pkg}{ext}</span>
                       <div className="flex items-center gap-3">
                         {info.status === 'done' ? (
                           <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full font-medium">Ready for injection</span>
                         ) : info.status === 'installing' ? (
                           <span className="text-xs text-blue-400 font-mono animate-pulse">Installing offline...</span>
                         ) : info.status === 'installed' ? (
                           <span className="text-xs text-emerald-400 font-mono font-semibold">Installed successfully</span>
                         ) : info.status === 'error' ? (
                           <span className="text-xs text-red-400 font-mono">Failed</span>
                         ) : (
                           <span className="text-xs text-blue-400 font-mono">{(info.d / 1024 / 1024).toFixed(2)} MB / {(info.t / 1024 / 1024).toFixed(2)} MB</span>
                         )}
                       </div>
                    </div>
                    <div className="w-full bg-[#0d1117] rounded-full h-1.5 mb-1 overflow-hidden">
                      <div 
                        className={`h-1.5 rounded-full transition-all duration-300 ${['done', 'installed'].includes(info.status) ? 'bg-emerald-500' : info.status === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.max(info.p, 5)}%` }}
                      ></div>
                    </div>
                    {info.status === 'done' && (
                       <div className="mt-3 flex items-center justify-between">
                         <div className="text-xs text-gray-400 flex items-center gap-1">
                           <Terminal className="w-3 h-3" /> Execute: <code className="text-gray-300">{cmd}</code>
                         </div>
                         <button 
                           onClick={() => handleInjectPackage(pkg, info.type)}
                           className="bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] px-4 py-1.5 rounded text-sm text-white font-medium transition-colors"
                         >
                           Inject into Project
                         </button>
                       </div>
                    )}
                  </div>
                )})
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
