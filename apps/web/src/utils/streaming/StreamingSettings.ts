/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";

import SettingsStore from "../../settings/SettingsStore";
import {
    ADVANCED_STREAMING_CODECS,
    STREAMING_AUTO,
    STREAMING_BITRATE_PARAM,
    STREAMING_BITRATES,
    STREAMING_CODEC_PARAM,
    STREAMING_CODECS,
    STREAMING_RESOLUTION_PARAM,
    STREAMING_RESOLUTIONS,
    STREAMING_RESOLUTION_WIDTHS,
    type StreamingBitrate,
    type StreamingCodec,
    type StreamingResolution,
} from "./constants";

export interface StreamingSettings {
    resolution: StreamingResolution;
    bitrate: StreamingBitrate;
    codec: StreamingCodec;
}

const CODEC_MIME_TYPES: Record<Exclude<StreamingCodec, "auto">, readonly string[]> = {
    vp8: ["video/vp8"],
    h264: ["video/h264"],
    vp9: ["video/vp9"],
    av1: ["video/av1"],
    h265: ["video/h265", "video/hevc"],
};

const MEDIA_CAPABILITIES_CONTENT_TYPES: Record<Exclude<StreamingCodec, "auto">, string> = {
    vp8: 'video/webm; codecs="vp8"',
    h264: 'video/mp4; codecs="avc1.42E01E"',
    vp9: 'video/webm; codecs="vp09.00.10.08"',
    av1: 'video/webm; codecs="av01.0.04M.08"',
    h265: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
};

let acceleratedCodecPromises = new Map<StreamingCodec, Promise<boolean>>();

const normalizeSetting = <T extends string>(value: unknown, options: readonly T[]): typeof STREAMING_AUTO | T => {
    if (value === STREAMING_AUTO) return STREAMING_AUTO;
    return typeof value === "string" && options.some((option) => option === value) ? (value as T) : STREAMING_AUTO;
};

export const getStreamingSettings = (): StreamingSettings => ({
    resolution: normalizeSetting(SettingsStore.getValue("webrtc_streaming_resolution"), STREAMING_RESOLUTIONS),
    bitrate: normalizeSetting(SettingsStore.getValue("webrtc_streaming_bitrate"), STREAMING_BITRATES),
    codec: normalizeSetting(SettingsStore.getValue("webrtc_streaming_codec"), STREAMING_CODECS),
});

const getAdvertisedVideoMimeTypes = (): Set<string> => {
    const senderCapabilities = globalThis.RTCRtpSender?.getCapabilities?.("video")?.codecs ?? [];
    return new Set(senderCapabilities.map((codec) => codec.mimeType.toLowerCase()));
};

export const isCodecAdvertised = (codec: Exclude<StreamingCodec, "auto">): boolean => {
    const advertisedMimeTypes = getAdvertisedVideoMimeTypes();
    return CODEC_MIME_TYPES[codec]?.some((mimeType) => advertisedMimeTypes.has(mimeType)) ?? false;
};

const queryEncodingInfo = async (codec: Exclude<StreamingCodec, "auto">): Promise<boolean> => {
    if (!navigator.mediaCapabilities?.encodingInfo) return false;

    const video = {
        contentType: MEDIA_CAPABILITIES_CONTENT_TYPES[codec],
        width: 1280,
        height: 720,
        bitrate: 2_500_000,
        framerate: 30,
    };

    for (const type of ["webrtc", "record"] as const) {
        try {
            const result = await navigator.mediaCapabilities.encodingInfo({
                type,
                video,
            });
            if (result.supported) return result.smooth && result.powerEfficient;
        } catch {
            // Browsers may reject a configuration type or codec string they do not understand.
        }
    }
    return false;
};

export const isCodecHardwareAccelerated = async (codec: StreamingCodec): Promise<boolean> => {
    if (codec === STREAMING_AUTO || !ADVANCED_STREAMING_CODECS.has(codec)) return true;
    if (!isCodecAdvertised(codec)) return false;

    let promise = acceleratedCodecPromises.get(codec);
    if (!promise) {
        promise = queryEncodingInfo(codec);
        acceleratedCodecPromises.set(codec, promise);
    }
    return promise;
};

export const getAvailableStreamingCodecs = async (): Promise<StreamingCodec[]> => {
    const available: StreamingCodec[] = [STREAMING_AUTO];
    for (const codec of STREAMING_CODECS) {
        if (!isCodecAdvertised(codec)) continue;
        if (ADVANCED_STREAMING_CODECS.has(codec) && !(await isCodecHardwareAccelerated(codec))) continue;
        available.push(codec);
    }
    return available;
};

export const appendStreamingSettings = (params: URLSearchParams, settings = getStreamingSettings()): void => {
    if (settings.resolution !== STREAMING_AUTO) params.set(STREAMING_RESOLUTION_PARAM, settings.resolution);
    if (settings.bitrate !== STREAMING_AUTO) params.set(STREAMING_BITRATE_PARAM, settings.bitrate);
    if (settings.codec !== STREAMING_AUTO && isCodecAdvertised(settings.codec)) {
        params.set(STREAMING_CODEC_PARAM, settings.codec);
    }
};

const getCodecCapabilities = (codec: Exclude<StreamingCodec, "auto">): RTCRtpCapabilities["codecs"] => {
    const capabilities = [
        ...(globalThis.RTCRtpSender?.getCapabilities?.("video")?.codecs ?? []),
        ...(globalThis.RTCRtpReceiver?.getCapabilities?.("video")?.codecs ?? []),
    ];
    const seen = new Set<string>();
    const uniqueCapabilities = capabilities.filter((capability) => {
        const key = `${capability.mimeType}|${capability.clockRate}|${capability.sdpFmtpLine ?? ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const preferredMimeTypes = new Set(CODEC_MIME_TYPES[codec]);
    return [
        ...uniqueCapabilities.filter((capability) => preferredMimeTypes.has(capability.mimeType.toLowerCase())),
        ...uniqueCapabilities.filter((capability) => !preferredMimeTypes.has(capability.mimeType.toLowerCase())),
    ];
};

const applyBitrate = async (sender: RTCRtpSender, bitrate: number): Promise<void> => {
    if (sender.track?.kind !== "video") return;

    const parameters = sender.getParameters();
    parameters.encodings ??= [{}];
    const currentBitrates = parameters.encodings.map((encoding) => encoding.maxBitrate ?? 0);
    const currentTotal = currentBitrates.reduce((total, value) => total + value, 0);
    const weights = currentTotal > 0 ? currentBitrates : parameters.encodings.map((_, index) => 2 ** index);
    const weightTotal = weights.reduce((total, value) => total + value, 0);

    parameters.encodings.forEach((encoding, index) => {
        encoding.maxBitrate = Math.max(10_000, Math.round((bitrate * weights[index]) / weightTotal));
    });
    await sender.setParameters(parameters);
};

const applyResolution = async (
    sender: RTCRtpSender,
    resolution: Exclude<StreamingResolution, "auto">,
): Promise<void> => {
    if (sender.track?.kind !== "video") return;
    await sender.track.applyConstraints({
        width: { ideal: STREAMING_RESOLUTION_WIDTHS[resolution] },
        height: { ideal: Number(resolution) },
    });
};

const applyToPeerConnection = async (peerConnection: RTCPeerConnection, settings: StreamingSettings): Promise<void> => {
    let codec = settings.codec;
    if (codec !== STREAMING_AUTO && !(await isCodecHardwareAccelerated(codec))) codec = STREAMING_AUTO;

    for (const transceiver of peerConnection.getTransceivers()) {
        if (transceiver.sender.track?.kind !== "video") continue;

        if (codec !== STREAMING_AUTO && transceiver.setCodecPreferences) {
            try {
                transceiver.setCodecPreferences(getCodecCapabilities(codec));
            } catch (error) {
                logger.warn(`Unable to apply preferred streaming codec ${codec}`, error);
            }
        }
        if (settings.resolution !== STREAMING_AUTO) {
            await applyResolution(transceiver.sender, settings.resolution).catch((error) => {
                logger.warn(`Unable to apply streaming resolution ${settings.resolution}p`, error);
            });
        }
        if (settings.bitrate !== STREAMING_AUTO) {
            await applyBitrate(transceiver.sender, Number(settings.bitrate)).catch((error) => {
                logger.warn(`Unable to apply streaming bitrate ${settings.bitrate}`, error);
            });
        }
    }
};

export const configurePeerConnectionStreaming = (
    peerConnection: RTCPeerConnection,
    settings = getStreamingSettings(),
): void => {
    const apply = (): void => {
        void applyToPeerConnection(peerConnection, settings);
    };
    peerConnection.addEventListener("negotiationneeded", apply);
    apply();
};

export const clearStreamingCodecCacheForTests = (): void => {
    acceleratedCodecPromises = new Map();
};
