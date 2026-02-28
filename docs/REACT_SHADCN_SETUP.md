# React + shadcn Integration Notes (Lumit Repo)

## Current Status
This repository is currently an Electron + Node app, not a React/Tailwind/TypeScript app by default.

I added the requested UI components under:
- `components/ui`
- shared util at `lib/utils.ts`

Because the current runtime does not render React components directly, these files are integrated and ready for a React frontend workspace, but they are not mounted by the Electron renderer yet.

## Components Added
- `components/ui/floating-action-panel.tsx`
- `components/ui/floating-action-panel.demo.tsx`
- `components/ui/glitchy-404-1.tsx`
- `components/ui/glitchy-404-1.demo.tsx`
- `components/ui/file-tree.tsx`
- `components/ui/file-tree.demo.tsx`
- `components/ui/animated-state-icons.tsx`
- `components/ui/animated-state-icons.demo.tsx`
- `components/ui/tetris-loader.tsx`
- `components/ui/tetris-loader.demo.tsx`
- `lib/utils.ts`

## Why `/components/ui` Matters
Use `/components/ui` as the default folder because:
1. shadcn CLI expects and generates reusable primitives in this location by convention.
2. Keeps app-level components separate from reusable UI building blocks.
3. Simplifies imports (`@/components/ui/...`) and avoids mixing feature code with base UI primitives.
4. Makes future design-system refactors safer and more consistent.

## Default Style Path
For a Next.js + Tailwind + shadcn app, default style file is one of:
- `app/globals.css`
- `src/app/globals.css`

This is where Tailwind directives and theme tokens are typically defined.

## Dependencies Installed
Runtime:
- `react`
- `react-dom`
- `framer-motion`
- `lucide-react`
- `next-themes`
- `clsx`
- `tailwind-merge`

Dev:
- `typescript`
- `@types/react`
- `@types/react-dom`
- `tailwindcss`
- `postcss`
- `autoprefixer`

## If You Want Full shadcn/Tailwind/TS Runtime
Recommended: create a dedicated web app in this repo.

1. Create Next.js app:
```bash
npx create-next-app@latest apps/web --ts --tailwind --app --src-dir --import-alias "@/*"
```

2. Init shadcn inside `apps/web`:
```bash
cd apps/web
npx shadcn@latest init
```

3. Ensure component path:
- set to `components/ui`

4. Copy these files into `apps/web/components/ui` and `apps/web/lib/utils.ts`.

5. Add provider for `next-themes` (needed by `glitchy-404-1.demo.tsx` if using theme-aware color):
- wrap app with `ThemeProvider` in `app/layout.tsx`.

## Notes Per Component
1. `floating-action-panel`
- Props/state handled internally via context.
- Expects trigger-based opening and optional note submit callback.

2. `glitchy-404-1`
- Uses canvas + SVG rendering for fuzzy effect.
- Demo uses `next-themes` to choose text color by theme.

3. `file-tree`
- Controlled by `data` prop (`FileNode[]`).
- No external assets required.

4. `animated-state-icons`
- Pure framer-motion icon animation set.
- No extra provider required.

5. `tetris-loader`
- Internal loop animation using `requestAnimationFrame`.
- Configurable size/speed/loading text.

## Responsive Behavior
- All components use flexible sizing and should work across desktop/mobile.
- `file-tree` and demos should be placed in constrained containers on small screens.

## Best Placement in Lumit
For current Electron app (non-React), equivalent features already exist in `apps/electron/renderer`.
If moving to React UI, mount these in:
- main chat view (`floating-action-panel`, `tetris-loader`)
- files view (`file-tree`)
- settings/feedback or loading states (`animated-state-icons`)
- not-found route (`glitchy-404-1`)
