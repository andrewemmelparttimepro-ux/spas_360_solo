// Narrow browser adapter for the only ElevenLabs capability SPAS 360 uses.
// The public package browser entry also initializes Conversation/LiveKit;
// registering just the Scribe microphone avoids loading that unrelated stack.
import { setScribeMicrophoneSetup } from '../../node_modules/@elevenlabs/client/dist/scribe/microphone.js';
import { webScribeMicrophoneSetup } from '../../node_modules/@elevenlabs/client/dist/platform/web/scribeMicrophone.js';

setScribeMicrophoneSetup(webScribeMicrophoneSetup);

export { Scribe, AudioFormat, CommitStrategy, RealtimeEvents, RealtimeConnection } from '../../node_modules/@elevenlabs/client/dist/scribe/index.js';
