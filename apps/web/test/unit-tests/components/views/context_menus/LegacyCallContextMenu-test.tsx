/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { MatrixCall } from "matrix-js-sdk/src/webrtc/call";
import { fireEvent, render, screen } from "jest-matrix-react";

import LegacyCallContextMenu from "../../../../../src/components/views/context_menus/LegacyCallContextMenu";
import defaultDispatcher from "../../../../../src/dispatcher/dispatcher";
import { Action } from "../../../../../src/dispatcher/actions";
import { UserTab } from "../../../../../src/components/views/dialogs/UserTab";
import { createTestClient } from "../../../../test-utils";

describe("LegacyCallContextMenu", () => {
    it("opens Voice & Video settings", () => {
        const onFinished = jest.fn();
        const dispatchSpy = jest.spyOn(defaultDispatcher, "dispatch");
        const call = new MatrixCall({ client: createTestClient(), roomId: "!room:example.org" });

        render(<LegacyCallContextMenu call={call} onFinished={onFinished} />);
        fireEvent.click(screen.getByRole("menuitem", { name: "Voice & Video" }));

        expect(dispatchSpy).toHaveBeenCalledWith({
            action: Action.ViewUserSettings,
            initialTabId: UserTab.Voice,
        });
        expect(onFinished).toHaveBeenCalled();
    });
});
