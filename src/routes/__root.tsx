import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "JoiaBot — Painel" },
      { name: "description", content: "Painel de gestão para sua loja de semi joias com agente conversacional inteligente." },
      { property: "og:title", content: "JoiaBot — Painel" },
      { name: "twitter:title", content: "JoiaBot — Painel" },
      { property: "og:description", content: "Painel de gestão para sua loja de semi joias com agente conversacional inteligente." },
      { name: "twitter:description", content: "Painel de gestão para sua loja de semi joias com agente conversacional inteligente." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f645ab14-1bd2-4b04-bdb8-672390836242/id-preview-34c4106d--6be2b527-c471-46c2-89cc-0e7edb1b07a7.lovable.app-1778702251134.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f645ab14-1bd2-4b04-bdb8-672390836242/id-preview-34c4106d--6be2b527-c471-46c2-89cc-0e7edb1b07a7.lovable.app-1778702251134.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorBoundary,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Página não encontrada</h1>
        <Link to="/" className="mt-6 inline-block text-sm text-brand hover:underline">Voltar ao início</Link>
      </div>
    </div>
  );
}

function ErrorBoundary({ error }: { error: Error }) {
  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <a href="/" className="mt-6 inline-block text-sm text-brand hover:underline">Voltar ao início</a>
      </div>
    </div>
  );
}
