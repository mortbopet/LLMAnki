import React, { useState } from 'react';
import { Settings, X, Save, RotateCcw, Key, Server, MessageSquare, Info, ExternalLink } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { LLM_PROVIDERS, DEFAULT_SYSTEM_PROMPT, PROVIDER_INFO } from '../utils/llmService';

export const SettingsPanel: React.FC = () => {
  const showSettings = useAppStore(state => state.showSettings);
  const setShowSettings = useAppStore(state => state.setShowSettings);
  const llmConfig = useAppStore(state => state.llmConfig);
  const setLLMConfig = useAppStore(state => state.setLLMConfig);
  
  const [localConfig, setLocalConfig] = useState(llmConfig);
  const [showProviderInfo, setShowProviderInfo] = useState(false);
  
  const selectedProvider = LLM_PROVIDERS.find(p => p.id === localConfig.providerId);
  const providerInfo = PROVIDER_INFO[localConfig.providerId];
  
  const handleSave = () => {
    setLLMConfig(localConfig);
    setShowSettings(false);
  };
  
  const handleResetPrompt = () => {
    setLocalConfig({ ...localConfig, systemPrompt: DEFAULT_SYSTEM_PROMPT });
  };
  
  if (!showSettings) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Settings
          </h2>
          <button
            onClick={() => setShowSettings(false)}
            className="p-1 hover:bg-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* LLM Provider */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
              <Server className="w-4 h-4" />
              LLM Provider
              <button
                onClick={() => setShowProviderInfo(!showProviderInfo)}
                className={`p-1 rounded-full transition-colors ${showProviderInfo ? 'bg-blue-600 text-white' : 'hover:bg-gray-600 text-gray-400'}`}
                title="Show provider info"
              >
                <Info className="w-4 h-4" />
              </button>
            </label>
            <select
              value={localConfig.providerId}
              onChange={(e) => {
                const provider = LLM_PROVIDERS.find(p => p.id === e.target.value);
                setLocalConfig({
                  ...localConfig,
                  providerId: e.target.value,
                  model: provider?.models[0] || ''
                });
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {LLM_PROVIDERS.map(provider => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              {selectedProvider?.requiresApiKey ? 'Requires API key' : 'No API key required (local)'}
            </p>
            
            {/* Provider Info Panel */}
            {showProviderInfo && providerInfo && (
              <div className="mt-3 p-4 bg-gray-700 rounded-lg border border-gray-600 space-y-3">
                <p className="text-sm text-gray-300">{providerInfo.description}</p>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400">Pricing:</span>
                  <span className="text-xs text-gray-300">{providerInfo.pricing}</span>
                </div>
                
                <div>
                  <span className="text-xs font-medium text-gray-400 block mb-1">How to get an API key:</span>
                  <p className="text-xs text-gray-300 whitespace-pre-line">{providerInfo.apiKeyInstructions}</p>
                </div>
                
                <a
                  href={providerInfo.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {selectedProvider?.requiresApiKey ? 'Get API Key' : 'Download Ollama'}
                </a>
              </div>
            )}
          </div>
          
          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Model
            </label>
            <select
              value={localConfig.model}
              onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {selectedProvider?.models.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
          
          {/* API Key */}
          {selectedProvider?.requiresApiKey && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <Key className="w-4 h-4" />
                API Key
              </label>
              <input
                type="password"
                value={localConfig.apiKey}
                onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                placeholder={`Enter your ${selectedProvider.name} API key`}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Your API key is stored locally in your browser and never sent to any server except the LLM provider.
              </p>
            </div>
          )}
          
          {/* System Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <MessageSquare className="w-4 h-4" />
                System Prompt
              </label>
              <button
                onClick={handleResetPrompt}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to Default
              </button>
            </div>
            <textarea
              value={localConfig.systemPrompt}
              onChange={(e) => setLocalConfig({ ...localConfig, systemPrompt: e.target.value })}
              rows={12}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">
              This prompt is sent to the LLM before analyzing each card. Customize it to change the analysis criteria.
            </p>
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 bg-gray-700 flex justify-end gap-3">
          <button
            onClick={() => setShowSettings(false)}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
