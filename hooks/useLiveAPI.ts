import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality } from '@google/genai';
import { decodeAudioData, createPcmBlob, base64ToArrayBuffer, PCM_SAMPLE_RATE, INPUT_SAMPLE_RATE } from '../utils/audio';
import { LogMessage } from '../types';

interface UseLiveAPIOptions {
  onLog: (message: LogMessage) => void;
}

export function useLiveAPI({ onLog }: UseLiveAPIOptions) {
  const [connected, setConnected] = useState(false);
  const [volume, setVolume] = useState(0);
  
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const connect = useCallback(async () => {
    if (!process.env.API_KEY) {
      onLog({ role: 'system', text: 'API Key not found in environment.', timestamp: new Date() });
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Initialize Audio Contexts
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: PCM_SAMPLE_RATE });
      nextStartTimeRef.current = 0;

      onLog({ role: 'system', text: 'Connecting to Gemini Live...', timestamp: new Date() });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setConnected(true);
            onLog({ role: 'system', text: 'Session Connected.', timestamp: new Date() });
            
            // Setup Input Audio Stream
            if (!inputAudioContextRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // Calculate volume for visualizer
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / inputData.length);
              setVolume(Math.min(1, rms * 5)); // Amplify slightly for visuals

              const pcmBlob = createPcmBlob(inputData);
              sessionPromiseRef.current?.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(inputAudioContextRef.current.destination);
            
            inputSourceRef.current = source;
            processorRef.current = processor;
          },
          onmessage: async (message: LiveServerMessage) => {
             // Handle Text Transcription
             if (message.serverContent?.outputTranscription) {
               onLog({ 
                 role: 'model', 
                 text: message.serverContent.outputTranscription.text, 
                 timestamp: new Date() 
               });
             } else if (message.serverContent?.inputTranscription) {
                // Usually we don't need to log our own speech unless desired, 
                // but good for debug.
             }

             if (message.serverContent?.turnComplete) {
               // Turn complete logic if needed
             }

             // Handle Audio Output
             const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio && outputAudioContextRef.current) {
                const ctx = outputAudioContextRef.current;
                const buffer = await decodeAudioData(
                  base64ToArrayBuffer(base64Audio), 
                  ctx, 
                  PCM_SAMPLE_RATE
                );

                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                
                // Simple scheduling
                const now = ctx.currentTime;
                // Ensure we don't schedule in the past
                const startTime = Math.max(now, nextStartTimeRef.current);
                
                source.start(startTime);
                nextStartTimeRef.current = startTime + buffer.duration;
                
                audioSourcesRef.current.add(source);
                source.onended = () => audioSourcesRef.current.delete(source);
             }

             // Handle Interruption
             if (message.serverContent?.interrupted) {
               onLog({ role: 'system', text: 'Interrupted by user.', timestamp: new Date() });
               audioSourcesRef.current.forEach(src => {
                 try { src.stop(); } catch(e) {}
               });
               audioSourcesRef.current.clear();
               nextStartTimeRef.current = 0;
             }
          },
          onclose: () => {
            setConnected(false);
            onLog({ role: 'system', text: 'Session Closed.', timestamp: new Date() });
          },
          onerror: (err) => {
            console.error(err);
            onLog({ role: 'system', text: `Error: ${err.type || 'Unknown error'}`, timestamp: new Date() });
            setConnected(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {}, 
          systemInstruction: "You are a helpful, witty, and concise AI assistant. Respond naturally.",
        }
      });

    } catch (e: any) {
      onLog({ role: 'system', text: `Connection Failed: ${e.message}`, timestamp: new Date() });
      setConnected(false);
    }
  }, [onLog]);

  const disconnect = useCallback(async () => {
    if (sessionPromiseRef.current) {
      const session = await sessionPromiseRef.current;
      session.close();
    }
    
    // Cleanup Audio
    inputSourceRef.current?.disconnect();
    processorRef.current?.disconnect();
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    audioSourcesRef.current.forEach(s => s.stop());
    audioSourcesRef.current.clear();
    
    setConnected(false);
    setVolume(0);
  }, []);

  const sendVideoFrame = useCallback(async (base64Image: string) => {
    if (!sessionPromiseRef.current) return;
    const session = await sessionPromiseRef.current;
    session.sendRealtimeInput({
      media: {
        mimeType: 'image/jpeg',
        data: base64Image
      }
    });
  }, []);

  return {
    connected,
    volume,
    connect,
    disconnect,
    sendVideoFrame
  };
}