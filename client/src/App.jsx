import { useState, useRef, useEffect } from "react";
import { 
  Send, 
  Upload, 
  FileText, 
  Bot, 
  User, 
  X, 
  CheckCircle,
  AlertCircle,
  Loader2,
  Square
} from "lucide-react";

function App() {
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const fileInputRef = useRef(null);
  const chatContainerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chat, isLoading]);

  // Fetch all indexed files from server on mount
  async function refreshFiles() {
    try {
      const res = await fetch(`/files`);
      if (res.ok) {
        const data = await res.json();
        // Convert array of names to objects expected by UI
        setUploadedFiles(data.map(name => ({ name, status: 'success' })));
      }
    } catch (e) {
      console.error("Failed to fetch files", e);
    }
  }

  useEffect(() => {
    refreshFiles();
  }, []);

  async function send() {
    if (!msg.trim() || isLoading) return;
    
    const userMessage = { role: "user", content: msg };
    setChat(prev => [...prev, userMessage]);
    setIsLoading(true);
    setMsg("");

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "user1",
          role: "user",
          question: msg
        }),
        signal: abortControllerRef.current.signal
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let result = "";

      setChat(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              result += data.response;
              setChat(prev => {
                const newChat = [...prev];
                newChat[newChat.length - 1].content = result;
                return newChat;
              });
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setChat(prev => {
          const newChat = [...prev];
          if (newChat.length > 0 && newChat[newChat.length - 1].role === 'assistant') {
            newChat[newChat.length - 1].content += '\n\n[Response stopped by user]';
          }
          return newChat;
        });
      } else {
        console.error("Error:", error);
        setChat(prev => [...prev, { role: "assistant", content: "Error connecting to server. Please make sure the backend is running." }]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }

  function stopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }

  async function handleFileUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadStatus(null);

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`/upload`, {
          method: "POST",
          body: formData
        });

        if (!res.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }
      }
      setUploadStatus({ type: 'success', message: 'All files uploaded successfully!' });
      refreshFiles(); // Sync with server
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus({ type: 'error', message: 'Failed to upload files. Please try again.' });
      setUploadedFiles(prev => [...prev, { name: files[0].name, status: 'error' }]);
    } finally {
      setIsUploading(false);
      // Clear the file input so user can upload same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleKeyPress(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function removeFile(index) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight">Production RAG</h1>
              <p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wider font-semibold">Multilingual Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload Docs</span>
            </button>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <FileText className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full relative">
        {/* Chat Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-white shadow-inner relative z-10">
          {/* Chat Messages */}
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50"
          >
            {chat.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                  <Bot className="w-10 h-10 text-gray-300" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Welcome to RAG Chat</h3>
                <p className="max-w-xs text-sm leading-relaxed">
                  Upload documents to build your knowledge base and ask questions in any language.
                </p>
              </div>
            ) : (
              chat.map((c, i) => (
                <div 
                  key={i} 
                  className={`flex ${c.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                >
                  <div 
                    className={`max-w-[90%] md:max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                      c.role === 'user' 
                        ? 'bg-primary-600 text-white rounded-br-none' 
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                        c.role === 'user' ? 'bg-primary-500' : 'bg-gray-100'
                      }`}>
                        {c.role === 'user' ? (
                          <User className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <Bot className="w-3.5 h-3.5 text-primary-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold mb-1 opacity-70 uppercase tracking-tighter">
                          {c.role === 'user' ? 'You' : 'Assistant'}
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed text-sm md:text-base">{c.content}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex justify-start animate-pulse">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                    <span className="text-sm font-medium">Assistant is typing...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-3 md:p-4 bg-white border-t border-gray-200 flex-shrink-0">
            <div className="flex gap-2 md:gap-3 max-w-4xl mx-auto">
              <div className="flex-1 relative">
                <textarea 
                  rows="1"
                  value={msg} 
                  onChange={e => setMsg(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask anything about your docs..."
                  disabled={isLoading}
                  className="w-full pl-4 pr-12 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 disabled:bg-gray-50 disabled:cursor-not-allowed resize-none transition-all text-sm md:text-base shadow-sm"
                  style={{ maxHeight: '120px' }}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                   {msg.trim() && !isLoading && (
                     <button 
                       onClick={send}
                       className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-md shadow-primary-200"
                     >
                       <Send className="w-4 h-4" />
                     </button>
                   )}
                </div>
              </div>
              
              {isLoading ? (
                <button 
                  onClick={stopGeneration}
                  className="px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors flex items-center gap-2 font-medium text-sm shadow-md shadow-red-100"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              ) : !msg.trim() && (
                <button 
                  disabled
                  className="px-4 py-3 bg-gray-100 text-gray-400 rounded-xl cursor-not-allowed flex items-center gap-2 font-medium text-sm"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              )}
            </div>
          </div>
        </main>

        {/* Sidebar - Uploaded Files (Collapsible on Mobile) */}
        <aside className={`
          ${showSidebar ? 'translate-x-0' : 'translate-x-full'} 
          lg:translate-x-0 lg:static fixed right-0 top-0 bottom-0 
          w-72 md:w-80 bg-white border-l border-gray-200 z-50 transition-transform duration-300 ease-in-out
          flex flex-col shadow-2xl lg:shadow-none
        `}>
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wider">
              <FileText className="w-4 h-4 text-primary-600" />
              Documents
            </h3>
            <button 
              onClick={() => setShowSidebar(false)}
              className="lg:hidden p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {uploadedFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <FileText className="w-12 h-12 text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">No documents yet.</p>
                <button 
                  onClick={() => setShowUploadModal(true)}
                  className="mt-4 text-xs text-primary-600 font-bold hover:underline"
                >
                  UPLOAD NOW
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {uploadedFiles.map((file, i) => (
                  <li 
                    key={i}
                    className="group flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl hover:border-primary-200 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`p-2 rounded-lg ${
                        file.status === 'error' ? 'bg-red-50' : 'bg-primary-50'
                      }`}>
                        <FileText className={`w-4 h-4 ${
                          file.status === 'error' ? 'text-red-500' : 'text-primary-600'
                        }`} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-gray-800 truncate">{file.name}</span>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {file.status === 'success' ? 'Ready for chat' : 'Upload failed'}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFile(i)}
                      className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          <div className="p-4 bg-gray-50 border-t border-gray-200">
             <div className="p-3 bg-white rounded-xl border border-gray-200">
               <div className="flex items-center gap-2 mb-1">
                 <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                 <span className="text-[10px] font-bold text-gray-500 uppercase">Knowledge Base</span>
               </div>
               <p className="text-[10px] text-gray-400 leading-tight">
                 Add documents to provide context for the AI. Supported formats: PDF, DOC, TXT.
               </p>
             </div>
          </div>
        </aside>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Add Documents</h2>
                  <p className="text-xs text-gray-500">Add context to your knowledge base</p>
                </div>
                <button 
                  onClick={() => setShowUploadModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center cursor-pointer hover:border-primary-500 hover:bg-primary-50/30 transition-all duration-300"
              >
                <input 
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {isUploading ? (
                  <div className="flex flex-col items-center">
                    <div className="relative mb-4">
                       <Loader2 className="w-12 h-12 text-primary-600 animate-spin" />
                       <div className="absolute inset-0 flex items-center justify-center">
                         <Upload className="w-5 h-5 text-primary-200" />
                       </div>
                    </div>
                    <p className="text-gray-900 font-bold">Uploading Documents...</p>
                    <p className="text-gray-400 text-xs mt-1 italic">Indexing chunks into vector DB</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                      <Upload className="w-8 h-8 text-gray-400 group-hover:text-primary-500" />
                    </div>
                    <p className="text-gray-700 font-bold">Drop files or click to browse</p>
                    <p className="text-gray-400 text-xs mt-1">PDF, DOC, DOCX, or TXT (Max 50MB)</p>
                  </div>
                )}
              </div>

              {uploadStatus && (
                <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-300 ${
                  uploadStatus.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  <div className={`p-1 rounded-full ${uploadStatus.type === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {uploadStatus.type === 'success' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">{uploadStatus.type === 'success' ? 'Success!' : 'Error'}</p>
                    <p className="text-xs opacity-90">{uploadStatus.message}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-6 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-6 py-2.5 text-sm font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors shadow-lg shadow-primary-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
