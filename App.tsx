import React, { useState, useRef, useEffect } from 'react';
import { useLiveAPI } from './hooks/useLiveAPI';
import { AudioPulse } from './components/AudioPulse';
import { LogMessage } from './types';
import { Video, Mic, Monitor, Power, MicOff, VideoOff } from 'lucide-react';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [videoActive, setVideoActive] = useState(false);
  const [screenActive, setScreenActive] = useState(false);
  
  const addLog = (message: LogMessage) => {
    setLogs(prev => [...prev, message].slice(-50)); // Keep last 50
  };

  const { connected, volume, connect, disconnect, sendVideoFrame } = useLiveAPI({ onLog: addLog });

  // Video Streaming Loop
  useEffect(() => {
    let intervalId: number;

    if (connected && (videoActive || screenActive)) {
      intervalId = window.setInterval(() => {
        if (videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
            canvas.width = video.videoWidth * 0.5; // Downscale for performance
            canvas.height = video.videoHeight * 0.5;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
            sendVideoFrame(base64);
          }
        }
      }, 1000 / 2); // 2 FPS is sufficient for context
    }

    return () => clearInterval(intervalId);
  }, [connected, videoActive, screenActive, sendVideoFrame]);

  const toggleVideo = async () => {
    if (videoActive) {
      stopMediaTracks();
      setVideoActive(false);
      return;
    }
    
    // Stop screen if active
    if (screenActive) {
        stopMediaTracks();
        setScreenActive(false);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setVideoActive(true);
      }
    } catch (err) {
      console.error(err);
      addLog({ role: 'system', text: 'Failed to access camera', timestamp: new Date() });
    }
  };

  const toggleScreen = async () => {
    if (screenActive) {
      stopMediaTracks();
      setScreenActive(false);
      return;
    }

    // Stop camera if active
    if (videoActive) {
        stopMediaTracks();
        setVideoActive(false);
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setScreenActive(true);
      }
      // Handle user stopping screen share via browser UI
      stream.getVideoTracks()[0].onended = () => {
         setScreenActive(false);
      };

    } catch (err) {
      console.error(err);
      addLog({ role: 'system', text: 'Failed to access screen', timestamp: new Date() });
    }
  };

  const stopMediaTracks = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const logsContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="h-screen w-full flex flex-col bg-neutral-900 text-neutral-200 font-sans">
      
      {/* Header */}
      <header className="flex-none p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/90 backdrop-blur z-10">
        <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
            <h1 className="text-lg font-semibold tracking-wide">Gemini Live Console</h1>
        </div>
        <div className="text-xs text-neutral-500">
            {connected ? <span className="text-green-500">● Live Connected</span> : <span className="text-neutral-500">○ Disconnected</span>}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left: Visuals & Video */}
        <div className="flex-1 flex flex-col relative bg-black items-center justify-center p-4">
            
            {/* Audio Visualizer (Always visible) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-80">
                <AudioPulse volume={volume} active={connected} />
            </div>

            {/* Video Layer */}
            <div className={`relative z-10 max-w-full max-h-full rounded-xl overflow-hidden shadow-2xl transition-opacity duration-500 ${videoActive || screenActive ? 'opacity-100' : 'opacity-0 h-0'}`}>
                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-auto max-h-[70vh] object-contain rounded-xl bg-neutral-900" 
                />
                 {/* Badge */}
                 <div className="absolute top-4 left-4 bg-black/50 backdrop-blur px-2 py-1 rounded text-xs font-mono text-white/80">
                    {screenActive ? 'SCREEN SHARE' : 'CAMERA FEED'}
                 </div>
            </div>

            {/* Placeholder when no video */}
            {!videoActive && !screenActive && (
                 <div className="z-10 text-center space-y-4">
                    <div className="text-2xl font-light text-neutral-400">
                       {connected ? "Listening..." : "Ready to Connect"}
                    </div>
                    <p className="text-sm text-neutral-600 max-w-md">
                        Start a session to interact with Gemini 2.0. Enable camera or screen share to provide visual context.
                    </p>
                 </div>
            )}
            
            {/* Hidden Canvas for processing */}
            <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Right: Logs (Collapsible on mobile?) */}
        <div className="flex-none h-48 md:h-auto md:w-96 border-t md:border-t-0 md:border-l border-neutral-800 bg-neutral-900 flex flex-col">
            <div className="p-3 border-b border-neutral-800 font-mono text-xs text-neutral-500 uppercase tracking-wider">
                Session Log
            </div>
            <div ref={logsContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {logs.length === 0 && (
                    <div className="text-center text-neutral-600 mt-10 text-sm italic">
                        No activity yet.
                    </div>
                )}
                {logs.map((msg, idx) => (
                    <div key={idx} className={`text-sm flex flex-col ${msg.role === 'model' ? 'items-start' : 'items-end'}`}>
                         <span className={`text-[10px] mb-1 px-2 py-0.5 rounded-full ${
                             msg.role === 'model' ? 'bg-blue-900/30 text-blue-400' : 
                             msg.role === 'user' ? 'bg-neutral-800 text-neutral-400' : 'bg-red-900/30 text-red-400'
                         }`}>
                             {msg.role}
                         </span>
                         <div className={`px-3 py-2 rounded-lg max-w-[90%] ${
                             msg.role === 'model' ? 'bg-neutral-800 text-neutral-200' : 
                             msg.role === 'user' ? 'bg-blue-600/20 text-blue-100' : 'bg-red-900/20 text-red-200 italic'
                         }`}>
                             {msg.text}
                         </div>
                    </div>
                ))}
            </div>
        </div>

      </main>

      {/* Bottom Control Tray */}
      <footer className="flex-none h-20 bg-neutral-900 border-t border-neutral-800 flex items-center justify-center gap-6 z-20">
          
          {/* Connection Button */}
          <button 
            onClick={connected ? disconnect : connect}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                connected 
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/50' 
                : 'bg-blue-600 text-white hover:bg-blue-500 hover:shadow-[0_0_20px_rgba(37,99,235,0.5)]'
            }`}
          >
            <Power size={20} />
            {connected ? 'Disconnect' : 'Connect'}
          </button>

          <div className="w-px h-8 bg-neutral-800 mx-2"></div>

          {/* Media Controls */}
          <button 
             onClick={toggleVideo}
             disabled={!connected && !videoActive} 
             className={`p-4 rounded-full transition-all ${
                 videoActive 
                 ? 'bg-neutral-100 text-neutral-900' 
                 : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
             }`}
             title="Toggle Camera"
          >
             {videoActive ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          <button 
             onClick={toggleScreen}
             disabled={!connected && !screenActive}
             className={`p-4 rounded-full transition-all ${
                 screenActive 
                 ? 'bg-neutral-100 text-neutral-900' 
                 : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
             }`}
             title="Share Screen"
          >
             <Monitor size={20} />
          </button>

           <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-800/50 border border-neutral-800 text-neutral-400 text-sm">
             <Mic size={16} className={connected ? "text-green-500" : ""} />
             <span>{connected ? "Mic On" : "Mic Off"}</span>
           </div>

      </footer>
    </div>
  );
};

export default App;