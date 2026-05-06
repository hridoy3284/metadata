import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, Settings, Play, Download, Trash2, Plus, X, Key, CheckCircle2, 
  AlertCircle, Loader2, FileSpreadsheet, Save, Cpu, LogOut, 
  Search, FolderOpen, LayoutDashboard, Database, User as UserIcon, LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { json2csv } from 'json-2-csv';
import { GoogleGenAI } from "@google/genai";
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';

import { auth, db, googleProvider } from './firebase';
import { StockMetadata, Platform, GenerationSettings, AIConfig, AIProvider, StockProject } from './types';
import { ProjectCard } from './components/ProjectCard';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AI_MODELS = {
  gemini: [
    { id: 'gemini-1.5-flash-latest', label: 'Gemini Flash (Latest)' },
    { id: 'gemini-1.5-flash-latest', label: 'Gemini 3.1 Flash Lite Preview' },
    { id: 'gemini-1.5-flash-latest', label: 'Gemini 2.5 Flash & Flash-Lite' },
    { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 4 Scout Fast' },
    { id: 'llama-3.1-405b-reasoning', label: 'Llama 4 Maverick HQ' },
  ],
  grok: [
    { id: 'grok-vision-beta', label: 'Grok Vision Beta' }
  ]
};

export default function App() {
  const [user, loadingAuth, errorAuth] = useAuthState(auth);
  
  // App States
  const [view, setView] = useState<'dashboard' | 'generator' | 'projects'>('dashboard');
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: 'gemini',
    model: 'gemini-1.5-flash-latest',
    apiKey: ''
  });
  const [images, setImages] = useState<StockMetadata[]>([]);
  const [settings, setSettings] = useState<GenerationSettings>({
    keywordCount: 30,
    titleWordCount: 10,
    descriptionWordCount: 20,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchKeyword, setBatchKeyword] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [projectName, setProjectName] = useState('Untitled Project');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  // Auth Form States
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Dashboard Data
  const [savedProjects, setSavedProjects] = useState<StockProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Load User Config & Projects
  useEffect(() => {
    if (user) {
      loadUserConfig();
      loadUserProjects();
    }
  }, [user]);

  const loadUserConfig = async () => {
    if (!user) return;
    try {
      const configDoc = await getDoc(doc(db, 'users', user.uid, 'configs', 'ai'));
      if (configDoc.exists()) {
        setAiConfig(configDoc.data() as AIConfig);
      }
    } catch (e) {
      console.error("Error loading config", e);
    }
  };

  const loadUserProjects = async () => {
    if (!user) return;
    setIsLoadingProjects(true);
    try {
      const q = query(
        collection(db, 'projects'), 
        where('userId', '==', user.uid),
        orderBy('updatedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const projects: StockProject[] = [];
      querySnapshot.forEach((doc) => {
        projects.push({ id: doc.id, ...doc.data() } as StockProject);
      });
      setSavedProjects(projects);
    } catch (e) {
      console.error("Error loading projects", e);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const saveConfig = async (config: AIConfig) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid, 'configs', 'ai'), config);
      setAiConfig(config);
      setShowConfigModal(false);
    } catch (e) {
      console.error("Error saving config", e);
      alert("Failed to save configuration. Check permissions.");
    }
  };

  const saveProject = async () => {
    if (!user) return;
    if (images.length === 0) return;

    try {
      const projectId = currentProjectId || Math.random().toString(36).substring(7);
      const projectData: any = {
        userId: user.uid,
        name: projectName,
        updatedAt: Date.now(),
        images,
        settings,
        createdAt: currentProjectId ? savedProjects.find(p => p.id === currentProjectId)?.createdAt || Date.now() : Date.now()
      };

      await setDoc(doc(db, 'projects', projectId), projectData);
      setCurrentProjectId(projectId);
      loadUserProjects();
      alert("Project saved successfully!");
    } catch (e) {
      console.error("Error saving project", e);
      alert("Failed to save project.");
    }
  };

  const openProject = (project: StockProject) => {
    setProjectName(project.name);
    setCurrentProjectId(project.id);
    setImages(project.images);
    setSettings(project.settings);
    setView('generator');
  };

  const deleteProject = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this project?")) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
      loadUserProjects();
    } catch (e) {
      console.error("Error deleting project", e);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (e: any) {
      setAuthError(e.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('dashboard');
    setImages([]);
    setCurrentProjectId(null);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages: StockMetadata[] = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      fileName: file.name,
      title: '',
      description: '',
      keywords: [],
      thumbnail: '', // Handle base64 conversion on upload
      status: 'idle' as const
    }));

    // Process thumbnails to base64
    acceptedFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = () => {
        setImages(prev => prev.map((img, i) => {
          if (img.fileName === file.name && !img.thumbnail) {
            return { ...img, thumbnail: reader.result as string };
          }
          return img;
        }));
      };
      reader.readAsDataURL(file);
    });

    setImages(prev => [...prev, ...newImages]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] }
  });

  const generateMetadata = async () => {
    if (!aiConfig.apiKey) {
      setShowConfigModal(true);
      return;
    }

    const idleImages = images.filter(img => img.status === 'idle' || img.status === 'error');
    if (idleImages.length === 0) return;

    setIsGenerating(true);

    for (const img of idleImages) {
      setImages(prev => prev.map(i => i.id === img.id ? { ...i, status: 'generating' } : i));

      try {
        const prompt = `Analyze this image and generate stock marketplace metadata.
Generate a professional SEO optimized title with ${settings.titleWordCount} words.
Generate a description with ${settings.descriptionWordCount} words.
Generate ${settings.keywordCount} relevant stock keywords separated by commas.
Avoid duplicate keywords and keep them relevant to stock marketplaces.
Return the result ONLY as a JSON object with keys: "title", "description", "keywords" (as an array of strings).`;

        let content: { title: string; description: string; keywords: string[] };

        if (aiConfig.provider === 'gemini') {
          const ai = new GoogleGenAI({ apiKey: aiConfig.apiKey });
          const parts = [
            { text: prompt },
            { inlineData: { data: img.thumbnail.split(',')[1], mimeType: "image/jpeg" } }
          ];

          const result = await ai.models.generateContent({ 
            model: aiConfig.model,
            contents: { parts },
            config: { responseMimeType: "application/json" }
          });
          
          if (!result.text) throw new Error("Empty response from Gemini");
          content = JSON.parse(result.text);
        } else {
          // OpenAI Compatible (Groq/Grok)
          const url = aiConfig.provider === 'groq' 
            ? 'https://api.groq.com/openai/v1/chat/completions'
            : 'https://api.x.ai/v1/chat/completions';

          const aiResponse = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${aiConfig.apiKey}`
            },
            body: JSON.stringify({
              model: aiConfig.model,
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: img.thumbnail } }
                ]
              }],
              response_format: { type: 'json_object' }
            })
          });

          if (!aiResponse.ok) {
            const errorData = await aiResponse.json();
            throw new Error(errorData.error?.message || `API error`);
          }

          const data = await aiResponse.json();
          content = JSON.parse(data.choices[0].message.content);
        }

        setImages(prev => prev.map(i => i.id === img.id ? {
          ...i,
          title: content.title,
          description: content.description,
          keywords: content.keywords,
          status: 'completed'
        } : i));

      } catch (error: any) {
        setImages(prev => prev.map(i => i.id === img.id ? {
          ...i,
          status: 'error',
          error: error.message
        } : i));
      }
    }
    setIsGenerating(false);
  };

  const exportCSV = (platform: Platform) => {
    const completedImages = images.filter(img => img.status === 'completed');
    if (completedImages.length === 0) {
      alert('No completed metadata to export.');
      return;
    }

    let csvData: any[] = [];
    completedImages.forEach(img => {
      const row: any = { 'Filename': img.fileName };
      if (platform === 'shutterstock') {
        row['Description'] = img.description;
        row['Keywords'] = img.keywords.join(', ');
        row['Categories'] = '';
      } else {
        row['Title'] = img.title;
        row['Keywords'] = img.keywords.join(', ');
        if (platform === 'vecteezy') row['Description'] = img.description;
      }
      csvData.push(row);
    });

    const csv = json2csv(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${platform}_metadata_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden"
        >
          <div className="p-8 bg-emerald-600 text-white text-center">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileSpreadsheet size={32} />
            </div>
            <h1 className="text-2xl font-bold">Stock Metadata Gen</h1>
            <p className="text-emerald-100 mt-1">Sign in to manage your stock assets</p>
          </div>

          <div className="p-8 space-y-6">
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button 
                onClick={() => setAuthMode('login')}
                className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", authMode === 'login' ? "bg-white shadow text-gray-900" : "text-gray-500")}
              >
                Login
              </button>
              <button 
                onClick={() => setAuthMode('signup')}
                className={cn("flex-1 py-2 rounded-lg text-sm font-bold transition-all", authMode === 'signup' ? "bg-white shadow text-gray-900" : "text-gray-500")}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <input 
                type="email" 
                placeholder="Email Address" 
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input 
                type="password" 
                placeholder="Password" 
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {authError && <p className="text-xs text-rose-500 font-medium px-1">{authError}</p>}
              <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-200 transition-all">
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-100" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400">Or continue with</span></div>
            </div>

            <button 
              onClick={handleGoogleLogin}
              className="w-full border border-gray-200 hover:bg-gray-50 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
            >
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
              Sign in with Google
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                <FileSpreadsheet className="text-white w-6 h-6" />
              </div>
              <h1 className="text-lg font-bold tracking-tight hidden sm:block">Stock Master</h1>
            </div>

            <nav className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              <button 
                onClick={() => setView('dashboard')}
                className={cn("px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all", view === 'dashboard' ? "bg-white shadow text-emerald-600" : "text-gray-500")}
              >
                <LayoutDashboard size={16} />
                Dashboard
              </button>
              <button 
                onClick={() => {
                  setView('generator');
                  setImages([]);
                  setCurrentProjectId(null);
                  setProjectName('Untitled Project');
                }}
                className={cn("px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all", view === 'generator' ? "bg-white shadow text-emerald-600" : "text-gray-500")}
              >
                <Plus size={16} />
                New Task
              </button>
            </nav>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowConfigModal(true)}
              className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
            >
              <Settings size={20} />
            </button>
            <div className="h-6 w-px bg-gray-200 mx-1" />
            <div className="flex items-center gap-3 pl-2">
              <div className="text-right hidden xs:block">
                <p className="text-xs font-bold text-gray-900 truncate max-w-[120px]">{user.displayName || user.email}</p>
                <button onClick={handleLogout} className="text-[10px] font-bold text-rose-500 hover:underline uppercase tracking-wider">Sign Out</button>
              </div>
              <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-200 p-0.5">
                {user.photoURL ? <img src={user.photoURL} className="w-full h-full rounded-full" alt="Avatar" /> : <UserIcon size={24} className="text-emerald-600 w-full h-full p-1" />}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {view === 'dashboard' ? (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-black text-gray-900">Welcome Back!</h2>
                <p className="text-gray-500 mt-1">Manage your metadata projects and history.</p>
              </div>
              <button 
                onClick={() => setView('generator')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-2xl shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
              >
                <Plus size={20} />
                Create New Project
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <AnimatePresence>
                {isLoadingProjects ? (
                  [...Array(4)].map((_, i) => <div key={i} className="h-48 bg-gray-100 animate-pulse rounded-2xl" />)
                ) : savedProjects.length === 0 ? (
                  <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-gray-100">
                    <Database size={48} className="mx-auto text-gray-200 mb-4" />
                    <h3 className="text-xl font-bold text-gray-600">No Projects Found</h3>
                    <p className="text-gray-400 mt-1">Start by creating your first metadata task.</p>
                  </div>
                ) : (
                  savedProjects.map(project => (
                    <ProjectCard 
                      key={project.id} 
                      project={project} 
                      onOpen={openProject} 
                      onDelete={deleteProject} 
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setView('dashboard')} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400"><X size={24} /></button>
                <input 
                  type="text" 
                  className="text-2xl font-black bg-transparent border-b-2 border-transparent focus:border-emerald-500 outline-none px-2 transition-all max-w-[300px]"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={saveProject}
                  className="bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
                >
                  <Save size={18} />
                  Save Project
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <div 
                  {...getRootProps()} 
                  className={cn(
                    "h-64 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all cursor-pointer group",
                    isDragActive ? "border-emerald-500 bg-emerald-50" : "border-gray-300 bg-white hover:border-emerald-400 hover:bg-gray-50"
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Upload className="text-gray-400 group-hover:text-emerald-600" /></div>
                  <p className="text-lg font-medium text-gray-700">Drag & drop images here</p>
                  <p className="text-sm text-gray-400 mt-1">Supports JPG, JPEG, PNG (Processed locally)</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                <div className="flex items-center gap-2 font-bold text-gray-900"><Settings size={20} className="text-emerald-600" /><h2>Generation Config</h2></div>
                <div className="space-y-4">
                  {[
                    { label: 'Keywords', key: 'keywordCount' },
                    { label: 'Title Size', key: 'titleWordCount' },
                    { label: 'Desc Size', key: 'descriptionWordCount' }
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">{f.label}</label>
                      <input 
                        type="number" 
                        value={settings[f.key as keyof GenerationSettings]}
                        onChange={(e) => setSettings({...settings, [f.key]: parseInt(e.target.value)})}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  ))}
                </div>
                <button 
                  onClick={generateMetadata}
                  disabled={isGenerating || images.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                >
                  {isGenerating ? <Loader2 className="animate-spin" /> : <Play size={18} />}
                  {isGenerating ? 'Generating...' : 'Start AI Generation'}
                </button>
              </div>
            </div>

            {images.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                  <div className="flex bg-gray-100 p-1 rounded-xl">
                    <input 
                      type="text" placeholder="Batch Tags (comma separated)" 
                      className="bg-transparent border-none text-sm px-4 outline-none w-64"
                      value={batchKeyword} onChange={(e) => setBatchKeyword(e.target.value)}
                    />
                    <div className="flex gap-1">
                      <button onClick={() => {
                        const tags = batchKeyword.split(',').map(t => t.trim()).filter(Boolean);
                        setImages(prev => prev.map(img => ({ ...img, keywords: Array.from(new Set([...img.keywords, ...tags])) })));
                        setBatchKeyword('');
                      }} className="px-3 py-1 bg-white rounded-lg text-[10px] font-black text-emerald-600 hover:bg-emerald-50 shadow-sm transition-all">ADD ALL</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">Export Marketplace CSV:</span>
                    {(['adobe', 'shutterstock', 'freepik', 'vecteezy'] as Platform[]).map(p => (
                      <button key={p} onClick={() => exportCSV(p)} className="px-4 py-2 bg-gray-900 text-white text-[10px] font-black rounded-xl hover:bg-black transition-all shadow-sm uppercase tracking-wider">{p}</button>
                    ))}
                    <button onClick={() => { if(window.confirm("Delete all?")) setImages([]) }} className="p-2 text-gray-300 hover:text-rose-500 transition-colors"><Trash2 size={24} /></button>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-20">Preview</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-48">File</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Title & Description</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-1/3">Keywords</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-20">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {images.map((img) => (
                        <tr key={img.id} className="hover:bg-gray-50/30 transition-colors group">
                          <td className="px-6 py-4"><img src={img.thumbnail} className="w-12 h-12 rounded-lg object-cover shadow-sm bg-gray-100" alt="Thumb" /></td>
                          <td className="px-6 py-4 font-bold text-gray-900 text-sm truncate max-w-[150px]">{img.fileName}</td>
                          <td className="px-6 py-4 space-y-2">
                             <input value={img.title} onChange={e => setImages(prev => prev.map(i => i.id === img.id ? {...i, title: e.target.value} : i))} className="w-full bg-transparent border-none font-bold text-sm outline-none placeholder:text-gray-300" placeholder="AI title..." />
                             <textarea value={img.description} onChange={e => setImages(prev => prev.map(i => i.id === img.id ? {...i, description: e.target.value} : i))} className="w-full bg-transparent border-none text-xs text-gray-500 outline-none resize-none placeholder:text-gray-300" placeholder="AI description..." rows={2} />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              {img.keywords.map((kw, idx) => (
                                <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-100 uppercase tracking-tight">
                                  {kw}
                                  <button onClick={() => setImages(prev => prev.map(i => i.id === img.id ? {...i, keywords: i.keywords.filter((_, j) => j !== idx)} : i))} className="hover:text-rose-500"><X size={10} /></button>
                                </span>
                              ))}
                              <button onClick={() => {const kw = prompt("Tag:"); if(kw) setImages(prev => prev.map(i => i.id === img.id ? {...i, keywords: [...i.keywords, kw]} : i))}} className="w-6 h-6 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-300 hover:border-emerald-500 hover:text-emerald-500"><Plus size={12} /></button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {img.status === 'generating' ? <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" /> : 
                             img.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : 
                             img.status === 'error' ? <div className="group relative"><AlertCircle className="w-5 h-5 text-rose-500" /><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-32 bg-gray-900 text-white text-[10px] p-2 rounded-lg">{img.error}</div></div> : 
                             <div className="w-2 h-2 rounded-full bg-gray-200" />}
                          </td>
                          <td className="px-6 py-4"><button onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))} className="text-gray-200 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </main>

      {/* AI Config Modal */}
      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowConfigModal(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2"><Cpu className="text-emerald-600" size={24} /><h2 className="text-xl font-bold">AI Brain Settings</h2></div>
                <button onClick={() => setShowConfigModal(false)}><X size={20} /></button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Service Provider</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['gemini', 'groq', 'grok'] as AIProvider[]).map(p => (
                      <button key={p} onClick={() => setAiConfig({...aiConfig, provider: p, model: AI_MODELS[p][0].id})} className={cn("py-2.5 rounded-xl border text-xs font-bold capitalize transition-all", aiConfig.provider === p ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm" : "bg-gray-50 border-gray-100 text-gray-500 hover:bg-white hover:border-gray-300")}>{p}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Model Engine</label>
                  <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-1">
                    {AI_MODELS[aiConfig.provider].map(m => (
                      <button key={m.label} onClick={() => setAiConfig({...aiConfig, model: m.id})} className={cn("w-full text-left px-4 py-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all", aiConfig.model === m.id ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "bg-white border-gray-100 text-gray-500")}>
                        {m.label}{aiConfig.model === m.id && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">API Secret Key</label>
                  <div className="relative"><Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} /><input type="password" value={aiConfig.apiKey} onChange={e => setAiConfig({...aiConfig, apiKey: e.target.value})} placeholder={`${aiConfig.provider.toUpperCase()} API KEY`} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" /></div>
                </div>
                <button onClick={() => saveConfig(aiConfig)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"><Save size={18} />Save Configuration</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-gray-100 mt-20 text-center opacity-50">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Stock Metadata Gen Pro &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
