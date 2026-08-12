/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    STREAMING_BITRATE_PARAM,
    STREAMING_CODEC_PARAM,
    STREAMING_RESOLUTION_PARAM,
} from "../src/utils/streaming/constants.ts";

const OPTIONS_MARKER =
    "var zot={audioPreset:GZ.music,dtx:!0,red:!1,forceStereo:!1,simulcast:!0,videoSimulcastLayers:[KZ.h180,KZ.h360],screenShareEncoding:JZ.h1080fps30.encoding,stopMicTrackOnMute:!1,videoCodec:`vp8`,videoEncoding:KZ.h720.encoding,backupCodec:{codec:`vp8`,encoding:KZ.h720.encoding}},s9={adaptiveStream:!0,dynacast:!0,videoCaptureDefaults:{resolution:KZ.h720.resolution},publishDefaults:zot,stopLocalTrackOnUnpublish:!0,reconnectPolicy:new UXe,disconnectOnPageLeave:!0,webAudioMix:!1}";

const SCREEN_SHARE_MARKER =
    "let e={audio:{autoGainControl:!1,noiseSuppression:!1,voiceIsolation:!1},selfBrowserSurface:`include`,surfaceSwitching:`include`,systemAudio:`include`}";

const createOptionsReplacement = (): string =>
    `var $ewStreamingSettings=(()=>{let e=new URLSearchParams(location.hash.slice(location.hash.indexOf(\`?\`))),t=e.get(\`${STREAMING_RESOLUTION_PARAM}\`),n=Number(e.get(\`${STREAMING_BITRATE_PARAM}\`)),r=e.get(\`${STREAMING_CODEC_PARAM}\`),i={480:854,720:1280,1080:1920,1440:2560,2160:3840}[t],a=Number(t);return{resolution:i&&a?{width:i,height:a,frameRate:30}:void 0,bitrate:Number.isFinite(n)&&n>0?n:void 0,codec:[\`vp8\`,\`h264\`,\`vp9\`,\`av1\`,\`h265\`].includes(r)?r:\`vp8\`}})(),zot={audioPreset:GZ.music,dtx:!0,red:!1,forceStereo:!1,simulcast:!0,videoSimulcastLayers:[KZ.h180,KZ.h360],screenShareEncoding:$ewStreamingSettings.bitrate?{...JZ.h1080fps30.encoding,maxBitrate:$ewStreamingSettings.bitrate}:JZ.h1080fps30.encoding,stopMicTrackOnMute:!1,videoCodec:$ewStreamingSettings.codec,videoEncoding:$ewStreamingSettings.bitrate?{...KZ.h720.encoding,maxBitrate:$ewStreamingSettings.bitrate}:KZ.h720.encoding,backupCodec:{codec:\`vp8\`,encoding:KZ.h720.encoding}},s9={adaptiveStream:!0,dynacast:!0,videoCaptureDefaults:{resolution:$ewStreamingSettings.resolution??KZ.h720.resolution},publishDefaults:zot,stopLocalTrackOnUnpublish:!0,reconnectPolicy:new UXe,disconnectOnPageLeave:!0,webAudioMix:!1}`;

export const patchElementCallStreamingSettings = (source: Buffer): Buffer => {
    let code = source.toString();
    if (!code.includes(OPTIONS_MARKER) || !code.includes(SCREEN_SHARE_MARKER)) {
        throw new Error("Unable to locate the Element Call 0.22.0 streaming option markers");
    }

    code = code.replace(OPTIONS_MARKER, createOptionsReplacement());
    code = code.replace(
        SCREEN_SHARE_MARKER,
        `${SCREEN_SHARE_MARKER.slice(0, -1)},...($ewStreamingSettings.resolution?{resolution:$ewStreamingSettings.resolution}:{})}`,
    );
    return Buffer.from(code);
};
