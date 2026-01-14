import React, { useCallback } from 'react';
import { 
  Sparkles, 
  Settings, 
  Download, 
  Wand2,
  Loader2,
  AlertCircle,
  BookOpen
} from 'lucide-react';
import { useAppStore } from './store/useAppStore';
import { FileUpload } from './components/FileUpload';
import { DeckBrowser } from './components/DeckBrowser';
import { CardList } from './components/CardList';
import { CardViewer } from './components/CardViewer';
import { AnalysisPanel } from './components/AnalysisPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { PendingChanges } from './components/PendingChanges';
import { analyzeCard } from './utils/llmService';
import { exportCollection } from './utils/ankiParser';

function App() {
  const collection = useAppStore(state => state.collection);
  const selectedCard = useAppStore(state => state.selectedCard);
  const analysisResult = useAppStore(state => state.analysisResult);
  const isAnalyzing = useAppStore(state => state.isAnalyzing);
  const analysisError = useAppStore(state => state.analysisError);
  const llmConfig = useAppStore(state => state.llmConfig);
  const setShowSettings = useAppStore(state => state.setShowSettings);
  const setAnalysisResult = useAppStore(state => state.setAnalysisResult);
  const setIsAnalyzing = useAppStore(state => state.setIsAnalyzing);
  const setAnalysisError = useAppStore(state => state.setAnalysisError);
  
  const handleAnalyze = useCallback(async () => {
    if (!selectedCard) return;
    
    if (!llmConfig.apiKey && llmConfig.providerId !== 'ollama') {
      setAnalysisError('Please configure your API key in Settings first.');
      return;
    }
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    
    try {
      const result = await analyzeCard(selectedCard, llmConfig);
      setAnalysisResult(result);
    } catch (error) {
      console.error('Analysis failed:', error);
      setAnalysisError(error instanceof Error ? error.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedCard, llmConfig, setAnalysisResult, setIsAnalyzing, setAnalysisError]);
  
  const handleExport = useCallback(async () => {
    if (!collection) return;
    
    try {
      const blob = await exportCollection(collection);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modified_collection.apkg';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. See console for details.');
    }
  }, [collection]);
  
  return (
    <div className="h-screen flex flex-col bg-anki-dark text-white">
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-3 bg-anki-darker border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-blue-400" />
              <h1 className="text-xl font-bold">LLMAnki</h1>
            </div>
            <span className="text-xs text-gray-400 hidden sm:inline">
              AI-Powered Anki Card Improvement
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <FileUpload />
            
            {collection && (
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">Export</span>
              </button>
            )}
            
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Deck Browser */}
        <aside className="w-64 flex-shrink-0 bg-anki-darker border-r border-gray-700 overflow-hidden flex flex-col">
          <DeckBrowser />
        </aside>
        
        {/* Card List */}
        <aside className="w-72 flex-shrink-0 bg-gray-900 border-r border-gray-700 overflow-hidden">
          <CardList />
        </aside>
        
        {/* Main Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedCard ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Current Card */}
                <div>
                  <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <BookOpen className="w-5 h-5" />
                    Current Card
                  </h2>
                  <CardViewer card={selectedCard} title="Original Card" />
                </div>
                
                {/* Analyze Button */}
                <div className="flex justify-center">
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all shadow-lg hover:shadow-xl"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-5 h-5" />
                        Analyze with AI
                      </>
                    )}
                  </button>
                </div>
                
                {/* Error Message */}
                {analysisError && (
                  <div className="flex items-start gap-3 p-4 bg-red-900/30 border border-red-700 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-400">Analysis Error</p>
                      <p className="text-sm text-gray-300 mt-1">{analysisError}</p>
                    </div>
                  </div>
                )}
                
                {/* Analysis Results */}
                {analysisResult && (
                  <AnalysisPanel result={analysisResult} />
                )}
                
                {/* Pending Changes */}
                <PendingChanges />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-medium mb-2">No Card Selected</h3>
                <p className="text-sm max-w-md">
                  {collection 
                    ? 'Select a deck from the sidebar, then click on a card to view and analyze it.'
                    : 'Load an Anki deck (.apkg file) to get started.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
      
      {/* Settings Modal */}
      <SettingsPanel />
    </div>
  );
}

export default App;
