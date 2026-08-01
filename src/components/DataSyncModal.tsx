import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Upload, X, Save, AlertTriangle, FileUp, FileDown, CheckCircle2 } from 'lucide-react';
import { LibraryEntry, EpisodeLog } from '../types';

interface DataSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  library: LibraryEntry[];
  logs: EpisodeLog[];
  onImportLibrary: (entries: LibraryEntry[]) => void;
  onImportLogs: (logs: EpisodeLog[]) => void;
}

export function DataSyncModal({ isOpen, onClose, library, logs, onImportLibrary, onImportLogs }: DataSyncModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleExport = () => {
    const exportData = {
      version: 1,
      timestamp: new Date().toISOString(),
      library,
      logs
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `senpai_data_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        // Basic validation
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid backup file format.');
        }

        let importedLibrary: LibraryEntry[] = [];
        let importedLogs: EpisodeLog[] = [];

        if (Array.isArray(data.library)) {
          importedLibrary = data.library;
        } else if (data.favorites && Array.isArray(data.favorites)) {
          // Fallback to older format (if there was one, though right now we don't have it, but for safety)
          importedLibrary = data.favorites.map((id: number) => ({ showId: id, status: 'watching' }));
        }

        if (Array.isArray(data.logs)) {
          importedLogs = data.logs;
        }

        if (importedLibrary.length === 0 && importedLogs.length === 0) {
          throw new Error('No valid data found in the file.');
        }

        onImportLibrary(importedLibrary);
        onImportLogs(importedLogs);
        
        setImportStatus('success');
        setTimeout(() => setImportStatus('idle'), 3000);
      } catch (err: any) {
        setImportStatus('error');
        setErrorMessage(err.message || 'Failed to parse the backup file.');
        setTimeout(() => setImportStatus('idle'), 4000);
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    
    reader.onerror = () => {
      setImportStatus('error');
      setErrorMessage('Failed to read the file.');
      setTimeout(() => setImportStatus('idle'), 4000);
    };
    
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-[#0a0c16] border border-[#1e2336] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#1e2336] p-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Save className="w-5 h-5 text-[#8b7ff9]" />
            Data & Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1e2336] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-400 text-sm mb-6">
            Export your watch history, scores, and library to take your data with you, or import an existing backup to restore your progress.
          </p>

          <div className="flex flex-col gap-4">
            {/* Export Button */}
            <div className="bg-[#05060b] rounded-xl border border-[#1e2336] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-gray-200 font-semibold text-sm">Export Data</h3>
                  <p className="text-gray-500 text-xs mt-0.5">Save a local JSON copy</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[#2917d2]/10 border border-[#2917d2]/20 flex items-center justify-center">
                  <FileDown className="w-5 h-5 text-[#8b7ff9]" />
                </div>
              </div>
              <button
                onClick={handleExport}
                className="w-full h-11 flex items-center justify-center gap-2 bg-[#2917d2] hover:bg-[#3b27e8] text-white text-[14px] font-bold rounded-lg transition-all"
              >
                <Download className="w-4 h-4" />
                Download Backup
              </button>
            </div>

            {/* Import Button */}
            <div className="bg-[#05060b] rounded-xl border border-[#1e2336] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-gray-200 font-semibold text-sm">Import Data</h3>
                  <p className="text-gray-500 text-xs mt-0.5">Restore from a JSON file</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <FileUp className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
              
              <input 
                type="file"
                accept=".json,application/json"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImport}
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-11 flex items-center justify-center gap-2 border border-[#1e2336] bg-[#0a0c16] hover:bg-[#0f121d] hover:border-emerald-500/50 hover:text-emerald-400 text-gray-300 text-[14px] font-bold rounded-lg transition-all"
              >
                <Upload className="w-4 h-4" />
                Select Backup File
              </button>

              <AnimatePresence>
                {importStatus === 'success' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 text-emerald-400 text-xs font-medium bg-emerald-400/10 p-2 rounded-lg"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Data imported successfully!
                  </motion.div>
                )}
                {importStatus === 'error' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 text-red-400 text-xs font-medium bg-red-400/10 p-2 rounded-lg"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {errorMessage}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
