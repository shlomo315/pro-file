import { useRef, useState } from "react";

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [message, setMessage] = useState("לחץ Start Camera");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setMessage("המצלמה פועלת ✅");
    } catch (error) {
      console.error(error);
      setMessage("לא הצלחתי לפתוח מצלמה");
    }
  };

  const takePhoto = () => {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        setMessage("אין מצלמה פעילה");
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setMessage("לא הצלחתי לצלם");
        return;
      }

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL("image/png");
      setCapturedImage(imageData);
      setMessage("התמונה צולמה ✅");
    } catch (error) {
      console.error(error);
      setMessage("לא הצלחתי לצלם תמונה");
    }
  };

  const downloadPhoto = () => {
    if (!capturedImage) {
      setMessage("אין תמונה להורדה");
      return;
    }

    const link = document.createElement("a");
    link.href = capturedImage;
    link.download = "best-angle-photo.png";
    link.click();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f3f4f6",
        fontFamily: "Arial, sans-serif",
        padding: 20,
      }}
    >
      <div
        style={{
          width: 360,
          background: "white",
          borderRadius: 24,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <h1>Best Angle App</h1>

        <div
          style={{
            width: "100%",
            aspectRatio: "3 / 4",
            overflow: "hidden",
            borderRadius: 18,
            background: "#dbe3ef",
            marginBottom: 12,
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)",
            }}
          />
        </div>

        <p style={{ minHeight: 24 }}>{message}</p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={startCamera}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "white",
              cursor: "pointer",
            }}
          >
            Start Camera
          </button>

          <button
            onClick={takePhoto}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#111827",
              color: "white",
              cursor: "pointer",
            }}
          >
            Take Photo
          </button>

          <button
            onClick={downloadPhoto}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "none",
              background: "#16a34a",
              color: "white",
              cursor: "pointer",
            }}
          >
            Download Photo
          </button>
        </div>

        <canvas ref={canvasRef} style={{ display: "none" }} />

        {capturedImage && (
          <div style={{ marginTop: 16 }}>
            <h3>Captured Image</h3>
            <img
              src={capturedImage}
              alt="Captured"
              style={{ width: "100%", borderRadius: 16 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}