import * as React from "react"
import { Camera, RefreshCw, Usb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

// Live photo capture for the Verification Desk. Opens the camera, shows which camera is active
// (and whether it looks like a USB camera), lets the staff capture/retake, then hands back a JPEG.
export function CameraCapture({
  open, title, busy, onCancel, onCaptured, onSkip,
}: {
  open: boolean
  title: string
  busy?: boolean
  onCancel: () => void
  onCaptured: (blob: Blob) => void
  // Offered only when the camera cannot be opened, so a broken camera never blocks the desk.
  onSkip?: () => void
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const [cameraLabel, setCameraLabel] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [snapshot, setSnapshot] = React.useState<{ blob: Blob; url: string } | null>(null)

  const stopStream = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const startCamera = React.useCallback(async () => {
    setError(null)
    setCameraLabel(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot access a camera.")
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      streamRef.current = stream
      setCameraLabel(stream.getVideoTracks()[0]?.label || "Camera")
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Camera could not be opened.")
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    setSnapshot(null)
    startCamera()
    return () => stopStream()
  }, [open, startCamera, stopStream])

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext("2d")?.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) setSnapshot({ blob, url: URL.createObjectURL(blob) })
    }, "image/jpeg", 0.9)
  }

  function retake() {
    if (snapshot) URL.revokeObjectURL(snapshot.url)
    setSnapshot(null)
  }

  const isUsb = !!cameraLabel && /usb/i.test(cameraLabel)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Capture the candidate's live photo to Allow them.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {error ? (
            <Badge variant="destructive">Camera not active</Badge>
          ) : cameraLabel ? (
            <>
              <Badge variant="success">Camera active</Badge>
              <Badge variant={isUsb ? "success" : "outline"}>
                <Usb className="mr-1 size-3" /> {isUsb ? "USB camera" : "Not a USB camera"}
              </Badge>
              <span className="truncate text-muted-foreground">{cameraLabel}</span>
            </>
          ) : (
            <Badge variant="outline">Opening camera…</Badge>
          )}
        </div>

        <div className="aspect-[4/3] overflow-hidden rounded-lg border bg-black">
          {snapshot ? (
            <img src={snapshot.url} alt="Captured" className="size-full object-cover" />
          ) : (
            <video ref={videoRef} className="size-full object-cover" muted playsInline />
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <div className="flex gap-2">
            {error && <Button variant="outline" onClick={startCamera}><RefreshCw /> Retry camera</Button>}
            {error && onSkip && <Button variant="secondary" onClick={onSkip} disabled={busy}>{busy ? "Allowing…" : "Allow without photo"}</Button>}
            {snapshot ? (
              <>
                <Button variant="outline" onClick={retake} disabled={busy}>Retake</Button>
                <Button onClick={() => onCaptured(snapshot.blob)} disabled={busy}>{busy ? "Allowing…" : "Use photo & Allow"}</Button>
              </>
            ) : (
              <Button onClick={capture} disabled={!!error || !cameraLabel}><Camera /> Capture</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
