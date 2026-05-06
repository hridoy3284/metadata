import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, Settings, Play, Download, Trash2, Plus, X, Key, CheckCircle2, 
  AlertCircle, Loader2, FileSpreadsheet, Save, Cpu, LogOut, 
  Search, FolderOpen, LayoutDashboard, Database, User as UserIcon, LogIn,
  Moon, Sun, History, ChevronRight, BarChart3, Clock, Sparkles
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
  updateProfile
} from 'firebase/auth';
import { 
  ref, 
  set, 
  get, 
  onValue, 
  remove, 
  push,
  update
} from 'firebase/database';
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
  const [user, loadingAuth] = useAuthState(auth);
  
  // App States
  const [view, setView] = useState<'dashboard' | 'generator'>('dashboard');
  const [darkMode, setDarkMode] = useState(false);
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
  const [generationProgress, setGenerationProgress] = useState(0);
  
  // Auth Form States
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');

  // Dashboard Data
  const [savedProjects, setSavedProjects] = useState<StockProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Appearance Sync
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load User Config & Projects from Realtime Database
  useEffect(() => {
    if (user) {
      loadUserConfig();
      // Listen for projects in real-time
      const projectsRef = ref(db, `users/${user.uid}/projects`);
      setIsLoadingProjects(true);
      const unsubscribe = onValue(projectsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const projectsList: StockProject[] = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          })).sort((a, b) => b.updatedAt - a.updatedAt);
          setSavedProjects(projectsList);
        } else {
          setSavedProjects([]);
        }
        setIsLoadingProjects(false);
      });

      return () => unsubscribe();
    }
  }, [user]);

  const loadUserConfig = async () => {
    if (!user) return;
    try {
      const configRef = ref(db, `users/${user.uid}/configs/ai`);
      const snapshot = await get(configRef);
      if (snapshot.exists()) {
        setAiConfig(snapshot.val());
      }
    } catch (e) {
      console.error("Error loading config", e);
    }
  };

  const saveConfig = async (config: AIConfig) => {
    if (!user) return;
    try {
      await set(ref(db, `users/${user.uid}/configs/ai`), config);
      setAiConfig(config);
      setShowConfigModal(false);
    } catch (e) {
      console.error("Error saving config", e);
      alert("Failed to save configuration.");
    }
  };

  const saveProject = async () => {
    if (!user) return;
    if (images.length === 0) return;

    try {
      const projectId = currentProjectId || push(ref(db, `users/${user.uid}/projects`)).key!;
      const projectData = {
        userId: user.uid,
        name: projectName,
        updatedAt: Date.now(),
        images,
        settings,
        createdAt: currentProjectId ? savedProjects.find(p => p.id === currentProjectId)?.createdAt || Date.now() : Date.now()
      };

      await set(ref(db, `users/${user.uid}/projects/${projectId}`), projectData);
      setCurrentProjectId(projectId);
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
    if (!user) return;
    if (!window.confirm("Are you sure you want to delete this project?")) return;
    try {
      await remove(ref(db, `users/${user.uid}/projects/${id}`));
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
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
          await updateProfile(userCred.user, { displayName });
        }
      }
    } catch (e: any) {
      setAuthError(e.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      setAuthError(e.message);
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
      thumbnail: '',
      status: 'idle' as const
    }));

    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setImages(prev => prev.map((img) => {
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
    setGenerationProgress(0);
    let completedCount = 0;

    for (const img of idleImages) {
      setImages(prev => prev.map(i => i.id === img.id ? { ...i, status: 'generating' } : i));

      try {
        const prompt = `Analyze this image and generate stock marketplace metadata.
Generate a professional SEO optimized title with ${settings.titleWordCount} words.
Generate a description with ${settings.descriptionWordCount} words.
Generate ${settings.keywordCount} relevant stock keywords separated by commas.
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
          
          if (!result.text) throw new Error("Empty response");
          content = JSON.parse(result.text);
        } else {
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

          if (!aiResponse.ok) throw new Error(`API error`);
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
          ...i, status: 'error', error: error.message
        } : i));
      }
      completedCount++;
      setGenerationProgress((completedCount / idleImages.length) * 100);
    }
    setIsGenerating(false);
  };

  const exportCSV = (platform: Platform) => {
    const completedImages = images.filter(img => img.status === 'completed');
    if (completedImages.length === 0) return;

    const csvData = completedImages.map(img => {
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
      return row;
    });

    const csv = json2csv(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `${platform}_meta_${Date.now()}.csv`);
    link.click();
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden"
        >
          <div className="p-10 bg-emerald-600 text-white text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-Inner"
            >
              <FileSpreadsheet size={40} />
            </motion.div>
            <h1 className="text-3xl font-black tracking-tight">Stock Master</h1>
            <p className="text-emerald-100 mt-2 font-medium">Smart AI Metadata Generator</p>
          </div>

          <div className="p-10 space-y-8">
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl">
              <button 
                onClick={() => setAuthMode('login')}
                className={cn("flex-1 py-3 rounded-xl text-sm font-black transition-all", authMode === 'login' ? "bg-white dark:bg-gray-700 shadow-md text-gray-900 dark:text-white" : "text-gray-400")}
              >
                LOG IN
              </button>
              <button 
                onClick={() => setAuthMode('signup')}
                className={cn("flex-1 py-3 rounded-xl text-sm font-black transition-all", authMode === 'signup' ? "bg-white dark:bg-gray-700 shadow-md text-gray-900 dark:text-white" : "text-gray-400")}
              >
                SIGN UP
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'signup' && (
                <input 
                  type="text" 
                  placeholder="Full Name" 
                  className="w-full px-5 py-4 bg-gray-50 dark:bg-gray-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm dark:text-white"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              )}
              <input 
                type="email" 
                placeholder="Email Address" 
                className="w-full px-5 py-4 bg-gray-50 dark:bg-gray-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm dark:text-white"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input 
                type="password" 
                placeholder="Password" 
                className="w-full px-5 py-4 bg-gray-50 dark:bg-gray-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm dark:text-white"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {authError && <p className="text-xs text-rose-500 font-bold px-2">{authError}</p>}
              <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-200 dark:shadow-emerald-900/20 transition-all active:scale-95">
                {authMode === 'login' ? 'SIGN IN' : 'GET STARTED'}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-100 dark:border-gray-800" /></div>
              <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest"><span className="bg-white dark:bg-gray-900 px-4 text-gray-400">Social Sign In</span></div>
            </div>

            <button 
              onClick={handleGoogleLogin}
              className="w-full border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 py-4 rounded-2xl font-black flex items-center justify-center gap-3 transition-all dark:text-white active:scale-95 shadow-sm"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              Sign in with Google
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-950 text-[#1A1A1A] dark:text-gray-100 font-sans selection:bg-emerald-100 dark:selection:bg-emerald-900/30 transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
              <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform">
                <FileSpreadsheet className="text-white w-7 h-7" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-black tracking-tight leading-tight">Stock Master</h1>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 -mt-1">Realtime AI</p>
              </div>
            </div>

            <nav className="hidden md:flex gap-2 bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl">
              <button 
                onClick={() => setView('dashboard')}
                className={cn("px-6 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all", view === 'dashboard' ? "bg-white dark:bg-gray-700 shadow-md text-emerald-600 dark:text-emerald-400" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200")}
              >
                <LayoutDashboard size={14} />
                DASHBOARD
              </button>
              <button 
                onClick={() => {
                  setView('generator');
                  setImages([]);
                  setCurrentProjectId(null);
                  setProjectName('Untitled Work');
                }}
                className={cn("px-6 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all", view === 'generator' ? "bg-white dark:bg-gray-700 shadow-md text-emerald-600 dark:text-emerald-400" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200")}
              >
                <Plus size={14} />
                NEW TASK
              </button>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-gray-50 dark:bg-gray-800 rounded-2xl p-1 gap-1">
              <button onClick={() => setDarkMode(false)} className={cn("p-2 rounded-xl transition-all", !darkMode ? "bg-white dark:bg-gray-700 shadow-sm text-emerald-600" : "text-gray-400")}><Sun size={18} /></button>
              <button onClick={() => setDarkMode(true)} className={cn("p-2 rounded-xl transition-all", darkMode ? "bg-white dark:bg-gray-700 shadow-sm text-emerald-600" : "text-gray-400")}><Moon size={18} /></button>
            </div>

            <button onClick={() => setShowConfigModal(true)} className="p-3 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors bg-gray-50 dark:bg-gray-800 rounded-2xl"><Settings size={22} /></button>
            <div className="h-10 w-px bg-gray-200 dark:border-gray-800" />
            
            <div className="flex items-center gap-4 pl-2">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black text-gray-900 dark:text-white truncate max-w-[140px] uppercase tracking-tight">{user.displayName || user.email?.split('@')[0]}</p>
                <button onClick={handleLogout} className="text-[10px] font-black text-rose-500 hover:text-rose-600 uppercase tracking-widest flex items-center gap-1.5 ml-auto group">
                   LOG OUT <LogOut size={10} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/10">
                <div className="w-full h-full rounded-2xl bg-white dark:bg-gray-900 p-0.5 flex items-center justify-center overflow-hidden">
                  {user.photoURL ? <img src={user.photoURL} className="w-full h-full rounded-2xl object-cover" alt="Profile" /> : <UserIcon size={24} className="text-emerald-600" />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {view === 'dashboard' ? (
          <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white dark:bg-gray-900 p-10 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-none relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-20 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                   <div className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-black rounded-full uppercase tracking-widest border border-emerald-200 dark:border-emerald-800">Pro Contributor</div>
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                </div>
                <h2 className="text-5xl font-black text-gray-900 dark:text-white tracking-tight">Focus on your <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-400">Creativity.</span></h2>
                <p className="text-gray-500 dark:text-gray-400 mt-4 text-lg max-w-lg font-medium">Auto-generate professional keywords, titles, and descriptions for your stock photos in seconds.</p>
              </div>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setView('generator')}
                className="relative z-10 bg-gray-900 dark:bg-emerald-600 hover:bg-emerald-700 text-white font-black px-10 py-5 rounded-3xl shadow-2xl flex items-center gap-3 transition-all"
              >
                <Sparkles size={24} />
                START NEW TASK
              </motion.button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
               <div className="lg:col-span-3 space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-xl font-black flex items-center gap-2 uppercase tracking-widest text-gray-400"><Clock size={16} /> Recent Projects</h3>
                    <div className="flex gap-2">
                       <button className="p-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl text-gray-400 hover:text-emerald-600 transition-colors shadow-sm"><Search size={18} /></button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                      {isLoadingProjects ? (
                        [...Array(6)].map((_, i) => <motion.div key={i} layout className="h-56 bg-gray-200 dark:bg-gray-800 animate-pulse rounded-[2rem]" />)
                      ) : savedProjects.length === 0 ? (
                        <div className="col-span-full py-32 text-center bg-white dark:bg-gray-900 rounded-[3rem] border-2 border-dashed border-gray-100 dark:border-gray-800">
                          <FolderOpen size={64} className="mx-auto text-gray-200 dark:text-gray-800 mb-6" />
                          <h3 className="text-2xl font-black text-gray-400 dark:text-gray-600 uppercase tracking-widest">Workspace Empty</h3>
                          <p className="text-gray-400 dark:text-gray-500 mt-2 font-medium">Your historical projects will appear here.</p>
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

               <div className="space-y-6">
                  <h3 className="text-xl font-black flex items-center gap-2 uppercase tracking-widest text-gray-400 px-2"><BarChart3 size={16} /> Workflow Stats</h3>
                  <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2rem] p-8 shadow-sm space-y-8">
                     <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Generated</p>
                        <p className="text-4xl font-black text-emerald-600">{savedProjects.reduce((acc, p) => acc + p.images.length, 0)}</p>
                        <p className="text-xs text-gray-400 mt-1 font-bold">Metadata entries saved</p>
                     </div>
                     <div className="h-px bg-gray-100 dark:bg-gray-800" />
                     <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Active Projects</p>
                        <p className="text-4xl font-black text-gray-900 dark:text-white">{savedProjects.length}</p>
                        <p className="text-xs text-gray-400 mt-1 font-bold">In your realtime cloud</p>
                     </div>
                     <div className="pt-4">
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center gap-4">
                           <div className="w-10 h-10 bg-white dark:bg-gray-700 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm"><History size={20} /></div>
                           <div className="flex-1">
                              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Active Plan</p>
                              <p className="text-sm font-black text-gray-900 dark:text-white">Professional</p>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setView('dashboard')} 
                  className="p-4 hover:bg-white dark:hover:bg-gray-800 hover:shadow-md rounded-[2rem] text-gray-400 transition-all active:scale-95 bg-gray-50 dark:bg-gray-900 border border-transparent hover:border-gray-100 dark:hover:border-gray-800"
                >
                  <X size={28} />
                </button>
                <div>
                  <input 
                    type="text" 
                    className="text-3xl lg:text-4xl font-black bg-transparent border-none focus:ring-0 outline-none px-0 transition-all max-w-[400px] dark:text-white placeholder:text-gray-200 dark:placeholder:text-gray-800"
                    value={projectName}
                    placeholder="UNTITLED WORK"
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-emerald-500 shadow-sm"></div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Editing Mode (Live)</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={saveProject}
                  className="px-8 py-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:bg-emerald-50 dark:hover:bg-gray-800 rounded-3xl font-black shadow-xl shadow-gray-200/40 dark:shadow-none transition-all flex items-center gap-3 dark:text-white border-b-4 active:translate-y-1 active:border-b-0"
                >
                  <Save size={20} className="text-emerald-600" />
                  SAVE PROJECT
                </button>
                <div className="h-10 w-px bg-gray-200 dark:border-gray-800" />
                <div className="flex items-center gap-4 bg-gray-100 dark:bg-gray-800 p-2 rounded-3xl">
                   {['adobe', 'shutterstock', 'freepik'].map(p => (
                     <button key={p} onClick={() => exportCSV(p as any)} className="px-4 py-2 hover:bg-white dark:hover:bg-gray-700 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-300 hover:text-emerald-600 transition-all active:scale-95">{p}</button>
                   ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-3 space-y-8">
                <div 
                  {...getRootProps()} 
                  className={cn(
                    "relative h-80 border-4 border-dashed rounded-[3rem] flex flex-col items-center justify-center transition-all cursor-pointer group overflow-hidden",
                    isDragActive ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-emerald-400 dark:hover:border-emerald-600"
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] dark:opacity-10"></div>
                  <div className="relative z-10 w-24 h-24 bg-gray-50 dark:bg-gray-800 rounded-[2.5rem] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-Inner">
                    <Upload className="text-gray-400 group-hover:text-emerald-600 w-10 h-10" />
                  </div>
                  <p className="relative z-10 text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Drop your assets here</p>
                  <p className="relative z-10 text-sm text-gray-400 mt-2 font-bold uppercase tracking-widest">JPG, JPEG, PNG • PROCESSED LOCALLY</p>
                </div>

                {images.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-6 bg-white dark:bg-gray-900 p-6 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
                      <div className="flex bg-gray-50 dark:bg-gray-800 p-1.5 rounded-2xl w-full sm:w-auto">
                        <input 
                          type="text" placeholder="BATCH TAGS (E.G. NATURE, FOREST)" 
                          className="bg-transparent border-none text-xs font-black px-5 outline-none flex-1 min-w-[280px] uppercase tracking-widest placeholder:text-gray-200 dark:placeholder:text-gray-700"
                          value={batchKeyword} onChange={(e) => setBatchKeyword(e.target.value)}
                        />
                        <button onClick={() => {
                          const tags = batchKeyword.split(',').map(t => t.trim()).filter(Boolean);
                          setImages(prev => prev.map(img => ({ ...img, keywords: Array.from(new Set([...img.keywords, ...tags])) })));
                          setBatchKeyword('');
                        }} className="px-6 py-2.5 bg-gray-900 dark:bg-emerald-600 rounded-xl text-xs font-black text-white hover:opacity-90 shadow-lg active:scale-95 transition-all">APPLY ALL</button>
                      </div>
                      
                      <div className="flex items-center gap-6">
                         <div className="h-8 w-px bg-gray-100 dark:bg-gray-800 hidden sm:block"></div>
                         <button onClick={() => { if(window.confirm("Nuclear clear?")) setImages([]) }} className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded-2xl hover:bg-rose-100 dark:hover:bg-rose-950/40 transition-all active:scale-95 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest">
                            <Trash2 size={24} /> 
                         </button>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 rounded-[3rem] border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden shadow-gray-200/30 dark:shadow-none">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                            <tr>
                              <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] w-28">ASSET</th>
                              <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">METADATA ENGINE</th>
                              <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] w-1/3">KEYWORDS & TAGS</th>
                              <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] w-32">ENGINE</th>
                              <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] w-16"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                            {images.map((img) => (
                              <tr key={img.id} className="hover:bg-emerald-50/20 dark:hover:bg-emerald-500/5 transition-colors group">
                                <td className="px-8 py-8">
                                   <div className="relative group/thumb">
                                      <img src={img.thumbnail} className="w-20 h-20 rounded-2xl object-cover shadow-2xl dark:shadow-none bg-gray-100 dark:bg-gray-800 ring-2 ring-transparent group-hover:ring-emerald-500 transition-all border border-gray-100 dark:border-gray-700" alt="Thumb" referrerPolicy="no-referrer" />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 rounded-2xl flex items-center justify-center transition-opacity">
                                         <Search size={20} className="text-white" />
                                      </div>
                                   </div>
                                </td>
                                <td className="px-8 py-8 space-y-3 align-top">
                                   <input 
                                     value={img.title} 
                                     onChange={e => setImages(prev => prev.map(i => i.id === img.id ? {...i, title: e.target.value} : i))} 
                                     className="w-full bg-transparent border-none font-black text-lg outline-none placeholder:text-gray-200 dark:placeholder:text-gray-800 dark:text-white tracking-tight" 
                                     placeholder="Auto-title pending..." 
                                   />
                                   <textarea 
                                     value={img.description} 
                                     onChange={e => setImages(prev => prev.map(i => i.id === img.id ? {...i, description: e.target.value} : i))} 
                                     className="w-full bg-transparent border-none text-xs font-medium text-gray-400 dark:text-gray-500 outline-none resize-none placeholder:text-gray-200 dark:placeholder:text-gray-800 leading-relaxed uppercase tracking-wider" 
                                     placeholder="Smart description pending generation..." 
                                     rows={3} 
                                   />
                                </td>
                                <td className="px-8 py-8 align-top">
                                  <div className="flex flex-wrap gap-2">
                                    {img.keywords.map((kw, idx) => (
                                      <motion.span 
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        key={idx} 
                                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] font-black rounded-lg border border-gray-100 dark:border-gray-700 uppercase tracking-tight shadow-sm"
                                      >
                                        {kw}
                                        <button onClick={() => setImages(prev => prev.map(i => i.id === img.id ? {...i, keywords: i.keywords.filter((_, j) => j !== idx)} : i))} className="hover:text-rose-500 transition-colors"><X size={12} /></button>
                                      </motion.span>
                                    ))}
                                    <button onClick={() => {const kw = prompt("Custom tag:"); if(kw) setImages(prev => prev.map(i => i.id === img.id ? {...i, keywords: [...i.keywords, kw]} : i))}} className="w-8 h-8 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-300 hover:border-emerald-500 hover:text-emerald-500 transition-all hover:bg-emerald-50 dark:hover:bg-emerald-950/20"><Plus size={16} /></button>
                                  </div>
                                </td>
                                <td className="px-8 py-8">
                                  <div className="flex flex-col items-center gap-2">
                                    {img.status === 'generating' ? <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /> : 
                                     img.status === 'completed' ? <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600 animate-in zoom-in-50"><CheckCircle2 size={24} /></div> : 
                                     img.status === 'error' ? <div className="group relative"><div className="w-10 h-10 bg-rose-50 dark:bg-rose-950/30 rounded-2xl flex items-center justify-center text-rose-500"><AlertCircle size={24} /></div><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-gray-900 text-white text-[10px] p-3 rounded-2xl shadow-2xl z-20">{img.error}</div></div> : 
                                     <div className="w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-800" />}
                                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{img.status}</span>
                                  </div>
                                </td>
                                <td className="px-8 py-8"><button onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))} className="text-gray-200 dark:text-gray-800 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl"><Trash2 size={22} /></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="space-y-8">
                <div className="bg-white dark:bg-gray-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/30 dark:shadow-none space-y-8 sticky top-28">
                  <div className="flex items-center gap-3 font-black text-gray-900 dark:text-white uppercase tracking-widest text-sm">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl text-emerald-600"><Settings size={18} /></div>
                    <h2>Engine Tuner</h2>
                  </div>
                  
                  {isGenerating && (
                    <div className="space-y-3">
                       <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                          <span className="text-emerald-600 animate-pulse">Analyzing...</span>
                          <span>{Math.round(generationProgress)}%</span>
                       </div>
                       <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden p-0.5">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${generationProgress}%` }}
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                          />
                       </div>
                    </div>
                  )}

                  <div className="space-y-6">
                    {[
                      { label: 'Keyword Target', key: 'keywordCount', icon: <History size={14} /> },
                      { label: 'Title Structure', key: 'titleWordCount', icon: <ChevronRight size={14} /> },
                      { label: 'Desc Complexity', key: 'descriptionWordCount', icon: <Clock size={14} /> }
                    ].map(f => (
                      <div key={f.key} className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2 ml-1">
                          {f.icon} {f.label}
                        </label>
                        <input 
                          type="number" 
                          value={settings[f.key as keyof GenerationSettings]}
                          onChange={(e) => setSettings({...settings, [f.key]: parseInt(e.target.value)})}
                          className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-2xl px-6 py-4 text-sm font-black focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white"
                        />
                      </div>
                    ))}
                  </div>

                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={generateMetadata}
                    disabled={isGenerating || images.length === 0}
                    className="group relative w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-300 text-white font-black py-5 rounded-[2rem] shadow-2xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-4 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12"></div>
                    {isGenerating ? <Loader2 className="animate-spin" /> : <Play size={20} className="fill-current" />}
                    {isGenerating ? 'AI IS THINKING...' : 'RUN AI ENGINE'}
                  </motion.button>

                  <div className="p-5 bg-gray-50 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700/50">
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Current Active Brain</p>
                     <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight">{aiConfig.provider}: {AI_MODELS[aiConfig.provider].find(m => m.id === aiConfig.model)?.label.split(' ')[0]}</p>
                        <button onClick={() => setShowConfigModal(true)} className="text-[10px] font-black text-emerald-600 hover:underline">SWITCH</button>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* AI Config Modal */}
      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowConfigModal(false)} className="absolute inset-0 bg-black/60 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-[3rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden border border-gray-100 dark:border-gray-800">
              <div className="p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-600 rounded-2xl text-white shadow-lg shadow-emerald-500/20"><Cpu size={28} /></div>
                  <div>
                    <h2 className="text-2xl font-black dark:text-white tracking-tight">AI Ecosystem</h2>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest -mt-1">Neural Network Config</p>
                  </div>
                </div>
                <button onClick={() => setShowConfigModal(false)} className="p-3 hover:bg-white dark:hover:bg-gray-700 rounded-2xl transition-all"><X size={24} className="text-gray-400" /></button>
              </div>
              <div className="p-8 space-y-8">
                <div>
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-4 block ml-1">1. Choose Intelligence</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['gemini', 'groq', 'grok'] as AIProvider[]).map(p => (
                      <button 
                        key={p} 
                        onClick={() => setAiConfig({...aiConfig, provider: p, model: AI_MODELS[p][0].id})} 
                        className={cn(
                          "py-4 rounded-2xl border-2 font-black uppercase text-xs transition-all flex flex-col items-center gap-2 group", 
                          aiConfig.provider === p 
                            ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-md" 
                            : "bg-gray-50 dark:bg-gray-800 border-transparent text-gray-400 hover:border-gray-200 dark:hover:border-gray-700"
                        )}
                      >
                        <span className="group-hover:scale-110 transition-transform">{p}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-4 block ml-1">2. Select Neural Engine</label>
                  <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto pr-2 custom-scrollbar">
                    {AI_MODELS[aiConfig.provider].map(m => (
                      <button 
                         key={m.label} 
                         onClick={() => setAiConfig({...aiConfig, model: m.id})} 
                         className={cn(
                           "w-full text-left px-6 py-4 rounded-2xl border-2 font-bold flex items-center justify-between transition-all", 
                           aiConfig.model === m.id ? "bg-white dark:bg-gray-800 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-sm" : "bg-white dark:bg-gray-900 border-gray-50 dark:border-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                         )}
                      >
                        <div className="flex items-center gap-3">
                           <div className={cn("w-2 h-2 rounded-full", aiConfig.model === m.id ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700")}></div>
                           <span className="text-sm uppercase tracking-tight">{m.label}</span>
                        </div>
                        {aiConfig.model === m.id && <CheckCircle2 size={16} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-3 block ml-1">3. Neural Key Entry</label>
                  <div className="relative">
                    <Key className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                    <input 
                      type="password" 
                      value={aiConfig.apiKey} 
                      onChange={e => setAiConfig({...aiConfig, apiKey: e.target.value})} 
                      placeholder={`${aiConfig.provider.toUpperCase()} SECRET TOKEN`} 
                      className="w-full pl-16 pr-6 py-5 bg-gray-50 dark:bg-gray-800 border-none rounded-[2rem] outline-none focus:ring-4 focus:ring-emerald-500/20 text-sm font-black dark:text-white transition-all placeholder:text-gray-300 dark:placeholder:text-gray-700" 
                    />
                  </div>
                </div>
                <button 
                  onClick={() => saveConfig(aiConfig)} 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-6 rounded-[2.5rem] shadow-2xl shadow-emerald-500/30 transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm active:scale-[0.98]"
                >
                  <Save size={22} />
                  ACTIVATE CONFIGURATION
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="max-w-7xl mx-auto px-6 py-20 border-t border-gray-100 dark:border-gray-800 mt-20">
         <div className="grid grid-cols-1 md:grid-cols-3 gap-12 items-center">
            <div className="flex items-center gap-3 opacity-40">
               <FileSpreadsheet className="text-emerald-600" size={24} />
               <span className="text-sm font-black uppercase tracking-widest">Stock Master Pro</span>
            </div>
            <div className="text-center">
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">&copy; {new Date().getFullYear()} Neural Metadata System</p>
            </div>
            <div className="flex justify-end gap-6">
               {['Documentation', 'Privacy', 'Support'].map(l => (
                 <a key={l} href="#" className="text-[10px] font-black text-gray-300 hover:text-emerald-600 uppercase tracking-widest transition-colors">{l}</a>
               ))}
            </div>
         </div>
      </footer>
    </div>
  );
}
