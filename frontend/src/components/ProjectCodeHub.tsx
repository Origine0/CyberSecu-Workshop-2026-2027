import React, { useState } from 'react';
import JSZip from 'jszip';
import { 
  Download, 
  Copy, 
  Check 
} from 'lucide-react';
import { WORKSHOP_FILES } from '../data/workshopFiles.ts';
import { ProjectSourceFile } from '../types/index.ts';

export const ProjectCodeHub: React.FC = () => {
  const [selectedFileId, setSelectedFileId] = useState<string>(WORKSHOP_FILES[0].id);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const selectedFile: ProjectSourceFile =
    WORKSHOP_FILES.find((f) => f.id === selectedFileId) || WORKSHOP_FILES[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      const zip = new JSZip();
      WORKSHOP_FILES.forEach((file) => {
        zip.file(file.path, file.content);
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Workshop2026-M2-G-Code-Sprint1.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950">
            Fichiers sources
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-normal">
            Docker Compose, PostgreSQL init.sql, FastAPI et Next.js
          </p>
        </div>

        <button
          onClick={handleDownloadZip}
          disabled={downloading}
          className="px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs flex items-center gap-1.5 transition-all self-start sm:self-auto shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{downloading ? 'Génération...' : 'Télécharger (.zip)'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left: Files */}
        <div className="md:col-span-4 bg-white p-2.5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-1">
          {WORKSHOP_FILES.map((file) => {
            const isSelected = file.id === selectedFileId;
            return (
              <button
                key={file.id}
                onClick={() => setSelectedFileId(file.id)}
                className={`w-full px-3 py-2 rounded-xl text-left text-xs transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-zinc-950 text-white font-medium'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
                }`}
              >
                <span className="truncate">{file.path}</span>
                <span className="text-[10px] opacity-60 uppercase">{file.language}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Code */}
        <div className="md:col-span-8 bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <span className="text-xs font-semibold text-zinc-950">{selectedFile.path}</span>
            <button
              onClick={handleCopy}
              className="text-xs text-zinc-500 hover:text-zinc-900 flex items-center gap-1 font-medium"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
              <span>{copied ? 'Copié' : 'Copier'}</span>
            </button>
          </div>

          <pre className="p-4 rounded-xl bg-zinc-950 text-zinc-200 text-xs overflow-x-auto max-h-[500px] leading-relaxed">
            <code>{selectedFile.content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
