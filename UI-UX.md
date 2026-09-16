# Workspace UI audit and implementation contract

## Information audit

| Current content | Frequency / role | Destination |
| --- | --- | --- |
| Prompt, ordered references, model, resolution, aspect, count, Generate | Primary creation flow | Left generation panel |
| Active and waiting jobs, preparation, cancellation | Task feedback / control | Queue below generation form |
| Generated images, import, pan/select/zoom/fit | Primary workspace | Main canvas |
| Download, Drive upload, edit, reference, parameter reuse, restore, remove | Contextual actions | Hover/selection actions and context menu |
| API Key | Per-session connection setup | Settings / Connections; header shortcut |
| OAuth Client ID, Drive connection/test/setup, API address | Low-frequency configuration | Settings / Connections |
| Local folder, storage capacity, retention explanation | Low-frequency storage | Settings / Storage |
| Export layout, reload, keyboard guide | Recovery / help | Settings / Workspace |
| Archive and task history | Retrieval | Header history action, dialog |
| Diagnostics, raw IDs and setup instructions | Troubleshooting / metadata | Collapsed details in settings/history |
| Promotional heading, duplicate storage explanations, always-visible action bars | Redundant | Removed from main view |

## Visual contract

Zinc surfaces, blue accent. Functional status colors only for success/error/warning. Central CSS tokens: 4/8/12/16/24/32 spacing, 8px controls and containers, 16/20px Lucide icons, 12px metadata, 14px labels, 16px body, 20px titles. Geist Sans with Chinese system fallback; Geist Mono for technical metadata. No decorative images, gradients, glow, blur, or nested cards. Main canvas carries the image content. Controls appear on hover, keyboard focus or selection, and stay available on touch.

## Compatibility boundary

Preserve Worker/API, Drive authorization/upload/description/hash verification, task queue engine, reference preparation, local storage, database migrations, generation request structure and session-only keys. Native DOM form IDs and existing native dialog interfaces remain stable. Reuse browser dialog semantics for focus trapping and Escape; Radix DropdownMenu supplies the new contextual overflow menu. Lucide supplies all interface icons. Queue rows only reflect the existing task queue; never create new requests or retry implicitly.

## Design references

- https://ui.shadcn.com/docs/components
- https://www.radix-ui.com/primitives/docs/overview/accessibility
- https://vercel.com/geist/introduction
- https://ant.design/docs/spec/layout/

## Verification

- Full frontend DOM smoke (Happy DOM, local code and mocked requests only): all original DOM bindings, unique IDs, settings tabs/keyboard navigation, panel collapse, native original viewer on double click, image actions, parameter reuse, Radix overflow keyboard opening, session key omitted from non-generation requests, three concurrent jobs plus additional queued batch, cancellation preserving active jobs.
- Existing queue and Drive regression suites passed; Drive prompt descriptions and verification unchanged.
- Existing Worker/D1/R2 integration suite passed with simulated upstream, including three-request concurrency limit. No real provider billing or Google uploads.
- Production bundle builds and validates as Worker ESM. Fonts embedded with their OFL license notices and no external font requests.
- Browser screenshot/layout QA unavailable for this custom buildless-preview-incompatible Worker project in the managed environment. DOM checks are not pixel rendering or cross-browser verification.

## Editor precision update

Replaced the native color input popup with a themed Radix Popover containing react-colorful, valid six-digit HEX editing and browser-supported screen eyedropper. The existing hidden `edit-color` value remains the editor's color source. The popover portal stays inside the native editor dialog. Line width and font size labels support captured horizontal pointer scrubbing (4px per step), Shift ×10, Alt ×0.1, Escape to restore, existing min/max bounds, keyboard arrows/Home/End, and direct numeric entry. Pointer cancellation restores the previous value; blur/dialog close releases the gesture. Extended the frontend DOM suite to verify color-to-editor updates, popover placement, scrub direction/modifiers/bounds/cancel and cleanup. No generation, Drive, storage, or queue logic changed.
