import React from 'react';
import { StockProject } from '../types';
import { Calendar, Image as ImageIcon, Trash2, ArrowUpRight, Clock, FileText } from 'lucide-react';
import { motion } from 'motion/react';

interface ProjectCardProps {
  project: StockProject;
  onOpen: (project: StockProject) => void;
  onDelete: (id: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onOpen, onDelete }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8 }}
      className="bg-white dark:bg-gray-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/40 dark:shadow-none transition-all group flex flex-col justify-between h-full relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-12 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-6">
          <div className="w-12 h-12 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-emerald-600 shadow-Inner border border-gray-100 dark:border-gray-700">
             <FileText size={24} />
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project.id);
            }}
            className="p-3 text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-2xl transition-all"
          >
            <Trash2 size={18} />
          </button>
        </div>
        
        <h3 className="text-xl font-black text-gray-900 dark:text-white truncate pr-2 tracking-tight group-hover:text-emerald-600 transition-colors">{project.name}</h3>
        
        <div className="flex flex-wrap gap-4 mt-6">
          <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-700">
            <ImageIcon size={12} className="text-emerald-500" />
            <span>{project.images.length} ASSETS</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-700">
            <Clock size={12} className="text-emerald-500" />
            <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onOpen(project)}
        className="relative z-10 mt-8 w-full py-4 bg-gray-900 dark:bg-emerald-600 text-white text-xs font-black rounded-2xl hover:bg-emerald-600 dark:hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 shadow-lg uppercase tracking-widest"
      >
        OPEN WORKSPACE
        <ArrowUpRight size={16} />
      </motion.button>
    </motion.div>
  );
};
