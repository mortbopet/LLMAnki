import React, { useState } from 'react';
import { AlertCircle, Server, Clock, Key, Wifi, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { type LLMError, type LLMErrorType } from '../utils/llmService';

interface ErrorDisplayProps {
    error: string | LLMError;
    onDismiss?: () => void;
}

// Parse error string to extract LLMError-like info
function parseErrorString(error: string): { type: LLMErrorType; message: string } {
    const lowerError = error.toLowerCase();

    if (lowerError.includes('rate limit') || lowerError.includes('rate_limit') ||
        lowerError.includes('too many requests') || lowerError.includes('429')) {
        return { type: 'rate_limit', message: error };
    }
    if (lowerError.includes('unauthorized') || lowerError.includes('invalid api key') ||
        lowerError.includes('authentication') || lowerError.includes('401')) {
        return { type: 'auth_error', message: error };
    }
    if (lowerError.includes('econnrefused') || lowerError.includes('network') ||
        lowerError.includes('failed to fetch')) {
        return { type: 'connection_error', message: error };
    }
    if (lowerError.includes('model') && lowerError.includes('not found')) {
        return { type: 'model_not_found', message: error };
    }
    if (lowerError.includes('context length') || lowerError.includes('token limit')) {
        return { type: 'context_length_exceeded', message: error };
    }

    return { type: 'unknown', message: error };
}

const errorIcons: Record<LLMErrorType, React.ReactNode> = {
    rate_limit: <Clock className="w-5 h-5 text-yellow-500" />,
    auth_error: <Key className="w-5 h-5 text-red-500" />,
    connection_error: <Wifi className="w-5 h-5 text-orange-500" />,
    model_not_found: <Server className="w-5 h-5 text-purple-500" />,
    context_length_exceeded: <AlertCircle className="w-5 h-5 text-blue-500" />,
    server_error: <Server className="w-5 h-5 text-red-500" />,
    unknown: <HelpCircle className="w-5 h-5 text-gray-500" />
};

const errorTitles: Record<LLMErrorType, string> = {
    rate_limit: 'Rate Limit Exceeded',
    auth_error: 'Authentication Error',
    connection_error: 'Connection Error',
    model_not_found: 'Model Not Found',
    context_length_exceeded: 'Content Too Long',
    server_error: 'Server Error',
    unknown: 'Analysis Error'
};

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onDismiss }) => {
    const setShowSettings = useAppStore(state => state.setShowSettings);

    const [showDetails, setShowDetails] = useState(true); // Expanded by default

    // Determine error type and info
    const isLLMError = typeof error !== 'string' && 'type' in error;
    const errorType = isLLMError ? error.type : parseErrorString(error as string).type;
    const errorMessage = isLLMError ? error.message : error;
    const suggestion = isLLMError ? error.suggestion : undefined;
    const retryAfter = isLLMError ? error.retryAfter : undefined;

    const handleOpenSettings = () => {
        setShowSettings(true);
    };

    return (
        <div className={`rounded-lg border p-4 ${errorType === 'rate_limit' ? 'bg-yellow-900/30 border-yellow-700' :
                errorType === 'auth_error' ? 'bg-red-900/30 border-red-700' :
                    errorType === 'connection_error' ? 'bg-orange-900/30 border-orange-700' :
                        'bg-red-900/30 border-red-700'
            }`}>
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                    {errorIcons[errorType]}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                        <p className={`font-medium ${errorType === 'rate_limit' ? 'text-yellow-400' :
                                errorType === 'connection_error' ? 'text-orange-400' :
                                    'text-red-400'
                            }`}>
                            {errorTitles[errorType]}
                        </p>
                        {onDismiss && (
                            <button
                                onClick={onDismiss}
                                className="text-gray-400 hover:text-white text-sm"
                            >
                                Dismiss
                            </button>
                        )}
                    </div>

                    {/* Suggestion */}
                    {suggestion && (
                        <p className="text-sm text-gray-300 mt-1">{suggestion}</p>
                    )}

                    {/* Retry after info */}
                    {retryAfter && (
                        <p className="text-sm text-gray-400 mt-1">
                            You can retry in {retryAfter} seconds.
                        </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-3">
                        {errorType === 'auth_error' && (
                            <button
                                onClick={handleOpenSettings}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
                            >
                                Open Settings
                            </button>
                        )}

                        {/* Show details toggle */}
                        <button
                            onClick={() => setShowDetails(!showDetails)}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300"
                        >
                            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {showDetails ? 'Hide details' : 'Show details'}
                        </button>
                    </div>

                    {/* Full error details */}
                    {showDetails && (
                        <pre className="mt-2 p-2 bg-gray-900 rounded text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap">
                            {errorMessage}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
};
