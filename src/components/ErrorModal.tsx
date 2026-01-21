import React from 'react';
import { X, AlertCircle, Server, Clock, Key, Wifi, HelpCircle, ExternalLink } from 'lucide-react';
import { JsonViewer } from '@textea/json-viewer';
import { useAppStore } from '../store/useAppStore';
import { LLM_PROVIDERS, type LLMErrorType } from '../utils/llmService';

interface ErrorModalProps {
    error: string;
    onClose: () => void;
}

// Parse error string to extract error type
function parseErrorType(error: string): LLMErrorType {
    const lowerError = error.toLowerCase();

    if (lowerError.includes('rate limit') || lowerError.includes('rate_limit') ||
        lowerError.includes('too many requests') || lowerError.includes('429')) {
        return 'rate_limit';
    }
    if (lowerError.includes('unauthorized') || lowerError.includes('invalid api key') ||
        lowerError.includes('authentication') || lowerError.includes('401') ||
        lowerError.includes('api key')) {
        return 'auth_error';
    }
    if (lowerError.includes('econnrefused') || lowerError.includes('network') ||
        lowerError.includes('failed to fetch') || lowerError.includes('connection')) {
        return 'connection_error';
    }
    if (lowerError.includes('model') && lowerError.includes('not found')) {
        return 'model_not_found';
    }
    if (lowerError.includes('context length') || lowerError.includes('token limit')) {
        return 'context_length_exceeded';
    }
    if (lowerError.includes('500') || lowerError.includes('server error')) {
        return 'server_error';
    }

    return 'unknown';
}

function extractJsonPayload(error: string): unknown | null {
    try {
        return JSON.parse(error);
    } catch {
        // Continue with extraction attempts
    }

    const apiErrorIndex = error.toLowerCase().indexOf('api error');
    const scanStart = apiErrorIndex >= 0 ? apiErrorIndex : 0;
    const startIndex = error.indexOf('{', scanStart);
    const endIndex = error.lastIndexOf('}');

    if (startIndex < 0 || endIndex <= startIndex) return null;

    const candidate = error.slice(startIndex, endIndex + 1);
    try {
        return JSON.parse(candidate);
    } catch {
        return null;
    }
}

const errorIcons: Record<LLMErrorType, React.ReactNode> = {
    rate_limit: <Clock className="w-8 h-8 text-yellow-500" />,
    auth_error: <Key className="w-8 h-8 text-red-500" />,
    connection_error: <Wifi className="w-8 h-8 text-orange-500" />,
    model_not_found: <Server className="w-8 h-8 text-purple-500" />,
    context_length_exceeded: <AlertCircle className="w-8 h-8 text-blue-500" />,
    server_error: <Server className="w-8 h-8 text-red-500" />,
    unknown: <HelpCircle className="w-8 h-8 text-gray-500" />
};

const errorTitles: Record<LLMErrorType, string> = {
    rate_limit: 'Rate Limit Exceeded',
    auth_error: 'Authentication Error',
    connection_error: 'Connection Error',
    model_not_found: 'Model Not Found',
    context_length_exceeded: 'Content Too Long',
    server_error: 'Server Error',
    unknown: 'An Error Occurred'
};

const errorColors: Record<LLMErrorType, string> = {
    rate_limit: 'border-yellow-500',
    auth_error: 'border-red-500',
    connection_error: 'border-orange-500',
    model_not_found: 'border-purple-500',
    context_length_exceeded: 'border-blue-500',
    server_error: 'border-red-500',
    unknown: 'border-gray-500'
};

export const ErrorModal: React.FC<ErrorModalProps> = ({ error, onClose }) => {
    const llmConfig = useAppStore(state => state.llmConfig);
    const setShowSettings = useAppStore(state => state.setShowSettings);

    const errorType = parseErrorType(error);
    const provider = LLM_PROVIDERS.find(p => p.id === llmConfig.providerId);
    const parsedJson = errorType === 'rate_limit' ? extractJsonPayload(error) : null;

    const getSuggestion = (): { text: string; action?: () => void; actionLabel?: string } => {
        switch (errorType) {
            case 'rate_limit':
                return {
                    text: `You've exceeded the rate limit for ${provider?.name || 'this provider'}. Wait a few minutes before trying again, or switch to a different provider.`,
                    action: () => { setShowSettings(true); onClose(); },
                    actionLabel: 'Open Settings'
                };
            case 'auth_error':
                return {
                    text: 'Your API key appears to be invalid or expired. Please check your API key in Settings.',
                    action: () => { setShowSettings(true); onClose(); },
                    actionLabel: 'Check API Key'
                };
            case 'connection_error':
                if (llmConfig.providerId === 'ollama') {
                    return {
                        text: 'Cannot connect to Ollama. Make sure Ollama is running locally (run "ollama serve" in a terminal).'
                    };
                }
                return {
                    text: 'Cannot connect to the API. Check your internet connection or try again later.'
                };
            case 'model_not_found':
                if (llmConfig.providerId === 'ollama') {
                    return {
                        text: `Model "${llmConfig.model}" not found. Run "ollama pull ${llmConfig.model}" to download it.`
                    };
                }
                return {
                    text: 'The selected model is not available. Try selecting a different model in Settings.',
                    action: () => { setShowSettings(true); onClose(); },
                    actionLabel: 'Change Model'
                };
            case 'context_length_exceeded':
                return {
                    text: 'The card content is too long for this model. Try a model with a larger context window or simplify the card.'
                };
            case 'server_error':
                return {
                    text: 'The API server is experiencing issues. Try again later or switch to a different provider.',
                    action: () => { setShowSettings(true); onClose(); },
                    actionLabel: 'Switch Provider'
                };
            default:
                return {
                    text: 'An unexpected error occurred. Please try again or check the console for more details.'
                };
        }
    };

    const suggestion = getSuggestion();

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full border-l-4 ${errorColors[errorType]}`}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        {errorIcons[errorType]}
                        <h2 className="text-lg font-semibold text-white">{errorTitles[errorType]}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4 space-y-4">
                    {/* Provider info */}
                    {provider && (
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <span>Provider:</span>
                            <span className="text-gray-200 font-medium">{provider.name}</span>
                            {llmConfig.model && (
                                <>
                                    <span>•</span>
                                    <span>Model:</span>
                                    <span className="text-gray-200 font-medium">{llmConfig.model}</span>
                                </>
                            )}
                        </div>
                    )}

                    {/* Error message */}
                    <div className="bg-gray-900/50 rounded-lg p-4">
                        {parsedJson ? (
                            <JsonViewer value={parsedJson} defaultInspectDepth={2} theme="dark" />
                        ) : (
                            <p className="text-sm text-gray-300 font-mono break-words">{error}</p>
                        )}
                    </div>

                    {/* Suggestion */}
                    <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4">
                        <p className="text-sm text-gray-300">{suggestion.text}</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
                    {suggestion.action && suggestion.actionLabel && (
                        <button
                            onClick={suggestion.action}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                        >
                            <ExternalLink className="w-4 h-4" />
                            {suggestion.actionLabel}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
};
