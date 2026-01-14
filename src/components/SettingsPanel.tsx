import React, { useState, useEffect, useCallback } from 'react';
import { Settings, X, Save, RotateCcw, Key, Server, MessageSquare, Info, ExternalLink, Image, Layers, Zap, RefreshCw, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { LLM_PROVIDERS, DEFAULT_SYSTEM_PROMPT, PROVIDER_INFO, SYSTEM_PROMPT_VERSION, fetchProviderModels, clearModelCache, type ModelInfo } from '../utils/llmService';

export const SettingsPanel: React.FC = () => {
    const showSettings = useAppStore(state => state.showSettings);
    const setShowSettings = useAppStore(state => state.setShowSettings);
    const llmConfig = useAppStore(state => state.llmConfig);
    const setLLMConfig = useAppStore(state => state.setLLMConfig);

    const [localConfig, setLocalConfig] = useState(llmConfig);
    const [showProviderInfo, setShowProviderInfo] = useState(false);
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [modelsError, setModelsError] = useState<string | null>(null);

    const selectedProvider = LLM_PROVIDERS.find(p => p.id === localConfig.providerId);
    const providerInfo = PROVIDER_INFO[localConfig.providerId];

    // Get current API key for the selected provider (with backwards compatibility)
    const currentApiKey = localConfig.apiKeys?.[localConfig.providerId] || (localConfig as any).apiKey || '';

    // Fetch models when provider or API key changes
    const fetchModels = useCallback(async (forceRefresh = false) => {
        if (!selectedProvider) return;

        setIsLoadingModels(true);
        setModelsError(null);

        if (forceRefresh) {
            clearModelCache(localConfig.providerId);
        }

        try {
            const models = await fetchProviderModels(
                localConfig.providerId,
                currentApiKey,
                selectedProvider.baseUrl
            );
            setAvailableModels(models);

            // If current model is not in the list, select the first one
            if (models.length > 0 && !models.find(m => m.id === localConfig.model)) {
                setLocalConfig(prev => ({ ...prev, model: models[0].id }));
            }
        } catch (error) {
            setModelsError('Failed to fetch models');
            // Fall back to static list
            setAvailableModels(selectedProvider.models.map(id => ({ id })));
        } finally {
            setIsLoadingModels(false);
        }
    }, [localConfig.providerId, currentApiKey, selectedProvider, localConfig.model]);

    // Fetch models when provider changes or API key is entered
    useEffect(() => {
        // For providers that require API key, only fetch if key is present
        if (selectedProvider?.requiresApiKey && !currentApiKey) {
            // Show static list without fetching
            setAvailableModels(selectedProvider.models.map(id => ({ id })));
            return;
        }
        fetchModels();
    }, [localConfig.providerId, currentApiKey, fetchModels, selectedProvider]);

    const handleApiKeyChange = (value: string) => {
        // Ensure apiKeys object exists (backwards compatibility)
        const existingKeys = localConfig.apiKeys || {};
        setLocalConfig({
            ...localConfig,
            apiKeys: {
                ...existingKeys,
                [localConfig.providerId]: value
            }
        });
    };

    const handleSave = () => {
        setLLMConfig(localConfig);
        setShowSettings(false);
    };

    const handleResetPrompt = () => {
        setLocalConfig({ 
            ...localConfig, 
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            systemPromptVersion: SYSTEM_PROMPT_VERSION
        });
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
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                            Model
                            <button
                                onClick={() => fetchModels(true)}
                                disabled={isLoadingModels}
                                className="p-1 rounded-full hover:bg-gray-600 text-gray-400 transition-colors disabled:opacity-50"
                                title="Refresh model list"
                            >
                                {isLoadingModels ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-3.5 h-3.5" />
                                )}
                            </button>
                        </label>
                        <select
                            value={localConfig.model}
                            onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={isLoadingModels}
                        >
                            {availableModels.map(model => (
                                <option key={model.id} value={model.id}>
                                    {model.name || model.id}
                                    {model.contextWindow ? ` (${Math.round(model.contextWindow / 1000)}k ctx)` : ''}
                                </option>
                            ))}
                        </select>
                        {modelsError && (
                            <p className="mt-1 text-xs text-red-400">{modelsError}</p>
                        )}
                        {availableModels.length > 0 && !modelsError && (
                            <p className="mt-1 text-xs text-gray-400">
                                {availableModels.length} models available
                                {selectedProvider?.requiresApiKey && !currentApiKey && ' (enter API key to see all)'}
                            </p>
                        )}
                    </div>

                    {/* API Key */}
                    {selectedProvider?.requiresApiKey && (
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                                <Key className="w-4 h-4" />
                                API Key for {selectedProvider.name}
                            </label>
                            <input
                                type="text"
                                value={currentApiKey}
                                onChange={(e) => handleApiKeyChange(e.target.value)}
                                placeholder={`Enter your ${selectedProvider.name} API key`}
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="mt-1 text-xs text-gray-400">
                                API keys are stored per provider. Your key is stored locally and only sent to {selectedProvider.name}.
                            </p>
                        </div>
                    )}

                    {/* Send Images Toggle */}
                    <div>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                                <Image className="w-4 h-4" />
                                Send Images to LLM
                            </div>
                            <input
                                type="checkbox"
                                checked={localConfig.sendImages}
                                onChange={(e) => setLocalConfig({ ...localConfig, sendImages: e.target.checked })}
                                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                            />
                        </label>
                        <p className="mt-1 text-xs text-gray-400">
                            When enabled, images are converted to base64 and sent for visual analysis. When disabled, image tags are preserved but content is not analyzed.
                        </p>
                    </div>

                    {/* Concurrent Deck Analysis Toggle */}
                    <div>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                                <Zap className="w-4 h-4" />
                                Concurrent Deck Analysis
                            </div>
                            <input
                                type="checkbox"
                                checked={localConfig.concurrentDeckAnalysis}
                                onChange={(e) => setLocalConfig({ ...localConfig, concurrentDeckAnalysis: e.target.checked })}
                                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                            />
                        </label>
                        <p className="mt-1 text-xs text-gray-400">
                            When enabled, multiple cards are analyzed simultaneously (faster but uses more API calls at once). When disabled, cards are analyzed one at a time (slower but more controlled).
                        </p>
                    </div>

                    {/* Max Cards for Deck Analysis */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                            <Layers className="w-4 h-4" />
                            Max Cards for Deck Analysis
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={500}
                            value={localConfig.maxDeckAnalysisCards}
                            onChange={(e) => setLocalConfig({ ...localConfig, maxDeckAnalysisCards: Math.max(1, Math.min(500, parseInt(e.target.value) || 50)) })}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-400">
                            Maximum number of cards to analyze when running deck-level analysis (1-500). Higher values provide more comprehensive analysis but cost more API calls.
                        </p>
                    </div>

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
