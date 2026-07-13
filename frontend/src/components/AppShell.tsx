import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface AppShellProps {
  title: string;
  children: React.ReactNode;
}

export function AppShell({ title, children }: AppShellProps) {
  return (
    <>
      <Sidebar />
      <Header title={title} />
      <main className="md:ml-sidebar mt-14 p-4 sm:p-6 md:p-8 min-h-screen">
        <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">{children}</div>
      </main>
    </>
  );
}
