import React, { useState, useEffect, useCallback } from 'react';
import { Settings, X, RotateCcw, Key, Server, MessageSquare, Info, ExternalLink, Image, Zap, RefreshCw, Loader2, Clock, LayoutGrid, Cpu, SlidersHorizontal, Monitor, History, Sun, Moon, Database, Trash2, Download, FileArchive } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { LLM_PROVIDERS, DEFAULT_SYSTEM_PROMPT, PROVIDER_INFO, SYSTEM_PROMPT_VERSION, fetchProviderModels, clearModelCache, type ModelInfo, getObjectiveKeyMap, DEFAULT_ANALYSIS_OBJECTIVES } from '../utils/llmService';
import { clearAllCaches, formatBytes, getGlobalCacheStats } from '../utils/analysisCache';
import type { LLMConfig, AnkiSettings, DisplaySettings, AnalysisObjective } from '../types';

type SettingsTab = 'provider' | 'analysis' | 'display' | 'anki' | 'caching';

export const SettingsPanel: React.FC = () => {
    const showSettings = useAppStore(state => state.showSettings);
    const setShowSettings = useAppStore(state => state.setShowSettings);
    const llmConfig = useAppStore(state => state.llmConfig);
    const setLLMConfig = useAppStore(state => state.setLLMConfig);
    const ankiSettings = useAppStore(state => state.ankiSettings);
    const setAnkiSettings = useAppStore(state => state.setAnkiSettings);
    const displaySettings = useAppStore(state => state.displaySettings);
    const setDisplaySettings = useAppStore(state => state.setDisplaySettings);

    // Helper to update config immediately
    const updateConfig = useCallback((updates: Partial<LLMConfig>) => {
        setLLMConfig({ ...llmConfig, ...updates });
    }, [llmConfig, setLLMConfig]);

    // Helper to update Anki settings
    const updateAnkiSettings = useCallback((updates: Partial<AnkiSettings>) => {
        setAnkiSettings({ ...ankiSettings, ...updates });
    }, [ankiSettings, setAnkiSettings]);

    // Helper to update Display settings
    const updateDisplaySettings = useCallback((updates: Partial<DisplaySettings>) => {
        setDisplaySettings({ ...displaySettings, ...updates });
    }, [displaySettings, setDisplaySettings]);
    const [showProviderInfo, setShowProviderInfo] = useState(false);
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<SettingsTab>('provider');
    const [globalCacheStats, setGlobalCacheStats] = useState<{ entryCount: number; sizeBytes: number; deckNames: string[] }>({ entryCount: 0, sizeBytes: 0, deckNames: [] });
    const [cacheRefreshKey, setCacheRefreshKey] = useState(0);

    const selectedProvider = LLM_PROVIDERS.find(p => p.id === llmConfig.providerId);
    const providerInfo = PROVIDER_INFO[llmConfig.providerId];
    const analysisObjectives = llmConfig.analysisObjectives;
    const analysisObjectiveKeyMap = getObjectiveKeyMap(analysisObjectives);

    // Get current API key for the selected provider (with backwards compatibility)
    const currentApiKey = llmConfig.apiKeys?.[llmConfig.providerId] ?? '';

    // Load cache info when caching tab is active (poll while open to reflect new analyses)
    useEffect(() => {
        if (activeTab !== 'caching') return;

        setGlobalCacheStats(getGlobalCacheStats());
        const intervalId = window.setInterval(() => {
            setGlobalCacheStats(getGlobalCacheStats());
        }, 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [activeTab, cacheRefreshKey]);

    // Fetch models when provider or API key changes
    const fetchModels = useCallback(async (forceRefresh = false) => {
        if (!selectedProvider) return;

        setIsLoadingModels(true);
        setModelsError(null);

        if (forceRefresh) {
            clearModelCache(llmConfig.providerId);
        }

        try {
            const models = await fetchProviderModels(
                llmConfig.providerId,
                currentApiKey,
                selectedProvider.baseUrl
            );
            setAvailableModels(models);

            // If current model is not in the list, select the first one
            if (models.length > 0 && !models.find(m => m.id === llmConfig.model)) {
                updateConfig({ model: models[0].id });
            }
        } catch (error) {
            setModelsError('Failed to fetch models');
            // Fall back to static list
            setAvailableModels(selectedProvider.models.map(id => ({ id })));
        } finally {
            setIsLoadingModels(false);
        }
    }, [llmConfig.providerId, llmConfig.model, currentApiKey, selectedProvider, updateConfig]);

    // Fetch models when provider changes or API key is entered
    useEffect(() => {
        // For providers that require API key, only fetch if key is present
        if (selectedProvider?.requiresApiKey && !currentApiKey) {
            // Show static list without fetching
            setAvailableModels(selectedProvider.models.map(id => ({ id })));
            return;
        }
        fetchModels();
    }, [llmConfig.providerId, currentApiKey, fetchModels, selectedProvider]);

    const handleApiKeyChange = (value: string) => {
        // Ensure apiKeys object exists (backwards compatibility)
        const existingKeys = llmConfig.apiKeys || {};
        updateConfig({
            apiKeys: {
                ...existingKeys,
                [llmConfig.providerId]: value
            }
        });
    };

    const updateObjective = (index: number, updates: Partial<AnalysisObjective>) => {
        const next = [...analysisObjectives];
        next[index] = { ...next[index], ...updates };
        updateConfig({ analysisObjectives: next });
    };

    const addObjective = () => {
        const next = [
            ...analysisObjectives,
            { label: 'New Objective', description: '' }
        ];
        updateConfig({ analysisObjectives: next });
    };

    const resetObjectives = () => {
        updateConfig({ analysisObjectives: DEFAULT_ANALYSIS_OBJECTIVES.map(obj => ({ ...obj })) });
    };

    const removeObjective = (index: number) => {
        if (analysisObjectives.length <= 1) return;
        const next = analysisObjectives.filter((_, i) => i !== index);
        updateConfig({ analysisObjectives: next });
    };

    const handleResetPrompt = () => {
        updateConfig({
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            systemPromptVersion: SYSTEM_PROMPT_VERSION
        });
    };

    if (!showSettings) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-16 overflow-y-auto"
            onClick={() => setShowSettings(false)}
        >
            <div
                className="bg-gray-800 rounded-xl w-full max-w-2xl overflow-hidden flex flex-col"
                style={{ minHeight: '500px' }}
                onClick={(e) => e.stopPropagation()}
            >
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

                {/* Tabs */}
                <div className="flex border-b border-gray-600">
                    <button
                        onClick={() => setActiveTab('provider')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'provider'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                            }`}
                    >
                        <Cpu className="w-4 h-4" />
                        LLM Provider
                    </button>
                    <button
                        onClick={() => setActiveTab('analysis')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'analysis'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                            }`}
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                        Analysis
                    </button>
                    <button
                        onClick={() => setActiveTab('display')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'display'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                            }`}
                    >
                        <Monitor className="w-4 h-4" />
                        Display
                    </button>
                    <button
                        onClick={() => setActiveTab('anki')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'anki'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                            }`}
                    >
                        <FileArchive className="w-4 h-4" />
                        Anki
                    </button>
                    <button
                        onClick={() => setActiveTab('caching')}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'caching'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                            }`}
                    >
                        <Database className="w-4 h-4" />
                        Caching
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Provider Tab */}
                    {activeTab === 'provider' && (
                        <>
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
                                    value={llmConfig.providerId}
                                    onChange={(e) => {
                                        const provider = LLM_PROVIDERS.find(p => p.id === e.target.value);
                                        updateConfig({
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
                                    value={llmConfig.model}
                                    onChange={(e) => updateConfig({ model: e.target.value })}
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
                        </>
                    )}

                    {/* Analysis Tab */}
                    {activeTab === 'analysis' && (
                        <>
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
                                    value={llmConfig.systemPrompt}
                                    onChange={(e) => updateConfig({ systemPrompt: e.target.value })}
                                    rows={10}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                />
                                <p className="mt-1 text-xs text-gray-400">
                                    This base prompt is sent to the LLM before analyzing each card. Analysis objectives and the response schema are added automatically below.
                                </p>
                            </div>

                            {/* Analysis Objectives */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                                        <SlidersHorizontal className="w-4 h-4" />
                                        Analysis Objectives
                                    </label>
                                    <button
                                        onClick={resetObjectives}
                                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        Reset to Default
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 mb-3">
                                    Define the evaluation criteria used by the LLM. Keep labels short (e.g., "Atomic") and descriptions precise and testable.
                                </p>
                                <div className="space-y-3">
                                    {analysisObjectives.map((objective, index) => (
                                        <div key={index} className="bg-gray-700 rounded-lg p-3 border border-gray-600">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Label</label>
                                                <input
                                                    type="text"
                                                    value={objective.label}
                                                    onChange={(e) => updateObjective(index, { label: e.target.value })}
                                                    className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                    placeholder="Atomic"
                                                />
                                                <p className="mt-1 text-xs text-gray-400 font-mono">
                                                    JSON key: {analysisObjectiveKeyMap[index]?.key}
                                                </p>
                                            </div>
                                            <div className="mt-2">
                                                <label className="block text-xs text-gray-400 mb-1">Description (sent to LLM)</label>
                                                <textarea
                                                    value={objective.description}
                                                    onChange={(e) => updateObjective(index, { description: e.target.value })}
                                                    className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                    rows={2}
                                                    placeholder="Tests exactly one fact or concept."
                                                />
                                            </div>
                                            <div className="mt-2">
                                                <div className="flex justify-end">
                                                    <button
                                                        onClick={() => removeObjective(index)}
                                                        disabled={analysisObjectives.length <= 1}
                                                        className="text-xs text-red-400 hover:text-red-300 disabled:text-gray-500"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-2 text-xs text-gray-400">
                                    The JSON key is derived from the label (prefix "is" + label without spaces).
                                </p>
                                <div className="mt-3">
                                    <button
                                        onClick={addObjective}
                                        className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700"
                                    >
                                        Add Objective
                                    </button>
                                </div>
                            </div>

                            {/* Send Images Toggle */}
                            <div>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                                        <Image className="w-4 h-4" />
                                        Send Images to LLM
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={llmConfig.sendImages}
                                        onChange={(e) => updateConfig({ sendImages: e.target.checked })}
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
                                        checked={llmConfig.concurrentDeckAnalysis}
                                        onChange={(e) => updateConfig({ concurrentDeckAnalysis: e.target.checked })}
                                        className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                                    />
                                </label>
                                <p className="mt-1 text-xs text-gray-400">
                                    When enabled, multiple cards are analyzed simultaneously (faster but uses more API calls at once). When disabled, cards are analyzed one at a time (slower but less likely to be rate limited by the LLM provider).
                                </p>
                            </div>


                            {/* Request Delay (Rate Limiting) */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                                    <Clock className="w-4 h-4" />
                                    Request Delay (seconds)
                                    <button
                                        onClick={() => { }}
                                        className="p-1 rounded-full hover:bg-gray-600 text-gray-400 transition-colors cursor-help"
                                        title="Free tier API plans often have strict rate limits (e.g., 30 requests per minute). This delay helps avoid hitting those limits during deck analysis. If you get rate limit errors, increase this value."
                                    >
                                        <Info className="w-3.5 h-3.5" />
                                    </button>
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    max={60}
                                    step={0.5}
                                    value={(llmConfig.requestDelayMs || 2000) / 1000}
                                    onChange={(e) => updateConfig({ requestDelayMs: Math.max(0, Math.min(60000, parseFloat(e.target.value) * 1000 || 2000)) })}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-400">
                                    Delay between API requests during deck analysis. Free tier providers often have strict rate limits (e.g., Groq: 30 req/min). If you encounter rate limit errors, increase this value.
                                </p>
                            </div>
                        </>
                    )}

                    {/* Display Tab */}
                    {activeTab === 'display' && (
                        <>
                            {/* Dark Mode Toggle */}
                            <div>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                                        {displaySettings.darkMode !== false ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                                        Dark Mode
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={displaySettings.darkMode !== false}
                                        onChange={(e) => updateDisplaySettings({ darkMode: e.target.checked })}
                                        className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                                    />
                                </label>
                                <p className="mt-1 text-xs text-gray-400">
                                    Toggle between dark and light theme. Dark mode is easier on the eyes in low-light environments.
                                </p>
                            </div>

                            {/* Suggested Cards Layout */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                                    <LayoutGrid className="w-4 h-4" />
                                    Suggested Cards Layout
                                </label>
                                <select
                                    value={displaySettings.suggestedCardsLayout || 'carousel'}
                                    onChange={(e) => updateDisplaySettings({ suggestedCardsLayout: e.target.value as 'carousel' | 'list' })}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="carousel">Carousel (swipe through cards)</option>
                                    <option value="list">Vertical List (show all cards)</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-400">
                                    Choose how suggested replacement cards are displayed. Carousel shows one card at a time with navigation; List shows all cards stacked vertically.
                                </p>
                            </div>

                            {/* Developer Mode */}
                            <div>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                                        <Cpu className="w-4 h-4" />
                                        Developer Mode
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={displaySettings.developerMode || false}
                                        onChange={(e) => updateDisplaySettings({ developerMode: e.target.checked })}
                                        className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                                    />
                                </label>
                                <p className="mt-1 text-xs text-gray-400">
                                    Show a console panel with LLM requests, responses, and timing information.
                                </p>
                            </div>
                        </>
                    )}

                    {/* Anki Tab */}
                    {activeTab === 'anki' && (
                        <>
                            {/* Inherit Card Metadata */}
                            <div>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                                        <History className="w-4 h-4" />
                                        Inherit Scheduling Data
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={ankiSettings.inheritCardMetadata || false}
                                        onChange={(e) => updateAnkiSettings({ inheritCardMetadata: e.target.checked })}
                                        className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                                    />
                                </label>
                                <p className="mt-1 text-xs text-gray-400">
                                    When adding a suggested replacement card, inherit the scheduling metadata (interval, ease factor, repetitions, lapses) from the original card. By default, new cards start fresh with no review history.
                                </p>
                            </div>

                            {/* Export Media Format */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                                    <Download className="w-4 h-4" />
                                    Export Media Format
                                    <button
                                        onClick={() => { }}
                                        className="p-1 rounded-full hover:bg-gray-600 text-gray-400 transition-colors cursor-help"
                                        title="The modern protobuf format requires additional package metadata that is not yet fully supported. Use legacy JSON for compatibility with all Anki versions."
                                    >
                                        <Info className="w-3.5 h-3.5" />
                                    </button>
                                </label>
                                <select
                                    value={ankiSettings.exportMediaFormat || 'legacy'}
                                    onChange={(e) => updateAnkiSettings({ exportMediaFormat: e.target.value as 'legacy' | 'modern' })}
                                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="legacy">Legacy JSON (recommended)</option>
                                    <option value="modern">Modern Protobuf (experimental)</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-400">
                                    Legacy JSON format is recommended for maximum compatibility. Modern Protobuf format is experimental and may not work with all Anki versions.
                                </p>
                            </div>
                        </>
                    )}

                    {/* Caching Tab */}
                    {activeTab === 'caching' && (
                        <>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
                                    <Database className="w-5 h-5" />
                                    Analysis Cache
                                </h3>
                                <p className="text-sm text-gray-400 mb-4">
                                    Analysis results are cached in your browser using a hash of the deck name and card content. This means cached results can be reused across different deck files when the content matches exactly.
                                </p>

                                {/* Global cache stats */}
                                <div className="bg-gray-700 rounded-lg p-4 mb-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-medium text-gray-300">Cache Size</div>
                                            <div className="text-2xl font-bold text-blue-400">{formatBytes(globalCacheStats.sizeBytes)}</div>
                                            <div className="text-xs text-gray-400">
                                                {globalCacheStats.entryCount} cached analyses
                                                {globalCacheStats.deckNames.length > 0 && ` across ${globalCacheStats.deckNames.length} deck(s)`}
                                            </div>
                                        </div>
                                        {globalCacheStats.entryCount > 0 && (
                                            <button
                                                onClick={() => {
                                                    if (confirm('Are you sure you want to clear all cached analyses? This cannot be undone.')) {
                                                        clearAllCaches();
                                                        setCacheRefreshKey(k => k + 1);
                                                    }
                                                }}
                                                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Clear All
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Deck names in cache */}
                                {globalCacheStats.entryCount === 0 ? (
                                    <div className="text-center py-8 text-gray-500">
                                        <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p>No cached analyses yet</p>
                                        <p className="text-sm mt-1">Analyze cards to populate the cache</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="text-sm font-medium text-gray-400 mb-2">Decks with Cached Analyses</div>
                                        <div className="bg-gray-700 rounded-lg p-3">
                                            <div className="flex flex-wrap gap-2">
                                                {globalCacheStats.deckNames.map((deckName) => (
                                                    <span
                                                        key={deckName}
                                                        className="px-2 py-1 bg-gray-600 rounded text-xs text-gray-300"
                                                        title={deckName}
                                                    >
                                                        {deckName.length > 40 ? deckName.slice(0, 40) + '...' : deckName}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">
                                            Cache entries are matched by deck name and card content hash, allowing analyses to be shared across different deck files.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

            </div>
        </div>
    );
};

