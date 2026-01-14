import React, { useCallback } from 'react';
import { Upload, FileText } from 'lucide-react';
import { parseApkgFile } from '../utils/ankiParser';
import { useAppStore } from '../store/useAppStore';

export const FileUpload: React.FC = () => {
  const setCollection = useAppStore(state => state.setCollection);
  const fileName = useAppStore(state => state.fileName);
  
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const collection = await parseApkgFile(file);
      setCollection(collection, file.name);
    } catch (error) {
      console.error('Failed to parse APKG file:', error);
      alert(`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [setCollection]);
  
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.apkg')) {
      alert('Please drop a valid .apkg file');
      return;
    }
    
    try {
      const collection = await parseApkgFile(file);
      setCollection(collection, file.name);
    } catch (error) {
      console.error('Failed to parse APKG file:', error);
      alert(`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [setCollection]);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);
  
  if (fileName) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg">
        <FileText className="w-4 h-4 text-blue-400" />
        <span className="text-sm text-gray-200 truncate max-w-[200px]">{fileName}</span>
        <button
          onClick={() => setCollection(null, null)}
          className="ml-2 text-xs text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>
    );
  }
  
  return (
    <label
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition-colors"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <Upload className="w-4 h-4" />
      <span className="text-sm font-medium">Load .apkg</span>
      <input
        type="file"
        accept=".apkg"
        onChange={handleFileChange}
        className="hidden"
      />
    </label>
  );
};
