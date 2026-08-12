/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import fs from "node:fs";

import { patchElementCallStreamingSettings } from "../../../scripts/patch-element-call-streaming-settings";

describe("patchElementCallStreamingSettings", () => {
    it("patches the pinned Element Call bundle", () => {
        const elementCallBundle = fs.readFileSync(
            require.resolve("@element-hq/element-call-embedded/dist/assets/index-ZYqhOGev.js"),
        );
        const patched = patchElementCallStreamingSettings(elementCallBundle).toString();

        expect(patched).toContain("streamingResolution");
        expect(patched).toContain("streamingBitrate");
        expect(patched).toContain("streamingCodec");
        expect(patched).toContain(
            "videoCaptureDefaults:{resolution:$ewStreamingSettings.resolution??KZ.h720.resolution}",
        );
        expect(patched).toContain(
            "...($ewStreamingSettings.resolution?{resolution:$ewStreamingSettings.resolution}:{})",
        );
        expect(patched).not.toContain("videoCodec:`vp8`,videoEncoding:KZ.h720.encoding");
    });
});
