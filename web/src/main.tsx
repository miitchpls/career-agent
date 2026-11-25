import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { NuqsAdapter } from "nuqs/adapters/react-router/v7"
import { BrowserRouter } from "react-router"

import App from "@/App"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { profileStore } from "@/lib/profile"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

// The header and the job sheet need the profile too, not only its page.
void profileStore.load()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <BrowserRouter>
      <NuqsAdapter>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={300}>
            <App />
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </QueryClientProvider>
      </NuqsAdapter>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
