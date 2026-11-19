// Shared setup for the agentified-site tests. Each test file runs in its own
// process, so this runs once per file: build the DOM stand-in from index.html,
// import the actions and the assistant mount, and initialise the page once.
// Never import a .test.mjs file: its tests would run again.
import { readFile } from "node:fs/promises";
import { StubDocument } from "./stub_document.mjs";
import { StubOption } from "./stub_option.mjs";

export const NETWORK_NAME = "trustgate";
export const BASE = "http://localhost:8080";

// Page scripts touch the DOM when they load, so give them a stand-in first.
// It knows the ids in index.html, so a mistyped id fails instead of passing silently.
// It cannot search the page: give each selector the page searches, such as
// 'input[type="date"]', with document.provide(selector, elements).
globalThis.document = StubDocument.fromHtml(
  await readFile(new URL("../index.html", import.meta.url), "utf8"),
  `${BASE}/`,
);
// Node has no Option, which pages use to build select options.
globalThis.Option = StubOption;

// Dynamic imports: the page scripts touch `document` when they load, so they must
// load after the stand-in above. A static import would run first and fail.
export const { registerActions } = await import("../site-actions.js");
// site.js boots the runtime only in a browser. Here it gives the dialog's words.
export const { AssistantMount } = await import("../site.js");
export const { App, bindEvents } = await import("../js/app.js");

// The page initialises on DOMContentLoaded in a browser; the stand-in never fires
// it, so initialise directly, once per process.
await App.page.init(BASE);
