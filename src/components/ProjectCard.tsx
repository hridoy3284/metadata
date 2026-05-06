import React from 'react';
import { StockProject } from '../types';
import { Calendar, Image as ImageIcon, Trash2, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';

interface ProjectCardProps {
  project: StockProject;
  onOpen: (project: StockProject) => void;
  onDelete: (id: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onOpen, onDelete }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between"
    >
      <div>
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-bold text-gray-900 truncate pr-4">{project.name}</h3>
          <button 
            onClick={() => onDelete(project.id)}
            className="text-gray-300 hover:text-rose-500 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
        
        <div className="space-y-2 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <ImageIcon size={14} />
            <span>{project.images.length} images</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} />
            <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <button
        onClick={() => onOpen(project)}
        className="mt-4 w-full py-2 bg-emerald-50 text-emerald-700 font-bold rounded-xl hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2"
      >
        Open Project
        <ExternalLink size={14} />
      </button>
    </motion.div>
  );
};
