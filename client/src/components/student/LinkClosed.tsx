import * as React from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Info } from "lucide-react"
import { api } from "@/api/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface LinkStatus {
  registrationEnabled: boolean
  resultEnabled: boolean
  registrationMessage: string
  resultMessage: string
}

// Reads Settings > Public Links. `null` while loading; the page decides what to show once known.
export function usePublicLinkStatus(): LinkStatus | null {
  const [status, setStatus] = React.useState<LinkStatus | null>(null)
  React.useEffect(() => {
    api.get("/public/link-status").then((r) => setStatus(r.data.data)).catch(() => {
      setStatus({ registrationEnabled: true, resultEnabled: true, registrationMessage: "", resultMessage: "" })
    })
  }, [])
  return status
}

// Shown instead of the page when the admin has switched that link off.
export function LinkClosed({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <Info className="mx-auto size-10 text-primary" />
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-muted-foreground">{message}</p>
          <Link to="/" className="flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="size-4" /> Back to Home</Link>
        </CardContent>
      </Card>
    </div>
  )
}
