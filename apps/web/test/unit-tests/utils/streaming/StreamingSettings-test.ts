/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { flushPromises } from "../../../test-utils";
import SettingsStore from "../../../../src/settings/SettingsStore";
import {
    appendStreamingSettings,
    clearStreamingCodecCacheForTests,
    configurePeerConnectionStreaming,
    getAvailableStreamingCodecs,
    getStreamingSettings,
} from "../../../../src/utils/streaming/StreamingSettings";

describe("StreamingSettings", () => {
    const originalSender = Object.getOwnPropertyDescriptor(globalThis, "RTCRtpSender");
    const originalReceiver = Object.getOwnPropertyDescriptor(globalThis, "RTCRtpReceiver");
    const originalMediaCapabilities = Object.getOwnPropertyDescriptor(navigator, "mediaCapabilities");

    const setCodecCapabilities = (mimeTypes: string[]): void => {
        const capabilities = mimeTypes.map((mimeType, index) => ({
            mimeType,
            clockRate: 90_000,
            payloadType: 96 + index,
        }));
        Object.defineProperty(globalThis, "RTCRtpSender", {
            configurable: true,
            value: { getCapabilities: jest.fn().mockReturnValue({ codecs: capabilities, headerExtensions: [] }) },
        });
        Object.defineProperty(globalThis, "RTCRtpReceiver", {
            configurable: true,
            value: { getCapabilities: jest.fn().mockReturnValue({ codecs: capabilities, headerExtensions: [] }) },
        });
    };

    afterEach(() => {
        jest.restoreAllMocks();
        clearStreamingCodecCacheForTests();
        if (originalSender) Object.defineProperty(globalThis, "RTCRtpSender", originalSender);
        else delete (globalThis as unknown as Record<string, unknown>).RTCRtpSender;
        if (originalReceiver) Object.defineProperty(globalThis, "RTCRtpReceiver", originalReceiver);
        else delete (globalThis as unknown as Record<string, unknown>).RTCRtpReceiver;
        if (originalMediaCapabilities) Object.defineProperty(navigator, "mediaCapabilities", originalMediaCapabilities);
        else delete (navigator as unknown as Record<string, unknown>).mediaCapabilities;
    });

    it("normalizes missing stored values to Auto", () => {
        jest.spyOn(SettingsStore, "getValue").mockReturnValue(undefined);

        expect(getStreamingSettings()).toEqual({ resolution: "auto", bitrate: "auto", codec: "auto" });
    });

    it("only exposes advanced codecs with power-efficient encoding support", async () => {
        setCodecCapabilities(["video/VP8", "video/H264", "video/VP9", "video/AV1", "video/H265"]);
        const encodingInfo = jest.fn().mockImplementation(async ({ video }) => ({
            supported: true,
            smooth: true,
            powerEfficient: video.contentType.includes("vp09") || video.contentType.includes("hvc1"),
        }));
        Object.defineProperty(navigator, "mediaCapabilities", {
            configurable: true,
            value: { encodingInfo },
        });

        await expect(getAvailableStreamingCodecs()).resolves.toEqual(["auto", "vp8", "h264", "vp9", "h265"]);
        expect(encodingInfo).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "webrtc",
                video: expect.objectContaining({ contentType: "video/VP9;profile-id=0" }),
            }),
        );
    });

    it("exposes accelerated codecs when WebRTC capabilities omit them", async () => {
        setCodecCapabilities(["video/VP8", "video/H264"]);
        const encodingInfo = jest.fn().mockImplementation(async ({ type, video }) => ({
            supported: type === "webrtc" && video.contentType === "video/H265",
            smooth: true,
            powerEfficient: true,
        }));
        Object.defineProperty(navigator, "mediaCapabilities", {
            configurable: true,
            value: { encodingInfo },
        });

        await expect(getAvailableStreamingCodecs()).resolves.toEqual(["auto", "vp8", "h264", "h265"]);
    });

    it("continues to the recording query after an inefficient WebRTC result", async () => {
        setCodecCapabilities(["video/VP8", "video/H264", "video/VP9"]);
        const encodingInfo = jest.fn().mockImplementation(async ({ type, video }) => ({
            supported: true,
            smooth: true,
            powerEfficient: type === "record" && video.contentType.includes("vp09"),
        }));
        Object.defineProperty(navigator, "mediaCapabilities", {
            configurable: true,
            value: { encodingInfo },
        });

        await expect(getAvailableStreamingCodecs()).resolves.toContain("vp9");
    });

    it("omits Auto values and appends explicit values to Element Call URLs", () => {
        setCodecCapabilities(["video/VP8"]);
        const automatic = new URLSearchParams();
        appendStreamingSettings(automatic, { resolution: "auto", bitrate: "auto", codec: "auto" });
        expect(automatic.toString()).toBe("");

        const explicit = new URLSearchParams();
        appendStreamingSettings(explicit, { resolution: "1080", bitrate: "5000000", codec: "vp9" });
        expect(explicit.get("streamingResolution")).toBe("1080");
        expect(explicit.get("streamingBitrate")).toBe("5000000");
        expect(explicit.get("streamingCodec")).toBe("vp9");
    });

    it("applies resolution, total bitrate, and codec preference to legacy calls", async () => {
        setCodecCapabilities(["video/VP8", "video/H264"]);
        const applyConstraints = jest.fn().mockResolvedValue(undefined);
        const setParameters = jest.fn().mockResolvedValue(undefined);
        const sender = {
            track: { kind: "video", applyConstraints },
            getParameters: jest.fn().mockReturnValue({ encodings: [{ maxBitrate: 100_000 }, { maxBitrate: 300_000 }] }),
            setParameters,
        } as unknown as RTCRtpSender;
        const setCodecPreferences = jest.fn();
        const transceiver = { sender, setCodecPreferences } as unknown as RTCRtpTransceiver;
        const addEventListener = jest.fn();
        const peerConnection = {
            addEventListener,
            getTransceivers: jest.fn().mockReturnValue([transceiver]),
        } as unknown as RTCPeerConnection;

        configurePeerConnectionStreaming(peerConnection, { resolution: "1080", bitrate: "1000000", codec: "h264" });
        await flushPromises();

        expect(addEventListener).toHaveBeenCalledWith("negotiationneeded", expect.any(Function));
        expect(applyConstraints).toHaveBeenCalledWith({ width: { ideal: 1920 }, height: { ideal: 1080 } });
        expect(setCodecPreferences.mock.calls[0][0][0].mimeType).toBe("video/H264");
        expect(setParameters).toHaveBeenCalledWith({ encodings: [{ maxBitrate: 250_000 }, { maxBitrate: 750_000 }] });
    });
});
