# @workspace/casino-mobile

Expo + React Native app for Charter & Oak Casino.

## Stack

- **Expo SDK 57** with Expo Router (file-based navigation)
- **React Native 0.86** (New Architecture enabled)
- **React 19** with React Query (shared generated hooks)
- **TypeScript** (strict mode, extends `expo/tsconfig.base`)
- Reuses `@workspace/api-client-react` and `@workspace/api-zod` from the monorepo

## Getting Started

```bash
# Install dependencies from monorepo root
pnpm install

# Start the Expo dev server
pnpm --filter @workspace/casino-mobile dev

# Run on iOS simulator
pnpm --filter @workspace/casino-mobile ios

# Run on Android emulator
pnpm --filter @workspace/casino-mobile android

# Run on web
pnpm --filter @workspace/casino-mobile web
```

## Environment

Copy `.env.example` to `.env` and set the API server URL:

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

For Android emulator, use `http://10.0.2.2:3000` to reach localhost on the host machine.

## Architecture

### API Integration

The mobile app reuses the same generated React Query hooks and Zod validators as the web app:

- `@workspace/api-client-react` — Orval-generated hooks (`useListGames`, `useGetWallet`, etc.)
- `@workspace/api-zod` — Generated Zod schemas for type validation

On startup, `src/lib/api-init.ts` wires:

- `setBaseUrl(API_BASE_URL)` — routes all relative API calls to the backend
- `setAuthTokenGetter(getToken)` — attaches a bearer token from `expo-secure-store`

### Auth Flow

The mobile app uses token-based auth (not session cookies like the web app):

1. The Login screen opens the API server's OAuth endpoint in a browser
2. The server redirects back with an authorization code
3. The app calls `useExchangeMobileAuthorizationCode` to exchange the code for a token
4. The token is stored in iOS Keychain / Android encrypted storage via `expo-secure-store`
5. All subsequent API calls automatically include the `Authorization: Bearer` header

### Navigation

Expo Router file-based routing under `app/`:

```
app/
├── _layout.tsx          # Root layout (SafeArea, providers, Stack nav)
├── (tabs)/
│   ├── _layout.tsx       # Tab navigation config
│   ├── index.tsx         # Home — featured games + winners
│   ├── games.tsx         # Games catalog with category filters
│   ├── promotions.tsx    # Active promotions list
│   └── dashboard.tsx     # Wallet balance + recent transactions
├── game/[id].tsx         # Game detail (full-screen modal)
├── promotion/[id].tsx    # Promotion detail
├── cashier.tsx           # Deposit / withdraw
└── login.tsx             # OAuth login
```

### Shared Code

| Web (casino-astro)            | Mobile (casino-mobile)        | Notes                                |
| ----------------------------- | ----------------------------- | ------------------------------------ |
| `src/lib/config.ts`           | `src/lib/config.ts`           | Same constants, different env access |
| `@workspace/api-client-react` | `@workspace/api-client-react` | Identical generated hooks            |
| `@workspace/api-zod`          | `@workspace/api-zod`          | Identical validators                 |
| Session cookies               | `expo-secure-store` tokens    | Different auth transport             |
| `import.meta.env`             | `process.env.EXPO_PUBLIC_*`   | Different env access                 |

## Build

```bash
# Production web export
pnpm --filter @workspace/casino-mobile build

# EAS Build (requires Expo account + eas-cli)
eas build --platform ios
eas build --platform android
```

## Type Checking

```bash
pnpm --filter @workspace/casino-mobile typecheck
```
