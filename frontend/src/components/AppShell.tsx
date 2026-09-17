import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface AppShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function AppShell({ title, description, children }: AppShellProps) {
  return (
    <>
      <Sidebar />
      <Header title={title} />
      <main className="md:ml-sidebar pt-14 md:pt-16 min-h-dvh">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-8 md:py-10 animate-fade-up">
          <div className="mb-8">
            <h1 className="font-sans text-2xl md:text-3xl text-text-primary">{title}</h1>
            {description && (
              <p className="text-sm text-text-secondary mt-1.5 max-w-2xl">{description}</p>
            )}
          </div>
          <div className="space-y-6">{children}</div>
        </div>
      </main>
    </>
  );
}
