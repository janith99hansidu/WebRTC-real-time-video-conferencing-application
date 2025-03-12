import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:4000"); // Adjust the URL and port as needed

function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  // State for chat messages and chat input
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  // STUN server configuration for NAT traversal
  const configuration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  useEffect(() => {
    async function initMedia() {
      try {
        // Capture video and audio
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        createPeerConnection();

        // WebRTC signaling events
        socket.on("offer", handleReceiveOffer);
        socket.on("answer", handleReceiveAnswer);
        socket.on("ice-candidate", handleNewICECandidateMsg);

        // Chat message event
        socket.on("chat-message", (data) => {
          setMessages((prev) => [...prev, data]);
        });
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    }
    initMedia();

    // Cleanup on unmount
    return () => {
      socket.off("offer", handleReceiveOffer);
      socket.off("answer", handleReceiveAnswer);
      socket.off("ice-candidate", handleNewICECandidateMsg);
      socket.off("chat-message");
    };
  }, []);

  // Create the RTCPeerConnection and add local media tracks
  const createPeerConnection = () => {
    peerConnectionRef.current = new RTCPeerConnection(configuration);
    localStreamRef.current.getTracks().forEach((track) => {
      peerConnectionRef.current.addTrack(track, localStreamRef.current);
    });

    // When a remote track is received, display it in the remote video element
    peerConnectionRef.current.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Send ICE candidates to the other peer via the signaling server
    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate);
      }
    };
  };

  // Initiate a call by creating an offer
  const callUser = async () => {
    try {
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      socket.emit("offer", offer);
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  };

  // Handle receiving an offer from the remote peer
  const handleReceiveOffer = async (offer) => {
    if (!peerConnectionRef.current) {
      createPeerConnection();
    }
    try {
      await peerConnectionRef.current.setRemoteDescription(offer);
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.emit("answer", answer);
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  };

  // Handle receiving an answer from the remote peer
  const handleReceiveAnswer = async (answer) => {
    try {
      await peerConnectionRef.current.setRemoteDescription(answer);
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  };

  // Handle incoming ICE candidate messages
  const handleNewICECandidateMsg = async (candidate) => {
    try {
      await peerConnectionRef.current.addIceCandidate(candidate);
    } catch (error) {
      console.error("Error adding received ICE candidate:", error);
    }
  };

  // Send a chat message over Socket.io
  const sendChatMessage = () => {
    if (chatInput.trim() === "") return;
    const messageData = {
      sender: "Me",
      text: chatInput,
    };
    socket.emit("chat-message", messageData);
    setMessages((prev) => [...prev, messageData]);
    setChatInput("");
  };

  return (
    <div className="App">
      <h1>WebRTC Video Chat with React & Socket.io</h1>
      <div>
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{ width: "300px", border: "1px solid black" }}
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: "300px", border: "1px solid black", marginLeft: "10px" }}
        />
      </div>
      <button onClick={callUser} style={{ marginTop: "20px" }}>
        Call
      </button>
      <div style={{ marginTop: "20px" }}>
        <h2>Chat</h2>
        <div
          style={{
            border: "1px solid #ccc",
            padding: "10px",
            height: "200px",
            overflowY: "scroll",
          }}
        >
          {messages.map((msg, index) => (
            <div key={index}>
              <strong>{msg.sender}:</strong> {msg.text}
            </div>
          ))}
        </div>
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Type a message..."
          style={{ width: "80%", padding: "8px" }}
        />
        <button onClick={sendChatMessage} style={{ padding: "8px", marginLeft: "10px" }}>
          Send
        </button>
      </div>
    </div>
  );
}

export default App;
