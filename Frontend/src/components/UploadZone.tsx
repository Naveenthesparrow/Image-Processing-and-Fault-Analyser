import React, { useCallback, useState } from 'react';
import { Image as ImageIcon, AlertCircle } from 'lucide-react';
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
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [handleFile]);

  return (
    <div className="w-full">
      <div
        className={`
          relative flex flex-col items-center w-full
          min-h-[280px] rounded-2xl border-2 border-dashed
          transition-all duration-300 group
          ${disabled
            ? 'opacity-50 cursor-not-allowed border-slate-300 bg-slate-50'
            : dragOver
              ? 'border-electric-blue bg-blue-50 scale-[1.01]'
              : 'border-slate-400 bg-white shadow-sm hover:border-blue-500 hover:shadow-md'
          }
        `}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={disabled ? undefined : onDrop}
        aria-label="Upload power pole image"
      >
        <div className="flex flex-col items-center gap-5 px-8 py-8 text-center w-full">
          {/* Text */}
          <div>
            <p className="text-xl font-semibold text-slate-900 mb-1">
              {dragOver ? 'Drop to analyse' : 'Upload pole image'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              JPG · PNG · WEBP &nbsp;·&nbsp; max {MAX_FILE_SIZE / 1024 / 1024} MB &nbsp;·&nbsp; min 320 px
            </p>
          </div>

          <div className="flex flex-col gap-4 w-full max-w-[240px] mt-4">
            <label
              htmlFor="gallery-input"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-slate-300 rounded-xl bg-white hover:bg-slate-50 hover:border-blue-400 cursor-pointer transition-all shadow-sm"
            >
              <ImageIcon size={20} className="text-slate-500" aria-hidden="true" />
              <span className="font-semibold text-slate-800 text-sm">Choose image</span>
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
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mt-3 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm"
        >
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
