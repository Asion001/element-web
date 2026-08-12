/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export const STREAMING_RESOLUTION_PARAM = "streamingResolution";
export const STREAMING_BITRATE_PARAM = "streamingBitrate";
export const STREAMING_CODEC_PARAM = "streamingCodec";

export const STREAMING_AUTO = "auto";

export const STREAMING_RESOLUTIONS = ["480", "720", "1080", "1440", "2160"] as const;
export type StreamingResolution = typeof STREAMING_AUTO | (typeof STREAMING_RESOLUTIONS)[number];

export const STREAMING_BITRATES = ["500000", "1000000", "2500000", "5000000", "8000000", "12000000"] as const;
export type StreamingBitrate = typeof STREAMING_AUTO | (typeof STREAMING_BITRATES)[number];

export const STREAMING_CODECS = ["vp8", "h264", "vp9", "av1", "h265"] as const;
export type StreamingCodec = typeof STREAMING_AUTO | (typeof STREAMING_CODECS)[number];

export const ADVANCED_STREAMING_CODECS: ReadonlySet<StreamingCodec> = new Set(["vp9", "av1", "h265"]);

export const STREAMING_RESOLUTION_WIDTHS: Readonly<Record<Exclude<StreamingResolution, "auto">, number>> = {
    "480": 854,
    "720": 1280,
    "1080": 1920,
    "1440": 2560,
    "2160": 3840,
};
