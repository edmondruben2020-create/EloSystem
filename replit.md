# Chess Elo Rating System — de Saint-Louis de Gonzague

## Overview

This is a Chess Elo Rating System supporting **4 independent championships (tournaments)**. Each championship has its own players, matches, and leaderboard. The application allows users to add/edit/delete players, record match results, delete matches with Elo restoration, and reset entire tournaments. Elo ratings are automatically updated using the FIDE algorithm.

**Key features:**
- 4 independent championships with editable names
- Players scoped per championship
- Match deletion with automatic Elo revert
- Tournament reset (Elo + matches reset, players kept)
- Player rename (updates everywhere)
- Delete player with confirmation
- K-factor: K=40 for <30 games, K=10 for Elo≥2400 with ≥30 games, K=20 otherwise

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
**Framework**: React with TypeScript, using Vite as the build tool and bundler.

**Routing**: Uses Wouter for client-side routing - a lightweight alternative to React Router.

**State Management**: TanStack Query (React Query) for server state management with optimistic updates and automatic cache invalidation. Query client configured with infinite stale time and disabled automatic refetching for a more controlled data flow.

**UI Component Library**: shadcn/ui (New York style variant) built on Radix UI primitives with Tailwind CSS for styling. Utilizes extensive component library including dialogs, tables, tabs, forms, badges, and toast notifications.

**Design System**: Hybrid approach combining Material Design principles with chess-inspired aesthetics. Uses Inter font for data presentation and Playfair Display for headings. Implements consistent spacing units (Tailwind's 2, 4, 6, 8, 12, 16) and a neutral color scheme with CSS custom properties for theme variables.

**Theme Support**: Dark mode implementation with localStorage persistence and system preference detection, toggled via a custom ThemeToggle component.

### Backend Architecture
**Runtime**: Node.js with Express.js framework.

**Language**: TypeScript with ES modules (type: "module" in package.json).

**Development Server**: Custom Vite integration for HMR (Hot Module Replacement) in development mode, with middleware mode enabled for seamless dev experience.

**API Design**: RESTful API with the following endpoints:
- `GET /api/players` - Retrieve all players sorted by Elo rating
- `POST /api/players` - Create new player with optional initial Elo (defaults to 1200)
- `GET /api/matches` - Retrieve all match history
- `POST /api/matches` - Record new match with automatic Elo calculations

**Data Validation**: Zod schemas generated from Drizzle ORM table definitions (drizzle-zod) for type-safe validation of incoming requests.

**Storage Architecture**: Abstract storage interface (IStorage) with PostgreSQL implementation (DatabaseStorage) using Drizzle ORM. Data is fully persistent — never lost on server restart. Championships are seeded once at startup if the database is empty.

**Elo Calculation Logic**: Server-side implementation of FIDE Elo algorithm including:
- K-factor determination based on games played and rating level
- Expected score calculation using logistic curve (1 / (1 + 10^((Rb - Ra)/400)))
- Automatic rating updates for both players after each match

### Data Storage

**ORM**: Drizzle ORM configured for PostgreSQL with Neon serverless driver (@neondatabase/serverless).

**Schema Design**:
- `players` table: Stores player ID (UUID), name, current Elo rating (default 1200), and games played counter
- `matches` table: Comprehensive match records including both player IDs, result (white/draw/black), before/after Elo ratings for both players, rating deltas, and timestamp

**Migration Strategy**: Drizzle Kit for schema migrations with migrations output to `./migrations` directory.

**Database Configuration**: Connection string via `DATABASE_URL` environment variable, throws error if not provisioned.

### External Dependencies

**UI Framework**:
- Radix UI component primitives (accordion, alert-dialog, avatar, checkbox, dialog, dropdown-menu, hover-card, label, navigation-menu, popover, progress, radio-group, scroll-area, select, separator, slider, switch, tabs, toast, toggle, tooltip)
- TanStack React Query v5 for data fetching and caching
- shadcn/ui component system with class-variance-authority for variant management

**Form Handling**:
- React Hook Form with @hookform/resolvers for form state management
- Zod for schema validation

**Styling**:
- Tailwind CSS with PostCSS and Autoprefixer
- clsx and tailwind-merge (via cn utility) for conditional class name handling
- Custom CSS variables for theming (light/dark mode support)

**Database & ORM**:
- PostgreSQL (primary database, likely Neon serverless)
- Drizzle ORM v0.39.1 for type-safe database queries
- @neondatabase/serverless for serverless PostgreSQL connection
- drizzle-zod for automatic Zod schema generation from Drizzle tables

**Development Tools**:
- Vite with @vitejs/plugin-react for fast development
- TypeScript with strict mode enabled
- ESBuild for production server bundling
- Replit-specific plugins (runtime error modal, cartographer, dev banner) for enhanced development experience

**Utilities**:
- date-fns v3.6.0 for date formatting and manipulation
- Lucide React for iconography
- nanoid for unique ID generation
- Wouter for lightweight routing

**Session Management**:
- connect-pg-simple for PostgreSQL-backed Express sessions (configured but not actively used in current implementation)

**Carousel/Interactive Components**:
- embla-carousel-react for carousel functionality
- cmdk for command palette interface
- input-otp for OTP input components
- react-day-picker for date selection
- react-resizable-panels for resizable layouts
- vaul for drawer components

**French Localization**: UI text is in French ("Ajouter un Joueur", "Parties", etc.) indicating target audience is French-speaking users.