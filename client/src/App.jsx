import { useState, useRef, useEffect, useCallback } from "react";
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
  Square,
  Menu,
  MessageCircle
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
  const [isMobile, setIsMobile] = useState(false);
  
  const fileInputRef = useRef(null);
  const chatContainerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const textareaRef = useRef(null);
  const inputAreaRef = useRef(null);

  // Detect mobile device and set viewport height CSS variable
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    // Set CSS variable for viewport height (fixes iOS Safari 100vh bug)
    const setVH = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    checkMobile();
    setVH();
    
    window.addEventListener('resize', () => {
      checkMobile();
      setVH();
    });
    
    // Handle orientation change on mobile
    window.addEventListener('orientationchange', () => {
      setTimeout(setVH, 100);
    });
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('orientationchange', setVH);
    };
  }, []);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chat, isLoading]);

  // Handle visual viewport changes (keyboard open/close on mobile)
  useEffect(() => {
    if (!isMobile) return;
    
    const handleResize = () => {
      if (inputAreaRef.current && chatContainerRef.current) {
        // Scroll to bottom when keyboard might be opening
        setTimeout(() => {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }, 100);
      }
    };
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport.removeEventListener('resize', handleResize);
    }
  }, [isMobile]);

  // Fetch all indexed files from server on mount
  const refreshFiles = useCallback(async () => {
    try {
      const res = await fetch(`/files`);
      if (res.ok) {
        const data = await res.json();
        setUploadedFiles(data.map(name => ({ name, status: 'success' })));
      }
    } catch (e) {
      console.error("Failed to fetch files", e);
    }
  }, []);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [msg]);

  async function send() {
    if (!msg.trim() || isLoading) return;
    
    const userMessage = { role: "user", content: msg };
    setChat(prev => [...prev, userMessage]);
    setIsLoading(true);
    const currentMsg = msg;
    setMsg("");

    // Blur textarea on mobile to close keyboard
    if (isMobile && textareaRef.current) {
      textareaRef.current.blur();
    }

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "user1",
          role: "user",
          question: currentMsg
        }),
        signal: abortControllerRef.current.signal
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let result = "";

      setChat(prev => [...prev, { role: "assistant", content: "", lang: null }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === "meta" && data.lang) {
              setChat(prev => {
                const newChat = [...prev];
                newChat[newChat.length - 1].lang = data.lang;
                return newChat;
              });
            } else if (data.response) {
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
      refreshFiles();
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus({ type: 'error', message: 'Failed to upload files. Please try again.' });
      setUploadedFiles(prev => [...prev, { name: files[0].name, status: 'error' }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function removeFile(index) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }

  // Close sidebar when clicking outside on mobile
  function handleMainClick() {
    if (isMobile && showSidebar) {
      setShowSidebar(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden safe-area-top safe-area-bottom">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 leading-tight truncate">Production RAG</h1>
              <p className="text-[9px] sm:text-[10px] md:text-xs text-gray-500 uppercase tracking-wider font-semibold hidden xs:block">Multilingual Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 active:bg-primary-800 transition-colors text-xs sm:text-sm font-medium touch-target"
              aria-label="Upload documents"
            >
              <Upload className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Upload Docs</span>
              <span className="sm:hidden">Upload</span>
            </button>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="lg:hidden p-2 sm:p-2.5 text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-lg touch-target"
              aria-label="Toggle documents sidebar"
            >
              {showSidebar ? <X className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full relative">
        {/* Mobile Sidebar Overlay */}
        {isMobile && showSidebar && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Chat Area */}
        <main 
          className="flex-1 flex flex-col min-w-0 bg-white shadow-inner relative z-10"
          onClick={handleMainClick}
        >
          {/* Chat Messages */}
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 bg-gray-50/50 momentum-scroll chat-scroll"
          >
            {chat.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 px-4 sm:px-6 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4 sm:mb-6">
                  <MessageCircle className="w-8 h-8 sm:w-10 sm:h-10 text-gray-300" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-2">Welcome to RAG Chat</h3>
                <p className="max-w-xs text-xs sm:text-sm leading-relaxed">
                  Upload documents to build your knowledge base and ask questions in any language.
                </p>
              </div>
            ) : (
              chat.map((c, i) => (
                <div 
                  key={i} 
                  className={`flex ${c.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
                >
                  <div 
                    className={`max-w-[92%] sm:max-w-[90%] md:max-w-[80%] rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm ${
                      c.role === 'user' 
                        ? 'bg-primary-600 text-white rounded-br-md sm:rounded-br-none' 
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md sm:rounded-bl-none'
                    }`}
                  >
                    <div className="flex items-start gap-2 sm:gap-3">
                      <div className={`mt-0.5 flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center ${
                        c.role === 'user' ? 'bg-primary-500' : 'bg-gray-100'
                      }`}>
                        {c.role === 'user' ? (
                          <User className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
                        ) : (
                          <Bot className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                          <p className="text-[10px] sm:text-xs font-semibold opacity-70 uppercase tracking-tighter">
                            {c.role === 'user' ? 'You' : 'Assistant'}
                          </p>
                          {c.role === 'assistant' && c.lang && c.lang !== 'English' && (
                            <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded-full leading-none">
                              {c.lang}
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm md:text-base break-words">{c.content}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex justify-start animate-pulse">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md sm:rounded-bl-none px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
                  <div className="flex items-center gap-2 sm:gap-3 text-gray-500">
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-primary-600" />
                    <span className="text-xs sm:text-sm font-medium">Assistant is typing...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div 
            ref={inputAreaRef}
            className="p-2 sm:p-3 md:p-4 bg-white border-t border-gray-200 flex-shrink-0 safe-area-bottom"
          >
            <div className="flex gap-2 sm:gap-3 max-w-4xl mx-auto">
              <div className="flex-1 relative">
                <textarea 
                  ref={textareaRef}
                  rows="1"
                  value={msg} 
                  onChange={e => setMsg(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  disabled={isLoading}
                  className="w-full pl-3 sm:pl-4 pr-11 sm:pr-12 py-2.5 sm:py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 disabled:bg-gray-50 disabled:cursor-not-allowed resize-none transition-all text-sm sm:text-base shadow-sm bg-white"
                  style={{ maxHeight: '120px', fontSize: '16px' }}
                />
                <div className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2">
                   {msg.trim() && !isLoading && (
                     <button 
                       onClick={send}
                       className="p-2 sm:p-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 active:bg-primary-800 transition-colors shadow-md shadow-primary-200 touch-target"
                       aria-label="Send message"
                     >
                       <Send className="w-4 h-4" />
                     </button>
                   )}
                </div>
              </div>
              
              {isLoading ? (
                <button 
                  onClick={stopGeneration}
                  className="px-3 sm:px-4 py-2.5 sm:py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 active:bg-red-700 transition-colors flex items-center gap-1.5 sm:gap-2 font-medium text-xs sm:text-sm shadow-md shadow-red-100 touch-target"
                  aria-label="Stop generation"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              ) : !msg.trim() && (
                <button 
                  disabled
                  className="px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-100 text-gray-400 rounded-xl cursor-not-allowed flex items-center gap-1.5 sm:gap-2 font-medium text-xs sm:text-sm touch-target"
                  aria-label="Send message (disabled)"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              )}
            </div>
          </div>
        </main>

        {/* Sidebar - Uploaded Files */}
        <aside className={`
          ${showSidebar ? 'translate-x-0' : 'translate-x-full'} 
          lg:translate-x-0 lg:static fixed right-0 top-0 bottom-0 
          w-64 sm:w-72 md:w-80 bg-white border-l border-gray-200 z-50 transition-transform duration-300 ease-in-out
          flex flex-col shadow-2xl lg:shadow-none
          safe-area-top safe-area-bottom safe-area-right
        `}>
          <div className="p-3 sm:p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 text-xs sm:text-sm uppercase tracking-wider">
              <FileText className="w-4 h-4 text-primary-600" />
              Documents
            </h3>
            <button 
              onClick={() => setShowSidebar(false)}
              className="lg:hidden p-1.5 hover:bg-gray-200 active:bg-gray-300 rounded-lg transition-colors touch-target"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 momentum-scroll">
            {uploadedFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-3 text-center">
                <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-gray-200 mb-2 sm:mb-3" />
                <p className="text-gray-400 text-xs sm:text-sm">No documents yet.</p>
                <button 
                  onClick={() => {
                    setShowUploadModal(true);
                    setShowSidebar(false);
                  }}
                  className="mt-3 sm:mt-4 text-[10px] sm:text-xs text-primary-600 font-bold hover:underline"
                >
                  UPLOAD NOW
                </button>
              </div>
            ) : (
              <ul className="space-y-2 sm:space-y-3">
                {uploadedFiles.map((file, i) => (
                  <li 
                    key={i}
                    className="group flex items-center justify-between p-2.5 sm:p-3 bg-white border border-gray-100 rounded-xl hover:border-primary-200 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-2 sm:gap-3 overflow-hidden min-w-0">
                      <div className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ${
                        file.status === 'error' ? 'bg-red-50' : 'bg-primary-50'
                      }`}>
                        <FileText className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                          file.status === 'error' ? 'text-red-500' : 'text-primary-600'
                        }`} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs sm:text-sm font-medium text-gray-800 truncate">{file.name}</span>
                        <span className="text-[9px] sm:text-[10px] text-gray-400 font-medium">
                          {file.status === 'success' ? 'Ready for chat' : 'Upload failed'}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFile(i)}
                      className="p-1 sm:p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 active:bg-red-100 rounded-lg transition-all touch-target"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          <div className="p-3 sm:p-4 bg-gray-50 border-t border-gray-200">
             <div className="p-2.5 sm:p-3 bg-white rounded-xl border border-gray-200">
               <div className="flex items-center gap-2 mb-1">
                 <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse-dot"></div>
                 <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase">Knowledge Base</span>
               </div>
               <p className="text-[9px] sm:text-[10px] text-gray-400 leading-tight">
                 Add documents to provide context. PDF, DOC, TXT supported.
               </p>
             </div>
          </div>
        </aside>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-3 sm:p-4 animate-fade-in"
          onClick={(e) => e.target === e.currentTarget && setShowUploadModal(false)}
        >
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-slide-up safe-area-top safe-area-bottom">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">Add Documents</h2>
                  <p className="text-[10px] sm:text-xs text-gray-500">Add context to your knowledge base</p>
                </div>
                <button 
                  onClick={() => setShowUploadModal(false)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 active:bg-gray-200 rounded-full transition-colors touch-target"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group border-2 border-dashed border-gray-200 rounded-xl sm:rounded-2xl p-6 sm:p-10 text-center cursor-pointer hover:border-primary-500 hover:bg-primary-50/30 active:bg-primary-50/50 transition-all duration-300 touch-target"
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
                    <div className="relative mb-3 sm:mb-4">
                       <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-primary-600 animate-spin" />
                       <div className="absolute inset-0 flex items-center justify-center">
                         <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-primary-200" />
                       </div>
                    </div>
                    <p className="text-gray-900 font-bold text-sm sm:text-base">Uploading Documents...</p>
                    <p className="text-gray-400 text-[10px] sm:text-xs mt-1 italic">Indexing chunks into vector DB</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-50 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                      <Upload className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 group-hover:text-primary-500" />
                    </div>
                    <p className="text-gray-700 font-bold text-sm sm:text-base">Drop files or tap to browse</p>
                    <p className="text-gray-400 text-[10px] sm:text-xs mt-1">PDF, DOC, DOCX, or TXT (Max 50MB)</p>
                  </div>
                )}
              </div>

              {uploadStatus && (
                <div className={`mt-3 sm:mt-4 p-3 sm:p-4 rounded-xl flex items-start gap-2 sm:gap-3 animate-slide-up ${
                  uploadStatus.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  <div className={`p-1 rounded-full flex-shrink-0 ${uploadStatus.type === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {uploadStatus.type === 'success' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-bold">{uploadStatus.type === 'success' ? 'Success!' : 'Error'}</p>
                    <p className="text-[10px] sm:text-xs opacity-90">{uploadStatus.message}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex justify-end gap-2 sm:gap-3">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-gray-600 hover:bg-gray-200 active:bg-gray-300 rounded-xl transition-colors touch-target"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 active:bg-primary-800 transition-colors shadow-lg shadow-primary-200 touch-target"
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