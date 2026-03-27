import { useRef, useState } from "react";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);

  const startCamera = async () => {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
    });
    videoRef.current.srcObject = mediaStream;
    setStream(mediaStream);
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    const image = canvas.toDataURL("image/png");
    console.log(image);
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h1>Best Angle App</h1>

      <video ref={videoRef} autoPlay style={{ width: "300px" }} />

      <br />

      <button onClick={startCamera}>Start Camera</button>
      <button onClick={takePhoto}>Take Photo</button>

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}