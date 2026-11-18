import * as React from "react"
import { Camera, Fingerprint } from "lucide-react"
import { Badge } from "@/components/ui/badge"

// Live status of the desk's hardware, shown on the Verification Desk:
//  - Camera: connected when the browser sees a video input; active once camera access is allowed.
//  - Biometric machine: a USB device the operator has connected through the browser's device
//    picker (WebUSB). It reads "Connected / Active" while that device is plugged in and flips to
//    "Not connected" the moment it is unplugged.

type CameraState = "checking" | "none" | "blocked" | "ready"

// WebUSB is not in the default TypeScript DOM typings, so describe the little we use.
interface UsbDeviceLike { productName?: string; manufacturerName?: string }
interface UsbLike {
  getDevices(): Promise<UsbDeviceLike[]>
  requestDevice(options: { filters: unknown[] }): Promise<UsbDeviceLike>
  addEventListener(type: string, cb: () => void): void
  removeEventListener(type: string, cb: () => void): void
}

function getUsb(): UsbLike | null {
  return (navigator as unknown as { usb?: UsbLike }).usb ?? null
}

export function DeviceStatus() {
  const [camera, setCamera] = React.useState<CameraState>("checking")
  const [usbDevices, setUsbDevices] = React.useState<UsbDeviceLike[]>([])
  const usb = getUsb()

  const checkCamera = React.useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      if (!devices.some((d) => d.kind === "videoinput")) return setCamera("none")
      setCamera("ready")
    } catch {
      setCamera("none")
    }
  }, [])

  React.useEffect(() => {
    checkCamera()
    const md = navigator.mediaDevices
    md?.addEventListener?.("devicechange", checkCamera)
    const timer = setInterval(checkCamera, 5000)
    return () => {
      md?.removeEventListener?.("devicechange", checkCamera)
      clearInterval(timer)
    }
  }, [checkCamera])

  const refreshUsb = React.useCallback(async () => {
    if (!usb) return
    try { setUsbDevices(await usb.getDevices()) } catch { setUsbDevices([]) }
  }, [usb])

  React.useEffect(() => {
    if (!usb) return
    refreshUsb()
    usb.addEventListener("connect", refreshUsb)
    usb.addEventListener("disconnect", refreshUsb)
    return () => {
      usb.removeEventListener("connect", refreshUsb)
      usb.removeEventListener("disconnect", refreshUsb)
    }
  }, [usb, refreshUsb])

  const biometric = usbDevices[0]

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="flex items-center gap-1.5 rounded-md border px-2 py-1">
        <Camera className="size-3.5" /> Camera:
        {camera === "ready" && <Badge variant="success">Connected</Badge>}
        {camera === "none" && <Badge variant="destructive">Not connected</Badge>}
        {camera === "checking" && <Badge variant="outline">Checking…</Badge>}
      </span>
      <span className="flex items-center gap-1.5 rounded-md border px-2 py-1">
        <Fingerprint className="size-3.5" /> Biometric:
        {!usb && <Badge variant="outline">Not supported in this browser</Badge>}
        {usb && biometric && (
          <Badge variant="success" title={[biometric.manufacturerName, biometric.productName].filter(Boolean).join(" ")}>
            Connected{biometric.productName ? ` (${biometric.productName})` : ""}
          </Badge>
        )}
        {usb && !biometric && <Badge variant="destructive">Not connected</Badge>}
      </span>
    </div>
  )
}
