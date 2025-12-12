export type LiveConfig = {
  model: string;
  systemInstruction?: string;
};

export type AudioSource = 'microphone' | 'screen';
export type VideoSource = 'camera' | 'screen' | 'none';

export interface LogMessage {
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
}
