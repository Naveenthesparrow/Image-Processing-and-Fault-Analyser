import React, { useCallback, useState } from 'react';
import { Image as ImageIcon, AlertCircle, Upload } from 'lucide-react';
import { MAX_FILE_SIZE } from '../config/settings';

interface UploadZoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function UploadZone({ onFile, disabled }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

  const handleFile = useCallback((file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG, or WEBP).');
      return;
    }
    onFile(file);
  }, [onFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  return (
    <div className="w-full">
      <div
        className={`
          relative flex flex-col items-center w-full
          min-h-[320px] rounded-2xl border-2 border-dashed
          transition-all duration-300 group
          ${disabled
            ? 'opacity-40 cursor-not-allowed border-slate-700 bg-slate-900/40'
            : dragOver
              ? 'border-blue-500 bg-blue-950/30 scale-[1.01] shadow-[0_0_40px_-5px_rgba(59,130,246,0.3)]'
              : 'border-slate-700 bg-slate-900/40 hover:border-blue-600/60 hover:bg-slate-900/60 hover:shadow-[0_0_30px_-5px_rgba(59,130,246,0.15)]'
          }
        `}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={disabled ? undefined : onDrop}
        aria-label="Upload power pole image"
      >
        {/* Grid bg pattern */}
        <div
          className="absolute inset-0 rounded-2xl bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative flex flex-col items-center gap-6 px-8 py-12 text-center w-full">
          {/* Icon */}
          <div className={`
            p-5 rounded-2xl border transition-all duration-300
            ${dragOver
              ? 'bg-blue-600/20 border-blue-500/40 text-blue-400 scale-110'
              : 'bg-slate-800/60 border-slate-700/60 text-slate-500 group-hover:text-blue-400 group-hover:border-blue-600/40 group-hover:bg-blue-950/20'
            }
          `}>
            <Upload size={36} aria-hidden="true" />
          </div>

          {/* Text */}
          <div>
            <p className="text-xl font-bold text-slate-200 mb-1">
              {dragOver ? 'Drop to analyse' : 'Upload pole image'}
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">
              Drag & drop or click to choose a file
            </p>
            <p className="mt-1.5 text-xs text-slate-600">
              JPG · PNG · WEBP &nbsp;·&nbsp; max {MAX_FILE_SIZE / 1024 / 1024} MB &nbsp;·&nbsp; RGB images only
            </p>
          </div>

          {/* Button */}
          <label
            htmlFor="gallery-input"
            className={`
              flex items-center justify-center gap-2 py-3 px-6
              border rounded-xl cursor-pointer transition-all font-semibold text-sm
              ${disabled
                ? 'opacity-50 cursor-not-allowed border-slate-700 text-slate-500 bg-slate-800'
                : 'border-blue-600/50 bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 hover:border-blue-500 hover:text-blue-200 hover:shadow-md active:scale-95'
              }
            `}
          >
            <ImageIcon size={18} className="" aria-hidden="true" />
            <span>Choose image</span>
            <input
              id="gallery-input"
              type="file"
              accept={accept}
              className="sr-only"
              onChange={disabled ? undefined : onInputChange}
              disabled={disabled}
            />
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mt-3 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-950/50 border border-red-800/50 text-red-400 text-sm"
        >
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
